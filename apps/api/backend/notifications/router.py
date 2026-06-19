from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import CurrentUser
from backend.core.database import get_db
from backend.core.pagination import PageParams
from backend.notifications.schemas import NotificationOut
from backend.notifications.service import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])

Session = Annotated[AsyncSession, Depends(get_db)]
Params = Annotated[PageParams, Depends()]


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    user: CurrentUser,
    session: Session,
    params: Params,
    home_id: UUID | None = None,
    unread: bool | None = None,
) -> list[NotificationOut]:
    rows = await NotificationService(session).list_for(user, params, home_id=home_id, unread=unread)
    return [NotificationOut.model_validate(n) for n in rows]


@router.post("/{notification_id}/read", response_model=NotificationOut)
async def mark_read(notification_id: UUID, user: CurrentUser, session: Session) -> NotificationOut:
    return NotificationOut.model_validate(
        await NotificationService(session).mark_read(notification_id, user)
    )
