from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import CurrentUser
from backend.core.database import get_db
from backend.homes.schemas import HomeCreate, HomeOut, HomeUpdate
from backend.homes.service import HomeService

router = APIRouter(prefix="/homes", tags=["homes"])

Session = Annotated[AsyncSession, Depends(get_db)]


@router.get("", response_model=list[HomeOut])
async def list_homes(user: CurrentUser, session: Session) -> list[HomeOut]:
    homes = await HomeService(session).list_for(user)
    return [HomeOut.model_validate(h) for h in homes]


@router.post("", response_model=HomeOut, status_code=status.HTTP_201_CREATED)
async def create_home(data: HomeCreate, user: CurrentUser, session: Session) -> HomeOut:
    return HomeOut.model_validate(await HomeService(session).create(data, user))


@router.get("/{home_id}", response_model=HomeOut)
async def get_home(home_id: UUID, user: CurrentUser, session: Session) -> HomeOut:
    return HomeOut.model_validate(await HomeService(session).get_for(home_id, user))


@router.patch("/{home_id}", response_model=HomeOut)
async def update_home(
    home_id: UUID, data: HomeUpdate, user: CurrentUser, session: Session
) -> HomeOut:
    return HomeOut.model_validate(await HomeService(session).update(home_id, data, user))


@router.delete("/{home_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_home(home_id: UUID, user: CurrentUser, session: Session) -> None:
    await HomeService(session).delete(home_id, user)
