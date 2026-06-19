from enum import Enum


class Role(str, Enum):
    owner = "owner"
    admin = "admin"
    user = "user"
    guest = "guest"


# Privilege order, lowest → highest. Used by require_role().
ROLE_ORDER = [Role.guest, Role.user, Role.admin, Role.owner]


def role_rank(role: Role | str) -> int:
    role = Role(role)
    return ROLE_ORDER.index(role)


class DeviceType(str, Enum):
    light = "light"
    plug = "plug"
    switch = "switch"
    sensor = "sensor"
    camera = "camera"
    thermostat = "thermostat"
    fan = "fan"
    lock = "lock"
    other = "other"


class IntegrationType(str, Enum):
    tapo = "tapo"
    xiaomi = "xiaomi"
    tuya = "tuya"
    mqtt = "mqtt"
    matter = "matter"
    zigbee = "zigbee"


class NotificationType(str, Enum):
    device_offline = "device_offline"
    automation_failed = "automation_failed"
    new_device_found = "new_device_found"
    security_alert = "security_alert"
