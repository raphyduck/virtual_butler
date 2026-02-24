from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Database
    database_url: str = "postgresql+asyncpg://butler:butler_secret@db:5432/virtual_butler"

    # Redis
    redis_url: str = "redis://redis:6379"

    # JWT
    secret_key: str = "change_me_in_production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # App
    app_name: str = "Virtual Butler"
    debug: bool = False

    # GitHub OAuth (self-modification feature)
    github_client_id: str = ""
    github_client_secret: str = ""
    github_callback_url: str = "http://localhost:3000/github/callback"
    github_repo_owner: str = ""  # e.g. "raphyduck"
    github_repo_name: str = "virtual_butler"

    # Self-modification: path to the repository root accessible by the backend process
    repo_root: str = "/repo"


settings = Settings()
