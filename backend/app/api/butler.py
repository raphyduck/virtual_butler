"""REST endpoints for butler chat history.

GET /butler/conversations          — list conversations for the current user
GET /butler/conversations/latest   — get messages from the latest conversation
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import get_current_user
from app.database import get_db
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
    messages: list[ButlerMessageOut]


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

    return ConversationOut(
        id=str(conv.id),
        created_at=conv.created_at.isoformat(),
        updated_at=conv.updated_at.isoformat(),
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
