from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import CurrentUser
from backend.core.database import get_db
from backend.energy.schemas import EnergySummary
from backend.energy.service import EnergyService

router = APIRouter(prefix="/energy", tags=["energy"])

Session = Annotated[AsyncSession, Depends(get_db)]


@router.get("/summary", response_model=EnergySummary)
async def energy_summary(
    user: CurrentUser,
    session: Session,
    home_id: UUID | None = None,
    hours: int = 24,
    minutes: int | None = None,
) -> EnergySummary:
    return await EnergyService(session).summary(user, home_id, hours, minutes)
