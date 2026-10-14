package com.aiyu.domus

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import com.aiyu.domus.ui.components.HourGrid
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Air
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.DateRange
import androidx.compose.material.icons.rounded.MonitorHeart
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Sensors
import androidx.compose.material.icons.rounded.Today
import androidx.compose.material3.FilterChip
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import android.text.format.DateFormat
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aiyu.domus.core.usingWatts
import com.aiyu.domus.core.AirLevel
import com.aiyu.domus.core.AirPoint
import com.aiyu.domus.core.Device
import com.aiyu.domus.core.EnergyPoint
import com.aiyu.domus.core.User
import com.aiyu.domus.core.airLevel
import com.aiyu.domus.core.formatBucket
import com.aiyu.domus.core.formatKwh
import com.aiyu.domus.core.formatMoney
import com.aiyu.domus.core.formatWatts
import com.aiyu.domus.ui.components.BarChart
import com.aiyu.domus.ui.components.LineChart
import com.aiyu.domus.ui.components.MultiLineChart
import com.aiyu.domus.ui.components.SeriesSwatch
import com.aiyu.domus.ui.components.RollingText
import com.aiyu.domus.ui.components.ScreenColumn
import com.aiyu.domus.ui.components.ScreenHeader
import com.aiyu.domus.ui.components.SectionTitle
import com.aiyu.domus.ui.components.LocalWideScreen
import com.aiyu.domus.ui.components.SideBySide
import com.aiyu.domus.ui.components.enterStaggered
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

/** Does the home measure power / air? The Analytics tab and its two sections exist only for what it does. */
fun List<Device>.measuresPower() = any { it.state.watts != null || it.state.todayKwh != null }
fun List<Device>.measuresAir() = any { it.type == "air_purifier" || it.state.pm25 != null }

// "live" is what the devices report right now, sampled by the app while the page is open.
// "hour" is the last 60 minutes, one bucket a minute.
private val Ranges = listOf(
    Triple("live", R.string.analytics_range_live, Icons.Rounded.MonitorHeart),
    Triple("hour", R.string.analytics_range_hour, Icons.Rounded.Schedule),
    Triple("day", R.string.analytics_range_day, Icons.Rounded.Today),
    Triple("week", R.string.analytics_range_week, Icons.Rounded.DateRange),
    Triple("month", R.string.analytics_range_month, Icons.Rounded.CalendarMonth),
)
/** What one bucket of [range] covers. */
@Composable
private fun bucketOf(range: String) = stringResource(
    when (range) {
        "live" -> R.string.analytics_bucket_5s
        "hour" -> R.string.analytics_bucket_minute
        "day" -> R.string.analytics_bucket_hour
        else -> R.string.analytics_bucket_day
    }
)

/** The last five minutes of what [sample] reads (it is given the time as ISO-8601), taken every five seconds while on screen. */
// shortcut: held by the page, so the line starts empty on each visit; keep the samples in the repository if it should outlive the page.
@Composable
private fun <T> rememberLive(sample: (String) -> T): List<T> {
    val current by rememberUpdatedState(sample)
    val samples = remember { mutableStateListOf<T>() }
    LaunchedEffect(Unit) {
        while (true) {
            samples += current(OffsetDateTime.now().toString())
            if (samples.size > 60) samples.removeAt(0)
            delay(5_000)
        }
    }
    return samples
}

/** Which devices a chart compares: none picked is the home's combined line, else one line per picked device. */
@Composable
private fun DevicePicker(devices: List<Pair<String, String>>, picked: List<String>, onChange: (List<String>) -> Unit) {
    if (devices.size < 2) return
    val label = stringResource(R.string.analytics_compare_devices)
    FlowRow(Modifier.fillMaxWidth().semantics { contentDescription = label }, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FilterChip(picked.isEmpty(), { onChange(emptyList()) }, { Text(stringResource(R.string.analytics_compare_combined)) })
        devices.forEach { (id, name) ->
            val at = picked.indexOf(id)
            FilterChip(
                at >= 0, { onChange(if (at >= 0) picked - id else picked + id) }, { Text(name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                leadingIcon = if (at >= 0) ({ SeriesSwatch(at) }) else null,
            )
        }
    }
}

/**
 * The compared devices over [times]: each one's value at the selected bucket above a line per device.
 * [series] follows [names]; [format] writes a value.
 */
@Composable
private fun ColumnScope.CompareChart(names: List<String>, series: List<List<Double?>>, times: List<String>, range: String, empty: String, format: @Composable (Double) -> String) {
    val c = MaterialTheme.colorScheme
    val is24Hour = rememberIs24HourFormat()
    if (times.isEmpty() || series.all { s -> s.all { it == null } }) {
        Text(empty, color = c.onSurfaceVariant)
        return
    }
    var picked by remember(range) { mutableStateOf<Int?>(null) }
    // Starts on the latest bucket any device measured.
    val selected = (picked ?: series.maxOf { s -> s.indexOfLast { it != null } }).coerceIn(0, times.lastIndex)
    Text(formatBucket(times[selected], range, is24Hour), style = MaterialTheme.typography.labelLarge, color = c.onSurfaceVariant)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        names.forEachIndexed { i, name ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                SeriesSwatch(i)
                Text(name, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(series[i].getOrNull(selected)?.let { format(it) } ?: stringResource(R.string.analytics_no_reading), style = MaterialTheme.typography.titleSmall)
            }
        }
    }
    MultiLineChart(series, selected, { picked = it }, stringResource(R.string.analytics_compare_summary, bucketOf(range)), Modifier.fillMaxWidth().height(160.dp))
    ChartAxis(formatBucket(times.first(), range, is24Hour), formatBucket(times.last(), range, is24Hour))
}

/** Tracks the device's 12/24-hour clock setting, refreshing when the app resumes from system settings. */
@Composable
fun rememberIs24HourFormat(): Boolean {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var is24Hour by remember { mutableStateOf(DateFormat.is24HourFormat(context)) }
    DisposableEffect(lifecycleOwner, context) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) is24Hour = DateFormat.is24HourFormat(context)
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    return is24Hour
}

