from app.providers.rate_limiter import RateLimiter
from app.skills.agent_modifier import _fit_messages_to_budget


def test_rate_limiter_exposes_effective_token_budget() -> None:
    limiter = RateLimiter(tpm_limit=30_000, rpm_limit=50)

    assert limiter.max_input_tokens == 22_500


def test_fit_messages_to_budget_drops_old_large_tool_results() -> None:
    limiter = RateLimiter(tpm_limit=30_000, rpm_limit=50)
    messages = [
        {"role": "user", "content": "Instruction: review the repo"},
        {
            "role": "user",
            "content": [{"type": "tool_result", "tool_use_id": "1", "content": "x" * 90_000}],
        },
        {"role": "assistant", "content": [{"type": "text", "text": "ok"}]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "2", "content": "short"}]},
    ]
    original_len = len(messages)

    fitted, estimated = _fit_messages_to_budget(messages, limiter)

    assert estimated <= limiter.max_input_tokens
    assert len(fitted) < original_len
    assert fitted[0] == messages[0]
    assert fitted[-1] == messages[-1]
