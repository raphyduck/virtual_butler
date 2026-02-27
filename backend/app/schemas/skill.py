import uuid
from datetime import datetime

from pydantic import BaseModel


class SkillCreate(BaseModel):
    name: str
    description: str | None = None
    provider: str
    model: str
    system_prompt: str | None = None
    deliverable_type: str
    target_type: str
    target_config: str | None = None  # JSON string
    provider_config: str | None = None  # JSON: {"api_key": "...", "base_url": "..."}


class SkillUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    provider: str | None = None
    model: str | None = None
    system_prompt: str | None = None
    deliverable_type: str | None = None
    target_type: str | None = None
    target_config: str | None = None
    provider_config: str | None = None


class SkillResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    description: str | None
    provider: str
    model: str
    system_prompt: str | None
    deliverable_type: str
    target_type: str
    target_config: str | None
    provider_config: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SessionCreate(BaseModel):
    pass  # no body needed — skill_id comes from URL


class SessionResponse(BaseModel):
    id: uuid.UUID
    skill_id: uuid.UUID
    user_id: uuid.UUID
    status: str
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DeliverableResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    deliverable_type: str
    url: str | None
    metadata_json: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
