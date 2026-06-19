from backend.common.enums import DeviceType, IntegrationType
from backend.integrations.base import DiscoveredDevice, MockDeviceAdapter


class MqttAdapter(MockDeviceAdapter):
    """Mock MQTT integration. The live MQTT service lives in backend.mqtt; this adapter
    exposes MQTT-published devices through the same control contract."""

    kind = IntegrationType.mqtt
    catalog = [
        DiscoveredDevice(
            external_id="mqtt-relay-01",
            name="MQTT Relay",
            device_type=DeviceType.switch,
            manufacturer="Generic",
            model="ESP8266 Relay",
            serial_number="MQTT0001",
            attributes={"topic": "home/relay/01"},
        ),
        DiscoveredDevice(
            external_id="mqtt-temp-01",
            name="MQTT Temperature Sensor",
            device_type=DeviceType.sensor,
            manufacturer="Generic",
            model="DHT22",
            serial_number="MQTT0002",
            attributes={"topic": "home/sensor/temp01", "sensor": "temperature"},
        ),
    ]
