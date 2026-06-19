from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from backend.common.enums import IntegrationType


class IntegrationCreate(BaseModel):
    home_id: UUID
    name: str = Field(min_length=1, max_length=255)
    type: IntegrationType
    enabled: bool = True
    # Free-form credentials (api keys, device passwords). Encrypted before storage.
    config: dict[str, Any] = Field(default_factory=dict)


class IntegrationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    enabled: bool | None = None
    config: dict[str, Any] | None = None


class IntegrationOut(BaseModel):
    """Note: ``config`` is intentionally never returned — secrets stay server-side."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    home_id: UUID
    name: str
    type: IntegrationType
    enabled: bool
    last_sync_at: datetime | None
    created_at: datetime


class DiscoveredDeviceOut(BaseModel):
    external_id: str
    name: str
    device_type: str
    manufacturer: str
    model: str
    serial_number: str | None
    attributes: dict[str, Any]
    already_registered: bool


class DiscoveryResult(BaseModel):
    integration_id: UUID
    discovered: list[DiscoveredDeviceOut]
    new_count: int
    existing_count: int
