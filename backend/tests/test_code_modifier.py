from app.skills.code_modifier import CodeModifier, _normalize_remote_branch_ref


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