/**
 * Connected toggle buttons, the expressive successor of the segmented button. Every range shows its icon;
 * the chosen one widens and spells its name, like a navigation bar item.
 */
@Composable
private fun RangePicker(range: String, ranges: List<Triple<String, Int, ImageVector>>, onChange: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(ButtonGroupDefaults.ConnectedSpaceBetween)) {
        ranges.forEachIndexed { index, (key, labelRes, icon) ->
            val label = stringResource(labelRes)
            val selected = range == key
            val weight by animateFloatAsState(if (selected) 2f else 1f, MaterialTheme.motionScheme.fastEffectsSpec(), label = "weight")
            ToggleButton(
                selected, { onChange(key) },
                Modifier.weight(weight).semantics { role = Role.RadioButton; contentDescription = label },
                shapes = when (index) {
                    0 -> ButtonGroupDefaults.connectedLeadingButtonShapes()
                    ranges.lastIndex -> ButtonGroupDefaults.connectedTrailingButtonShapes()
                    else -> ButtonGroupDefaults.connectedMiddleButtonShapes()
                },
            ) {
                Icon(icon, null, Modifier.size(ToggleButtonDefaults.IconSize))
                AnimatedVisibility(selected) { Text(label, Modifier.padding(start = ToggleButtonDefaults.IconSpacing), maxLines = 1) }
            }
        }
    }
}

