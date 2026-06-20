"""Real Tuya / SmartLife cloud adapter backed by ``tuyapy``.

This mirrors what Home Assistant's legacy ``tuya:`` integration did with::

    tuya:
      username: 'me@emailid.com'
      password: 'mypassword'
      country_code: '91'
      platform: 'smart_life'

Wipro (and Syska) bulbs don't expose a usable local API and don't register on the
Tuya/SmartLife LAN mesh, so they're controlled through the SmartLife cloud — same as
HA. It is selected by :func:`backend.integrations.registry.get_adapter` only when the
integration's encrypted config carries cloud credentials, so the mock keeps powering
tests and the no-hardware demo path.

Expected config (decrypted from the integration)::

    {
      "username": "you@example.com",   # SmartLife / Tuya app account (also "email")
      "password": "...",               # also read from "token" for form compatibility
      "country_code": "91",            # phone country code, no '+' (also "countryCode")
      "platform": "smart_life"         # "smart_life" | "tuya" | "jinvoo_smart"
    }

ponytail: tuyapy is the legacy cloud library HA used; its cloud endpoints are aging.
Ceiling: if SmartLife cloud login dies, upgrade path is local control via ``tinytuya``
with per-device local keys.
"""

from __future__ import annotations

import asyncio
from typing import Any

# tuyapy is an optional dependency. Importing this module must stay cheap so the
# registry can run has_real_config() and keep the mock path alive when the library
# isn't installed. The library is only needed to instantiate RealTuyaAdapter.
try:
    from tuyapy import TuyaApi

    _TUYA_IMPORT_ERROR: ModuleNotFoundError | None = None
except ModuleNotFoundError as exc:  # pragma: no cover - exercised without the dep
    TuyaApi = None  # type: ignore[assignment]
    _TUYA_IMPORT_ERROR = exc

from backend.common.enums import DeviceType, IntegrationType
from backend.core.exceptions import ConflictError
from backend.integrations.base import DeviceAdapter, DiscoveredDevice, StateSnapshot

# tuyapy object_type value -> our DeviceType enum.
_TYPE_MAP = {
    "light": DeviceType.light,
    "switch": DeviceType.switch,
    "scene": DeviceType.other,
    "climate": DeviceType.thermostat,
    "fan": DeviceType.fan,
    "cover": DeviceType.other,
    "lock": DeviceType.lock,
}


def has_real_config(config: dict[str, Any]) -> bool:
    """True when the config is provisioned for real SmartLife/Tuya cloud control."""
    has_creds = bool((config.get("username") or config.get("email")) and (
        config.get("password") or config.get("token")
    ))
    has_country = bool(config.get("country_code") or config.get("countryCode"))
    return has_creds and has_country


