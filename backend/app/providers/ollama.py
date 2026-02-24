from collections.abc import AsyncIterator

import httpx

from app.providers.base import BaseProvider, ChatMessage, ProviderConfig

_DEFAULT_BASE_URL = "http://localhost:11434"


class OllamaProvider(BaseProvider):
    """Adapter for locally-running Ollama instances (OpenAI-compatible API)."""

    def __init__(self, config: ProviderConfig) -> None:
        super().__init__(config)
        base_url = (config.base_url or _DEFAULT_BASE_URL).rstrip("/")
        self._chat_url = f"{base_url}/api/chat"

    def _build_payload(self, messages: list[ChatMessage], system_prompt: str | None, stream: bool) -> dict:
        sdk_messages: list[dict] = []
        if system_prompt:
            sdk_messages.append({"role": "system", "content": system_prompt})
        sdk_messages.extend({"role": m.role, "content": m.content} for m in messages)
        return {"model": self.config.model, "messages": sdk_messages, "stream": stream}

    async def stream(
        self,
        messages: list[ChatMessage],
        system_prompt: str | None = None,
    ) -> AsyncIterator[str]:
        import json

        payload = self._build_payload(messages, system_prompt, stream=True)
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream("POST", self._chat_url, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    data = json.loads(line)
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content
                    if data.get("done"):
                        break

    async def complete(
        self,
        messages: list[ChatMessage],
        system_prompt: str | None = None,
    ) -> str:
        payload = self._build_payload(messages, system_prompt, stream=False)
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(self._chat_url, json=payload)
            response.raise_for_status()
            return response.json()["message"]["content"]
