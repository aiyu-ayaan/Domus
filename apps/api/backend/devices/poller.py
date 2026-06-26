import asyncio
from uuid import UUID

from sqlalchemy import select

from backend.common.enums import NotificationType
from backend.core.database import SessionMaker
from backend.core.events import DEVICE_ONLINE_CHANGED, Event, event_bus
from backend.core.logging import get_logger
from backend.devices.models import Device
from backend.devices.service import DeviceService
from backend.integrations.models import Integration
from backend.integrations.registry import get_adapter

log = get_logger("poller")

# ponytail: a couple of missed polls can be a transient blip; only flip to offline
# after this many consecutive failures so one dropped packet doesn't alarm the user.
_OFFLINE_THRESHOLD = 3
_failures: dict[UUID, int] = {}


async def _mark_offline(session, device: Device) -> None:
    """Flip an online device to offline, notify, and fire device_offline automations."""
    if not device.online:
        return
    device.online = False
    await session.flush()
    await event_bus.publish(
        Event(
            type=DEVICE_ONLINE_CHANGED,
            home_id=str(device.home_id),
            data={"device_id": str(device.id), "online": False},
        )
    )
    from backend.notifications.service import NotificationService

    await NotificationService(session).create(
        device.home_id,
        NotificationType.device_offline,
        title=f"{device.name} is offline",
        body="Device stopped responding to status polls.",
    )


async def poll_devices_loop():
    log.info("Starting background device poller loop")
    while True:
        try:
            await asyncio.sleep(2.0)

            async with SessionMaker() as session:
                # Poll all devices (not just online ones) so an offline device can
                # recover automatically once it starts responding again.
                res = await session.execute(select(Device))
                devices = res.scalars().all()
                if not devices:
                    continue

                service = DeviceService(session)
                for device in devices:
                    integration = await session.get(Integration, device.integration_id)
                    # Only poll active Tapo integrations to prevent test pollution.
                    if not (integration and integration.enabled and integration.type == "tapo"):
                        continue
                    adapter = get_adapter(integration)
                    try:
                        snapshot = await adapter.get_state(device.external_id)
                    except Exception as e:
                        n = _failures.get(device.id, 0) + 1
                        _failures[device.id] = n
                        log.debug(f"Poller failed to reach device {device.id} (x{n}): {e}")
                        if n >= _OFFLINE_THRESHOLD:
                            await _mark_offline(session, device)
                        continue

                    was_offline = not device.online
                    _failures.pop(device.id, None)
                    await service._record(device, snapshot)  # sets online=True
                    if was_offline:
                        await event_bus.publish(
                            Event(
                                type=DEVICE_ONLINE_CHANGED,
                                home_id=str(device.home_id),
                                data={"device_id": str(device.id), "online": True},
                            )
                        )

                await session.commit()
        except asyncio.CancelledError:
            log.info("Device poller loop cancelled")
            break
        except Exception as e:
            log.error(f"Error in device poller loop: {e}")
