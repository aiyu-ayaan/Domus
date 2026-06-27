package com.atech.core.data

import com.atech.core.common.DomusResult
import com.atech.core.model.User
import com.atech.core.model.UserUpdate
import com.atech.core.network.DomusHttp
import com.atech.core.network.safeApiCall
import io.ktor.client.request.get
import io.ktor.client.request.patch
import io.ktor.client.request.setBody

/** Current-user profile. Mirrors `backend/users/router.py`. */
class UserRepository(private val http: DomusHttp) {
    private val base get() = "${http.config.apiBase}/users"

    suspend fun me(): DomusResult<User> =
        safeApiCall { http.client.get("$base/me") }

    suspend fun update(update: UserUpdate): DomusResult<User> =
        safeApiCall { http.client.patch("$base/me") { setBody(update) } }
}
