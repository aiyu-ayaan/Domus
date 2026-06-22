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
    current_consumption = 45.2  # W
    voltage = 229.8  # V
    current = 0.197  # A
    consumption_today = 0.84  # kWh
    consumption_this_month = 12.6  # kWh
    consumption_total = 318.4  # kWh


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

    async def disconnect(self):
        pass


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
    # Full energy feature set surfaces through attributes.
    assert on.attributes["current_consumption"] == 45.2
    assert on.attributes["voltage"] == 229.8
    assert on.attributes["current"] == 0.197
    assert on.attributes["consumption_today"] == 0.84
    assert on.attributes["consumption_this_month"] == 12.6
    assert on.attributes["consumption_total"] == 318.4

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


class _FakeLight:
    def __init__(self):
        self._on = False
        self.alias = "Tapo Smart Bulb"
        self.model = "L530"
        self.mac = "AA:BB:CC:DD:EE:FE"
        self.device_type = SimpleNamespace(value="bulb")
        self.modules = {}
        self.brightness = 75
        self.color_temp = 0
        self.hsv = (0, 0, 75)

    @property
    def is_on(self):
        return self._on

    async def update(self):
        pass

    async def turn_on(self):
        self._on = True

    async def turn_off(self):
        self._on = False

    async def set_brightness(self, value):
        self.brightness = value
        self.hsv = (self.hsv[0], self.hsv[1], value)

    async def set_color_temp(self, value):
        self.color_temp = value

    async def set_hsv(self, h, s, v):
        self.hsv = (h, s, v)
        self.brightness = v

    async def disconnect(self):
        pass


@pytest.mark.asyncio
async def test_set_attributes_preserves_brightness(monkeypatch):
    light = _FakeLight()

    async def _discover_single(host, credentials=None):
        return light

    monkeypatch.setattr(
        tapo_kasa.Discover, "discover_single", staticmethod(_discover_single)
    )

    adapter = RealTapoAdapter({"hosts": ["192.168.1.51"]})

    # Initially brightness is 75. Setting color temp only.
    await adapter.set_attributes("192.168.1.51", {"color_temp": 4000})
    assert light.color_temp == 4000
    assert light.brightness == 75

    # Setting color only. Existing brightness 75 should be preserved, not overridden to 100.
    await adapter.set_attributes("192.168.1.51", {"color": "#ff0000"})
    assert light.hsv[0] == 0  # Red hue is 0
    assert light.hsv[1] == 100  # Fully saturated
    assert light.hsv[2] == 75  # Brightness is preserved at 75!
    assert light.brightness == 75

    # Setting color and brightness together.
    await adapter.set_attributes("192.168.1.51", {"color": "#ff0000", "brightness": 42})
    assert light.hsv[2] == 42
    assert light.brightness == 42

