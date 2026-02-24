import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"
REFRESH = "/api/v1/auth/refresh"
ME = "/api/v1/auth/me"

CREDS = {"email": "auth_test@example.com", "password": "password1234"}


# ── Register ──────────────────────────────────────────────────────────────────


async def test_register_success(client: AsyncClient):
    resp = await client.post(REGISTER, json=CREDS)
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == CREDS["email"]
    assert "id" in body
    assert "hashed_password" not in body


async def test_register_duplicate_email(client: AsyncClient):
    await client.post(REGISTER, json=CREDS)
    resp = await client.post(REGISTER, json=CREDS)
    assert resp.status_code == 409


async def test_register_invalid_email(client: AsyncClient):
    resp = await client.post(REGISTER, json={"email": "not-an-email", "password": "pass"})
    assert resp.status_code == 422


# ── Login ─────────────────────────────────────────────────────────────────────


async def test_login_success(client: AsyncClient):
    await client.post(REGISTER, json=CREDS)
    resp = await client.post(LOGIN, json=CREDS)
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["token_type"] == "bearer"


async def test_login_wrong_password(client: AsyncClient):
    await client.post(REGISTER, json=CREDS)
    resp = await client.post(LOGIN, json={**CREDS, "password": "wrongpass"})
    assert resp.status_code == 401


async def test_login_unknown_email(client: AsyncClient):
    resp = await client.post(LOGIN, json={"email": "ghost@example.com", "password": "pass"})
    assert resp.status_code == 401


# ── Refresh token ─────────────────────────────────────────────────────────────


async def test_refresh_token(client: AsyncClient):
    await client.post(REGISTER, json=CREDS)
    login_resp = await client.post(LOGIN, json=CREDS)
    refresh_token = login_resp.json()["refresh_token"]

    resp = await client.post(REFRESH, json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


async def test_refresh_invalid_token(client: AsyncClient):
    resp = await client.post(REFRESH, json={"refresh_token": "not.a.token"})
    assert resp.status_code == 401


# ── /me ───────────────────────────────────────────────────────────────────────


async def test_me_authenticated(client: AsyncClient, auth_headers: dict):
    resp = await client.get(ME, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == "butler@example.com"


async def test_me_unauthenticated(client: AsyncClient):
    resp = await client.get(ME)
    assert resp.status_code == 401


async def test_me_bad_token(client: AsyncClient):
    resp = await client.get(ME, headers={"Authorization": "Bearer garbage"})
    assert resp.status_code == 401
