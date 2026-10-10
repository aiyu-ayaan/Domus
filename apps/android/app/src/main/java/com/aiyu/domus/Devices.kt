package com.aiyu.domus

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Air
import androidx.compose.material.icons.rounded.Blinds
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.DevicesOther
import androidx.compose.material.icons.rounded.Lightbulb
import androidx.compose.material.icons.rounded.Power
import androidx.compose.material.icons.rounded.PowerSettingsNew
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Sensors
import androidx.compose.material.icons.rounded.Thermostat
import androidx.compose.material.icons.rounded.ToggleOn
import androidx.compose.material.icons.rounded.Toys
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.MaterialShapes
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.ToggleButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aiyu.domus.core.Device
import com.aiyu.domus.core.DeviceCommand
import com.aiyu.domus.core.Room
import com.aiyu.domus.core.airLevel
import com.aiyu.domus.core.formatKwh
import com.aiyu.domus.core.formatWatts
import com.aiyu.domus.ui.components.RollingText
import com.aiyu.domus.ui.components.ScreenColumn
import com.aiyu.domus.ui.components.ScreenHeader
import com.aiyu.domus.ui.components.SectionTitle
import com.aiyu.domus.ui.components.ShapedIcon
import com.aiyu.domus.ui.components.enterStaggered
import com.aiyu.domus.ui.components.pressScale
import kotlin.math.roundToInt

fun deviceIcon(type: String): ImageVector = when (type) {
    "light" -> Icons.Rounded.Lightbulb
    "plug" -> Icons.Rounded.Power
    "switch" -> Icons.Rounded.ToggleOn
    "air_purifier" -> Icons.Rounded.Air
    "fan" -> Icons.Rounded.Toys
    "sensor" -> Icons.Rounded.Sensors
    "climate" -> Icons.Rounded.Thermostat
    "cover" -> Icons.Rounded.Blinds
    else -> Icons.Rounded.DevicesOther
}

/** The one line under a device's name: the most useful live reading it has. */
fun deviceStatus(device: Device): String {
    val s = device.state
    if (!device.isOnline) return "Offline"
    val on = s.isOn != false
    return when {
        on && s.watts != null -> formatWatts(s.watts!!.toDouble())
        on && s.brightness != null -> "${s.brightness}%"
        s.pm25 != null -> "PM2.5 ${s.pm25!!.roundToInt()} · ${airLevel(s.pm25!!).label}"
        s.temperature != null -> "${s.temperature!!.roundToInt()}°"
        s.isOn != null -> if (on) "On" else "Off"
        else -> "Online"
    }
}

