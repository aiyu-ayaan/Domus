"""Automation evaluation + execution.

Pure condition evaluation (``evaluate_conditions``) is separated from side-effecting
action execution so the matching logic is trivially testable. The engine subscribes to
the event bus and runs matching rules in their own DB session.
"""

import contextvars
import operator
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select

from backend.common.enums import NotificationType
from backend.core.database import SessionMaker
from backend.core.events import DEVICE_STATE_CHANGED, Event, event_bus
from backend.core.logging import get_logger
from backend.integrations.service import NEW_DEVICE_FOUND

log = get_logger("automations")

_OPS = {
    "eq": operator.eq,
    "ne": operator.ne,
    "gt": operator.gt,
    "lt": operator.lt,
    "gte": operator.ge,
    "lte": operator.le,
    "in": lambda a, b: a in b,
}

# ponytail: guard against an automation chain feeding itself forever (device action →
# state event → same rule). Caps recursive depth; raise the cap if real chains get deep.
_depth: contextvars.ContextVar[int] = contextvars.ContextVar("automation_depth", default=0)
_MAX_DEPTH = 5


def evaluate_conditions(conditions: list[dict[str, Any]], context: dict[str, Any]) -> bool:
    """AND of all conditions. Missing field or bad compare → condition is False."""
    for cond in conditions:
        actual = context.get(cond["field"])
        op = _OPS.get(cond["op"])
        if op is None or actual is None:
            return False
        try:
            if not op(actual, cond["value"]):
                return False
        except TypeError:
            return False
    return True


def _event_context(event: Event) -> dict[str, Any]:
    data = dict(event.data)
    attrs = data.get("attributes")
    if isinstance(attrs, dict):
        data = {**attrs, **data}  # let conditions reference attribute keys directly
    return data


def _trigger_matches(trigger: dict[str, Any], event: Event) -> bool:
    ttype = trigger.get("type")
    if event.type == DEVICE_STATE_CHANGED and ttype == "device_state":
        if trigger.get("device_id") and str(trigger["device_id"]) != event.data.get("device_id"):
            return False
        if trigger.get("state") and trigger["state"] != event.data.get("state"):
            return False
        return True
    if event.type == NEW_DEVICE_FOUND and ttype == "new_device":
        return True
    return False


class AutomationEngine:
    async def execute_actions(
        self, session, home_id: UUID, actions: list[dict[str, Any]], context: dict[str, Any]
    ) -> None:
        # Imported here to avoid import cycles (services import models, engine imports services).
        from backend.devices.service import DeviceService
        from backend.notifications.service import NotificationService
        from backend.scenes.service import SceneService

        for action in actions:
            atype = action["type"]
            if atype.startswith("device."):
                await DeviceService(session).control_system(
                    UUID(str(action["device_id"])), atype.split(".", 1)[1]
                )
            elif atype == "scene.activate":
                await SceneService(session).activate_system(UUID(str(action["scene_id"])))
            elif atype == "notification.send":
                await NotificationService(session).create(
                    home_id,
                    NotificationType.info,
                    title=action.get("title") or "Automation",
                    body=action.get("body") or "",
                    meta={"context": context},
                )

    async def run_one(self, session, automation, context: dict[str, Any]) -> bool:
        """Evaluate conditions and execute actions. Returns True if it executed."""
        if not evaluate_conditions(automation.conditions or [], context):
            return False
        try:
            await self.execute_actions(
                session, automation.home_id, automation.actions or [], context
            )
            automation.last_triggered_at = datetime.now(UTC)
            automation.last_error = None
            return True
        except Exception as exc:  # noqa: BLE001
            automation.last_error = str(exc)
            log.exception("automation %s failed", automation.id)
            from backend.notifications.service import NotificationService

            await NotificationService(session).create(
                automation.home_id,
                NotificationType.automation_failed,
                title=f"Automation failed: {automation.name}",
                body=str(exc),
            )
            return True

    async def on_event(self, event: Event) -> None:
        """Event-bus subscriber. Runs matching automations in a fresh session."""
        if event.home_id is None:
            return
        if _depth.get() >= _MAX_DEPTH:
            log.warning("automation chain depth exceeded; dropping %s", event.type)
            return

        from backend.automations.models import Automation

        token = _depth.set(_depth.get() + 1)
        try:
            async with SessionMaker() as session:
                rows = (
                    (
                        await session.execute(
                            select(Automation).where(
                                Automation.home_id == UUID(event.home_id),
                                Automation.enabled.is_(True),
                            )
                        )
                    )
                    .scalars()
                    .all()
                )
                context = _event_context(event)
                ran = False
                for automation in rows:
                    if _trigger_matches(automation.trigger or {}, event):
                        ran = await self.run_one(session, automation, context) or ran
                if ran:
                    await session.commit()
        finally:
            _depth.reset(token)


automation_engine = AutomationEngine()


def register() -> None:
    """Wire the engine into the event bus (called once at startup)."""
    event_bus.subscribe(automation_engine.on_event)
