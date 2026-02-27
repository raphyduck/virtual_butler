"""Docker-based update API.

Endpoints for checking the current app version, applying updates (pulling new
Docker images), and rolling back to the previous version.

All endpoints are admin-only (require authenticated user).

The server is assumed to be deployed via docker-compose with image tags
controlled by the APP_VERSION variable in the compose project's .env file.
"""

import os
import subprocess
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/update", tags=["update"])

# Path to the compose .env (production) — configurable via env var
_COMPOSE_DIR = Path(os.getenv("COMPOSE_PROJECT_DIR", "/deploy"))
_COMPOSE_ENV = _COMPOSE_DIR / ".env"
_VERSION_FILE = Path(os.getenv("VERSION_FILE", "/app/VERSION"))

# Allowed commands — never allow arbitrary shell execution
_ALLOWED_COMPOSE_COMMANDS = frozenset({"pull", "up"})


# ── Schemas ──────────────────────────────────────────────────────────────────


class UpdateStatus(BaseModel):
    current_version: str
    previous_version: str | None
    build_date: str | None
    available: bool


class UpdateApplyRequest(BaseModel):
    target_version: str


class UpdateApplyResponse(BaseModel):
    status: str
    previous_version: str
    new_version: str
    message: str


class UpdateRollbackResponse(BaseModel):
    status: str
    rolled_back_from: str
    rolled_back_to: str
    message: str


# ── Helpers ──────────────────────────────────────────────────────────────────


def _read_current_version() -> str:
    """Read current app version. Checks VERSION file first, then env var."""
    if _VERSION_FILE.exists():
        return _VERSION_FILE.read_text().strip()
    return os.getenv("APP_VERSION", "dev")


def _read_compose_env() -> dict[str, str]:
    """Parse the compose .env file into a dict."""
    env: dict[str, str] = {}
    if _COMPOSE_ENV.exists():
        for line in _COMPOSE_ENV.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def _write_compose_env(env: dict[str, str]) -> None:
    """Write the compose .env file from a dict."""
    lines = [f"{k}={v}" for k, v in sorted(env.items())]
    _COMPOSE_ENV.write_text("\n".join(lines) + "\n")


def _run_compose(command: str, compose_dir: Path | None = None) -> str:
    """Run a restricted docker compose command. Only 'pull' and 'up' are allowed."""
    if command not in _ALLOWED_COMPOSE_COMMANDS:
        raise ValueError(f"Command '{command}' is not allowed")

    args = ["docker", "compose"]
    if command == "up":
        args += ["up", "-d", "--remove-orphans"]
    else:
        args += [command]

    cwd = str(compose_dir or _COMPOSE_DIR)
    result = subprocess.run(args, capture_output=True, text=True, timeout=300, cwd=cwd)
    if result.returncode != 0:
        raise RuntimeError(f"docker compose {command} failed: {result.stderr[:500]}")
    return result.stdout


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/status", response_model=UpdateStatus)
async def update_status(
    _: User = Depends(get_current_user),
) -> UpdateStatus:
    """Return current version info and whether a compose .env is configured."""
    current = _read_current_version()
    env = _read_compose_env()
    previous = env.get("PREVIOUS_VERSION")
    build_date = os.getenv("BUILD_DATE")

    return UpdateStatus(
        current_version=current,
        previous_version=previous,
        build_date=build_date,
        available=_COMPOSE_ENV.exists(),
    )


@router.post("/apply", response_model=UpdateApplyResponse)
async def update_apply(
    body: UpdateApplyRequest,
    _: User = Depends(get_current_user),
) -> UpdateApplyResponse:
    """Update to a target version by changing APP_VERSION and pulling new images."""
    if not _COMPOSE_ENV.exists():
        raise HTTPException(
            status_code=501,
            detail=(
                "Production compose environment not configured. "
                "Set COMPOSE_PROJECT_DIR to the directory containing docker-compose.yml and .env."
            ),
        )

    target = body.target_version.strip()
    if not target:
        raise HTTPException(status_code=422, detail="target_version is required")

    current = _read_current_version()
    if target == current:
        raise HTTPException(status_code=409, detail=f"Already running version {target}")

    env = _read_compose_env()
    env["PREVIOUS_VERSION"] = current
    env["APP_VERSION"] = target
    _write_compose_env(env)

    try:
        _run_compose("pull")
        _run_compose("up")
    except Exception as exc:
        # Attempt to restore previous version on failure
        env["APP_VERSION"] = current
        env.pop("PREVIOUS_VERSION", None)
        _write_compose_env(env)
        raise HTTPException(status_code=500, detail=f"Update failed: {exc}")

    return UpdateApplyResponse(
        status="ok",
        previous_version=current,
        new_version=target,
        message=f"Updated from {current} to {target}. Services are restarting.",
    )


@router.post("/rollback", response_model=UpdateRollbackResponse)
async def update_rollback(
    _: User = Depends(get_current_user),
) -> UpdateRollbackResponse:
    """Rollback to the previous version."""
    if not _COMPOSE_ENV.exists():
        raise HTTPException(
            status_code=501,
            detail="Production compose environment not configured.",
        )

    env = _read_compose_env()
    previous = env.get("PREVIOUS_VERSION")
    if not previous:
        raise HTTPException(status_code=409, detail="No previous version to roll back to.")

    current = env.get("APP_VERSION", _read_current_version())
    env["APP_VERSION"] = previous
    env["PREVIOUS_VERSION"] = current  # swap so we can roll forward again
    _write_compose_env(env)

    try:
        _run_compose("pull")
        _run_compose("up")
    except Exception as exc:
        # Restore on failure
        env["APP_VERSION"] = current
        env["PREVIOUS_VERSION"] = previous
        _write_compose_env(env)
        raise HTTPException(status_code=500, detail=f"Rollback failed: {exc}")

    return UpdateRollbackResponse(
        status="ok",
        rolled_back_from=current,
        rolled_back_to=previous,
        message=f"Rolled back from {current} to {previous}. Services are restarting.",
    )
