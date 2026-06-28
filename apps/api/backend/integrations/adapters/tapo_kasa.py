"""Real TP-Link Tapo / Kasa adapter backed by ``python-kasa``.

Unlike :class:`TapoAdapter` (the in-memory mock), this talks to physical devices
over the LAN. It is selected by :func:`backend.integrations.registry.get_adapter`
only when the integration's encrypted config carries credentials or explicit
hosts — so the mock keeps powering tests and the no-hardware demo path.

Expected config (decrypted from the integration)::

    {
      "username": "you@example.com",   # TP-Link account email (required for Tapo/KLAP)
      "password": "...",               # also read from "token" for form compatibility
      "hosts": ["192.168.1.50", ...]   # optional explicit device IPs
      "host": "192.168.1.50"           # optional single host (from the integrations form)
                                       # — may be a CIDR ("192.168.1.0/24") to sweep a subnet
    }

Reaching hardware from Docker:
  * Bare broadcast discovery (``Discover.discover()``) needs the container on the
    devices' LAN — i.e. run locally or with Docker host networking (Linux only).
  * Otherwise set ``DISCOVERY_SUBNETS`` (e.g. "192.168.1.0/24") in the env: when
    broadcast finds nothing, discovery falls back to a *unicast* sweep of those
    subnets, which works from a plain bridge container on any OS (Docker Desktop
    included) since unicast to LAN IPs is NAT-routed; broadcast isn't. A per-
    integration CIDR in the host field still works too and takes precedence.

Each device's IP is stored as its ``external_id``, so control connects straight
to that address.
"""

from __future__ import annotations

import asyncio
import ipaddress
from typing import Any

# python-kasa is an optional/heavy dependency. Importing this module must stay
# cheap and kasa-free so the registry can run has_real_config() and keep the mock
# path alive when the library isn't installed. The library is only needed to
# actually instantiate RealTapoAdapter.
try:
    from kasa import Credentials, Discover, KasaException, Module

    _KASA_IMPORT_ERROR: ModuleNotFoundError | None = None
except ModuleNotFoundError as exc:  # pragma: no cover - exercised without the dep
    Credentials = Discover = KasaException = Module = None  # type: ignore[assignment]
    _KASA_IMPORT_ERROR = exc

from backend.common.enums import DeviceType, IntegrationType
from backend.core.exceptions import ConflictError
from backend.integrations.base import (
    DeviceAdapter,
    DiscoveredDevice,
    StateSnapshot,
)

# python-kasa device-type value -> our DeviceType enum.
_TYPE_MAP = {
    "plug": DeviceType.plug,
    "strip": DeviceType.plug,
    "powerstrip": DeviceType.plug,
    "bulb": DeviceType.light,
    "lightstrip": DeviceType.light,
    "dimmer": DeviceType.light,
    "wallswitch": DeviceType.switch,
    "switch": DeviceType.switch,
    "fan": DeviceType.fan,
    "thermostat": DeviceType.thermostat,
    "camera": DeviceType.camera,
    "sensor": DeviceType.sensor,
}


def has_real_config(config: dict[str, Any]) -> bool:
    """True when the config is provisioned for real hardware control."""
    has_creds = bool(
        (config.get("username") or config.get("email"))
        and (config.get("password") or config.get("token"))
    )
    has_hosts = bool(config.get("hosts") or config.get("host"))
    return has_creds or has_hosts


def _device_type(dev: Any) -> DeviceType:
    raw = getattr(dev.device_type, "value", str(dev.device_type)).lower()
    return _TYPE_MAP.get(raw, DeviceType.other)


