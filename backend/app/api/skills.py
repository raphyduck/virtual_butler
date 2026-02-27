"""Skills API — install, list, enable/disable, and remove skills.

GET    /api/v1/skills           — list installed skills
POST   /api/v1/skills/install   — install a skill from a git URL
POST   /api/v1/skills/{id}/enable   — enable a skill
POST   /api/v1/skills/{id}/disable  — disable a skill
DELETE /api/v1/skills/{id}      — uninstall a skill
"""

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.skill import InstalledSkill
from app.models.user import User
from app.skills.manager import clone_skill, remove_skill

router = APIRouter(prefix="/skills", tags=["skills"])


# ── Schemas ──────────────────────────────────────────────────────────────────


class SkillInstallRequest(BaseModel):
    repo_url: str
    version: str = "latest"


class SkillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    repo_url: str
    version: str
    enabled: bool
    requires_rebuild: bool
    requires_secrets: list[str]
    requires_packages: list[str]
    requires_system_packages: list[str]
    installed_at: str
    updated_at: str


class SkillInstallResponse(BaseModel):
    skill: SkillOut
    warnings: list[str]


# ── Helpers ──────────────────────────────────────────────────────────────────


def _skill_to_out(skill: InstalledSkill) -> SkillOut:
    manifest = json.loads(skill.manifest_json) if skill.manifest_json else {}
    return SkillOut(
        id=skill.id,
        name=skill.name,
        description=skill.description,
        repo_url=skill.repo_url,
        version=skill.version,
        enabled=skill.enabled,
        requires_rebuild=skill.requires_rebuild,
        requires_secrets=manifest.get("requires_secrets", []),
        requires_packages=manifest.get("requires_packages", []),
        requires_system_packages=manifest.get("requires_system_packages", []),
        installed_at=skill.installed_at.isoformat(),
        updated_at=skill.updated_at.isoformat(),
    )


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("", response_model=list[SkillOut])
async def list_skills(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[SkillOut]:
    result = await db.execute(select(InstalledSkill).order_by(InstalledSkill.installed_at.desc()))
    return [_skill_to_out(s) for s in result.scalars()]


@router.post("/install", response_model=SkillInstallResponse, status_code=status.HTTP_201_CREATED)
async def install_skill(
    body: SkillInstallRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SkillInstallResponse:
    """Install a skill from a git repository URL."""
    warnings: list[str] = []

    try:
        manifest = clone_skill(body.repo_url, body.version)
    except FileNotFoundError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Check if already installed
    existing = await db.execute(select(InstalledSkill).where(InstalledSkill.name == manifest.name))
    if existing.scalar_one_or_none():
        # Update existing
        skill = existing.scalar_one_or_none()
        # Re-query since scalar was consumed
        result = await db.execute(select(InstalledSkill).where(InstalledSkill.name == manifest.name))
        skill = result.scalar_one()
        skill.version = manifest.version or body.version
        skill.description = manifest.description
        skill.repo_url = body.repo_url
        skill.manifest_json = json.dumps(
            {
                "requires_secrets": manifest.requires_secrets,
                "requires_packages": manifest.requires_packages,
                "requires_system_packages": manifest.requires_system_packages,
                "entry_point": manifest.entry_point,
            }
        )
        skill.requires_rebuild = bool(manifest.requires_system_packages)
    else:
        requires_rebuild = bool(manifest.requires_system_packages)
        skill = InstalledSkill(
            name=manifest.name,
            description=manifest.description,
            repo_url=body.repo_url,
            version=manifest.version or body.version,
            manifest_json=json.dumps(
                {
                    "requires_secrets": manifest.requires_secrets,
                    "requires_packages": manifest.requires_packages,
                    "requires_system_packages": manifest.requires_system_packages,
                    "entry_point": manifest.entry_point,
                }
            ),
            requires_rebuild=requires_rebuild,
        )
        db.add(skill)

    if manifest.requires_system_packages:
        warnings.append(
            f"This skill requires system packages: {', '.join(manifest.requires_system_packages)}. "
            "It will run in limited mode. To fully enable it, create a release that "
            "includes these dependencies in the Docker image."
        )

    if manifest.requires_secrets:
        warnings.append(
            f"This skill requires secrets to be configured: {', '.join(manifest.requires_secrets)}. "
            "Please add them in Settings."
        )

    await db.commit()
    await db.refresh(skill)

    return SkillInstallResponse(skill=_skill_to_out(skill), warnings=warnings)


@router.post("/{skill_id}/enable")
async def enable_skill(
    skill_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SkillOut:
    skill = await db.get(InstalledSkill, skill_id)
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    skill.enabled = True
    await db.commit()
    await db.refresh(skill)
    return _skill_to_out(skill)


@router.post("/{skill_id}/disable")
async def disable_skill(
    skill_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SkillOut:
    skill = await db.get(InstalledSkill, skill_id)
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    skill.enabled = False
    await db.commit()
    await db.refresh(skill)
    return _skill_to_out(skill)


@router.delete("/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def uninstall_skill(
    skill_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    skill = await db.get(InstalledSkill, skill_id)
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")

    # Remove files from disk
    remove_skill(skill.name)

    # Remove from DB
    await db.delete(skill)
    await db.commit()
