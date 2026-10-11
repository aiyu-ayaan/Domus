package com.aiyu.domus.core

import android.content.Context
import java.net.URI
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.WebSocket

/** An open Screen Sync color stream. Closing it makes the server restore the lights. */
interface SyncStream {
    fun send(frame: String)
    fun close()
}

sealed interface Session {
    data object Loading : Session
    /** First run, or the user chose another server. */
    data object NoServer : Session
    data class Unreachable(val server: String, val message: String) : Session
    data class SignedOut(val server: String, val needsSetup: Boolean) : Session
    data class SignedIn(val server: String, val user: User) : Session
}

sealed interface ConnectResult {
    data object Connected : ConnectResult
    /** Self-signed server: show [fingerprint] and call [DomusRepository.connect] again with it once the user approves. */
    data class Untrusted(val url: String, val fingerprint: String) : ConnectResult
    data class Failed(val message: String) : ConnectResult
}

data class Appearance(val theme: String = "system", val dynamicColor: Boolean = false)

/** Everything the screens show, kept current by the server's event stream. One instance per process. */
class DomusRepository(context: Context) {
    private val store = SecureStore(context.applicationContext)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var api: DomusApi? = null
    private var socket: WebSocket? = null
    private var liveJob: Job? = null

    private val _session = MutableStateFlow<Session>(Session.Loading)
    val session: StateFlow<Session> = _session
    private val _devices = MutableStateFlow<List<Device>>(emptyList())
    val devices: StateFlow<List<Device>> = _devices
    private val _rooms = MutableStateFlow<List<Room>>(emptyList())
    val rooms: StateFlow<List<Room>> = _rooms
    private val _scenes = MutableStateFlow<List<Scene>>(emptyList())
    val scenes: StateFlow<List<Scene>> = _scenes
    private val _automations = MutableStateFlow<List<Automation>>(emptyList())
    val automations: StateFlow<List<Automation>> = _automations
    private val _energy = MutableStateFlow<EnergyOverview?>(null)
    val energy: StateFlow<EnergyOverview?> = _energy
    private val _effects = MutableStateFlow(EffectCatalog())
    /** Light moods and effects the server offers. Loaded once per sign-in. */
    val effects: StateFlow<EffectCatalog> = _effects
    /** True until the first load after sign-in finishes. */
    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading
    /** True while the event stream is connected. */
    private val _live = MutableStateFlow(false)
    val live: StateFlow<Boolean> = _live
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
    /** Short notices for a snackbar: failed commands, server notifications. */
    val messages: SharedFlow<String> = _messages
    private val _appearance = MutableStateFlow(Appearance(store.get(THEME) ?: "system", store.get(DYNAMIC) == "true"))
    val appearance: StateFlow<Appearance> = _appearance

    /**
     * Counts server-side changes that are not held here (discovered devices, linked accounts, notices).
     * Screens that list those reload when it moves, so a device onboarded anywhere shows up everywhere.
     */
    private val _revision = MutableStateFlow(0)
    val revision: StateFlow<Int> = _revision
    private val _alerts = MutableSharedFlow<Pair<String, String>>(extraBufferCapacity = 8)
    /** Server notifications as (title, message), for system notifications while the app is not on screen. */
    val alerts: SharedFlow<Pair<String, String>> = _alerts
    private val _backgroundAlerts = MutableStateFlow(store.get(ALERTS) == "true")
    /** The user's choice to be notified while the app is closed. */
    val backgroundAlerts: StateFlow<Boolean> = _backgroundAlerts
    /** Set by the alerts service: keep the event stream open off screen. */
    var keepLive = false
        set(value) {
            field = value
            if (value && _session.value is Session.SignedIn) startLive() else if (!value && !foreground) stopLive()
        }
    var foreground = false
        private set

    fun setBackgroundAlerts(on: Boolean) {
        store.put(ALERTS, on.toString())
        _backgroundAlerts.value = on
    }

    private val _updateChannel = MutableStateFlow(UpdateChannel.entries.firstOrNull { it.name == store.get(CHANNEL) })
    /** The release stream the user chose; null until they do, which means the installed build's own. */
    val updateChannel: StateFlow<UpdateChannel?> = _updateChannel

