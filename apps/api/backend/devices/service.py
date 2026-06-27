from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.models import User
from backend.core.config import settings
from backend.core.events import (
    DEVICE_STATE_CHANGED,
    Event,
    event_bus,
)
from backend.core.exceptions import ConflictError, NotFoundError
from backend.core.pagination import PageParams
from backend.devices.models import Device, DeviceState
from backend.devices.schemas import DeviceCreate, DeviceUpdate
from backend.homes.service import HomeService
from backend.integrations.base import StateSnapshot
from backend.integrations.models import Integration
from backend.integrations.registry import get_adapter

ACTIONS = ("turn_on", "turn_off", "toggle")

# Live power draw jitters on every poll; it must not count as a state "change" or
# the liveness poller would emit an event + write a history row on every tick.
_VOLATILE_ATTRS = ("power_w", "current_consumption")


def _stable(attrs: dict[str, Any] | None) -> dict[str, Any]:
    """Attributes with the volatile (per-poll jitter) keys removed, for change detection."""
    return {k: v for k, v in (attrs or {}).items() if k not in _VOLATILE_ATTRS}


class DeviceService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.homes = HomeService(session)

    # --- queries ----------------------------------------------------------------
    async def list_for(
        self,
        user: User,
        params: PageParams,
        *,
        home_id: UUID | None = None,
        room_id: UUID | None = None,
        device_type: str | None = None,
        online: bool | None = None,
    ) -> tuple[list[Device], int]:
        home_ids = (
            [home_id] if home_id is not None else [h.id for h in await self.homes.list_for(user)]
        )
        if home_id is not None:
            await self.homes.get_for(home_id, user)

        stmt = select(Device).where(Device.home_id.in_(home_ids))
        if room_id is not None:
            stmt = stmt.where(Device.room_id == room_id)
        if device_type is not None:
            stmt = stmt.where(Device.device_type == device_type)
        if online is not None:
            stmt = stmt.where(Device.online.is_(online))

        total = (
            await self.session.execute(select(func.count()).select_from(stmt.subquery()))
        ).scalar_one()
        rows = (
            (
                await self.session.execute(
                    stmt.order_by(Device.name).limit(params.limit).offset(params.offset)
                )
            )
            .scalars()
            .all()
        )
        return list(rows), total

    async def get_for(self, device_id: UUID, user: User) -> Device:
        device = await self.session.get(Device, device_id)
        if device is None:
            raise NotFoundError("Device not found")
        await self.homes.get_for(device.home_id, user)
        return device

    # --- mutations --------------------------------------------------------------
    async def create(self, data: DeviceCreate, user: User) -> Device:
        await self.homes.get_for(data.home_id, user)
        integration = await self.session.get(Integration, data.integration_id)
        if integration is None or integration.home_id != data.home_id:
            raise NotFoundError("Integration not found for this home")
        exists = await self.session.execute(
            select(Device.id).where(
                Device.integration_id == data.integration_id,
                Device.external_id == data.external_id,
            )
        )
        if exists.first():
            raise ConflictError("Device already registered for this integration")
        device = Device(**data.model_dump())
        self.session.add(device)
        await self.session.flush()
        return device

    async def update(self, device_id: UUID, data: DeviceUpdate, user: User) -> Device:
        device = await self.get_for(device_id, user)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(device, field, value)
        await self.session.flush()
        return device

    async def delete(self, device_id: UUID, user: User) -> None:
        device = await self.get_for(device_id, user)
        await self.session.delete(device)

    # --- control (always via the integration adapter) ---------------------------
    async def control(self, device_id: UUID, action: str, user: User) -> DeviceState:
        device = await self.get_for(device_id, user)  # authorises via home
        return await self._apply(device, action)

    async def set_attributes(
        self, device_id: UUID, attributes: dict[str, Any], user: User
    ) -> DeviceState:
        device = await self.get_for(device_id, user)  # authorises via home
        integration = await self.session.get(Integration, device.integration_id)
        if integration is None or not integration.enabled:
            raise ConflictError("Integration is missing or disabled")
        adapter = get_adapter(integration)
        try:
            snapshot: StateSnapshot = await adapter.set_attributes(device.external_id, attributes)

            # Merge virtual UI attributes to preserve them
            virtual_keys = [
                "ambient_sync",
                "music_theme",
                "light_scene",
                "light_scene_gap",
                "custom_scene_colors",
            ]
            for key in virtual_keys:
                if key in attributes:
                    snapshot.attributes[key] = attributes[key]

            return await self._record(device, snapshot)
        except Exception as e:
            await self.mark_offline(device)
            raise e

    async def control_system(self, device_id: UUID, action: str) -> DeviceState:
        """Unauthenticated control for system actors (automation engine, scenes)."""
        device = await self.session.get(Device, device_id)
        if device is None:
            raise NotFoundError("Device not found")
        return await self._apply(device, action)

    async def set_attributes_system(
        self, device_id: UUID, attributes: dict[str, Any]
    ) -> DeviceState:
        """Unauthenticated attributes write for system actors (scenes)."""
        device = await self.session.get(Device, device_id)
        if device is None:
            raise NotFoundError("Device not found")
        integration = await self.session.get(Integration, device.integration_id)
        if integration is None or not integration.enabled:
            raise ConflictError("Integration is missing or disabled")
        adapter = get_adapter(integration)
        try:
            snapshot: StateSnapshot = await adapter.set_attributes(device.external_id, attributes)

            # Merge virtual UI attributes to preserve them
            virtual_keys = [
                "ambient_sync",
                "music_theme",
                "light_scene",
                "light_scene_gap",
                "custom_scene_colors",
            ]
            for key in virtual_keys:
                if key in attributes:
                    snapshot.attributes[key] = attributes[key]

            return await self._record(device, snapshot)
        except Exception as e:
            await self.mark_offline(device)
            raise e

    async def mark_offline(self, device: Device) -> None:
        """Flip an online device to offline, notify, and fire device_offline automations."""
        if not device.online:
            return
        device.online = False
        await self.session.flush()

        from backend.common.enums import NotificationType
        from backend.core.events import DEVICE_ONLINE_CHANGED, Event, event_bus
        from backend.notifications.service import NotificationService

        await event_bus.publish(
            Event(
                type=DEVICE_ONLINE_CHANGED,
                home_id=str(device.home_id),
                data={"device_id": str(device.id), "online": False},
            )
        )
        await NotificationService(self.session).create(
            device.home_id,
            NotificationType.device_offline,
            title=f"{device.name} is offline",
            body="Device stopped responding to status polls.",
        )

    async def _apply(self, device: Device, action: str) -> DeviceState:
        if action not in ACTIONS:
            raise NotFoundError(f"Unknown action: {action}")
        integration = await self.session.get(Integration, device.integration_id)
        if integration is None or not integration.enabled:
            raise ConflictError("Integration is missing or disabled")
        adapter = get_adapter(integration)
        try:
            snapshot: StateSnapshot = await getattr(adapter, action)(device.external_id)
            return await self._record(device, snapshot)
        except Exception as e:
            await self.mark_offline(device)
            raise e

    async def _last_state(self, device_id: UUID) -> DeviceState | None:
        res = await self.session.execute(
            select(DeviceState)
            .where(DeviceState.device_id == device_id)
            .order_by(DeviceState.created_at.desc())
            .limit(1)
        )
        return res.scalar_one_or_none()

    async def _record(
        self, device: Device, snapshot: StateSnapshot, *, from_poll: bool = False
    ) -> DeviceState:
        """Persist a device state and notify clients.

        User-driven control always records a fresh row and emits an event so the actor
        sees an immediate result. The liveness poller (``from_poll``) fires every few
        seconds for every device — persisting/emitting on every tick is what made the API
        heavy and the UI toggle flicker — so from the poller we only write + emit on a
        real change, plus a throttled energy sample to keep power history flowing.
        """
        now = datetime.now(UTC)
        was_offline = not device.online
        device.online = True
        device.last_seen = now

        last = await self._last_state(device.id)
        changed = (
            last is None
            or last.state != snapshot.state
            or _stable(last.attributes) != _stable(snapshot.attributes)
        )

        emit = changed or not from_poll
        write = changed or not from_poll
        if from_poll and not changed and last is not None:
            # No real change, but keep energy plugs sampled at a throttled rate.
            is_energy = any(k in snapshot.attributes for k in _VOLATILE_ATTRS)
            last_ts = last.created_at
            if last_ts.tzinfo is None:
                last_ts = last_ts.replace(tzinfo=UTC)
            if is_energy and (now - last_ts).total_seconds() >= settings.energy_sample_min_interval:
                write = True

        if write:
            state = DeviceState(
                device_id=device.id,
                state=snapshot.state,
                attributes=snapshot.attributes,
                created_at=now,
            )
            self.session.add(state)
        else:
            state = last

        await self.session.flush()

        if was_offline:
            from backend.core.events import DEVICE_ONLINE_CHANGED

            await event_bus.publish(
                Event(
                    type=DEVICE_ONLINE_CHANGED,
                    home_id=str(device.home_id),
                    data={"device_id": str(device.id), "online": True},
                )
            )

        if emit:
            await event_bus.publish(
                Event(
                    type=DEVICE_STATE_CHANGED,
                    home_id=str(device.home_id),
                    data={
                        "device_id": str(device.id),
                        "state": snapshot.state,
                        "attributes": snapshot.attributes,
                    },
                )
            )
        return state

    async def current_state(
        self, device_id: UUID, user: User, refresh: bool = False
    ) -> DeviceState | None:
        device = await self.get_for(device_id, user)

        if refresh:
            try:
                integration = await self.session.get(Integration, device.integration_id)
                if integration and integration.enabled:
                    adapter = get_adapter(integration)
                    snapshot = await adapter.get_state(device.external_id)
                    # Preserve virtual UI attributes from the last recorded state
                    last_res = await self.session.execute(
                        select(DeviceState)
                        .where(DeviceState.device_id == device.id)
                        .order_by(DeviceState.created_at.desc())
                        .limit(1)
                    )
                    last_state = last_res.scalar_one_or_none()
                    if last_state and last_state.attributes:
                        virtual_keys = [
                            "ambient_sync",
                            "music_theme",
                            "light_scene",
                            "light_scene_gap",
                            "custom_scene_colors",
                        ]
                        for key in virtual_keys:
                            if key in last_state.attributes and key not in snapshot.attributes:
                                snapshot.attributes[key] = last_state.attributes[key]
                    return await self._record(device, snapshot)
            except Exception:
                await self.mark_offline(device)

        res = await self.session.execute(
            select(DeviceState)
            .where(DeviceState.device_id == device.id)
            .order_by(DeviceState.created_at.desc())
            .limit(1)
        )
        return res.scalar_one_or_none()

    async def history(self, device_id: UUID, user: User, params: PageParams) -> list[DeviceState]:
        device = await self.get_for(device_id, user)
        res = await self.session.execute(
            select(DeviceState)
            .where(DeviceState.device_id == device.id)
            .order_by(DeviceState.created_at.desc())
            .limit(params.limit)
            .offset(params.offset)
        )
        return list(res.scalars().all())
