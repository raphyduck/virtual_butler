"""
Tests for the first-run setup flow.

Each test uses a completely isolated in-memory DB (fresh_client fixture) so that
the "no users yet" precondition is always satisfied regardless of test ordering.
"""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.main import app

pytestmark = pytest.mark.asyncio

SETUP_STATUS = "/api/v1/setup/status"
SETUP = "/api/v1/setup"


# ── Isolated client fixture ───────────────────────────────────────────────────


@pytest_asyncio.fixture
async def fresh_client() -> AsyncClient:
    """HTTP client backed by a brand-new, empty in-memory SQLite DB."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    Session = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c

    app.dependency_overrides.pop(get_db, None)
    await engine.dispose()


# ── Setup status ──────────────────────────────────────────────────────────────


async def test_setup_status_required_on_empty_db(fresh_client: AsyncClient):
    resp = await fresh_client.get(SETUP_STATUS)
    assert resp.status_code == 200
    assert resp.json() == {"setup_required": True}


async def test_setup_status_not_required_after_setup(fresh_client: AsyncClient):
    await fresh_client.post(SETUP, json={"email": "admin@example.com", "password": "password123"})
    resp = await fresh_client.get(SETUP_STATUS)
    assert resp.status_code == 200
    assert resp.json() == {"setup_required": False}


# ── Run setup ─────────────────────────────────────────────────────────────────


async def test_setup_creates_admin_and_returns_tokens(fresh_client: AsyncClient):
    resp = await fresh_client.post(
        SETUP,
        json={"email": "admin@example.com", "password": "password123"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["token_type"] == "bearer"


async def test_setup_with_settings(fresh_client: AsyncClient):
    resp = await fresh_client.post(
        SETUP,
        json={
            "email": "admin@example.com",
            "password": "password123",
            "settings": {"anthropic_api_key": "sk-ant-test"},
        },
    )
    assert resp.status_code == 201
    assert "access_token" in resp.json()


async def test_setup_blocked_after_first_user(fresh_client: AsyncClient):
    # First setup succeeds
    first = await fresh_client.post(
        SETUP,
        json={"email": "first@example.com", "password": "password123"},
    )
    assert first.status_code == 201

    # Second attempt is rejected
    second = await fresh_client.post(
        SETUP,
        json={"email": "second@example.com", "password": "password123"},
    )
    assert second.status_code == 403


async def test_setup_rejects_short_password(fresh_client: AsyncClient):
    resp = await fresh_client.post(
        SETUP,
        json={"email": "admin@example.com", "password": "short"},
    )
    assert resp.status_code == 422


async def test_setup_rejects_invalid_email(fresh_client: AsyncClient):
    resp = await fresh_client.post(
        SETUP,
        json={"email": "not-an-email", "password": "password123"},
    )
    assert resp.status_code == 422
