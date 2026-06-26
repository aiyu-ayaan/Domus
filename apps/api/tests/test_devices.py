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


@pytest.mark.asyncio
async def test_device_mark_offline_publishes_event_and_notification(client, owner, device, sessionmaker):
    from backend.devices.service import DeviceService
    from backend.core.events import DEVICE_ONLINE_CHANGED, event_bus
    from backend.devices.models import Device
    from uuid import UUID

    did = UUID(device["device"]["id"])
    events = []

    async def on_event(ev):
        if ev.type == DEVICE_ONLINE_CHANGED:
            events.append(ev)

    event_bus.subscribe(on_event)
    try:
        async with sessionmaker() as session:
            service = DeviceService(session)
            dev = await session.get(Device, did)
            assert dev.online is True
            await service.mark_offline(dev)
            await session.commit()

        # Check DB updated
        async with sessionmaker() as session:
            dev = await session.get(Device, did)
            assert dev.online is False

        # Event fired
        assert len(events) == 1
        assert events[0].type == DEVICE_ONLINE_CHANGED
        assert events[0].data["device_id"] == str(did)
        assert events[0].data["online"] is False
    finally:
        event_bus.unsubscribe(on_event)


@pytest.mark.asyncio
async def test_refresh_state_failure_marks_offline(client, owner, device, monkeypatch, sessionmaker):
    from backend.devices.service import DeviceService
    from backend.devices.models import Device, DeviceState
    from datetime import datetime, UTC
    from uuid import UUID

    did = UUID(device["device"]["id"])

    # Monkeypatch the adapter's get_state to raise an exception
    async def mock_get_state(self, external_id):
        raise RuntimeError("Device unreachable")

    from backend.integrations.adapters.tapo import TapoAdapter
    monkeypatch.setattr(TapoAdapter, "get_state", mock_get_state)

    async with sessionmaker() as session:
        # First ensure it has a state row so conftest device conftest is satisfied
        service = DeviceService(session)
        dev = await session.get(Device, did)
        dev.online = True
        # Insert a dummy state row
        state = DeviceState(
            device_id=did,
            state="on",
            attributes={"brightness": 100},
            created_at=datetime.now(UTC)
        )
        session.add(state)
        await session.commit()

    # Request state refresh
    await client.get(f"/api/v1/devices/{did}/state?refresh=true", headers=owner["headers"])
    
    async with sessionmaker() as session:
        dev = await session.get(Device, did)
        assert dev.online is False
