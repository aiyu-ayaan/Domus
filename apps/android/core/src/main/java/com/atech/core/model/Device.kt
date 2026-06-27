package com.atech.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/** Mirrors `backend/devices/schemas.py`. Free-form `meta`/`attributes` stay as JsonObject. */

@Serializable
data class Device(
    val id: String,
    val home_id: String,
    val integration_id: String,
    val room_id: String? = null,
    val external_id: String,
    val name: String,
    val manufacturer: String? = null,
    val model: String? = null,
    val serial_number: String? = null,
    val device_type: DeviceType,
    val online: Boolean,
    val last_seen: String? = null,
    val meta: JsonObject = JsonObject(emptyMap()),
    val created_at: String,
)

@Serializable
data class DeviceCreate(
    val home_id: String,
    val integration_id: String,
    val external_id: String,
    val name: String,
    val device_type: DeviceType = DeviceType.OTHER,
    val room_id: String? = null,
    val manufacturer: String? = null,
    val model: String? = null,
    val serial_number: String? = null,
    val meta: JsonObject = JsonObject(emptyMap()),
)

@Serializable
data class DeviceUpdate(
    val name: String? = null,
    val room_id: String? = null,
    val device_type: DeviceType? = null,
    val meta: JsonObject? = null,
)

@Serializable
data class DeviceState(
    val id: String,
    val device_id: String,
    val state: String,
    val attributes: JsonObject = JsonObject(emptyMap()),
    val created_at: String,
)
