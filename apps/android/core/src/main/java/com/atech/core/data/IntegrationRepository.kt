package com.atech.core.data

import com.atech.core.common.DomusResult
import com.atech.core.model.DiscoveryResult
import com.atech.core.model.Integration
import com.atech.core.model.IntegrationCreate
import com.atech.core.model.IntegrationUpdate
import com.atech.core.network.DomusHttp
import com.atech.core.network.safeApiCall
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody

/** Integrations + device discovery. Mirrors `backend/integrations/router.py`. */
class IntegrationRepository(private val http: DomusHttp) {
    private val base get() = "${http.config.apiBase}/integrations"

    /** Integration types this server build supports (e.g. "tapo", "tuya"). */
    suspend fun available(): DomusResult<List<String>> =
        safeApiCall { http.client.get("$base/available") }

    suspend fun list(homeId: String? = null): DomusResult<List<Integration>> =
        safeApiCall { http.client.get(base) { parameter("home_id", homeId) } }

    suspend fun get(integrationId: String): DomusResult<Integration> =
        safeApiCall { http.client.get("$base/$integrationId") }

    suspend fun create(data: IntegrationCreate): DomusResult<Integration> =
        safeApiCall { http.client.post(base) { setBody(data) } }

    suspend fun update(integrationId: String, data: IntegrationUpdate): DomusResult<Integration> =
        safeApiCall { http.client.patch("$base/$integrationId") { setBody(data) } }

    suspend fun delete(integrationId: String): DomusResult<Unit> =
        safeApiCall { http.client.delete("$base/$integrationId") }

    /** Scan the integration for devices on the network. */
    suspend fun discover(integrationId: String): DomusResult<DiscoveryResult> =
        safeApiCall { http.client.post("$base/$integrationId/discover") }
}
