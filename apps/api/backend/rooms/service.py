from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.models import User
from backend.core.exceptions import NotFoundError
from backend.homes.service import HomeService
from backend.rooms.models import Room
from backend.rooms.schemas import RoomCreate, RoomUpdate


class RoomService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.homes = HomeService(session)

    async def list_for(self, user: User, home_id: UUID | None = None) -> list[Room]:
        # Authorise per home, then list that home's rooms.
        if home_id is not None:
            await self.homes.get_for(home_id, user)
            stmt = select(Room).where(Room.home_id == home_id)
        else:
            home_ids = [h.id for h in await self.homes.list_for(user)]
            stmt = select(Room).where(Room.home_id.in_(home_ids))
        return list((await self.session.execute(stmt.order_by(Room.name))).scalars().all())

    async def get_for(self, room_id: UUID, user: User) -> Room:
        room = await self.session.get(Room, room_id)
        if room is None:
            raise NotFoundError("Room not found")
        await self.homes.get_for(room.home_id, user)  # authorises via the home
        return room

    async def create(self, data: RoomCreate, user: User) -> Room:
        await self.homes.get_for(data.home_id, user)
        room = Room(**data.model_dump())
        self.session.add(room)
        await self.session.flush()
        return room

    async def update(self, room_id: UUID, data: RoomUpdate, user: User) -> Room:
        room = await self.get_for(room_id, user)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(room, field, value)
        await self.session.flush()
        return room

    async def delete(self, room_id: UUID, user: User) -> None:
        room = await self.get_for(room_id, user)
        await self.session.delete(room)
