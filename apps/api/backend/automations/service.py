from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.models import User
from backend.automations.engine import automation_engine
from backend.automations.models import Automation
from backend.automations.schemas import AutomationCreate, AutomationUpdate
from backend.core.exceptions import NotFoundError
from backend.homes.service import HomeService


class AutomationService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.homes = HomeService(session)

    async def list_for(self, user: User, home_id: UUID | None = None) -> list[Automation]:
        if home_id is not None:
            await self.homes.get_for(home_id, user)
            home_ids = [home_id]
        else:
            home_ids = [h.id for h in await self.homes.list_for(user)]
        res = await self.session.execute(select(Automation).where(Automation.home_id.in_(home_ids)))
        return list(res.scalars().all())

    async def get_for(self, automation_id: UUID, user: User) -> Automation:
        automation = await self.session.get(Automation, automation_id)
        if automation is None:
            raise NotFoundError("Automation not found")
        await self.homes.get_for(automation.home_id, user)
        return automation

    async def create(self, data: AutomationCreate, user: User) -> Automation:
        await self.homes.get_for(data.home_id, user)
        automation = Automation(
            home_id=data.home_id,
            name=data.name,
            enabled=data.enabled,
            trigger=data.trigger.model_dump(mode="json"),
            conditions=[c.model_dump(mode="json") for c in data.conditions],
            actions=[a.model_dump(mode="json") for a in data.actions],
        )
        self.session.add(automation)
        await self.session.flush()
        return automation

    async def update(self, automation_id: UUID, data: AutomationUpdate, user: User) -> Automation:
        automation = await self.get_for(automation_id, user)
        if data.name is not None:
            automation.name = data.name
        if data.enabled is not None:
            automation.enabled = data.enabled
        if data.trigger is not None:
            automation.trigger = data.trigger.model_dump(mode="json")
        if data.conditions is not None:
            automation.conditions = [c.model_dump(mode="json") for c in data.conditions]
        if data.actions is not None:
            automation.actions = [a.model_dump(mode="json") for a in data.actions]
        await self.session.flush()
        return automation

    async def delete(self, automation_id: UUID, user: User) -> None:
        automation = await self.get_for(automation_id, user)
        await self.session.delete(automation)

    async def trigger(
        self, automation_id: UUID, user: User, context: dict[str, Any] | None = None
    ) -> bool:
        """Manually run an automation (skips trigger matching, still checks conditions)."""
        automation = await self.get_for(automation_id, user)
        return await automation_engine.run_one(self.session, automation, context or {})
