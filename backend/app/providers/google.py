from collections.abc import AsyncIterator

import google.generativeai as genai

from app.providers.base import BaseProvider, ChatMessage, ProviderConfig


class GoogleProvider(BaseProvider):
    def __init__(self, config: ProviderConfig) -> None:
        super().__init__(config)
        genai.configure(api_key=config.api_key)
        self._model = genai.GenerativeModel(
            model_name=config.model,
            system_instruction=None,  # set per-call via start_chat
        )

    def _to_sdk_history(self, messages: list[ChatMessage]) -> list[dict]:
        # Google SDK uses "user"/"model" roles and the last message must be user
        history = []
        for m in messages[:-1]:
            role = "model" if m.role == "assistant" else "user"
            history.append({"role": role, "parts": [m.content]})
        return history

    async def stream(
        self,
        messages: list[ChatMessage],
        system_prompt: str | None = None,
    ) -> AsyncIterator[str]:
        model = genai.GenerativeModel(
            model_name=self.config.model,
            system_instruction=system_prompt,
        )
        chat = model.start_chat(history=self._to_sdk_history(messages))
        last_content = messages[-1].content if messages else ""

        response = await chat.send_message_async(last_content, stream=True)
        async for chunk in response:
            yield chunk.text

    async def complete(
        self,
        messages: list[ChatMessage],
        system_prompt: str | None = None,
    ) -> str:
        model = genai.GenerativeModel(
            model_name=self.config.model,
            system_instruction=system_prompt,
        )
        chat = model.start_chat(history=self._to_sdk_history(messages))
        last_content = messages[-1].content if messages else ""
        response = await chat.send_message_async(last_content)
        return response.text
