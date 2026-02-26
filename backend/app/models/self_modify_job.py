import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SelfModifyJob(Base):
    """Tracks an AI-driven self-modification request from planning through apply."""

    __tablename__ = "self_modify_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # pending → planning → planned → confirmed → applying → committing
    #        → pushing (repo) | restarting (local) → done | failed | cancelled
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    mode: Mapped[str] = mapped_column(String(10), nullable=False)  # "repo" | "local"
    instruction: Mapped[str] = mapped_column(Text, nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False, default="anthropic")
    model: Mapped[str] = mapped_column(String(100), nullable=False, default="claude-sonnet-4-6")
    plan_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON of the modification plan
    steps_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array of agent steps
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    commit_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="self_modify_jobs")  # noqa: F821
