from sqlalchemy.orm import Session

from backend.integrations.base import DeviceAdapter
from backend.integrations.factory import get_adapter
from backend.models.domain import Device, Integration


class DeviceService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_devices(self) -> list[Device]:
        return list(self.db.query(Device).order_by(Device.name.asc()).all())

    def discover_integration_devices(self, integration_id: str) -> list[dict]:
        integration = self.db.query(Integration).filter(Integration.id == integration_id).one()
        adapter: DeviceAdapter = get_adapter(integration.kind)
        return adapter.discover_devices()
