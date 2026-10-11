package com.aiyu.domus.core

import java.io.IOException
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.WebSocket
import okhttp3.WebSocketListener

/** [status] is the HTTP status, [OFFLINE] when the server can't be reached, [UNTRUSTED] when its certificate isn't accepted. */
class ApiException(message: String, val status: Int) : Exception(message) {
    companion object {
        const val OFFLINE = 0
        const val UNTRUSTED = -1
    }
}

/** REST + live events of one Domus server. [pin] is the approved certificate fingerprint of a self-signed server. */
class DomusApi(val baseUrl: String, pin: String?, connectSeconds: Long = 6, private val token: () -> String?) {
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }

    private val client: OkHttpClient = run {
        val trust = Tls.PinnedTrustManager(pin)
        val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf(trust), null) }
        OkHttpClient.Builder()
            .sslSocketFactory(ssl.socketFactory, trust)
            .hostnameVerifier(Tls.hostnameVerifier(pin))
            .connectTimeout(connectSeconds, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .pingInterval(25, TimeUnit.SECONDS) // notices a dead live connection
            .build()
    }

    private fun request(path: String) = Request.Builder().url("$baseUrl/api/v1$path").apply {
        token()?.let { header("Authorization", "Bearer $it") }
    }

    private suspend fun <T> call(method: String, path: String, out: KSerializer<T>, body: String? = null): T =
        withContext(Dispatchers.IO) {
            val payload = (body ?: if (method == "GET") null else "{}")?.toRequestBody(JSON)
            try {
                client.newCall(request(path).method(method, payload).build()).execute().use { response ->
                    val text = response.body?.string().orEmpty()
                    if (!response.isSuccessful) {
                        val message = runCatching {
                            json.parseToJsonElement(text).jsonObject["error"]?.jsonObject?.get("message")?.jsonPrimitive?.contentOrNull
                        }.getOrNull()
                        throw ApiException(message ?: "Request failed (${response.code})", response.code)
                    }
                    json.decodeFromString(out, text)
                }
            } catch (e: SSLException) {
                throw ApiException("The server's certificate is not trusted.", ApiException.UNTRUSTED)
            } catch (e: IOException) {
                throw ApiException("Can't reach the Domus server. Check that it is running.", ApiException.OFFLINE)
            } catch (e: kotlinx.serialization.SerializationException) {
                throw ApiException("The server sent an answer this app version doesn't understand.", 500)
            }
        }

    private fun <T> encode(serializer: KSerializer<T>, value: T) = json.encodeToString(serializer, value)
    private fun fields(vararg pairs: Pair<String, String>) =
        JsonObject(pairs.associate { it.first to JsonPrimitive(it.second) }).toString()

    suspend fun setupStatus() = call("GET", "/auth/setup-status", SetupStatus.serializer())
    suspend fun setup(username: String, email: String, password: String) =
        call("POST", "/auth/setup", AuthResponse.serializer(), fields("username" to username, "email" to email, "password" to password))
    suspend fun login(username: String, password: String) =
        call("POST", "/auth/login", AuthResponse.serializer(), fields("username" to username, "password" to password))
    /** Tells the administrators; the answer is the same whether or not the account exists. */
    suspend fun forgotPassword(username: String) = call("POST", "/auth/forgot", JsonElement.serializer(), fields("username" to username))
    /** Spends the one-time [code] an administrator handed over and signs in. */
    suspend fun resetPassword(username: String, code: String, newPassword: String) =
        call("POST", "/auth/reset", AuthResponse.serializer(), fields("username" to username, "code" to code, "new_password" to newPassword))
    /** Replaces the generated password the account is still on; the server asks for no current one then. */
    suspend fun choosePassword(newPassword: String) = call("POST", "/auth/password", JsonElement.serializer(), fields("new_password" to newPassword))
    suspend fun me() = call("GET", "/auth/me", User.serializer())
    suspend fun updateAvatar(avatar: String) =
        call("PUT", "/auth/me/avatar", User.serializer(), fields("avatar" to avatar))

    suspend fun serverLinks() = call("GET", "/server/links", ServerLinks.serializer())
    suspend fun saveServerLinks(localUrl: String, remoteUrl: String) =
        call("PUT", "/server/links", ServerLinks.serializer(), fields("local_url" to localUrl, "remote_url" to remoteUrl))

    suspend fun devices() = call("GET", "/devices", ListSerializer(Device.serializer()))
    suspend fun command(id: String, command: DeviceCommand) =
        call("POST", "/devices/$id/command", Device.serializer(), encode(DeviceCommand.serializer(), command))
    suspend fun effects() = call("GET", "/devices/effects", EffectCatalog.serializer())
    suspend fun refresh(id: String) = call("POST", "/devices/$id/refresh", Device.serializer())

    /** A write whose answer is not needed (or is read loosely). */
    private suspend fun write(method: String, path: String, body: JsonElement? = null) =
        call(method, path, JsonElement.serializer(), body?.toString())

    /** [roomId] null moves the device out of every room; [moveRoom] false leaves the room alone (only administrators may move a device). */
    suspend fun updateDevice(id: String, name: String, roomId: String?, moveRoom: Boolean = true) =
        call("PATCH", "/devices/$id", Device.serializer(), buildJsonObject { put("name", name); if (moveRoom) put("room_id", roomId) }.toString())
    suspend fun removeDevice(id: String) = write("DELETE", "/devices/$id")
    suspend fun addManual(integration: String, host: String, token: String?, name: String?) =
        call("POST", "/devices/manual", Device.serializer(), buildJsonObject {
            put("integration_type", integration); put("host", host)
            token?.let { put("token", it) }; name?.let { put("name", it) }
        }.toString())

    suspend fun discovered() = call("GET", "/discovery?status=pending", ListSerializer(Discovered.serializer()))
    suspend fun scan() = call("POST", "/discovery/scan", DiscoveryReport.serializer())
    suspend fun adopt(id: String, name: String?, roomId: String?, token: String?) =
        call("POST", "/discovery/$id/adopt", Device.serializer(), buildJsonObject {
            name?.let { put("name", it) }; roomId?.let { put("room_id", it) }; token?.let { put("token", it) }
        }.toString())
    suspend fun ignore(id: String) = write("POST", "/discovery/$id/ignore")

    suspend fun rooms() = call("GET", "/rooms", ListSerializer(Room.serializer()))
    /** [id] null creates the room. */
    suspend fun saveRoom(id: String?, name: String, floor: Int) =
        write(if (id == null) "POST" else "PUT", "/rooms${id?.let { "/$it" }.orEmpty()}", buildJsonObject { put("name", name); put("floor", floor) })
    suspend fun removeRoom(id: String) = write("DELETE", "/rooms/$id")

    /** [id] null creates. [body] is the scene as the server stores it: name, actions, kind, config. */
    suspend fun saveScene(id: String?, body: JsonObject) = write(if (id == null) "POST" else "PUT", "/scenes${id?.let { "/$it" }.orEmpty()}", body)
    suspend fun removeScene(id: String) = write("DELETE", "/scenes/$id")
    /** [id] null creates. [body]: name, description, triggers, conditions, actions, is_enabled. */
    suspend fun saveAutomation(id: String?, body: JsonObject) = write(if (id == null) "POST" else "PUT", "/automations${id?.let { "/$it" }.orEmpty()}", body)
    suspend fun removeAutomation(id: String) = write("DELETE", "/automations/$id")

    /** [range] is `day`, `week` or `month`. */
    suspend fun airHistory(range: String) = call("GET", "/air/history?range=$range", ListSerializer(AirPoint.serializer()))

    suspend fun energySettings() = call("GET", "/energy/settings", EnergySettings.serializer())
    suspend fun saveEnergySettings(settings: EnergySettings) =
        call("PUT", "/energy/settings", EnergySettings.serializer(), encode(EnergySettings.serializer(), settings))

    suspend fun users() = call("GET", "/users", ListSerializer(User.serializer()))
    /**
     * [id] null creates (then [username] is required). Only a [kid]'s account takes a [password]; without one a
     * new account gets a generated password, returned once as [User.generatedPassword], and an existing one keeps its own.
     */
    suspend fun saveUser(id: String?, username: String, email: String, password: String?, kid: Boolean, role: String, allRooms: Boolean, grants: Grants, avatar: String? = null) =
        call(if (id == null) "POST" else "PUT", "/users${id?.let { "/$it" }.orEmpty()}", User.serializer(), buildJsonObject {
            if (id == null) put("username", username)
            put("email", email); put("role", role); put("all_rooms", allRooms); put("kid", kid)
            password?.let { put("password", it) }
            avatar?.let { put("avatar", it) }
            fun ids(key: String, ids: Collection<String>) = put(key, JsonArray(ids.map(::JsonPrimitive)))
            ids("room_ids", grants.rooms.keys); ids("view_only_room_ids", grants.rooms.filterValues { it == "view" }.keys)
            ids("device_ids", grants.devices.keys); ids("view_only_device_ids", grants.devices.filterValues { it == "view" }.keys)
            ids("edit_room_ids", grants.rooms.filterValues { it == "edit" }.keys); ids("edit_device_ids", grants.devices.filterValues { it == "edit" }.keys)
        }.toString())
    /** [what] `reset_password` generates a new password, `reset_allowed` issues ([on]) or withdraws a one-time reset code; the answer carries it once. */
    suspend fun issue(id: String, what: String, on: Boolean = true) =
        call("PUT", "/users/$id", User.serializer(), buildJsonObject { put(what, on) }.toString())
    suspend fun removeUser(id: String) = write("DELETE", "/users/$id")
    /** Whether another account already uses [email]; [userId] is the account being edited. */
    suspend fun emailAvailable(email: String, userId: String?) =
        call("GET", "/users/email/check?email=${encoded(email)}${userId?.let { "&user_id=$it" }.orEmpty()}", EmailCheck.serializer())
    /** The first free address for [username], at @domus.home. */
    suspend fun suggestEmail(username: String, userId: String?) =
        call("GET", "/users/email/suggest?username=${encoded(username)}${userId?.let { "&user_id=$it" }.orEmpty()}", EmailSuggestion.serializer())
    private fun encoded(text: String) = java.net.URLEncoder.encode(text, "UTF-8")

    suspend fun integrations() = call("GET", "/integrations", ListSerializer(Integration.serializer()))
    suspend fun removeAccount(id: String) = write("DELETE", "/integrations/accounts/$id")
    suspend fun tuyaQr(userCode: String) = call("POST", "/integrations/tuya/qr", TuyaQr.serializer(), fields("user_code" to userCode))
    suspend fun tuyaQrStatus(token: String) = call("GET", "/integrations/tuya/qr/$token", TuyaQrStatus.serializer())
    suspend fun linkTapo(username: String, password: String) =
        write("POST", "/integrations/tapo/accounts", buildJsonObject { put("username", username); put("password", password) })
    /** Integrations linked by a form the server describes (MQTT broker, Hue bridge). */
    suspend fun linkForm(id: String, values: Map<String, String>) =
        write("POST", "/integrations/$id/accounts", buildJsonObject { values.forEach { (key, value) -> put(key, value) } })
    suspend fun linkXiaomi(username: String, password: String, region: String) =
        call("POST", "/integrations/xiaomi/accounts", XiaomiLink.serializer(), fields("username" to username, "password" to password, "region" to region))
    suspend fun verifyXiaomi(verifyId: String, code: String) =
        write("POST", "/integrations/xiaomi/verify", buildJsonObject { put("verify_id", verifyId); put("code", code) })

    suspend fun notices() = call("GET", "/notifications", NoticeList.serializer())
    suspend fun readAllNotices() = write("POST", "/notifications/read-all")
    suspend fun removeNotice(id: String) = write("DELETE", "/notifications/$id")
    suspend fun clearNotices() = write("DELETE", "/notifications")

    suspend fun scenes() = call("GET", "/scenes", ListSerializer(Scene.serializer()))
    suspend fun toggleScene(id: String, on: Boolean) =
        call("POST", "/scenes/$id/toggle", ActionResult.serializer(), """{"on":$on}""")
    suspend fun automations() = call("GET", "/automations", ListSerializer(Automation.serializer()))
    suspend fun toggleAutomation(id: String) = call("POST", "/automations/$id/toggle", Automation.serializer())
    suspend fun runAutomation(id: String) = call("POST", "/automations/$id/run", ActionResult.serializer())

    suspend fun energyOverview() = call("GET", "/energy/overview", EnergyOverview.serializer())
    /** [range] is `day`, `week` or `month`. */
    suspend fun energyHistory(range: String) = call("GET", "/energy/history?range=$range", ListSerializer(EnergyPoint.serializer()))

    /** Server event stream. [onEvent] gets each event object; [onClosed] fires once when the connection ends for any reason. */
    fun live(onOpen: () -> Unit, onEvent: (JsonObject) -> Unit, onClosed: () -> Unit) = socket("/ws", onOpen, onEvent, onClosed)

    /**
     * Color stream of a Screen Sync scene: send `{"c":"#rrggbb","b":1-100}` frames; the server answers with
     * `ready`, `device_error`, `error` and `stopped` events.
     */
    fun sync(sceneId: String, onEvent: (JsonObject) -> Unit, onClosed: () -> Unit) = socket("/scenes/$sceneId/sync", {}, onEvent, onClosed)

    private fun socket(path: String, onOpen: () -> Unit, onEvent: (JsonObject) -> Unit, onClosed: () -> Unit): WebSocket {
        val scheme = if (baseUrl.startsWith("https")) "wss" else "ws"
        val wsUrl = "${baseUrl.replaceFirst(Regex("^https?"), scheme)}/api/v1$path"
        return client.newWebSocket(
            request(path).url(wsUrl).build(),
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: okhttp3.Response) = onOpen()
                override fun onMessage(webSocket: WebSocket, text: String) {
                    runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull()?.let(onEvent)
                }
                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { webSocket.close(1000, null) }
                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = onClosed()
                override fun onFailure(webSocket: WebSocket, t: Throwable, response: okhttp3.Response?) = onClosed()
            },
        )
    }

    internal fun decodeState(element: JsonElement) = json.decodeFromJsonElement(DeviceState.serializer(), element)

    private companion object {
        val JSON = "application/json".toMediaType()
    }
}
