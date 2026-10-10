package com.aiyu.domus.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.aiyu.domus.ui.theme.rememberReducedMotion

// Both charts: tap or drag to select a bucket; the caller shows the selected value as text, so nothing is
// readable only by color or only by touch. [summary] is what a screen reader hears for the whole chart.

private fun Modifier.selectBucket(count: Int, onSelect: (Int) -> Unit) =
    pointerInput(count) { detectTapGestures { if (count > 0) onSelect((it.x / size.width * count).toInt().coerceIn(0, count - 1)) } }
        .pointerInput(count) {
            detectHorizontalDragGestures { change, _ -> if (count > 0) onSelect((change.position.x / size.width * count).toInt().coerceIn(0, count - 1)) }
        }

/** 0 -> 1 whenever [key] changes (instantly with animations off). */
@Composable
private fun rememberReveal(key: Any?): Animatable<Float, *> {
    val reveal = remember { Animatable(0f) }
    val reduced = rememberReducedMotion()
    val spec = MaterialTheme.motionScheme.slowSpatialSpec<Float>()
    LaunchedEffect(key) {
        if (reduced) reveal.snapTo(1f) else { reveal.snapTo(0f); reveal.animateTo(1f, spec) }
    }
    return reveal
}

/** Bars that spring up from the baseline when the data changes. The [selected] bar is emphasized. */
@Composable
fun BarChart(values: List<Double>, selected: Int, onSelect: (Int) -> Unit, summary: String, modifier: Modifier = Modifier) {
    val c = MaterialTheme.colorScheme
    val rise = rememberReveal(values)
    val max = values.maxOrNull()?.takeIf { it > 0 } ?: 1.0
    Canvas(modifier.semantics { contentDescription = summary }.selectBucket(values.size, onSelect)) {
        if (values.isEmpty()) return@Canvas
        val slot = size.width / values.size
        val bar = (slot * 0.7f).coerceAtMost(28.dp.toPx())
        val radius = CornerRadius(bar / 2)
        values.forEachIndexed { i, value ->
            val x = slot * i + (slot - bar) / 2
            drawRoundRect(c.surfaceContainerHighest, Offset(x, 0f), Size(bar, size.height), radius)
            if (value > 0) {
                // At least a dot, so a small value still shows.
                val h = ((value / max).toFloat() * size.height * rise.value.coerceAtLeast(0f)).coerceIn(bar.coerceAtMost(size.height), size.height)
                drawRoundRect(if (i == selected) c.primary else c.outline, Offset(x, size.height - h), Size(bar, h), radius)
            }
        }
    }
}

/**
 * Line through the measured buckets; null breaks the line. [marks] are dashed reference levels.
 * Draws in from the start when the data changes.
 */
@Composable
fun LineChart(values: List<Double?>, selected: Int, onSelect: (Int) -> Unit, summary: String, modifier: Modifier = Modifier, marks: List<Double> = emptyList()) {
    val c = MaterialTheme.colorScheme
    val reveal = rememberReveal(values)
    val top = ((values.filterNotNull() + marks).maxOrNull() ?: 1.0).coerceAtLeast(1.0) * 1.1
    val path = remember { Path() }
    Canvas(modifier.semantics { contentDescription = summary }.selectBucket(values.size, onSelect)) {
        if (values.isEmpty()) return@Canvas
        fun x(i: Int) = if (values.size == 1) size.width / 2 else size.width * i / (values.size - 1)
        fun y(v: Double) = size.height - (v / top).toFloat() * size.height
        marks.forEach { drawLine(c.outlineVariant, Offset(0f, y(it)), Offset(size.width, y(it)), 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 8f))) }
        path.rewind()
        values.forEachIndexed { i, v ->
            if (v == null) return@forEachIndexed
            if (i > 0 && values[i - 1] != null) path.lineTo(x(i), y(v)) else path.moveTo(x(i), y(v))
        }
        clipRect(right = size.width * reveal.value.coerceIn(0f, 1f)) {
            drawPath(path, c.primary, style = Stroke(3.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            // A reading with no neighbors has no line to show it.
            values.forEachIndexed { i, v ->
                if (v != null && values.getOrNull(i - 1) == null && values.getOrNull(i + 1) == null) drawCircle(c.primary, 3.dp.toPx(), Offset(x(i), y(v)))
            }
        }
        values.getOrNull(selected)?.let { v ->
            drawLine(c.outline, Offset(x(selected), 0f), Offset(x(selected), size.height), 1.dp.toPx())
            drawCircle(c.surface, 7.dp.toPx(), Offset(x(selected), y(v)))
            drawCircle(c.primary, 5.dp.toPx(), Offset(x(selected), y(v)))
        }
    }
}
