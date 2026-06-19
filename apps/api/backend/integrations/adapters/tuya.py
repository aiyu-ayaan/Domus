from backend.common.enums import DeviceType, IntegrationType
from backend.integrations.base import DiscoveredDevice, MockDeviceAdapter


class TuyaAdapter(MockDeviceAdapter):
    kind = IntegrationType.tuya
    catalog = [
        DiscoveredDevice(
            external_id="tuya-switch-01",
            name="Tuya Wall Switch",
            device_type=DeviceType.switch,
            manufacturer="Tuya",
            model="TS0011",
            serial_number="TUYA0001",
            attributes={"gang": 1},
        ),
        DiscoveredDevice(
            external_id="tuya-thermo-01",
            name="Tuya Thermostat",
            device_type=DeviceType.thermostat,
            manufacturer="Tuya",
            model="BHT-002",
            serial_number="TUYA0002",
            attributes={"unit": "celsius"},
        ),
    ]