class RealTapoAdapter(DeviceAdapter):
    kind = IntegrationType.tapo

    def __init__(self, config: dict[str, Any] | None = None):
        if _KASA_IMPORT_ERROR is not None:
            raise RuntimeError(
                "python-kasa is required for real Tapo control. "
                "Install it with: pip install python-kasa"
            ) from _KASA_IMPORT_ERROR
        super().__init__(config)
        username = self.config.get("username") or self.config.get("email")
        password = self.config.get("password") or self.config.get("token")
        self._credentials = Credentials(username, password) if username and password else None
        hosts = self.config.get("hosts")
        if not hosts and self.config.get("host"):
            hosts = [self.config["host"]]
        self._hosts: list[str] = list(hosts or [])

    async def _connect(self, host: str) -> Any:
        try:
            # ponytail: explicit 5 s timeout — the kasa default is unspecified and can
            # hang for tens of seconds on an unreachable device, blocking the poller loop.
            dev = await Discover.discover_single(host, credentials=self._credentials, timeout=5)
            await dev.update()
            return dev
        except KasaException as exc:
            raise ConflictError(f"Could not reach Tapo device {host}: {exc}") from exc

    # Energy-monitoring fields exposed by python-kasa's Energy module. Each is
    # optional — a plug without voltage/current sensing simply reports None and
    # the key is dropped. Units: W, V, A, kWh, kWh, kWh.
    _ENERGY_FIELDS = (
        "current_consumption",
        "voltage",
        "current",
        "consumption_today",
        "consumption_this_month",
        "consumption_total",
    )

    def _snapshot(self, dev: Any) -> StateSnapshot:
        attributes: dict[str, Any] = {"model": dev.model}
        energy = dev.modules.get(Module.Energy)
        if energy is not None:
            for field_name in self._ENERGY_FIELDS:
                value = getattr(energy, field_name, None)
                if value is not None:
                    attributes[field_name] = float(value)

        # Capture light attributes if it is a smart bulb/light
        if hasattr(dev, "brightness") or _device_type(dev) == DeviceType.light:
            if hasattr(dev, "brightness"):
                attributes["brightness"] = dev.brightness
            if hasattr(dev, "color_temp") and dev.color_temp and dev.color_temp > 0:
                attributes["color_temp"] = dev.color_temp
                attributes["color"] = None
                attributes["hsv"] = None
            else:
                attributes["color_temp"] = 0
                if hasattr(dev, "hsv"):
                    hsv = dev.hsv
                    attributes["hsv"] = list(hsv) if hsv else None
                    if hsv:
                        # Convert HSV (Hue: 0-360, Sat: 0-100, Val: 0-100) to Hex color for UI
                        h, s, v = hsv
                        import colorsys

                        r, g, b = colorsys.hsv_to_rgb(h / 360.0, s / 100.0, 1.0)
                        attributes["color"] = f"#{int(r*255):02x}{int(g*255):02x}{int(b*255):02x}"

        return StateSnapshot(
            state="on" if dev.is_on else "off",
            attributes=attributes,
        )

    @staticmethod
    def _expand_targets(hosts: list[str]) -> list[str]:
        """Expand any CIDR entries (e.g. "192.168.1.0/24") to their host IPs.

        Plain IPs/hostnames pass through unchanged. A CIDR turns discovery into a
        unicast subnet sweep — the only thing that reaches LAN devices from inside
        a Docker bridge container, which silently drops the normal UDP broadcast
        that ``Discover.discover()`` relies on.
        """
        targets: list[str] = []
        for raw in hosts:
            entry = raw.strip()
            if "/" in entry:
                try:
                    net = ipaddress.ip_network(entry, strict=False)
                    targets.extend(str(ip) for ip in net.hosts())
                    continue
                except ValueError:
                    pass  # not a CIDR — fall through and treat as a literal host
            if entry:
                targets.append(entry)
        return targets

    async def _scan(self, targets: list[str]) -> dict[str, Any]:
        """Unicast-probe each target concurrently; keep only the ones that answer.

        Best-effort by design: unreachable IPs in a swept subnet are the common
        case, so per-host failures are swallowed rather than raised.
        """
        # ponytail: 256 in-flight covers a whole /24 in one ~timeout-long wave
        # (most IPs don't answer, so the timeout dominates). A /16 would still
        # batch — raise the cap or shard the range if that ever matters.
        sem = asyncio.Semaphore(256)

        async def probe(host: str) -> tuple[str, Any]:
            async with sem:
                try:
                    return host, await Discover.discover_single(
                        host, credentials=self._credentials, timeout=3
                    )
                except Exception:
                    return host, None

        results = await asyncio.gather(*(probe(h) for h in targets))
        return {host: dev for host, dev in results if dev is not None}

    @staticmethod
    def _discovery_subnets() -> list[str]:
        """Server-wide LAN subnets to unicast-sweep, from DISCOVERY_SUBNETS in .env.

        This is what makes the Integrations "scan" button find devices from inside
        Docker without per-integration setup: broadcast can't cross the bridge, so
        we sweep these instead. Lazy import keeps module load kasa-/settings-free.
        """
        from backend.core.config import settings

        return [s.strip() for s in settings.discovery_subnets.split(",") if s.strip()]

    async def _broadcast(self) -> dict[str, Any]:
        """UDP-broadcast discovery. Works when the API is on the LAN (run locally
        or with Docker host networking). Returns {} (not an error) when broadcast
        can't escape — e.g. a Docker bridge — so the caller can fall back to a sweep.
        """
        try:
            return await Discover.discover(credentials=self._credentials)
        except KasaException:
            return {}

    async def discover_devices(self) -> list[DiscoveredDevice]:
        explicit = self._expand_targets(self._hosts)
        if explicit:
            # Caller gave specific IPs/CIDRs — honour them exactly.
            found = await self._scan(explicit)
        else:
            # Fast path: broadcast (works on the LAN / host networking). When it
            # finds nothing — the usual Docker-bridge case — sweep the configured
            # subnet(s) by unicast, which a bridge container *can* route to the LAN.
            found = await self._broadcast()
            if not found:
                found = await self._scan(self._expand_targets(self._discovery_subnets()))

        devices: list[DiscoveredDevice] = []
        try:
            for host, dev in found.items():
                await dev.update()
                devices.append(
                    DiscoveredDevice(
                        # ponytail: IP as identity; re-discover if it changes.
                        # Upgrade: persist MAC and resolve via discovery.
                        external_id=host,
                        name=dev.alias or dev.model or host,
                        device_type=_device_type(dev),
                        manufacturer="TP-Link",
                        model=dev.model,
                        serial_number=getattr(dev, "mac", None),
                        attributes={"host": host, "mac": getattr(dev, "mac", None)},
                    )
                )
        finally:
            for dev in found.values():
                if hasattr(dev, "disconnect"):
                    try:
                        await dev.disconnect()
                    except Exception:
                        pass
        return devices

    async def get_state(self, external_id: str) -> StateSnapshot:
        dev = await self._connect(external_id)
        try:
            return self._snapshot(dev)
        finally:
            if hasattr(dev, "disconnect"):
                try:
                    await dev.disconnect()
                except Exception:
                    pass

    async def turn_on(self, external_id: str) -> StateSnapshot:
        dev = await self._connect(external_id)
        try:
            await dev.turn_on()
            await dev.update()
            return self._snapshot(dev)
        finally:
            if hasattr(dev, "disconnect"):
                try:
                    await dev.disconnect()
                except Exception:
                    pass

    async def turn_off(self, external_id: str) -> StateSnapshot:
        dev = await self._connect(external_id)
        try:
            await dev.turn_off()
            await dev.update()
            return self._snapshot(dev)
        finally:
            if hasattr(dev, "disconnect"):
                try:
                    await dev.disconnect()
                except Exception:
                    pass

    async def toggle(self, external_id: str) -> StateSnapshot:
        # One connection instead of the base class's get_state + turn_* round-trips.
        dev = await self._connect(external_id)
        try:
            if dev.is_on:
                await dev.turn_off()
            else:
                await dev.turn_on()
            await dev.update()
            return self._snapshot(dev)
        finally:
            if hasattr(dev, "disconnect"):
                try:
                    await dev.disconnect()
                except Exception:
                    pass

    async def set_attributes(self, external_id: str, attributes: dict[str, Any]) -> StateSnapshot:
        dev = await self._connect(external_id)
        try:
            # Extract transition (ms), default to 0 to prevent overlapping firmware
            # fades from causing stutter/breaking.
            transition = attributes.get("transition", 0)

            # Set brightness (0-100)
            target_brightness = None
            if "brightness" in attributes:
                try:
                    target_brightness = int(attributes["brightness"])
                    target_brightness = max(1, min(100, target_brightness))
                except (ValueError, TypeError):
                    pass

            if target_brightness is not None and hasattr(dev, "set_brightness"):
                try:
                    await dev.set_brightness(target_brightness, transition=transition)
                except Exception:
                    try:
                        await dev.set_brightness(target_brightness)
                    except Exception:
                        pass

            # Set color temperature (Kelvin)
            if "color_temp" in attributes and hasattr(dev, "set_color_temp"):
                try:
                    color_temp = int(attributes["color_temp"])
                    await dev.set_color_temp(color_temp)
                except Exception:
                    pass

            # Set color (hex string like "#ff0000")
            if (
                "color" in attributes
                and attributes["color"] is not None
                and hasattr(dev, "set_hsv")
            ):
                try:
                    color_hex = attributes["color"].lstrip("#")
                    r = int(color_hex[0:2], 16) / 255.0
                    g = int(color_hex[2:4], 16) / 255.0
                    b = int(color_hex[4:6], 16) / 255.0

                    import colorsys

                    h, s, v = colorsys.rgb_to_hsv(r, g, b)
                    h_deg = int(h * 360)
                    s_pct = int(s * 100)

                    # Keep value/brightness at target brightness, current brightness level, or 100
                    if target_brightness is not None:
                        v_pct = target_brightness
                    elif hasattr(dev, "brightness") and dev.brightness is not None:
                        v_pct = dev.brightness
                    elif hasattr(dev, "hsv") and dev.hsv and len(dev.hsv) > 2:
                        v_pct = dev.hsv[2]
                    else:
                        v_pct = int(v * 100) if v > 0 else 100
                    v_pct = max(1, min(100, v_pct))

                    try:
                        await dev.set_hsv(h_deg, s_pct, v_pct, transition=transition)
                    except Exception:
                        await dev.set_hsv(h_deg, s_pct, v_pct)
                except Exception:
                    pass

            await dev.update()
            return self._snapshot(dev)
        finally:
            if hasattr(dev, "disconnect"):
                try:
                    await dev.disconnect()
                except Exception:
                    pass
