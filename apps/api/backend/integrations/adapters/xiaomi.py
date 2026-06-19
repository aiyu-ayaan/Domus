from backend.common.enums import DeviceType, IntegrationType
from backend.integrations.base import DiscoveredDevice, MockDeviceAdapter


class XiaomiAdapter(MockDeviceAdapter):
    kind = IntegrationType.xiaomi
    catalog = [
        DiscoveredDevice(
            external_id="mi-motion-01",
            name="Mi Motion Sensor",
            device_type=DeviceType.sensor,
            manufacturer="Xiaomi",
            model="RTCGQ11LM",
            serial_number="MI0001",
            attributes={"sensor": "motion"},
        ),
        DiscoveredDevice(
            external_id="mi-fan-01",
            name="Mi Smart Fan",
            device_type=DeviceType.fan,
            manufacturer="Xiaomi",
            model="ZNFAN02DM",
            serial_number="MI0002",
            attributes={"speeds": 4},
        ),
    ]
