from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.schemas.device import DeviceRead
from backend.services.device_service import DeviceService

router = APIRouter()


@router.get("", response_model=list[DeviceRead])
def list_devices(db: Session = Depends(get_db)) -> list[DeviceRead]:
    service = DeviceService(db)
    return [
        DeviceRead(
            id=str(device.id),
            name=device.name,
            device_type=device.device_type,
            vendor=device.vendor,
            online=device.online,
            room_id=str(device.room_id) if device.room_id else None,
            integration_id=str(device.integration_id),
            metadata=device.metadata,
        )
        for device in service.list_devices()
    ]
