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
import kotlinx.serialization.json.JsonObject
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
class DomusApi(val baseUrl: String, pin: String?, private val token: () -> String?) {
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }

    private val client: OkHttpClient = run {
        val trust = Tls.PinnedTrustManager(pin)
        val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf(trust), null) }
        OkHttpClient.Builder()
            .sslSocketFactory(ssl.socketFactory, trust)
            .hostnameVerifier(Tls.hostnameVerifier(pin))
            .connectTimeout(6, TimeUnit.SECONDS)
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
        JsonObject(pairs.associate { it.first to kotlinx.serialization.json.JsonPrimitive(it.second) }).toString()

    suspend fun setupStatus() = call("GET", "/auth/setup-status", SetupStatus.serializer())
    suspend fun setup(username: String, email: String, password: String) =
        call("POST", "/auth/setup", AuthResponse.serializer(), fields("username" to username, "email" to email, "password" to password))
    suspend fun login(username: String, password: String) =
        call("POST", "/auth/login", AuthResponse.serializer(), fields("username" to username, "password" to password))
    suspend fun me() = call("GET", "/auth/me", User.serializer())

    suspend fun devices() = call("GET", "/devices", ListSerializer(Device.serializer()))
    suspend fun command(id: String, command: DeviceCommand) =
        call("POST", "/devices/$id/command", Device.serializer(), encode(DeviceCommand.serializer(), command))
    suspend fun refresh(id: String) = call("POST", "/devices/$id/refresh", Device.serializer())

    suspend fun rooms() = call("GET", "/rooms", ListSerializer(Room.serializer()))
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
    fun live(onOpen: () -> Unit, onEvent: (JsonObject) -> Unit, onClosed: () -> Unit): WebSocket =
        client.newWebSocket(
            request("/ws").url("${baseUrl.replaceFirst("https", "wss")}/api/v1/ws").build(),
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

    internal fun decodeState(element: kotlinx.serialization.json.JsonElement) = json.decodeFromJsonElement(DeviceState.serializer(), element)

    private companion object {
        val JSON = "application/json".toMediaType()
    }
}
