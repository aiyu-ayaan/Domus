"""Unit tests for the real python-kasa Tapo adapter.

No hardware: a fake kasa Device is injected via monkeypatch so we verify the
adapter's state mapping and on/off/toggle logic. Skips if python-kasa isn't
installed.
"""

from types import SimpleNamespace

import pytest

kasa = pytest.importorskip("kasa")

from backend.common.enums import IntegrationType  # noqa: E402
from backend.integrations.adapters import tapo_kasa  # noqa: E402
from backend.integrations.adapters.tapo_kasa import (  # noqa: E402
    RealTapoAdapter,
    has_real_config,
)


class _FakeEnergy:
    current_consumption = 45.2


class _FakeDevice:
    def __init__(self):
        self._on = False
        self.alias = "Living Room Plug"
        self.model = "P110"
        self.mac = "AA:BB:CC:DD:EE:FF"
        self.device_type = SimpleNamespace(value="plug")
        self.modules = {kasa.Module.Energy: _FakeEnergy()}

    @property
    def is_on(self):
        return self._on

    async def update(self):
        pass

    async def turn_on(self):
        self._on = True

    async def turn_off(self):
        self._on = False


@pytest.fixture
def fake_device(monkeypatch):
    dev = _FakeDevice()

    async def _discover_single(host, credentials=None):
        return dev

    monkeypatch.setattr(
        tapo_kasa.Discover, "discover_single", staticmethod(_discover_single)
    )
    return dev


def test_has_real_config_routing():
    assert has_real_config({"username": "u@e.com", "password": "p"})
    assert has_real_config({"hosts": ["192.168.1.5"]})
    assert has_real_config({"host": "192.168.1.5"})
    # Bare/empty config must stay on the mock path.
    assert not has_real_config({})
    assert not has_real_config({"username": "u@e.com"})  # password missing


@pytest.mark.asyncio
async def test_turn_on_off_toggle_and_energy(fake_device):
    adapter = RealTapoAdapter(
        {"username": "u@e.com", "password": "p", "hosts": ["192.168.1.50"]}
    )
    assert adapter.kind is IntegrationType.tapo

    on = await adapter.turn_on("192.168.1.50")
    assert on.state == "on"
    assert on.attributes["current_consumption"] == 45.2

    off = await adapter.turn_off("192.168.1.50")
    assert off.state == "off"

    tog = await adapter.toggle("192.168.1.50")
    assert tog.state == "on"

    state = await adapter.get_state("192.168.1.50")
    assert state.state == "on"


@pytest.mark.asyncio
async def test_discover_maps_host_to_external_id(fake_device):
    adapter = RealTapoAdapter({"hosts": ["192.168.1.50"]})
    discovered = await adapter.discover_devices()
    assert len(discovered) == 1
    assert discovered[0].external_id == "192.168.1.50"
    assert discovered[0].device_type.value == "plug"
    assert discovered[0].manufacturer == "TP-Link"
