from datetime import datetime, timedelta

import pytest

from backend.energy.service import integrate_energy_kwh


def test_integrate_energy_kwh():
    base = datetime(2026, 6, 26)
    # 200W held for 1h -> 0.2 kWh.
    steady = [(base + timedelta(seconds=2 * i), 200.0) for i in range(1801)]
    assert abs(integrate_energy_kwh(steady) - 0.2) < 1e-6
    # 0->100W ramp over 1h -> avg 50W -> 0.05 kWh.
    ramp = [(base + timedelta(minutes=m), m / 60 * 100) for m in range(61)]
    assert abs(integrate_energy_kwh(ramp) - 0.05) < 1e-6
    # A single sample can't bound an interval.
    assert integrate_energy_kwh([(base, 100.0)]) == 0.0


@pytest.mark.asyncio
async def test_plug_reports_power_and_energy_summary(client, owner, device, home):
    did = device["device"]["id"]
    H = owner["headers"]

    on = (await client.post(f"/api/v1/devices/{did}/turn-on", headers=H)).json()
    assert on["attributes"]["power_w"] == 220.0  # rated draw, deterministic under pytest

    off = (await client.post(f"/api/v1/devices/{did}/turn-off", headers=H)).json()
    assert off["attributes"]["power_w"] == 0.0

    res = await client.get("/api/v1/energy/summary", params={"home_id": home["id"]}, headers=H)
    assert res.status_code == 200
    body = res.json()
    assert any(d["device_id"] == did for d in body["devices"])
    assert body["total_kwh"] >= 0.0


@pytest.mark.asyncio
async def test_energy_summary_uses_current_consumption_fallback(client, owner, device, home, sessionmaker):
    from backend.devices.models import DeviceState
    from datetime import datetime, UTC, timedelta
    from uuid import UUID

    did = UUID(device["device"]["id"])
    H = owner["headers"]

    # Add DeviceState records with only current_consumption and no power_w
    async with sessionmaker() as session:
        now = datetime.now(UTC)
        s1 = DeviceState(
            device_id=did,
            state="on",
            attributes={"current_consumption": 100.0},
            created_at=now - timedelta(hours=2)
        )
        s2 = DeviceState(
            device_id=did,
            state="on",
            attributes={"current_consumption": 200.0},
            created_at=now - timedelta(hours=1)
        )
        session.add_all([s1, s2])
        await session.commit()

    res = await client.get("/api/v1/energy/summary", params={"home_id": home["id"], "hours": 24}, headers=H)
    assert res.status_code == 200
    body = res.json()
    
    # Check that our device was found in the energy summary list and has energy calculated
    dev_summary = next((d for d in body["devices"] if d["device_id"] == str(did)), None)
    assert dev_summary is not None
    assert dev_summary["power_w"] == 200.0  # latest power reading (from s2)
    assert dev_summary["energy_kwh"] > 0.0  # 150W average over 1h = 0.15 kWh
