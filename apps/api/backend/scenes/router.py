from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import CurrentUser
from backend.core.database import get_db
from backend.scenes.schemas import (
    SceneActivateResult,
    SceneCreate,
    SceneOut,
    SceneUpdate,
)
from backend.scenes.service import SceneService

router = APIRouter(prefix="/scenes", tags=["scenes"])

Session = Annotated[AsyncSession, Depends(get_db)]


@router.get("", response_model=list[SceneOut])
async def list_scenes(
    user: CurrentUser, session: Session, home_id: UUID | None = None
) -> list[SceneOut]:
    scenes = await SceneService(session).list_for(user, home_id)
    return [SceneOut.model_validate(s) for s in scenes]


@router.post("", response_model=SceneOut, status_code=status.HTTP_201_CREATED)
async def create_scene(data: SceneCreate, user: CurrentUser, session: Session) -> SceneOut:
    return SceneOut.model_validate(await SceneService(session).create(data, user))


@router.get("/{scene_id}", response_model=SceneOut)
async def get_scene(scene_id: UUID, user: CurrentUser, session: Session) -> SceneOut:
    return SceneOut.model_validate(await SceneService(session).get_for(scene_id, user))


@router.patch("/{scene_id}", response_model=SceneOut)
async def update_scene(
    scene_id: UUID, data: SceneUpdate, user: CurrentUser, session: Session
) -> SceneOut:
    return SceneOut.model_validate(await SceneService(session).update(scene_id, data, user))


@router.delete("/{scene_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scene(scene_id: UUID, user: CurrentUser, session: Session) -> None:
    await SceneService(session).delete(scene_id, user)


@router.post("/{scene_id}/activate", response_model=SceneActivateResult)
async def activate_scene(
    scene_id: UUID, user: CurrentUser, session: Session
) -> SceneActivateResult:
    return await SceneService(session).activate(scene_id, user)
