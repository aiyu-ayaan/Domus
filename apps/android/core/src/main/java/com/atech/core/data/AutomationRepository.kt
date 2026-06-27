package com.atech.core.data

import com.atech.core.common.DomusResult
import com.atech.core.model.Automation
import com.atech.core.model.AutomationCreate
import com.atech.core.model.AutomationRunResult
import com.atech.core.model.AutomationUpdate
import com.atech.core.network.DomusHttp
import com.atech.core.network.safeApiCall
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody

/** Automations. Mirrors `backend/automations/router.py`. */
class AutomationRepository(private val http: DomusHttp) {
    private val base get() = "${http.config.apiBase}/automations"

    suspend fun list(homeId: String? = null): DomusResult<List<Automation>> =
        safeApiCall { http.client.get(base) { parameter("home_id", homeId) } }

    suspend fun get(automationId: String): DomusResult<Automation> =
        safeApiCall { http.client.get("$base/$automationId") }

    suspend fun create(data: AutomationCreate): DomusResult<Automation> =
        safeApiCall { http.client.post(base) { setBody(data) } }

    suspend fun update(automationId: String, data: AutomationUpdate): DomusResult<Automation> =
        safeApiCall { http.client.patch("$base/$automationId") { setBody(data) } }

    suspend fun delete(automationId: String): DomusResult<Unit> =
        safeApiCall { http.client.delete("$base/$automationId") }

    /** Manually fire an automation (evaluates conditions, runs actions). */
    suspend fun trigger(automationId: String): DomusResult<AutomationRunResult> =
        safeApiCall { http.client.post("$base/$automationId/trigger") }
}
