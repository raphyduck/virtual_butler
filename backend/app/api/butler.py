"""REST endpoints for butler chat history.

GET  /butler/conversations           — list conversations for the current user
GET  /butler/conversations/latest    — get messages from the latest conversation
GET  /butler/conversations/{id}      — get a specific conversation with messages
POST /butler/conversations           — create a new empty conversation
"""

import os
import uuid

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.app_setting import get_effective_setting
from app.models.conversation import Conversation
from app.models.user import User

router = APIRouter(prefix="/butler", tags=["butler"])


class ButlerMessageOut(BaseModel):
    id: str
    role: str
    content: str
    created_at: str


class ConversationOut(BaseModel):
    id: str
    created_at: str
    updated_at: str
    provider: str | None
    model: str | None
    messages: list[ButlerMessageOut]


class ConversationSummaryOut(BaseModel):
    id: str
    created_at: str
    updated_at: str
    provider: str | None
    model: str | None
    preview: str | None  # First message content, truncated to 100 chars


class ConversationCreateIn(BaseModel):
    provider: str | None = None
    model: str | None = None


def _preview_text(conv: Conversation) -> str | None:
    """Pick a meaningful preview, avoiding empty placeholder-like content."""
    for message in conv.butler_messages:
        text = message.content.strip()
        if text and text.lower() not in {"empty", "(empty)"}:
            return text[:100]
    return None


def _conv_out(conv: Conversation) -> ConversationOut:
    return ConversationOut(
        id=str(conv.id),
        created_at=conv.created_at.isoformat(),
        updated_at=conv.updated_at.isoformat(),
        provider=conv.provider,
        model=conv.model,
        messages=[
            ButlerMessageOut(
                id=str(m.id),
                role=m.role,
                content=m.content,
                created_at=m.created_at.isoformat(),
            )
            for m in conv.butler_messages
        ],
    )


@router.get("/conversations", response_model=list[ConversationSummaryOut])
async def list_conversations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all conversations for the current user, newest first, with a preview."""
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == user.id)
        .options(selectinload(Conversation.butler_messages))
        .order_by(Conversation.updated_at.desc())
    )
    conversations = result.scalars().all()
    return [
        ConversationSummaryOut(
            id=str(conv.id),
            created_at=conv.created_at.isoformat(),
            updated_at=conv.updated_at.isoformat(),
            provider=conv.provider,
            model=conv.model,
            preview=_preview_text(conv),
        )
        for conv in conversations
    ]


@router.post("/conversations", response_model=ConversationOut)
async def create_conversation(
    body: ConversationCreateIn = Body(default_factory=ConversationCreateIn),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new empty conversation and return it."""
    provider = body.provider or (
        await get_effective_setting(db, "butler_provider", os.getenv("BUTLER_PROVIDER", "anthropic"))
    )
    model = body.model or (
        await get_effective_setting(db, "butler_model", os.getenv("BUTLER_MODEL", "claude-sonnet-4-6"))
    )
    conv = Conversation(user_id=user.id, provider=provider, model=model)
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return ConversationOut(
        id=str(conv.id),
        created_at=conv.created_at.isoformat(),
        updated_at=conv.updated_at.isoformat(),
        provider=conv.provider,
        model=conv.model,
        messages=[],
    )


@router.get("/conversations/latest", response_model=ConversationOut | None)
async def get_latest_conversation(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the most recent conversation with all its messages, or null if none."""
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == user.id)
        .options(selectinload(Conversation.butler_messages))
        .order_by(Conversation.updated_at.desc())
        .limit(1)
    )
    conv = result.scalar_one_or_none()
    if conv is None:
        return None
    return _conv_out(conv)


@router.get("/conversations/{conversation_id}", response_model=ConversationOut)
async def get_conversation(
    conversation_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a specific conversation with all its messages."""
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid conversation ID")

    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conv_uuid)
        .where(Conversation.user_id == user.id)
        .options(selectinload(Conversation.butler_messages))
    )
    conv = result.scalar_one_or_none()
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return _conv_out(conv)
