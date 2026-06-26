import pytest

from backend.automations.engine import _trigger_matches, evaluate_conditions
from backend.core.events import DEVICE_ONLINE_CHANGED, Event


def test_device_offline_trigger_matches_only_offline_edge():
    offline = Event(
        type=DEVICE_ONLINE_CHANGED, home_id="h", data={"device_id": "d1", "online": False}
    )
    online = Event(
        type=DEVICE_ONLINE_CHANGED, home_id="h", data={"device_id": "d1", "online": True}
    )
    # Any-device offline rule fires on the offline edge.
    assert _trigger_matches({"type": "device_offline"}, offline)
    # Targeted rule fires only for its device.
    assert _trigger_matches({"type": "device_offline", "device_id": "d1"}, offline)
    assert not _trigger_matches({"type": "device_offline", "device_id": "other"}, offline)
    # The recovery (online) edge must NOT fire an offline rule.
    assert not _trigger_matches({"type": "device_offline"}, online)


def test_evaluate_conditions_and_semantics():
    ctx = {"state": "on", "lux": 5}
    assert evaluate_conditions([{"field": "state", "op": "eq", "value": "on"}], ctx)
    assert evaluate_conditions([{"field": "lux", "op": "lt", "value": 10}], ctx)
    # AND: one failing condition fails the whole rule.
    assert not evaluate_conditions(
        [
            {"field": "state", "op": "eq", "value": "on"},
            {"field": "lux", "op": "gt", "value": 10},
        ],
        ctx,
    )


def test_evaluate_conditions_missing_field_is_false():
    assert not evaluate_conditions([{"field": "nope", "op": "eq", "value": 1}], {})


@pytest.mark.asyncio
async def test_manual_trigger_respects_conditions(client, owner, device, home):
    did = device["device"]["id"]
    H = owner["headers"]
    auto = (
        await client.post(
            "/api/v1/automations",
            json={
                "home_id": home["id"],
                "name": "Dark -> light on",
                "trigger": {"type": "manual"},
                "conditions": [{"field": "lux", "op": "lt", "value": 10}],
                "actions": [
                    {"type": "device.turn_on", "device_id": did},
                    {"type": "notification.send", "title": "Lights"},
                ],
            },
            headers=H,
        )
    ).json()

    # Condition fails -> nothing happens.
    r = await client.post(f"/api/v1/automations/{auto['id']}/trigger", json={"lux": 50}, headers=H)
    assert r.json()["executed"] is False

    # Condition passes -> device on + notification.
    r = await client.post(f"/api/v1/automations/{auto['id']}/trigger", json={"lux": 5}, headers=H)
    assert r.json()["executed"] is True

    state = await client.get(f"/api/v1/devices/{did}/state", headers=H)
    assert state.json()["state"] == "on"
    notes = await client.get("/api/v1/notifications", headers=H)
    assert any(n["title"] == "Lights" for n in notes.json())


@pytest.mark.asyncio
async def test_failed_action_raises_notification(client, owner, device, home):
    import uuid

    H = owner["headers"]
    auto = (
        await client.post(
            "/api/v1/automations",
            json={
                "home_id": home["id"],
                "name": "Broken",
                "trigger": {"type": "manual"},
                "conditions": [],
                "actions": [{"type": "device.turn_on", "device_id": str(uuid.uuid4())}],
            },
            headers=H,
        )
    ).json()
    await client.post(f"/api/v1/automations/{auto['id']}/trigger", json={}, headers=H)
    notes = (await client.get("/api/v1/notifications", headers=H)).json()
    assert any(n["type"] == "automation_failed" for n in notes)
