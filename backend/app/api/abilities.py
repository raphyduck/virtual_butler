import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.ability import Ability
from app.models.session import Session
from app.models.user import User
from app.schemas.ability import (
    AbilityCreate,
    AbilityResponse,
    AbilityUpdate,
    SessionResponse,
)

router = APIRouter(prefix="/abilities", tags=["abilities"])


# ── Abilities CRUD ────────────────────────────────────────────────────────────

@router.get("", response_model=list[AbilityResponse])
async def list_abilities(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Ability]:
    result = await db.execute(select(Ability).where(Ability.user_id == current_user.id))
    return list(result.scalars().all())


@router.post("", response_model=AbilityResponse, status_code=status.HTTP_201_CREATED)
async def create_ability(
    body: AbilityCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Ability:
    ability = Ability(**body.model_dump(), user_id=current_user.id)
    db.add(ability)
    await db.commit()
    await db.refresh(ability)
    return ability


@router.get("/{ability_id}", response_model=AbilityResponse)
async def get_ability(
    ability_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Ability:
    return await _get_owned_ability(ability_id, current_user.id, db)


@router.put("/{ability_id}", response_model=AbilityResponse)
async def update_ability(
    ability_id: uuid.UUID,
    body: AbilityUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Ability:
    ability = await _get_owned_ability(ability_id, current_user.id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(ability, field, value)
    await db.commit()
    await db.refresh(ability)
    return ability


@router.delete("/{ability_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ability(
    ability_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    ability = await _get_owned_ability(ability_id, current_user.id, db)
    await db.delete(ability)
    await db.commit()


# ── Sessions ──────────────────────────────────────────────────────────────────

@router.get("/{ability_id}/sessions", response_model=list[SessionResponse])
async def list_sessions(
    ability_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Session]:
    await _get_owned_ability(ability_id, current_user.id, db)
    result = await db.execute(select(Session).where(Session.ability_id == ability_id))
    return list(result.scalars().all())


@router.post("/{ability_id}/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    ability_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Session:
    await _get_owned_ability(ability_id, current_user.id, db)
    session = Session(ability_id=ability_id, user_id=current_user.id, status="idle")
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_owned_ability(
    ability_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
) -> Ability:
    result = await db.execute(
        select(Ability).where(Ability.id == ability_id, Ability.user_id == user_id)
    )
    ability = result.scalar_one_or_none()
    if ability is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ability not found")
    return ability
