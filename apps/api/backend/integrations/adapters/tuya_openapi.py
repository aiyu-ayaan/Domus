"""Real Tuya/SmartLife cloud adapter using the official Tuya OpenAPI v2.

This is the same API Home Assistant's current ``Tuya`` integration uses (the
`tuya-device-sharing-sdk`-based one, not the old `tuya:`/`smart_life:` YAML
config). Auth is a Tuya IoT Platform *Cloud Project* (``access_id`` /
``access_secret``), not your SmartLife app username/password — the legacy
``homeassistant/skill`` auth (:mod:`tuya_cloud`) is dead for most accounts;
this isn't.

Expected config (decrypted from the integration)::

    {
      "access_id": "...",      # Tuya IoT Platform project Access ID (Client ID)
      "access_secret": "...",  # Tuya IoT Platform project Access Secret
      "region": "us"            # "us" | "eu" | "cn" | "in" — must match your
                                 # linked app account's data center
    }

Setup (one-time, on Tuya's side — same as HA's official guide):
  1. iot.tuya.com -> free account -> Cloud -> Create Cloud Project.
  2. Devices tab -> Link Tuya App Account -> scan QR with SmartLife/Tuya app.
  3. Cloud -> project -> Overview: copy Access ID / Access Secret here.

Tuya devices report state/take commands via versioned "DP codes" that vary by
device category (e.g. power might be ``switch_1`` or ``switch_led``,
brightness ``bright_value`` or ``bright_value_v2``). Rather than hardcode a
category table, codes are detected from the device's own status response.

ponytail: code-name detection by substring match covers common switches/bulbs;
exotic categories (covers, locks, thermostats) aren't mapped. Ceiling: add a
per-category code table if non-light/switch Tuya devices are needed.
"""

from __future__ import annotations

import asyncio
import json
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
    "dj": DeviceType.light,
    "dc": DeviceType.light,
    "fwd": DeviceType.light,
    "tgq": DeviceType.light,
    "kg": DeviceType.switch,
    "cz": DeviceType.plug,
    "pc": DeviceType.plug,
}


def has_real_config(config: dict[str, Any]) -> bool:
    """True when the config carries Tuya IoT Platform cloud-project credentials."""
    return bool(config.get("access_id") and config.get("access_secret"))


