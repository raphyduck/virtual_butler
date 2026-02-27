import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    skill_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("skills.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="idle"
    )  # idle | running | completed | failed

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    skill: Mapped["Skill"] = relationship("Skill", back_populates="sessions")  # noqa: F821
    messages: Mapped[list["Message"]] = relationship(  # noqa: F821
        "Message", back_populates="session", cascade="all, delete-orphan", order_by="Message.created_at"
    )
    deliverable: Mapped["Deliverable | None"] = relationship(  # noqa: F821
        "Deliverable", back_populates="session", uselist=False, cascade="all, delete-orphan"
    )
