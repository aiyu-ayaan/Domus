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
