from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from backend.common.enums import DeviceType


class DeviceCreate(BaseModel):
    home_id: UUID
    integration_id: UUID
    external_id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=255)
    device_type: DeviceType = DeviceType.other
    room_id: UUID | None = None
    manufacturer: str | None = None
    model: str | None = None
    serial_number: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)


class DeviceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    room_id: UUID | None = None
    device_type: DeviceType | None = None
    meta: dict[str, Any] | None = None


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    home_id: UUID
    integration_id: UUID
    room_id: UUID | None
    external_id: str
    name: str
    manufacturer: str | None
    model: str | None
    serial_number: str | None
    device_type: DeviceType
    online: bool
    last_seen: datetime | None
    meta: dict[str, Any]
    created_at: datetime


class DeviceStateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    device_id: UUID
    state: str
    attributes: dict[str, Any]
    created_at: datetime
