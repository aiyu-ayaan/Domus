"""Shared test fixtures.

Each test gets a fresh in-memory SQLite database shared across sessions via StaticPool
(so the override session and any same-process readers see the same data), and an ASGI
client with the DB dependency overridden.
"""

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from backend import models  # noqa: F401  populate metadata
from backend.common.models import Base
from backend.core.database import get_db
from backend.core.ratelimit import limiter
from backend.main import app

# Rate limiting is keyed by client IP, which is constant across the suite; disable it so
# the many fixture registrations don't trip the auth limiter.
limiter.enabled = False


@pytest_asyncio.fixture
async def sessionmaker():
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    yield maker
    await engine.dispose()


@pytest_asyncio.fixture
async def client(sessionmaker):
    async def _override_get_db():
        async with sessionmaker() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = _override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def owner(client):
    """Register the first user (becomes owner) and return auth headers + token."""
    r = await client.post(
        "/api/v1/auth/register",
        json={"email": "owner@domus.com", "password": "supersecret1", "full_name": "Owner"},
    )
    assert r.status_code == 201
    token = r.json()["tokens"]["access_token"]
    return {"headers": {"Authorization": f"Bearer {token}"}, "token": token}


@pytest_asyncio.fixture
async def home(client, owner):
    r = await client.post("/api/v1/homes", json={"name": "Test Home"}, headers=owner["headers"])
    assert r.status_code == 201
    return r.json()


@pytest_asyncio.fixture
async def device(client, owner, home):
    """An integration discovered into a device, ready to control."""
    integ = (
        await client.post(
            "/api/v1/integrations",
            json={"home_id": home["id"], "name": "Tapo", "type": "tapo"},
            headers=owner["headers"],
        )
    ).json()
    await client.post(f"/api/v1/integrations/{integ['id']}/discover", headers=owner["headers"])
    devices = (await client.get("/api/v1/devices", headers=owner["headers"])).json()["items"]
    return {"integration": integ, "device": devices[0]}
