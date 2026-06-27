package com.atech.core.data

import com.atech.core.common.DomusResult
import com.atech.core.model.EnergySummary
import com.atech.core.network.DomusHttp
import com.atech.core.network.safeApiCall
import io.ktor.client.request.get
import io.ktor.client.request.parameter

/** Energy usage. Mirrors `backend/energy/router.py`. */
class EnergyRepository(private val http: DomusHttp) {
    private val base get() = "${http.config.apiBase}/energy"

    suspend fun summary(
        homeId: String? = null,
        hours: Int = 24,
        minutes: Int? = null,
    ): DomusResult<EnergySummary> =
        safeApiCall {
            http.client.get("$base/summary") {
                parameter("home_id", homeId)
                parameter("hours", hours)
                parameter("minutes", minutes)
            }
        }
}
