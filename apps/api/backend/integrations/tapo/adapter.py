from backend.integrations.base import DeviceAdapter


class TapoAdapter(DeviceAdapter):
    async def discover_devices(self) -> list[dict]:
        return [{"id": "tapo-demo-1", "name": "Tapo Smart Plug", "state": {"power": "off"}}]

    async def get_devices(self) -> list[dict]:
        return await self.discover_devices()

    async def get_state(self, device_id: str) -> dict:
        return {"id": device_id, "power": "off"}

    async def turn_on(self, device_id: str) -> None:
        return None

    async def turn_off(self, device_id: str) -> None:
        return None
