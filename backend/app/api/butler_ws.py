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
    {"type": "modify_update",  "job": {...}}
    {"type": "modify_done",    "job": {...}}

The butler AI may embed an ```action``` block in its response.  When detected the
server automatically creates a SelfModifyJob (planning phase) and streams status
updates back to the client.  The client confirms or cancels via the existing
REST endpoints  POST /self/modify/{id}/confirm  |  /cancel .
"""

import asyncio
import json
import os
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError

from app.abilities.butler_handler import ButlerHandler
from app.api.self_modify import _bg_plan
from app.auth.jwt import decode_token
from app.database import AsyncSessionLocal
from app.models.app_setting import get_effective_setting
from app.models.self_modify_job import SelfModifyJob

router = APIRouter()

_TERMINAL = frozenset({"done", "failed", "cancelled"})


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
        raw = json.loads(job.plan_json)
        plan = {
            "commit_message": raw.get("commit_message", ""),
            "changes": [
                {"path": c["path"], "action": c["action"]}
                for c in raw.get("changes", [])
            ],
        }
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
        "created_at": job.created_at.isoformat(),
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }


# ── Polling helper ────────────────────────────────────────────────────────────


async def _poll_job_updates(websocket: WebSocket, job_id: uuid.UUID) -> None:
    """Stream modify job status updates until the job reaches a terminal state."""
    while True:
        await asyncio.sleep(1.5)
        try:
            async with AsyncSessionLocal() as db:
                job = await db.get(SelfModifyJob, job_id)
                if job is None:
                    break
                event_type = "modify_done" if job.status in _TERMINAL else "modify_update"
                await websocket.send_text(
                    json.dumps({"type": event_type, "job": _job_dict(job)})
                )
                if job.status in _TERMINAL:
                    break
        except Exception:
            break


# ── Modify job creation ───────────────────────────────────────────────────────


async def _create_modify_job(
    user_id: str,
    instruction: str,
    mode: str,
    provider: str,
    model: str,
) -> tuple[uuid.UUID, dict]:
    async with AsyncSessionLocal() as db:
        job = SelfModifyJob(
            user_id=uuid.UUID(user_id),
            mode=mode if mode in ("repo", "local") else "local",
            instruction=instruction,
            provider=provider,
            model=model,
        )
        db.add(job)
        await db.commit()
        await db.refresh(job)
        job_id = job.id
        job_dict = _job_dict(job)

    # Launch background planning task (mirrors the REST endpoint behaviour)
    asyncio.create_task(_bg_plan(job_id))  # noqa: RUF006

    return job_id, job_dict


# ── WebSocket endpoint ────────────────────────────────────────────────────────


@router.websocket("/ws/butler")
async def websocket_butler(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    user_id = await _authenticate(token)

    if user_id is None:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()

    async def send(data: dict) -> None:
        await websocket.send_text(json.dumps(data))

    handler = ButlerHandler()
    poll_tasks: list[asyncio.Task] = []

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
                user_message: str = payload["content"]
            except (json.JSONDecodeError, KeyError):
                await send(
                    {"type": "error", "detail": 'Invalid payload — expected {"content": "..."}'}
                )
                continue

            # Stream the butler response and handle any modification action
            async with AsyncSessionLocal() as db:
                # Resolve butler provider/model up-front (used for modify jobs)
                butler_provider = await get_effective_setting(
                    db, "butler_provider", os.getenv("BUTLER_PROVIDER", "anthropic")
                ) or "anthropic"
                butler_model = await get_effective_setting(
                    db, "butler_model", os.getenv("BUTLER_MODEL", "claude-sonnet-4-6")
                ) or "claude-sonnet-4-6"

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
                    job_id, job_dict = await _create_modify_job(
                        user_id=user_id,
                        instruction=action.get("instruction", ""),
                        mode=action.get("mode", "local"),
                        provider=butler_provider,
                        model=butler_model,
                    )
                    await send({"type": "modify_started", "job": job_dict})
                    task = asyncio.create_task(_poll_job_updates(websocket, job_id))
                    poll_tasks.append(task)
                except Exception as exc:
                    await send({"type": "error", "detail": f"Failed to start modification: {exc}"})

    except WebSocketDisconnect:
        pass
    finally:
        for task in poll_tasks:
            task.cancel()
