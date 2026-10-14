package com.aiyu.domus.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.graphics.Color
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
 * [peaks] is the highest reading of each bucket, drawn as a fainter line above the average.
 * Draws in from the start when the data changes.
 */
@Composable
fun LineChart(values: List<Double?>, selected: Int, onSelect: (Int) -> Unit, summary: String, modifier: Modifier = Modifier, marks: List<Double> = emptyList(), peaks: List<Double?> = emptyList()) {
    val c = MaterialTheme.colorScheme
    val reveal = rememberReveal(values)
    val top = ((values.filterNotNull() + peaks.filterNotNull() + marks).maxOrNull() ?: 1.0).coerceAtLeast(1.0) * 1.1
    val path = remember { Path() }
    val peakPath = remember { Path() }
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
        peakPath.rewind()
        peaks.forEachIndexed { i, v ->
            if (v == null) return@forEachIndexed
            if (i > 0 && peaks[i - 1] != null) peakPath.lineTo(x(i), y(v)) else peakPath.moveTo(x(i), y(v))
        }
        clipRect(right = size.width * reveal.value.coerceIn(0f, 1f)) {
            drawPath(peakPath, c.primary.copy(alpha = 0.35f), style = Stroke(1.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
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

/** The color of the [index]th compared line. */
@Composable
fun seriesColor(index: Int): Color {
    val c = MaterialTheme.colorScheme
    return listOf(c.primary, c.tertiary, c.secondary, c.error)[index % 4]
}

/** The dash of the [index]th compared line, so lines differ by more than color; the first is solid. */
fun seriesDash(index: Int): PathEffect? =
    listOf(null, floatArrayOf(14f, 8f), floatArrayOf(3f, 8f), floatArrayOf(20f, 8f, 4f, 8f))[index % 4]?.let { PathEffect.dashPathEffect(it) }

/** A short sample of the [index]th compared line, for a legend or a chip. */
@Composable
fun SeriesSwatch(index: Int, modifier: Modifier = Modifier) {
    val color = seriesColor(index)
    Canvas(modifier.size(width = 18.dp, height = 8.dp)) {
        drawLine(color, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), 2.5.dp.toPx(), StrokeCap.Round, seriesDash(index))
    }
}

/**
 * Several lines over the same buckets, one per device ([series]), each with its [seriesColor] and [seriesDash].
 * null breaks a line. The selected bucket marks every line's value.
 */
@Composable
fun MultiLineChart(series: List<List<Double?>>, selected: Int, onSelect: (Int) -> Unit, summary: String, modifier: Modifier = Modifier) {
    val c = MaterialTheme.colorScheme
    val colors = series.indices.map { seriesColor(it) }
    val count = series.maxOfOrNull { it.size } ?: 0
    // Draws in when devices are added or removed, not on each live sample (that would restart it every 5 s).
    val reveal = rememberReveal(series.size)
    // Not floored at 1 like LineChart: compared energy is often a few hundredths of a kWh.
    val top = (series.flatten().filterNotNull().maxOrNull()?.takeIf { it > 0 } ?: 1.0) * 1.1
    Canvas(modifier.semantics { contentDescription = summary }.selectBucket(count, onSelect)) {
        if (count == 0) return@Canvas
        fun x(i: Int) = if (count == 1) size.width / 2 else size.width * i / (count - 1)
        fun y(v: Double) = size.height - (v / top).toFloat() * size.height
        clipRect(right = size.width * reveal.value.coerceIn(0f, 1f)) {
            series.forEachIndexed { s, values ->
                val path = Path()
                values.forEachIndexed { i, v ->
                    if (v == null) return@forEachIndexed
                    if (i > 0 && values[i - 1] != null) path.lineTo(x(i), y(v)) else path.moveTo(x(i), y(v))
                }
                drawPath(path, colors[s], style = Stroke(2.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round, pathEffect = seriesDash(s)))
                values.forEachIndexed { i, v ->
                    if (v != null && values.getOrNull(i - 1) == null && values.getOrNull(i + 1) == null) drawCircle(colors[s], 3.dp.toPx(), Offset(x(i), y(v)))
                }
            }
        }
        if (selected in 0 until count) {
            drawLine(c.outline, Offset(x(selected), 0f), Offset(x(selected), size.height), 1.dp.toPx())
            series.forEachIndexed { s, values ->
                values.getOrNull(selected)?.let { v ->
                    drawCircle(c.surface, 6.dp.toPx(), Offset(x(selected), y(v)))
                    drawCircle(colors[s], 4.dp.toPx(), Offset(x(selected), y(v)))
                }
            }
        }
    }
}

/**
 * A week as a grid: a row per day, 24 columns of hours, a stronger cell for a higher value. It shows when
 * in the day something happens, which a line over the same week hides. null is an hour nothing was
 * measured in. Tap or drag selects a cell; [tone] picks a cell's color from its value.
 */
@Composable
fun HourGrid(rows: List<List<Double?>>, selected: Pair<Int, Int>?, onSelect: (row: Int, hour: Int) -> Unit, summary: String, modifier: Modifier = Modifier, tone: (Double) -> Color) {
    val c = MaterialTheme.colorScheme
    val max = rows.flatten().filterNotNull().maxOrNull()?.takeIf { it > 0 } ?: 1.0
    fun cell(at: Offset, width: Int, height: Int) {
        if (rows.isNotEmpty()) onSelect((at.y / height * rows.size).toInt().coerceIn(0, rows.lastIndex), (at.x / width * 24).toInt().coerceIn(0, 23))
    }
    Canvas(
        modifier.semantics { contentDescription = summary }
            .pointerInput(rows.size) { detectTapGestures { cell(it, size.width, size.height) } }
            .pointerInput(rows.size) { detectDragGestures { change, _ -> cell(change.position, size.width, size.height) } }
    ) {
        if (rows.isEmpty()) return@Canvas
        val gap = 2.dp.toPx()
        val w = size.width / 24
        val h = size.height / rows.size
        val radius = CornerRadius(3.dp.toPx())
        rows.forEachIndexed { r, hours ->
            hours.forEachIndexed { col, v ->
                val at = Offset(w * col + gap / 2, h * r + gap / 2)
                val cellSize = Size(w - gap, h - gap)
                drawRoundRect(c.surfaceContainerHighest, at, cellSize, radius)
                if (v != null) drawRoundRect(tone(v).copy(alpha = 0.15f + 0.85f * (v / max).toFloat().coerceIn(0f, 1f)), at, cellSize, radius)
                if (selected == r to col) drawRoundRect(c.onSurface, at, cellSize, radius, style = Stroke(1.5.dp.toPx()))
            }
        }
    }
}
