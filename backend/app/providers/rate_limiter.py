"""Centralized rate limiter for Anthropic API calls.

Prevents 429 errors by:
1. Tracking *actual* token usage per minute with a sliding window
2. Pre-emptively pausing when the next request would exceed the budget
3. Automatically retrying on 429 with exponential backoff + retry-after header
4. Parsing the actual input_tokens from every API response to keep the window
   accurate (estimated counts are only used as a fallback)

The limiter is shared across all Anthropic provider instances (module-level
singleton) so concurrent requests from butler chat, skill sessions, and the
agent modifier all respect the same budget.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time

logger = logging.getLogger(__name__)

# ── Defaults ─────────────────────────────────────────────────────────────────
# Conservative defaults — well under the 30k input tokens/min org limit.
# These can be overridden via environment variables.

DEFAULT_TPM_LIMIT = 30_000  # tokens per minute (org limit from the error)
DEFAULT_RPM_LIMIT = 50  # requests per minute (Anthropic tier-1 default)
SAFETY_MARGIN = 0.75  # use at most 75% of the limit before throttling
CHARS_PER_TOKEN = 4  # rough estimate for token counting

# Retry settings
MAX_RETRIES = 5
BASE_BACKOFF = 2.0  # seconds — first retry waits at least this long
MAX_BACKOFF = 120.0  # seconds


class RateLimiter:
    """Sliding-window rate limiter for API token and request budgets.

    All timestamps are in seconds (time.monotonic).

    Key design decisions:
    - Usage is recorded with *estimated* tokens before the call, then corrected
      to *actual* tokens once the API responds.  Each entry has a unique id so
      the correction is reliable even when two requests have the same estimate.
    - If a request fails (429 or otherwise), its entry is removed so it doesn't
      consume phantom budget.
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

        # Sliding window entries: list of (timestamp, token_count, entry_id)
        self._usage: list[tuple[float, int, int]] = []
        self._request_times: list[float] = []
        self._lock = asyncio.Lock()
        self._next_id = 0

    # ── Token estimation ─────────────────────────────────────────────────────

    @staticmethod
    def estimate_tokens(
        messages: list[dict],
        system_prompt: str | None = None,
        tools: list[dict] | None = None,
    ) -> int:
        """Rough token estimate from message content.

        We intentionally over-estimate to stay safe.  Counts characters / 4
        and adds overhead for message structure and tool definitions.
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
                        # Serialize dict parts to capture all nested content
                        total_chars += len(json.dumps(part, default=str))
                    elif isinstance(part, str):
                        total_chars += len(part)
                    else:
                        # SDK objects (ContentBlock etc.) — use str() as fallback
                        total_chars += len(str(part))

        if system_prompt:
            total_chars += len(system_prompt)

        # Count tool definition tokens (these are sent with every request)
        if tools:
            total_chars += len(json.dumps(tools, default=str))

        # Overhead: ~4 tokens per message for role/structure
        overhead = len(messages) * 16 + 200
        return (total_chars // CHARS_PER_TOKEN) + overhead

    # ── Window management ────────────────────────────────────────────────────

    def _prune(self, now: float) -> None:
        """Remove entries older than 60 seconds."""
        cutoff = now - 60.0
        self._usage = [(t, n, eid) for t, n, eid in self._usage if t > cutoff]
        self._request_times = [t for t in self._request_times if t > cutoff]

    def _current_tpm(self) -> int:
        return sum(n for _, n, _ in self._usage)

    def _current_rpm(self) -> int:
        return len(self._request_times)

    @property
    def max_input_tokens(self) -> int:
        return self._effective_tpm

    # ── Public interface ─────────────────────────────────────────────────────

    async def acquire(self, estimated_tokens: int) -> int:
        """Wait until we have budget for ``estimated_tokens``.

        This is called BEFORE making an API request.  If the sliding window
        shows we're close to the limit, we sleep until enough old entries
        expire.

        Returns a unique entry id that can be used with ``record_actual_usage``
        or ``remove_entry`` to correct/remove the recorded estimate.
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
                    entry_id = self._next_id
                    self._next_id += 1
                    self._usage.append((now, estimated_tokens, entry_id))
                    self._request_times.append(now)
                    logger.debug(
                        "Rate limiter: acquired %d tokens (total %d/%d, requests %d/%d, entry=%d)",
                        estimated_tokens,
                        tokens_used + estimated_tokens,
                        self._effective_tpm,
                        requests_used + 1,
                        self._effective_rpm,
                        entry_id,
                    )
                    return entry_id

                # Calculate how long to wait
                wait = self._calculate_wait(tokens_used, estimated_tokens, tokens_ok, requests_ok, now)
                wait = max(wait, 1.0)  # always wait at least 1s
                wait = min(wait, 65.0)  # never wait more than ~1 minute

                logger.info(
                    "Rate limiter: throttling %.1fs (tokens: %d/%d, requests: %d/%d, need: %d tokens)",
                    wait,
                    tokens_used,
                    self._effective_tpm,
                    requests_used,
                    self._effective_rpm,
                    estimated_tokens,
                )

                # Release lock while sleeping so other coroutines aren't blocked
                self._lock.release()
                try:
                    await asyncio.sleep(wait)
                finally:
                    await self._lock.acquire()

    def _calculate_wait(
        self,
        tokens_used: int,
        estimated_tokens: int,
        tokens_ok: bool,
        requests_ok: bool,
        now: float,
    ) -> float:
        """Determine how long to sleep before retrying acquire."""
        wait = 0.0
        if not tokens_ok and self._usage:
            # Wait until enough old tokens expire
            needed = (tokens_used + estimated_tokens) - self._effective_tpm
            accumulated = 0
            for ts, count, _ in self._usage:
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

        return wait

    def record_actual_usage(self, actual_tokens: int, entry_id: int) -> None:
        """Correct the estimate with actual usage from the API response.

        Called after we get response headers with actual token counts.
        Uses the unique entry_id from ``acquire`` for reliable matching.
        """
        for i, (ts, _count, eid) in enumerate(self._usage):
            if eid == entry_id:
                self._usage[i] = (ts, actual_tokens, eid)
                logger.debug(
                    "Rate limiter: corrected entry %d to %d actual tokens",
                    entry_id,
                    actual_tokens,
                )
                return

    def remove_entry(self, entry_id: int) -> None:
        """Remove a recorded entry (e.g. when a request fails).

        This prevents failed requests from consuming phantom budget.
        """
        self._usage = [(t, n, eid) for t, n, eid in self._usage if eid != entry_id]
        logger.debug("Rate limiter: removed entry %d (request failed)", entry_id)


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
