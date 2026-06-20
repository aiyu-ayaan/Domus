from backend.common.enums import DeviceType, IntegrationType
from backend.integrations.base import DiscoveredDevice, MockDeviceAdapter


class ZigbeeAdapter(MockDeviceAdapter):
    kind = IntegrationType.zigbee
    catalog = [
        DiscoveredDevice(
            external_id="zigbee-bulb-01",
            name="Zigbee Bulb",
            device_type=DeviceType.light,
            manufacturer="IKEA",
            model="TRADFRI LED1545G12",
            serial_number="ZB0001",
            attributes={
                "color": "#ffffff",
                "color_temp": 4000,
                "dimmable": True,
                "brightness": 100,
            },
        ),
        DiscoveredDevice(
            external_id="zigbee-contact-01",
            name="Zigbee Door Sensor",
            device_type=DeviceType.sensor,
            manufacturer="Aqara",
            model="MCCGQ11LM",
            serial_number="ZB0002",
            attributes={"sensor": "contact"},
        ),
    ]
