from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select

from backend.auth.models import User
from backend.core import security
from backend.core.database import SessionMaker
from backend.core.logging import get_logger
from backend.homes.models import Home
from backend.websocket.manager import manager

log = get_logger("ws")

router = APIRouter()


async def _authenticate(token: str) -> tuple[User, list[str]] | None:
    """Resolve the access token to a user and the home ids they may receive."""
    try:
        payload = security.decode_token(token, security.ACCESS)
    except Exception:  # noqa: BLE001
        return None
    async with SessionMaker() as session:
        user = await session.get(User, UUID(payload["sub"]))
        if user is None or not user.is_active:
            return None
        rows = await session.execute(select(Home.id).where(Home.owner_id == user.id))
        return user, [str(hid) for hid in rows.scalars().all()]


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str = "") -> None:
    auth = await _authenticate(token)
    if auth is None:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    user, home_ids = auth
    user_id = str(user.id)
    await manager.connect(ws, user_id, home_ids)
    try:
        # We don't require inbound messages; reading keeps the socket alive and
        # lets the client send pings.
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(ws, user_id)
