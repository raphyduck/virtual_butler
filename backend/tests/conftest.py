"""
Shared pytest fixtures.

Uses an in-memory SQLite database (via aiosqlite) so tests run with
no external infrastructure.  The SQLAlchemy models use postgresql.UUID
types, which transparently fall back to CHAR(32) on SQLite.
"""

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.main import app

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


# ── Database engine (one per test session) ────────────────────────────────────


@pytest_asyncio.fixture(scope="session")
async def engine():
    _engine = create_async_engine(
        TEST_DB_URL,
        echo=False,
        # Allow same connection to be used across async tasks (needed for :memory:)
        connect_args={"check_same_thread": False},
    )
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield _engine
    await _engine.dispose()


# ── DB session (one per test, rolled back after) ───────────────────────────────


@pytest_asyncio.fixture
async def db(engine) -> AsyncSession:
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        yield session


# ── HTTP test client ──────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def client(engine) -> AsyncClient:
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c

    app.dependency_overrides.pop(get_db, None)


# ── Registered user + auth headers ────────────────────────────────────────────


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient) -> dict[str, str]:
    """Register a test user and return bearer auth headers."""
    creds = {"email": "butler@example.com", "password": "supersecret123"}
    await client.post("/api/v1/auth/register", json=creds)
    resp = await client.post("/api/v1/auth/login", json=creds)
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def alt_auth_headers(client: AsyncClient) -> dict[str, str]:
    """A second user — used to test ownership isolation."""
    creds = {"email": "other@example.com", "password": "supersecret456"}
    await client.post("/api/v1/auth/register", json=creds)
    resp = await client.post("/api/v1/auth/login", json=creds)
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
