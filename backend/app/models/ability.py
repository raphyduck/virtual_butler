import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Ability(Base):
    __tablename__ = "abilities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # AI provider configuration
    provider: Mapped[str] = mapped_column(String(50), nullable=False)  # anthropic | openai | google | ollama
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Output configuration
    deliverable_type: Mapped[str] = mapped_column(String(50), nullable=False)  # code | website | video | document | ...
    target_type: Mapped[str] = mapped_column(String(50), nullable=False)       # github | s3 | youtube | ftp | local | ...
    target_config: Mapped[str | None] = mapped_column(Text, nullable=True)     # JSON stored as text

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="abilities")  # noqa: F821
    sessions: Mapped[list["Session"]] = relationship(  # noqa: F821
        "Session", back_populates="ability", cascade="all, delete-orphan"
    )
