"""Agentic code modifier — uses Anthropic tool-use to explore the codebase and plan changes.

Unlike CodeModifier (single-shot JSON plan), this runs an iterative agent loop:
  1. The AI reads files and searches the codebase using tool calls
  2. It records each planned file change via plan_change()
  3. It calls finish() when satisfied

The resulting ModificationPlan is identical to CodeModifier's output and is
fully compatible with the existing _bg_apply / CodeModifier.apply() pipeline.
"""

from __future__ import annotations

import asyncio
import logging
import subprocess
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path

import anthropic

from app.config import settings
from app.providers.rate_limiter import (
    BASE_BACKOFF,
    MAX_BACKOFF,
    MAX_RETRIES,
    get_rate_limiter,
)
from app.skills.code_modifier import FileChange, ModificationPlan

logger = logging.getLogger(__name__)

# ── Step type ─────────────────────────────────────────────────────────────────


@dataclass
class AgentStep:
    tool: str
    label: str
    status: str = "ok"  # "ok" | "error"


# ── Prompts & tool definitions ────────────────────────────────────────────────

_SYSTEM = """\
You are an expert software engineer embedded in the Personal Assistant platform.
Your task: explore the repository and plan the minimal set of file changes
needed to fulfill the user's instruction.

Use the available tools to read files and search the codebase.

## Recording changes
- Use `edit_file` for targeted edits to existing files (find-and-replace a unique
  string). This is preferred for small changes — no need to rewrite the whole file.
- Use `plan_change` to create new files or completely rewrite an existing one.
  For modify/create actions, `content` must be the complete new file content.

When satisfied with your plan, call `finish`.

Rules
- Keep changes minimal and focused on the instruction
- Always read a file (or search its content) before modifying it
- Do NOT touch files unrelated to the instruction
- Make `old_string` in edit_file unique — add surrounding context if needed
"""

_TOOLS: list[dict] = [
    {
        "name": "list_files",
        "description": "List all files tracked by git, optionally filtered by a substring.",
        "input_schema": {
            "type": "object",
            "properties": {
                "filter": {
                    "type": "string",
                    "description": "Optional substring to filter paths (case-insensitive).",
                }
            },
            "required": [],
        },
    },
    {
        "name": "read_file",
        "description": "Read the full contents of a file relative to the repository root.",
        "input_schema": {
            "type": "object",
            "properties": {"path": {"type": "string", "description": "Path relative to the repo root"}},
            "required": ["path"],
        },
    },
    {
        "name": "search_code",
        "description": "Grep for a pattern across the codebase.",
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "Basic regex / literal pattern"},
                "path": {
                    "type": "string",
                    "description": "Optional subdirectory or file to search in.",
                },
            },
            "required": ["pattern"],
        },
    },
    {
        "name": "edit_file",
        "description": (
            "Apply a precise find-and-replace to a file. "
            "Preferred over plan_change for small targeted edits to existing files. "
            "old_string must occur exactly once — add surrounding context to ensure uniqueness."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path relative to repo root"},
                "old_string": {
                    "type": "string",
                    "description": "Exact string to replace (must occur exactly once in the file)",
                },
                "new_string": {"type": "string", "description": "Replacement string"},
            },
            "required": ["path", "old_string", "new_string"],
        },
    },
    {
        "name": "plan_change",
        "description": "Record a file change to be applied after user confirmation.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path relative to repo root"},
                "action": {
                    "type": "string",
                    "enum": ["create", "modify", "delete"],
                },
                "content": {
                    "type": "string",
                    "description": "Complete new file content (omit for delete)",
                },
            },
            "required": ["path", "action"],
        },
    },
    {
        "name": "finish",
        "description": "Signal that the plan is complete.",
        "input_schema": {
            "type": "object",
            "properties": {
                "commit_message": {
                    "type": "string",
                    "description": "Conventional-commits style commit message",
                }
            },
            "required": ["commit_message"],
        },
    },
]

_MAX_ITER = 30
_READ_LIMIT = 25_000
_SEARCH_LIMIT = 5_000
_LIST_LIMIT = 600  # max lines in file listing


# ── Modifier ──────────────────────────────────────────────────────────────────


