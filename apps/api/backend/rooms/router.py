from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import CurrentUser
from backend.core.database import get_db
from backend.rooms.schemas import RoomCreate, RoomOut, RoomUpdate
from backend.rooms.service import RoomService

router = APIRouter(prefix="/rooms", tags=["rooms"])

Session = Annotated[AsyncSession, Depends(get_db)]


@router.get("", response_model=list[RoomOut])
async def list_rooms(
    user: CurrentUser, session: Session, home_id: UUID | None = None
) -> list[RoomOut]:
    rooms = await RoomService(session).list_for(user, home_id)
    return [RoomOut.model_validate(r) for r in rooms]


@router.post("", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
async def create_room(data: RoomCreate, user: CurrentUser, session: Session) -> RoomOut:
    return RoomOut.model_validate(await RoomService(session).create(data, user))


@router.patch("/{room_id}", response_model=RoomOut)
async def update_room(
    room_id: UUID, data: RoomUpdate, user: CurrentUser, session: Session
) -> RoomOut:
    return RoomOut.model_validate(await RoomService(session).update(room_id, data, user))


@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_room(room_id: UUID, user: CurrentUser, session: Session) -> None:
    await RoomService(session).delete(room_id, user)
