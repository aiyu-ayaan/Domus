from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import CurrentUser
from backend.common.enums import DeviceType
from backend.core.database import get_db
from backend.core.exceptions import NotFoundError
from backend.core.pagination import Page, PageParams
from backend.devices.schemas import DeviceCreate, DeviceOut, DeviceStateOut, DeviceUpdate
from backend.devices.service import DeviceService

router = APIRouter(prefix="/devices", tags=["devices"])

Session = Annotated[AsyncSession, Depends(get_db)]
Params = Annotated[PageParams, Depends()]


@router.get("", response_model=Page[DeviceOut])
async def list_devices(
    user: CurrentUser,
    session: Session,
    params: Params,
    home_id: UUID | None = None,
    room_id: UUID | None = None,
    device_type: DeviceType | None = None,
    online: bool | None = None,
) -> Page[DeviceOut]:
    items, total = await DeviceService(session).list_for(
        user,
        params,
        home_id=home_id,
        room_id=room_id,
        device_type=device_type.value if device_type else None,
        online=online,
    )
    return Page.build([DeviceOut.model_validate(d) for d in items], total, params)


@router.post("", response_model=DeviceOut, status_code=status.HTTP_201_CREATED)
async def create_device(data: DeviceCreate, user: CurrentUser, session: Session) -> DeviceOut:
    return DeviceOut.model_validate(await DeviceService(session).create(data, user))


@router.get("/{device_id}", response_model=DeviceOut)
async def get_device(device_id: UUID, user: CurrentUser, session: Session) -> DeviceOut:
    return DeviceOut.model_validate(await DeviceService(session).get_for(device_id, user))


@router.patch("/{device_id}", response_model=DeviceOut)
async def update_device(
    device_id: UUID, data: DeviceUpdate, user: CurrentUser, session: Session
) -> DeviceOut:
    return DeviceOut.model_validate(await DeviceService(session).update(device_id, data, user))


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(device_id: UUID, user: CurrentUser, session: Session) -> None:
    await DeviceService(session).delete(device_id, user)


# --- control ---------------------------------------------------------------------
async def _control(action: str, device_id: UUID, user: CurrentUser, session: Session):
    state = await DeviceService(session).control(device_id, action, user)
    return DeviceStateOut.model_validate(state)


@router.post("/{device_id}/turn-on", response_model=DeviceStateOut)
async def turn_on(device_id: UUID, user: CurrentUser, session: Session) -> DeviceStateOut:
    return await _control("turn_on", device_id, user, session)


@router.post("/{device_id}/turn-off", response_model=DeviceStateOut)
async def turn_off(device_id: UUID, user: CurrentUser, session: Session) -> DeviceStateOut:
    return await _control("turn_off", device_id, user, session)


@router.post("/{device_id}/toggle", response_model=DeviceStateOut)
async def toggle(device_id: UUID, user: CurrentUser, session: Session) -> DeviceStateOut:
    return await _control("toggle", device_id, user, session)


# --- state & history -------------------------------------------------------------
@router.get("/{device_id}/state", response_model=DeviceStateOut)
async def get_state(device_id: UUID, user: CurrentUser, session: Session) -> DeviceStateOut:
    state = await DeviceService(session).current_state(device_id, user)
    if state is None:
        raise NotFoundError("No state recorded for this device yet")
    return DeviceStateOut.model_validate(state)


@router.get("/{device_id}/history", response_model=list[DeviceStateOut])
async def get_history(
    device_id: UUID, user: CurrentUser, session: Session, params: Params
) -> list[DeviceStateOut]:
    rows = await DeviceService(session).history(device_id, user, params)
    return [DeviceStateOut.model_validate(s) for s in rows]