class AgentModifier:
    """Agentic planner that uses Anthropic tool-use to explore and plan changes."""

    def __init__(self, repo_root: str | None = None, api_key: str | None = None) -> None:
        self.repo_root = Path(repo_root or settings.repo_root).resolve()
        self._client = anthropic.AsyncAnthropic(api_key=api_key)

    # ── Tool implementations ──────────────────────────────────────────────────

    def _list_files(self, filter_: str | None = None) -> str:
        result = subprocess.run(
            ["git", "ls-files"],
            cwd=self.repo_root,
            capture_output=True,
            text=True,
        )
        lines = result.stdout.splitlines()
        if filter_:
            lines = [ln for ln in lines if filter_.lower() in ln.lower()]
        return "\n".join(lines[:_LIST_LIMIT]) or "(no files)"

    def _read_file(self, path: str) -> str:
        try:
            content = (self.repo_root / path).read_text(encoding="utf-8", errors="replace")
            return content[:_READ_LIMIT]
        except Exception as exc:
            return f"Error reading {path}: {exc}"

    def _edit_file(self, path: str, old_string: str, new_string: str, planned: list) -> str:
        """Find-and-replace in a file (or a previously planned version of it)."""
        existing = next(
            (c for c in planned if c.path == path and c.action in ("create", "modify") and c.content is not None),
            None,
        )
        base = existing.content if existing else self._read_file(path)
        if base.startswith("Error reading"):
            return base
        count = base.count(old_string)
        if count == 0:
            return f"Error: old_string not found in {path}"
        if count > 1:
            return f"Error: old_string appears {count} times in {path} — add more context to make it unique"
        patched = base.replace(old_string, new_string, 1)
        if existing:
            existing.content = patched
            return f"Edited {path} (patch applied to planned content)"
        planned.append(FileChange(path=path, action="modify", content=patched))
        return f"Recorded: modify {path} (via targeted edit)"

    def _search_code(self, pattern: str, path: str | None = None) -> str:
        target = str(self.repo_root / path) if path else str(self.repo_root)
        try:
            result = subprocess.run(
                ["grep", "-r", "-n", pattern, target],
                capture_output=True,
                text=True,
                timeout=10,
            )
            out = result.stdout[:_SEARCH_LIMIT]
            return out or "(no matches)"
        except Exception as exc:
            return f"Error: {exc}"

    def _run_tool(
        self,
        name: str,
        inp: dict,
        planned: list[FileChange],
    ) -> tuple[str, bool]:
        """Execute one tool call. Returns (result_text, should_finish)."""
        match name:
            case "list_files":
                return self._list_files(inp.get("filter")), False
            case "read_file":
                return self._read_file(inp.get("path", "")), False
            case "search_code":
                return self._search_code(inp.get("pattern", ""), inp.get("path")), False
            case "edit_file":
                return self._edit_file(inp["path"], inp["old_string"], inp["new_string"], planned), False
            case "plan_change":
                planned.append(
                    FileChange(
                        path=inp["path"],
                        action=inp["action"],
                        content=inp.get("content"),
                    )
                )
                return f"Recorded: {inp['action']} {inp['path']}", False
            case "finish":
                return "done", True
            case _:
                return f"Unknown tool: {name}", False

    # ── API call with retry ──────────────────────────────────────────────────

    async def _api_call_with_retry(
        self,
        limiter,
        estimated_tokens: int,
        model: str,
        messages: list[dict],
    ):
        """Make an Anthropic API call with rate limiting and retry on 429."""
        for attempt in range(MAX_RETRIES + 1):
            await limiter.acquire(estimated_tokens)
            try:
                response = await self._client.messages.create(
                    model=model,
                    max_tokens=8096,
                    system=_SYSTEM,
                    tools=_TOOLS,
                    messages=messages,
                )

                # Update limiter with actual usage
                if response.usage:
                    limiter.record_actual_usage(
                        response.usage.input_tokens, estimated_tokens
                    )

                return response
            except anthropic.RateLimitError as exc:
                if attempt == MAX_RETRIES:
                    raise

                retry_after = _parse_retry_after(exc)
                backoff = max(retry_after, BASE_BACKOFF * (2**attempt))
                backoff = min(backoff, MAX_BACKOFF)

                logger.warning(
                    "Anthropic 429 in agent loop (attempt %d/%d, iter tokens ~%d), "
                    "retrying in %.1fs",
                    attempt + 1,
                    MAX_RETRIES,
                    estimated_tokens,
                    backoff,
                )
                await asyncio.sleep(backoff)

        raise RuntimeError("Exhausted retries")

    # ── Agent loop ────────────────────────────────────────────────────────────

    async def plan(
        self,
        instruction: str,
        model: str = "claude-sonnet-4-6",
        on_step: Callable[[AgentStep], Awaitable[None]] | None = None,
    ) -> ModificationPlan:
        """Run the agentic planning loop and return a ModificationPlan."""
        planned: list[FileChange] = []
        commit_message = "chore: apply butler modification"

        file_tree = self._list_files()
        messages: list[dict] = [
            {
                "role": "user",
                "content": (f"Repository files:\n```\n{file_tree}\n```\n\nInstruction: {instruction}"),
            }
        ]

        limiter = await get_rate_limiter()

        for iteration in range(_MAX_ITER):
            # Estimate tokens and wait for rate limit budget
            estimated = limiter.estimate_tokens(messages, _SYSTEM)
            response = await self._api_call_with_retry(
                limiter, estimated, model, messages
            )

            messages.append({"role": "assistant", "content": response.content})

            tool_results: list[dict] = []
            finished = False

            for block in response.content:
                if block.type != "tool_use":
                    continue

                inp = dict(block.input)

                # Human-readable step label
                match block.name:
                    case "list_files":
                        label = "Listing files" + (f" (filter: {inp['filter']})" if inp.get("filter") else "")
                    case "read_file":
                        label = f"Reading {inp.get('path', '')}"
                    case "search_code":
                        label = f"Searching '{inp.get('pattern', '')}'"
                    case "edit_file":
                        label = f"Editing {inp.get('path', '')}"
                    case "plan_change":
                        label = f"Planning {inp.get('action', 'change')}: {inp.get('path', '')}"
                    case "finish":
                        label = f"Done — {inp.get('commit_message', '')}"
                    case _:
                        label = block.name

                if on_step:
                    await on_step(AgentStep(tool=block.name, label=label))

                result_text, should_finish = self._run_tool(block.name, inp, planned)

                if should_finish:
                    commit_message = inp.get("commit_message", commit_message)
                    finished = True

                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result_text,
                    }
                )

            if tool_results:
                messages.append({"role": "user", "content": tool_results})

            if finished or response.stop_reason == "end_turn":
                break

        if not planned:
            raise ValueError("Agent did not plan any file changes.")

        return ModificationPlan(changes=planned, commit_message=commit_message)


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
