from backend.common.enums import DeviceType, IntegrationType
from backend.integrations.base import DiscoveredDevice, MockDeviceAdapter


class TapoAdapter(MockDeviceAdapter):
    kind = IntegrationType.tapo
    catalog = [
        DiscoveredDevice(
            external_id="tapo-p110-01",
            name="TP-Link Tapo Plug",
            device_type=DeviceType.plug,
            manufacturer="TP-Link",
            model="Tapo P110",
            serial_number="TAPO0001",
            attributes={"energy_monitoring": True, "rated_power_w": 220},
        ),
        DiscoveredDevice(
            external_id="tapo-l530-01",
            name="Tapo Smart Bulb",
            device_type=DeviceType.light,
            manufacturer="TP-Link",
            model="Tapo L530",
            serial_number="TAPO0002",
            attributes={
                "color": "#ffffff",
                "color_temp": 4000,
                "dimmable": True,
                "brightness": 100,
            },
        ),
    ]
