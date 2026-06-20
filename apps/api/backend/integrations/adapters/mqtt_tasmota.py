"""Real MQTT adapter for Tasmota-flashed devices (backed by ``aiomqtt``).

For bulbs flashed off the Tuya cloud entirely (e.g. via tuya-convert), this talks
directly to the device's Tasmota MQTT topics — no vendor cloud, no local_key.

Expected config (decrypted from the integration)::

    {
      "host": "192.168.1.10",      # MQTT broker address
      "port": 1883,                  # optional, default 1883
      "username": "...",             # optional broker auth
      "password": "...",
      "devices": [
        {"topic": "tasmota_bulb1", "name": "Living Room Bulb", "type": "light"},
        ...
      ]
    }

Tasmota's default topic layout is used: commands go to ``cmnd/<topic>/<cmd>``,
responses come back on ``stat/<topic>/RESULT``. ``<topic>`` is each device's
external_id.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import aiomqtt

from backend.common.enums import DeviceType, IntegrationType
from backend.core.exceptions import ConflictError
from backend.integrations.base import DeviceAdapter, DiscoveredDevice, StateSnapshot

_TYPE_MAP = {"light": DeviceType.light, "switch": DeviceType.switch, "plug": DeviceType.plug}

_REQUEST_TIMEOUT = 4.0


def has_real_config(config: dict[str, Any]) -> bool:
    """True when the config carries a broker host and at least one device topic."""
    devices = config.get("devices") or []
    return bool(config.get("host")) and any(d.get("topic") for d in devices)


class TasmotaMqttAdapter(DeviceAdapter):
    kind = IntegrationType.mqtt

    def __init__(self, config: dict[str, Any] | None = None):
        super().__init__(config)
        self._host = self.config["host"]
        self._port = int(self.config.get("port") or 1883)
        self._username = self.config.get("username") or None
        self._password = self.config.get("password") or None
        self._devices = {
            d["topic"]: d for d in (self.config.get("devices") or []) if d.get("topic")
        }

    def _entry(self, external_id: str) -> dict[str, Any]:
        entry = self._devices.get(external_id)
        if entry is None:
            raise ConflictError(f"MQTT device {external_id} not configured")
        return entry

    def _client(self) -> aiomqtt.Client:
        return aiomqtt.Client(
            self._host, port=self._port, username=self._username, password=self._password
        )

    async def _request(self, topic: str, command: str, payload: str = "") -> dict[str, Any]:
        """Publish a Tasmota cmnd and wait for its stat/<topic>/RESULT reply."""
        result_topic = f"stat/{topic}/RESULT"
        try:
            async with self._client() as client:
                await client.subscribe(result_topic)
                await client.publish(f"cmnd/{topic}/{command}", payload)
                async with asyncio.timeout(_REQUEST_TIMEOUT):
                    async for message in client.messages:
                        return json.loads(message.payload)
        except TimeoutError as exc:
            raise ConflictError(f"MQTT device {topic} did not respond in time") from exc
        except aiomqtt.MqttError as exc:
            raise ConflictError(f"MQTT broker error for {topic}: {exc}") from exc
        raise ConflictError(f"MQTT device {topic} did not respond")

    @staticmethod
    def _snapshot(entry: dict[str, Any], result: dict[str, Any]) -> StateSnapshot:
        attributes: dict[str, Any] = {}
        if "Dimmer" in result and entry.get("type") == "light":
            attributes["brightness"] = int(result["Dimmer"])
        if "Color" in result and entry.get("type") == "light":
            attributes["color"] = f"#{result['Color']}"
        power = str(result.get("POWER", "OFF")).lower()
        return StateSnapshot(state="on" if power == "on" else "off", attributes=attributes)

    # --- DeviceAdapter contract ----------------------------------------------

    async def discover_devices(self) -> list[DiscoveredDevice]:
        out: list[DiscoveredDevice] = []
        for topic, entry in self._devices.items():
            try:
                await self._request(topic, "STATE")
            except ConflictError:
                continue  # offline devices just don't show up
            out.append(
                DiscoveredDevice(
                    external_id=topic,
                    name=entry.get("name") or topic,
                    device_type=_TYPE_MAP.get(entry.get("type"), DeviceType.other),
                    manufacturer="Tasmota",
                    model=entry.get("type", "other"),
                    serial_number=topic,
                    attributes={},
                )
            )
        return out

    async def get_state(self, external_id: str) -> StateSnapshot:
        entry = self._entry(external_id)
        result = await self._request(external_id, "STATE")
        return self._snapshot(entry, result)

    async def turn_on(self, external_id: str) -> StateSnapshot:
        entry = self._entry(external_id)
        result = await self._request(external_id, "POWER", "ON")
        return self._snapshot(entry, result)

    async def turn_off(self, external_id: str) -> StateSnapshot:
        entry = self._entry(external_id)
        result = await self._request(external_id, "POWER", "OFF")
        return self._snapshot(entry, result)

    async def set_attributes(
        self, external_id: str, attributes: dict[str, Any]
    ) -> StateSnapshot:
        entry = self._entry(external_id)
        result: dict[str, Any] = {}

        if attributes.get("state") in ("on", "off"):
            result = await self._request(external_id, "POWER", attributes["state"].upper())

        if "brightness" in attributes and entry.get("type") == "light":
            pct = max(1, min(100, int(attributes["brightness"])))
            result = await self._request(external_id, "Dimmer", str(pct))

        is_light = entry.get("type") == "light"
        if "color" in attributes and attributes["color"] is not None and is_light:
            result = await self._request(
                external_id, "Color", attributes["color"].lstrip("#")
            )

        if not result:
            result = await self._request(external_id, "STATE")
        return self._snapshot(entry, result)
