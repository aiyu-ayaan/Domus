package com.aiyu.domus

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Air
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.DateRange
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
import com.aiyu.domus.ui.components.RollingText
import com.aiyu.domus.ui.components.ScreenColumn
import com.aiyu.domus.ui.components.ScreenHeader
import com.aiyu.domus.ui.components.SectionTitle
import com.aiyu.domus.ui.components.enterStaggered
import kotlin.math.roundToInt

/** Does the home measure power / air? The Analytics tab and its two sections exist only for what it does. */
fun List<Device>.measuresPower() = any { it.state.watts != null || it.state.todayKwh != null }
fun List<Device>.measuresAir() = any { it.type == "air_purifier" || it.state.pm25 != null }

// "hour" is the last 60 minutes, one bucket a minute. Air is sampled too coarsely for it.
private val Ranges = listOf(
    Triple("hour", "Hour", Icons.Rounded.Schedule),
    Triple("day", "Day", Icons.Rounded.Today),
    Triple("week", "Week", Icons.Rounded.DateRange),
    Triple("month", "Month", Icons.Rounded.CalendarMonth),
)
/** What one bucket of [range] covers. */
private fun bucketOf(range: String) = when (range) { "hour" -> "minute"; "day" -> "hour"; else -> "day" }

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
private fun RangePicker(range: String, ranges: List<Triple<String, String, ImageVector>>, onChange: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(ButtonGroupDefaults.ConnectedSpaceBetween)) {
        ranges.forEachIndexed { index, (key, label, icon) ->
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
        ScreenHeader("Analytics", if (shown == "power") "Power use and cost" else "Air health and purifiers") {
            if (shown == "power" && user.isAdmin) FilledTonalIconButton(onEditTariff) { Icon(Icons.Rounded.Payments, "Electricity tariff") }
        }
        if (power && air) {
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                SegmentedButton(shown == "power", { section = "power" }, SegmentedButtonDefaults.itemShape(0, 2), icon = { Icon(Icons.Rounded.Bolt, null, Modifier.size(18.dp)) }) { Text("Electricity") }
                SegmentedButton(shown == "air", { section = "air" }, SegmentedButtonDefaults.itemShape(1, 2), icon = { Icon(Icons.Rounded.Air, null, Modifier.size(18.dp)) }) { Text("Air quality") }
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
    LaunchedEffect(energy?.todayKwh) {
        day = repository.energyHistory("day")
        week = repository.energyHistory("week")
    }
    LaunchedEffect(range, energy?.todayKwh) {
        if (range == "month") month = repository.energyHistory("month")
        if (range == "hour") hour = repository.energyHistory("hour")
    }
    val c = MaterialTheme.colorScheme

    val overview = energy
    if (overview == null) {
        if (loading) LoadingIndicator(Modifier.align(Alignment.CenterHorizontally).padding(top = 48.dp))
        else EmptyState("No energy data yet", "Readings appear a minute after a metering plug or switch comes online.")
        return
    }
    val currency = overview.settings.currency

    val liveWatts = devices.filter { it.isOnline }.mapNotNull { it.state.watts }.sum().toDouble()
    val wattsToDisplay = if (devices.any { it.isOnline && it.state.watts != null }) liveWatts else overview.watts

    Surface(color = c.primaryContainer, contentColor = c.onPrimaryContainer, shape = MaterialTheme.shapes.extraLarge, modifier = Modifier.fillMaxWidth().enterStaggered(0)) {
        Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Using now", style = MaterialTheme.typography.labelLarge)
            RollingText(formatWatts(wattsToDisplay), MaterialTheme.typography.displayMedium)
            Text("On track for ${formatMoney(overview.projectedCost, currency)} this billing cycle", style = MaterialTheme.typography.bodyMedium)
        }
    }
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).enterStaggered(1), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        StatCard("Today", formatKwh(overview.todayKwh), formatMoney(overview.todayCost, currency), Icons.Rounded.Today, MaterialShapes.Clover4Leaf, c.secondaryContainer, c.onSecondaryContainer, Modifier.weight(1f).fillMaxHeight(), info = "Energy used since midnight. The amount below it is the estimated cost at your electricity rate.")
        StatCard("This cycle", formatKwh(overview.cycleKwh), formatMoney(overview.cycleCost, currency), Icons.Rounded.CalendarMonth, MaterialShapes.Cookie9Sided, c.tertiaryContainer, c.onTertiaryContainer, Modifier.weight(1f).fillMaxHeight(), info = "Energy used and estimated bill so far in the current billing cycle.")
    }

    SectionTitle("History")
    RangePicker(range, Ranges) { range = it }
    ChartCard {
        val points = when (range) { "hour" -> hour; "day" -> day; "week" -> week; else -> month }
        if (points == null) LoadingIndicator(Modifier.align(Alignment.CenterHorizontally))
        else if (points.sumOf { it.kwh } <= 0) Text("Nothing recorded in this period yet.", color = c.onSurfaceVariant)
        else {
            // Starts on the latest bucket; a tap or drag picks another.
            var picked by remember(range) { mutableStateOf<Int?>(null) }
            var watts by remember { mutableStateOf(false) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(!watts, { watts = false }, { Text("Energy") })
                FilterChip(watts, { watts = true }, { Text("Power") })
            }
            // Power starts on the latest measured bucket.
            val selected = (picked ?: if (watts) points.indexOfLast { it.watts != null } else points.lastIndex).coerceIn(0, points.lastIndex)
            val point = points[selected]
            Row(verticalAlignment = Alignment.Bottom) {
                Text(formatBucket(point.t, range, is24Hour), style = MaterialTheme.typography.labelLarge, color = c.onSurfaceVariant, modifier = Modifier.weight(1f))
                RollingText(if (watts) point.watts?.let(::formatWatts) ?: "No reading" else "${formatKwh(point.kwh)} · ${formatMoney(point.cost, currency)}", MaterialTheme.typography.titleMedium)
            }
            val per = bucketOf(range)
            if (watts) LineChart(points.map { it.watts }, selected, { picked = it }, "Average power per $per", Modifier.fillMaxWidth().height(160.dp))
            else BarChart(points.map { it.kwh }, selected, { picked = it }, "Energy used per $per, ${formatKwh(points.sumOf { it.kwh })} in total", Modifier.fillMaxWidth().height(160.dp))
            ChartAxis(formatBucket(points.first().t, range, is24Hour), formatBucket(points.last().t, range, is24Hour))
            Text("Total ${formatKwh(points.sumOf { it.kwh })} · ${formatMoney(points.sumOf { it.cost }, currency)}", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
        }
    }

    SectionTitle("Insights")
    val peak = day?.maxByOrNull { it.kwh }?.takeIf { it.kwh > 0 }
    // Days before today that recorded anything: an empty day means "not measured yet", not "used nothing".
    val earlier = week.orEmpty().dropLast(1).filter { it.kwh > 0 }
    val average = if (earlier.isEmpty()) null else earlier.sumOf { it.kwh } / earlier.size
    val change = average?.let { (overview.todayKwh - it) / it * 100 }
    val top = overview.devices.maxByOrNull { it.kwh }?.takeIf { it.kwh > 0 }
    FactRow(
        Triple("Peak hour", peak?.let { formatBucket(it.t, "hour", is24Hour) } ?: "—", peak?.let { "${formatKwh(it.kwh)} in the last 24 h" } ?: "No usage yet"),
        Triple("Daily average", average?.let(::formatKwh) ?: "—", if (average == null) "Needs a full day" else "Over the last ${earlier.size} ${if (earlier.size == 1) "day" else "days"}"),
        index = 2,
    )
    FactRow(
        Triple(
            "Today vs average", change?.let { "${if (it > 0) "+" else ""}${it.roundToInt()}%" } ?: "—",
            when { change == null -> "Needs a full day"; change > 10 -> "Above your usual day"; change < -10 -> "Below your usual day"; else -> "About your usual day" },
        ),
        Triple("Top device", top?.let { "${(it.kwh / overview.cycleKwh.coerceAtLeast(0.0001) * 100).roundToInt()}%" } ?: "—", top?.name ?: "No metered device"),
        index = 3,
    )

    SectionTitle("Billing cycle")
    ChartCard {
        val elapsed = overview.cycleDay.toFloat() / overview.cycleDays.coerceAtLeast(1)
        Row { Text("Time elapsed", Modifier.weight(1f)); Text("Day ${overview.cycleDay} of ${overview.cycleDays}", color = c.onSurfaceVariant) }
        LinearProgressIndicator(progress = { elapsed.coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
        val budget = overview.settings.monthlyBudget
        val used = overview.budgetUsedPercent
        if (budget != null && used != null) {
            val ahead = used / 100 > elapsed + 0.1
            Row { Text("Budget used", Modifier.weight(1f)); Text("${formatMoney(overview.cycleCost, currency)} of ${formatMoney(budget, currency)}", color = c.onSurfaceVariant) }
            LinearWavyProgressIndicator(progress = { (used / 100).toFloat().coerceIn(0f, 1f) }, color = if (ahead) c.error else c.primary, modifier = Modifier.fillMaxWidth())
            if (ahead) Text("Spending is ahead of the calendar.", color = c.error, style = MaterialTheme.typography.bodyMedium)
        } else {
            Text("Set a monthly budget in the tariff to track spending against it.", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
        }
    }

    if (overview.devices.isNotEmpty()) SectionTitle("By device")
    val most = overview.devices.maxOfOrNull { it.kwh }?.takeIf { it > 0 } ?: 1.0
    overview.devices.sortedByDescending { it.kwh }.forEachIndexed { index, device ->
        Surface(color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth().enterStaggered(4 + index)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(device.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    RollingText(formatWatts(device.watts), MaterialTheme.typography.titleMedium)
                }
                LinearProgressIndicator(progress = { (device.kwh / most).toFloat().coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
                Text("${formatKwh(device.kwh)} · ${formatMoney(device.cost, currency)} this cycle", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
            }
        }
    }
}

private val Readings = listOf("pm25" to "PM2.5", "temperature" to "Temperature", "humidity" to "Humidity")
private fun AirPoint.reading(key: String) = when (key) { "temperature" -> temperature; "humidity" -> humidity; else -> pm25 }
private fun readingText(key: String, value: Double?) = when {
    value == null -> "No reading"
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
    LaunchedEffect(range, pm?.roundToInt()) { history = repository.request { it.airHistory(range) } ?: history ?: emptyList() }

    val level = pm?.let(::airLevel)
    val (tone, onTone) = when (level) {
        AirLevel.POOR -> c.errorContainer to c.onErrorContainer
        AirLevel.MODERATE -> c.tertiaryContainer to c.onTertiaryContainer
        else -> c.primaryContainer to c.onPrimaryContainer
    }
    Surface(color = tone, contentColor = onTone, shape = MaterialTheme.shapes.extraLarge, modifier = Modifier.fillMaxWidth().enterStaggered(0)) {
        Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("PM2.5 now", style = MaterialTheme.typography.labelLarge)
            Row(verticalAlignment = Alignment.Bottom) {
                RollingText(pm?.roundToInt()?.toString() ?: "—", MaterialTheme.typography.displayMedium)
                Text(" µg/m³", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 8.dp))
            }
            Text(
                when (level) {
                    null -> "No sensor is online"
                    AirLevel.EXCELLENT -> "Excellent · clean indoor air"
                    AirLevel.GOOD -> "Good · within the healthy range"
                    AirLevel.MODERATE -> "Moderate · run a purifier or air the room"
                    AirLevel.POOR -> "Poor · run purifiers on high and keep windows shut"
                },
                style = MaterialTheme.typography.bodyLarge,
            )
            if (pm != null) {
                AirScale(pm, Modifier.fillMaxWidth().padding(top = 12.dp))
                Row { listOf("Excellent", "Good", "Moderate", "Poor").forEach { Text(it, Modifier.weight(1f), style = MaterialTheme.typography.labelSmall) } }
            }
        }
    }

    val running = purifiers.count { it.isOnline && it.state.isOn == true }
    val filter = purifiers.mapNotNull { it.state.filterLife }.takeIf { it.isNotEmpty() }?.average()
    val temperature = sensors.mapNotNull { it.state.temperature }.takeIf { it.isNotEmpty() }?.average()
    val humidity = sensors.mapNotNull { it.state.humidity }.takeIf { it.isNotEmpty() }?.average()
    val facts = listOfNotNull(
        if (purifiers.isNotEmpty()) Triple("Purifiers", "$running of ${purifiers.size}", if (running == 0) "All on standby" else "Running now") else null,
        filter?.let { Triple("Filter life", "${it.roundToInt()}%", if (it < 15) "Replace soon" else "Healthy") },
        temperature?.let { Triple("Temperature", "${"%.1f".format(it)} °C", "Average of your sensors") },
        humidity?.let { Triple("Humidity", "${it.roundToInt()}%", if (it < 30) "Dry" else if (it > 60) "Humid" else "Comfortable") },
    )
    facts.chunked(2).forEachIndexed { i, pair -> FactRow(*pair.toTypedArray(), index = 1 + i) }

    SectionTitle("Trend")
    RangePicker(range, Ranges.drop(1)) { range = it }
    val points = history
    // Offer only the readings the home's devices report.
    val available = Readings.filter { (key, _) -> key == "pm25" || points.orEmpty().any { it.reading(key) != null } }
    val shown = if (available.any { it.first == reading }) reading else "pm25"
    if (available.size > 1) Choice(available, shown, { reading = it })
    ChartCard {
        if (points == null) LoadingIndicator(Modifier.align(Alignment.CenterHorizontally))
        else if (points.none { it.reading(shown) != null }) Text("No history yet. Readings are recorded every few minutes while a sensor is online.", color = c.onSurfaceVariant)
        else {
            var picked by remember(range, shown) { mutableStateOf<Int?>(null) }
            val selected = (picked ?: points.indexOfLast { it.reading(shown) != null }).coerceIn(0, points.lastIndex)
            Row(verticalAlignment = Alignment.Bottom) {
                Text(formatBucket(points[selected].t, range, is24Hour), style = MaterialTheme.typography.labelLarge, color = c.onSurfaceVariant, modifier = Modifier.weight(1f))
                RollingText(readingText(shown, points[selected].reading(shown)), MaterialTheme.typography.titleMedium)
            }
            val measured = points.mapNotNull { it.reading(shown) }
            LineChart(
                points.map { it.reading(shown) }, selected, { picked = it },
                "${Readings.first { it.first == shown }.second} per ${bucketOf(range)}, average ${readingText(shown, measured.average())}",
                Modifier.fillMaxWidth().height(160.dp),
                marks = if (shown == "pm25") listOf(15.0, 35.0) else emptyList(),
            )
            ChartAxis(formatBucket(points.first().t, range, is24Hour), formatBucket(points.last().t, range, is24Hour))
            if (shown == "pm25") Text("Dashed lines: 15 µg/m³ clean-air target, 35 µg/m³ upper limit of good.", style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant)
        }
    }

    val measuredPm = points.orEmpty().filter { it.pm25 != null }
    if (measuredPm.isNotEmpty()) {
        SectionTitle("Insights")
        val average = measuredPm.map { it.pm25!! }.average()
        val peak = measuredPm.maxBy { it.pm25!! }
        val good = measuredPm.count { it.pm25!! <= 35 } * 100 / measuredPm.size
        val period = when (range) { "day" -> "24 h"; "week" -> "7 days"; else -> "30 days" }
        FactRow(
            Triple("Average", "${average.roundToInt()} µg/m³", "${airLevel(average.toFloat()).label} over $period"),
            Triple("Peak", "${peak.pm25!!.roundToInt()} µg/m³", formatBucket(peak.t, range, is24Hour)),
            index = 3,
        )
        FactRow(Triple("Time with good air", "$good%", "PM2.5 at or below 35 µg/m³ over $period"), index = 4)
    }

    if (purifiers.isNotEmpty()) {
        SectionTitle("Purifiers")
        DeviceGrid(purifiers, user.canControl, onOpenDevice, firstIndex = 5)
    }
    val others = sensors - purifiers.toSet()
    if (others.isNotEmpty()) {
        SectionTitle("Sensors")
        others.forEach { sensor ->
            val value = sensor.state.pm25
            RowCard(
                sensor.name,
                listOfNotNull(rooms.firstOrNull { it.id == sensor.roomId }?.name, if (!sensor.isOnline) "Offline" else value?.let { "${it.roundToInt()} µg/m³ · ${airLevel(it).label}" }).joinToString(" · "),
                Icons.Rounded.Sensors, onClick = { onOpenDevice(sensor.id) },
            )
        }
    }
}
