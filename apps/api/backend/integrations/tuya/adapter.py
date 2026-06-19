from backend.integrations.base import DeviceAdapter


class TuyaAdapter(DeviceAdapter):
    async def discover_devices(self) -> list[dict]:
        return [{"id": "tuya-demo-1", "name": "Tuya Light", "state": {"brightness": 80}}]

    async def get_devices(self) -> list[dict]:
        return await self.discover_devices()

    async def get_state(self, device_id: str) -> dict:
        return {"id": device_id, "brightness": 80}

    async def turn_on(self, device_id: str) -> None:
        return None

    async def turn_off(self, device_id: str) -> None:
        return None
