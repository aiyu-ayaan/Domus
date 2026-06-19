"""Async MQTT service: subscribe, publish, auto-reconnect, topic routing.

Inbound messages are turned into bus events (``mqtt.message``) so the rest of the system
(websocket fan-out, automations) reacts to them uniformly. Only started when
``settings.mqtt_enabled`` is true.

ponytail: one client, one wildcard subscription, fixed backoff. Per-topic handlers and
QoS tuning can come when a real broker is wired in.
"""

import asyncio
import contextlib
from typing import Any

import aiomqtt

from backend.core.config import settings
from backend.core.events import Event, event_bus
from backend.core.logging import get_logger

log = get_logger("mqtt")

MQTT_MESSAGE = "mqtt.message"
DEFAULT_TOPICS = ("domus/#",)
RECONNECT_SECONDS = 5


def route_message(topic: str, payload: str) -> Event:
    """Pure mapping from an MQTT message to a bus event (unit-testable)."""
    return Event(type=MQTT_MESSAGE, data={"topic": topic, "payload": payload})


class MqttService:
    def __init__(self, topics: tuple[str, ...] = DEFAULT_TOPICS):
        self.topics = topics
        self._client: aiomqtt.Client | None = None
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    async def publish(self, topic: str, payload: str | bytes, qos: int = 0) -> None:
        if self._client is None:
            raise RuntimeError("MQTT client is not connected")
        await self._client.publish(topic, payload, qos=qos)

    async def _run(self) -> None:
        while True:
            try:
                async with aiomqtt.Client(
                    hostname=settings.mqtt_host,
                    port=settings.mqtt_port,
                    username=settings.mqtt_username,
                    password=settings.mqtt_password,
                ) as client:
                    self._client = client
                    for topic in self.topics:
                        await client.subscribe(topic)
                    log.info("MQTT connected to %s:%s", settings.mqtt_host, settings.mqtt_port)
                    async for message in client.messages:
                        await self._handle(message.topic.value, message.payload)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 — reconnect on any broker error
                log.warning("MQTT connection lost (%s); retrying in %ss", exc, RECONNECT_SECONDS)
            finally:
                self._client = None
            await asyncio.sleep(RECONNECT_SECONDS)

    async def _handle(self, topic: str, payload: Any) -> None:
        text = payload.decode() if isinstance(payload, bytes | bytearray) else str(payload)
        await event_bus.publish(route_message(topic, text))


mqtt_service = MqttService()
