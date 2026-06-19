"""Map an integration kind to its adapter and build instances.

Adding a real integration = add a class + one line here. ``get_adapter`` decrypts the
stored credentials before handing them to the adapter.
"""

from backend.common.enums import IntegrationType
from backend.core.crypto import decrypt_json
from backend.integrations.adapters.matter import MatterAdapter
from backend.integrations.adapters.mqtt import MqttAdapter
from backend.integrations.adapters.tapo import TapoAdapter
from backend.integrations.adapters.tuya import TuyaAdapter
from backend.integrations.adapters.xiaomi import XiaomiAdapter
from backend.integrations.adapters.zigbee import ZigbeeAdapter
from backend.integrations.base import DeviceAdapter

_REGISTRY: dict[IntegrationType, type[DeviceAdapter]] = {
    IntegrationType.tapo: TapoAdapter,
    IntegrationType.xiaomi: XiaomiAdapter,
    IntegrationType.tuya: TuyaAdapter,
    IntegrationType.mqtt: MqttAdapter,
    IntegrationType.matter: MatterAdapter,
    IntegrationType.zigbee: ZigbeeAdapter,
}


def adapter_class(kind: IntegrationType | str) -> type[DeviceAdapter]:
    return _REGISTRY[IntegrationType(kind)]


def get_adapter(integration) -> DeviceAdapter:
    """Build an adapter from an Integration model, decrypting its stored config.

    A Tapo integration provisioned with real credentials/hosts gets the live
    ``python-kasa`` adapter; otherwise it falls back to the in-memory mock (which
    also keeps the test suite and the no-hardware demo working).
    """
    config: dict = {}
    if integration.config_encrypted:
        config = decrypt_json(integration.config_encrypted)

    kind = IntegrationType(integration.type)
    if kind is IntegrationType.tapo:
        from backend.integrations.adapters.tapo_kasa import (
            RealTapoAdapter,
            has_real_config,
        )

        if has_real_config(config):
            return RealTapoAdapter(config)

    return adapter_class(kind)(config)


def available_integrations() -> list[str]:
    return [k.value for k in _REGISTRY]
