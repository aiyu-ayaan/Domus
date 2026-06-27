import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, select

from backend.core.config import settings
from backend.core.database import SessionMaker
from backend.core.logging import get_logger
from backend.devices.models import Device, DeviceState
from backend.devices.service import DeviceService
from backend.integrations.models import Integration
from backend.integrations.registry import get_adapter

log = get_logger("poller")

# ponytail: a couple of missed polls can be a transient blip; only flip to offline
# after this many consecutive failures so one dropped packet doesn't alarm the user.
_OFFLINE_THRESHOLD = 3
_failures: dict[UUID, int] = {}


async def _prune_history(session) -> None:
    """Drop DeviceState rows past the retention window so the table — and the
    per-request energy integration that scans it — stay bounded."""
    days = settings.device_history_retention_days
    if days <= 0:
        return
    cutoff = datetime.now(UTC) - timedelta(days=days)
    await session.execute(delete(DeviceState).where(DeviceState.created_at < cutoff))
    await session.commit()


async def poll_devices_loop():
    log.info("Starting background device poller loop")
    interval = max(0.5, settings.device_poll_interval)
    # Prune roughly every 5 minutes regardless of poll cadence.
    prune_every = max(1, int(300 / interval))
    tick = 0
    while True:
        try:
            await asyncio.sleep(interval)
            tick += 1

            async with SessionMaker() as session:
                if tick % prune_every == 0:
                    await _prune_history(session)

                # Poll all devices (not just online ones) so an offline device can
                # recover automatically once it starts responding again.
                res = await session.execute(select(Device))
                devices = res.scalars().all()
                if not devices:
                    continue

                service = DeviceService(session)
                for device in devices:
                    integration = await session.get(Integration, device.integration_id)
                    # If integration is missing or disabled, mark device offline immediately
                    if not (integration and integration.enabled):
                        await service.mark_offline(device)
                        continue

                    adapter = get_adapter(integration)
                    try:
                        snapshot = await adapter.get_state(device.external_id)
                    except Exception as e:
                        n = _failures.get(device.id, 0) + 1
                        _failures[device.id] = n
                        log.debug(f"Poller failed to reach device {device.id} (x{n}): {e}")
                        if n >= _OFFLINE_THRESHOLD:
                            await service.mark_offline(device)
                        continue

                    _failures.pop(device.id, None)
                    # from_poll: only writes/emits on a real change (keeps the API light)
                    await service._record(device, snapshot, from_poll=True)

                await session.commit()
        except asyncio.CancelledError:
            log.info("Device poller loop cancelled")
            break
        except Exception as e:
            log.error(f"Error in device poller loop: {e}")
