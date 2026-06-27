package com.atech.core.realtime

import com.atech.core.auth.TokenStore
import com.atech.core.model.DomusEvent
import com.atech.core.network.DomusHttp
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.channels.consumeEach
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/** Event `type` values the server emits (mirrors `backend/core/events.py`). */
object DomusEventType {
    const val DEVICE_STATE_CHANGED = "device.state_changed"   // data: {device_id, state, attributes}
    const val DEVICE_ONLINE_CHANGED = "device.online_changed" // data: {device_id, online}
    const val NOTIFICATION_CREATED = "notification.created"
    const val DASHBOARD_UPDATED = "dashboard.updated"
}

/**
 * Live updates from the server's `/ws` endpoint. The server pushes
 * `{type, data, home_id, ts}` envelopes for device state changes, new devices,
 * notifications, etc.
 *
 * [events] is a cold flow that connects on collection and auto-reconnects with a
 * fixed backoff until the collector is cancelled. Malformed frames are skipped.
 */
class DomusRealtime(
    private val http: DomusHttp,
    private val tokenStore: TokenStore,
) {
    fun events(reconnectDelayMs: Long = 3_000): Flow<DomusEvent> = flow {
        while (true) {
            val token = tokenStore.current()?.access_token
            if (token != null) {
                try {
                    http.client.webSocket("${http.config.wsUrl}?token=$token") {
                        incoming.consumeEach { frame ->
                            if (frame is Frame.Text) {
                                runCatching { http.json.decodeFromString<DomusEvent>(frame.readText()) }
                                    .getOrNull()
                                    ?.let { emit(it) }
                            }
                        }
                    }
                } catch (_: Exception) {
                    // connection dropped or refused — fall through to backoff + retry
                }
            }
            delay(reconnectDelayMs) // ponytail: fixed backoff; exponential if reconnect storms appear
        }
    }
}
