package com.aiyu.domus.core

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Mirrors the server DTOs (apps/web/src/lib/types.ts). Unknown fields are ignored, so the server can grow.

@Serializable
data class User(val id: String, val username: String, val email: String = "", val role: String = "guest") {
    val isAdmin get() = role == "admin"
    val canControl get() = role != "guest"
}

@Serializable
data class AuthResponse(val token: String, val user: User)

@Serializable
data class SetupStatus(@SerialName("needs_admin_setup") val needsAdminSetup: Boolean)

@Serializable
data class DeviceState(
    @SerialName("is_on") val isOn: Boolean? = null,
    /** 0-100 % */
    val brightness: Int? = null,
    /** 0-100 % (warm -> cold) */
    @SerialName("color_temp") val colorTemp: Int? = null,
    /** #RRGGBB */
    val color: String? = null,
    @SerialName("color_mode") val colorMode: String? = null,
    val temperature: Float? = null,
    val humidity: Float? = null,
    @SerialName("air_quality_pm25") val pm25: Float? = null,
    @SerialName("fan_speed") val fanSpeed: String? = null,
    val mode: String? = null,
    @SerialName("filter_life") val filterLife: Float? = null,
    @SerialName("current_power_watts") val watts: Float? = null,
    val voltage: Float? = null,
    @SerialName("current_amps") val amps: Float? = null,
    @SerialName("today_energy_kwh") val todayKwh: Float? = null,
    /** Choices the UI can offer, keyed by `fan_speed` / `mode`. */
    val options: Map<String, List<String>> = emptyMap(),
)

/** Only the set fields are sent and applied. */
@Serializable
data class DeviceCommand(
    @SerialName("is_on") val isOn: Boolean? = null,
    val brightness: Int? = null,
    @SerialName("color_temp") val colorTemp: Int? = null,
    val color: String? = null,
    @SerialName("color_mode") val colorMode: String? = null,
    @SerialName("fan_speed") val fanSpeed: String? = null,
    val mode: String? = null,
)

@Serializable
data class Device(
    val id: String,
    val name: String,
    @SerialName("room_id") val roomId: String? = null,
    @SerialName("integration_type") val integration: String = "",
    @SerialName("device_type") val type: String = "other",
    val model: String? = null,
    @SerialName("is_online") val isOnline: Boolean = false,
    val state: DeviceState = DeviceState(),
) {
    /** What the server will report once [cmd] lands; shown at once so controls feel instant. */
    fun applying(cmd: DeviceCommand) = copy(
        state = state.copy(
            isOn = cmd.isOn ?: state.isOn,
            brightness = cmd.brightness ?: state.brightness,
            colorTemp = cmd.colorTemp ?: state.colorTemp,
            color = cmd.color ?: state.color,
            colorMode = cmd.colorMode ?: state.colorMode,
            fanSpeed = cmd.fanSpeed ?: state.fanSpeed,
            mode = cmd.mode ?: state.mode,
        ),
    )
}

@Serializable
data class Room(val id: String, val name: String, val floor: Int = 0)

@Serializable
data class Scene(
    val id: String,
    val name: String,
    @SerialName("is_active") val isActive: Boolean = false,
    /** `standard` or `screen_sync` (needs a desktop to capture the screen). */
    val kind: String = "standard",
)

@Serializable
data class Automation(
    val id: String,
    val name: String,
    val description: String? = null,
    @SerialName("is_enabled") val isEnabled: Boolean = true,
    @SerialName("last_triggered_at") val lastTriggeredAt: String? = null,
)

@Serializable
data class EnergySettings(val currency: String = "USD", @SerialName("monthly_budget") val monthlyBudget: Double? = null)

@Serializable
data class DeviceEnergy(
    @SerialName("device_id") val deviceId: String,
    val name: String,
    @SerialName("current_watts") val watts: Double = 0.0,
    val kwh: Double = 0.0,
    val cost: Double = 0.0,
)

@Serializable
data class EnergyOverview(
    @SerialName("current_watts") val watts: Double = 0.0,
    @SerialName("today_kwh") val todayKwh: Double = 0.0,
    @SerialName("today_cost") val todayCost: Double = 0.0,
    @SerialName("cycle_days") val cycleDays: Int = 30,
    @SerialName("cycle_day") val cycleDay: Int = 1,
    @SerialName("cycle_kwh") val cycleKwh: Double = 0.0,
    @SerialName("cycle_cost") val cycleCost: Double = 0.0,
    @SerialName("projected_cost") val projectedCost: Double = 0.0,
    @SerialName("budget_used_percent") val budgetUsedPercent: Double? = null,
    val settings: EnergySettings = EnergySettings(),
    val devices: List<DeviceEnergy> = emptyList(),
)

@Serializable
data class EnergyPoint(val t: String, val kwh: Double = 0.0, val cost: Double = 0.0)

@Serializable
data class ActionResult(val success: Boolean = true, val errors: List<String> = emptyList())
