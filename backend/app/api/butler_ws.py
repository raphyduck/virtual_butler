"""WebSocket endpoint for the platform-level butler chat assistant.

Endpoint: /ws/butler?token=<jwt>

Protocol (JSON over WebSocket):

Client → Server:
    {"content": "<user message>"}

Server → Client:
    {"type": "chunk",          "content": "<text fragment>"}
    {"type": "done"}
    {"type": "error",          "detail": "<error message>"}
    {"type": "modify_started", "job": {...}}
    {"type": "modify_snapshot","job": {...}}
    {"type": "modify_step",    "job_id": "<uuid>", "step": {"tool": "...", "label": "...", "status": "ok"}}
    {"type": "modify_update",  "job": {...}}
    {"type": "modify_done",    "job": {...}}

The butler AI may embed an ```action``` block in its response.  When detected the
server automatically creates a SelfModifyJob (planning phase) and streams agent
step events + status updates back to the client.  The client confirms or cancels
via the REST endpoints  POST /self/modify/{id}/confirm  |  /cancel .
"""

import asyncio
import json
import logging
import os
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy import select

from app.api.self_modify import _bg_plan, job_step_queues
from app.auth.jwt import decode_token
from app.database import AsyncSessionLocal
from app.models.app_setting import get_effective_setting
from app.models.self_modify_job import SelfModifyJob
from app.models.user import User
from app.skills.butler_handler import ButlerHandler

router = APIRouter()
logger = logging.getLogger(__name__)

_TERMINAL = frozenset({"done", "failed", "cancelled"})
# States where the watcher should stop polling (user action required)
_PAUSE = frozenset({"awaiting_merge"})

# Maximum seconds to wait for the next agent step before falling back to DB poll
_STEP_TIMEOUT = 120.0


# ── Auth helper ───────────────────────────────────────────────────────────────


async def _authenticate(token: str | None) -> str | None:
    if not token:
        return None
    try:
        return decode_token(token)
    except JWTError:
        return None


# ── Job serialisation helper ──────────────────────────────────────────────────


def _job_dict(job: SelfModifyJob) -> dict:
    plan = None
    if job.plan_json:
        try:
            raw = json.loads(job.plan_json)
            plan = {
                "commit_message": raw.get("commit_message", ""),
                "changes": [{"path": c["path"], "action": c["action"]} for c in raw.get("changes", [])],
            }
        except Exception:
            logger.exception("Invalid plan_json while serializing self-modify job", extra={"job_id": str(job.id)})
    return {
        "id": str(job.id),
        "status": job.status,
        "mode": job.mode,
        "instruction": job.instruction,
        "provider": job.provider,
        "model": job.model,
        "plan": plan,
        "error": job.error,
        "commit_sha": job.commit_sha,
        "pr_url": job.pr_url,
        "pr_number": job.pr_number,
        "created_at": job.created_at.isoformat(),
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }


# ── Job watcher ───────────────────────────────────────────────────────────────


