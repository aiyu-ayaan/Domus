package com.atech.core.data

import com.atech.core.common.DomusResult
import com.atech.core.model.Room
import com.atech.core.model.RoomCreate
import com.atech.core.model.RoomUpdate
import com.atech.core.network.DomusHttp
import com.atech.core.network.safeApiCall
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.parameter
import io.ktor.client.request.setBody

/** Rooms. Mirrors `backend/rooms/router.py`. */
class RoomRepository(private val http: DomusHttp) {
    private val base get() = "${http.config.apiBase}/rooms"

    suspend fun list(homeId: String? = null): DomusResult<List<Room>> =
        safeApiCall { http.client.get(base) { parameter("home_id", homeId) } }

    suspend fun create(data: RoomCreate): DomusResult<Room> =
        safeApiCall { http.client.post(base) { setBody(data) } }

    suspend fun update(roomId: String, data: RoomUpdate): DomusResult<Room> =
        safeApiCall { http.client.patch("$base/$roomId") { setBody(data) } }

    suspend fun delete(roomId: String): DomusResult<Unit> =
        safeApiCall { http.client.delete("$base/$roomId") }
}
