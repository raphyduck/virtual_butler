from __future__ import annotations

from pydantic import BaseModel


class ProviderEntry(BaseModel):
    provider: str
    models: list[str]


CATALOG: tuple[ProviderEntry, ...] = (
    ProviderEntry(provider="anthropic", models=["claude-sonnet-4-6", "claude-3-5-haiku-latest"]),
    ProviderEntry(provider="openai", models=["gpt-4.1", "gpt-4.1-mini", "gpt-4o-mini"]),
    ProviderEntry(provider="google", models=["gemini-2.5-pro", "gemini-2.5-flash"]),
    ProviderEntry(provider="ollama", models=["llama3.1", "qwen2.5", "mistral"]),
)


def provider_catalog() -> list[ProviderEntry]:
    return [entry.model_copy(deep=True) for entry in CATALOG]


def provider_names() -> list[str]:
    return [entry.provider for entry in CATALOG]


def default_model_for(provider: str, fallback: str = "claude-sonnet-4-6") -> str:
    for entry in CATALOG:
        if entry.provider == provider and entry.models:
            return entry.models[0]
    return fallback
