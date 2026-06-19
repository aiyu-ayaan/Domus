from backend.integrations.base import DeviceAdapter


class XiaomiAdapter(DeviceAdapter):
    async def discover_devices(self) -> list[dict]:
        return [{"id": "xiaomi-demo-1", "name": "Xiaomi Sensor", "state": {"battery": 96}}]

    async def get_devices(self) -> list[dict]:
        return await self.discover_devices()

    async def get_state(self, device_id: str) -> dict:
        return {"id": device_id, "battery": 96}

    async def turn_on(self, device_id: str) -> None:
        return None

    async def turn_off(self, device_id: str) -> None:
        return None
