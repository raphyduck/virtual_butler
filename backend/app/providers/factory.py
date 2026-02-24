import json
import os

from app.providers.base import BaseProvider, ProviderConfig

_ENV_KEYS = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "google": "GOOGLE_API_KEY",
}


def get_provider(provider_name: str, model: str, provider_config_json: str | None = None) -> BaseProvider:
    """Instantiate the correct provider adapter.

    API keys are resolved in this order:
    1. provider_config JSON field on the Ability (per-ability override)
    2. Environment variable (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY)
    """
    extra_cfg: dict = json.loads(provider_config_json) if provider_config_json else {}

    api_key: str | None = extra_cfg.pop("api_key", None) or os.getenv(_ENV_KEYS.get(provider_name, ""))
    base_url: str | None = extra_cfg.pop("base_url", None)

    config = ProviderConfig(model=model, api_key=api_key, base_url=base_url, extra=extra_cfg)

    match provider_name:
        case "anthropic":
            from app.providers.anthropic import AnthropicProvider
            return AnthropicProvider(config)
        case "openai":
            from app.providers.openai import OpenAIProvider
            return OpenAIProvider(config)
        case "google":
            from app.providers.google import GoogleProvider
            return GoogleProvider(config)
        case "ollama":
            from app.providers.ollama import OllamaProvider
            return OllamaProvider(config)
        case _:
            raise ValueError(f"Unknown provider: {provider_name!r}")
