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

# ponytail: if two consecutive power samples are more than 5 minutes apart the
# device was off (or the API was down) during that gap. Don't integrate across it
# or a single 100 W plug left off overnight creates a fake multi-kWh spike.
_MAX_GAP_S = 300.0


def integrate_energy_kwh(samples: list[Sample]) -> float:
    """Trapezoidal integral of watt samples over time -> kWh, skipping gaps."""
    if len(samples) < 2:
        return 0.0
    wh = 0.0
    for (t0, w0), (t1, w1) in zip(samples, samples[1:], strict=False):
        delta_s = (t1 - t0).total_seconds()
        if delta_s > _MAX_GAP_S:
            continue
        wh += (w0 + w1) / 2.0 * (delta_s / 3600.0)
    return wh / 1000.0


def _bucket_start(ts: datetime, bucket_seconds: int, origin: datetime) -> datetime:
    delta = int((ts - origin).total_seconds())
    return origin + timedelta(seconds=(delta // bucket_seconds) * bucket_seconds)


class EnergyService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.homes = HomeService(session)

    async def summary(
        self,
        user: User,
        home_id: UUID | None,
        hours: int,
        minutes: int | None = None,
    ) -> EnergySummary:
        if minutes is not None:
            minutes = max(1, min(minutes, 60 * 24 * 31))
            delta = timedelta(minutes=minutes)
            total_hours = minutes / 60.0
        else:
            hours = max(1, min(hours, 24 * 31))
            delta = timedelta(hours=hours)
            total_hours = float(hours)
            minutes = hours * 60

        home_ids = (
            [home_id] if home_id is not None else [h.id for h in await self.homes.list_for(user)]
        )
        if home_id is not None:
            await self.homes.get_for(home_id, user)

        origin = datetime.now(UTC) - delta

        # ponytail: two small queries instead of one large JOIN that constructs a full
        # Device ORM object for every DeviceState row (N_devices × N_states objects).
        # Step 1: device metadata (tiny).
        dev_res = await self.session.execute(
            select(Device.id, Device.name, Device.model).where(Device.home_id.in_(home_ids))
        )
        device_meta = {row.id: row for row in dev_res.all()}

        # Step 2: only the columns we actually use from device_states (no full ORM load).
        state_res = await self.session.execute(
            select(DeviceState.device_id, DeviceState.created_at, DeviceState.attributes)
            .where(
                DeviceState.device_id.in_(list(device_meta.keys())),
                DeviceState.created_at >= origin,
            )
            .order_by(DeviceState.created_at)
        )
        rows = state_res.all()

        per_device: dict[UUID, list[Sample]] = {}
        for row in rows:
            attrs = row.attributes if isinstance(row.attributes, dict) else {}
            power = attrs.get("power_w") or attrs.get("current_consumption")
            if power is None:
                continue
            ts = row.created_at
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=UTC)
            per_device.setdefault(row.device_id, []).append((ts, float(power)))

        if minutes <= 1:
            bucket_seconds = 2
        elif minutes <= 5:
            bucket_seconds = 10
        elif minutes <= 60:
            bucket_seconds = 60
        elif minutes <= 1440:
            bucket_seconds = 600
        elif minutes <= 2880:
            bucket_seconds = 3600
        else:
            bucket_seconds = 86400

        # Pre-seed every bucket so the series is continuous (gaps render as zero, not missing).
        buckets: dict[datetime, float] = {}
        cursor = _bucket_start(origin, bucket_seconds, origin)
        last_bucket = _bucket_start(datetime.now(UTC), bucket_seconds, origin)
        while cursor <= last_bucket:
            buckets[cursor] = 0.0
            cursor += timedelta(seconds=bucket_seconds)

        devices_out: list[EnergyDevice] = []
        total_kwh = 0.0
        total_power = 0.0

        for did, samples in per_device.items():
            kwh = integrate_energy_kwh(samples)
            latest = samples[-1][1]
            total_kwh += kwh
            total_power += latest
            meta = device_meta[did]
            devices_out.append(
                EnergyDevice(
                    device_id=did,
                    name=meta.name,
                    model=meta.model,
                    power_w=round(latest, 1),
                    energy_kwh=round(kwh, 4),
                )
            )
            for (t0, w0), (t1, w1) in zip(samples, samples[1:], strict=False):
                delta_s = (t1 - t0).total_seconds()
                if delta_s > _MAX_GAP_S:
                    continue  # same gap guard as integrate_energy_kwh
                wh = (w0 + w1) / 2.0 * (delta_s / 3600.0)
                b = _bucket_start(t0, bucket_seconds, origin)
                buckets[b] = buckets.get(b, 0.0) + wh / 1000.0

        devices_out.sort(key=lambda d: d.energy_kwh, reverse=True)
        series = [EnergyPoint(t=t, kwh=round(v, 4)) for t, v in sorted(buckets.items())]
        return EnergySummary(
            range_hours=round(total_hours, 3),
            total_power_w=round(total_power, 1),
            total_kwh=round(total_kwh, 4),
            devices=devices_out,
            series=series,
        )
