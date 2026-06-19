from backend.integrations.base import DeviceAdapter


class ZigbeeAdapter(DeviceAdapter):
    async def discover_devices(self) -> list[dict]:
        return [{"id": "zigbee-demo-1", "name": "Zigbee Bulb", "state": {"brightness": 100}}]

    async def get_devices(self) -> list[dict]:
        return await self.discover_devices()

    async def get_state(self, device_id: str) -> dict:
        return {"id": device_id, "brightness": 100}

    async def turn_on(self, device_id: str) -> None:
        return None

    async def turn_off(self, device_id: str) -> None:
        return None
