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
    /** Rooms granted as a whole, and devices granted one by one. */
    @SerialName("room_ids") val roomIds: List<String> = emptyList(),
    @SerialName("device_ids") val deviceIds: List<String> = emptyList(),
    /** The granted rooms and devices the user may see but not control. */
    @SerialName("view_only_room_ids") val viewOnlyRoomIds: List<String> = emptyList(),
    @SerialName("view_only_device_ids") val viewOnlyDeviceIds: List<String> = emptyList(),
    /** The granted rooms and devices the user may also rename (edit includes control). */
    @SerialName("edit_room_ids") val editRoomIds: List<String> = emptyList(),
    @SerialName("edit_device_ids") val editDeviceIds: List<String> = emptyList(),
    /** An administrator sets a kid's password; everyone else gets a generated one. */
    val kid: Boolean = false,
    /** Still on a generated password: nothing else works until it is changed. */
    @SerialName("must_change_password") val mustChangePassword: Boolean = false,
    /** Asked for a password reset on the sign-in screen; no administrator has answered yet. */
    @SerialName("reset_requested") val resetRequested: Boolean = false,
    /** A one-time reset code is waiting to be used, until [resetAllowedUntil]. */
    @SerialName("reset_allowed") val resetAllowed: Boolean = false,
    @SerialName("reset_allowed_until") val resetAllowedUntil: String? = null,
    /** Only in the answer to the administrator who created the account or reset its password. */
    @SerialName("generated_password") val generatedPassword: String? = null,
    /** Only in the answer to the administrator who issued the code. */
    @SerialName("reset_code") val resetCode: String? = null,
) {
    val isAdmin get() = role == "admin"
    val canControl get() = role != "guest"
    val grants get() = Grants(
        roomIds.associateWith { levelOf(it, viewOnlyRoomIds, editRoomIds) },
        deviceIds.associateWith { levelOf(it, viewOnlyDeviceIds, editDeviceIds) },
    )

    /** When the reset code stops working, as a clock time on this device. */
    fun resetUntil(hour24: Boolean): String? = runCatching {
        java.time.format.DateTimeFormatter.ofPattern(if (hour24) "HH:mm" else "h:mm a")
            .withZone(java.time.ZoneId.systemDefault())
            .format(java.time.Instant.parse(resetAllowedUntil))
    }.getOrNull()

    /** What an administrator passes on to this person: the one-time reset code, or their first password. */
    fun handoverText(server: String, hour24: Boolean): String = resetCode?.let { code ->
        "Domus password reset for $username\nCode: ${code.chunked(4).joinToString(" ")}\n\n" +
            "On the sign-in screen choose \"Forgot password?\", enter your username and then this code. " +
            "It works once${resetUntil(hour24)?.let { ", until $it" }.orEmpty()}."
    } ?: ("Domus sign-in\nAddress: $server\nUsername: $username\nPassword: $generatedPassword" +
        if (kid) "" else "\n\nYou will be asked to choose your own password the first time you sign in.")

    private fun levelOf(id: String, viewOnly: List<String>, edit: List<String>) = when (id) { in viewOnly -> "view"; in edit -> "edit"; else -> "control" }
}

/**
 * What a member or guest may reach: id to "view" (see only), "control" or "edit" (control plus renaming);
 * a missing id has no access.
 * A device's own level wins over its room's.
 */
data class Grants(val rooms: Map<String, String> = emptyMap(), val devices: Map<String, String> = emptyMap()) {
    fun levelOf(device: Device) = devices[device.id] ?: device.roomId?.let { rooms[it] } ?: "none"

    /** Setting the whole room starts it clean: single-device levels in it are dropped. */
    fun withRoom(roomId: String, level: String, all: List<Device>) = Grants(
        if (level == "none") rooms - roomId else rooms + (roomId to level),
        devices - all.filter { it.roomId == roomId }.map { it.id }.toSet(),
    )

    fun withDevice(device: Device, level: String, all: List<Device>): Grants {
        val room = device.roomId?.let { rooms[it] }
        val rest = devices - device.id
        // Taking one device out of a whole room keeps the others, each at the room's level.
        if (level == "none" && room != null) {
            val kept = all.filter { it.roomId == device.roomId && it.id != device.id && it.id !in rest }.associate { it.id to room }
            return Grants(rooms - device.roomId!!, rest + kept)
        }
        // The same level as the room needs no entry of its own.
        return copy(devices = if (level == "none" || level == room) rest else rest + (device.id to level))
    }
}

