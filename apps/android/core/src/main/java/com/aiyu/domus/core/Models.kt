package com.aiyu.domus.core

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

// Mirrors the server DTOs (apps/web/src/lib/types.ts). Unknown fields are ignored, so the server can grow.

@Serializable
data class User(
    val id: String,
    val username: String,
    val email: String = "",
    val role: String = "guest",
    val avatar: String? = null,
    @SerialName("all_rooms") val allRooms: Boolean = true,
    @SerialName("room_ids") val roomIds: List<String> = emptyList(),
) {
    val isAdmin get() = role == "admin"
    val canControl get() = role != "guest"
}

@Serializable
data class AuthResponse(val token: String, val user: User)

/** Where the server is reached at home and from outside; [fingerprint] is its own certificate (null with TLS off). */
@Serializable
data class ServerLinks(
    @SerialName("local_url") val localUrl: String = "",
    @SerialName("remote_url") val remoteUrl: String = "",
    val fingerprint: String? = null,
)

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
    /** Id of the light effect the device is playing, if any. */
    val effect: String? = null,
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
    /** A mood or effect id from the server's catalog; an empty string stops a running effect. */
    val effect: String? = null,
)

/** A mood (still white preset) or an effect (color loop the bulb plays by itself). */
@Serializable
data class LightPreset(
    val id: String,
    val name: String,
    /** Preview colors as #rrggbb: one for a mood, the loop for an effect. */
    val colors: List<String> = emptyList(),
    val brightness: Int? = null,
    @SerialName("color_temp") val colorTemp: Int? = null,
)

/** Moods suit every light; a light can play the effects listed in its `options["effect"]`. */
@Serializable
data class EffectCatalog(val moods: List<LightPreset> = emptyList(), val effects: List<LightPreset> = emptyList())

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
            // A plain color or white command ends an effect; an effect command starts ("" stops) one.
            effect = when {
                cmd.effect != null -> cmd.effect.ifEmpty { null }
                cmd.color != null || cmd.colorTemp != null || cmd.colorMode != null -> null
                else -> state.effect
            },
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
    /** `standard` or `screen_sync` (mirrors a shared screen's color onto lights). */
    val kind: String = "standard",
    /** Raw action objects (see `Action` in the web types); kept as JSON so kinds this app can't edit survive a save. */
    val actions: List<JsonObject> = emptyList(),
    /** Screen Sync settings, `{}` otherwise. */
    val config: JsonObject = JsonObject(emptyMap()),
)

@Serializable
data class Automation(
    val id: String,
    val name: String,
    val description: String? = null,
    @SerialName("is_enabled") val isEnabled: Boolean = true,
    @SerialName("last_triggered_at") val lastTriggeredAt: String? = null,
    val triggers: List<JsonObject> = emptyList(),
    val conditions: List<JsonObject> = emptyList(),
    val actions: List<JsonObject> = emptyList(),
)

/** A usage slab of the billing cycle; [upToKwh] null = everything above. */
@Serializable
data class Slab(@SerialName("up_to_kwh") val upToKwh: Double? = null, val rate: Double = 0.0)

@Serializable
data class EnergySettings(
    @SerialName("rate_per_kwh") val ratePerKwh: Double = 0.15,
    val currency: String = "USD",
    @SerialName("monthly_budget") val monthlyBudget: Double? = null,
    @SerialName("billing_cycle_day") val billingCycleDay: Int = 1,
    @SerialName("fixed_monthly_charge") val fixedMonthlyCharge: Double = 0.0,
    /** Empty = flat [ratePerKwh]. */
    val slabs: List<Slab> = emptyList(),
)

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
data class EnergyPoint(val t: String, val kwh: Double = 0.0, val cost: Double = 0.0, /** Average measured power; null where nothing was measured. */ val watts: Double? = null)

/** Averages of one hour / day; null where nothing was measured. */
@Serializable
data class AirPoint(val t: String, val pm25: Double? = null, val temperature: Double? = null, val humidity: Double? = null)

@Serializable
data class ActionResult(val success: Boolean = true, val errors: List<String> = emptyList())

/** A device an integration found that is not added to the home yet. */
@Serializable
data class Discovered(
    val id: String,
    val name: String,
    @SerialName("integration_type") val integration: String = "",
    @SerialName("device_type") val type: String = "other",
    val model: String? = null,
    @SerialName("ip_address") val ip: String? = null,
    val note: String? = null,
)

@Serializable
data class DiscoveryReport(val found: Int = 0, val new: Int = 0, val adopted: Int = 0)

@Serializable
data class Account(val id: String, val name: String = "", val status: String = "ok", @SerialName("last_error") val lastError: String? = null)

@Serializable
data class Integration(
    val id: String,
    val name: String,
    val description: String = "",
    /** How an account is linked: `qr`, `credentials` or `none`. */
    val link: String = "none",
    val local: Boolean = false,
    val enabled: Boolean = true,
    val accounts: List<Account> = emptyList(),
    @SerialName("device_count") val deviceCount: Int = 0,
)

@Serializable
data class TuyaQr(@SerialName("qr_token") val token: String, @SerialName("qr_content") val content: String)

/** [status] is `waiting`, `linked` or `expired`. */
@Serializable
data class TuyaQrStatus(val status: String = "waiting", val name: String? = null)

/** Xiaomi either links at once ([accountId]) or asks for a code sent by [via] (`email` / `phone`). */
@Serializable
data class XiaomiLink(@SerialName("account_id") val accountId: String? = null, @SerialName("verify_id") val verifyId: String? = null, val via: String? = null)

@Serializable
data class Notice(
    val id: String,
    val level: String = "info",
    val title: String = "",
    val message: String = "",
    @SerialName("is_read") val isRead: Boolean = false,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class NoticeList(val items: List<Notice> = emptyList(), val unread: Int = 0)