/** A small fact: label, value, one line of context. */
@Composable
private fun Fact(label: String, value: String, detail: String, modifier: Modifier = Modifier) {
    val c = MaterialTheme.colorScheme
    Surface(color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = modifier.semantics(mergeDescendants = true) {}) {
        Column(Modifier.padding(16.dp)) {
            Text(label, style = MaterialTheme.typography.labelLarge, color = c.onSurfaceVariant)
            RollingText(value, MaterialTheme.typography.titleLarge)
            Text(detail, style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun FactRow(vararg facts: Triple<String, String, String>, index: Int) {
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).enterStaggered(index), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        facts.forEach { (label, value, detail) -> Fact(label, value, detail, Modifier.weight(1f).fillMaxHeight()) }
    }
}

@Composable
private fun ChartCard(content: @Composable ColumnScope.() -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
    }
}

@Composable
private fun ChartAxis(first: String, last: String) {
    Row {
        Text(first, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
        Text(last, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/**
 * The last 7 days as a day-by-hour grid of hourly [points] (the server's "hours" range), with the picked
 * hour's value as text above it. null points are still loading.
 */
@Composable
private fun <T> HourGridCard(title: String, points: List<T>?, time: (T) -> String, value: (T) -> Double?, format: @Composable (Double) -> String, tone: (Double) -> Color, empty: String) {
    val is24Hour = rememberIs24HourFormat()
    val c = MaterialTheme.colorScheme
    SectionTitle(title)
    ChartCard {
        if (points == null) { LoadingIndicator(Modifier.align(Alignment.CenterHorizontally)); return@ChartCard }
        if (points.none { value(it) != null }) { Text(empty, color = c.onSurfaceVariant); return@ChartCard }
        // The phone's days, in order, each with the point of its 24 hours (a missing hour stays empty).
        val days = remember(points) {
            points.mapNotNull { p -> runCatching { OffsetDateTime.parse(time(p)).atZoneSameInstant(ZoneId.systemDefault()) }.getOrNull()?.let { it to p } }
                .groupBy { it.first.toLocalDate() }.toSortedMap().values
                .map { day -> List(24) { h -> day.firstOrNull { it.first.hour == h }?.second } }
        }
        var picked by remember(points) { mutableStateOf<Pair<Int, Int>?>(null) }
        // Starts on the latest measured hour.
        val selected = picked ?: days.indices.reversed().firstNotNullOfOrNull { r -> days[r].indexOfLast { it != null && value(it) != null }.takeIf { it >= 0 }?.let { r to it } }
        val point = selected?.let { (r, h) -> days.getOrNull(r)?.get(h) }
        Row(verticalAlignment = Alignment.Bottom) {
            Text(point?.let { stringResource(R.string.analytics_day_hour, formatBucket(time(it), "week", is24Hour), formatBucket(time(it), "day", is24Hour)) } ?: "", style = MaterialTheme.typography.labelLarge, color = c.onSurfaceVariant, modifier = Modifier.weight(1f))
            RollingText(point?.let { value(it) }?.let { format(it) } ?: stringResource(R.string.analytics_no_reading), MaterialTheme.typography.titleMedium)
        }
        val rowHeight = 22.dp
        Row {
            Column(Modifier.width(52.dp)) {
                days.forEach { day -> Box(Modifier.height(rowHeight), contentAlignment = Alignment.CenterStart) { Text(day.firstNotNullOfOrNull { it }?.let { formatBucket(time(it), "week", is24Hour) } ?: "", style = MaterialTheme.typography.labelSmall, color = c.onSurfaceVariant, maxLines = 1) } }
            }
            HourGrid(days.map { day -> day.map { p -> p?.let(value) } }, selected, { r, h -> picked = r to h }, stringResource(R.string.analytics_hour_grid_summary, title), Modifier.weight(1f).height(rowHeight * days.size), tone)
        }
        Row(Modifier.padding(start = 52.dp)) {
            listOf(0, 6, 12, 18).forEach { h -> Text(LocalTime.of(h, 0).format(DateTimeFormatter.ofPattern(if (is24Hour) "HH:mm" else "h a")), Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, color = c.onSurfaceVariant) }
        }
        Text(stringResource(R.string.analytics_hour_grid_caption), style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant)
    }
}

/** One tab for everything the home measures. Shows Electricity, Air quality, or a switch between them. */
@Composable
fun AnalyticsScreen(user: User, onOpenDevice: (String) -> Unit, onEditTariff: () -> Unit) {
    val repository = LocalRepository.current
    val devices by repository.devices.collectAsStateWithLifecycle()
    val power = devices.measuresPower()
    val air = devices.measuresAir()
    var section by rememberSaveable { mutableStateOf("power") }
    val shown = if (power && (section == "power" || !air)) "power" else "air"
    val motion = MaterialTheme.motionScheme

    ScreenColumn {
        ScreenHeader(stringResource(R.string.analytics_title), stringResource(if (shown == "power") R.string.analytics_subtitle_power else R.string.analytics_subtitle_air)) {
            if (shown == "power" && user.isAdmin) FilledTonalIconButton(onEditTariff) { Icon(Icons.Rounded.Payments, stringResource(R.string.analytics_electricity_tariff)) }
        }
        if (power && air) {
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                SegmentedButton(shown == "power", { section = "power" }, SegmentedButtonDefaults.itemShape(0, 2), icon = { Icon(Icons.Rounded.Bolt, null, Modifier.size(18.dp)) }) { Text(stringResource(R.string.analytics_tab_electricity)) }
                SegmentedButton(shown == "air", { section = "air" }, SegmentedButtonDefaults.itemShape(1, 2), icon = { Icon(Icons.Rounded.Air, null, Modifier.size(18.dp)) }) { Text(stringResource(R.string.analytics_tab_air)) }
            }
        }
        AnimatedContent(shown, transitionSpec = { fadeIn(motion.defaultEffectsSpec()).togetherWith(fadeOut(motion.fastEffectsSpec())) }, label = "section") { which ->
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                if (which == "power") ElectricitySection() else AirSection(user, onOpenDevice)
            }
        }
    }
}

@Composable
private fun ColumnScope.ElectricitySection() {
    val repository = LocalRepository.current
    val devices by repository.devices.collectAsStateWithLifecycle()
    val energy by repository.energy.collectAsStateWithLifecycle()
    val loading by repository.loading.collectAsStateWithLifecycle()
    val is24Hour = rememberIs24HourFormat()
    var range by rememberSaveable { mutableStateOf("day") }
    // The insights always read today's hours and the last 7 days, whatever range the chart shows.
    var day by remember { mutableStateOf<List<EnergyPoint>?>(null) }
    var week by remember { mutableStateOf<List<EnergyPoint>?>(null) }
    var month by remember { mutableStateOf<List<EnergyPoint>?>(null) }
    var hour by remember { mutableStateOf<List<EnergyPoint>?>(null) }
    var hours by remember { mutableStateOf<List<EnergyPoint>?>(null) }
    LaunchedEffect(energy?.todayKwh) {
        day = repository.energyHistory("day")
        week = repository.energyHistory("week")
        hours = repository.energyHistory("hours")
    }
    LaunchedEffect(range, energy?.todayKwh) {
        if (range == "month") month = repository.energyHistory("month")
        if (range == "hour") hour = repository.energyHistory("hour")
    }
    // Devices compared line by line, and each one's history for the range shown.
    var compared by rememberSaveable { mutableStateOf(listOf<String>()) }
    var perDevice by remember { mutableStateOf<Map<String, List<EnergyPoint>>>(emptyMap()) }
    LaunchedEffect(range, compared, energy?.todayKwh) {
        if (range != "live") perDevice = compared.associateWith { repository.energyHistory(range, it) }
    }
    val c = MaterialTheme.colorScheme

    val overview = energy
    if (overview == null) {
        if (loading) LoadingIndicator(Modifier.align(Alignment.CenterHorizontally).padding(top = 48.dp))
        else EmptyState(stringResource(R.string.analytics_no_energy_title), stringResource(R.string.analytics_no_energy_subtitle))
        return
    }
    val currency = overview.settings.currency

    val liveWatts = devices.usingWatts(overview.settings.solarDeviceIds)
    val wattsToDisplay = if (devices.any { it.isOnline && it.state.watts != null }) liveWatts else overview.watts

    val summary: @Composable ColumnScope.() -> Unit = {
        Surface(color = c.primaryContainer, contentColor = c.onPrimaryContainer, shape = MaterialTheme.shapes.extraLarge, modifier = Modifier.fillMaxWidth().enterStaggered(0)) {
            Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(stringResource(R.string.analytics_using_now), style = MaterialTheme.typography.labelLarge)
                RollingText(formatWatts(wattsToDisplay), MaterialTheme.typography.displayMedium)
                Text(stringResource(R.string.analytics_projected_cost, formatMoney(overview.projectedCost, currency)), style = MaterialTheme.typography.bodyMedium)
            }
        }
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).enterStaggered(1), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatCard(stringResource(R.string.analytics_today), formatKwh(overview.todayKwh), formatMoney(overview.todayCost, currency), Icons.Rounded.Today, MaterialShapes.Clover4Leaf, c.secondaryContainer, c.onSecondaryContainer, Modifier.weight(1f).fillMaxHeight(), info = stringResource(R.string.analytics_today_info))
            StatCard(stringResource(R.string.analytics_this_cycle), formatKwh(overview.cycleKwh), formatMoney(overview.cycleCost, currency), Icons.Rounded.CalendarMonth, MaterialShapes.Cookie9Sided, c.tertiaryContainer, c.onTertiaryContainer, Modifier.weight(1f).fillMaxHeight(), info = stringResource(R.string.analytics_this_cycle_info))
        }
    }

    val history: @Composable ColumnScope.() -> Unit = {
        val live = rememberLive { EnergyPoint(it, watts = wattsToDisplay) }
        val liveByDevice = rememberLive { t -> t to devices.filter { it.isOnline }.associate { d -> d.id to d.state.watts?.toDouble() } }
        SectionTitle(stringResource(R.string.analytics_history))
        RangePicker(range, Ranges) { range = it }
        DevicePicker(overview.devices.map { it.deviceId to it.name }, compared) { compared = it }
        if (compared.isNotEmpty()) ChartCard {
            val isLive = range == "live"
            if (!isLive && compared.any { it !in perDevice }) LoadingIndicator(Modifier.align(Alignment.CenterHorizontally))
            else CompareChart(
                names = compared.map { id -> overview.devices.firstOrNull { it.deviceId == id }?.name ?: "—" },
                // Energy per bucket, or the power each draws while live. An unmeasured bucket breaks the line.
                series = compared.map { id -> if (isLive) liveByDevice.map { it.second[id] } else perDevice[id].orEmpty().map { p -> p.kwh.takeIf { it > 0 || p.watts != null } } },
                times = if (isLive) liveByDevice.map { it.first } else perDevice[compared.first()].orEmpty().map { it.t },
                range = range,
                empty = stringResource(R.string.analytics_nothing_recorded),
            ) { if (isLive) formatWatts(it) else formatKwh(it) }
        } else ChartCard {
            val isLive = range == "live"
            val points = when (range) { "live" -> live; "hour" -> hour; "day" -> day; "week" -> week; else -> month }
            if (points == null) LoadingIndicator(Modifier.align(Alignment.CenterHorizontally))
            else if (!isLive && points.sumOf { it.kwh } <= 0) Text(stringResource(R.string.analytics_nothing_recorded), color = c.onSurfaceVariant)
            else {
                // Starts on the latest bucket; a tap or drag picks another.
                var picked by remember(range) { mutableStateOf<Int?>(null) }
                var metric by remember { mutableStateOf(false) }
                // Live has no energy yet, only the power being drawn.
                val watts = metric || isLive
                if (!isLive) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(!metric, { metric = false }, { Text(stringResource(R.string.analytics_metric_energy)) })
                    FilterChip(metric, { metric = true }, { Text(stringResource(R.string.analytics_metric_power)) })
                }
                // Power starts on the latest measured bucket.
                val selected = (picked ?: if (watts) points.indexOfLast { it.watts != null } else points.lastIndex).coerceIn(0, points.lastIndex)
                val point = points[selected]
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(formatBucket(point.t, range, is24Hour), style = MaterialTheme.typography.labelLarge, color = c.onSurfaceVariant, modifier = Modifier.weight(1f))
                    val power = point.watts?.let { w -> point.peakWatts?.let { stringResource(R.string.analytics_value_with_peak, formatWatts(w), formatWatts(it)) } ?: formatWatts(w) }
                    RollingText(if (watts) power ?: stringResource(R.string.analytics_no_reading) else stringResource(R.string.analytics_kwh_and_cost, formatKwh(point.kwh), formatMoney(point.cost, currency)), MaterialTheme.typography.titleMedium)
                }
                val per = bucketOf(range)
                if (watts) LineChart(points.map { it.watts }, selected, { picked = it }, stringResource(R.string.analytics_chart_avg_power, per), Modifier.fillMaxWidth().height(160.dp), peaks = points.map { it.peakWatts })
                else BarChart(points.map { it.kwh }, selected, { picked = it }, stringResource(R.string.analytics_chart_energy_used, per, formatKwh(points.sumOf { it.kwh })), Modifier.fillMaxWidth().height(160.dp))
                ChartAxis(formatBucket(points.first().t, range, is24Hour), formatBucket(points.last().t, range, is24Hour))
                Text(if (isLive) stringResource(R.string.analytics_live_caption) else stringResource(R.string.analytics_total_caption, formatKwh(points.sumOf { it.kwh }), formatMoney(points.sumOf { it.cost }, currency)), style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
            }
        }

        // An hour without a sample was not measured, which is not the same as using nothing.
        HourGridCard(stringResource(R.string.analytics_usage_by_hour), hours, { it.t }, { p -> p.kwh.takeIf { it > 0 || p.watts != null } }, { formatKwh(it) }, { c.primary }, stringResource(R.string.analytics_nothing_recorded))
    }

    val insights: @Composable ColumnScope.() -> Unit = {
        SectionTitle(stringResource(R.string.analytics_insights))
        val peak = day?.maxByOrNull { it.kwh }?.takeIf { it.kwh > 0 }
        // Days before today that recorded anything: an empty day means "not measured yet", not "used nothing".
        val earlier = week.orEmpty().dropLast(1).filter { it.kwh > 0 }
        val average = if (earlier.isEmpty()) null else earlier.sumOf { it.kwh } / earlier.size
        val change = average?.let { (overview.todayKwh - it) / it * 100 }
        val top = overview.devices.maxByOrNull { it.kwh }?.takeIf { it.kwh > 0 }
        FactRow(
            Triple(stringResource(R.string.analytics_peak_hour), peak?.let { formatBucket(it.t, "hour", is24Hour) } ?: "—", peak?.let { stringResource(R.string.analytics_peak_last_24h, formatKwh(it.kwh)) } ?: stringResource(R.string.analytics_no_usage_yet)),
            Triple(stringResource(R.string.analytics_daily_average), average?.let(::formatKwh) ?: "—", if (average == null) stringResource(R.string.analytics_needs_full_day) else pluralStringResource(R.plurals.analytics_over_last_days, earlier.size, earlier.size)),
            index = 2,
        )
        FactRow(
            Triple(
                stringResource(R.string.analytics_today_vs_average), change?.let { "${if (it > 0) "+" else ""}${it.roundToInt()}%" } ?: "—",
                stringResource(when { change == null -> R.string.analytics_needs_full_day; change > 10 -> R.string.analytics_above_usual_day; change < -10 -> R.string.analytics_below_usual_day; else -> R.string.analytics_about_usual_day }),
            ),
            Triple(stringResource(R.string.analytics_top_device), top?.let { "${(it.kwh / overview.cycleKwh.coerceAtLeast(0.0001) * 100).roundToInt()}%" } ?: "—", top?.name ?: stringResource(R.string.analytics_no_metered_device)),
            index = 3,
        )

        SectionTitle(stringResource(R.string.analytics_billing_cycle))
        ChartCard {
            val elapsed = overview.cycleDay.toFloat() / overview.cycleDays.coerceAtLeast(1)
            Row { Text(stringResource(R.string.analytics_time_elapsed), Modifier.weight(1f)); Text(stringResource(R.string.analytics_day_of_days, overview.cycleDay, overview.cycleDays), color = c.onSurfaceVariant) }
            LinearProgressIndicator(progress = { elapsed.coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
            val budget = overview.settings.monthlyBudget
            val used = overview.budgetUsedPercent
            if (budget != null && used != null) {
                val ahead = used / 100 > elapsed + 0.1
                Row { Text(stringResource(R.string.analytics_budget_used), Modifier.weight(1f)); Text(stringResource(R.string.analytics_cost_of_budget, formatMoney(overview.cycleCost, currency), formatMoney(budget, currency)), color = c.onSurfaceVariant) }
                LinearWavyProgressIndicator(progress = { (used / 100).toFloat().coerceIn(0f, 1f) }, color = if (ahead) c.error else c.primary, modifier = Modifier.fillMaxWidth())
                if (ahead) Text(stringResource(R.string.analytics_spending_ahead), color = c.error, style = MaterialTheme.typography.bodyMedium)
            } else {
                Text(stringResource(R.string.analytics_budget_hint), style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
            }
        }
    }

    // A wide screen reads the figures on the start side and keeps the charts beside them.
    if (LocalWideScreen.current) SideBySide({ summary(); insights() }, history) else { summary(); history(); insights() }

    overview.solar?.let { solar ->
        SectionTitle(stringResource(R.string.analytics_solar))
        Surface(color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                listOfNotNull(
                    stringResource(R.string.analytics_solar_now) to formatWatts(solar.watts),
                    stringResource(R.string.analytics_solar_generated) to formatKwh(solar.cycle.generatedKwh),
                    stringResource(R.string.analytics_solar_self_used) to formatKwh(solar.cycle.selfUsedKwh),
                    stringResource(R.string.analytics_solar_exported) to formatKwh(solar.cycle.exportedKwh),
                    if (overview.settings.exportMode == "feed_in") stringResource(R.string.analytics_solar_earned) to formatMoney(solar.cycleCredit, currency)
                    else stringResource(R.string.analytics_solar_imported) to formatKwh(solar.cycle.importedKwh),
                ).forEach { (label, value) ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                        RollingText(value, MaterialTheme.typography.titleMedium)
                    }
                }
                Text(stringResource(R.string.analytics_solar_hint), style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant)
            }
        }
    }

    if (overview.devices.isNotEmpty()) SectionTitle(stringResource(R.string.analytics_by_device))
    val most = overview.devices.maxOfOrNull { it.kwh }?.takeIf { it > 0 } ?: 1.0
    overview.devices.sortedByDescending { it.kwh }.forEachIndexed { index, device ->
        Surface(color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth().enterStaggered(4 + index)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(device.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    RollingText(formatWatts(device.watts), MaterialTheme.typography.titleMedium)
                }
                LinearProgressIndicator(progress = { (device.kwh / most).toFloat().coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
                Text(stringResource(R.string.analytics_device_cycle_summary, formatKwh(device.kwh), formatMoney(device.cost, currency)), style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                // The least it drew in any hour this week: what it costs even when nobody uses it.
                if (device.standbyWatts != null) Text(
                    stringResource(R.string.analytics_standby, formatWatts(device.standbyWatts), formatMoney(device.standbyMonthlyCost ?: 0.0, currency)),
                    style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant,
                )
            }
        }
    }
}

private val Readings = listOf("pm25" to R.string.analytics_reading_pm25, "temperature" to R.string.analytics_reading_temperature, "humidity" to R.string.analytics_reading_humidity)
private fun AirPoint.reading(key: String) = when (key) { "temperature" -> temperature; "humidity" -> humidity; else -> pm25 }
@Composable
private fun readingText(key: String, value: Double?) = when {
    value == null -> stringResource(R.string.analytics_no_reading)
    key == "temperature" -> "${"%.1f".format(value)} °C"
    key == "humidity" -> "${value.roundToInt()}%"
    else -> "${value.roundToInt()} µg/m³"
}

/** WHO scale as four segments with a marker at [pm]. The level is also written out, never color alone. */
@Composable
private fun AirScale(pm: Float, modifier: Modifier = Modifier) {
    val c = MaterialTheme.colorScheme
    val colors = listOf(c.primary, c.primary.copy(alpha = 0.6f), c.tertiary, c.error)
    val limits = listOf(0f, 12f, 35f, 55f, 80f)
    Canvas(modifier.height(20.dp)) {
        val gap = 4.dp.toPx()
        val width = (size.width - gap * 3) / 4
        val bar = 8.dp.toPx()
        repeat(4) { i -> drawRoundRect(colors[i], Offset((width + gap) * i, size.height - bar), Size(width, bar), CornerRadius(bar / 2)) }
        // Position inside the level's own segment, so equal widths don't distort where the reading sits.
        val level = (1..4).firstOrNull { pm <= limits[it] } ?: 4
        val within = ((pm - limits[level - 1]) / (limits[level] - limits[level - 1])).coerceIn(0f, 1f)
        val x = (width + gap) * (level - 1) + width * within
        drawCircle(c.surface, 9.dp.toPx(), Offset(x, size.height - bar / 2))
        drawCircle(c.onSurface, 6.dp.toPx(), Offset(x, size.height - bar / 2))
    }
}

@Composable
private fun ColumnScope.AirSection(user: User, onOpenDevice: (String) -> Unit) {
    val repository = LocalRepository.current
    val devices by repository.devices.collectAsStateWithLifecycle()
    val rooms by repository.rooms.collectAsStateWithLifecycle()
    val is24Hour = rememberIs24HourFormat()
    val c = MaterialTheme.colorScheme
    val sensors = devices.filter { it.type == "air_purifier" || it.state.pm25 != null }
    val purifiers = sensors.filter { it.type == "air_purifier" }
    // The worst room decides how the home's air is described.
    val pm = sensors.filter { it.isOnline }.mapNotNull { it.state.pm25 }.maxOrNull()
    var range by rememberSaveable { mutableStateOf("day") }
    var reading by rememberSaveable { mutableStateOf("pm25") }
    var history by remember { mutableStateOf<List<AirPoint>?>(null) }
    LaunchedEffect(range, pm?.roundToInt()) { if (range != "live") history = repository.request { it.airHistory(range) } ?: history ?: emptyList() }
    var hours by remember { mutableStateOf<List<AirPoint>?>(null) }
    LaunchedEffect(pm?.roundToInt()) { hours = repository.request { it.airHistory("hours") } ?: hours ?: emptyList() }
    // Devices compared line by line, and each one's history for the range shown.
    var compared by rememberSaveable { mutableStateOf(listOf<String>()) }
    var perDevice by remember { mutableStateOf<Map<String, List<AirPoint>>>(emptyMap()) }
    LaunchedEffect(range, compared, pm?.roundToInt()) {
        if (range != "live") perDevice = compared.associateWith { id -> repository.request { it.airHistory(range, id) } ?: perDevice[id].orEmpty() }
    }

    val level = pm?.let(::airLevel)
    val (tone, onTone) = when (level) {
        AirLevel.POOR -> c.errorContainer to c.onErrorContainer
        AirLevel.MODERATE -> c.tertiaryContainer to c.onTertiaryContainer
        else -> c.primaryContainer to c.onPrimaryContainer
    }
    val airNow: @Composable ColumnScope.() -> Unit = {
        Surface(color = tone, contentColor = onTone, shape = MaterialTheme.shapes.extraLarge, modifier = Modifier.fillMaxWidth().enterStaggered(0)) {
            Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(stringResource(R.string.analytics_pm25_now), style = MaterialTheme.typography.labelLarge)
                Row(verticalAlignment = Alignment.Bottom) {
                    RollingText(pm?.roundToInt()?.toString() ?: "—", MaterialTheme.typography.displayMedium)
                    Text(" µg/m³", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 8.dp))
                }
                Text(
                    stringResource(
                        when (level) {
                            null -> R.string.analytics_air_no_sensor_online
                            AirLevel.EXCELLENT -> R.string.analytics_air_status_excellent
                            AirLevel.GOOD -> R.string.analytics_air_status_good
                            AirLevel.MODERATE -> R.string.analytics_air_status_moderate
                            AirLevel.POOR -> R.string.analytics_air_status_poor
                        }
                    ),
                    style = MaterialTheme.typography.bodyLarge,
                )
                if (pm != null) {
                    AirScale(pm, Modifier.fillMaxWidth().padding(top = 12.dp))
                    Row { AirLevel.entries.forEach { Text(it.text(), Modifier.weight(1f), style = MaterialTheme.typography.labelSmall) } }
                }
            }
        }
    }

    val running = purifiers.count { it.isOnline && it.state.isOn == true }
    val filter = purifiers.mapNotNull { it.state.filterLife }.takeIf { it.isNotEmpty() }?.average()
    val temperature = sensors.mapNotNull { it.state.temperature }.takeIf { it.isNotEmpty() }?.average()
    val humidity = sensors.mapNotNull { it.state.humidity }.takeIf { it.isNotEmpty() }?.average()
    val facts = listOfNotNull(
        if (purifiers.isNotEmpty()) Triple(stringResource(R.string.analytics_purifiers), stringResource(R.string.analytics_running_of_total, running, purifiers.size), stringResource(if (running == 0) R.string.analytics_all_on_standby else R.string.analytics_running_now)) else null,
        filter?.let { Triple(stringResource(R.string.analytics_filter_life), "${it.roundToInt()}%", stringResource(if (it < 15) R.string.analytics_filter_replace_soon else R.string.analytics_filter_healthy)) },
        temperature?.let { Triple(stringResource(R.string.analytics_reading_temperature), "${"%.1f".format(it)} °C", stringResource(R.string.analytics_sensors_average)) },
        humidity?.let { Triple(stringResource(R.string.analytics_reading_humidity), "${it.roundToInt()}%", stringResource(if (it < 30) R.string.analytics_humidity_dry else if (it > 60) R.string.analytics_humidity_humid else R.string.analytics_humidity_comfortable)) },
    )
    val factRows: @Composable ColumnScope.() -> Unit = { facts.chunked(2).forEachIndexed { i, pair -> FactRow(*pair.toTypedArray(), index = 1 + i) } }

    val live = rememberLive { AirPoint(it, pm?.toDouble(), temperature, humidity) }
    val liveByDevice = rememberLive { t -> t to sensors.filter { it.isOnline }.associate { d -> d.id to AirPoint(t, d.state.pm25?.toDouble(), d.state.temperature?.toDouble(), d.state.humidity?.toDouble()) } }
    val points = if (range == "live") live else history
    // Offer only the readings the home's devices report.
    val available = Readings.filter { (key, _) -> key == "pm25" || points.orEmpty().any { it.reading(key) != null } }
    val shown = if (available.any { it.first == reading }) reading else "pm25"
    val trend: @Composable ColumnScope.() -> Unit = {
        SectionTitle(stringResource(R.string.analytics_trend))
        RangePicker(range, Ranges) { range = it }
        if (available.size > 1) Choice(available.map { it.first to stringResource(it.second) }, shown, { reading = it })
        DevicePicker(sensors.map { it.id to it.name }, compared) { compared = it }
        if (compared.isNotEmpty()) ChartCard {
            val isLive = range == "live"
            if (!isLive && compared.any { it !in perDevice }) LoadingIndicator(Modifier.align(Alignment.CenterHorizontally))
            else CompareChart(
                names = compared.map { id -> sensors.firstOrNull { it.id == id }?.name ?: "—" },
                series = compared.map { id -> if (isLive) liveByDevice.map { it.second[id]?.reading(shown) } else perDevice[id].orEmpty().map { it.reading(shown) } },
                times = if (isLive) liveByDevice.map { it.first } else perDevice[compared.first()].orEmpty().map { it.t },
                range = range,
                empty = stringResource(R.string.analytics_no_air_history),
            ) { readingText(shown, it) }
        } else ChartCard {
            if (points == null) LoadingIndicator(Modifier.align(Alignment.CenterHorizontally))
            else if (points.none { it.reading(shown) != null }) Text(stringResource(R.string.analytics_no_air_history), color = c.onSurfaceVariant)
            else {
                var picked by remember(range, shown) { mutableStateOf<Int?>(null) }
                val selected = (picked ?: points.indexOfLast { it.reading(shown) != null }).coerceIn(0, points.lastIndex)
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(formatBucket(points[selected].t, range, is24Hour), style = MaterialTheme.typography.labelLarge, color = c.onSurfaceVariant, modifier = Modifier.weight(1f))
                    val text = readingText(shown, points[selected].reading(shown))
                    RollingText(points[selected].pm25Max?.takeIf { shown == "pm25" }?.let { stringResource(R.string.analytics_value_with_peak, text, readingText(shown, it)) } ?: text, MaterialTheme.typography.titleMedium)
                }
                val measured = points.mapNotNull { it.reading(shown) }
                LineChart(
                    points.map { it.reading(shown) }, selected, { picked = it },
                    stringResource(R.string.analytics_air_chart_summary, stringResource(Readings.first { it.first == shown }.second), bucketOf(range), readingText(shown, measured.average())),
                    Modifier.fillMaxWidth().height(160.dp),
                    marks = if (shown == "pm25") listOf(15.0, 35.0) else emptyList(),
                    peaks = if (shown == "pm25") points.map { it.pm25Max } else emptyList(),
                )
                ChartAxis(formatBucket(points.first().t, range, is24Hour), formatBucket(points.last().t, range, is24Hour))
                if (shown == "pm25") Text(stringResource(R.string.analytics_pm25_dashed_caption), style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant)
            }
        }
    }

    val measuredPm = points.orEmpty().filter { it.pm25 != null }
    val airInsights: @Composable ColumnScope.() -> Unit = {
        if (measuredPm.isNotEmpty()) {
            SectionTitle(stringResource(R.string.analytics_insights))
            val average = measuredPm.map { it.pm25!! }.average()
            // The highest single reading, not the highest average: a short spike counts.
            val peak = measuredPm.maxBy { it.pm25Max ?: it.pm25!! }
            // Samples per level over the period. A live sample is one reading at its own level.
            val levels = IntArray(AirLevel.entries.size)
            measuredPm.forEach { p -> if (p.levels.size == levels.size) p.levels.forEachIndexed { i, n -> levels[i] += n } else levels[airLevel(p.pm25!!.toFloat()).ordinal]++ }
            val samples = levels.sum().coerceAtLeast(1)
            val good = (levels[0] + levels[1]) * 100 / samples
            val period = stringResource(when (range) { "live" -> R.string.analytics_period_5m; "hour" -> R.string.analytics_period_60m; "day" -> R.string.analytics_period_24h; "week" -> R.string.analytics_period_7d; else -> R.string.analytics_period_30d })
            FactRow(
                Triple(stringResource(R.string.analytics_average), "${average.roundToInt()} µg/m³", stringResource(R.string.analytics_air_level_over_period, airLevel(average.toFloat()).text(), period)),
                Triple(stringResource(R.string.analytics_peak), "${(peak.pm25Max ?: peak.pm25!!).roundToInt()} µg/m³", formatBucket(peak.t, range, is24Hour)),
                index = 3,
            )
            FactRow(Triple(stringResource(R.string.analytics_time_good_air), "$good%", stringResource(R.string.analytics_pm25_good_over_period, period)), index = 4)

            SectionTitle(stringResource(R.string.analytics_time_at_each_level))
            ChartCard {
                // The same colors as the scale above; each share is also written out below.
                val colors = listOf(c.primary, c.primary.copy(alpha = 0.6f), c.tertiary, c.error)
                Row(Modifier.fillMaxWidth().height(8.dp).clip(CircleShape), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    levels.forEachIndexed { i, n -> if (n > 0) Box(Modifier.weight(n.toFloat()).fillMaxHeight().background(colors[i])) }
                }
                AirLevel.entries.forEachIndexed { i, level ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(Modifier.size(8.dp).background(colors[i], CircleShape))
                        Text(level.text(), Modifier.weight(1f))
                        Text("${levels[i] * 100 / samples}%", color = c.onSurfaceVariant)
                    }
                }
            }
        }
    }

    val byHour: @Composable ColumnScope.() -> Unit = {
        HourGridCard(
            stringResource(R.string.analytics_peak_pm25_by_hour), hours, { it.t }, { it.pm25Max ?: it.pm25 }, { readingText("pm25", it) },
            { when (airLevel(it.toFloat())) { AirLevel.POOR -> c.error; AirLevel.MODERATE -> c.tertiary; else -> c.primary } },
            stringResource(R.string.analytics_no_air_history),
        )
    }

    if (LocalWideScreen.current) SideBySide({ airNow(); factRows(); airInsights() }, { trend(); byHour() })
    else { airNow(); factRows(); trend(); airInsights(); byHour() }

    if (purifiers.isNotEmpty()) {
        SectionTitle(stringResource(R.string.analytics_purifiers))
        DeviceGrid(purifiers, user.canControl, onOpenDevice, firstIndex = 5)
    }
    val others = sensors - purifiers.toSet()
    if (others.isNotEmpty()) {
        SectionTitle(stringResource(R.string.analytics_sensors))
        others.forEach { sensor ->
            val value = sensor.state.pm25
            RowCard(
                sensor.name,
                listOfNotNull(rooms.firstOrNull { it.id == sensor.roomId }?.name, if (!sensor.isOnline) stringResource(R.string.analytics_offline) else value?.let { stringResource(R.string.analytics_sensor_pm25_level, it.roundToInt(), airLevel(it).text()) }).joinToString(" · "),
                Icons.Rounded.Sensors, onClick = { onOpenDevice(sensor.id) },
            )
        }
    }
}
