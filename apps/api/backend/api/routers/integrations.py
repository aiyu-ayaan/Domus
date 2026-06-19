from fastapi import APIRouter

router = APIRouter()


@router.get("")
def list_integrations() -> list[dict]:
    return [
        {"kind": "tapo", "name": "TP-Link Tapo", "enabled": True},
        {"kind": "xiaomi", "name": "Xiaomi", "enabled": True},
        {"kind": "tuya", "name": "Tuya", "enabled": True},
        {"kind": "mqtt", "name": "MQTT Broker", "enabled": True},
        {"kind": "matter", "name": "Matter", "enabled": True},
        {"kind": "zigbee", "name": "Zigbee", "enabled": True}
    ]
