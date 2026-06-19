from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TriggerType(str, Enum):
    device_state = "device_state"  # a device reports a (matching) state
    device_offline = "device_offline"  # a device goes offline
    new_device = "new_device"  # discovery found a device
    time = "time"  # scheduled / sunset (fired by scheduler or manually)
    manual = "manual"


class ConditionOp(str, Enum):
    eq = "eq"
    ne = "ne"
    gt = "gt"
    lt = "lt"
    gte = "gte"
    lte = "lte"
    in_ = "in"


class ActionType(str, Enum):
    turn_on = "device.turn_on"
    turn_off = "device.turn_off"
    toggle = "device.toggle"
    activate_scene = "scene.activate"
    notify = "notification.send"


class Trigger(BaseModel):
    type: TriggerType
    device_id: UUID | None = None
    state: str | None = None  # for device_state; None = any state change
    at: str | None = None  # for time triggers, e.g. "sunset" or "22:00"


class Condition(BaseModel):
    field: str
    op: ConditionOp
    value: Any


class Action(BaseModel):
    type: ActionType
    device_id: UUID | None = None
    scene_id: UUID | None = None
    title: str | None = None
    body: str | None = None


class AutomationCreate(BaseModel):
    home_id: UUID
    name: str = Field(min_length=1, max_length=255)
    enabled: bool = True
    trigger: Trigger
    conditions: list[Condition] = Field(default_factory=list)
    actions: list[Action] = Field(min_length=1)


class AutomationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    enabled: bool | None = None
    trigger: Trigger | None = None
    conditions: list[Condition] | None = None
    actions: list[Action] | None = None


class AutomationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    home_id: UUID
    name: str
    enabled: bool
    trigger: Trigger
    conditions: list[Condition]
    actions: list[Action]
    last_triggered_at: datetime | None
    last_error: str | None
    created_at: datetime


class AutomationRunResult(BaseModel):
    automation_id: UUID
    matched: bool
    executed: bool
    error: str | None = None
