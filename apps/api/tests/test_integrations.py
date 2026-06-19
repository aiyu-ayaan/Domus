import pytest


@pytest.mark.asyncio
async def test_discovery_creates_then_dedupes(client, owner, home):
    integ = (
        await client.post(
            "/api/v1/integrations",
            json={"home_id": home["id"], "name": "Zig", "type": "zigbee"},
            headers=owner["headers"],
        )
    ).json()

    first = (
        await client.post(f"/api/v1/integrations/{integ['id']}/discover", headers=owner["headers"])
    ).json()
    assert first["new_count"] == 2 and first["existing_count"] == 0

    second = (
        await client.post(f"/api/v1/integrations/{integ['id']}/discover", headers=owner["headers"])
    ).json()
    assert second["new_count"] == 0 and second["existing_count"] == 2
    assert all(d["already_registered"] for d in second["discovered"])


@pytest.mark.asyncio
async def test_integration_config_never_returned(client, owner, home):
    r = await client.post(
        "/api/v1/integrations",
        json={
            "home_id": home["id"],
            "name": "Secret",
            "type": "tuya",
            "config": {"api_key": "topsecret"},
        },
        headers=owner["headers"],
    )
    assert r.status_code == 201
    assert "config" not in r.json()
    assert "topsecret" not in r.text


@pytest.mark.asyncio
async def test_available_integrations(client, owner):
    r = await client.get("/api/v1/integrations/available", headers=owner["headers"])
    kinds = set(r.json())
    assert {"tapo", "xiaomi", "tuya", "mqtt", "matter", "zigbee"} <= kinds
