import asyncio
import logging
from collections.abc import AsyncIterator

import anthropic

from app.providers.base import BaseProvider, ChatMessage, ProviderConfig
from app.providers.rate_limiter import (
    BASE_BACKOFF,
    MAX_BACKOFF,
    MAX_RETRIES,
    get_rate_limiter,
)

logger = logging.getLogger(__name__)


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

        limiter = await get_rate_limiter()
        estimated = limiter.estimate_tokens(kwargs["messages"], system_prompt)

        for attempt in range(MAX_RETRIES + 1):
            await limiter.acquire(estimated)
            try:
                async with self._client.messages.stream(**kwargs) as stream:
                    async for text in stream.text_stream:
                        yield text

                    # Update with actual usage from response
                    response = await stream.get_final_message()
                    if response and response.usage:
                        limiter.record_actual_usage(
                            response.usage.input_tokens, estimated
                        )
                return  # success
            except anthropic.RateLimitError as exc:
                if attempt == MAX_RETRIES:
                    raise

                retry_after = _parse_retry_after(exc)
                backoff = max(retry_after, BASE_BACKOFF * (2**attempt))
                backoff = min(backoff, MAX_BACKOFF)

                logger.warning(
                    "Anthropic 429 on stream (attempt %d/%d), retrying in %.1fs",
                    attempt + 1,
                    MAX_RETRIES,
                    backoff,
                )
                await asyncio.sleep(backoff)

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

        limiter = await get_rate_limiter()
        estimated = limiter.estimate_tokens(kwargs["messages"], system_prompt)

        for attempt in range(MAX_RETRIES + 1):
            await limiter.acquire(estimated)
            try:
                response = await self._client.messages.create(**kwargs)

                # Update with actual usage
                if response.usage:
                    limiter.record_actual_usage(
                        response.usage.input_tokens, estimated
                    )

                return response.content[0].text
            except anthropic.RateLimitError as exc:
                if attempt == MAX_RETRIES:
                    raise

                retry_after = _parse_retry_after(exc)
                backoff = max(retry_after, BASE_BACKOFF * (2**attempt))
                backoff = min(backoff, MAX_BACKOFF)

                logger.warning(
                    "Anthropic 429 on complete (attempt %d/%d), retrying in %.1fs",
                    attempt + 1,
                    MAX_RETRIES,
                    backoff,
                )
                await asyncio.sleep(backoff)

        # Should not reach here, but satisfy type checker
        raise RuntimeError("Exhausted retries")


def _parse_retry_after(exc: anthropic.RateLimitError) -> float:
    """Extract retry-after seconds from the exception's response headers."""
    try:
        if exc.response and exc.response.headers:
            val = exc.response.headers.get("retry-after")
            if val:
                return float(val)
    except (AttributeError, ValueError, TypeError):
        pass
    return 0.0
