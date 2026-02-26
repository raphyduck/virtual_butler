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

from app.models.ability import Ability
from app.models.app_setting import get_effective_setting
from app.models.session import Session
from app.models.user import User
from app.providers import ChatMessage, get_provider

# Matches a fenced ```action ... ``` block anywhere in the AI response
_ACTION_RE = re.compile(r"```action\s*\n(.*?)\n```", re.DOTALL)

_SYSTEM_TEMPLATE = """\
You are the Personal Assistant, the built-in AI assistant for this platform.

## Your capabilities

### Answering questions
Answer questions about the platform and how to use it. Provide usage statistics,
explain features, and guide users through abilities, sessions, AI providers, and settings.

### Changing the platform
When a user asks you to change something — UI, appearance, features, behaviour — you can
trigger a code modification job by embedding exactly ONE action block in your response:

```action
{{"type": "modify", "instruction": "<precise, self-contained description>", "mode": "local"}}
```

Rules for action blocks
- ALWAYS describe what you are about to do **before** the action block
- Make the instruction detailed and unambiguous (it drives an AI code-editor)
- Use `"mode": "local"` to apply changes immediately (restarts this instance)
- Use `"mode": "repo"` when GitHub is connected — changes are pushed to a feature
  branch and a Pull Request is automatically created for the user to review and merge
- Include only ONE action block per response
- The user will review a preview of all file changes before anything is applied

## Current platform context
{context}

Today's date: {date}\
"""


class ButlerHandler:
    """Stateful handler for a butler chat session (one per WebSocket connection)."""

    def __init__(self) -> None:
        self._history: list[ChatMessage] = []
        self._pending_action: dict | None = None

    # ── Context helpers ────────────────────────────────────────────────────────

    async def _build_context(self, db: AsyncSession, user_id: str) -> str:
        ability_count: int = (
            await db.execute(select(func.count()).select_from(Ability).where(Ability.user_id == user_id))
        ).scalar() or 0

        ability_names = list(
            (await db.execute(select(Ability.name).where(Ability.user_id == user_id).limit(20))).scalars()
        )

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
            "connected — repo mode available (changes pushed as PR)"
            if (user and user.github_is_repo_owner)
            else "not connected (local mode only)"
        )

        lines = [f"- Abilities: {ability_count}"]
        if ability_names:
            lines.append(f"  Names: {', '.join(ability_names)}")
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
        context = await self._build_context(db, user_id)
        system_prompt = _SYSTEM_TEMPLATE.format(
            context=context,
            date=datetime.now(UTC).strftime("%Y-%m-%d"),
        )

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

        # Detect action block
        match = _ACTION_RE.search(assistant_content)
        if match:
            try:
                data = json.loads(match.group(1))
                if data.get("type") == "modify":
                    self._pending_action = data
            except json.JSONDecodeError:
                pass