async def _watch_job(websocket: WebSocket, job_id: uuid.UUID) -> None:
    """Stream agent steps and job status updates until the job reaches a terminal state.

    Phase 1 — drains the per-job asyncio.Queue of AgentStep objects (real-time
    streaming of the agent's tool calls).  A None sentinel from _bg_plan signals
    that planning is complete.

    Phase 2 — polls the DB and sends modify_update / modify_done events.
    Pause states emit modify_done once (so the UI can end the current run),
    then polling continues at a lower cadence until the user resumes the job.
    """
    queue = job_step_queues.get(str(job_id))

    try:
        # ── Phase 1: stream agent steps until sentinel ────────────────────────
        if queue is not None:
            while True:
                try:
                    step = await asyncio.wait_for(queue.get(), timeout=_STEP_TIMEOUT)
                except TimeoutError:
                    break  # give up waiting; planning may have stalled

                if step is None:
                    break  # sentinel: planning done (success or failure)

                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "modify_step",
                            "job_id": str(job_id),
                            "step": {
                                "tool": step.tool,
                                "label": step.label,
                                "status": step.status,
                            },
                        }
                    )
                )

        # ── Phase 2: poll status updates ───────────────────────────────────────
        last_status: str | None = None
        while True:
            await asyncio.sleep(10.0 if last_status in _PAUSE else 1.5)
            async with AsyncSessionLocal() as db:
                job = await db.get(SelfModifyJob, job_id)
                if job is None:
                    break
                status = job.status
                if status in _TERMINAL:
                    await websocket.send_text(json.dumps({"type": "modify_done", "job": _job_dict(job)}))
                    break
                if status in _PAUSE:
                    if status != last_status:
                        await websocket.send_text(json.dumps({"type": "modify_done", "job": _job_dict(job)}))
                else:
                    await websocket.send_text(json.dumps({"type": "modify_update", "job": _job_dict(job)}))
                last_status = status

    except WebSocketDisconnect:
        raise
    except Exception:
        pass
    finally:
        job_step_queues.pop(str(job_id), None)


# ── Modify job creation ───────────────────────────────────────────────────────


async def _create_modify_job(
    user_id: str,
    instruction: str,
    provider: str,
    model: str,
    conversation_id: uuid.UUID | None = None,
    github_token: str | None = None,
) -> tuple[uuid.UUID, dict]:
    async with AsyncSessionLocal() as db:
        job = SelfModifyJob(
            user_id=uuid.UUID(user_id),
            conversation_id=conversation_id,
            mode="repo",
            instruction=instruction,
            provider=provider,
            model=model,
        )
        db.add(job)
        await db.commit()
        await db.refresh(job)
        job_id = job.id
        job_dict = _job_dict(job)

    # Create step queue BEFORE launching the background task so _bg_plan can
    # find it immediately when it starts.
    queue: asyncio.Queue = asyncio.Queue()
    job_step_queues[str(job_id)] = queue

    asyncio.create_task(_bg_plan(job_id, github_token))  # noqa: RUF006

    return job_id, job_dict


# ── WebSocket endpoint ────────────────────────────────────────────────────────


