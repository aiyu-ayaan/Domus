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
import com.atech.core.network.DomusHttp
import com.atech.core.realtime.DomusRealtime
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

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

    fun close() = http.close()

    companion object {
        /**
         * Creates the container, restoring the previously configured URL if any.
         * Falls back to [fallbackUrl] (the Android-emulator host alias) until the user
         * configures a real one in the UI.
         */
        suspend fun create(
            context: Context,
            fallbackUrl: String = "http://10.0.2.2:8000",
            enableLogging: Boolean = false,
        ): DomusCore {
            val appContext = context.applicationContext
            val serverStore = ServerStore(appContext)
            val tokenStore = TokenStore(appContext)
            val startUrl = serverStore.current() ?: fallbackUrl
            val http = DomusHttp(DomusConfig(startUrl, enableLogging), tokenStore)
            return DomusCore(http, serverStore, tokenStore, enableLogging)
        }
    }
}
