from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RoomCreate(BaseModel):
    home_id: UUID
    name: str = Field(min_length=1, max_length=255)
    icon: str | None = Field(default=None, max_length=64)


class RoomUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    icon: str | None = Field(default=None, max_length=64)


class RoomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    home_id: UUID
    name: str
    icon: str | None
    created_at: datetime
