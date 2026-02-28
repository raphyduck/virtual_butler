"""In-memory ring-buffer log handler for the system logs UI.

Captures log records from every Python logger in the process and keeps
the most recent *maxlen* entries available for the REST API and
WebSocket broadcast.
"""

from __future__ import annotations

import asyncio
import logging
from collections import deque
from datetime import datetime, timezone
from typing import TypedDict


class LogEntry(TypedDict):
    ts: str  # ISO-8601 timestamp
    level: str
    logger: str
    message: str


class RingBufferHandler(logging.Handler):
    """Logging handler that stores formatted records in a bounded deque."""

    def __init__(self, maxlen: int = 2000) -> None:
        super().__init__()
        self.records: deque[LogEntry] = deque(maxlen=maxlen)
        self._subscribers: set[asyncio.Queue[LogEntry]] = set()

    def emit(self, record: logging.LogRecord) -> None:
        entry: LogEntry = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": self.format(record),
        }
        self.records.append(entry)
        # Fan-out to live WebSocket subscribers (non-blocking).
        for q in list(self._subscribers):
            try:
                q.put_nowait(entry)
            except asyncio.QueueFull:
                pass  # slow consumer, skip

    def get_entries(
        self,
        limit: int = 200,
        level: str | None = None,
        logger_name: str | None = None,
    ) -> list[LogEntry]:
        """Return the most recent entries, optionally filtered."""
        it = reversed(self.records)
        out: list[LogEntry] = []
        for entry in it:
            if level and entry["level"] != level.upper():
                continue
            if logger_name and logger_name not in entry["logger"]:
                continue
            out.append(entry)
            if len(out) >= limit:
                break
        out.reverse()
        return out

    def subscribe(self) -> asyncio.Queue[LogEntry]:
        q: asyncio.Queue[LogEntry] = asyncio.Queue(maxsize=256)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[LogEntry]) -> None:
        self._subscribers.discard(q)


# Singleton — importable from anywhere.
log_handler = RingBufferHandler()
