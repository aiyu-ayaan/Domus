"""One generic async CRUD repository instead of a class per model.

ponytail: services instantiate ``CRUDRepository(Model, session)`` and get list/get/
create/update/delete for free. Specialised queries live on the service, not in a
subclass hierarchy.
"""

from typing import Any, Generic, TypeVar
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.common.models import Base
from backend.core.pagination import PageParams

ModelT = TypeVar("ModelT", bound=Base)


class CRUDRepository(Generic[ModelT]):
    def __init__(self, model: type[ModelT], session: AsyncSession):
        self.model = model
        self.session = session

    async def get(self, id_: UUID) -> ModelT | None:
        return await self.session.get(self.model, id_)

    async def list(
        self,
        *,
        params: PageParams | None = None,
        filters: dict[str, Any] | None = None,
    ) -> tuple[list[ModelT], int]:
        stmt = select(self.model)
        count_stmt = select(func.count()).select_from(self.model)

        for field, value in (filters or {}).items():
            col = getattr(self.model, field)
            stmt = stmt.where(col == value)
            count_stmt = count_stmt.where(col == value)

        if params and params.sort:
            desc = params.sort.startswith("-")
            col = getattr(self.model, params.sort.lstrip("-"), None)
            if col is not None:
                stmt = stmt.order_by(col.desc() if desc else col.asc())

        if params:
            stmt = stmt.limit(params.limit).offset(params.offset)

        total = (await self.session.execute(count_stmt)).scalar_one()
        rows = list((await self.session.execute(stmt)).scalars().all())
        return rows, total

    async def create(self, **values: Any) -> ModelT:
        obj = self.model(**values)
        self.session.add(obj)
        await self.session.flush()
        await self.session.refresh(obj)
        return obj

    async def update(self, obj: ModelT, **values: Any) -> ModelT:
        for key, value in values.items():
            if value is not None:
                setattr(obj, key, value)
        await self.session.flush()
        await self.session.refresh(obj)
        return obj

    async def delete(self, obj: ModelT) -> None:
        await self.session.delete(obj)
        await self.session.flush()