    fun setUpdateChannel(channel: UpdateChannel) {
        store.put(CHANNEL, channel.name)
        _updateChannel.value = channel
    }

    /** The release answered with "Later" when it was offered at start; it is not offered again. */
    val skippedUpdate: String? get() = store.get(SKIPPED_UPDATE)

    fun skipUpdate(version: String) = store.put(SKIPPED_UPDATE, version)

    private val _onboarded = MutableStateFlow(store.get(ONBOARDED) == "true")
    /** False until the first-run introduction has been seen. */
    val onboarded: StateFlow<Boolean> = _onboarded

    fun finishOnboarding() {
        store.put(ONBOARDED, "true")
        _onboarded.value = true
    }

    /** Fingerprint of the approved self-signed certificate, null when a public authority vouches for the server. */
    val pinnedFingerprint: String? get() = store.get(PIN)

    private val _links = MutableStateFlow(ServerLinks(store.get(LOCAL).orEmpty(), store.get(REMOTE).orEmpty()))
    /** The server's home and remote address, as last synced. */
    val links: StateFlow<ServerLinks> = _links

    init {
        scope.launch { restore() }
    }

    /** Addresses of the saved server, the home one first. */
    private fun candidates() = listOfNotNull(store.get(LOCAL), store.get(REMOTE), store.get(SERVER)).filter { it.isNotBlank() }.distinct()

    /** True when [url] answers as a trusted server within two seconds. */
    private suspend fun reachable(url: String) =
        runCatching { DomusApi(url, store.get(PIN), connectSeconds = 2) { null }.setupStatus() }.isSuccess

    /**
     * Moves to the home or the remote address, whichever answers now. The session token is valid on both, so
     * nobody signs in again. True when the address changed.
     */
    private suspend fun follow(): Boolean {
        val current = api?.baseUrl ?: return false
        val best = candidates().firstOrNull { reachable(it) } ?: return false
        if (best == current) return false
        store.put(SERVER, best)
        open(best, store.get(PIN))
        (_session.value as? Session.SignedIn)?.let { _session.value = it.copy(server = best) }
        return true
    }

    /** Keeps what the server says about its addresses. Its certificate arrives over a connection already trusted. */
    private fun remember(links: ServerLinks) {
        store.put(LOCAL, links.localUrl.ifBlank { null })
        store.put(REMOTE, links.remoteUrl.ifBlank { null })
        links.fingerprint?.let { store.put(PIN, it) }
        _links.value = links
    }

    /** Admin only. Null on success, otherwise the reason to show. Every app picks the change up from the server. */
    suspend fun saveLinks(localUrl: String, remoteUrl: String): String? {
        val api = api ?: return "No server"
        return try {
            remember(api.saveServerLinks(localUrl.trim(), remoteUrl.trim()))
            null
        } catch (e: ApiException) {
            e.message
        }
    }

    private fun open(server: String, pin: String?) = DomusApi(server, pin) { store.get(TOKEN) }.also { api = it }

    /** Picks up where the last launch left off. Also the "Try again" action of [Session.Unreachable]. */
    suspend fun restore() {
        val saved = store.get(SERVER) ?: run { _session.value = Session.NoServer; return }
        _session.value = Session.Loading
        val server = candidates().firstOrNull { reachable(it) } ?: saved
        if (server != saved) store.put(SERVER, server)
        val api = open(server, store.get(PIN))
        try {
            if (store.get(TOKEN) != null) {
                try {
                    signedIn(server, api.me())
                    return
                } catch (e: ApiException) {
                    if (e.status != 401) throw e
                    store.put(TOKEN, null)
                }
            }
            _session.value = Session.SignedOut(server, api.setupStatus().needsAdminSetup)
        } catch (e: ApiException) {
            val message = if (e.status == ApiException.UNTRUSTED) {
                "The server's certificate changed since you approved it. Connect again to review the new one."
            } else e.message.orEmpty()
            _session.value = Session.Unreachable(server, message)
        }
    }