@Serializable
data class AuthResponse(val token: String, val user: User)

@Serializable
data class EmailCheck(val available: Boolean)

@Serializable
data class EmailSuggestion(val email: String)

/** Where the server is reached at home and from outside; [fingerprint] is its own certificate (null with TLS off). */
@Serializable
data class ServerLinks(
    @SerialName("local_url") val localUrl: String = "",
    @SerialName("remote_url") val remoteUrl: String = "",
    val fingerprint: String? = null,
)

/** Where the home is, with today's sunrise and sunset there (ISO instants). All null until an administrator sets it. */
@Serializable
data class HomeLocation(val latitude: Double? = null, val longitude: Double? = null, val sunrise: String? = null, val sunset: String? = null)

/** A place the server's search found. */
@Serializable
data class Place(val name: String = "", val latitude: Double = 0.0, val longitude: Double = 0.0)

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
    /** 0-100 %, for fans with a stepless speed. */
    @SerialName("fan_percent") val fanPercent: Int? = null,
    /** Clean air delivery rate at the lowest and full speed, m³/h. */
    @SerialName("fan_cadr") val fanCadr: List<Int>? = null,
    val mode: String? = null,
    @SerialName("filter_life") val filterLife: Float? = null,
    @SerialName("current_power_watts") val watts: Float? = null,
    val voltage: Float? = null,
    @SerialName("current_amps") val amps: Float? = null,
    @SerialName("today_energy_kwh") val todayKwh: Float? = null,
    /** What a motion, door or leak sensor last saw. */
    val motion: Boolean? = null,
    /** True while a door or window is open. */
    val contact: Boolean? = null,
    @SerialName("water_leak") val waterLeak: Boolean? = null,
    val alarm: Boolean? = null,
    /** Percent left, from sensors that report it; the others only say when it is low. */
    val battery: Float? = null,
    @SerialName("battery_low") val batteryLow: Boolean? = null,
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
    @SerialName("fan_percent") val fanPercent: Int? = null,
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
/** The Matter bridge as an administrator sees it; [qr] holds the QR modules row by row ('1' = dark). */
@Serializable
data class MatterBridge(
    val enabled: Boolean = false,
    val running: Boolean = false,
    val paired: Boolean = false,
    val error: String? = null,
    val devices: List<String> = emptyList(),
    @SerialName("pairing_code") val pairingCode: String = "",
    @SerialName("qr_payload") val qrPayload: String = "",
    val qr: List<String> = emptyList(),
)

/** Outdoor weather and air at the home's location (Open-Meteo). */
@Serializable
data class Weather(
    val temperature: Double? = null,
    val humidity: Double? = null,
    /** WMO weather code. */
    @SerialName("weather_code") val weatherCode: Int? = null,
    @SerialName("is_day") val isDay: Boolean? = null,
    val pm25: Double? = null,
    @SerialName("us_aqi") val usAqi: Double? = null,
    @SerialName("fetched_at") val fetchedAt: String = "",
)

/** Who changed a device: `user` (with the app it came from), `automation` or `screen_sync`. None means on the device itself. */
@Serializable
data class LogActor(val kind: String, val id: String? = null, val name: String? = null, val client: String? = null)

/** One line of a device's logbook. */
@Serializable
data class LogEntry(
    val at: String,
    val field: String,
    val value: kotlinx.serialization.json.JsonElement? = null,
    val previous: kotlinx.serialization.json.JsonElement? = null,
    val actor: LogActor? = null,
)

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
    /** Whether the signed-in user may operate it (false for guests and see-only access). */
    @SerialName("can_control") val canControl: Boolean = true,
    /** Whether the signed-in user may rename it (administrators, and edit access). */
    @SerialName("can_edit") val canEdit: Boolean = false,
    /** Ask before switching it on or off. Kept on the server, so it is the same on every app. */
    @SerialName("confirm_changes") val confirmChanges: Boolean = false,
    /** Administrators are notified when it stays on longer than this; null = never. */
    @SerialName("left_on_alert_minutes") val leftOnAlertMinutes: Int? = null,
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
            fanPercent = cmd.fanPercent ?: state.fanPercent,
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

