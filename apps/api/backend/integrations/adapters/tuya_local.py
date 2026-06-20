"""Real Tuya / SmartLife LOCAL adapter backed by ``tinytuya``.

The cloud path (:mod:`tuya_cloud`) uses tuyapy's legacy ``homeassistant/skill``
endpoint, which Tuya has been sunsetting account-by-account since ~2021 — many
accounts now get "Username or password error" on login even with correct
credentials. This adapter sidesteps the cloud entirely and talks to devices
directly on the LAN, the same way tinytuya/Local Tuya does.

Expected config (decrypted from the integration)::

    {
      "devices": [
        {
          "id": "bf1234567890abcdef",   # Tuya device id (gwId)
          "ip": "192.168.1.50",         # device LAN IP
          "local_key": "...",            # per-device local key
          "version": "3.3",              # protocol version, also "3.1"/"3.4"
          "name": "Living Room Bulb",     # optional, used as display name
          "type": "light"                # "light" | "switch" | "plug" | "other"
        },
        ...
      ]
    }

The local key has to be pulled once per device — there's no way around touching
Tuya's cloud for that. The usual sources: the Tuya IoT Platform developer
console (free project + "Link Tuya App Account"), or tinytuya's own
``python -m tinytuya wizard``. Once you have id/ip/local_key, no further cloud
calls are made — this adapter only ever talks to the device's local IP.

The API container must share the devices' LAN (Docker host networking) to
reach hardware, same constraint as the Tapo/Kasa local adapter.
"""

from __future__ import annotations

import asyncio
from typing import Any

try:
    import tinytuya

    _TINYTUYA_IMPORT_ERROR: ModuleNotFoundError | None = None
except ModuleNotFoundError as exc:  # pragma: no cover - exercised without the dep
    tinytuya = None  # type: ignore[assignment]
    _TINYTUYA_IMPORT_ERROR = exc

from backend.common.enums import DeviceType, IntegrationType
from backend.core.exceptions import ConflictError
from backend.integrations.base import DeviceAdapter, DiscoveredDevice, StateSnapshot

_TYPE_MAP = {
    "light": DeviceType.light,
    "switch": DeviceType.switch,
    "plug": DeviceType.plug,
}


def has_real_config(config: dict[str, Any]) -> bool:
    """True when the config carries at least one device with id + local_key."""
    devices = config.get("devices") or []
    return any(d.get("id") and d.get("local_key") for d in devices)


