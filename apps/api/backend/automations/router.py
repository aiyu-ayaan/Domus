from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import CurrentUser
from backend.automations.schemas import (
    AutomationCreate,
    AutomationOut,
    AutomationRunResult,
    AutomationUpdate,
)
from backend.automations.service import AutomationService
from backend.core.database import get_db

router = APIRouter(prefix="/automations", tags=["automations"])

Session = Annotated[AsyncSession, Depends(get_db)]


@router.get("", response_model=list[AutomationOut])
async def list_automations(
    user: CurrentUser, session: Session, home_id: UUID | None = None
) -> list[AutomationOut]:
    rows = await AutomationService(session).list_for(user, home_id)
    return [AutomationOut.model_validate(a) for a in rows]


@router.post("", response_model=AutomationOut, status_code=status.HTTP_201_CREATED)
async def create_automation(
    data: AutomationCreate, user: CurrentUser, session: Session
) -> AutomationOut:
    return AutomationOut.model_validate(await AutomationService(session).create(data, user))


@router.get("/{automation_id}", response_model=AutomationOut)
async def get_automation(automation_id: UUID, user: CurrentUser, session: Session) -> AutomationOut:
    return AutomationOut.model_validate(
        await AutomationService(session).get_for(automation_id, user)
    )


@router.patch("/{automation_id}", response_model=AutomationOut)
async def update_automation(
    automation_id: UUID, data: AutomationUpdate, user: CurrentUser, session: Session
) -> AutomationOut:
    return AutomationOut.model_validate(
        await AutomationService(session).update(automation_id, data, user)
    )


@router.delete("/{automation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_automation(automation_id: UUID, user: CurrentUser, session: Session) -> None:
    await AutomationService(session).delete(automation_id, user)


@router.post("/{automation_id}/trigger", response_model=AutomationRunResult)
async def trigger_automation(
    automation_id: UUID,
    user: CurrentUser,
    session: Session,
    context: Annotated[dict[str, Any], Body(default_factory=dict)],
) -> AutomationRunResult:
    executed = await AutomationService(session).trigger(automation_id, user, context)
    return AutomationRunResult(automation_id=automation_id, matched=True, executed=executed)
