"""Map an integration kind to its adapter and build instances.

Adding a real integration = add a class + one line here. ``get_adapter`` decrypts the
stored credentials before handing them to the adapter.
"""

from backend.common.enums import IntegrationType
from backend.core.crypto import decrypt_json
from backend.integrations.adapters import brands
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
    IntegrationType.philips_hue: brands.PhilipsHueAdapter,
    IntegrationType.wiz: brands.WizAdapter,
    IntegrationType.lifx: brands.LifxAdapter,
    IntegrationType.govee: brands.GoveeAdapter,
    IntegrationType.wipro: brands.WiproAdapter,
    IntegrationType.syska: brands.SyskaAdapter,
}


# SmartLife/Tuya cloud family — these share the legacy Tuya cloud control path.
_TUYA_FAMILY = {IntegrationType.tuya, IntegrationType.wipro, IntegrationType.syska}


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
    if kind is IntegrationType.mqtt:
        from backend.integrations.adapters.mqtt_tasmota import (
            TasmotaMqttAdapter,
            has_real_config as has_mqtt_config,
        )

        if has_mqtt_config(config):
            return TasmotaMqttAdapter(config)

    if kind is IntegrationType.tapo:
        from backend.integrations.adapters.tapo_kasa import (
            RealTapoAdapter,
            has_real_config,
        )

        if has_real_config(config):
            return RealTapoAdapter(config)

    # Wipro/Syska/Tuya are all SmartLife/Tuya devices. Priority:
    #   1. Tuya OpenAPI v2 (access_id/access_secret) — the official path HA's
    #      current Tuya integration uses; works from anywhere, no LAN needed.
    #   2. Local tinytuya (per-device local_key) — no cloud at all.
    #   3. Legacy tuyapy cloud (username/password) — dead for most accounts,
    #      kept only so old configs don't hard-break.
    if kind in _TUYA_FAMILY:
        from backend.integrations.adapters.tuya_openapi import (
            RealTuyaOpenApiAdapter,
            has_real_config as has_openapi_config,
        )

        if has_openapi_config(config):
            return RealTuyaOpenApiAdapter(config, kind)

        from backend.integrations.adapters.tuya_local import (
            RealTuyaLocalAdapter,
            has_real_config as has_local_config,
        )

        if has_local_config(config):
            return RealTuyaLocalAdapter(config, kind)

        from backend.integrations.adapters.tuya_cloud import (
            RealTuyaAdapter,
            has_real_config as has_cloud_config,
        )

        if has_cloud_config(config):
            return RealTuyaAdapter(config, kind)

    return adapter_class(kind)(config)


def available_integrations() -> list[str]:
    return [k.value for k in _REGISTRY]
