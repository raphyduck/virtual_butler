from httpx import AsyncClient


async def test_provider_catalog(auth_headers: dict[str, str], client: AsyncClient):
    resp = await client.get('/api/v1/settings/provider-catalog', headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert 'providers' in body
    assert 'models_by_provider' in body
    assert 'anthropic' in body['providers']
    assert body['models_by_provider']['anthropic'][0] == 'claude-sonnet-4-6'