@router.websocket("/ws/butler")
async def websocket_butler(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    conversation_id = websocket.query_params.get("conversation_id") or None
    user_id = await _authenticate(token)

    if user_id is None:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()

    async def send(data: dict) -> None:
        await websocket.send_text(json.dumps(data))

    handler = ButlerHandler(conversation_id=conversation_id)
    watch_tasks: list[asyncio.Task] = []

    async def _replay_steps(job: SelfModifyJob) -> None:
        if not job.steps_json:
            return
        try:
            steps = json.loads(job.steps_json)
        except Exception:
            logger.exception("Invalid steps_json while replaying self-modify job", extra={"job_id": str(job.id)})
            return

        if not isinstance(steps, list):
            logger.error(
                "Invalid steps_json payload type while replaying self-modify job",
                extra={"job_id": str(job.id), "steps_type": type(steps).__name__},
            )
            return

        for step in steps:
            if not isinstance(step, dict):
                logger.error(
                    "Ignoring invalid replay step payload",
                    extra={"job_id": str(job.id), "step_type": type(step).__name__},
                )
                continue
            await send(
                {
                    "type": "modify_step",
                    "job_id": str(job.id),
                    "step": step,
                }
            )

    # ── Resume active jobs from previous / interrupted sessions ───────────
    try:
        conv_uuid = uuid.UUID(conversation_id) if conversation_id else None

        async with AsyncSessionLocal() as db:
            # Active (non-terminal) jobs — replay only for this conversation (or global jobs)
            active_query = (
                select(SelfModifyJob)
                .where(SelfModifyJob.user_id == uuid.UUID(user_id))
                .where(SelfModifyJob.status.notin_(list(_TERMINAL)))
            )
            if conv_uuid is not None:
                active_query = active_query.where(
                    (SelfModifyJob.conversation_id == conv_uuid) | (SelfModifyJob.conversation_id.is_(None))
                )
            active_query = active_query.order_by(SelfModifyJob.created_at.asc())
            result = await db.execute(active_query)
            active_jobs = result.scalars().all()
            for job in active_jobs:
                try:
                    await send({"type": "modify_snapshot", "job": _job_dict(job)})
                    await _replay_steps(job)
                    # Start a watcher so the client is notified when the job
                    # reaches a terminal state (covers the merge+deploy phase too).
                    task = asyncio.create_task(_watch_job(websocket, job.id))
                    watch_tasks.append(task)
                except Exception:
                    logger.exception("Failed to resume active self-modify job", extra={"job_id": str(job.id)})

            # Recently-terminal jobs — replay so the job card is visible after
            # a reconnect or page reload even if the final event was missed.
            recent_cutoff = datetime.now(UTC) - timedelta(minutes=10)
            recent_query = (
                select(SelfModifyJob)
                .where(SelfModifyJob.user_id == uuid.UUID(user_id))
                .where(SelfModifyJob.status.in_(list(_TERMINAL)))
                .where(SelfModifyJob.completed_at >= recent_cutoff)
            )
            if conv_uuid is not None:
                recent_query = recent_query.where(
                    (SelfModifyJob.conversation_id == conv_uuid) | (SelfModifyJob.conversation_id.is_(None))
                )
            result2 = await db.execute(recent_query.order_by(SelfModifyJob.created_at.asc()))
            recent_jobs = result2.scalars().all()
            for job in recent_jobs:
                try:
                    await send({"type": "modify_snapshot", "job": _job_dict(job)})
                    await _replay_steps(job)
                except Exception:
                    logger.exception("Failed to replay terminal self-modify job", extra={"job_id": str(job.id)})
                finally:
                    await send({"type": "modify_done", "job": _job_dict(job)})
    except Exception:
        logger.exception("Failed to resume self-modify jobs on websocket connect", extra={"user_id": user_id})

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
                user_message: str = payload["content"]
            except (json.JSONDecodeError, KeyError):
                await send({"type": "error", "detail": 'Invalid payload — expected {"content": "..."}'})
                continue

            # Stream the butler response and handle any modification action
            async with AsyncSessionLocal() as db:
                try:
                    async for chunk in handler.run(db, user_id, user_message):
                        await send({"type": "chunk", "content": chunk})
                    await send({"type": "done"})
                except Exception as exc:
                    await send({"type": "error", "detail": f"Butler error: {exc}"})
                    continue

            # Check if the AI requested a platform modification
            action = handler.pop_pending_action()
            if action and action.get("type") == "modify":
                try:
                    # Resolve GitHub token
                    gh_token = None
                    async with AsyncSessionLocal() as udb:
                        user = await udb.get(User, uuid.UUID(user_id))
                        if user:
                            gh_token = user.github_access_token

                    conv_provider, conv_model = handler.conversation_provider_model()
                    provider = conv_provider or (
                        await get_effective_setting(db, "butler_provider", os.getenv("BUTLER_PROVIDER", "anthropic"))
                    )
                    model = conv_model or (
                        await get_effective_setting(db, "butler_model", os.getenv("BUTLER_MODEL", "claude-sonnet-4-6"))
                    )

                    job_id, job_dict = await _create_modify_job(
                        user_id=user_id,
                        instruction=action.get("instruction", ""),
                        provider=provider,
                        model=model,
                        conversation_id=handler.conversation_id(),
                        github_token=gh_token,
                    )
                    await send({"type": "modify_started", "job": job_dict})
                    task = asyncio.create_task(_watch_job(websocket, job_id))
                    watch_tasks.append(task)
                except Exception as exc:
                    await send({"type": "error", "detail": f"Failed to start modification: {exc}"})

    except WebSocketDisconnect:
        pass
    finally:
        for task in watch_tasks:
            task.cancel()
