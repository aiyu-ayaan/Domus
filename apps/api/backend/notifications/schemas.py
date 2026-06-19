from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from backend.common.enums import NotificationType


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    home_id: UUID
    type: NotificationType
    title: str
    body: str
    read: bool
    meta: dict[str, Any]
    created_at: datetime
