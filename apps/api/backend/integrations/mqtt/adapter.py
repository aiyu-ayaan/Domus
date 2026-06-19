from backend.integrations.base import DeviceAdapter


class MqttAdapter(DeviceAdapter):
    async def discover_devices(self) -> list[dict]:
        return [{"id": "mqtt-demo-1", "name": "MQTT Relay", "state": {"online": True}}]

    async def get_devices(self) -> list[dict]:
        return await self.discover_devices()

    async def get_state(self, device_id: str) -> dict:
        return {"id": device_id, "online": True}

    async def turn_on(self, device_id: str) -> None:
        return None

    async def turn_off(self, device_id: str) -> None:
        return None
