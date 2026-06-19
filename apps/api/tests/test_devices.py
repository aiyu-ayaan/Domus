import pytest


@pytest.mark.asyncio
async def test_turn_on_off_toggle_and_history(client, owner, device):
    did = device["device"]["id"]
    H = owner["headers"]

    on = await client.post(f"/api/v1/devices/{did}/turn-on", headers=H)
    assert on.status_code == 200 and on.json()["state"] == "on"

    off = await client.post(f"/api/v1/devices/{did}/turn-off", headers=H)
    assert off.json()["state"] == "off"

    tog = await client.post(f"/api/v1/devices/{did}/toggle", headers=H)
    assert tog.json()["state"] == "on"

    state = await client.get(f"/api/v1/devices/{did}/state", headers=H)
    assert state.json()["state"] == "on"

    history = await client.get(f"/api/v1/devices/{did}/history", headers=H)
    assert len(history.json()) == 3  # on, off, toggle


@pytest.mark.asyncio
async def test_state_404_when_never_controlled(client, owner, device):
    did = device["device"]["id"]
    r = await client.get(f"/api/v1/devices/{did}/state", headers=owner["headers"])
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_other_users_device_is_forbidden(client, owner, device):
    # A second user (their own home) cannot reach the owner's device.
    token = (
        await client.post(
            "/api/v1/auth/register",
            json={"email": "other@d.com", "password": "supersecret1"},
        )
    ).json()["tokens"]["access_token"]
    r = await client.get(
        f"/api/v1/devices/{device['device']['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_list_devices_filtered_by_type(client, owner, device, home):
    r = await client.get(
        "/api/v1/devices",
        params={"device_type": "plug", "home_id": home["id"]},
        headers=owner["headers"],
    )
    body = r.json()
    assert all(d["device_type"] == "plug" for d in body["items"])
