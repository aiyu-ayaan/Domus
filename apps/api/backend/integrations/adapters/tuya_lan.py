"""LAN discovery for Tuya / SmartLife when no cloud project or local keys are set.

The cloud adapter (:mod:`tuya_openapi`) needs Tuya IoT Platform credentials and
the local adapter (:mod:`tuya_local`) needs a per-device ``local_key`` — neither
of which a user has on first run. This adapter is the registry's Tuya-family
*fallback*: it scans the LAN for devices so the Integrations "Discover" button
actually returns something, instead of the in-memory mock's empty list.

Why ``tinytuya.scanner`` and not bare ``deviceScan``: inside Docker bridge
networking UDP broadcast can't escape to the LAN. ``scanner.devices(forcescan=
[subnets])`` does a *unicast* TCP probe of port 6668 across those CIDRs, which a
bridge container can route — the same trick the Tapo adapter uses, driven by the
shared ``DISCOVERY_SUBNETS`` setting.

A LAN scan can recover a device's id / ip / protocol version but **not** its
``local_key`` (that only ever comes from Tuya's cloud, once). So discovered
devices are registered for visibility but can't be controlled until the user
adds ``{id, ip, local_key, version}`` to the integration config — at which point
:func:`backend.integrations.registry.get_adapter` upgrades them to the local
adapter, keyed by the same device id (the ``external_id`` here), so no
re-discovery is needed.
"""

from __future__ import annotations

import asyncio
from typing import Any

try:
    import tinytuya  # noqa: F401  (imported so scanner submodule is available)
    import tinytuya.scanner as tuya_scanner

    TINYTUYA_AVAILABLE = True
except ModuleNotFoundError:  # pragma: no cover - exercised without the dep
    tinytuya = None  # type: ignore[assignment]
    tuya_scanner = None  # type: ignore[assignment]
    TINYTUYA_AVAILABLE = False

from backend.common.enums import DeviceType, IntegrationType
from backend.core.exceptions import ConflictError
from backend.integrations import lan_discovery
from backend.integrations.base import DeviceAdapter, DiscoveredDevice, StateSnapshot


class RealTuyaLanAdapter(DeviceAdapter):
    kind = IntegrationType.tuya

    def __init__(
        self,
        config: dict[str, Any] | None = None,
        kind: IntegrationType | None = None,
    ):
        if not TINYTUYA_AVAILABLE:
            raise RuntimeError(
                "tinytuya is required for Tuya LAN discovery. "
                "Install it with: pip install tinytuya"
            )
        super().__init__(config)
        if kind is not None:
            self.kind = kind

    def _scan(self) -> dict[str, Any]:
        subnets = lan_discovery.discovery_subnets()
        # forcescan=<subnets> → TCP port-6668 sweep of those CIDRs (unicast, so it
        # routes out of a Docker bridge); discover=True also tries the broadcast
        # fast path for when the API is on the LAN / host networking. poll=False:
        # we have no local_key, so there's nothing to read — skip the slow poll.
        return tuya_scanner.devices(
            verbose=False,
            scantime=5,
            color=False,
            poll=False,
            forcescan=subnets or False,
            discover=True,
            assume_yes=True,
        )

    # --- DeviceAdapter contract ----------------------------------------------

    async def discover_devices(self) -> list[DiscoveredDevice]:
        found = await asyncio.to_thread(self._scan)
        out: list[DiscoveredDevice] = []
        for info in (found or {}).values():
            dev_id = info.get("id") or info.get("gwId")
            if not dev_id:
                continue  # battery/offline node with no usable identity
            out.append(
                DiscoveredDevice(
                    external_id=str(dev_id),
                    name=info.get("name") or str(dev_id),
                    device_type=DeviceType.light,
                    manufacturer="Tuya/SmartLife (LAN)",
                    model="tuya",
                    serial_number=str(dev_id),
                    attributes={
                        "ip": info.get("ip"),
                        "version": str(info.get("version") or "3.3"),
                        # Flag the UI/poller can read: found, but unusable till keyed.
                        "needs_local_key": True,
                    },
                )
            )
        return out

    async def get_state(self, external_id: str) -> StateSnapshot:
        # Found on the LAN but its DPS can't be read without the local_key.
        # Report "unknown" rather than raising so the poller doesn't spam errors.
        return StateSnapshot(state="unknown", attributes={"needs_local_key": True})

    async def turn_on(self, external_id: str) -> StateSnapshot:
        return self._needs_key()

    async def turn_off(self, external_id: str) -> StateSnapshot:
        return self._needs_key()

    @staticmethod
    def _needs_key() -> StateSnapshot:
        raise ConflictError(
            "This Tuya device was found on the LAN but needs a local_key before it "
            "can be controlled. Add its id/ip/local_key to the integration, or set "
            "up a Tuya Cloud project (Access ID/Secret)."
        )
