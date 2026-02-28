"""REST endpoint for fetching recent log entries."""

from fastapi import APIRouter, Depends, Query

from app.auth.dependencies import get_current_user
from app.log_buffer import LogEntry, log_handler
from app.models.user import User

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("", response_model=list[LogEntry])
async def get_logs(
    limit: int = Query(200, ge=1, le=2000),
    level: str | None = Query(None),
    logger_name: str | None = Query(None, alias="logger"),
    _user: User = Depends(get_current_user),
) -> list[LogEntry]:
    """Return the most recent log entries (newest last)."""
    return log_handler.get_entries(limit=limit, level=level, logger_name=logger_name)
