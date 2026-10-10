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

data class Appearance(val theme: String = "system", val dynamicColor: Boolean = true)

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
    /** True until the first load after sign-in finishes. */
    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading
    /** True while the event stream is connected. */
    private val _live = MutableStateFlow(false)
    val live: StateFlow<Boolean> = _live
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
    /** Short notices for a snackbar: failed commands, server notifications. */
    val messages: SharedFlow<String> = _messages
    private val _appearance = MutableStateFlow(Appearance(store.get(THEME) ?: "system", store.get(DYNAMIC) != "false"))
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

    private val _onboarded = MutableStateFlow(store.get(ONBOARDED) == "true")
    /** False until the first-run introduction has been seen. */
    val onboarded: StateFlow<Boolean> = _onboarded

    fun finishOnboarding() {
        store.put(ONBOARDED, "true")
        _onboarded.value = true
    }

    /** Fingerprint of the approved self-signed certificate, null when a public authority vouches for the server. */
    val pinnedFingerprint: String? get() = store.get(PIN)

    init {
        scope.launch { restore() }
    }

    private fun open(server: String, pin: String?) = DomusApi(server, pin) { store.get(TOKEN) }.also { api = it }

    /** Picks up where the last launch left off. Also the "Try again" action of [Session.Unreachable]. */
    suspend fun restore() {
        val server = store.get(SERVER) ?: run { _session.value = Session.NoServer; return }
        _session.value = Session.Loading
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
            store.put(TOKEN, null)
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

    private fun signedIn(server: String, user: User) {
        _session.value = Session.SignedIn(server, user)
        _loading.value = true
        scope.launch { refresh() }
        if (foreground || keepLive) startLive()
    }

    fun logout() {
        val server = api?.baseUrl ?: return
        store.put(TOKEN, null)
        clear()
        _session.value = Session.SignedOut(server, needsSetup = false)
    }

    /** Back to the connect screen. The saved server and its approved certificate are dropped. */
    fun forgetServer() {
        listOf(SERVER, PIN, TOKEN).forEach { store.put(it, null) }
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
            }
        }
        _loading.value = false
    }

    private fun replace(device: Device) = _devices.update { list -> list.map { if (it.id == device.id) device else it } }

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
            scope.launch { refresh() } // catch up on what changed while away
        }
    }

    fun onBackground() {
        foreground = false
        if (!keepLive) stopLive()
    }

    private fun startLive() {
        if (liveJob?.isActive == true) return
        liveJob = scope.launch {
            var retry = 0
            while (true) {
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
            "device_discovered", "discovery_finished", "integrations_changed" -> _revision.update { it + 1 }
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
        const val THEME = "theme"
        const val DYNAMIC = "dynamic"
        const val ALERTS = "alerts"
        const val ONBOARDED = "onboarded"
    }
}
