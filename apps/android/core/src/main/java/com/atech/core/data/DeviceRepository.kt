package com.atech.core.data

import com.atech.core.common.DomusResult
import com.atech.core.model.Device
import com.atech.core.model.DeviceCreate
import com.atech.core.model.DeviceState
import com.atech.core.model.DeviceType
import com.atech.core.model.DeviceUpdate
import com.atech.core.model.Page
import com.atech.core.network.DomusHttp
import com.atech.core.network.safeApiCall
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import kotlinx.serialization.json.JsonObject

/** Devices + control + state/history. Mirrors `backend/devices/router.py`. */
class DeviceRepository(private val http: DomusHttp) {
    private val base get() = "${http.config.apiBase}/devices"

    suspend fun list(
        homeId: String? = null,
        roomId: String? = null,
        deviceType: DeviceType? = null,
        online: Boolean? = null,
        limit: Int = 50,
        offset: Int = 0,
    ): DomusResult<Page<Device>> =
        safeApiCall {
            http.client.get(base) {
                parameter("home_id", homeId)
                parameter("room_id", roomId)
                parameter("device_type", deviceType?.name?.lowercase())
                parameter("online", online)
                parameter("limit", limit)
                parameter("offset", offset)
            }
        }

    suspend fun get(deviceId: String): DomusResult<Device> =
        safeApiCall { http.client.get("$base/$deviceId") }

    suspend fun create(data: DeviceCreate): DomusResult<Device> =
        safeApiCall { http.client.post(base) { setBody(data) } }

    suspend fun update(deviceId: String, data: DeviceUpdate): DomusResult<Device> =
        safeApiCall { http.client.patch("$base/$deviceId") { setBody(data) } }

    suspend fun delete(deviceId: String): DomusResult<Unit> =
        safeApiCall { http.client.delete("$base/$deviceId") }

    // --- control (needs user role or higher) ---

    suspend fun turnOn(deviceId: String): DomusResult<DeviceState> =
        safeApiCall { http.client.post("$base/$deviceId/turn-on") }

    suspend fun turnOff(deviceId: String): DomusResult<DeviceState> =
        safeApiCall { http.client.post("$base/$deviceId/turn-off") }

    suspend fun toggle(deviceId: String): DomusResult<DeviceState> =
        safeApiCall { http.client.post("$base/$deviceId/toggle") }

    /** Sets device attributes, e.g. `{"brightness": 80, "color_temp": 4000}`. */
    suspend fun setAttributes(deviceId: String, attributes: JsonObject): DomusResult<DeviceState> =
        safeApiCall { http.client.post("$base/$deviceId/attributes") { setBody(attributes) } }

    // --- state & history ---

    suspend fun state(deviceId: String, refresh: Boolean = false): DomusResult<DeviceState> =
        safeApiCall { http.client.get("$base/$deviceId/state") { parameter("refresh", refresh) } }

    suspend fun history(deviceId: String, limit: Int = 50, offset: Int = 0): DomusResult<List<DeviceState>> =
        safeApiCall {
            http.client.get("$base/$deviceId/history") {
                parameter("limit", limit)
                parameter("offset", offset)
            }
        }
}
