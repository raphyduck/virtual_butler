"""First-run setup endpoints.

GET  /api/v1/setup/status  — returns {setup_required: bool}, no auth needed
POST /api/v1/setup          — create the first admin account + optional settings
                              only works when no users exist yet
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_access_token, create_refresh_token, hash_password
from app.database import get_db
from app.models.app_setting import CONFIGURABLE_KEYS, AppSetting
from app.models.user import User
from app.schemas.auth import TokenResponse
from app.schemas.settings import SetupRequest, SetupStatus, SettingsUpdate

router = APIRouter(prefix="/setup", tags=["setup"])


async def _count_users(db: AsyncSession) -> int:
    result = await db.execute(select(func.count()).select_from(User))
    return result.scalar_one()


async def _save_settings(db: AsyncSession, s: SettingsUpdate) -> None:
    data = {k: v for k, v in s.model_dump().items() if v is not None and k in CONFIGURABLE_KEYS}
    for key, value in data.items():
        result = await db.execute(select(AppSetting).where(AppSetting.key == key))
        row = result.scalar_one_or_none()
        if row:
            row.value = value
        else:
            db.add(AppSetting(key=key, value=value))


@router.get("/status", response_model=SetupStatus)
async def setup_status(db: AsyncSession = Depends(get_db)) -> SetupStatus:
    count = await _count_users(db)
    return SetupStatus(setup_required=count == 0)


@router.post("", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def run_setup(body: SetupRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    if await _count_users(db) > 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Setup already completed. Use the login page.",
        )

    if len(body.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 8 characters.",
        )

    user = User(email=body.email, hashed_password=hash_password(body.password))
    db.add(user)
    await db.flush()  # get user.id without committing

    if body.settings:
        await _save_settings(db, body.settings)

    await db.commit()
    await db.refresh(user)

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )
