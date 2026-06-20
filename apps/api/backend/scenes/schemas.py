from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SceneDeviceStateIn(BaseModel):
    device_id: UUID
    state: str = Field(min_length=1, max_length=32)
    attributes: dict[str, Any] = Field(default_factory=dict)


class SceneDeviceStateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    device_id: UUID
    state: str
    attributes: dict[str, Any]


class SceneCreate(BaseModel):
    home_id: UUID
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    states: list[SceneDeviceStateIn] = Field(default_factory=list)


class SceneUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    states: list[SceneDeviceStateIn] | None = None


class SceneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    home_id: UUID
    name: str
    description: str | None
    states: list[SceneDeviceStateOut]
    created_at: datetime


class SceneActivateResult(BaseModel):
    scene_id: UUID
    applied: int
    failed: int
