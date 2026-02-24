import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio

ABILITIES = "/api/v1/abilities"

ABILITY_PAYLOAD = {
    "name": "Test Ability",
    "description": "Does things",
    "provider": "anthropic",
    "model": "claude-sonnet-4-6",
    "system_prompt": "You are helpful.",
    "deliverable_type": "code",
    "target_type": "local",
    "target_config": None,
    "provider_config": None,
}


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _create(client: AsyncClient, headers: dict, payload: dict | None = None) -> dict:
    resp = await client.post(ABILITIES, json=payload or ABILITY_PAYLOAD, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Create ────────────────────────────────────────────────────────────────────


async def test_create_ability(client: AsyncClient, auth_headers: dict):
    body = await _create(client, auth_headers)
    assert body["name"] == ABILITY_PAYLOAD["name"]
    assert body["provider"] == "anthropic"
    assert "id" in body


async def test_create_ability_unauthenticated(client: AsyncClient):
    resp = await client.post(ABILITIES, json=ABILITY_PAYLOAD)
    assert resp.status_code == 401


async def test_create_ability_missing_required_fields(client: AsyncClient, auth_headers: dict):
    resp = await client.post(ABILITIES, json={"name": "no-provider"}, headers=auth_headers)
    assert resp.status_code == 422


# ── List ──────────────────────────────────────────────────────────────────────


async def test_list_abilities_empty(client: AsyncClient, auth_headers: dict):
    resp = await client.get(ABILITIES, headers=auth_headers)
    assert resp.status_code == 200
    # May contain abilities from other tests in the session; just check it's a list
    assert isinstance(resp.json(), list)


async def test_list_abilities_returns_own(client: AsyncClient, auth_headers: dict):
    await _create(client, auth_headers, {**ABILITY_PAYLOAD, "name": "Mine"})
    resp = await client.get(ABILITIES, headers=auth_headers)
    names = [a["name"] for a in resp.json()]
    assert "Mine" in names


# ── Get ───────────────────────────────────────────────────────────────────────


async def test_get_ability(client: AsyncClient, auth_headers: dict):
    created = await _create(client, auth_headers)
    resp = await client.get(f"{ABILITIES}/{created['id']}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


async def test_get_ability_not_found(client: AsyncClient, auth_headers: dict):
    resp = await client.get(f"{ABILITIES}/00000000-0000-0000-0000-000000000000", headers=auth_headers)
    assert resp.status_code == 404


# ── Update ────────────────────────────────────────────────────────────────────


async def test_update_ability(client: AsyncClient, auth_headers: dict):
    created = await _create(client, auth_headers)
    resp = await client.put(
        f"{ABILITIES}/{created['id']}",
        json={**ABILITY_PAYLOAD, "name": "Updated Name"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Name"


# ── Delete ────────────────────────────────────────────────────────────────────


async def test_delete_ability(client: AsyncClient, auth_headers: dict):
    created = await _create(client, auth_headers)
    del_resp = await client.delete(f"{ABILITIES}/{created['id']}", headers=auth_headers)
    assert del_resp.status_code == 204

    get_resp = await client.get(f"{ABILITIES}/{created['id']}", headers=auth_headers)
    assert get_resp.status_code == 404


# ── Ownership isolation ───────────────────────────────────────────────────────


async def test_cannot_access_other_users_ability(client: AsyncClient, auth_headers: dict, alt_auth_headers: dict):
    created = await _create(client, auth_headers)

    # Other user cannot read it
    resp = await client.get(f"{ABILITIES}/{created['id']}", headers=alt_auth_headers)
    assert resp.status_code == 404

    # Other user cannot delete it
    resp = await client.delete(f"{ABILITIES}/{created['id']}", headers=alt_auth_headers)
    assert resp.status_code == 404


async def test_list_does_not_show_other_users_abilities(
    client: AsyncClient, auth_headers: dict, alt_auth_headers: dict
):
    await _create(client, auth_headers, {**ABILITY_PAYLOAD, "name": "Owner Ability"})
    resp = await client.get(ABILITIES, headers=alt_auth_headers)
    names = [a["name"] for a in resp.json()]
    assert "Owner Ability" not in names
