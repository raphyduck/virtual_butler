import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class InstalledSkill(Base):
    """Tracks installed extension skills (from the skills/ directory)."""

    __tablename__ = "installed_skills"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False, default="0.1")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    directory: Mapped[str] = mapped_column(String(255), nullable=False)
    manifest_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    installed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
