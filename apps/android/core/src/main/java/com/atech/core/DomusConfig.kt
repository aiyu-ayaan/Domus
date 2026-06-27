package com.atech.core

/**
 * Points the core at a Domus server.
 *
 * @param baseUrl origin only, e.g. `http://10.0.2.2:8000` (the Android emulator's
 *   alias for the host machine's localhost) or `https://domus.example.com`.
 * @param enableLogging log HTTP traffic (debug builds only).
 */
data class DomusConfig(
    val baseUrl: String,
    val enableLogging: Boolean = false,
) {
    /** Origin without a trailing slash. */
    val origin: String = baseUrl.trimEnd('/')

    /** Versioned REST prefix, e.g. `http://host:8000/api/v1`. */
    val apiBase: String = "$origin/api/v1"

    /** WebSocket endpoint, e.g. `ws://host:8000/ws` (http→ws, https→wss). */
    val wsUrl: String = origin.replaceFirst("http", "ws") + "/ws"
}
