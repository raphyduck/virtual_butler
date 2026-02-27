"""Butler conversation REST API.

GET    /api/v1/conversations              — list user's conversations
POST   /api/v1/conversations              — create a new conversation
GET    /api/v1/conversations/{id}         — get conversation detail
DELETE /api/v1/conversations/{id}         — delete a conversation
GET    /api/v1/conversations/{id}/messages — list messages in a conversation
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.conversation import ButlerMessage, Conversation
from app.models.user import User

router = APIRouter(prefix="/conversations", tags=["conversations"])


# ── Schemas ──────────────────────────────────────────────────────────────────


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str | None
    created_at: str
    updated_at: str


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: str
    content: str
    created_at: str


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("", response_model=list[ConversationOut])
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Conversation]:
    result = await db.execute(
        select(Conversation).where(Conversation.user_id == current_user.id).order_by(Conversation.updated_at.desc())
    )
    return list(result.scalars().all())


@router.post("", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Conversation:
    conv = Conversation(user_id=current_user.id)
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return conv


@router.get("/{conversation_id}", response_model=ConversationOut)
async def get_conversation(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Conversation:
    return await _get_owned_conversation(conversation_id, current_user.id, db)


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    conv = await _get_owned_conversation(conversation_id, current_user.id, db)
    await db.delete(conv)
    await db.commit()


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
async def list_messages(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ButlerMessage]:
    await _get_owned_conversation(conversation_id, current_user.id, db)
    result = await db.execute(
        select(ButlerMessage).where(ButlerMessage.conversation_id == conversation_id).order_by(ButlerMessage.created_at)
    )
    return list(result.scalars().all())


# ── Helpers ──────────────────────────────────────────────────────────────────


async def _get_owned_conversation(conversation_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Conversation:
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id)
    )
    conv = result.scalar_one_or_none()
    if conv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return conv
