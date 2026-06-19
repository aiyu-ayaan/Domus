from pydantic import BaseModel, Field


class DeviceBase(BaseModel):
    name: str
    device_type: str = "light"
    vendor: str = "unknown"


class DeviceCreate(DeviceBase):
    integration_id: str
    room_id: str | None = None


class DeviceRead(DeviceBase):
    id: str
    online: bool = True
    room_id: str | None = None
    integration_id: str
    metadata: dict = Field(default_factory=dict)
