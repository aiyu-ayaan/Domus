from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.models import User
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

    async def set_attributes(self, device_id: UUID, attributes: dict[str, Any], user: User) -> DeviceState:
        device = await self.get_for(device_id, user)  # authorises via home
        integration = await self.session.get(Integration, device.integration_id)
        if integration is None or not integration.enabled:
            raise ConflictError("Integration is missing or disabled")
        adapter = get_adapter(integration)
        snapshot: StateSnapshot = await adapter.set_attributes(device.external_id, attributes)
        
        # Merge virtual UI attributes to preserve them
        virtual_keys = ["ambient_sync", "music_theme", "light_scene", "light_scene_gap", "custom_scene_colors"]
        for key in virtual_keys:
            if key in attributes:
                snapshot.attributes[key] = attributes[key]
                
        return await self._record(device, snapshot)

    async def control_system(self, device_id: UUID, action: str) -> DeviceState:
        """Unauthenticated control for system actors (automation engine, scenes)."""
        device = await self.session.get(Device, device_id)
        if device is None:
            raise NotFoundError("Device not found")
        return await self._apply(device, action)

    async def set_attributes_system(self, device_id: UUID, attributes: dict[str, Any]) -> DeviceState:
        """Unauthenticated attributes write for system actors (scenes)."""
        device = await self.session.get(Device, device_id)
        if device is None:
            raise NotFoundError("Device not found")
        integration = await self.session.get(Integration, device.integration_id)
        if integration is None or not integration.enabled:
            raise ConflictError("Integration is missing or disabled")
        adapter = get_adapter(integration)
        snapshot: StateSnapshot = await adapter.set_attributes(device.external_id, attributes)
        
        # Merge virtual UI attributes to preserve them
        virtual_keys = ["ambient_sync", "music_theme", "light_scene", "light_scene_gap", "custom_scene_colors"]
        for key in virtual_keys:
            if key in attributes:
                snapshot.attributes[key] = attributes[key]
                
        return await self._record(device, snapshot)

    async def _apply(self, device: Device, action: str) -> DeviceState:
        if action not in ACTIONS:
            raise NotFoundError(f"Unknown action: {action}")
        integration = await self.session.get(Integration, device.integration_id)
        if integration is None or not integration.enabled:
            raise ConflictError("Integration is missing or disabled")
        adapter = get_adapter(integration)
        snapshot: StateSnapshot = await getattr(adapter, action)(device.external_id)
        return await self._record(device, snapshot)

    async def _record(self, device: Device, snapshot: StateSnapshot) -> DeviceState:
        now = datetime.now(UTC)
        state = DeviceState(
            device_id=device.id,
            state=snapshot.state,
            attributes=snapshot.attributes,
            created_at=now,
        )
        device.online = True
        device.last_seen = now
        self.session.add(state)
        await self.session.flush()
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

    async def current_state(self, device_id: UUID, user: User, refresh: bool = False) -> DeviceState | None:
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
                        virtual_keys = ["ambient_sync", "music_theme", "light_scene", "light_scene_gap", "custom_scene_colors"]
                        for key in virtual_keys:
                            if key in last_state.attributes and key not in snapshot.attributes:
                                snapshot.attributes[key] = last_state.attributes[key]
                    return await self._record(device, snapshot)
            except Exception:
                pass

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
