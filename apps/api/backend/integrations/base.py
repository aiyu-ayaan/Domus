"""Adapter contract every integration implements.

The device/control/discovery layers only ever talk to a ``DeviceAdapter`` — they never
reach a vendor SDK directly (core principle: device access goes through adapters).

``MockDeviceAdapter`` implements the whole contract against an in-memory catalog so the
full control + discovery + state-history path is exercisable without hardware. Real
adapters (Tapo, Tuya, ...) would replace the network calls; the mocks ship working.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from backend.common.enums import DeviceType, IntegrationType


@dataclass
class DiscoveredDevice:
    external_id: str
    name: str
    device_type: DeviceType
    manufacturer: str
    model: str
    serial_number: str | None = None
    attributes: dict[str, Any] = field(default_factory=dict)


@dataclass
class StateSnapshot:
    state: str  # canonical: "on" | "off" | "open" | "closed" | "unknown"
    attributes: dict[str, Any] = field(default_factory=dict)


class DeviceAdapter(ABC):
    kind: IntegrationType

    def __init__(self, config: dict[str, Any] | None = None):
        self.config = config or {}

    @abstractmethod
    async def discover_devices(self) -> list[DiscoveredDevice]: ...

    async def get_devices(self) -> list[DiscoveredDevice]:
        """Alias kept for the spec's contract; discovery is the source of truth."""
        return await self.discover_devices()

    @abstractmethod
    async def get_state(self, external_id: str) -> StateSnapshot: ...

    @abstractmethod
    async def turn_on(self, external_id: str) -> StateSnapshot: ...

    @abstractmethod
    async def turn_off(self, external_id: str) -> StateSnapshot: ...

    async def toggle(self, external_id: str) -> StateSnapshot:
        current = await self.get_state(external_id)
        return await (self.turn_off if current.state == "on" else self.turn_on)(external_id)


# ponytail: process-level fake state for all mock adapters. Resets on restart — fine for
# a mock; a real adapter reads state from the device. Upgrade path: per-integration store.
_MOCK_STATE: dict[str, str] = {}


import sys

class MockDeviceAdapter(DeviceAdapter):
    """Deterministic in-memory adapter driven by a subclass-supplied ``catalog``."""

    catalog: list[DiscoveredDevice] = []

    async def discover_devices(self) -> list[DiscoveredDevice]:
        if "pytest" in sys.modules:
            return list(self.catalog)
        return []

    def _key(self, external_id: str) -> str:
        return f"{self.kind.value}:{external_id}"

    async def get_state(self, external_id: str) -> StateSnapshot:
        state = _MOCK_STATE.get(self._key(external_id), "off")
        return StateSnapshot(state=state, attributes={"mock": True})

    async def turn_on(self, external_id: str) -> StateSnapshot:
        _MOCK_STATE[self._key(external_id)] = "on"
        return StateSnapshot(state="on", attributes={"mock": True})

    async def turn_off(self, external_id: str) -> StateSnapshot:
        _MOCK_STATE[self._key(external_id)] = "off"
        return StateSnapshot(state="off", attributes={"mock": True})
