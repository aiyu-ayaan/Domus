package com.atech.core.data

import com.atech.core.auth.TokenStore
import com.atech.core.common.DomusResult
import com.atech.core.common.onSuccess
import com.atech.core.model.ChangePasswordRequest
import com.atech.core.model.LoginRequest
import com.atech.core.model.RefreshRequest
import com.atech.core.model.RegisterRequest
import com.atech.core.model.RegisterResponse
import com.atech.core.model.TokenPair
import com.atech.core.network.DomusHttp
import com.atech.core.network.safeApiCall
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import kotlinx.coroutines.flow.Flow

/** Auth flows. Owns token persistence so the rest of the app just observes [isLoggedIn]. */
class AuthRepository(
    private val http: DomusHttp,
    private val tokenStore: TokenStore,
) {
    private val base get() = "${http.config.apiBase}/auth"

    val isLoggedIn: Flow<Boolean> = tokenStore.isLoggedIn

    suspend fun register(email: String, password: String, fullName: String? = null): DomusResult<RegisterResponse> =
        safeApiCall<RegisterResponse> {
            http.client.post("$base/register") { setBody(RegisterRequest(email, password, fullName)) }
        }.onSuccess { persist(it.tokens) }

    suspend fun login(email: String, password: String): DomusResult<TokenPair> =
        safeApiCall<TokenPair> {
            http.client.post("$base/login") { setBody(LoginRequest(email, password)) }
        }.onSuccess { persist(it) }

    /** Revokes the refresh token server-side, then clears the local session. */
    suspend fun logout(): DomusResult<Unit> {
        val refresh = tokenStore.current()?.refresh_token
        val result = if (refresh != null) {
            safeApiCall<Unit> { http.client.post("$base/logout") { setBody(RefreshRequest(refresh)) } }
        } else {
            DomusResult.Success(Unit)
        }
        tokenStore.clear()
        http.resetAuthCache()
        return result
    }

    suspend fun changePassword(current: String, new: String): DomusResult<Unit> =
        safeApiCall {
            http.client.post("$base/change-password") {
                setBody(ChangePasswordRequest(current, new))
            }
        }

    private suspend fun persist(tokens: TokenPair) {
        tokenStore.save(tokens)
        http.resetAuthCache()
    }
}
