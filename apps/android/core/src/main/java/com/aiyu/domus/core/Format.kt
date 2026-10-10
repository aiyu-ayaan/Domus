package com.aiyu.domus.core

import java.text.NumberFormat
import java.util.Currency

// Same rules as the web app (apps/web/src/lib/format.ts) so both clients show the same numbers.

private fun number(value: Double, digits: Int): String =
    NumberFormat.getNumberInstance().apply { maximumFractionDigits = digits; minimumFractionDigits = 0 }.format(value)

fun formatWatts(w: Double?): String {
    if (w == null) return "—"
    val v = if (kotlin.math.abs(w) < 0.05) 0.0 else w
    return if (v >= 1000) "${number(v / 1000, 2)} kW" else "${number(v, if (v < 10) 1 else 0)} W"
}

fun formatKwh(kwh: Double?): String {
    if (kwh == null) return "—"
    val v = kwh.coerceAtLeast(0.0)
    return if (v < 1) "${number(v * 1000, 0)} Wh" else "${number(v, if (v < 10) 2 else 1)} kWh"
}

fun formatMoney(value: Double, currency: String): String {
    val v = if (kotlin.math.abs(value) < 0.005) 0.0 else value
    return runCatching {
        NumberFormat.getCurrencyInstance().apply { this.currency = Currency.getInstance(currency); maximumFractionDigits = 2 }.format(v)
    }.getOrElse { "${number(v, 2)} $currency" }
}

enum class AirLevel(val label: String) { EXCELLENT("Excellent"), GOOD("Good"), MODERATE("Moderate"), POOR("Poor") }

/** PM2.5 µg/m³ -> level. */
fun airLevel(pm: Float): AirLevel = when {
    pm <= 12 -> AirLevel.EXCELLENT
    pm <= 35 -> AirLevel.GOOD
    pm <= 55 -> AirLevel.MODERATE
    else -> AirLevel.POOR
}

/**
 * Turns what the user typed into the server origin, or null when it can't be one.
 * Cleartext `http://` is refused: every request must be encrypted. A bare IP address gets the server's default
 * port 8443; a host name gets the standard 443 (a hosted server behind a real certificate).
 */
fun normalizeServerUrl(input: String): String? {
    val text = input.trim().trimEnd('/')
    if (text.isEmpty() || text.startsWith("http://", ignoreCase = true)) return null
    val uri = runCatching { java.net.URI(if ("://" in text) text else "https://$text") }.getOrNull() ?: return null
    val host = uri.host ?: return null
    if (!uri.scheme.equals("https", ignoreCase = true)) return null
    val isIp = host.startsWith("[") || host.all { it.isDigit() || it == '.' }
    val port = if (uri.port != -1) uri.port else if (isIp) 8443 else 443
    return if (port == 443) "https://$host" else "https://$host:$port"
}
