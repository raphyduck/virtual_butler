from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from app.providers.base import BaseProvider, ChatMessage, ProviderConfig


class OpenAIProvider(BaseProvider):
    def __init__(self, config: ProviderConfig) -> None:
        super().__init__(config)
        self._client = AsyncOpenAI(api_key=config.api_key)

    def _to_sdk_messages(self, messages: list[ChatMessage], system_prompt: str | None) -> list[dict]:
        result: list[dict] = []
        if system_prompt:
            result.append({"role": "system", "content": system_prompt})
        result.extend({"role": m.role, "content": m.content} for m in messages)
        return result

    async def stream(
        self,
        messages: list[ChatMessage],
        system_prompt: str | None = None,
    ) -> AsyncIterator[str]:
        stream = await self._client.chat.completions.create(
            model=self.config.model,
            messages=self._to_sdk_messages(messages, system_prompt),
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    async def complete(
        self,
        messages: list[ChatMessage],
        system_prompt: str | None = None,
    ) -> str:
        response = await self._client.chat.completions.create(
            model=self.config.model,
            messages=self._to_sdk_messages(messages, system_prompt),
            stream=False,
        )
        return response.choices[0].message.content or ""
