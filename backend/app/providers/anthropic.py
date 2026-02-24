from collections.abc import AsyncIterator

import anthropic

from app.providers.base import BaseProvider, ChatMessage, ProviderConfig


class AnthropicProvider(BaseProvider):
    def __init__(self, config: ProviderConfig) -> None:
        super().__init__(config)
        self._client = anthropic.AsyncAnthropic(api_key=config.api_key)

    def _to_sdk_messages(self, messages: list[ChatMessage]) -> list[dict]:
        return [{"role": m.role, "content": m.content} for m in messages]

    async def stream(
        self,
        messages: list[ChatMessage],
        system_prompt: str | None = None,
    ) -> AsyncIterator[str]:
        kwargs: dict = {
            "model": self.config.model,
            "max_tokens": self.config.extra.get("max_tokens", 8096),
            "messages": self._to_sdk_messages(messages),
        }
        if system_prompt:
            kwargs["system"] = system_prompt

        async with self._client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text

    async def complete(
        self,
        messages: list[ChatMessage],
        system_prompt: str | None = None,
    ) -> str:
        kwargs: dict = {
            "model": self.config.model,
            "max_tokens": self.config.extra.get("max_tokens", 8096),
            "messages": self._to_sdk_messages(messages),
        }
        if system_prompt:
            kwargs["system"] = system_prompt

        response = await self._client.messages.create(**kwargs)
        return response.content[0].text
