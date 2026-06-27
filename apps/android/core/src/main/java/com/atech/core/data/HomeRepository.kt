package com.atech.core.data

import com.atech.core.common.DomusResult
import com.atech.core.model.Home
import com.atech.core.model.HomeCreate
import com.atech.core.model.HomeUpdate
import com.atech.core.network.DomusHttp
import com.atech.core.network.safeApiCall
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody

/** Homes. Mirrors `backend/homes/router.py`. */
class HomeRepository(private val http: DomusHttp) {
    private val base get() = "${http.config.apiBase}/homes"

    suspend fun list(): DomusResult<List<Home>> =
        safeApiCall { http.client.get(base) }

    suspend fun get(homeId: String): DomusResult<Home> =
        safeApiCall { http.client.get("$base/$homeId") }

    suspend fun create(data: HomeCreate): DomusResult<Home> =
        safeApiCall { http.client.post(base) { setBody(data) } }

    suspend fun update(homeId: String, data: HomeUpdate): DomusResult<Home> =
        safeApiCall { http.client.patch("$base/$homeId") { setBody(data) } }

    suspend fun delete(homeId: String): DomusResult<Unit> =
        safeApiCall { http.client.delete("$base/$homeId") }
}
