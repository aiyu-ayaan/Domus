package com.aiyu.domus.core

import kotlin.math.pow
import kotlin.math.roundToInt

/** The color and brightness one screen frame turns the lights to. */
data class ScreenSample(val red: Int, val green: Int, val blue: Int, /** 0..1 perceived brightness of the frame */ val luma: Float) {
    val hex get() = "#%02x%02x%02x".format(red, green, blue)
}

/**
 * Picks the light color for a frame of ARGB [pixels] ([width] x [height]), like the web app's analysis:
 * `average` is the mean color, `dominant` the most common one, anything else `vivid`: the strongest hue,
 * weighted so saturated pixels beat large grey areas. With [edgesOnly] just the outer 20% band counts (TV bias light).
 */
fun screenColor(pixels: IntArray, width: Int, height: Int, style: String, edgesOnly: Boolean): ScreenSample {
    val mx = (width * 0.2f).toInt()
    val my = (height * 0.2f).toInt()
    val used = pixels.indices.filter { i ->
        !edgesOnly || (i % width).let { x -> x < mx || x >= width - mx } || (i / width).let { y -> y < my || y >= height - my }
    }
    if (used.isEmpty()) return ScreenSample(0, 0, 0, 0f)
    fun r(p: Int) = p shr 16 and 0xFF
    fun g(p: Int) = p shr 8 and 0xFF
    fun b(p: Int) = p and 0xFF
    val luma = used.sumOf { i -> pixels[i].let { 0.2126 * r(it) + 0.7152 * g(it) + 0.0722 * b(it) } }.toFloat() / used.size / 255f

    // Weighted mean of the pixels [pick] selects; falls back to all of them.
    fun mean(weight: (Int) -> Double): ScreenSample {
        var sr = 0.0; var sg = 0.0; var sb = 0.0; var total = 0.0
        for (i in used) {
            val p = pixels[i]
            val w = weight(p)
            sr += r(p) * w; sg += g(p) * w; sb += b(p) * w; total += w
        }
        if (total <= 0.0) return mean { 1.0 }
        return ScreenSample((sr / total).roundToInt(), (sg / total).roundToInt(), (sb / total).roundToInt(), luma)
    }
    fun saturation(p: Int): Double {
        val max = maxOf(r(p), g(p), b(p))
        return if (max == 0) 0.0 else (max - minOf(r(p), g(p), b(p))).toDouble() / max
    }
    fun hueBin(p: Int): Int {
        val hsv = FloatArray(3)
        rgbToHsv(r(p), g(p), b(p), hsv)
        return (hsv[0] / 10f).toInt().coerceIn(0, 35)
    }
    return when (style) {
        "average" -> mean { 1.0 }
        "dominant" -> {
            fun bin(p: Int) = (r(p) shr 4 shl 8) or (g(p) shr 4 shl 4) or (b(p) shr 4)
            val top = used.groupingBy { bin(pixels[it]) }.eachCount().maxByOrNull { it.value }!!.key
            mean { if (bin(it) == top) 1.0 else 0.0 }
        }
        else -> {
            val weights = DoubleArray(36)
            for (i in used) pixels[i].let { weights[hueBin(it)] += saturation(it).pow(2) * maxOf(r(it), g(it), b(it)) / 255.0 }
            val top = weights.indices.maxByOrNull { weights[it] }!!
            mean { if (hueBin(it) == top) saturation(it).pow(2) else 0.0 }
        }
    }
}

// android.graphics.Color.RGBToHSV without Android, so this file tests on the JVM.
private fun rgbToHsv(r: Int, g: Int, b: Int, out: FloatArray) {
    val max = maxOf(r, g, b)
    val min = minOf(r, g, b)
    val d = (max - min).toFloat()
    out[0] = when {
        d == 0f -> 0f
        max == r -> 60f * (((g - b) / d) % 6f)
        max == g -> 60f * ((b - r) / d + 2f)
        else -> 60f * ((r - g) / d + 4f)
    }.let { if (it < 0) it + 360f else it }
    out[1] = if (max == 0) 0f else d / max
    out[2] = max / 255f
}

/** Brightness 1-100 for a frame of [luma], inside the scene's [min]..[max]. Gamma keeps dim scenes visible. */
fun syncBrightness(luma: Float, min: Int, max: Int): Int =
    (min + (max - min) * luma.coerceIn(0f, 1f).pow(0.75f)).roundToInt().coerceIn(1, 100)
