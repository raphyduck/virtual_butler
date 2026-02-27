"""Orchestrates a chat turn for a Skill session.

Flow:
1. Load session + skill from DB
2. Persist user message
3. Load full message history
4. Call AI provider (streaming)
5. Accumulate + persist assistant message
6. Update session status
"""

from collections.abc import AsyncIterator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message import Message
from app.models.session import Session
from app.models.skill import Skill
from app.providers import ChatMessage, get_provider


class SessionNotFound(Exception):
    pass


class SkillSessionHandler:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def _load_session(self, session_id: str, user_id: str) -> tuple[Session, Skill]:
        result = await self._db.execute(
            select(Session).where(
                Session.id == session_id,  # type: ignore[arg-type]
                Session.user_id == user_id,  # type: ignore[arg-type]
            )
        )
        session = result.scalar_one_or_none()
        if session is None:
            raise SessionNotFound(f"Session {session_id} not found")

        skill_result = await self._db.execute(select(Skill).where(Skill.id == session.skill_id))
        skill = skill_result.scalar_one_or_none()
        if skill is None:
            raise SessionNotFound(f"Skill for session {session_id} not found")

        return session, skill

    async def _load_history(self, session_id: str) -> list[ChatMessage]:
        result = await self._db.execute(
            select(Message)
            .where(Message.session_id == session_id)  # type: ignore[arg-type]
            .order_by(Message.created_at)
        )
        messages = result.scalars().all()
        return [ChatMessage(role=m.role, content=m.content) for m in messages if m.role in ("user", "assistant")]

    async def _save_message(self, session_id: str, role: str, content: str) -> Message:
        msg = Message(session_id=session_id, role=role, content=content)  # type: ignore[arg-type]
        self._db.add(msg)
        await self._db.flush()
        return msg

    async def _set_status(self, session: Session, status: str) -> None:
        session.status = status
        await self._db.flush()

    async def run(
        self,
        session_id: str,
        user_id: str,
        user_message: str,
    ) -> AsyncIterator[str]:
        """Persist user message, stream AI reply, persist assistant message.

        Yields text chunks for streaming to the WebSocket client.
        """
        session, skill = await self._load_session(session_id, user_id)

        await self._save_message(session_id, "user", user_message)
        await self._set_status(session, "running")
        await self._db.commit()

        history = await self._load_history(session_id)
        provider = get_provider(skill.provider, skill.model, skill.provider_config)

        full_response: list[str] = []
        try:
            async for chunk in provider.stream(history, skill.system_prompt):
                full_response.append(chunk)
                yield chunk
        except Exception:
            await self._set_status(session, "failed")
            await self._db.commit()
            raise

        assistant_content = "".join(full_response)
        await self._save_message(session_id, "assistant", assistant_content)
        await self._set_status(session, "idle")
        await self._db.commit()
