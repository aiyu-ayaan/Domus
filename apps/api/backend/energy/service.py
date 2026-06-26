"""Turn recorded power samples into billable energy.

Energy-monitoring devices (e.g. Tapo P110) record an instantaneous ``power_w`` in
each ``DeviceState``. Energy (kWh) is the time-integral of those samples — computed
here, not stored — so any reporting window works off the same append-only history.

Tariff/cost lives on the client (user-entered unit price, flat or tiered); this
service stays purely about kWh.
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.models import User
from backend.devices.models import Device, DeviceState
from backend.energy.schemas import EnergyDevice, EnergyPoint, EnergySummary
from backend.homes.service import HomeService

Sample = tuple[datetime, float]


def integrate_energy_kwh(samples: list[Sample]) -> float:
    """Trapezoidal integral of watt samples over time -> kWh (Wh = W * h)."""
    if len(samples) < 2:
        return 0.0
    wh = 0.0
    for (t0, w0), (t1, w1) in zip(samples, samples[1:], strict=False):
        hours = (t1 - t0).total_seconds() / 3600.0
        wh += (w0 + w1) / 2.0 * hours
    return wh / 1000.0


def _bucket_start(ts: datetime, bucket_seconds: int, origin: datetime) -> datetime:
    delta = int((ts - origin).total_seconds())
    return origin + timedelta(seconds=(delta // bucket_seconds) * bucket_seconds)


class EnergyService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.homes = HomeService(session)

    async def summary(self, user: User, home_id: UUID | None, hours: int) -> EnergySummary:
        hours = max(1, min(hours, 24 * 31))  # 1h .. 31d
        home_ids = (
            [home_id] if home_id is not None else [h.id for h in await self.homes.list_for(user)]
        )
        if home_id is not None:
            await self.homes.get_for(home_id, user)

        origin = datetime.now(UTC) - timedelta(hours=hours)
        rows = (
            await self.session.execute(
                select(Device, DeviceState)
                .join(DeviceState, DeviceState.device_id == Device.id)
                .where(Device.home_id.in_(home_ids), DeviceState.created_at >= origin)
                .order_by(DeviceState.created_at)
            )
        ).all()

        # Group power samples per device (global time order is preserved per device).
        per_device: dict[UUID, list[Sample]] = {}
        meta: dict[UUID, Device] = {}
        for device, st in rows:
            attrs = st.attributes if isinstance(st.attributes, dict) else {}
            power = attrs.get("power_w")
            if power is None:
                continue
            # SQLite drops tzinfo on read; treat stored timestamps as UTC.
            ts = st.created_at if st.created_at.tzinfo else st.created_at.replace(tzinfo=UTC)
            per_device.setdefault(device.id, []).append((ts, float(power)))
            meta[device.id] = device

        bucket_seconds = 3600 if hours <= 48 else 86400
        buckets: dict[datetime, float] = {}
        devices_out: list[EnergyDevice] = []
        total_kwh = 0.0
        total_power = 0.0

        for did, samples in per_device.items():
            kwh = integrate_energy_kwh(samples)
            latest = samples[-1][1]
            total_kwh += kwh
            total_power += latest
            dev = meta[did]
            devices_out.append(
                EnergyDevice(
                    device_id=did,
                    name=dev.name,
                    model=dev.model,
                    power_w=round(latest, 1),
                    energy_kwh=round(kwh, 4),
                )
            )
            for (t0, w0), (t1, w1) in zip(samples, samples[1:], strict=False):
                wh = (w0 + w1) / 2.0 * ((t1 - t0).total_seconds() / 3600.0)
                b = _bucket_start(t0, bucket_seconds, origin)
                buckets[b] = buckets.get(b, 0.0) + wh / 1000.0

        devices_out.sort(key=lambda d: d.energy_kwh, reverse=True)
        series = [EnergyPoint(t=t, kwh=round(v, 4)) for t, v in sorted(buckets.items())]
        return EnergySummary(
            range_hours=hours,
            total_power_w=round(total_power, 1),
            total_kwh=round(total_kwh, 4),
            devices=devices_out,
            series=series,
        )
