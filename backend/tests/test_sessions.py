import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio

ABILITIES = "/api/v1/abilities"

ABILITY_PAYLOAD = {
    "name": "Session Test Ability",
    "description": None,
    "provider": "ollama",
    "model": "llama3",
    "system_prompt": None,
    "deliverable_type": "document",
    "target_type": "local",
    "target_config": None,
    "provider_config": None,
}


async def _create_ability(client: AsyncClient, headers: dict) -> dict:
    resp = await client.post(ABILITIES, json=ABILITY_PAYLOAD, headers=headers)
    assert resp.status_code == 201
    return resp.json()


async def _sessions_url(ability_id: str) -> str:
    return f"{ABILITIES}/{ability_id}/sessions"


# ── Create session ────────────────────────────────────────────────────────────


async def test_create_session(client: AsyncClient, auth_headers: dict):
    ability = await _create_ability(client, auth_headers)
    url = await _sessions_url(ability["id"])

    resp = await client.post(url, json={}, headers=auth_headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["ability_id"] == ability["id"]
    assert body["status"] == "idle"


async def test_create_session_unauthenticated(client: AsyncClient, auth_headers: dict):
    ability = await _create_ability(client, auth_headers)
    url = await _sessions_url(ability["id"])

    resp = await client.post(url, json={})  # no auth headers
    assert resp.status_code == 401


async def test_create_session_unknown_ability(client: AsyncClient, auth_headers: dict):
    url = await _sessions_url("00000000-0000-0000-0000-000000000000")
    resp = await client.post(url, json={}, headers=auth_headers)
    assert resp.status_code == 404


# ── List sessions ─────────────────────────────────────────────────────────────


async def test_list_sessions(client: AsyncClient, auth_headers: dict):
    ability = await _create_ability(client, auth_headers)
    url = await _sessions_url(ability["id"])

    await client.post(url, json={}, headers=auth_headers)
    await client.post(url, json={}, headers=auth_headers)

    resp = await client.get(url, headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 2


async def test_list_sessions_isolation(client: AsyncClient, auth_headers: dict, alt_auth_headers: dict):
    ability = await _create_ability(client, auth_headers)
    url = await _sessions_url(ability["id"])

    # Other user cannot list sessions of an ability they don't own
    resp = await client.get(url, headers=alt_auth_headers)
    assert resp.status_code == 404