class RealTuyaOpenApiAdapter(DeviceAdapter):
    kind = IntegrationType.tuya

    def __init__(
        self,
        config: dict[str, Any] | None = None,
        kind: IntegrationType | None = None,
    ):
        if _TINYTUYA_IMPORT_ERROR is not None:
            raise RuntimeError(
                "tinytuya is required for Tuya OpenAPI control. "
                "Install it with: pip install tinytuya"
            ) from _TINYTUYA_IMPORT_ERROR
        super().__init__(config)
        if kind is not None:
            self.kind = kind
        self._access_id = self.config["access_id"]
        self._access_secret = self.config["access_secret"]
        self._region = self.config.get("region") or "us"
        self._cloud: Any | None = None  # lazy login on first use

    def _ensure_cloud(self) -> Any:
        if self._cloud is None:
            self._cloud = tinytuya.Cloud(
                apiRegion=self._region,
                apiKey=self._access_id,
                apiSecret=self._access_secret,
            )
        return self._cloud

    @staticmethod
    def _raise_if_error(response: Any, context: str) -> dict[str, Any]:
        if not isinstance(response, dict) or response.get("success") is False:
            raise ConflictError(f"Tuya OpenAPI {context} failed: {response}")
        return response

    def _devices(self) -> list[dict[str, Any]]:
        result = self._ensure_cloud().getdevices()
        if isinstance(result, dict) and result.get("Error"):
            raise ConflictError(f"Tuya OpenAPI device list failed: {result}")
        return result if isinstance(result, list) else []

    def _status_codes(self, device_id: str) -> dict[str, Any]:
        response = self._raise_if_error(
            self._ensure_cloud().getstatus(device_id), f"status for {device_id}"
        )
        return {item["code"]: item["value"] for item in response.get("result", [])}

    @staticmethod
    def _find_code(codes: dict[str, Any], *substrings: str) -> str | None:
        for code in codes:
            lowered = code.lower()
            if any(s in lowered for s in substrings):
                return code
        return None

    def _send(self, device_id: str, code: str, value: Any) -> None:
        self._raise_if_error(
            self._ensure_cloud().sendcommand(device_id, {"commands": [{"code": code, "value": value}]}),
            f"command {code} for {device_id}",
        )

    def _snapshot(self, codes: dict[str, Any]) -> StateSnapshot:
        power_code = self._find_code(codes, "switch")
        attributes: dict[str, Any] = {}
        bright_code = self._find_code(codes, "bright")
        if bright_code is not None:
            attributes["brightness"] = round(int(codes[bright_code]) / 10)
        colour_code = self._find_code(codes, "colour", "color")
        if colour_code is not None and codes[colour_code]:
            try:
                hsv = json.loads(codes[colour_code])
                attributes["color"] = _hsv_to_hex(hsv["h"], hsv["s"], hsv["v"])
            except (ValueError, KeyError, TypeError):
                pass
        is_on = bool(codes.get(power_code)) if power_code else False
        return StateSnapshot(state="on" if is_on else "off", attributes=attributes)

    # --- DeviceAdapter contract ----------------------------------------------

    async def discover_devices(self) -> list[DiscoveredDevice]:
        devices = await asyncio.to_thread(self._devices)
        out: list[DiscoveredDevice] = []
        for dev in devices:
            category = dev.get("category", "")
            if category == "scene":
                continue
            out.append(
                DiscoveredDevice(
                    external_id=dev["id"],
                    name=dev.get("name", dev["id"]),
                    device_type=_TYPE_MAP.get(category, DeviceType.other),
                    manufacturer="Tuya/SmartLife",
                    model=dev.get("product_name", category),
                    serial_number=dev["id"],
                    attributes={"online": dev.get("online", True)},
                )
            )
        return out

    async def get_state(self, external_id: str) -> StateSnapshot:
        codes = await asyncio.to_thread(self._status_codes, external_id)
        return self._snapshot(codes)

    async def turn_on(self, external_id: str) -> StateSnapshot:
        return await asyncio.to_thread(self._set_power, external_id, True)

    async def turn_off(self, external_id: str) -> StateSnapshot:
        return await asyncio.to_thread(self._set_power, external_id, False)

    def _set_power(self, external_id: str, on: bool) -> StateSnapshot:
        codes = self._status_codes(external_id)
        power_code = self._find_code(codes, "switch") or "switch_1"
        self._send(external_id, power_code, on)
        return self._snapshot(self._status_codes(external_id))

    async def set_attributes(
        self, external_id: str, attributes: dict[str, Any]
    ) -> StateSnapshot:
        return await asyncio.to_thread(self._set_attributes, external_id, attributes)

    def _set_attributes(self, external_id: str, attributes: dict[str, Any]) -> StateSnapshot:
        codes = self._status_codes(external_id)

        if attributes.get("state") in ("on", "off"):
            power_code = self._find_code(codes, "switch") or "switch_1"
            self._send(external_id, power_code, attributes["state"] == "on")

        bright_code = self._find_code(codes, "bright")
        if "brightness" in attributes and bright_code is not None:
            try:
                pct = max(1, min(100, int(attributes["brightness"])))
                self._send(external_id, bright_code, pct * 10)
            except Exception:  # noqa: BLE001 - best-effort, device may not dim
                pass

        colour_code = self._find_code(codes, "colour", "color")
        if "color" in attributes and colour_code is not None:
            try:
                h, s, v = _hex_to_hsv(attributes["color"])
                self._send(external_id, colour_code, json.dumps({"h": h, "s": s, "v": v}))
            except Exception:  # noqa: BLE001 - best-effort, device may not be RGB
                pass

        return self._snapshot(self._status_codes(external_id))


def _hex_to_hsv(color_hex: str) -> tuple[int, int, int]:
    """'#ff8800' -> (h 0-360, s 0-1000, v 0-1000) for Tuya's colour_data_v2 DP."""
    import colorsys

    color_hex = color_hex.lstrip("#")
    r, g, b = (int(color_hex[i : i + 2], 16) / 255.0 for i in (0, 2, 4))
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    return int(h * 360), int(s * 1000), int(v * 1000)


def _hsv_to_hex(h: int, s: int, v: int) -> str:
    """Tuya's (h 0-360, s 0-1000, v 0-1000) -> '#rrggbb'."""
    import colorsys

    r, g, b = colorsys.hsv_to_rgb(h / 360.0, s / 1000.0, v / 1000.0)
    return f"#{int(r * 255):02x}{int(g * 255):02x}{int(b * 255):02x}"