    /**
     * Connects to the server at [input] (an address the user typed or a discovered URL).
     * [trustFingerprint] is the self-signed certificate the user just approved.
     */
    suspend fun connect(input: String, trustFingerprint: String? = null): ConnectResult {
        val url = normalizeServerUrl(input)
            ?: return ConnectResult.Failed("Enter an address like 192.168.1.10:8443 or home.example.com. Only https is supported.")
        val candidate = DomusApi(url, trustFingerprint) { null }
        return try {
            val needsSetup = candidate.setupStatus().needsAdminSetup
            store.put(SERVER, url)
            store.put(PIN, trustFingerprint)
            listOf(TOKEN, LOCAL, REMOTE).forEach { store.put(it, null) }
            _links.value = ServerLinks()
            open(url, trustFingerprint)
            _session.value = Session.SignedOut(url, needsSetup)
            ConnectResult.Connected
        } catch (e: ApiException) {
            if (e.status != ApiException.UNTRUSTED || trustFingerprint != null) return ConnectResult.Failed(e.message.orEmpty())
            val uri = URI(url)
            runCatching { Tls.fetchFingerprint(uri.host, if (uri.port == -1) 443 else uri.port) }
                .fold({ ConnectResult.Untrusted(url, it) }, { ConnectResult.Failed("Couldn't read the server's certificate.") })
        }
    }

    /** Null on success, otherwise the reason to show. */
    suspend fun login(username: String, password: String): String? = authenticate { it.login(username.trim(), password) }

    suspend fun setup(username: String, email: String, password: String): String? =
        authenticate { it.setup(username.trim(), email.trim(), password) }

    private suspend fun authenticate(request: suspend (DomusApi) -> AuthResponse): String? {
        val api = api ?: return "No server"
        return try {
            val auth = request(api)
            store.put(TOKEN, auth.token)
            signedIn(api.baseUrl, auth.user)
            null
        } catch (e: ApiException) {
            e.message
        }
    }

    /** Null on success. An administrator is told and hands over the code for [resetPassword]. */
    suspend fun forgotPassword(username: String): String? = entry { it.forgotPassword(username.trim()) }

    suspend fun resetPassword(username: String, code: String, password: String): String? =
        authenticate { it.resetPassword(username.trim(), code, password) }

    /** Replaces the generated password, which opens the rest of the app. */
    suspend fun choosePassword(password: String): String? = entry { api ->
        api.choosePassword(password)
        (_session.value as? Session.SignedIn)?.let { signedIn(it.server, it.user.copy(mustChangePassword = false)) }
    }

    private suspend fun entry(request: suspend (DomusApi) -> Unit): String? {
        val api = api ?: return "No server"
        return try {
            request(api)
            null
        } catch (e: ApiException) {
            e.message
        }
    }

    private fun signedIn(server: String, user: User) {
        _session.value = Session.SignedIn(server, user)
        // Until the generated password is replaced the server answers nothing else.
        if (user.mustChangePassword) return
        _loading.value = true
        scope.launch { refresh() }
        if (foreground || keepLive) startLive()
    }

    suspend fun updateAvatar(avatar: String): Boolean {
        val updated = request { it.updateAvatar(avatar) } ?: return false
        val current = _session.value
        if (current is Session.SignedIn) {
            _session.value = current.copy(user = updated)
        }
        return true
    }

    fun logout() {
        val server = api?.baseUrl ?: return
        store.put(TOKEN, null)
        clear()
        _session.value = Session.SignedOut(server, needsSetup = false)
    }

    /** Back to the connect screen. The saved server and its approved certificate are dropped. */
    fun forgetServer() {
        listOf(SERVER, PIN, TOKEN, LOCAL, REMOTE).forEach { store.put(it, null) }
        _links.value = ServerLinks()
        clear()
        api = null
        _session.value = Session.NoServer
    }

    private fun clear() {
        stopLive()
        _devices.value = emptyList()
        _rooms.value = emptyList()
        _scenes.value = emptyList()
        _automations.value = emptyList()
        _energy.value = null
    }

