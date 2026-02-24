"""Application settings API (authenticated).

GET   /api/v1/settings  — read all configurable settings (secrets are masked)
PATCH /api/v1/settings  — update one or more settings
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.app_setting import CONFIGURABLE_KEYS, SECRET_KEYS, AppSetting
from app.models.user import User
from app.schemas.settings import SettingsResponse, SettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])

_MASKED = "***"


def _build_response(rows: dict[str, str | None]) -> SettingsResponse:
    data = {}
    for key in CONFIGURABLE_KEYS:
        val = rows.get(key)
        data[key] = _MASKED if (val and key in SECRET_KEYS) else val
    return SettingsResponse(**data)


@router.get("", response_model=SettingsResponse)
async def get_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SettingsResponse:
    result = await db.execute(select(AppSetting))
    rows = {row.key: row.value for row in result.scalars()}
    return _build_response(rows)


@router.patch("", response_model=SettingsResponse)
async def update_settings(
    body: SettingsUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SettingsResponse:
    data = {k: v for k, v in body.model_dump().items() if v is not None and k in CONFIGURABLE_KEYS}

    for key, value in data.items():
        result = await db.execute(select(AppSetting).where(AppSetting.key == key))
        row = result.scalar_one_or_none()
        if row:
            row.value = value
        else:
            db.add(AppSetting(key=key, value=value))

    await db.commit()

    result = await db.execute(select(AppSetting))
    rows = {row.key: row.value for row in result.scalars()}
    return _build_response(rows)
