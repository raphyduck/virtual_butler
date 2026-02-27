"""Skill store API — discover, install, enable, disable extension skills.

These endpoints manage installable skills from the skills/ directory,
distinct from the user-defined Skill CRUD in /api/v1/skills.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.skills.skill_manager import (
    disable_skill,
    discover_skills,
    enable_skill,
    install_skill,
    list_installed,
)

router = APIRouter(prefix="/skill-store", tags=["skill-store"])


class SkillManifest(BaseModel):
    name: str
    version: str | None = None
    description: str | None = None
    permissions: dict | None = None
    requires: dict | None = None
    _dir: str | None = None

    model_config = {"from_attributes": True}


class InstalledSkillResponse(BaseModel):
    id: uuid.UUID
    name: str
    version: str
    description: str | None
    directory: str
    enabled: bool
    installed_at: str

    model_config = {"from_attributes": True}


class InstallRequest(BaseModel):
    directory: str


@router.get("/available", response_model=list[SkillManifest])
async def get_available_skills(
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """List all skills discovered in the skills/ directory."""
    return discover_skills()


@router.get("/installed", response_model=list[InstalledSkillResponse])
async def get_installed_skills(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list:
    return await list_installed(db)


@router.post("/install", response_model=InstalledSkillResponse, status_code=201)
async def install(
    body: InstallRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InstalledSkillResponse:
    try:
        skill = await install_skill(db, body.directory)
        return skill  # type: ignore[return-value]
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.post("/{skill_id}/enable", response_model=InstalledSkillResponse)
async def enable(
    skill_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InstalledSkillResponse:
    try:
        skill = await enable_skill(db, str(skill_id))
        return skill  # type: ignore[return-value]
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/{skill_id}/disable", response_model=InstalledSkillResponse)
async def disable(
    skill_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InstalledSkillResponse:
    try:
        skill = await disable_skill(db, str(skill_id))
        return skill  # type: ignore[return-value]
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
