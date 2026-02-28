"""Butler chat handler — platform-level AI assistant.

Handles multi-turn chat with rich platform context and self-modification support.

The handler:
  1. Builds a dynamic system prompt containing platform statistics
  2. Streams AI responses to the caller
  3. Detects ```action ... ``` blocks in the AI output
  4. Exposes any pending modification action via `.pop_pending_action()`

WebSocket protocol extension (handled by the WS layer, not here):
  {"type": "modify_started", "job": {...}}
  {"type": "modify_update",  "job": {...}}
"""

import json
import os
import re
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.app_setting import get_effective_setting
from app.models.conversation import ButlerMessage, Conversation
from app.models.session import Session
from app.models.skill import Skill
from app.models.user import User
from app.providers import ChatMessage, get_provider

# Matches a fenced ```action ... ``` block anywhere in the AI response
_ACTION_RE = re.compile(r"```action\s*\n(.*?)\n```", re.DOTALL)

_SYSTEM_TEMPLATE = """\
You are the Personal Assistant, the built-in AI assistant for this platform.

## Your capabilities

### Answering questions
Answer questions about the platform and how to use it. Provide usage statistics,
explain features, and guide users through skills, sessions, AI providers, and settings.

### Changing the platform
When a user asks you to change something — UI, appearance, features, behaviour — you can
trigger a code modification job by embedding exactly ONE action block in your response:

```action
{{"type": "modify", "instruction": "<precise, self-contained description>"}}
```

Rules for action blocks
- ALWAYS describe what you are about to do **before** the action block
- Make the instruction detailed and unambiguous (it drives an AI code-editor)
- The full pipeline is:
  1. Pull the latest default branch from GitHub
  2. Plan and apply changes
  3. Push a feature branch and create a Pull Request
  4. User reviews the PR and clicks "Merge & Deploy" in the chat
  5. PR is merged, Docker images are built and pushed
  6. The running instance is updated automatically
- Include only ONE action block per response
- The user will review a preview of all file changes before anything is applied

## Current platform context
{context}

Today's date: {date}\
"""


