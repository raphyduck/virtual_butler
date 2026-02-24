"""WebSocket endpoint for real-time streaming chat within an Ability session.

Protocol (JSON over WebSocket):

Client → Server:
    {"content": "<user message>"}

Server → Client (stream):
    {"type": "chunk",  "content": "<text fragment>"}
    {"type": "done"}
    {"type": "error",  "detail": "<error message>"}

Authentication: Bearer token passed as query param `?token=<jwt>` because
browsers cannot set custom headers on WebSocket connections.
"""

import json
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.abilities import AbilitySessionHandler, SessionNotFound
from app.auth.jwt import decode_token
from app.database import AsyncSessionLocal

router = APIRouter()


async def _authenticate(token: str | None) -> str | None:
    """Return user_id string if valid, None otherwise."""
    if not token:
        return None
    try:
        return decode_token(token)
    except JWTError:
        return None


@router.websocket("/ws/session/{session_id}")
async def websocket_session(websocket: WebSocket, session_id: uuid.UUID) -> None:
    token = websocket.query_params.get("token")
    user_id = await _authenticate(token)

    if user_id is None:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()

    async def send(data: dict) -> None:
        await websocket.send_text(json.dumps(data))

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
                user_message: str = payload["content"]
            except (json.JSONDecodeError, KeyError):
                await send({"type": "error", "detail": 'Invalid payload — expected {"content": "..."}'})
                continue

            async with AsyncSessionLocal() as db:
                await _handle_turn(websocket, db, str(session_id), user_id, user_message)

    except WebSocketDisconnect:
        pass


async def _handle_turn(
    websocket: WebSocket,
    db: AsyncSession,
    session_id: str,
    user_id: str,
    user_message: str,
) -> None:
    async def send(data: dict) -> None:
        await websocket.send_text(json.dumps(data))

    handler = AbilitySessionHandler(db)
    try:
        async for chunk in handler.run(session_id, user_id, user_message):
            await send({"type": "chunk", "content": chunk})
        await send({"type": "done"})
    except SessionNotFound as exc:
        await send({"type": "error", "detail": str(exc)})
    except Exception as exc:
        await send({"type": "error", "detail": f"Provider error: {exc}"})
