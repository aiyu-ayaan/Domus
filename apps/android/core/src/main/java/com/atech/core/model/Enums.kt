package com.atech.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Mirrors `backend/common/enums.py`. */

@Serializable
enum class Role {
    @SerialName("owner") OWNER,
    @SerialName("admin") ADMIN,
    @SerialName("user") USER,
    @SerialName("guest") GUEST,
}

@Serializable
enum class DeviceType {
    @SerialName("light") LIGHT,
    @SerialName("plug") PLUG,
    @SerialName("switch") SWITCH,
    @SerialName("sensor") SENSOR,
    @SerialName("camera") CAMERA,
    @SerialName("thermostat") THERMOSTAT,
    @SerialName("fan") FAN,
    @SerialName("lock") LOCK,
    @SerialName("other") OTHER,
}

@Serializable
enum class IntegrationType {
    @SerialName("tapo") TAPO,
    @SerialName("xiaomi") XIAOMI,
    @SerialName("tuya") TUYA,
    @SerialName("mqtt") MQTT,
    @SerialName("matter") MATTER,
    @SerialName("zigbee") ZIGBEE,
    @SerialName("philips_hue") PHILIPS_HUE,
    @SerialName("wiz") WIZ,
    @SerialName("lifx") LIFX,
    @SerialName("govee") GOVEE,
    @SerialName("wipro") WIPRO,
    @SerialName("syska") SYSKA,
}

@Serializable
enum class NotificationType {
    @SerialName("device_offline") DEVICE_OFFLINE,
    @SerialName("automation_failed") AUTOMATION_FAILED,
    @SerialName("new_device_found") NEW_DEVICE_FOUND,
    @SerialName("security_alert") SECURITY_ALERT,
    @SerialName("info") INFO,
}

@Serializable
enum class TriggerType {
    @SerialName("device_state") DEVICE_STATE,
    @SerialName("device_offline") DEVICE_OFFLINE,
    @SerialName("new_device") NEW_DEVICE,
    @SerialName("time") TIME,
    @SerialName("manual") MANUAL,
}

@Serializable
enum class ConditionOp {
    @SerialName("eq") EQ,
    @SerialName("ne") NE,
    @SerialName("gt") GT,
    @SerialName("lt") LT,
    @SerialName("gte") GTE,
    @SerialName("lte") LTE,
    @SerialName("in") IN,
}

@Serializable
enum class ActionType {
    @SerialName("device.turn_on") TURN_ON,
    @SerialName("device.turn_off") TURN_OFF,
    @SerialName("device.toggle") TOGGLE,
    @SerialName("notification.send") NOTIFY,
}
