"""AI-driven code modifier: turns a natural-language instruction into file changes.

Flow
----
1. ``plan()``            — reads project files, asks the AI to produce a JSON change-set
2. ``apply()``           — writes the generated files to disk
3. ``git_commit()``      — stages everything and commits
4. ``git_push_github()`` — pushes to GitHub with token auth
"""

import json
import logging
import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from app.config import settings
from app.providers.base import ChatMessage
from app.providers.factory import get_provider

logger = logging.getLogger(__name__)

_TOKEN_RE = re.compile(r"(https?://)([^@]+)(@github\.com)")

# ── Data model ────────────────────────────────────────────────────────────────


@dataclass
class FileChange:
    path: str
    action: Literal["create", "modify", "delete"]
    content: str | None = None  # None for "delete"


@dataclass
class ModificationPlan:
    changes: list[FileChange]
    commit_message: str


# ── System prompt ─────────────────────────────────────────────────────────────

_PLAN_SYSTEM = """\
You are a senior software engineer working on the Virtual Butler project.
Your task is to generate precise, minimal code changes based on a user instruction.

CRITICAL: respond with ONLY valid JSON — no markdown fences, no prose — matching:
{
  "changes": [
    {
      "path": "relative/path/from/repo/root",
      "action": "create" | "modify" | "delete",
      "content": "<complete file content as a string, or null for delete>"
    }
  ],
  "commit_message": "<conventional-commits style message>"
}

Rules:
- Include COMPLETE file contents for create/modify (not diffs or patches)
- Paths are relative to the repository root
- Changes must be minimal and focused on the instruction
- Do NOT touch files unrelated to the instruction
"""

# ── Modifier ──────────────────────────────────────────────────────────────────

# Character budget for the context fed to the AI (≈ 20k tokens @ 4 chars/token)
_CONTEXT_BUDGET = 80_000


