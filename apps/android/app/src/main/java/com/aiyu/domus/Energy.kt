package com.aiyu.domus

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Today
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.LinearWavyProgressIndicator
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.MaterialShapes
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aiyu.domus.core.EnergyPoint
import com.aiyu.domus.core.formatKwh
import com.aiyu.domus.core.formatMoney
import com.aiyu.domus.core.formatWatts
import com.aiyu.domus.ui.components.RollingText
import com.aiyu.domus.ui.components.ScreenColumn
import com.aiyu.domus.ui.components.ScreenHeader
import com.aiyu.domus.ui.components.SectionTitle
import com.aiyu.domus.ui.components.enterStaggered

private val Ranges = listOf("day" to "Day", "week" to "Week", "month" to "Month")

/** Bars that spring up from the baseline whenever the data changes. */
@Composable
private fun EnergyBars(points: List<EnergyPoint>, modifier: Modifier = Modifier) {
    val color = MaterialTheme.colorScheme.primary
    val track = MaterialTheme.colorScheme.surfaceContainerHighest
    val rise = remember { Animatable(0f) }
    val spec = MaterialTheme.motionScheme.slowSpatialSpec<Float>()
    LaunchedEffect(points) {
        rise.snapTo(0f)
        rise.animateTo(1f, spec)
    }
    val max = points.maxOfOrNull { it.kwh }?.takeIf { it > 0 } ?: 1.0
    Canvas(modifier.semantics { contentDescription = "Energy used: ${formatKwh(points.sumOf { it.kwh })} in total" }) {
        if (points.isEmpty()) return@Canvas
        val slot = size.width / points.size
        val bar = (slot * 0.7f).coerceAtMost(28.dp.toPx())
        val radius = CornerRadius(bar / 2)
        points.forEachIndexed { i, point ->
            val x = slot * i + (slot - bar) / 2
            drawRoundRect(track, Offset(x, 0f), Size(bar, size.height), radius)
            // At least a dot, so an empty hour still reads as "measured, zero".
            val h = ((point.kwh / max).toFloat() * size.height * rise.value.coerceAtLeast(0f)).coerceIn(bar.coerceAtMost(size.height), size.height)
            if (point.kwh > 0) drawRoundRect(color, Offset(x, size.height - h), Size(bar, h), radius)
        }
    }
}

@Composable
fun EnergyScreen() {
    val repository = LocalRepository.current
    val energy by repository.energy.collectAsStateWithLifecycle()
    val loading by repository.loading.collectAsStateWithLifecycle()
    var range by rememberSaveable { mutableStateOf("day") }
    var history by remember { mutableStateOf<List<EnergyPoint>?>(null) }
    // Reload when the range changes and when live usage moves on.
    LaunchedEffect(range, energy?.todayKwh) { history = repository.energyHistory(range) }
    val c = MaterialTheme.colorScheme

    ScreenColumn {
        val overview = energy
        ScreenHeader("Energy", overview?.let { "Day ${it.cycleDay} of ${it.cycleDays} in this billing cycle" } ?: "Power use and cost")
        if (overview == null) {
            if (loading) LoadingIndicator(Modifier.align(Alignment.CenterHorizontally).padding(top = 48.dp))
            else EmptyState("No energy data yet", "Add a plug or switch that measures power, and set your electricity rate in the web app.")
            return@ScreenColumn
        }
        val currency = overview.settings.currency

        Surface(color = c.primaryContainer, contentColor = c.onPrimaryContainer, shape = MaterialTheme.shapes.extraLarge, modifier = Modifier.fillMaxWidth().enterStaggered(0)) {
            Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Using now", style = MaterialTheme.typography.labelLarge)
                RollingText(formatWatts(overview.watts), MaterialTheme.typography.displayMedium)
                overview.budgetUsedPercent?.let { used ->
                    LinearWavyProgressIndicator(
                        progress = { (used / 100).toFloat().coerceIn(0f, 1f) },
                        color = if (used > 100) c.error else c.primary,
                        trackColor = c.surface,
                        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                    )
                    Text("${used.toInt()}% of the monthly budget · on track for ${formatMoney(overview.projectedCost, currency)}", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        Row(Modifier.fillMaxWidth().enterStaggered(1), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatCard("Today", formatKwh(overview.todayKwh), formatMoney(overview.todayCost, currency), Icons.Rounded.Today, MaterialShapes.Clover4Leaf, c.secondaryContainer, c.onSecondaryContainer, Modifier.weight(1f))
            StatCard("This cycle", formatKwh(overview.cycleKwh), formatMoney(overview.cycleCost, currency), Icons.Rounded.CalendarMonth, MaterialShapes.Cookie9Sided, c.tertiaryContainer, c.onTertiaryContainer, Modifier.weight(1f))
        }

        SectionTitle("History")
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            Ranges.forEachIndexed { index, (key, label) ->
                SegmentedButton(range == key, { range = key }, SegmentedButtonDefaults.itemShape(index, Ranges.size)) { Text(label) }
            }
        }
        Surface(color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                val points = history
                if (points == null) LoadingIndicator(Modifier.align(Alignment.CenterHorizontally))
                else {
                    EnergyBars(points, Modifier.fillMaxWidth().height(160.dp))
                    Text("${formatKwh(points.sumOf { it.kwh })} · ${formatMoney(points.sumOf { it.cost }, currency)}", style = MaterialTheme.typography.titleMedium)
                }
            }
        }

        if (overview.devices.isNotEmpty()) SectionTitle("By device")
        val top = overview.devices.maxOfOrNull { it.kwh }?.takeIf { it > 0 } ?: 1.0
        overview.devices.sortedByDescending { it.kwh }.forEachIndexed { index, device ->
            Surface(color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth().enterStaggered(2 + index)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(device.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        RollingText(formatWatts(device.watts), MaterialTheme.typography.titleMedium)
                    }
                    LinearProgressIndicator(progress = { (device.kwh / top).toFloat().coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
                    Text("${formatKwh(device.kwh)} · ${formatMoney(device.cost, currency)} this cycle", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                }
            }
        }
    }
}
