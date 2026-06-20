"""Mock adapters for popular consumer smart-light ecosystems.

ponytail: these are all single-bulb mock catalogs that share MockDeviceAdapter's
behavior, so a brand-adapter factory beats six near-identical class bodies. Swap a
real SDK in per brand later by giving it its own class (see TapoAdapter).
"""

from backend.common.enums import DeviceType, IntegrationType
from backend.integrations.base import DiscoveredDevice, MockDeviceAdapter


def _light(prefix: str, name: str, manufacturer: str, model: str) -> DiscoveredDevice:
    return DiscoveredDevice(
        external_id=f"{prefix}-light-01",
        name=name,
        device_type=DeviceType.light,
        manufacturer=manufacturer,
        model=model,
        serial_number=f"{prefix.upper()}0001",
        attributes={"brightness": 100, "color": "#ffffff"},
    )


def _brand_adapter(kind: IntegrationType, device: DiscoveredDevice) -> type[MockDeviceAdapter]:
    return type(
        f"{kind.value.title().replace('_', '')}Adapter",
        (MockDeviceAdapter,),
        {"kind": kind, "catalog": [device]},
    )


PhilipsHueAdapter = _brand_adapter(
    IntegrationType.philips_hue,
    _light("hue", "Philips Hue Bulb", "Philips", "Hue White & Color"),
)
WizAdapter = _brand_adapter(
    IntegrationType.wiz, _light("wiz", "WiZ Smart Bulb", "WiZ", "A60 Color")
)
LifxAdapter = _brand_adapter(
    IntegrationType.lifx, _light("lifx", "LIFX Color", "LIFX", "Color A19")
)
GoveeAdapter = _brand_adapter(
    IntegrationType.govee, _light("govee", "Govee LED Strip", "Govee", "H6159")
)
WiproAdapter = _brand_adapter(
    IntegrationType.wipro, _light("wipro", "Wipro Smart Bulb", "Wipro", "Garnet B22")
)
SyskaAdapter = _brand_adapter(
    IntegrationType.syska, _light("syska", "Syska Smart Bulb", "Syska", "SSK-SMW-9W")
)
