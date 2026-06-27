package com.atech.core.model

import kotlinx.serialization.Serializable

/** Mirrors `backend/homes/schemas.py` and `backend/rooms/schemas.py`. */

@Serializable
data class TariffTier(
    val up_to: Double? = null, // slab ceiling in kWh; null = unbounded top slab
    val rate: Double = 0.0,
)

/** Per-home money settings, synced across web + Android via the home API. */
@Serializable
data class BillingSettings(
    val type: String = "flat", // "flat" | "tiered"
    val currency: String = "₹",
    val rate: Double = 8.0, // flat price per kWh
    val fixed_charge: Double = 0.0,
    val tiers: List<TariffTier> = emptyList(),
    val billing_cycle_start_day: Int = 1,
)

@Serializable
data class Home(
    val id: String,
    val name: String,
    val description: String? = null,
    val timezone: String,
    val owner_id: String,
    val created_at: String,
    val billing_settings: BillingSettings? = null,
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
    val billing_settings: BillingSettings? = null,
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
