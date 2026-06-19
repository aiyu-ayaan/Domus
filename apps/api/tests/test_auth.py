import pytest


@pytest.mark.asyncio
async def test_register_first_user_is_owner(client):
    r = await client.post(
        "/api/v1/auth/register",
        json={"email": "first@d.com", "password": "supersecret1"},
    )
    assert r.status_code == 201
    assert r.json()["user"]["role"] == "owner"


@pytest.mark.asyncio
async def test_second_user_is_plain_user(client, owner):
    r = await client.post(
        "/api/v1/auth/register",
        json={"email": "second@d.com", "password": "supersecret1"},
    )
    assert r.json()["user"]["role"] == "user"


@pytest.mark.asyncio
async def test_duplicate_email_conflicts(client, owner):
    r = await client.post(
        "/api/v1/auth/register",
        json={"email": "owner@domus.com", "password": "supersecret1"},
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "conflict"


@pytest.mark.asyncio
async def test_login_and_me(client, owner):
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner@domus.com", "password": "supersecret1"},
    )
    assert r.status_code == 200
    token = r.json()["access_token"]
    me = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["email"] == "owner@domus.com"


@pytest.mark.asyncio
async def test_bad_password_rejected(client, owner):
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner@domus.com", "password": "wrongpassword"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_refresh_rotates_and_revokes_old(client, owner):
    tokens = (
        await client.post(
            "/api/v1/auth/login",
            json={"email": "owner@domus.com", "password": "supersecret1"},
        )
    ).json()
    refreshed = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refreshed.status_code == 200
    # Old refresh token is now revoked (rotation).
    reuse = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert reuse.status_code == 401


@pytest.mark.asyncio
async def test_unauthenticated_me_rejected(client):
    assert (await client.get("/api/v1/users/me")).status_code == 401
