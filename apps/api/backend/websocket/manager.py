"""WebSocket fan-out: bridges the event bus to connected clients.

A client connects scoped to the homes it can access. Every bus event (device state,
notifications, presence) is pushed to clients whose home matches. Presence is tracked
per home and broadcast on connect/disconnect.

ponytail: in-memory connection registry, single process. Cross-process delivery is the
Redis bridge's job (backend.websocket.redis_bridge); this class only knows local sockets.
"""

from fastapi import WebSocket

from backend.core.events import Event, event_bus
from backend.core.logging import get_logger

log = get_logger("ws")

PRESENCE_UPDATED = "presence.updated"


class ConnectionManager:
    def __init__(self) -> None:
        # ws -> (user_id, home_ids). Everything else is derived from this.
        self._sockets: dict[WebSocket, tuple[str, set[str]]] = {}

    def _sockets_for(self, home_id: str) -> set[WebSocket]:
        return {ws for ws, (_, hids) in self._sockets.items() if home_id in hids}

    def online_users(self, home_id: str) -> list[str]:
        return sorted(uid for _, (uid, hids) in self._sockets.items() if home_id in hids)

    async def connect(self, ws: WebSocket, user_id: str, home_ids: list[str]) -> None:
        await ws.accept()
        self._sockets[ws] = (user_id, set(home_ids))
        await self._broadcast_presence(home_ids)

    async def disconnect(self, ws: WebSocket, user_id: str) -> None:
        _, home_ids = self._sockets.pop(ws, (user_id, set()))
        await self._broadcast_presence(list(home_ids))

    async def send_event(self, event: Event) -> None:
        payload = event.as_dict()
        targets = set(self._sockets) if event.home_id is None else self._sockets_for(event.home_id)
        for ws in targets:
            try:
                await ws.send_json(payload)
            except Exception:  # noqa: BLE001 — drop dead sockets silently
                log.debug("failed to send to a socket; cleaned on disconnect")

    async def _broadcast_presence(self, home_ids: list[str]) -> None:
        for hid in home_ids:
            await self.send_event(
                Event(
                    type=PRESENCE_UPDATED,
                    home_id=hid,
                    data={"online_users": self.online_users(hid)},
                )
            )


manager = ConnectionManager()


def register() -> None:
    """Subscribe the manager to the event bus (called once at startup)."""
    event_bus.subscribe(manager.send_event)