/** One trace of an automation: [trigger] is {"index": n} or {"manual": actor}; [outcome] running, done, failed or blocked. */
@Serializable
data class AutomationRun(
    @SerialName("started_at") val startedAt: String,
    val trigger: JsonObject = JsonObject(emptyMap()),
    val conditions: List<RunCondition> = emptyList(),
    val outcome: String = "done",
    val errors: List<String> = emptyList(),
)

@Serializable
data class RunCondition(val index: Int, val passed: Boolean)

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
    /** Windows of the day whose units cost more or less than the rate above. */
    @SerialName("time_of_use") val timeOfUse: List<TimeOfUse> = emptyList(),
    /** Devices that measure solar generation: counted as production, not consumption. */
    @SerialName("solar_device_ids") val solarDeviceIds: List<String> = emptyList(),
    /** "net" (exported units offset imported ones) or "feed_in" (paid at [exportRate]). */
    @SerialName("export_mode") val exportMode: String = "net",
    @SerialName("export_rate") val exportRate: Double = 0.0,
)

/** Energy through the grid connection, worked out per quarter hour from metered use and generation. */
@Serializable
data class Flows(
    @SerialName("generated_kwh") val generatedKwh: Double = 0.0,
    @SerialName("self_used_kwh") val selfUsedKwh: Double = 0.0,
    @SerialName("imported_kwh") val importedKwh: Double = 0.0,
    @SerialName("exported_kwh") val exportedKwh: Double = 0.0,
)

@Serializable
data class SolarSummary(
    @SerialName("current_watts") val watts: Double = 0.0,
    val today: Flows = Flows(),
    val cycle: Flows = Flows(),
    @SerialName("cycle_credit") val cycleCredit: Double = 0.0,
)

/** [start] and [end] are "HH:mm" on the home's clock; [adjust] is added to each kWh's price (negative = cheaper). */
@Serializable
data class TimeOfUse(val start: String = "", val end: String = "", val adjust: Double = 0.0)

@Serializable
data class DeviceEnergy(
    @SerialName("device_id") val deviceId: String,
    val name: String,
    @SerialName("current_watts") val watts: Double = 0.0,
    val kwh: Double = 0.0,
    val cost: Double = 0.0,
    /** The least it drew in any hour of the last week; null until a day has been measured. */
    @SerialName("standby_watts") val standbyWatts: Double? = null,
    @SerialName("standby_monthly_cost") val standbyMonthlyCost: Double? = null,
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
    /** Present when solar devices are set. */
    val solar: SolarSummary? = null,
)

@Serializable
data class EnergyPoint(
    val t: String,
    val kwh: Double = 0.0,
    val cost: Double = 0.0,
    /** Average measured power; null where nothing was measured. */
    val watts: Double? = null,
    /** The highest power read in the bucket. Live samples and older servers have none. */
    @SerialName("peak_watts") val peakWatts: Double? = null,
)

/** Averages of one bucket; null where nothing was measured. */
@Serializable
data class AirPoint(
    val t: String,
    val pm25: Double? = null,
    val temperature: Double? = null,
    val humidity: Double? = null,
    /** The highest PM2.5 read in the bucket. Live samples and older servers have none. */
    @SerialName("pm25_max") val pm25Max: Double? = null,
    /** Samples at each [AirLevel], in its order; empty for live samples and older servers. */
    val levels: List<Int> = emptyList(),
)

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

/** One input of a `form` link; [kind] is `text`, `password` or `number`. */
@Serializable
data class FormField(val key: String, val label: String, val kind: String = "text", val required: Boolean = false, val hint: String = "", val default: String = "")

@Serializable
data class Integration(
    val id: String,
    val name: String,
    val description: String = "",
    /** How an account is linked: `qr`, `credentials`, `form` or `none`. */
    val link: String = "none",
    val fields: List<FormField> = emptyList(),
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
    val code: String? = null,
    val params: Map<String, String> = emptyMap(),
    @SerialName("is_read") val isRead: Boolean = false,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class NoticeList(val items: List<Notice> = emptyList(), val unread: Int = 0)
