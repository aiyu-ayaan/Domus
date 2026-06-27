"""Cross-process WebSocket fan-out over Redis pub/sub.

With more than one API worker, a device controlled on worker A must reach clients on
worker B. Each worker publishes bus events to a Redis channel and runs a subscriber that
re-broadcasts received events to its own local sockets.

ponytail: one channel, JSON payloads, best-effort. If Redis is down the local fan-out
still works; you just lose cross-process delivery. Degrades, doesn't crash.
"""

import asyncio
import json
import uuid

from backend.core import redis as redis_mod
from backend.core.events import Event, event_bus
from backend.core.logging import get_logger

log = get_logger("ws.redis")

CHANNEL = "domus:events"
# Per-process id: the manager is already subscribed directly to the bus, so this
# worker has delivered to its own sockets before the event reaches Redis. Without
# this tag the message echoes back through _consume and every local client gets it
# twice (double fan-out CPU + double-fired UI updates).
_SENDER = uuid.uuid4().hex
_task: asyncio.Task | None = None


async def _publish_to_redis(event: Event) -> None:
    payload = event.as_dict()
    payload["_sender"] = _SENDER
    await redis_mod.publish(CHANNEL, json.dumps(payload))


async def _consume() -> None:
    from backend.websocket.manager import manager

    try:
        pubsub = redis_mod.get_redis().pubsub()
        await pubsub.subscribe(CHANNEL)
    except Exception:  # noqa: BLE001
        log.warning("redis pub/sub unavailable; cross-process WS fan-out disabled")
        return
    async for message in pubsub.listen():
        if message.get("type") != "message":
            continue
        try:
            data = json.loads(message["data"])
            if data.get("_sender") == _SENDER:
                continue  # our own event — already delivered to local sockets
            await manager.send_event(
                Event(type=data["type"], data=data.get("data", {}), home_id=data.get("home_id"))
            )
        except Exception:  # noqa: BLE001
            log.exception("failed to relay redis event")


async def start() -> None:
    """Subscribe the bus→redis publisher and start the redis→local consumer task."""
    global _task
    event_bus.subscribe(_publish_to_redis)
    if _task is None:
        _task = asyncio.create_task(_consume())


async def stop() -> None:
    global _task
    if _task is not None:
        _task.cancel()
        _task = None
