package com.atech.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/** Mirrors `backend/scenes/schemas.py`. */

@Serializable
data class SceneDeviceState(
    val device_id: String,
    val state: String,
    val attributes: JsonObject = JsonObject(emptyMap()),
)

@Serializable
data class Scene(
    val id: String,
    val home_id: String,
    val name: String,
    val description: String? = null,
    val states: List<SceneDeviceState> = emptyList(),
    val created_at: String,
)

@Serializable
data class SceneCreate(
    val home_id: String,
    val name: String,
    val description: String? = null,
    val states: List<SceneDeviceState> = emptyList(),
)

@Serializable
data class SceneUpdate(
    val name: String? = null,
    val description: String? = null,
    val states: List<SceneDeviceState>? = null,
)

@Serializable
data class SceneActivateResult(
    val scene_id: String,
    val applied: Int,
    val failed: Int,
)
