"""Self-modification API.

Two GitHub OAuth endpoints let the user connect their account and verify
repo ownership.  The /modify endpoints drive a two-step flow:

  POST   /self/modify                → start planning job (background)
  GET    /self/modify/{id}           → poll status / read plan
  POST   /self/modify/{id}/confirm   → approve plan → start apply job (background)
  POST   /self/modify/{id}/cancel    → abort a pending/planning/planned job
"""

import asyncio
import json
import secrets
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.github import check_repo_ownership, exchange_code_for_token, get_github_user, get_oauth_url
from app.config import settings
from app.database import AsyncSessionLocal, get_db
from app.models.app_setting import get_effective_setting
from app.models.self_modify_job import SelfModifyJob
from app.models.user import User
from app.schemas.self_modify import (
    FileChangeOut,
    GithubAuthorizeResponse,
    GithubExchangeRequest,
    GithubStatusResponse,
    JobStatusResponse,
    ModifyRequest,
    PlanOut,
)

router = APIRouter(prefix="/self", tags=["self-modify"])

# ── In-memory CSRF state store (single-instance; maps state → user_id str) ───
_oauth_states: dict[str, str] = {}


# ── Helpers ───────────────────────────────────────────────────────────────────


def _job_to_schema(job: SelfModifyJob) -> JobStatusResponse:
    plan_out: PlanOut | None = None
    if job.plan_json:
        raw = json.loads(job.plan_json)
        plan_out = PlanOut(
            changes=[FileChangeOut(**c) for c in raw["changes"]],
            commit_message=raw["commit_message"],
        )
    return JobStatusResponse(
        id=job.id,
        status=job.status,
        mode=job.mode,
        instruction=job.instruction,
        provider=job.provider,
        model=job.model,
        plan=plan_out,
        error=job.error,
        commit_sha=job.commit_sha,
        created_at=job.created_at,
        completed_at=job.completed_at,
    )


# ── Background tasks ──────────────────────────────────────────────────────────


async def _bg_plan(job_id: uuid.UUID) -> None:
    """Background task: pending → planning → planned (or failed)."""
    from app.abilities.code_modifier import CodeModifier

    async with AsyncSessionLocal() as db:
        job = await db.get(SelfModifyJob, job_id)
        if job is None:
            return

        try:
            job.status = "planning"
            await db.commit()

            modifier = CodeModifier()
            plan = await modifier.plan(
                instruction=job.instruction,
                provider=job.provider,
                model=job.model,
            )

            job.plan_json = json.dumps(
                {
                    "changes": [{"path": c.path, "action": c.action, "content": c.content} for c in plan.changes],
                    "commit_message": plan.commit_message,
                }
            )
            job.status = "planned"
            await db.commit()

        except Exception as exc:
            job.status = "failed"
            job.error = str(exc)
            job.completed_at = datetime.now(UTC)
            await db.commit()


async def _bg_apply(job_id: uuid.UUID, github_token: str | None, author_email: str) -> None:
    """Background task: confirmed → applying → committing → pushing|restarting → done (or failed)."""
    from app.abilities.code_modifier import CodeModifier, FileChange, ModificationPlan

    async with AsyncSessionLocal() as db:
        job = await db.get(SelfModifyJob, job_id)
        if job is None:
            return

        try:
            # Re-load plan from DB
            if not job.plan_json:
                raise ValueError("No plan found for this job.")
            raw = json.loads(job.plan_json)
            plan = ModificationPlan(
                changes=[FileChange(**c) for c in raw["changes"]],
                commit_message=raw["commit_message"],
            )

            modifier = CodeModifier()

            # Apply changes to filesystem
            job.status = "applying"
            await db.commit()
            await asyncio.to_thread(modifier.apply, plan)

            # Commit
            job.status = "committing"
            await db.commit()
            sha = await asyncio.to_thread(modifier.git_commit, plan.commit_message, author_email)
            job.commit_sha = sha
            await db.commit()

            # Push (repo mode) or restart (local mode)
            if job.mode == "repo":
                if not github_token:
                    raise ValueError("GitHub token required for repo mode.")
                job.status = "pushing"
                await db.commit()
                repo_owner = await get_effective_setting(db, "github_repo_owner", settings.github_repo_owner)
                repo_name = await get_effective_setting(db, "github_repo_name", settings.github_repo_name)
                await asyncio.to_thread(
                    modifier.git_push_github,
                    github_token,
                    repo_owner,
                    repo_name,
                )
            else:  # local
                job.status = "restarting"
                await db.commit()
                await asyncio.to_thread(modifier.restart_local)

            job.status = "done"
            job.completed_at = datetime.now(UTC)
            await db.commit()

        except Exception as exc:
            job.status = "failed"
            job.error = str(exc)
            job.completed_at = datetime.now(UTC)
            await db.commit()


