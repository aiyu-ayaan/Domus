from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.models import User
from backend.common.enums import NotificationType
from backend.core.events import NOTIFICATION_CREATED, Event, event_bus
from backend.core.exceptions import NotFoundError
from backend.core.pagination import PageParams
from backend.homes.service import HomeService
from backend.notifications.models import Notification


class NotificationService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.homes = HomeService(session)

    async def create(
        self,
        home_id: UUID,
        type_: NotificationType,
        title: str,
        body: str = "",
        meta: dict | None = None,
    ) -> Notification:
        """Internal entry point — services call this to raise a notification."""
        note = Notification(
            home_id=home_id, type=type_.value, title=title, body=body, meta=meta or {}
        )
        self.session.add(note)
        await self.session.flush()
        await event_bus.publish(
            Event(
                type=NOTIFICATION_CREATED,
                home_id=str(home_id),
                data={"id": str(note.id), "title": title, "notification_type": type_.value},
            )
        )
        return note

    async def list_for(
        self,
        user: User,
        params: PageParams,
        *,
        home_id: UUID | None = None,
        unread: bool | None = None,
    ) -> list[Notification]:
        if home_id is not None:
            await self.homes.get_for(home_id, user)
            home_ids = [home_id]
        else:
            home_ids = [h.id for h in await self.homes.list_for(user)]
        stmt = select(Notification).where(Notification.home_id.in_(home_ids))
        if unread is not None:
            stmt = stmt.where(Notification.read.is_(not unread))
        stmt = (
            stmt.order_by(Notification.created_at.desc()).limit(params.limit).offset(params.offset)
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def mark_read(self, notification_id: UUID, user: User) -> Notification:
        note = await self.session.get(Notification, notification_id)
        if note is None:
            raise NotFoundError("Notification not found")
        await self.homes.get_for(note.home_id, user)
        note.read = True
        await self.session.flush()
        return note
