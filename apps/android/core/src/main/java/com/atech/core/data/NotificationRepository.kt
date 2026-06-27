package com.atech.core.data

import com.atech.core.common.DomusResult
import com.atech.core.model.Notification
import com.atech.core.network.DomusHttp
import com.atech.core.network.safeApiCall
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post

/** Notifications. Mirrors `backend/notifications/router.py`. */
class NotificationRepository(private val http: DomusHttp) {
    private val base get() = "${http.config.apiBase}/notifications"

    suspend fun list(
        homeId: String? = null,
        unread: Boolean? = null,
        limit: Int = 50,
        offset: Int = 0,
    ): DomusResult<List<Notification>> =
        safeApiCall {
            http.client.get(base) {
                parameter("home_id", homeId)
                parameter("unread", unread)
                parameter("limit", limit)
                parameter("offset", offset)
            }
        }

    suspend fun markRead(notificationId: String): DomusResult<Notification> =
        safeApiCall { http.client.post("$base/$notificationId/read") }
}