class CodeModifier:
    def __init__(self, repo_root: str | None = None) -> None:
        self.repo_root = Path(repo_root or settings.repo_root).resolve()

    # ── Context ───────────────────────────────────────────────────────────────

    def _file_tree(self) -> str:
        result = subprocess.run(
            ["git", "ls-files"],
            cwd=self.repo_root,
            capture_output=True,
            text=True,
        )
        return result.stdout if result.returncode == 0 else ""

    def _build_context(self) -> str:
        tree = self._file_tree()
        parts: list[str] = [f"## Repository file tree\n```\n{tree}```"]
        used = len(parts[0])

        def _add(path: Path) -> None:
            nonlocal used
            if not path.exists():
                return
            try:
                text = path.read_text(encoding="utf-8")
            except Exception:
                return
            rel = path.relative_to(self.repo_root)
            snippet = f"\n\n## {rel}\n```\n{text}\n```"
            if used + len(snippet) > _CONTEXT_BUDGET:
                return
            parts.append(snippet)
            used += len(snippet)

        # All Python source files in the backend app package
        for py in sorted((self.repo_root / "backend" / "app").rglob("*.py")):
            _add(py)

        # Key configuration / frontend files
        for extra in [
            self.repo_root / "backend" / "pyproject.toml",
            self.repo_root / "frontend" / "package.json",
            self.repo_root / "frontend" / "src" / "lib" / "api.ts",
        ]:
            _add(extra)

        return "".join(parts)

    # ── Planning ──────────────────────────────────────────────────────────────

    async def plan(
        self,
        instruction: str,
        provider: str = "anthropic",
        model: str = "claude-sonnet-4-6",
        provider_config_json: str | None = None,
    ) -> ModificationPlan:
        context = self._build_context()
        prompt = f"{context}\n\n## Instruction\n{instruction}\n\nGenerate the code changes as JSON."

        provider_obj = get_provider(provider, model, provider_config_json)
        raw = await provider_obj.complete(
            [ChatMessage(role="user", content=prompt)],
            system_prompt=_PLAN_SYSTEM,
        )

        # Strip potential markdown fences that some models add despite instructions
        text = raw.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:])
            if "```" in text:
                text = text[: text.rfind("```")]
        text = text.strip()

        data = json.loads(text)
        return ModificationPlan(
            changes=[FileChange(path=c["path"], action=c["action"], content=c.get("content")) for c in data["changes"]],
            commit_message=data["commit_message"],
        )

    # ── Application ───────────────────────────────────────────────────────────

    def apply(self, plan: ModificationPlan) -> None:
        """Write all file changes in the plan to disk."""
        for change in plan.changes:
            target = self.repo_root / change.path
            if change.action == "delete":
                target.unlink(missing_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(change.content or "", encoding="utf-8")

    # ── Git ───────────────────────────────────────────────────────────────────

    @staticmethod
    def _scrub_token(text: str) -> str:
        """Remove embedded credentials from git output so tokens never leak into logs."""
        return _TOKEN_RE.sub(r"\1****\3", text)

    def _run_git(self, cmd: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
        """Run a git command with proper error handling.

        * stdout/stderr are always captured (keeps tokens out of console).
        * On failure the *scrubbed* stderr is logged and re-raised inside a
          RuntimeError so callers get an actionable message instead of just
          ``exit status 128``.
        """
        result = subprocess.run(
            cmd,
            cwd=self.repo_root,
            capture_output=True,
            text=True,
        )
        if check and result.returncode != 0:
            safe_cmd = self._scrub_token(" ".join(cmd))
            safe_stderr = self._scrub_token(result.stderr.strip())
            safe_stdout = self._scrub_token(result.stdout.strip())
            logger.error("git command failed: %s\nstderr: %s\nstdout: %s", safe_cmd, safe_stderr, safe_stdout)
            raise RuntimeError(
                f"git command failed (exit {result.returncode}): {safe_cmd}\n{safe_stderr}"
            )
        return result

    def git_commit(self, message: str, author_email: str = "butler@virtual-butler.local") -> str:
        """Stage all changes, commit, and return the new HEAD SHA."""
        self._run_git(["git", "config", "user.email", author_email])
        self._run_git(["git", "config", "user.name", "Virtual Butler"])
        self._run_git(["git", "add", "-A"])
        self._run_git(["git", "commit", "-m", message])
        result = self._run_git(["git", "rev-parse", "HEAD"])
        return result.stdout.strip()

    def git_push_github(self, token: str, owner: str, repo: str, branch: str = "main") -> None:
        """Push HEAD to GitHub using token auth (credentials never stored in history)."""
        remote_url = f"https://{token}@github.com/{owner}/{repo}.git"
        self._run_git(["git", "push", remote_url, f"HEAD:{branch}"])

    def git_sync_default_branch(self, token: str, owner: str, repo: str, branch: str = "main") -> None:
        """Fetch and reset to the latest default branch before starting work."""
        remote_url = f"https://{token}@github.com/{owner}/{repo}.git"
        self._run_git(["git", "fetch", remote_url, branch])
        self._run_git(["git", "checkout", branch])
        self._run_git(["git", "reset", "--hard", "FETCH_HEAD"])

    def git_pull_default_branch(self, token: str, owner: str, repo: str, branch: str = "main") -> None:
        """Pull the latest default branch after a PR has been merged."""
        remote_url = f"https://{token}@github.com/{owner}/{repo}.git"
        self._run_git(["git", "checkout", branch])
        self._run_git(["git", "pull", remote_url, branch])

    # ── Docker build & deploy ─────────────────────────────────────────────────

    def docker_build_and_push(self, token: str, owner: str, repo: str, version: str) -> None:
        """Build backend + frontend Docker images and push them to GHCR."""
        registry = f"ghcr.io/{owner.lower()}/{repo.lower()}"

        # Authenticate to GHCR
        subprocess.run(
            ["docker", "login", "ghcr.io", "-u", owner, "--password-stdin"],
            input=token,
            cwd=self.repo_root,
            check=True,
            capture_output=True,
            text=True,
        )

        for component in ("backend", "frontend"):
            tag = f"{registry}-{component}:{version}"
            tag_latest = f"{registry}-{component}:latest"
            context = str(self.repo_root / component)
            dockerfile = str(self.repo_root / component / "Dockerfile")

            subprocess.run(
                ["docker", "build", "-f", dockerfile, "--target", "production", "-t", tag, "-t", tag_latest, context],
                check=True,
                capture_output=True,
                text=True,
            )
            subprocess.run(["docker", "push", tag], check=True, capture_output=True, text=True)
            subprocess.run(["docker", "push", tag_latest], check=True, capture_output=True, text=True)

    def docker_deploy(self, version: str) -> None:
        """Pull new images and restart the running containers via docker compose.

        The job should be marked 'done' BEFORE calling this, because the backend
        container itself will be replaced.
        """
        compose_file = self.repo_root / "docker-compose.prod.yml"
        env = {**os.environ, "APP_VERSION": version}

        compose_args = [
            "docker",
            "compose",
            *(["-f", str(compose_file)] if compose_file.exists() else []),
        ]

        # Pull new images
        subprocess.run(
            [*compose_args, "pull", "backend", "frontend"],
            cwd=self.repo_root,
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )

        # Restart backend + frontend (db/redis stay running)
        subprocess.run(
            [*compose_args, "up", "-d", "--no-deps", "backend", "frontend"],
            cwd=self.repo_root,
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )
