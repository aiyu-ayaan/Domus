package com.atech.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/** Energy, notifications, integrations, pagination and the realtime envelope. */

// --- energy (backend/energy/schemas.py) ---

@Serializable
data class EnergyDevice(
    val device_id: String,
    val name: String,
    val model: String? = null,
    val power_w: Double,
    val energy_kwh: Double,
)

@Serializable
data class EnergyPoint(
    val t: String,
    val kwh: Double,
)

@Serializable
data class EnergySummary(
    val range_hours: Double,
    val total_power_w: Double,
    val total_kwh: Double,
    val devices: List<EnergyDevice> = emptyList(),
    val series: List<EnergyPoint> = emptyList(),
)

// --- notifications (backend/notifications/schemas.py) ---

@Serializable
data class Notification(
    val id: String,
    val home_id: String,
    val type: NotificationType,
    val title: String,
    val body: String,
    val read: Boolean,
    val meta: JsonObject = JsonObject(emptyMap()),
    val created_at: String,
)

// --- integrations (backend/integrations/schemas.py) ---

@Serializable
data class Integration(
    val id: String,
    val home_id: String,
    val name: String,
    val type: IntegrationType,
    val enabled: Boolean,
    val last_sync_at: String? = null,
    val created_at: String,
)

@Serializable
data class IntegrationCreate(
    val home_id: String,
    val name: String,
    val type: IntegrationType,
    val enabled: Boolean = true,
    val config: JsonObject = JsonObject(emptyMap()),
)

@Serializable
data class IntegrationUpdate(
    val name: String? = null,
    val enabled: Boolean? = null,
    val config: JsonObject? = null,
)

@Serializable
data class DiscoveredDevice(
    val external_id: String,
    val name: String,
    val device_type: String,
    val manufacturer: String,
    val model: String,
    val serial_number: String? = null,
    val attributes: JsonObject = JsonObject(emptyMap()),
    val already_registered: Boolean,
)

@Serializable
data class DiscoveryResult(
    val integration_id: String,
    val discovered: List<DiscoveredDevice> = emptyList(),
    val new_count: Int,
    val existing_count: Int,
)

// --- pagination (backend/core/pagination.py) ---

@Serializable
data class Page<T>(
    val items: List<T> = emptyList(),
    val total: Int,
    val limit: Int,
    val offset: Int,
)

// --- realtime envelope (backend/core/events.py Event.as_dict) ---

@Serializable
data class DomusEvent(
    val type: String,
    val data: JsonObject = JsonObject(emptyMap()),
    val home_id: String? = null,
    val ts: JsonElement? = null,
)
