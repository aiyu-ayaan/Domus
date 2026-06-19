from backend.integrations.matter.adapter import MatterAdapter
from backend.integrations.mqtt.adapter import MqttAdapter
from backend.integrations.tapo.adapter import TapoAdapter
from backend.integrations.tuya.adapter import TuyaAdapter
from backend.integrations.xiaomi.adapter import XiaomiAdapter
from backend.integrations.zigbee.adapter import ZigbeeAdapter

ADAPTERS = {
    "tapo": TapoAdapter,
    "xiaomi": XiaomiAdapter,
    "tuya": TuyaAdapter,
    "mqtt": MqttAdapter,
    "matter": MatterAdapter,
    "zigbee": ZigbeeAdapter
}


def get_adapter(kind: str):
    return ADAPTERS.get(kind, MqttAdapter)()
