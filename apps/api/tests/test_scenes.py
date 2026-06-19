import pytest


@pytest.mark.asyncio
async def test_scene_activate_drives_devices(client, owner, device, home):
    did = device["device"]["id"]
    H = owner["headers"]

    # Put the device on first so the scene's "off" is a real change.
    await client.post(f"/api/v1/devices/{did}/turn-on", headers=H)

    scene = (
        await client.post(
            "/api/v1/scenes",
            json={
                "home_id": home["id"],
                "name": "All Off",
                "states": [{"device_id": did, "state": "off"}],
            },
            headers=H,
        )
    ).json()
    assert len(scene["states"]) == 1

    result = (await client.post(f"/api/v1/scenes/{scene['id']}/activate", headers=H)).json()
    assert result["applied"] == 1 and result["failed"] == 0

    state = await client.get(f"/api/v1/devices/{did}/state", headers=H)
    assert state.json()["state"] == "off"