# ── GitHub OAuth ──────────────────────────────────────────────────────────────


@router.get("/github/authorize", response_model=GithubAuthorizeResponse)
async def github_authorize(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GithubAuthorizeResponse:
    client_id = await get_effective_setting(db, "github_client_id", settings.github_client_id)
    if not client_id:
        raise HTTPException(status_code=501, detail="GitHub OAuth is not configured on this instance.")
    callback_url = await get_effective_setting(db, "github_callback_url", settings.github_callback_url)
    state = secrets.token_urlsafe(20)
    _oauth_states[state] = str(current_user.id)
    return GithubAuthorizeResponse(url=get_oauth_url(state, client_id, callback_url), state=state)


@router.post("/github/exchange", response_model=GithubStatusResponse)
async def github_exchange(
    body: GithubExchangeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GithubStatusResponse:
    expected_user_id = _oauth_states.pop(body.state, None)
    if expected_user_id != str(current_user.id):
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state.")

    client_id = await get_effective_setting(db, "github_client_id", settings.github_client_id)
    client_secret = await get_effective_setting(db, "github_client_secret", settings.github_client_secret)
    token = await exchange_code_for_token(body.code, client_id, client_secret)
    gh_user = await get_github_user(token)
    login: str = gh_user["login"]
    repo_owner = await get_effective_setting(db, "github_repo_owner", settings.github_repo_owner)
    repo_name = await get_effective_setting(db, "github_repo_name", settings.github_repo_name)
    is_owner = await check_repo_ownership(token, repo_owner, repo_name)

    current_user.github_login = login
    current_user.github_access_token = token
    current_user.github_is_repo_owner = is_owner
    await db.commit()

    return GithubStatusResponse(connected=True, login=login, is_repo_owner=is_owner)


@router.get("/github/status", response_model=GithubStatusResponse)
async def github_status(current_user: User = Depends(get_current_user)) -> GithubStatusResponse:
    return GithubStatusResponse(
        connected=current_user.github_access_token is not None,
        login=current_user.github_login,
        is_repo_owner=current_user.github_is_repo_owner,
    )


@router.delete("/github/disconnect")
async def github_disconnect(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    current_user.github_login = None
    current_user.github_access_token = None
    current_user.github_is_repo_owner = False
    await db.commit()
    return {"detail": "GitHub account disconnected."}


# ── Self-modification ─────────────────────────────────────────────────────────


@router.post("/modify", response_model=JobStatusResponse, status_code=202)
async def start_modify(
    body: ModifyRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JobStatusResponse:
    if body.mode == "repo" and not current_user.github_is_repo_owner:
        raise HTTPException(
            status_code=403,
            detail="You must authenticate as the repository owner on GitHub to use repo mode.",
        )
    if body.mode not in ("repo", "local"):
        raise HTTPException(status_code=422, detail="mode must be 'repo' or 'local'.")

    job = SelfModifyJob(
        user_id=current_user.id,
        mode=body.mode,
        instruction=body.instruction,
        provider=body.provider,
        model=body.model,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    background_tasks.add_task(_bg_plan, job.id)
    return _job_to_schema(job)


@router.get("/modify/{job_id}", response_model=JobStatusResponse)
async def get_modify_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JobStatusResponse:
    job = await db.get(SelfModifyJob, job_id)
    if job is None or job.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Job not found.")
    return _job_to_schema(job)


@router.post("/modify/{job_id}/confirm", response_model=JobStatusResponse)
async def confirm_modify_job(
    job_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JobStatusResponse:
    job = await db.get(SelfModifyJob, job_id)
    if job is None or job.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job.status != "planned":
        raise HTTPException(status_code=409, detail=f"Job status is '{job.status}', expected 'planned'.")

    job.status = "confirmed"
    await db.commit()
    await db.refresh(job)

    background_tasks.add_task(_bg_apply, job.id, current_user.github_access_token, current_user.email)
    return _job_to_schema(job)


@router.post("/modify/{job_id}/cancel", response_model=JobStatusResponse)
async def cancel_modify_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JobStatusResponse:
    job = await db.get(SelfModifyJob, job_id)
    if job is None or job.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job.status not in ("pending", "planning", "planned"):
        raise HTTPException(status_code=409, detail=f"Cannot cancel job in status '{job.status}'.")

    job.status = "cancelled"
    job.completed_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(job)
    return _job_to_schema(job)
