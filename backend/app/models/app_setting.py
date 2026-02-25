from datetime import datetime

from sqlalchemy import DateTime, String, Text, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# Keys that can be set via the web UI
CONFIGURABLE_KEYS = frozenset(
    {
        "anthropic_api_key",
        "openai_api_key",
        "google_api_key",
        "github_client_id",
        "github_client_secret",
        "github_callback_url",
        "github_repo_owner",
        "github_repo_name",
        "butler_provider",
        "butler_model",
    }
)

# Keys whose values are masked when returned through the API
SECRET_KEYS = frozenset({"anthropic_api_key", "openai_api_key", "google_api_key", "github_client_secret"})


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


async def get_effective_setting(db: AsyncSession, key: str, env_fallback: str = "") -> str:
    """Return the DB value for *key*, falling back to *env_fallback* if not set."""
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    row = result.scalar_one_or_none()
    return (row.value or "") if (row and row.value) else env_fallback
