from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.models import User
from backend.common.enums import Role, role_rank
from backend.core.exceptions import ForbiddenError, NotFoundError
from backend.homes.models import Home
from backend.homes.schemas import HomeCreate, HomeUpdate


def _is_admin(user: User) -> bool:
    return role_rank(user.role) >= role_rank(Role.admin)


class HomeService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_for(self, user: User) -> list[Home]:
        stmt = select(Home).order_by(Home.created_at.desc())
        if not _is_admin(user):
            stmt = stmt.where(Home.owner_id == user.id)
        return list((await self.session.execute(stmt)).scalars().all())

    async def get_for(self, home_id: UUID, user: User) -> Home:
        """Fetch a home the user may access, else 404/403."""
        home = await self.session.get(Home, home_id)
        if home is None:
            raise NotFoundError("Home not found")
        if home.owner_id != user.id and not _is_admin(user):
            raise ForbiddenError("Not your home")
        return home

    async def create(self, data: HomeCreate, user: User) -> Home:
        home = Home(**data.model_dump(), owner_id=user.id)
        self.session.add(home)
        await self.session.flush()
        return home

    async def update(self, home_id: UUID, data: HomeUpdate, user: User) -> Home:
        home = await self.get_for(home_id, user)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(home, field, value)
        await self.session.flush()
        return home

    async def delete(self, home_id: UUID, user: User) -> None:
        home = await self.get_for(home_id, user)
        await self.session.delete(home)
