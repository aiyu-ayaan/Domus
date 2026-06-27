package com.atech.core.model

import kotlinx.serialization.Serializable

/** Auth + user models. Mirrors `backend/auth/schemas.py` and `backend/users/schemas.py`. */

@Serializable
data class User(
    val id: String,
    val email: String,
    val full_name: String? = null,
    val avatar_url: String? = null,
    val role: Role,
    val is_active: Boolean,
    val is_verified: Boolean,
    val created_at: String,
)

@Serializable
data class TokenPair(
    val access_token: String,
    val refresh_token: String,
    val token_type: String = "bearer",
)

@Serializable
data class RegisterResponse(
    val user: User,
    val tokens: TokenPair,
)

// --- request bodies ---

@Serializable
data class RegisterRequest(
    val email: String,
    val password: String,
    val full_name: String? = null,
)

@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
)

@Serializable
data class RefreshRequest(
    val refresh_token: String,
)

@Serializable
data class ChangePasswordRequest(
    val current_password: String,
    val new_password: String,
)

@Serializable
data class UserUpdate(
    val full_name: String? = null,
    val avatar_url: String? = null,
)
