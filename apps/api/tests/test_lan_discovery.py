"""Centralized LAN discovery + the Tuya LAN fallback adapter.

No hardware: the tinytuya scanner is monkeypatched so we verify the mapping
from a raw scan result to DiscoveredDevices — the path the Integrations
"Discover" button now takes for a config-less Tuya/Wipro integration.
"""

import pytest

from backend.common.enums import IntegrationType
from backend.integrations import lan_discovery


def test_expand_targets_cidr_and_literals():
    out = lan_discovery.expand_targets(["192.168.1.0/30", "10.0.0.5", "  "])
    # /30 yields exactly two usable hosts (network/broadcast excluded).
    assert out == ["192.168.1.1", "192.168.1.2", "10.0.0.5"]


@pytest.mark.asyncio
async def test_sweep_keeps_only_truthy_answers():
    async def probe(host):
        return {"ok": host} if host.endswith(".2") else None

    res = await lan_discovery.sweep(probe, ["10.0.0.1", "10.0.0.2"], concurrency=8)
    assert res == {"10.0.0.2": {"ok": "10.0.0.2"}}


@pytest.mark.asyncio
async def test_sweep_swallows_probe_errors():
    async def probe(host):
        raise RuntimeError("unreachable")

    assert await lan_discovery.sweep(probe, ["10.0.0.1"]) == {}


@pytest.mark.asyncio
async def test_tuya_lan_discovery_maps_scan_results(monkeypatch):
    tuya_lan = pytest.importorskip("backend.integrations.adapters.tuya_lan")

    fake = {
        "bfabc": {"id": "bfabc", "ip": "192.168.1.50", "version": "3.4", "name": "Bulb"},
        "noid": {"id": "", "ip": "192.168.1.51"},  # dropped — no usable identity
    }
    monkeypatch.setattr(tuya_lan.tuya_scanner, "devices", lambda **kw: fake)

    adapter = tuya_lan.RealTuyaLanAdapter({}, IntegrationType.wipro)
    found = await adapter.discover_devices()

    assert len(found) == 1
    dev = found[0]
    assert dev.external_id == "bfabc"
    assert dev.name == "Bulb"
    assert dev.attributes == {"ip": "192.168.1.50", "version": "3.4", "needs_local_key": True}
    # Kind tracks the concrete family (Wipro/Syska are Tuya devices).
    assert adapter.kind is IntegrationType.wipro


@pytest.mark.asyncio
async def test_tuya_lan_control_requires_key():
    tuya_lan = pytest.importorskip("backend.integrations.adapters.tuya_lan")
    from backend.core.exceptions import ConflictError

    adapter = tuya_lan.RealTuyaLanAdapter({})
    # Discoverable but not controllable without a local_key.
    state = await adapter.get_state("bfabc")
    assert state.state == "unknown"
    with pytest.raises(ConflictError):
        await adapter.turn_on("bfabc")
