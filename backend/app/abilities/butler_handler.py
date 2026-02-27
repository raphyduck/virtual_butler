"""Butler chat handler — platform-level AI assistant.

Handles multi-turn chat with rich platform context and self-modification support.

The handler:
  1. Builds a dynamic system prompt containing platform statistics
  2. Loads/persists conversation history from the DB
  3. Streams AI responses to the caller
  4. Detects ```action ... ``` blocks in the AI output
  5. Exposes any pending modification action via `.pop_pending_action()`

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
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ability import Ability
from app.models.app_setting import get_effective_setting
from app.models.conversation import ButlerMessage, Conversation
from app.models.session import Session
from app.models.user import User
from app.providers import ChatMessage, get_provider

# Matches a fenced ```action ... ``` block anywhere in the AI response
_ACTION_RE = re.compile(r"```action\s*\n(.*?)\n```", re.DOTALL)

_VERSION_FILE = Path(os.getenv("VERSION_FILE", "/app/VERSION"))


def _current_version() -> str:
    if _VERSION_FILE.exists():
        return _VERSION_FILE.read_text().strip()
    return os.getenv("APP_VERSION", "dev")


_SYSTEM_TEMPLATE = """\
You are the Personal Assistant, the built-in AI assistant for this platform.

## Your capabilities

### Answering questions
Answer questions about the platform and how to use it. Provide usage statistics,
explain features, and guide users through skills, sessions, AI providers, and settings.

### Platform updates
The platform uses Docker-based auto-updates. New versions are built by GitHub Actions
and deployed by pulling tagged images. You can inform the user about the current version
and guide them to the Update page (/settings → Update tab) to check for new versions,
apply updates, or rollback.

Current platform version: {version}

### Skills
Skills are installable add-on packs (git repositories) that extend the platform.
Each skill has a manifest (skill.json) declaring its name, description, required secrets,
and dependencies. You can guide users to the Skills page to browse, install, configure,
and manage skills. Skills that require no OS-level dependencies can be installed without
rebuilding; others require a PR → release → image rebuild cycle.

### Changing the platform (self-modification)
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
  branch and a Pull Request is automatically created for the user to review and merge.
  **For production**, always prefer repo mode: PR → merge → release → Docker image build → update.
- Include only ONE action block per response
- The user will review a preview of all file changes before anything is applied

## Current platform context
{context}

Today's date: {date}\
"""


class ButlerHandler:
    """Stateful handler for a butler chat session (one per WebSocket connection).

    Manages a single conversation per user, persisting messages to the DB.
    """

    def __init__(self) -> None:
        self._conversation_id: uuid.UUID | None = None
        self._history: list[ChatMessage] = []
        self._history_loaded = False
        self._pending_action: dict | None = None

    # ── Conversation persistence ────────────────────────────────────────────

    async def _ensure_conversation(self, db: AsyncSession, user_id: str) -> uuid.UUID:
        """Get or create the user's active butler conversation and load its history."""
        if self._conversation_id and self._history_loaded:
            return self._conversation_id

        uid = uuid.UUID(user_id)

        # Find most recent conversation for this user
        result = await db.execute(
            select(Conversation).where(Conversation.user_id == uid).order_by(Conversation.updated_at.desc()).limit(1)
        )
        conv = result.scalar_one_or_none()

        if conv is None:
            conv = Conversation(user_id=uid)
            db.add(conv)
            await db.commit()
            await db.refresh(conv)

        self._conversation_id = conv.id

        # Load existing messages into in-memory history
        if not self._history_loaded:
            msg_result = await db.execute(
                select(ButlerMessage).where(ButlerMessage.conversation_id == conv.id).order_by(ButlerMessage.created_at)
            )
            for msg in msg_result.scalars():
                self._history.append(ChatMessage(role=msg.role, content=msg.content))
            self._history_loaded = True

        return conv.id

    async def _persist_message(self, db: AsyncSession, conversation_id: uuid.UUID, role: str, content: str) -> None:
        """Save a message to the conversation in the DB."""
        msg = ButlerMessage(conversation_id=conversation_id, role=role, content=content)
        db.add(msg)
        # Touch the conversation's updated_at
        conv = await db.get(Conversation, conversation_id)
        if conv:
            conv.updated_at = datetime.now(UTC)
        await db.commit()

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
        conversation_id = await self._ensure_conversation(db, user_id)

        context = await self._build_context(db, user_id)
        system_prompt = _SYSTEM_TEMPLATE.format(
            context=context,
            date=datetime.now(UTC).strftime("%Y-%m-%d"),
            version=_current_version(),
        )

        self._history.append(ChatMessage(role="user", content=user_message))
        await self._persist_message(db, conversation_id, "user", user_message)

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
        await self._persist_message(db, conversation_id, "assistant", assistant_content)

        # Detect action block
        match = _ACTION_RE.search(assistant_content)
        if match:
            try:
                data = json.loads(match.group(1))
                if data.get("type") == "modify":
                    self._pending_action = data
            except json.JSONDecodeError:
                pass
