import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Deliverable(Base):
    __tablename__ = "deliverables"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    deliverable_type: Mapped[str] = mapped_column(String(50), nullable=False)  # mirrors Ability.deliverable_type
    url: Mapped[str | None] = mapped_column(Text, nullable=True)  # where it was published
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON: extra info (commit sha, etc.)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped["Session"] = relationship("Session", back_populates="deliverable")  # noqa: F821
