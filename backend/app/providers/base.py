from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field


@dataclass
class ChatMessage:
    role: str  # "user" | "assistant"
    content: str


@dataclass
class ProviderConfig:
    model: str
    api_key: str | None = None
    base_url: str | None = None  # used by Ollama
    extra: dict = field(default_factory=dict)


class BaseProvider(ABC):
    """Common interface for all AI provider adapters."""

    def __init__(self, config: ProviderConfig) -> None:
        self.config = config

    @abstractmethod
    async def stream(
        self,
        messages: list[ChatMessage],
        system_prompt: str | None = None,
    ) -> AsyncIterator[str]:
        """Yield text chunks as the model streams its response."""
        ...  # pragma: no cover

    @abstractmethod
    async def complete(
        self,
        messages: list[ChatMessage],
        system_prompt: str | None = None,
    ) -> str:
        """Return the full response as a single string (non-streaming)."""
        ...  # pragma: no cover