    fun setAppearance(value: Appearance) {
        store.put(THEME, value.theme)
        store.put(DYNAMIC, value.dynamicColor.toString())
        _appearance.value = value
    }

    /**
     * Runs [block] against the server; null when it failed. A failure becomes a snackbar message and an expired
     * session signs the user out. Screens use it for one-off reads and writes, then [refresh] or wait for the event.
     */
    suspend fun <T> request(block: suspend (DomusApi) -> T): T? = attempt(block)

    /** Like [request], and reloads the shared lists when it worked. */
    suspend fun <T> change(block: suspend (DomusApi) -> T): T? = attempt(block)?.also { _revision.update { it + 1 }; refresh() }

    /** Opens a Screen Sync color stream, or null when signed out. */
    fun sync(sceneId: String, onEvent: (JsonObject) -> Unit, onClosed: () -> Unit): SyncStream? =
        api?.sync(sceneId, onEvent, onClosed)?.let { socket ->
            object : SyncStream {
                override fun send(frame: String) { socket.send(frame) }
                override fun close() { socket.close(1000, null) }
            }
        }

    private suspend fun <T> attempt(block: suspend (DomusApi) -> T): T? {
        val api = api ?: return null
        return try {
            block(api)
        } catch (e: ApiException) {
            if (e.status == 401) logout() else _messages.tryEmit(e.message.orEmpty())
            null
        }
    }

    suspend fun refresh() {
        if (_session.value !is Session.SignedIn) return
        attempt { api ->
            coroutineScope {
                val devices = async { api.devices() }
                val rooms = async { api.rooms() }
                val scenes = async { api.scenes() }
                val automations = async { api.automations() }
                // Energy is optional: a home without metering plugs still gets everything else.
                val energy = async { runCatching { api.energyOverview() }.getOrNull() }
                _devices.value = devices.await().sortedBy { it.name.lowercase() }
                _rooms.value = rooms.await()
                _scenes.value = scenes.await()
                _automations.value = automations.await()
                _energy.value = energy.await()
                // Optional too: an older server has no catalog, lights then just show no moods.
                if (_effects.value.moods.isEmpty()) runCatching { api.effects() }.getOrNull()?.let { _effects.value = it }
                // Optional as well; this is how an address saved on another device arrives here.
                runCatching { api.serverLinks() }.getOrNull()?.let(::remember)
            }
        }
        _loading.value = false
    }

    private fun replace(device: Device) {
        _devices.update { list ->
            val next = list.map { if (it.id == device.id) device else it }
            val liveWatts = next.filter { it.isOnline }.mapNotNull { it.state.watts }.sum().toDouble()
            _energy.update { current ->
                current?.copy(watts = liveWatts)
            }
            next
        }
    }

    /** Shows the new state at once, then sends it. A failure puts the real state back. */
    fun command(device: Device, command: DeviceCommand) {
        replace(device.applying(command))
        scope.launch {
            val confirmed = attempt { it.command(device.id, command) }
            if (confirmed != null) replace(confirmed) else replace(device)
        }
    }

    fun refreshDevice(id: String) {
        scope.launch { attempt { it.refresh(id) }?.let(::replace) }
    }

    fun toggleScene(scene: Scene, on: Boolean) {
        _scenes.update { list -> list.map { if (it.id == scene.id) it.copy(isActive = on) else it } }
        scope.launch {
            val result = attempt { it.toggleScene(scene.id, on) }
            result?.errors?.firstOrNull()?.let { _messages.tryEmit(it) }
            attempt { it.scenes() }?.let { _scenes.value = it }
        }
    }

    fun toggleAutomation(automation: Automation) {
        scope.launch {
            attempt { it.toggleAutomation(automation.id) }?.let { updated ->
                _automations.update { list -> list.map { if (it.id == updated.id) updated else it } }
            }
        }
    }

    fun runAutomation(automation: Automation) {
        scope.launch {
            attempt { it.runAutomation(automation.id) }?.let {
                _messages.tryEmit(it.errors.firstOrNull() ?: "Ran “${automation.name}”")
            }
        }
    }

    suspend fun energyHistory(range: String): List<EnergyPoint> = attempt { it.energyHistory(range) }.orEmpty()

