from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class EnergyDevice(BaseModel):
    device_id: UUID
    name: str
    model: str | None
    power_w: float  # latest instantaneous draw
    energy_kwh: float  # integrated over the window


class EnergyPoint(BaseModel):
    t: datetime  # bucket start
    kwh: float  # energy consumed across all devices in this bucket


class EnergySummary(BaseModel):
    range_hours: int
    total_power_w: float
    total_kwh: float
    devices: list[EnergyDevice]
    series: list[EnergyPoint]
