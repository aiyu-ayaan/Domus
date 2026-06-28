import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, func, select

from backend.core.config import settings
from backend.core.database import SessionMaker
from backend.core.logging import get_logger
from backend.devices.models import Device, DeviceState
from backend.devices.service import DeviceService
from backend.integrations.models import Integration
from backend.integrations.registry import get_adapter

log = get_logger("poller")

_OFFLINE_THRESHOLD = 3
_failures: dict[UUID, int] = {}


async def _prune_history(session) -> None:
    days = settings.device_history_retention_days
    if days <= 0:
        return
    cutoff = datetime.now(UTC) - timedelta(days=days)
    await session.execute(delete(DeviceState).where(DeviceState.created_at < cutoff))
    await session.commit()


async def _batch_last_states(session, device_ids: list[UUID]) -> dict[UUID, DeviceState]:
    """Load the most recent DeviceState per device in one query instead of N."""
    if not device_ids:
        return {}
    subq = (
        select(DeviceState.device_id, func.max(DeviceState.created_at).label("max_ts"))
        .where(DeviceState.device_id.in_(device_ids))
        .group_by(DeviceState.device_id)
        .subquery()
    )
    res = await session.execute(
        select(DeviceState).join(
            subq,
            (DeviceState.device_id == subq.c.device_id)
            & (DeviceState.created_at == subq.c.max_ts),
        )
    )
    return {s.device_id: s for s in res.scalars()}


async def _fetch_state(adapter, external_id: str):
    """Network-only fetch; returns (snapshot, None) or (None, exception)."""
    try:
        return await adapter.get_state(external_id), None
    except Exception as exc:  # noqa: BLE001
        return None, exc


async def poll_devices_loop():
    log.info("Starting background device poller loop")
    interval = max(0.5, settings.device_poll_interval)
    prune_every = max(1, int(300 / interval))
    tick = 0
    while True:
        try:
            await asyncio.sleep(interval)
            tick += 1

            async with SessionMaker() as session:
                if tick % prune_every == 0:
                    await _prune_history(session)

                res = await session.execute(select(Device))
                devices = res.scalars().all()
                if not devices:
                    continue

                # ponytail: 2 queries instead of N+1 — batch-load integrations and last states
                integ_res = await session.execute(select(Integration))
                integrations: dict[UUID, Integration] = {i.id: i for i in integ_res.scalars()}
                last_states = await _batch_last_states(session, [d.id for d in devices])

                service = DeviceService(session)

                # Separate devices into disabled (handled inline) vs pollable.
                disabled, to_poll = [], []
                for device in devices:
                    integration = integrations.get(device.integration_id)
                    if not (integration and integration.enabled):
                        disabled.append(device)
                    else:
                        to_poll.append((device, get_adapter(integration)))

                for device in disabled:
                    await service.mark_offline(device)

                if to_poll:
                    # ponytail: run all network fetches concurrently so one timed-out
                    # device (e.g. wrong IP) doesn't block the rest of the poll cycle.
                    fetch_results = await asyncio.gather(
                        *(_fetch_state(adapter, dev.external_id) for dev, adapter in to_poll)
                    )

                    for (device, _adapter), (snapshot, exc) in zip(to_poll, fetch_results):
                        if exc is not None:
                            n = _failures.get(device.id, 0) + 1
                            _failures[device.id] = n
                            # warn (not debug) so the user can see which device is failing
                            # and why (wrong IP, protocol mismatch, etc.)
                            log.warning(
                                "Poller: %s (%s) unreachable (x%d): %s",
                                device.name,
                                device.id,
                                n,
                                exc,
                            )
                            if n >= _OFFLINE_THRESHOLD:
                                await service.mark_offline(device)
                            continue

                        _failures.pop(device.id, None)
                        await service._record(
                            device,
                            snapshot,
                            from_poll=True,
                            _preloaded_last=last_states.get(device.id),
                        )

                await session.commit()
        except asyncio.CancelledError:
            log.info("Device poller loop cancelled")
            break
        except Exception as e:
            log.error(f"Error in device poller loop: {e}")
