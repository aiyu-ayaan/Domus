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
async def test_poller_dedup_skips_redundant_rows_and_events(client, owner, device, sessionmaker):
    """A from_poll _record with no real change must not write history or emit events.

    This is what keeps the API lightweight (no per-tick row/event spam) and stops the
    Android device-detail toggle from flickering off/on.
    """
    from uuid import UUID

    from backend.core.events import DEVICE_STATE_CHANGED, event_bus
    from backend.devices.models import Device
    from backend.devices.service import DeviceService
    from backend.integrations.models import Integration
    from backend.integrations.registry import get_adapter

    did = UUID(device["device"]["id"])
    H = owner["headers"]

    # Control path establishes a known state (records + emits, as before).
    await client.post(f"/api/v1/devices/{did}/turn-on", headers=H)
    n_before = len((await client.get(f"/api/v1/devices/{did}/history", headers=H)).json())

    events = []

    async def spy(ev):
        if ev.type == DEVICE_STATE_CHANGED and ev.data.get("device_id") == str(did):
            events.append(ev)

    event_bus.subscribe(spy)
    try:
        async with sessionmaker() as session:
            service = DeviceService(session)
            dev = await session.get(Device, did)
            integ = await session.get(Integration, dev.integration_id)
            adapter = get_adapter(integ)
            snap = await adapter.get_state(dev.external_id)  # same state -> no change
            await service._record(dev, snap, from_poll=True)
            await service._record(dev, snap, from_poll=True)
            await session.commit()
    finally:
        event_bus.unsubscribe(spy)

    n_after = len((await client.get(f"/api/v1/devices/{did}/history", headers=H)).json())
    assert n_after == n_before, "idle polls must not append history rows"
    assert events == [], "idle polls must not emit state-changed events"


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
async def test_device_mark_offline_publishes_event_and_notification(
    client, owner, device, sessionmaker
):
    from uuid import UUID

    from backend.core.events import DEVICE_ONLINE_CHANGED, event_bus
    from backend.devices.models import Device
    from backend.devices.service import DeviceService

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
async def test_refresh_state_failure_marks_offline(
    client, owner, device, monkeypatch, sessionmaker
):
    from datetime import UTC, datetime
    from uuid import UUID

    from backend.devices.models import Device, DeviceState
    from backend.devices.service import DeviceService

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
            device_id=did, state="on", attributes={"brightness": 100}, created_at=datetime.now(UTC)
        )
        session.add(state)
        await session.commit()

    # Request state refresh
    await client.get(f"/api/v1/devices/{did}/state?refresh=true", headers=owner["headers"])

    async with sessionmaker() as session:
        dev = await session.get(Device, did)
        assert dev.online is False
