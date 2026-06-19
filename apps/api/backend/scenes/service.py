from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.models import User
from backend.core.exceptions import NotFoundError
from backend.devices.service import DeviceService
from backend.homes.service import HomeService
from backend.scenes.models import Scene, SceneDeviceState
from backend.scenes.schemas import SceneActivateResult, SceneCreate, SceneUpdate


class SceneService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.homes = HomeService(session)
        self.devices = DeviceService(session)

    async def list_for(self, user: User, home_id: UUID | None = None) -> list[Scene]:
        if home_id is not None:
            await self.homes.get_for(home_id, user)
            home_ids = [home_id]
        else:
            home_ids = [h.id for h in await self.homes.list_for(user)]
        res = await self.session.execute(select(Scene).where(Scene.home_id.in_(home_ids)))
        return list(res.scalars().all())

    async def get_for(self, scene_id: UUID, user: User) -> Scene:
        scene = await self.session.get(Scene, scene_id)
        if scene is None:
            raise NotFoundError("Scene not found")
        await self.homes.get_for(scene.home_id, user)
        return scene

    async def create(self, data: SceneCreate, user: User) -> Scene:
        await self.homes.get_for(data.home_id, user)
        scene = Scene(home_id=data.home_id, name=data.name, description=data.description)
        scene.states = [
            SceneDeviceState(device_id=s.device_id, state=s.state, attributes=s.attributes)
            for s in data.states
        ]
        self.session.add(scene)
        await self.session.flush()
        return scene

    async def update(self, scene_id: UUID, data: SceneUpdate, user: User) -> Scene:
        scene = await self.get_for(scene_id, user)
        if data.name is not None:
            scene.name = data.name
        if data.description is not None:
            scene.description = data.description
        if data.states is not None:
            scene.states = [
                SceneDeviceState(device_id=s.device_id, state=s.state, attributes=s.attributes)
                for s in data.states
            ]
        await self.session.flush()
        return scene

    async def delete(self, scene_id: UUID, user: User) -> None:
        scene = await self.get_for(scene_id, user)
        await self.session.delete(scene)

    async def activate(self, scene_id: UUID, user: User) -> SceneActivateResult:
        scene = await self.get_for(scene_id, user)
        return await self._apply_scene(scene)

    async def activate_system(self, scene_id: UUID) -> SceneActivateResult:
        """Activate without a user actor (automation engine)."""
        scene = await self.session.get(Scene, scene_id)
        if scene is None:
            raise NotFoundError("Scene not found")
        return await self._apply_scene(scene)

    async def _apply_scene(self, scene: Scene) -> SceneActivateResult:
        applied = failed = 0
        for target in scene.states:
            action = "turn_off" if target.state == "off" else "turn_on"
            try:
                await self.devices.control_system(target.device_id, action)
                applied += 1
            except Exception:  # noqa: BLE001 — one bad device shouldn't abort the scene
                failed += 1
        return SceneActivateResult(scene_id=scene.id, applied=applied, failed=failed)
