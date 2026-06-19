from backend.common.enums import DeviceType, IntegrationType
from backend.integrations.base import DiscoveredDevice, MockDeviceAdapter


class MatterAdapter(MockDeviceAdapter):
    kind = IntegrationType.matter
    catalog = [
        DiscoveredDevice(
            external_id="matter-lock-01",
            name="Matter Door Lock",
            device_type=DeviceType.lock,
            manufacturer="Matter",
            model="M-Lock 100",
            serial_number="MATTER0001",
            attributes={"fabric": "domus"},
        ),
        DiscoveredDevice(
            external_id="matter-light-01",
            name="Matter Ceiling Light",
            device_type=DeviceType.light,
            manufacturer="Matter",
            model="M-Light 200",
            serial_number="MATTER0002",
            attributes={"dimmable": True},
        ),
    ]