class ButlerHandler:
    """Stateful handler for a butler chat session (one per WebSocket connection).

    Persists conversation history to the conversations / butler_messages tables
    so that chat survives page reloads.
    """

    def __init__(self) -> None:
        self._history: list[ChatMessage] = []
        self._pending_action: dict | None = None
        self._conversation_id: uuid.UUID | None = None

    # ── Context helpers ────────────────────────────────────────────────────────

    async def _build_context(self, db: AsyncSession, user_id: str) -> str:
        skill_count: int = (
            await db.execute(select(func.count()).select_from(Skill).where(Skill.user_id == user_id))
        ).scalar() or 0

        skill_names = list((await db.execute(select(Skill.name).where(Skill.user_id == user_id).limit(20))).scalars())

        session_count: int = (
            await db.execute(select(func.count()).select_from(Session).where(Session.user_id == user_id))
        ).scalar() or 0

        active_count: int = (
            await db.execute(
                select(func.count()).select_from(Session).where(Session.user_id == user_id, Session.status == "running")
            )
        ).scalar() or 0

        available: list[str] = []
        if await get_effective_setting(db, "anthropic_api_key", os.getenv("ANTHROPIC_API_KEY", "")):
            available.append("Anthropic / Claude")
        if await get_effective_setting(db, "openai_api_key", os.getenv("OPENAI_API_KEY", "")):
            available.append("OpenAI / GPT")
        if await get_effective_setting(db, "google_api_key", os.getenv("GOOGLE_API_KEY", "")):
            available.append("Google / Gemini")
        available.append("Ollama (local, no key needed)")

        user = await db.get(User, uuid.UUID(user_id))
        github_status = (
            "connected — self-modification available (changes pushed as PR)"
            if (user and user.github_is_repo_owner)
            else "not connected (self-modification unavailable)"
        )

        lines = [f"- Skills: {skill_count}"]
        if skill_names:
            lines.append(f"  Names: {', '.join(skill_names)}")
        lines += [
            f"- Sessions total: {session_count} (active: {active_count})",
            f"- Available AI providers: {', '.join(available)}",
            f"- GitHub: {github_status}",
        ]
        return "\n".join(lines)

    async def _resolve_provider(self, db: AsyncSession):
        provider_name = await get_effective_setting(db, "butler_provider", os.getenv("BUTLER_PROVIDER", "anthropic"))
        model = await get_effective_setting(db, "butler_model", os.getenv("BUTLER_MODEL", "claude-sonnet-4-6"))

        # Resolve API key from DB, falling back to env
        key_map = {
            "anthropic": ("anthropic_api_key", "ANTHROPIC_API_KEY"),
            "openai": ("openai_api_key", "OPENAI_API_KEY"),
            "google": ("google_api_key", "GOOGLE_API_KEY"),
        }
        api_key: str | None = None
        if provider_name in key_map:
            db_key, env_key = key_map[provider_name]
            api_key = await get_effective_setting(db, db_key, os.getenv(env_key, "")) or None

        provider_config_json = json.dumps({"api_key": api_key}) if api_key else None
        return get_provider(provider_name, model, provider_config_json)

    # ── Public interface ───────────────────────────────────────────────────────

    def pop_pending_action(self) -> dict | None:
        """Return and clear any pending modification action."""
        action, self._pending_action = self._pending_action, None
        return action

    async def _ensure_conversation(self, db: AsyncSession, user_id: str) -> uuid.UUID:
        """Resume the latest conversation or create a new one.

        On the first call per connection, queries the DB for the user's most
        recent conversation and reloads its messages into ``_history`` so the
        AI sees the full prior context.
        """
        if self._conversation_id is not None:
            return self._conversation_id

        # Try to resume the latest conversation
        result = await db.execute(
            select(Conversation)
            .where(Conversation.user_id == uuid.UUID(user_id))
            .options(selectinload(Conversation.butler_messages))
            .order_by(Conversation.updated_at.desc())
            .limit(1)
        )
        conv = result.scalar_one_or_none()

        if conv is not None:
            # Reload prior messages into in-memory history for multi-turn context
            self._history = [
                ChatMessage(role=m.role, content=m.content)
                for m in conv.butler_messages
            ]
            self._conversation_id = conv.id
            return conv.id

        # No previous conversation — create a fresh one
        conv = Conversation(user_id=uuid.UUID(user_id))
        db.add(conv)
        await db.flush()
        self._conversation_id = conv.id
        return conv.id

    async def run(
        self,
        db: AsyncSession,
        user_id: str,
        user_message: str,
    ) -> AsyncIterator[str]:
        """Persist user turn, stream AI reply, persist assistant turn.

        After the stream ends, any detected ```action``` block is stored in
        `_pending_action` and can be retrieved via `pop_pending_action()`.
        """
        conv_id = await self._ensure_conversation(db, user_id)

        context = await self._build_context(db, user_id)
        system_prompt = _SYSTEM_TEMPLATE.format(
            context=context,
            date=datetime.now(UTC).strftime("%Y-%m-%d"),
        )

        # Persist user message
        db.add(ButlerMessage(conversation_id=conv_id, role="user", content=user_message))
        await db.flush()

        self._history.append(ChatMessage(role="user", content=user_message))

        provider = await self._resolve_provider(db)

        chunks: list[str] = []
        try:
            async for chunk in provider.stream(self._history, system_prompt):
                chunks.append(chunk)
                yield chunk
        except Exception:
            self._history.pop()  # rollback failed user message
            raise

        assistant_content = "".join(chunks)
        self._history.append(ChatMessage(role="assistant", content=assistant_content))

        # Persist assistant message
        db.add(ButlerMessage(conversation_id=conv_id, role="assistant", content=assistant_content))
        await db.commit()

        # Detect action block
        match = _ACTION_RE.search(assistant_content)
        if match:
            try:
                data = json.loads(match.group(1))
                if data.get("type") == "modify":
                    self._pending_action = data
            except json.JSONDecodeError:
                pass
