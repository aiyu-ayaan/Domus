package com.atech.core.network

import com.atech.core.DomusConfig
import com.atech.core.auth.TokenStore
import com.atech.core.model.RefreshRequest
import com.atech.core.model.TokenPair
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.auth.Auth
import io.ktor.client.plugins.auth.authProviders
import io.ktor.client.plugins.auth.providers.BearerAuthProvider
import io.ktor.client.plugins.auth.providers.BearerTokens
import io.ktor.client.plugins.auth.providers.bearer
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

/**
 * Owns the configured Ktor [HttpClient]. The bearer plugin reads tokens from
 * [TokenStore], attaches them to every request, and transparently refreshes them
 * via `/auth/refresh` on a 401.
 */
class DomusHttp(
    initialConfig: DomusConfig,
    private val tokenStore: TokenStore,
) {
    /**
     * Current server target. Swappable at runtime so the UI can point the app at a
     * different backend without rebuilding the client — every request uses an
     * absolute URL derived from this, and the refresh lambda reads it live.
     */
    @Volatile
    var config: DomusConfig = initialConfig
        private set

    /** Repoint at a new server. Caller should clear the auth session afterwards. */
    fun updateConfig(newConfig: DomusConfig) {
        config = newConfig
    }

    val json: Json = Json {
        ignoreUnknownKeys = true   // forward-compatible: server can add fields
        encodeDefaults = true
        explicitNulls = false
    }

    val client: HttpClient = HttpClient(OkHttp) {
        expectSuccess = true       // non-2xx throws -> mapped in safeApiCall

        install(ContentNegotiation) { json(this@DomusHttp.json) }
        install(WebSockets)
        install(HttpTimeout) {
            requestTimeoutMillis = 30_000
            connectTimeoutMillis = 15_000
            socketTimeoutMillis = 30_000
        }

        if (config.enableLogging) {
            install(Logging) { level = LogLevel.INFO }
        }

        defaultRequest {
            contentType(ContentType.Application.Json)
        }

        install(Auth) {
            bearer {
                sendWithoutRequest { true }
                loadTokens {
                    tokenStore.current()?.let { BearerTokens(it.access_token, it.refresh_token) }
                }
                refreshTokens {
                    val stored = tokenStore.current() ?: return@refreshTokens null
                    val resp: HttpResponse = client.post("${config.apiBase}/auth/refresh") {
                        contentType(ContentType.Application.Json)
                        setBody(RefreshRequest(stored.refresh_token))
                    }
                    if (resp.status.isSuccess()) {
                        val pair: TokenPair = resp.body()
                        tokenStore.save(pair)
                        BearerTokens(pair.access_token, pair.refresh_token)
                    } else {
                        tokenStore.clear()
                        null
                    }
                }
            }
        }
    }

    /**
     * Drop the bearer plugin's in-memory token cache so the next request reloads
     * from [TokenStore]. Call after a fresh login or a logout.
     */
    fun resetAuthCache() {
        client.authProviders
            .filterIsInstance<BearerAuthProvider>()
            .forEach { it.clearToken() }
    }

    fun close() = client.close()
}
