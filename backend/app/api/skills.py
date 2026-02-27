import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.session import Session
from app.models.skill import Skill
from app.models.user import User
from app.schemas.skill import (
    SessionResponse,
    SkillCreate,
    SkillResponse,
    SkillUpdate,
)

router = APIRouter(prefix="/skills", tags=["skills"])


# ── Skills CRUD ──────────────────────────────────────────────────────────────


@router.get("", response_model=list[SkillResponse])
async def list_skills(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Skill]:
    result = await db.execute(select(Skill).where(Skill.user_id == current_user.id))
    return list(result.scalars().all())


@router.post("", response_model=SkillResponse, status_code=status.HTTP_201_CREATED)
async def create_skill(
    body: SkillCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Skill:
    skill = Skill(**body.model_dump(), user_id=current_user.id)
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return skill


@router.get("/{skill_id}", response_model=SkillResponse)
async def get_skill(
    skill_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Skill:
    return await _get_owned_skill(skill_id, current_user.id, db)


@router.put("/{skill_id}", response_model=SkillResponse)
async def update_skill(
    skill_id: uuid.UUID,
    body: SkillUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Skill:
    skill = await _get_owned_skill(skill_id, current_user.id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(skill, field, value)
    await db.commit()
    await db.refresh(skill)
    return skill


@router.delete("/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_skill(
    skill_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    skill = await _get_owned_skill(skill_id, current_user.id, db)
    await db.delete(skill)
    await db.commit()


# ── Sessions ─────────────────────────────────────────────────────────────────


@router.get("/{skill_id}/sessions", response_model=list[SessionResponse])
async def list_sessions(
    skill_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Session]:
    await _get_owned_skill(skill_id, current_user.id, db)
    result = await db.execute(select(Session).where(Session.skill_id == skill_id))
    return list(result.scalars().all())


@router.post("/{skill_id}/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    skill_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Session:
    await _get_owned_skill(skill_id, current_user.id, db)
    session = Session(skill_id=skill_id, user_id=current_user.id, status="idle")
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


# ── Helpers ──────────────────────────────────────────────────────────────────


async def _get_owned_skill(skill_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Skill:
    result = await db.execute(select(Skill).where(Skill.id == skill_id, Skill.user_id == user_id))
    skill = result.scalar_one_or_none()
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")
    return skill