class RealTuyaLocalAdapter(DeviceAdapter):
    kind = IntegrationType.tuya

    def __init__(
        self,
        config: dict[str, Any] | None = None,
        kind: IntegrationType | None = None,
    ):
        if _TINYTUYA_IMPORT_ERROR is not None:
            raise RuntimeError(
                "tinytuya is required for local Tuya control. "
                "Install it with: pip install tinytuya"
            ) from _TINYTUYA_IMPORT_ERROR
        super().__init__(config)
        if kind is not None:
            self.kind = kind
        self._devices = {
            d["id"]: d for d in (self.config.get("devices") or []) if d.get("id")
        }

    def _entry(self, external_id: str) -> dict[str, Any]:
        entry = self._devices.get(external_id)
        if entry is None:
            raise ConflictError(f"Tuya local device {external_id} not configured")
        return entry

    def _connect(self, entry: dict[str, Any]) -> Any:
        cls = tinytuya.BulbDevice if entry.get("type") == "light" else tinytuya.Device
        dev = cls(
            dev_id=entry["id"],
            address=entry.get("ip") or None,
            local_key=entry["local_key"],
            version=float(entry.get("version") or 3.3),
        )
        dev.set_socketTimeout(5)
        return dev

    def _status(self, entry: dict[str, Any]) -> dict[str, Any]:
        dev = self._connect(entry)
        result = dev.status()
        if not result or "dps" not in result:
            raise ConflictError(
                f"Tuya local device {entry['id']} unreachable: {result}"
            )
        return result["dps"]

    @staticmethod
    def _snapshot(entry: dict[str, Any], dps: dict[str, Any]) -> StateSnapshot:
        attributes: dict[str, Any] = {}
        if entry.get("type") == "light":
            # Extract brightness from DP 2 or 22
            bright_val = dps.get("22") or dps.get("2")
            mode_val = dps.get("21") or dps.get("2") if isinstance(dps.get("2"), str) else None
            
            if bright_val is not None and not isinstance(bright_val, str):
                try:
                    val = int(bright_val)
                    attributes["brightness"] = round(val / 10) if val > 255 else round(val / 2.55)
                except (TypeError, ValueError):
                    pass

            # Extract color temperature from DP 3 or 23
            temp_val = dps.get("23") or dps.get("3")
            if temp_val is not None:
                try:
                    val = int(temp_val)
                    max_val = 1000 if val > 255 else 255
                    pct = val / max_val
                    attributes["color_temp"] = round(2700 + pct * (6500 - 2700))
                except (TypeError, ValueError):
                    pass

            # Extract color from DP 5 or 24
            color_val = dps.get("24") or dps.get("5")
            if color_val is not None and isinstance(color_val, str) and len(color_val) >= 6:
                try:
                    color_str = color_val.strip()
                    if not color_str.startswith("#"):
                        if color_str.startswith("{"):
                            import json
                            hsv = json.loads(color_str)
                            from backend.integrations.adapters.tuya_openapi import _hsv_to_hex
                            attributes["color"] = _hsv_to_hex(hsv["h"], hsv["s"], hsv["v"])
                        else:
                            if len(color_str) >= 12:
                                h = int(color_str[0:4], 16)
                                s = int(color_str[4:8], 16)
                                v = int(color_str[8:12], 16)
                                from backend.integrations.adapters.tuya_openapi import _hsv_to_hex
                                attributes["color"] = _hsv_to_hex(h, s, v)
                            else:
                                attributes["color"] = f"#{color_str[:6]}"
                    else:
                        attributes["color"] = color_str
                except Exception:
                    pass

            # Handle mutual exclusivity
            if mode_val == "colour":
                attributes["color_temp"] = 0
            elif mode_val == "white":
                attributes["color"] = None
            elif attributes.get("color_temp") and attributes["color_temp"] > 0:
                attributes["color"] = None

        power_val = dps.get("20") or dps.get("1")
        is_on = bool(power_val) if power_val is not None else False
        return StateSnapshot(state="on" if is_on else "off", attributes=attributes)

    # --- DeviceAdapter contract ----------------------------------------------

    async def discover_devices(self) -> list[DiscoveredDevice]:
        out: list[DiscoveredDevice] = []
        for entry in self._devices.values():
            try:
                await asyncio.to_thread(self._status, entry)
            except ConflictError:
                continue  # offline/unreachable devices just don't show up
            out.append(
                DiscoveredDevice(
                    external_id=entry["id"],
                    name=entry.get("name") or entry["id"],
                    device_type=_TYPE_MAP.get(entry.get("type"), DeviceType.other),
                    manufacturer="Tuya/SmartLife (local)",
                    model=entry.get("type", "other"),
                    serial_number=entry["id"],
                    attributes={"ip": entry.get("ip")},
                )
            )
        return out

    async def get_state(self, external_id: str) -> StateSnapshot:
        entry = self._entry(external_id)
        dps = await asyncio.to_thread(self._status, entry)
        return self._snapshot(entry, dps)

    async def turn_on(self, external_id: str) -> StateSnapshot:
        return await asyncio.to_thread(self._set_power, external_id, True)

    async def turn_off(self, external_id: str) -> StateSnapshot:
        return await asyncio.to_thread(self._set_power, external_id, False)

    def _set_power(self, external_id: str, on: bool) -> StateSnapshot:
        entry = self._entry(external_id)
        dev = self._connect(entry)
        (dev.turn_on if on else dev.turn_off)()
        return self._snapshot(entry, self._status(entry))

    async def set_attributes(
        self, external_id: str, attributes: dict[str, Any]
    ) -> StateSnapshot:
        return await asyncio.to_thread(self._set_attributes, external_id, attributes)

    def _set_attributes(self, external_id: str, attributes: dict[str, Any]) -> StateSnapshot:
        entry = self._entry(external_id)
        dev = self._connect(entry)

        if attributes.get("state") in ("on", "off"):
            (dev.turn_on if attributes["state"] == "on" else dev.turn_off)()

        if "brightness" in attributes and entry.get("type") == "light":
            try:
                pct = max(1, min(100, int(attributes["brightness"])))
                dev.set_brightness_percentage(pct)
            except Exception:  # noqa: BLE001 - best-effort, device may not dim
                pass

        if "color_temp" in attributes and entry.get("type") == "light":
            try:
                kelvin = int(attributes["color_temp"])
                if kelvin > 0:
                    pct = (kelvin - 2700) / (6500 - 2700)
                    pct = max(0.0, min(1.0, pct))
                    temp_val = int(pct * 1000)
                    if hasattr(dev, "set_colourtemp"):
                        dev.set_colourtemp(temp_val)
                    elif hasattr(dev, "set_white"):
                        dev.set_white(100, temp_val)
            except Exception:
                pass

        is_light = entry.get("type") == "light"
        if "color" in attributes and attributes["color"] is not None and is_light:
            try:
                color_hex = attributes["color"].lstrip("#")
                r, g, b = (int(color_hex[i : i + 2], 16) for i in (0, 2, 4))
                dev.set_colour(r, g, b)
            except Exception:  # noqa: BLE001 - best-effort, device may not be RGB
                pass

        return self._snapshot(entry, self._status(entry))
