package com.atech.core

import android.content.Context
import com.atech.core.auth.ServerStore
import com.atech.core.auth.TokenStore
import com.atech.core.data.AuthRepository
import com.atech.core.data.AutomationRepository
import com.atech.core.data.DeviceRepository
import com.atech.core.data.EnergyRepository
import com.atech.core.data.HomeRepository
import com.atech.core.data.IntegrationRepository
import com.atech.core.data.NotificationRepository
import com.atech.core.data.RoomRepository
import com.atech.core.data.SceneRepository
import com.atech.core.data.UserRepository
import com.atech.core.common.DomusResult
import com.atech.core.network.DomusHttp
import com.atech.core.network.safeApiCall
import com.atech.core.realtime.DomusRealtime
import io.ktor.client.request.get
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * Single entry point to the Domus backend. Build it once (e.g. in [android.app.Application])
 * and inject the repositories you need — manual DI, no framework required.
 *
 * The backend URL is **not hardcoded**: it is persisted via [ServerStore] and the app's
 * settings UI changes it at runtime through [setBaseUrl]. Observe [serverUrl] /
 * [isConfigured] to gate the UI until a server is set, and [isLoggedIn] for the session.
 */
class DomusCore private constructor(
    private val http: DomusHttp,
    private val serverStore: ServerStore,
    private val tokenStore: TokenStore,
    val enableLogging: Boolean,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    val auth: AuthRepository = AuthRepository(http, tokenStore)
    val users: UserRepository = UserRepository(http)
    val homes: HomeRepository = HomeRepository(http)
    val rooms: RoomRepository = RoomRepository(http)
    val devices: DeviceRepository = DeviceRepository(http)
    val scenes: SceneRepository = SceneRepository(http)
    val automations: AutomationRepository = AutomationRepository(http)
    val energy: EnergyRepository = EnergyRepository(http)
    val notifications: NotificationRepository = NotificationRepository(http)
    val integrations: IntegrationRepository = IntegrationRepository(http)
    val realtime: DomusRealtime = DomusRealtime(http, tokenStore)

    /** The configured backend URL, or null until the user sets one. */
    val serverUrl: Flow<String?> = serverStore.baseUrl

    /** True once a backend URL has been configured. */
    val isConfigured: Flow<Boolean> = serverStore.baseUrl.map { it != null }

    /** True while the user has an active session. */
    val isLoggedIn: Flow<Boolean> = tokenStore.isLoggedIn

    /** The URL the client is currently pointing at. */
    val currentBaseUrl: String get() = http.config.origin

    /**
     * Point the app at a different backend (called from the settings UI). Persists the
     * URL, swaps the live client target, and clears the auth session — the user logs in
     * against the new server.
     */
    suspend fun setBaseUrl(url: String) {
        val cleaned = url.trim().trimEnd('/')
        serverStore.save(cleaned)
        http.updateConfig(DomusConfig(cleaned, enableLogging))
        tokenStore.clear()
        http.resetAuthCache()
    }

    /** Forget the configured server (and session) — sends the user back to setup. */
    suspend fun clearServer() {
        serverStore.clear()
        tokenStore.clear()
        http.resetAuthCache()
    }

    /**
     * Probe a candidate backend's `/health` endpoint without persisting it — lets the
     * server-config screen tell the user "reachable" before they commit the URL.
     */
    suspend fun testConnection(url: String): DomusResult<Unit> {
        val origin = url.trim().trimEnd('/')
        return safeApiCall { http.client.get("$origin/health") }
    }

    fun close() {
        scope.cancel()
        http.close()
    }

    companion object {
        /**
         * Builds the container synchronously (safe to call from [android.app.Application]).
         * Starts on [fallbackUrl] — the Android-emulator alias for the host's localhost —
         * then asynchronously swaps to the previously configured URL if one is persisted.
         * Observe [isConfigured] before issuing requests on first launch.
         */
        fun create(
            context: Context,
            fallbackUrl: String = "http://10.0.2.2:8000",
            enableLogging: Boolean = false,
        ): DomusCore {
            val appContext = context.applicationContext
            val serverStore = ServerStore(appContext)
            val tokenStore = TokenStore(appContext)
            val http = DomusHttp(DomusConfig(fallbackUrl, enableLogging), tokenStore)
            val core = DomusCore(http, serverStore, tokenStore, enableLogging)
            core.scope.launch {
                serverStore.current()?.let { http.updateConfig(DomusConfig(it, enableLogging)) }
            }
            return core
        }
    }
}
