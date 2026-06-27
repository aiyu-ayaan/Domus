package com.atech.core.util

import com.atech.core.model.BillingSettings
import kotlin.math.round

/** Cost of [kwh] units under [b], in the tariff's currency. Mirrors web lib/energy.ts. */
fun computeCost(kwh: Double, b: BillingSettings): Double {
    val fixed = b.fixed_charge
    if (b.type == "tiered") {
        var remaining = kwh
        var prevCap = 0.0
        var cost = fixed
        for (tier in b.tiers) {
            val width = tier.up_to?.let { it - prevCap } ?: Double.MAX_VALUE
            val used = minOf(remaining, width)
            if (used <= 0.0) break
            cost += used * tier.rate
            remaining -= used
            tier.up_to?.let { prevCap = it }
            if (remaining <= 0.0) break
        }
        return round2(cost)
    }
    return round2(fixed + kwh * b.rate)
}

/** Blended average price per kWh (handy for per-device cost). */
fun effectiveRate(kwh: Double, b: BillingSettings): Double {
    if (kwh <= 0.0) return if (b.type == "flat") b.rate else (b.tiers.firstOrNull()?.rate ?: 0.0)
    return round2(computeCost(kwh, b) / kwh)
}

fun formatMoney(amount: Double, currency: String): String = "$currency${"%,.2f".format(amount)}"

private fun round2(n: Double): Double = round(n * 100.0) / 100.0
