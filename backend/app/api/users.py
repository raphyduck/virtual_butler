import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_admin
from app.database import get_db
from app.models.user import User

router = APIRouter(prefix="/users", tags=["users"])


class UserAdminResponse(BaseModel):
    id: uuid.UUID
    email: str
    is_admin: bool
    is_enabled: bool

    model_config = {"from_attributes": True}


class UserAdminUpdateRequest(BaseModel):
    role: Literal["admin", "user"] | None = None
    enabled: bool | None = None


async def _ensure_not_last_admin(db: AsyncSession, user: User) -> None:
    admin_count = await db.scalar(select(func.count()).select_from(User).where(User.is_admin.is_(True)))
    if (admin_count or 0) <= 1 and user.is_admin:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot remove the last admin")


@router.get("", response_model=list[UserAdminResponse])
async def list_users(_: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)) -> list[User]:
    users = await db.scalars(select(User).order_by(User.created_at.asc()))
    return list(users)


@router.patch("/{user_id}", response_model=UserAdminResponse)
async def update_user(
    user_id: uuid.UUID,
    body: UserAdminUpdateRequest,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if body.role is not None and body.role == "user" and user.is_admin:
        await _ensure_not_last_admin(db, user)
        if user.id == current_admin.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You cannot remove your own admin role")
        user.is_admin = False
    elif body.role == "admin":
        user.is_admin = True

    if body.enabled is not None:
        if user.id == current_admin.id and body.enabled is False:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You cannot disable your own account")
        user.is_enabled = body.enabled

    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.id == current_admin.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You cannot delete your own account")
    if user.is_admin:
        await _ensure_not_last_admin(db, user)

    await db.delete(user)
    await db.commit()
