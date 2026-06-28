from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.models import User
from backend.core.crypto import encrypt_json
from backend.core.events import Event, event_bus
from backend.core.exceptions import NotFoundError
from backend.devices.models import Device
from backend.homes.service import HomeService
from backend.integrations.models import Integration
from backend.integrations.registry import get_adapter
from backend.integrations.schemas import (
    DiscoveredDeviceOut,
    DiscoveryResult,
    IntegrationCreate,
    IntegrationUpdate,
)

NEW_DEVICE_FOUND = "integration.new_device_found"


class IntegrationService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.homes = HomeService(session)

    async def list_for(self, user: User, home_id: UUID | None = None) -> list[Integration]:
        if home_id is not None:
            await self.homes.get_for(home_id, user)
            home_ids = [home_id]
        else:
            home_ids = [h.id for h in await self.homes.list_for(user)]
        res = await self.session.execute(
            select(Integration).where(Integration.home_id.in_(home_ids))
        )
        return list(res.scalars().all())

    async def get_for(self, integration_id: UUID, user: User) -> Integration:
        integration = await self.session.get(Integration, integration_id)
        if integration is None:
            raise NotFoundError("Integration not found")
        await self.homes.get_for(integration.home_id, user)
        return integration

    async def create(self, data: IntegrationCreate, user: User) -> Integration:
        await self.homes.get_for(data.home_id, user)
        integration = Integration(
            home_id=data.home_id,
            name=data.name,
            type=data.type.value,
            enabled=data.enabled,
            config_encrypted=encrypt_json(data.config) if data.config else None,
        )
        self.session.add(integration)
        await self.session.flush()
        return integration

    async def update(
        self, integration_id: UUID, data: IntegrationUpdate, user: User
    ) -> Integration:
        integration = await self.get_for(integration_id, user)
        if data.name is not None:
            integration.name = data.name
        if data.enabled is not None:
            integration.enabled = data.enabled
        if data.config is not None:
            integration.config_encrypted = encrypt_json(data.config) if data.config else None
        await self.session.flush()
        return integration

    async def delete(self, integration_id: UUID, user: User) -> None:
        integration = await self.get_for(integration_id, user)
        await self.session.delete(integration)

    async def discover(self, integration_id: UUID, user: User) -> DiscoveryResult:
        integration = await self.get_for(integration_id, user)
        adapter = get_adapter(integration)

        existing = await self.session.execute(
            select(Device.external_id).where(Device.integration_id == integration.id)
        )
        known = set(existing.scalars().all())

        discovered: list[DiscoveredDeviceOut] = []
        new_count = 0
        discovery_error: str | None = None
        try:
            found_devices = await adapter.discover_devices()
        except Exception as exc:
            discovery_error = str(exc)
            found_devices = []
        for found in found_devices:
            is_new = found.external_id not in known
            if is_new:
                is_online = True
                if "needs_local_key" in found.attributes:
                    is_online = not bool(found.attributes.get("needs_local_key"))
                elif "online" in found.attributes:
                    is_online = bool(found.attributes.get("online"))

                self.session.add(
                    Device(
                        home_id=integration.home_id,
                        integration_id=integration.id,
                        external_id=found.external_id,
                        name=found.name,
                        manufacturer=found.manufacturer,
                        model=found.model,
                        serial_number=found.serial_number,
                        device_type=found.device_type.value,
                        online=is_online,
                        meta=found.attributes,
                    )
                )
                new_count += 1
                await event_bus.publish(
                    Event(
                        type=NEW_DEVICE_FOUND,
                        home_id=str(integration.home_id),
                        data={"name": found.name, "external_id": found.external_id},
                    )
                )
            discovered.append(
                DiscoveredDeviceOut(
                    external_id=found.external_id,
                    name=found.name,
                    device_type=found.device_type.value,
                    manufacturer=found.manufacturer,
                    model=found.model,
                    serial_number=found.serial_number,
                    attributes=found.attributes,
                    already_registered=not is_new,
                )
            )

        # A subnet sweep can take seconds; if the integration was deleted in that
        # window, flushing the new devices would 500 with a raw FK violation.
        # Re-check existence against the DB (bypassing the identity map) and fail
        # clean. ponytail: closes the race to ~microseconds, not absolutely — a
        # delete landing between this check and flush is acceptably rare.
        still_exists = await self.session.scalar(
            select(Integration.id).where(Integration.id == integration_id)
        )
        if still_exists is None:
            raise NotFoundError("Integration was removed during discovery")

        integration.last_sync_at = datetime.now(UTC)
        await self.session.flush()
        return DiscoveryResult(
            integration_id=integration.id,
            discovered=discovered,
            new_count=new_count,
            existing_count=len(discovered) - new_count,
            error=discovery_error,
        )
