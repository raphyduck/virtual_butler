"""WebSocket endpoint for real-time log streaming.

Endpoint: /ws/logs?token=<jwt>

Server → Client (JSON):
    {"ts": "...", "level": "INFO", "logger": "app.x", "message": "..."}
"""

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError

from app.auth.jwt import decode_token
from app.log_buffer import log_handler

router = APIRouter()


async def _authenticate(token: str | None) -> str | None:
    if not token:
        return None
    try:
        return decode_token(token)
    except JWTError:
        return None


@router.websocket("/ws/logs")
async def ws_logs(ws: WebSocket, token: str | None = None) -> None:
    user_id = await _authenticate(token)
    if not user_id:
        await ws.close(code=4001, reason="Unauthorized")
        return

    await ws.accept()
    queue = log_handler.subscribe()
    try:
        while True:
            entry = await queue.get()
            await ws.send_text(json.dumps(entry))
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        log_handler.unsubscribe(queue)