/** Device card: lights up and rounds off while on. Tap opens the controls, the switch toggles in place. */
@Composable
fun DeviceTile(device: Device, canControl: Boolean, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val repository = LocalRepository.current
    val c = MaterialTheme.colorScheme
    val motion = MaterialTheme.motionScheme
    val on = device.isOnline && device.state.isOn == true
    val container by animateColorAsState(if (on) c.primaryContainer else c.surfaceContainerHigh, motion.defaultEffectsSpec(), label = "tile")
    val content by animateColorAsState(if (on) c.onPrimaryContainer else c.onSurface, motion.defaultEffectsSpec(), label = "tileContent")
    val corner by animateDpAsState(if (on) 36.dp else 20.dp, motion.defaultSpatialSpec(), label = "tileCorner")
    val source = remember { MutableInteractionSource() }
    Card(
        onClick = onOpen,
        shape = RoundedCornerShape(corner.coerceAtLeast(0.dp)), // the spring can undershoot
        colors = CardDefaults.cardColors(containerColor = container, contentColor = content),
        interactionSource = source,
        modifier = modifier.pressScale(source),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(deviceIcon(device.type), contentDescription = null, modifier = Modifier.size(28.dp))
                Spacer(Modifier.weight(1f))
                device.state.isOn?.let { isOn ->
                    Switch(
                        checked = isOn,
                        onCheckedChange = { repository.command(device, DeviceCommand(isOn = it)) },
                        enabled = canControl && device.isOnline,
                        modifier = Modifier.semantics { contentDescription = "${device.name} power" },
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(device.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            RollingText(deviceStatus(device), MaterialTheme.typography.bodyMedium)
        }
    }
}

/** Two tiles per row. */
@Composable
fun DeviceGrid(devices: List<Device>, canControl: Boolean, onOpenDevice: (String) -> Unit, firstIndex: Int = 0) {
    devices.chunked(2).forEachIndexed { row, pair ->
        Row(Modifier.fillMaxWidth().enterStaggered(firstIndex + row), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            pair.forEach { device -> DeviceTile(device, canControl, { onOpenDevice(device.id) }, Modifier.weight(1f)) }
            if (pair.size == 1) Spacer(Modifier.weight(1f))
        }
    }
}

private val Categories = listOf(
    "Lights" to setOf("light"),
    "Power" to setOf("plug", "switch"),
    "Air" to setOf("air_purifier", "fan"),
    "Climate" to setOf("climate", "sensor"),
)

@Composable
fun DevicesScreen(canControl: Boolean, onOpenDevice: (String) -> Unit) {
    val repository = LocalRepository.current
    val devices by repository.devices.collectAsStateWithLifecycle()
    val rooms by repository.rooms.collectAsStateWithLifecycle()
    val loading by repository.loading.collectAsStateWithLifecycle()
    var category by rememberSaveable { mutableStateOf<String?>(null) }
    // Only categories that have a device, like the web app.
    val categories = Categories.filter { (_, types) -> devices.any { it.type in types } }
    val types = categories.firstOrNull { it.first == category }?.second
    val shown = if (types == null) devices else devices.filter { it.type in types }

    ScreenColumn {
        ScreenHeader("Devices", "${devices.count { it.isOnline }} of ${devices.size} online")
        if (categories.size > 1) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(types == null, { category = null }, { Text("All") })
                categories.forEach { (name, _) -> FilterChip(category == name, { category = name }, { Text(name) }) }
            }
        }
        when {
            loading && devices.isEmpty() -> LoadingIndicator(Modifier.align(Alignment.CenterHorizontally).padding(top = 48.dp))
            devices.isEmpty() -> EmptyState("No devices yet", "Link Tuya, Tapo or Xiaomi under Plugins in the Domus web app. Devices you add there show up here.")
            else -> {
                // Rooms in floor order, then devices without a room.
                val groups: List<Pair<Room?, List<Device>>> =
                    rooms.sortedBy { it.floor }.map { room -> room to shown.filter { it.roomId == room.id } } +
                        (null to shown.filter { d -> rooms.none { it.id == d.roomId } })
                var index = 0
                groups.filter { it.second.isNotEmpty() }.forEach { (room, list) ->
                    SectionTitle(room?.name ?: "No room")
                    DeviceGrid(list, canControl, onOpenDevice, firstIndex = index)
                    index += (list.size + 1) / 2
                }
            }
        }
    }
}

