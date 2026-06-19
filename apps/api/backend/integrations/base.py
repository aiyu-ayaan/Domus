from abc import ABC, abstractmethod


class DeviceAdapter(ABC):
    @abstractmethod
    async def discover_devices(self) -> list[dict]:
        raise NotImplementedError

    @abstractmethod
    async def get_devices(self) -> list[dict]:
        raise NotImplementedError

    @abstractmethod
    async def get_state(self, device_id: str) -> dict:
        raise NotImplementedError

    @abstractmethod
    async def turn_on(self, device_id: str) -> None:
        raise NotImplementedError

    @abstractmethod
    async def turn_off(self, device_id: str) -> None:
        raise NotImplementedError
