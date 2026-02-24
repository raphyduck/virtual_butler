from pydantic import BaseModel, EmailStr


class SetupStatus(BaseModel):
    setup_required: bool


class SettingsUpdate(BaseModel):
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    google_api_key: str | None = None
    github_client_id: str | None = None
    github_client_secret: str | None = None
    github_callback_url: str | None = None
    github_repo_owner: str | None = None
    github_repo_name: str | None = None


class SettingsResponse(BaseModel):
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    google_api_key: str | None = None
    github_client_id: str | None = None
    github_client_secret: str | None = None  # masked when set
    github_callback_url: str | None = None
    github_repo_owner: str | None = None
    github_repo_name: str | None = None


class SetupRequest(BaseModel):
    email: EmailStr
    password: str
    settings: SettingsUpdate | None = None
