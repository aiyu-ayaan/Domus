import pytest

from backend.auth.dependencies import require_role
from backend.auth.models import User
from backend.common.enums import Role
from backend.core.exceptions import ForbiddenError


@pytest.mark.asyncio
async def test_require_role_allows_equal_or_higher():
    checker = require_role(Role.user)
    assert await checker(User(role="user")) is not None
    assert await checker(User(role="admin")) is not None
    assert await checker(User(role="owner")) is not None


@pytest.mark.asyncio
async def test_require_role_blocks_lower():
    checker = require_role(Role.user)
    with pytest.raises(ForbiddenError):
        await checker(User(role="guest"))


@pytest.mark.asyncio
async def test_guest_cannot_control_device(client, owner, device, sessionmaker):
    # Register a second user and downgrade them to guest directly in the DB.
    await client.post(
        "/api/v1/auth/register",
        json={"email": "guest@d.com", "password": "supersecret1"},
    )
    from sqlalchemy import select, update

    async with sessionmaker() as s:
        uid = (await s.execute(select(User.id).where(User.email == "guest@d.com"))).scalar_one()
        await s.execute(update(User).where(User.id == uid).values(role="guest"))
        await s.commit()

    token = (
        await client.post(
            "/api/v1/auth/login",
            json={"email": "guest@d.com", "password": "supersecret1"},
        )
    ).json()["access_token"]

    r = await client.post(
        f"/api/v1/devices/{device['device']['id']}/turn-on",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "forbidden"