@Composable
fun EmptyState(title: String, message: String, modifier: Modifier = Modifier) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = MaterialTheme.shapes.large, modifier = modifier.fillMaxWidth()) {
        Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// Light colors a bulb can be set to: device data, not theme colors (same presets as the web app).
private val LightColors = listOf("#F59E0B", "#F97316", "#EF4444", "#EC4899", "#A855F7", "#0EA5E9", "#06B6D4", "#10B981", "#84CC16", "#FFFFFF")

private fun parseColor(hex: String): Color? = runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrNull()

/** Everything one device can do, in a bottom sheet. Only the controls its state reports are shown. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DeviceSheet(device: Device, canControl: Boolean, onDismiss: () -> Unit) {
    val repository = LocalRepository.current
    val rooms by repository.rooms.collectAsStateWithLifecycle()
    val c = MaterialTheme.colorScheme
    val s = device.state
    val enabled = canControl && device.isOnline
    val send = { command: DeviceCommand -> repository.command(device, command) }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 24.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val on = device.isOnline && s.isOn == true
                ShapedIcon(
                    deviceIcon(device.type), MaterialShapes.Cookie9Sided,
                    if (on) c.primary else c.surfaceContainerHighest, if (on) c.onPrimary else c.onSurfaceVariant, size = 56.dp,
                )
                Spacer(Modifier.width(16.dp))
                Column(Modifier.weight(1f)) {
                    Text(device.name, style = MaterialTheme.typography.headlineSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    val place = listOfNotNull(rooms.firstOrNull { it.id == device.roomId }?.name, if (device.isOnline) "Online" else "Offline")
                    Text(place.joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = if (device.isOnline) c.onSurfaceVariant else c.error)
                }
                IconButton({ repository.refreshDevice(device.id) }) { Icon(Icons.Rounded.Refresh, "Refresh ${device.name}") }
            }
            if (!canControl) Text("Guests can view devices but not control them.", color = c.onSurfaceVariant)

            s.isOn?.let { isOn ->
                // Expressive toggle: morphs from a pill to a rounded square when on.
                ToggleButton(isOn, { send(DeviceCommand(isOn = it)) }, Modifier.fillMaxWidth().heightIn(min = 64.dp), enabled = enabled) {
                    Icon(Icons.Rounded.PowerSettingsNew, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(if (isOn) "On" else "Off", style = MaterialTheme.typography.titleMedium)
                }
            }
            s.brightness?.let { CommitSlider("Brightness", it, 1f..100f, "$it%", enabled) { v -> send(DeviceCommand(brightness = v)) } }
            s.colorTemp?.let {
                CommitSlider("White", it, 0f..100f, if (it < 34) "Warm" else if (it < 67) "Neutral" else "Cool", enabled) { v ->
                    send(DeviceCommand(colorTemp = v, colorMode = "white"))
                }
            }
            if (s.color != null) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Color", style = MaterialTheme.typography.titleSmall)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        LightColors.forEach { hex ->
                            val selected = s.colorMode != "white" && s.color.equals(hex, ignoreCase = true)
                            Box(
                                Modifier
                                    .size(48.dp)
                                    .clip(CircleShape)
                                    .background(parseColor(hex) ?: c.surfaceVariant)
                                    .border(1.dp, c.outlineVariant, CircleShape)
                                    .clickable(enabled, role = Role.RadioButton) { send(DeviceCommand(color = hex, colorMode = "color")) }
                                    .semantics { contentDescription = "Color $hex"; stateDescription = if (selected) "Selected" else "Not selected" },
                                contentAlignment = Alignment.Center,
                            ) {
                                // Dark tick: every preset is a light, saturated color.
                                if (selected) Icon(Icons.Rounded.Check, contentDescription = null, tint = Color.Black)
                            }
                        }
                    }
                }
            }
            listOf(Triple("Fan speed", "fan_speed", s.fanSpeed), Triple("Mode", "mode", s.mode)).forEach { (label, key, current) ->
                val options = s.options[key].orEmpty()
                if (options.isNotEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(label, style = MaterialTheme.typography.titleSmall)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            options.forEach { option ->
                                FilterChip(
                                    selected = option == current,
                                    onClick = { send(if (key == "mode") DeviceCommand(mode = option) else DeviceCommand(fanSpeed = option)) },
                                    label = { Text(option.replace('_', ' ').replaceFirstChar(Char::uppercase)) },
                                    enabled = enabled,
                                )
                            }
                        }
                    }
                }
            }

            val readings = listOfNotNull(
                s.watts?.let { "Power" to formatWatts(it.toDouble()) },
                s.todayKwh?.let { "Today" to formatKwh(it.toDouble()) },
                s.voltage?.let { "Voltage" to "${it.roundToInt()} V" },
                s.amps?.let { "Current" to "${"%.2f".format(it)} A" },
                s.temperature?.let { "Temperature" to "${"%.1f".format(it)}°" },
                s.humidity?.let { "Humidity" to "${it.roundToInt()}%" },
                s.pm25?.let { "PM2.5" to "${it.roundToInt()} µg/m³ · ${airLevel(it).label}" },
                s.filterLife?.let { "Filter" to "${it.roundToInt()}% left" },
            )
            if (readings.isNotEmpty()) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    readings.forEach { (label, value) ->
                        Surface(color = c.surfaceContainerHighest, shape = MaterialTheme.shapes.medium) {
                            Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                                Text(label, style = MaterialTheme.typography.labelMedium, color = c.onSurfaceVariant)
                                RollingText(value, MaterialTheme.typography.titleMedium)
                            }
                        }
                    }
                }
            }
            Text(listOfNotNull(device.model, device.integration.replaceFirstChar(Char::uppercase)).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant)
        }
    }
}

/** Slider that follows the finger locally and sends one command when released. */
@Composable
private fun CommitSlider(label: String, value: Int, range: ClosedFloatingPointRange<Float>, valueText: String, enabled: Boolean, onCommit: (Int) -> Unit) {
    // Null when not dragging: the slider then follows the device (which already shows the sent value).
    var drag by remember { mutableStateOf<Float?>(null) }
    Column {
        Row {
            Text(label, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            Text(drag?.let { "${it.roundToInt()}" } ?: valueText, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Slider(
            value = drag ?: value.toFloat().coerceIn(range),
            onValueChange = { drag = it },
            onValueChangeFinished = { drag?.let { onCommit(it.roundToInt()) }; drag = null },
            valueRange = range,
            enabled = enabled,
            modifier = Modifier.semantics { contentDescription = label },
        )
    }
}
