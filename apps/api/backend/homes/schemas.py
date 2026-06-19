from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class HomeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    timezone: str = Field(default="UTC", max_length=64)


class HomeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    timezone: str | None = Field(default=None, max_length=64)


class HomeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    timezone: str
    owner_id: UUID
    created_at: datetime
