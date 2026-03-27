import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio

SETUP = "/api/v1/setup"
REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"
USERS = "/api/v1/users"


async def _create_admin(client: AsyncClient, email: str = "admin@example.com") -> dict[str, str]:
    resp = await client.post(SETUP, json={"email": email, "password": "password123"})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _create_user(client: AsyncClient, email: str) -> dict:
    await client.post(REGISTER, json={"email": email, "password": "password123"})
    login = await client.post(LOGIN, json={"email": email, "password": "password123"})
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {login.json()['access_token']}"})
    return {"headers": {"Authorization": f"Bearer {login.json()['access_token']}"}, "user": me.json()}


async def test_users_list_requires_admin(client: AsyncClient):
    await _create_user(client, "user@example.com")
    user = await _create_user(client, "user2@example.com")
    resp = await client.get(USERS, headers=user["headers"])
    assert resp.status_code == 403


async def test_users_list_as_admin(client: AsyncClient):
    admin_headers = await _create_admin(client)
    await _create_user(client, "user@example.com")
    resp = await client.get(USERS, headers=admin_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


async def test_users_patch_missing_user(client: AsyncClient):
    admin_headers = await _create_admin(client)
    resp = await client.patch(
        f"{USERS}/00000000-0000-0000-0000-000000000000",
        json={"role": "admin"},
        headers=admin_headers,
    )
    assert resp.status_code == 404


async def test_users_patch_requires_admin(client: AsyncClient):
    await _create_admin(client)
    user = await _create_user(client, "user@example.com")
    resp = await client.patch(f"{USERS}/{user['user']['id']}", json={"enabled": False}, headers=user["headers"])
    assert resp.status_code == 403


async def test_users_patch_prevent_demote_last_admin(client: AsyncClient):
    admin_headers = await _create_admin(client)
    admin_me = (await client.get("/api/v1/auth/me", headers=admin_headers)).json()
    resp = await client.patch(f"{USERS}/{admin_me['id']}", json={"role": "user"}, headers=admin_headers)
    assert resp.status_code == 409


async def test_users_patch_prevent_disabling_self(client: AsyncClient):
    admin_headers = await _create_admin(client)
    admin_me = (await client.get("/api/v1/auth/me", headers=admin_headers)).json()
    resp = await client.patch(f"{USERS}/{admin_me['id']}", json={"enabled": False}, headers=admin_headers)
    assert resp.status_code == 409


async def test_users_delete_protections(client: AsyncClient):
    admin_headers = await _create_admin(client)
    admin_me = (await client.get("/api/v1/auth/me", headers=admin_headers)).json()
    resp = await client.delete(f"{USERS}/{admin_me['id']}", headers=admin_headers)
    assert resp.status_code == 409


async def test_users_delete_missing_user(client: AsyncClient):
    admin_headers = await _create_admin(client)
    resp = await client.delete(f"{USERS}/00000000-0000-0000-0000-000000000000", headers=admin_headers)
    assert resp.status_code == 404


async def test_disabled_user_token_is_blocked(client: AsyncClient):
    admin_headers = await _create_admin(client)
    user = await _create_user(client, "user@example.com")
    disable = await client.patch(
        f"{USERS}/{user['user']['id']}",
        json={"enabled": False},
        headers=admin_headers,
    )
    assert disable.status_code == 200

    me = await client.get("/api/v1/auth/me", headers=user["headers"])
    assert me.status_code == 403
