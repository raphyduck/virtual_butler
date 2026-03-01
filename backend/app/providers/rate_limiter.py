"""Centralized rate limiter for Anthropic API calls.

Prevents 429 errors by:
1. Tracking token usage per minute and throttling when approaching limits
2. Automatically retrying on 429 with exponential backoff + retry-after header
3. Estimating token counts before sending to pre-emptively pause

The limiter is shared across all Anthropic provider instances (module-level
singleton) so concurrent requests from butler chat, skill sessions, and the
agent modifier all respect the same budget.
"""

from __future__ import annotations

import asyncio
import logging
import time

logger = logging.getLogger(__name__)

# ── Defaults ─────────────────────────────────────────────────────────────────
# Conservative defaults — well under the 30k input tokens/min org limit.
# These can be overridden via environment variables.

DEFAULT_TPM_LIMIT = 30_000  # tokens per minute (org limit from the error)
DEFAULT_RPM_LIMIT = 50  # requests per minute (Anthropic tier-1 default)
SAFETY_MARGIN = 0.80  # use at most 80% of the limit before throttling
CHARS_PER_TOKEN = 4  # rough estimate for token counting

# Retry settings
MAX_RETRIES = 5
BASE_BACKOFF = 2.0  # seconds — first retry waits at least this long
MAX_BACKOFF = 120.0  # seconds


class RateLimiter:
    """Sliding-window rate limiter for API token and request budgets.

    All timestamps are in seconds (time.monotonic).
    """

    def __init__(
        self,
        tpm_limit: int = DEFAULT_TPM_LIMIT,
        rpm_limit: int = DEFAULT_RPM_LIMIT,
    ) -> None:
        self._tpm_limit = tpm_limit
        self._rpm_limit = rpm_limit
        self._effective_tpm = int(tpm_limit * SAFETY_MARGIN)
        self._effective_rpm = int(rpm_limit * SAFETY_MARGIN)

        # Sliding window entries: list of (timestamp, token_count)
        self._usage: list[tuple[float, int]] = []
        self._request_times: list[float] = []
        self._lock = asyncio.Lock()

    # ── Token estimation ─────────────────────────────────────────────────────

    @staticmethod
    def estimate_tokens(messages: list[dict], system_prompt: str | None = None) -> int:
        """Rough token estimate from message content.

        We intentionally over-estimate to stay safe.  Counts characters / 4
        and adds overhead for message structure.
        """
        total_chars = 0
        for msg in messages:
            content = msg.get("content", "")
            if isinstance(content, str):
                total_chars += len(content)
            elif isinstance(content, list):
                # Tool results, multi-part content
                for part in content:
                    if isinstance(part, dict):
                        total_chars += len(str(part.get("content", "")))
                        total_chars += len(str(part.get("text", "")))
                    elif isinstance(part, str):
                        total_chars += len(part)
                    else:
                        # SDK objects (ContentBlock etc.) — use str() as fallback
                        total_chars += len(str(part))

        if system_prompt:
            total_chars += len(system_prompt)

        # Overhead: ~4 tokens per message for role/structure, plus tool defs
        overhead = len(messages) * 16 + 200
        return (total_chars // CHARS_PER_TOKEN) + overhead

    # ── Window management ────────────────────────────────────────────────────

    def _prune(self, now: float) -> None:
        """Remove entries older than 60 seconds."""
        cutoff = now - 60.0
        self._usage = [(t, n) for t, n in self._usage if t > cutoff]
        self._request_times = [t for t in self._request_times if t > cutoff]

    def _current_tpm(self) -> int:
        return sum(n for _, n in self._usage)

    def _current_rpm(self) -> int:
        return len(self._request_times)

    # ── Public interface ─────────────────────────────────────────────────────

    async def acquire(self, estimated_tokens: int) -> None:
        """Wait until we have budget for `estimated_tokens`.

        This is called BEFORE making an API request.  If the sliding window
        shows we're close to the limit, we sleep until enough old entries
        expire.
        """
        async with self._lock:
            while True:
                now = time.monotonic()
                self._prune(now)

                tokens_used = self._current_tpm()
                requests_used = self._current_rpm()

                tokens_ok = (tokens_used + estimated_tokens) <= self._effective_tpm
                requests_ok = (requests_used + 1) <= self._effective_rpm

                if tokens_ok and requests_ok:
                    # Record this request
                    self._usage.append((now, estimated_tokens))
                    self._request_times.append(now)
                    return

                # Calculate how long to wait
                wait = 0.0
                if not tokens_ok and self._usage:
                    # Wait until enough old tokens expire
                    needed = (tokens_used + estimated_tokens) - self._effective_tpm
                    accumulated = 0
                    for ts, count in self._usage:
                        accumulated += count
                        if accumulated >= needed:
                            wait = max(wait, (ts + 60.0) - now + 0.5)
                            break
                    else:
                        # All entries together aren't enough — wait for full window
                        wait = max(wait, (self._usage[0][0] + 60.0) - now + 0.5)

                if not requests_ok and self._request_times:
                    earliest = self._request_times[0]
                    wait = max(wait, (earliest + 60.0) - now + 0.5)

                wait = max(wait, 1.0)  # always wait at least 1s
                wait = min(wait, 65.0)  # never wait more than ~1 minute

                logger.info(
                    "Rate limiter: throttling %.1fs (tokens: %d/%d, requests: %d/%d, "
                    "estimated: %d tokens)",
                    wait,
                    tokens_used,
                    self._effective_tpm,
                    requests_used,
                    self._effective_rpm,
                    estimated_tokens,
                )

                # Release lock while sleeping so other coroutines aren't blocked
                # from checking (they'll see the same state and also sleep)
                self._lock.release()
                try:
                    await asyncio.sleep(wait)
                finally:
                    await self._lock.acquire()

    def record_actual_usage(self, actual_tokens: int, estimated_tokens: int) -> None:
        """Correct the estimate with actual usage from the API response.

        Called after we get response headers with actual token counts.
        Adjusts the most recent entry in the sliding window.
        """
        if not self._usage:
            return

        # Find and update the entry that was recorded with estimated_tokens
        # (search from the end since it's the most recent)
        for i in range(len(self._usage) - 1, -1, -1):
            ts, count = self._usage[i]
            if count == estimated_tokens:
                self._usage[i] = (ts, actual_tokens)
                break


# ── Module-level singleton ───────────────────────────────────────────────────

_limiter: RateLimiter | None = None
_limiter_lock = asyncio.Lock()


async def get_rate_limiter() -> RateLimiter:
    """Return the shared rate limiter instance (created on first call)."""
    global _limiter
    if _limiter is not None:
        return _limiter

    async with _limiter_lock:
        if _limiter is None:
            import os

            tpm = int(os.getenv("ANTHROPIC_TPM_LIMIT", str(DEFAULT_TPM_LIMIT)))
            rpm = int(os.getenv("ANTHROPIC_RPM_LIMIT", str(DEFAULT_RPM_LIMIT)))
            _limiter = RateLimiter(tpm_limit=tpm, rpm_limit=rpm)
            logger.info(
                "Rate limiter initialized: TPM=%d (effective=%d), RPM=%d (effective=%d)",
                tpm,
                int(tpm * SAFETY_MARGIN),
                rpm,
                int(rpm * SAFETY_MARGIN),
            )

    return _limiter
