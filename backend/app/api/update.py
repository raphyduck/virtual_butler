"""Docker-based update system.

Endpoints:
  GET   /api/v1/update/status   → current version + latest available
  POST  /api/v1/update/apply    → pull new images and restart
  POST  /api/v1/update/rollback → revert to previous version
"""

import asyncio
import os
import subprocess

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/update", tags=["update"])

_APP_VERSION = os.getenv("APP_VERSION", "dev")
_REGISTRY = "ghcr.io/raphyduck/virtual_butler-backend"


class UpdateStatus(BaseModel):
    current_version: str
    available_version: str | None = None


class UpdateResult(BaseModel):
    success: bool
    message: str


async def _fetch_latest_tag() -> str | None:
    """Query GHCR for the latest release tag."""
    url = "https://api.github.com/repos/raphyduck/virtual_butler/releases/latest"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers={"Accept": "application/vnd.github+json"})
            if resp.status_code == 200:
                return resp.json().get("tag_name")
    except Exception:
        pass
    return None


@router.get("/status", response_model=UpdateStatus)
async def update_status(
    current_user: User = Depends(get_current_user),
) -> UpdateStatus:
    available = await _fetch_latest_tag()
    return UpdateStatus(current_version=_APP_VERSION, available_version=available)


@router.post("/apply", response_model=UpdateResult)
async def apply_update(
    current_user: User = Depends(get_current_user),
) -> UpdateResult:
    """Pull latest images and recreate containers."""
    try:
        await asyncio.to_thread(
            subprocess.run,
            ["docker", "compose", "-f", "docker-compose.prod.yml", "pull"],
            check=True,
            capture_output=True,
            timeout=120,
        )
        await asyncio.to_thread(
            subprocess.run,
            ["docker", "compose", "-f", "docker-compose.prod.yml", "up", "-d"],
            check=True,
            capture_output=True,
            timeout=120,
        )
        return UpdateResult(success=True, message="Update applied. Containers are restarting.")
    except subprocess.CalledProcessError as exc:
        raise HTTPException(status_code=500, detail=f"Update failed: {exc.stderr.decode()[:500]}")


@router.post("/rollback", response_model=UpdateResult)
async def rollback_update(
    current_user: User = Depends(get_current_user),
) -> UpdateResult:
    """Rollback to the previous version using PREVIOUS_VERSION env var."""
    prev = os.getenv("PREVIOUS_VERSION")
    if not prev:
        raise HTTPException(status_code=400, detail="No PREVIOUS_VERSION configured.")
    try:
        env = {**os.environ, "APP_VERSION": prev}
        await asyncio.to_thread(
            subprocess.run,
            ["docker", "compose", "-f", "docker-compose.prod.yml", "pull"],
            check=True,
            capture_output=True,
            timeout=120,
            env=env,
        )
        await asyncio.to_thread(
            subprocess.run,
            ["docker", "compose", "-f", "docker-compose.prod.yml", "up", "-d"],
            check=True,
            capture_output=True,
            timeout=120,
            env=env,
        )
        return UpdateResult(success=True, message=f"Rolled back to {prev}.")
    except subprocess.CalledProcessError as exc:
        raise HTTPException(status_code=500, detail=f"Rollback failed: {exc.stderr.decode()[:500]}")