    // --- live events: only while the app is on screen ---

    fun onForeground() {
        foreground = true
        if (_session.value is Session.SignedIn) {
            startLive()
            scope.launch {
                // The phone may have left or come home while the app was away.
                if (follow()) { stopLive(); startLive() }
                refresh() // catch up on what changed while away
            }
        }
    }

    fun onBackground() {
        foreground = false
        if (!keepLive) stopLive()
    }

    private fun startLive() {
        if (liveJob?.isActive == true) return
        liveJob = scope.launch {
            // Periodic energy refresh while live in foreground (every 5 seconds, mirroring web query refetchInterval)
            launch {
                while (isActive) {
                    delay(5000)
                    if (foreground) {
                        attempt { it.energyOverview() }?.let { overview ->
                            val currentLiveWatts = _devices.value.filter { it.isOnline }.mapNotNull { it.state.watts }.sum().toDouble()
                            val wattsToKeep = if (_devices.value.any { it.isOnline && it.state.watts != null }) currentLiveWatts else overview.watts
                            _energy.value = overview.copy(watts = wattsToKeep)
                        }
                    }
                }
            }
            var retry = 0
            while (true) {
                if (retry > 0) follow() // the connection dropped: maybe the network changed
                val api = api ?: return@launch
                val closed = Job()
                socket = api.live(
                    onOpen = { scope.launch { _live.value = true; if (retry > 0) refresh(); retry = 0 } },
                    onEvent = { scope.launch { handle(it) } },
                    onClosed = { closed.complete() },
                )
                closed.join()
                _live.value = false
                retry = (retry + 1).coerceAtMost(6)
                delay(500L shl retry)
            }
        }
    }

    private fun stopLive() {
        liveJob?.cancel()
        liveJob = null
        socket?.cancel()
        socket = null
        _live.value = false
    }

    private suspend fun handle(event: JsonObject) {
        fun text(key: String) = event[key]?.jsonPrimitive?.contentOrNull
        when (text("type")) {
            "device_state_changed" -> {
                val id = text("device_id")
                val known = _devices.value.firstOrNull { it.id == id } ?: return refresh()
                val state = runCatching { api?.decodeState(event.getValue("state")) }.getOrNull() ?: return
                replace(known.copy(state = state, isOnline = event["is_online"]?.jsonPrimitive?.booleanOrNull ?: known.isOnline))
            }
            "device_added", "device_updated", "device_removed", "rooms_changed", "automation_triggered", "resync" -> {
                _revision.update { it + 1 }
                refresh()
            }
            "user_updated" -> {
                val userId = text("user_id")
                val avatar = text("avatar")
                val current = _session.value
                if (current is Session.SignedIn && current.user.id == userId) {
                    val updatedUser = if (avatar != null) current.user.copy(avatar = avatar) else attempt { it.me() } ?: current.user
                    _session.value = current.copy(user = updatedUser)
                }
                _revision.update { it + 1 }
            }
            "users_changed" -> {
                _revision.update { it + 1 }
                // Access may have changed, and with it the devices and rooms this user gets.
                refresh()
                val current = _session.value
                if (current is Session.SignedIn) {
                    attempt { it.me() }?.let { me ->
                        _session.value = current.copy(user = me)
                    }
                }
            }
            "device_discovered", "discovery_finished", "integrations_changed", "notifications_changed" -> _revision.update { it + 1 }
            "notification" -> {
                _revision.update { it + 1 }
                _messages.tryEmit(listOfNotNull(text("title"), text("message")).joinToString(": "))
                _alerts.tryEmit(text("title").orEmpty() to text("message").orEmpty())
            }
        }
    }

    private companion object {
        const val SERVER = "server"
        const val PIN = "pin"
        const val TOKEN = "token"
        const val LOCAL = "local"
        const val REMOTE = "remote"
        const val THEME = "theme"
        const val DYNAMIC = "dynamic"
        const val ALERTS = "alerts"
        const val ONBOARDED = "onboarded"
        const val CHANNEL = "update_channel"
        const val SKIPPED_UPDATE = "skipped_update"
    }
}
