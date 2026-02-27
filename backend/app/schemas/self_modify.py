from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class FileChangeOut(BaseModel):
    path: str
    action: str  # "create" | "modify" | "delete"
    content: str | None = None


class PlanOut(BaseModel):
    changes: list[FileChangeOut]
    commit_message: str


class ModifyRequest(BaseModel):
    instruction: str
    provider: str = "anthropic"
    model: str = "claude-sonnet-4-6"
    provider_config_json: str | None = None


class JobStatusResponse(BaseModel):
    id: uuid.UUID
    status: str
    mode: str
    instruction: str
    provider: str
    model: str
    plan: PlanOut | None = None
    error: str | None = None
    commit_sha: str | None = None
    pr_url: str | None = None
    pr_number: int | None = None
    created_at: datetime
    completed_at: datetime | None = None


class GithubAuthorizeResponse(BaseModel):
    url: str
    state: str


class GithubExchangeRequest(BaseModel):
    code: str
    state: str


class GithubStatusResponse(BaseModel):
    connected: bool
    login: str | None = None
    is_repo_owner: bool = False