class RealTuyaAdapter(DeviceAdapter):
    kind = IntegrationType.tuya

    def __init__(
        self,
        config: dict[str, Any] | None = None,
        kind: IntegrationType | None = None,
    ):
        if _TUYA_IMPORT_ERROR is not None:
            raise RuntimeError(
                "tuyapy is required for real Tuya/SmartLife control. "
                "Install it with: pip install tuyapy"
            ) from _TUYA_IMPORT_ERROR
        super().__init__(config)
        if kind is not None:
            # Wipro/Syska are SmartLife devices; keep the integration's own kind.
            self.kind = kind
        self._username = self.config.get("username") or self.config.get("email")
        self._password = self.config.get("password") or self.config.get("token")
        self._country_code = str(
            self.config.get("country_code") or self.config.get("countryCode") or "1"
        )
        self._platform = self.config.get("platform") or "smart_life"
        self._api: Any | None = None  # lazy login on first use

    # --- sync cloud helpers (run inside asyncio.to_thread) ---------------------

    def _ensure_api(self) -> Any:
        # ponytail: tuyapy keeps auth in a module-level global, so one SmartLife
        # account per process is the safe assumption. Ceiling: two real Tuya-family
        # integrations on different accounts would clobber each other's session.
        if self._api is None:
            api = TuyaApi()
            api.init(self._username, self._password, self._country_code, self._platform)
            self._api = api
        return self._api

    def _all_devices(self) -> list[Any]:
        # _ensure_api() logs in once per adapter instance, and login populates the
        # device list with fresh state. Adapters are built per request, so each call
        # path re-logs in and sees current state — no separate poll needed.
        try:
            return self._ensure_api().get_all_devices()
        except Exception as exc:  # tuyapy raises bare Exceptions on auth/network fail
            raise ConflictError(f"Tuya cloud request failed: {exc}") from exc

    def _find(self, external_id: str) -> Any:
        for dev in self._all_devices():
            if dev.obj_id == external_id:
                return dev
        raise ConflictError(f"Tuya device {external_id} not found in account")

    @staticmethod
    def _snapshot(dev: Any) -> StateSnapshot:
        attributes: dict[str, Any] = {"model": dev.object_type()}
        brightness = getattr(dev, "brightness", None)
        if callable(brightness):
            raw = brightness()
            if raw is not None:
                # tuyapy reports brightness on a 0-255 scale; expose 0-100 for the UI.
                attributes["brightness"] = round(int(raw) / 255 * 100)
        return StateSnapshot(state="on" if dev.state() else "off", attributes=attributes)

    # --- DeviceAdapter contract ----------------------------------------------

    async def discover_devices(self) -> list[DiscoveredDevice]:
        devices = await asyncio.to_thread(self._all_devices)
        out: list[DiscoveredDevice] = []
        for dev in devices:
            object_type = dev.object_type()
            if object_type == "scene":  # scenes aren't controllable device nodes
                continue
            out.append(
                DiscoveredDevice(
                    external_id=dev.obj_id,
                    name=dev.name(),
                    device_type=_TYPE_MAP.get(object_type, DeviceType.other),
                    manufacturer="Tuya/SmartLife",
                    model=object_type,
                    serial_number=dev.obj_id,
                    attributes={"brightness": 100, "color": "#ffffff"},
                )
            )
        return out

    async def get_state(self, external_id: str) -> StateSnapshot:
        dev = await asyncio.to_thread(self._find, external_id)
        return self._snapshot(dev)

    async def turn_on(self, external_id: str) -> StateSnapshot:
        return await asyncio.to_thread(self._set_power, external_id, True)

    async def turn_off(self, external_id: str) -> StateSnapshot:
        return await asyncio.to_thread(self._set_power, external_id, False)

    def _set_power(self, external_id: str, on: bool) -> StateSnapshot:
        dev = self._find(external_id)
        (dev.turn_on if on else dev.turn_off)()
        return StateSnapshot(state="on" if on else "off", attributes=self._snapshot(dev).attributes)

    async def set_attributes(
        self, external_id: str, attributes: dict[str, Any]
    ) -> StateSnapshot:
        return await asyncio.to_thread(self._set_attributes, external_id, attributes)

    def _set_attributes(self, external_id: str, attributes: dict[str, Any]) -> StateSnapshot:
        dev = self._find(external_id)

        if attributes.get("state") in ("on", "off"):
            (dev.turn_on if attributes["state"] == "on" else dev.turn_off)()

        if "brightness" in attributes and hasattr(dev, "set_brightness"):
            try:
                pct = max(1, min(100, int(attributes["brightness"])))
                dev.set_brightness(round(pct / 100 * 255))  # tuyapy wants 0-255
            except Exception:  # noqa: BLE001 - best-effort, device may not dim
                pass

        if "color" in attributes and hasattr(dev, "set_color"):
            try:
                dev.set_color(list(_hex_to_hsv(attributes["color"])))
            except Exception:  # noqa: BLE001 - best-effort, device may not be RGB
                pass

        return self._snapshot(dev)


def _hex_to_hsv(color_hex: str) -> tuple[int, int, float]:
    """'#ff8800' -> (hue 0-360, saturation 0-100, brightness 0-1) for tuyapy.set_color."""
    import colorsys

    color_hex = color_hex.lstrip("#")
    r, g, b = (int(color_hex[i : i + 2], 16) / 255.0 for i in (0, 2, 4))
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    return int(h * 360), int(s * 100), round(v, 3)
