"""In-process async event bus.

Domain code calls ``await event_bus.publish(Event(...))``. Subscribers (the WebSocket
manager, the automation engine) register async callbacks. A Redis bridge can be attached
for multi-process fan-out; without Redis everything still works in a single process.

ponytail: single global bus, callbacks run sequentially. If a subscriber is slow enough
to matter, push work onto its own task — not the bus's problem.
"""

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from backend.core.logging import get_logger

log = get_logger("events")

Subscriber = Callable[["Event"], Awaitable[None]]


@dataclass
class Event:
    type: str
    data: dict[str, Any] = field(default_factory=dict)
    home_id: str | None = None
    ts: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def as_dict(self) -> dict[str, Any]:
        return {"type": self.type, "data": self.data, "home_id": self.home_id, "ts": self.ts}


class EventBus:
    def __init__(self) -> None:
        self._subscribers: list[Subscriber] = []

    def subscribe(self, callback: Subscriber) -> None:
        self._subscribers.append(callback)

    def unsubscribe(self, callback: Subscriber) -> None:
        if callback in self._subscribers:
            self._subscribers.remove(callback)

    async def publish(self, event: Event) -> None:
        for sub in list(self._subscribers):
            try:
                await sub(event)
            except Exception:  # noqa: BLE001 — one bad subscriber must not kill the bus
                log.exception("event subscriber failed for %s", event.type)


event_bus = EventBus()


# Common event type constants
DEVICE_STATE_CHANGED = "device.state_changed"
DEVICE_ONLINE_CHANGED = "device.online_changed"
NOTIFICATION_CREATED = "notification.created"
DASHBOARD_UPDATED = "dashboard.updated"


async def _gather_nothrow(*coros: Awaitable[Any]) -> None:
    await asyncio.gather(*coros, return_exceptions=True)
