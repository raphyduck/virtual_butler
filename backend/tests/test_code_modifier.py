import json

from app.skills.code_modifier import CodeModifier, _normalize_remote_branch_ref, _resolve_github_login


def test_normalize_remote_branch_ref() -> None:
    assert _normalize_remote_branch_ref("main") == "refs/heads/main"
    assert _normalize_remote_branch_ref("butler/feature-x") == "refs/heads/butler/feature-x"
    assert _normalize_remote_branch_ref("refs/heads/existing") == "refs/heads/existing"


def test_git_push_uses_fully_qualified_remote_ref(monkeypatch) -> None:
    calls: list[list[str]] = []

    def fake_run_git(self, cmd: list[str], check: bool = True):
        calls.append(cmd)

        class Result:
            returncode = 0
            stdout = ""
            stderr = ""

        return Result()

    monkeypatch.setattr(CodeModifier, "_run_git", fake_run_git)

    modifier = CodeModifier(repo_root=".")
    modifier.git_push_github(token="t", owner="o", repo="r", branch="butler/feat-123")

    assert calls == [["git", "push", "https://t@github.com/o/r.git", "HEAD:refs/heads/butler/feat-123"]]


def test_resolve_github_login_uses_authenticated_user(monkeypatch) -> None:
    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self) -> bytes:
            return json.dumps({"login": "ci-bot"}).encode()

    monkeypatch.setattr("app.skills.code_modifier.urlopen", lambda request, timeout=10: FakeResponse())

    assert _resolve_github_login("token", fallback="raphyduck") == "ci-bot"


def test_docker_build_and_push_logs_into_ghcr_with_token_login(monkeypatch, tmp_path) -> None:
    calls: list[list[str]] = []

    def fake_run(cmd: list[str], **kwargs):
        calls.append(cmd)

        class Result:
            returncode = 0
            stdout = ""
            stderr = ""

        return Result()

    monkeypatch.setattr("app.skills.code_modifier._resolve_github_login", lambda token, fallback: "ci-bot")
    monkeypatch.setattr("app.skills.code_modifier.subprocess.run", fake_run)

    modifier = CodeModifier(repo_root=tmp_path)
    modifier.docker_build_and_push(token="t", owner="raphyduck", repo="virtual_butler", version="abc123")

    assert calls[0] == ["docker", "login", "ghcr.io", "-u", "ci-bot", "--password-stdin"]
