"""GitHub OAuth helpers for the self-modification feature."""

from urllib.parse import urlencode

import httpx

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_API_URL = "https://api.github.com"


def get_oauth_url(state: str, client_id: str, callback_url: str) -> str:
    """Build the GitHub OAuth authorization URL."""
    params = {
        "client_id": client_id,
        "redirect_uri": callback_url,
        "scope": "repo",
        "state": state,
    }
    return f"{GITHUB_AUTHORIZE_URL}?{urlencode(params)}"


async def exchange_code_for_token(code: str, client_id: str, client_secret: str) -> str:
    """Exchange a GitHub OAuth code for an access token."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GITHUB_TOKEN_URL,
            json={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
            },
            headers={"Accept": "application/json"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        if "access_token" not in data:
            raise ValueError(f"GitHub OAuth error: {data.get('error_description', str(data))}")
        return str(data["access_token"])


async def get_github_user(token: str) -> dict:
    """Return the authenticated GitHub user's profile."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API_URL}/user",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
            timeout=10,
        )
        resp.raise_for_status()
        return dict(resp.json())


async def get_default_branch(token: str, owner: str, repo: str) -> str:
    """Return the default branch name of the repository (e.g. 'main' or 'master')."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{GITHUB_API_URL}/repos/{owner}/{repo}",
                headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
                timeout=10,
            )
            if resp.status_code == 200:
                return str(resp.json().get("default_branch", "main"))
    except Exception:
        pass
    return "main"


async def create_github_pr(
    token: str,
    owner: str,
    repo: str,
    head: str,
    base: str,
    title: str,
    body: str,
) -> tuple[str, int]:
    """Create a pull request and return (html_url, pr_number)."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{GITHUB_API_URL}/repos/{owner}/{repo}/pulls",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            json={"title": title, "body": body, "head": head, "base": base},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return str(data["html_url"]), int(data["number"])


async def merge_github_pr(
    token: str,
    owner: str,
    repo: str,
    pr_number: int,
    merge_method: str = "squash",
) -> str:
    """Merge a pull request and return the merge commit SHA."""
    async with httpx.AsyncClient() as client:
        resp = await client.put(
            f"{GITHUB_API_URL}/repos/{owner}/{repo}/pulls/{pr_number}/merge",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            json={"merge_method": merge_method},
            timeout=30,
        )
        resp.raise_for_status()
        return str(resp.json().get("sha", ""))


async def check_repo_ownership(token: str, owner: str, repo: str) -> bool:
    """Return True if the token's GitHub user is the owner of `owner/repo`."""
    try:
        user = await get_github_user(token)
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{GITHUB_API_URL}/repos/{owner}/{repo}",
                headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
                timeout=10,
            )
            if resp.status_code != 200:
                return False
            repo_data = resp.json()
            return bool(repo_data["owner"]["login"] == user["login"])
    except Exception:
        return False
