package com.atech.core.model

import kotlinx.serialization.Serializable

/** Mirrors `backend/homes/schemas.py` and `backend/rooms/schemas.py`. */

@Serializable
data class Home(
    val id: String,
    val name: String,
    val description: String? = null,
    val timezone: String,
    val owner_id: String,
    val created_at: String,
)

@Serializable
data class HomeCreate(
    val name: String,
    val description: String? = null,
    val timezone: String = "UTC",
)

@Serializable
data class HomeUpdate(
    val name: String? = null,
    val description: String? = null,
    val timezone: String? = null,
)

@Serializable
data class Room(
    val id: String,
    val home_id: String,
    val name: String,
    val icon: String? = null,
    val created_at: String,
)

@Serializable
data class RoomCreate(
    val home_id: String,
    val name: String,
    val icon: String? = null,
)

@Serializable
data class RoomUpdate(
    val name: String? = null,
    val icon: String? = null,
)
