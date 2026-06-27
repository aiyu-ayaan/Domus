package com.atech.core.data

import com.atech.core.common.DomusResult
import com.atech.core.model.Scene
import com.atech.core.model.SceneActivateResult
import com.atech.core.model.SceneCreate
import com.atech.core.model.SceneUpdate
import com.atech.core.network.DomusHttp
import com.atech.core.network.safeApiCall
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody

/** Scenes. Mirrors `backend/scenes/router.py`. */
class SceneRepository(private val http: DomusHttp) {
    private val base get() = "${http.config.apiBase}/scenes"

    suspend fun list(homeId: String? = null): DomusResult<List<Scene>> =
        safeApiCall { http.client.get(base) { parameter("home_id", homeId) } }

    suspend fun get(sceneId: String): DomusResult<Scene> =
        safeApiCall { http.client.get("$base/$sceneId") }

    suspend fun create(data: SceneCreate): DomusResult<Scene> =
        safeApiCall { http.client.post(base) { setBody(data) } }

    suspend fun update(sceneId: String, data: SceneUpdate): DomusResult<Scene> =
        safeApiCall { http.client.patch("$base/$sceneId") { setBody(data) } }

    suspend fun delete(sceneId: String): DomusResult<Unit> =
        safeApiCall { http.client.delete("$base/$sceneId") }

    suspend fun activate(sceneId: String): DomusResult<SceneActivateResult> =
        safeApiCall { http.client.post("$base/$sceneId/activate") }
}
