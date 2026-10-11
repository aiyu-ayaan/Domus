package com.aiyu.domus

import com.aiyu.domus.ui.theme.HapticSwitch
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Air
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Blinds
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.DevicesOther
import androidx.compose.material.icons.rounded.LightMode
import androidx.compose.material.icons.rounded.Lightbulb
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material.icons.rounded.Power
import androidx.compose.material.icons.rounded.PowerSettingsNew
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Sensors
import androidx.compose.material.icons.rounded.Thermostat
import androidx.compose.material.icons.rounded.ToggleOn
import androidx.compose.material.icons.rounded.Toys
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.AssistChip
import androidx.compose.material.icons.rounded.MeetingRoom
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.MaterialShapes
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.toShape
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.TextButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.ToggleButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aiyu.domus.core.Device
import com.aiyu.domus.core.DeviceCommand
import com.aiyu.domus.core.LightPreset
import com.aiyu.domus.core.Room
import com.aiyu.domus.core.User
import com.aiyu.domus.core.airLevel
import com.aiyu.domus.core.formatKwh
import com.aiyu.domus.core.formatWatts
import com.aiyu.domus.core.kelvinRgb
import com.aiyu.domus.core.whiteKelvin
import com.aiyu.domus.ui.components.ColorWheel
import com.aiyu.domus.ui.components.RollingText
import com.aiyu.domus.ui.components.ScreenColumn
import com.aiyu.domus.ui.components.ScreenHeader
import com.aiyu.domus.ui.components.SectionTitle
import com.aiyu.domus.ui.components.ShapedIcon
import com.aiyu.domus.ui.components.enterStaggered
import com.aiyu.domus.ui.components.pressScale
import kotlin.math.roundToInt
import kotlinx.coroutines.launch

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
        s.waterLeak == true -> "Leak"
        s.motion != null -> if (s.motion == true) "Motion" else "Clear"
        s.contact != null -> if (s.contact == true) "Open" else "Closed"
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
                    HapticSwitch(
                        checked = isOn,
                        onCheckedChange = { repository.command(device, DeviceCommand(isOn = it)) },
                        enabled = canControl && device.canControl && device.isOnline,
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

private const val NO_ROOM = "\u0000none"

@Composable
fun DevicesScreen(user: User, onOpenDevice: (String) -> Unit, onAdd: () -> Unit, onManageRooms: () -> Unit) {
    val canControl = user.canControl
    val repository = LocalRepository.current
    val devices by repository.devices.collectAsStateWithLifecycle()
    val rooms by repository.rooms.collectAsStateWithLifecycle()
    val loading by repository.loading.collectAsStateWithLifecycle()
    var category by rememberSaveable { mutableStateOf<String?>(null) }
    // Only categories that have a device, like the web app.
    val categories = Categories.filter { (_, types) -> devices.any { it.type in types } }
    val types = categories.firstOrNull { it.first == category }?.second
    // null = every room; NO_ROOM = devices that are in none.
    var roomFilter by rememberSaveable { mutableStateOf<String?>(null) }
    val inRoom = { d: Device -> roomFilter == null || (if (roomFilter == NO_ROOM) rooms.none { it.id == d.roomId } else d.roomId == roomFilter) }
    val shown = devices.filter { (types == null || it.type in types) && inRoom(it) }

    ScreenColumn {
        ScreenHeader("Devices", "${devices.count { it.isOnline }} of ${devices.size} online") {
            if (user.isAdmin) FilledTonalIconButton(onAdd) { Icon(Icons.Rounded.Add, "Add devices") }
        }
        if (categories.size > 1) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(types == null, { category = null }, { Text("All") })
                categories.forEach { (name, _) -> FilterChip(category == name, { category = name }, { Text(name) }) }
            }
        }
        if (rooms.isNotEmpty() || user.isAdmin) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (rooms.isNotEmpty()) {
                    FilterChip(roomFilter == null, { roomFilter = null }, { Text("All rooms") })
                    rooms.sortedBy { it.floor }.forEach { room -> FilterChip(roomFilter == room.id, { roomFilter = room.id }, { Text(room.name) }) }
                    if (devices.any { d -> rooms.none { it.id == d.roomId } }) FilterChip(roomFilter == NO_ROOM, { roomFilter = NO_ROOM }, { Text("No room") })
                }
                if (user.isAdmin) AssistChip(onManageRooms, { Text("Manage rooms") }, leadingIcon = { Icon(Icons.Rounded.MeetingRoom, null, Modifier.size(18.dp)) })
            }
        }
        when {
            loading && devices.isEmpty() -> LoadingIndicator(Modifier.align(Alignment.CenterHorizontally).padding(top = 48.dp))
            shown.isEmpty() && devices.isNotEmpty() -> EmptyState("Nothing here", "No device matches this room and category.")
            devices.isEmpty() -> EmptyState("No devices yet", if (user.isAdmin) "Tap + to link Tuya, Tapo, Xiaomi, Hue or MQTT and add what they find." else "Ask an admin to add devices or give you access to a room.")
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
private val LightColors = listOf("#F59E0B", "#EAB308", "#F97316", "#EF4444", "#EC4899", "#A855F7", "#0EA5E9", "#06B6D4", "#10B981", "#84CC16")

private fun parseColor(hex: String): Color? = runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrNull()

/** Everything one device can do, in a bottom sheet. Only the controls its state reports are shown. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DeviceSheet(device: Device, user: User, onDismiss: () -> Unit) {
    val canControl = user.canControl && device.canControl
    val scope = rememberCoroutineScope()
    var editing by remember { mutableStateOf(false) }
    var removing by remember { mutableStateOf(false) }
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
            if (!canControl) Text(if (user.canControl) "You can see this device but not control it." else "Guests can view devices but not control them.", color = c.onSurfaceVariant)

            s.isOn?.let { isOn ->
                // Expressive toggle: morphs from a pill to a rounded square when on.
                ToggleButton(isOn, { send(DeviceCommand(isOn = it)) }, Modifier.fillMaxWidth().heightIn(min = 64.dp), enabled = enabled) {
                    Icon(Icons.Rounded.PowerSettingsNew, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(if (isOn) "On" else "Off", style = MaterialTheme.typography.titleMedium)
                }
            }
            s.brightness?.let { CommitSlider("Brightness", it, 1f..100f, { v -> "$v%" }, enabled) { v -> send(DeviceCommand(brightness = v)) } }
            // Every light gets the White / Color controls, whatever it reports right now (same rule as the web app).
            if (device.type == "light") LightControls(device, enabled, send)
            else s.colorTemp?.let {
                CommitSlider("White", it, 0f..100f, { v -> if (v < 34) "Warm" else if (v < 67) "Neutral" else "Cool" }, enabled) { v -> send(DeviceCommand(colorTemp = v)) }
            }
            listOf(Triple("Fan speed", "fan_speed", s.fanSpeed), Triple("Mode", "mode", s.mode)).forEach { (label, key, current) ->
                val options = s.options[key].orEmpty()
                if (options.isNotEmpty()) Column {
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
                    // The manual level only drives the fan in manual mode, so it unfolds under the mode chips.
                    val speed = s.fanPercent
                    if (key == "mode" && speed != null) {
                        val motion = MaterialTheme.motionScheme
                        AnimatedVisibility(
                            visible = current == "Manual",
                            enter = expandVertically(motion.defaultSpatialSpec()) + fadeIn(motion.defaultEffectsSpec()),
                            exit = shrinkVertically(motion.fastSpatialSpec()) + fadeOut(motion.fastEffectsSpec()),
                        ) {
                            // Rated room size is 0.07-0.12 m² per m³/h of CADR; airflow is taken as linear in speed.
                            val (low, high) = s.fanCadr?.takeIf { it.size == 2 } ?: listOf(0, 0)
                            val coverage = { v: Int -> (low + (high - low) * v / 100).let { if (it > 0) "Coverage ${it * 7 / 100}–${it * 12 / 100} m²" else "" } }
                            Box(Modifier.padding(top = 20.dp)) {
                                CommitSlider("Speed", speed, 0f..100f, coverage, enabled) { v -> send(DeviceCommand(fanPercent = v)) }
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
                s.motion?.let { "Motion" to if (it) "Detected" else "Clear" },
                s.contact?.let { "Door or window" to if (it) "Open" else "Closed" },
                s.waterLeak?.let { "Water" to if (it) "Leak" else "Dry" },
                s.alarm?.let { "Alarm" to if (it) "Sounding" else "Quiet" },
                s.battery?.let { "Battery" to "${it.roundToInt()}%" } ?: s.batteryLow?.let { "Battery" to if (it) "Low" else "OK" },
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
            if (user.isAdmin || device.canEdit) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton({ editing = true }) { Text(if (user.isAdmin) "Rename or move" else "Rename") }
                    if (user.isAdmin) TextButton({ removing = true }, colors = ButtonDefaults.textButtonColors(contentColor = c.error)) { Text("Remove") }
                }
            }
        }
    }
    if (editing) {
        var name by remember { mutableStateOf(device.name) }
        var room by remember { mutableStateOf(device.roomId) }
        FormDialog("Edit device", canSave = name.isNotBlank(), onDismiss = { editing = false }, onSave = {
            editing = false
            scope.launch { repository.change { it.updateDevice(device.id, name.trim(), room, moveRoom = user.isAdmin) } }
        }) {
            Field(name, { name = it }, "Name")
            if (user.isAdmin) Picker("Room", listOf<Pair<String?, String>>(null to "No room") + rooms.map { it.id to it.name }, room, { room = it })
        }
    }
    if (removing) {
        Confirm("Remove ${device.name}?", "It leaves your home and its scenes. You can add it again from Add devices.", "Remove", {
            onDismiss()
            scope.launch { repository.change { it.removeDevice(device.id) } }
        }, { removing = false })
    }
}

// Colors of light itself (white temperatures, bulb colors): device data, not theme colors. Same values as the web app.
private val WhiteTrack = listOf(0xFFFF890E, 0xFFFFA757, 0xFFFFE4CE, 0xFFD6E6FF, 0xFFB2D4FF).map(::Color)
private val WhitePresets = listOf("Candle" to 0, "Soft White" to 16, "Daylight" to 67, "Cool White" to 100)

private fun whiteName(percent: Int) = when {
    percent < 10 -> "Candle"
    percent < 30 -> "Soft White"
    percent < 60 -> "Neutral White"
    percent < 85 -> "Daylight"
    else -> "Cool White"
}

/**
 * White / Color controls of a light, like the web app's: a preview of the light it gives, the mode switch,
 * then a temperature slider with presets (White) or swatches and the wheel (Color).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ColumnScope.LightControls(device: Device, enabled: Boolean, send: (DeviceCommand) -> Unit) {
    val c = MaterialTheme.colorScheme
    val s = device.state
    // The device's own mode when it reports one; otherwise color only for a light with a color and no white setting.
    val lit = s.colorMode?.takeIf { it == "white" || it == "color" } ?: if (s.color != null && s.colorTemp == null) "color" else "white"
    // Which tab is open: the one for what the light is doing. "effect" is only a view; it sends nothing by itself.
    val reported = if (s.effect != null) "effect" else lit
    var mode by remember(reported) { mutableStateOf(reported) }
    val catalog by LocalRepository.current.effects.collectAsStateWithLifecycle()
    // Only the effects this light says it can play by itself.
    val playable = catalog.effects.filter { it.id in s.options["effect"].orEmpty() }
    val temp = s.colorTemp ?: 50
    var dragTemp by remember { mutableStateOf<Float?>(null) }
    val shownTemp = dragTemp?.roundToInt() ?: temp
    val color = s.color ?: "#F59E0B"
    val on = device.isOnline && s.isOn != false
    val playing = playable.firstOrNull { it.id == s.effect }
    val glow = playing?.colors?.firstOrNull()?.let(::parseColor) ?: if (lit == "white") Color(0xFF000000 or kelvinRgb(whiteKelvin(shownTemp)).toLong()) else parseColor(color) ?: c.primary
    val shown by animateColorAsState(if (on) glow else c.surfaceContainerHighest, MaterialTheme.motionScheme.defaultEffectsSpec(), label = "glow")

    Surface(color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(48.dp).clip(MaterialShapes.Sunny.toShape()).background(shown).border(1.dp, c.outlineVariant, MaterialShapes.Sunny.toShape()))
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(if (!on) "Light off" else if (s.effect != null) "Effect" else if (lit == "white") "White light" else "Color light", style = MaterialTheme.typography.titleMedium)
                RollingText(
                    s.effect?.let { "Playing ${playing?.name ?: it}" } ?: if (lit == "white") "${whiteName(shownTemp)} · ${whiteKelvin(shownTemp)}K" else color.uppercase(),
                    MaterialTheme.typography.bodyMedium, c.onSurfaceVariant,
                )
            }
            Text(if (on) "${s.brightness ?: 100}%" else "0%", style = MaterialTheme.typography.titleMedium)
        }
    }

    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        // Switching mode re-sends that mode's current setting, so the bulb changes at once.
        val tabs = if (playable.isEmpty()) 2 else 3
        SegmentedButton(mode == "white", { mode = "white"; send(DeviceCommand(colorTemp = temp, colorMode = "white")) }, SegmentedButtonDefaults.itemShape(0, tabs), enabled = enabled, icon = { Icon(Icons.Rounded.LightMode, null, Modifier.size(18.dp)) }) { Text("White") }
        SegmentedButton(mode == "color", { mode = "color"; send(DeviceCommand(color = color, colorMode = "color")) }, SegmentedButtonDefaults.itemShape(1, tabs), enabled = enabled, icon = { Icon(Icons.Rounded.Palette, null, Modifier.size(18.dp)) }) { Text("Color") }
        // Opening Effects changes nothing on the light until one is picked.
        if (tabs == 3) SegmentedButton(mode == "effect", { mode = "effect" }, SegmentedButtonDefaults.itemShape(2, 3), icon = { Icon(Icons.Rounded.AutoAwesome, null, Modifier.size(18.dp)) }) { Text("Effects") }
    }

    if (mode == "white") {
        Column {
            Row {
                Text("Color temperature", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                Text("${whiteKelvin(shownTemp)}K · ${if (shownTemp < 35) "Warm" else if (shownTemp > 65) "Cool" else "Neutral"}", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
            }
            Slider(
                value = dragTemp ?: temp.toFloat(),
                onValueChange = { dragTemp = it },
                onValueChangeFinished = { dragTemp?.let { send(DeviceCommand(colorTemp = it.roundToInt(), colorMode = "white")) }; dragTemp = null },
                valueRange = 0f..100f,
                enabled = enabled,
                // The track shows the light each position gives.
                track = { Box(Modifier.fillMaxWidth().height(16.dp).clip(CircleShape).background(Brush.horizontalGradient(WhiteTrack)).border(1.dp, c.outlineVariant, CircleShape)) },
                modifier = Modifier.semantics { contentDescription = "Color temperature" },
            )
            Row {
                Text("2000K warm", style = MaterialTheme.typography.labelSmall, color = c.onSurfaceVariant, modifier = Modifier.weight(1f))
                Text("6500K cool", style = MaterialTheme.typography.labelSmall, color = c.onSurfaceVariant)
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            WhitePresets.forEach { (name, percent) ->
                FilterChip(
                    selected = kotlin.math.abs(temp - percent) <= 7,
                    onClick = { send(DeviceCommand(colorTemp = percent, colorMode = "white")) },
                    label = { Text("$name · ${whiteKelvin(percent)}K") },
                    leadingIcon = { Box(Modifier.size(16.dp).clip(CircleShape).background(Color(0xFF000000 or kelvinRgb(whiteKelvin(percent)).toLong())).border(1.dp, c.outlineVariant, CircleShape)) },
                    enabled = enabled,
                )
            }
        }
        // Moods are white presets with a brightness, so they live with the other white settings.
        if (catalog.moods.isNotEmpty()) {
            Text("Moods", style = MaterialTheme.typography.titleSmall)
            PresetGrid(catalog.moods, enabled, { send(DeviceCommand(effect = it.id)) }) { mood ->
                // A mood is "on" when the light shows exactly its setting and no effect runs.
                s.effect == null && s.isOn == true && s.colorMode == "white" && s.brightness == mood.brightness && s.colorTemp == mood.colorTemp
            }
        }
    } else if (mode == "effect") {
        if (s.effect != null) OutlinedButton({ send(DeviceCommand(effect = "")) }, enabled = enabled) { Text("Stop effect") }
        PresetGrid(playable, enabled, { send(DeviceCommand(effect = it.id)) }) { it.id == s.effect }
    } else {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            LightColors.forEach { hex ->
                val selected = color.equals(hex, ignoreCase = true)
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
        // Any color: drag on the wheel, it is sent when the finger lifts.
        ColorWheel({ send(DeviceCommand(color = it, colorMode = "color")) }, Modifier.align(Alignment.CenterHorizontally).size(220.dp), enabled)
    }
}

/** Two tiles per row: an orb showing the preset's light, and its name. The active one is filled and rounder. */
@Composable
private fun PresetGrid(presets: List<LightPreset>, enabled: Boolean, onPick: (LightPreset) -> Unit, active: (LightPreset) -> Boolean) {
    val c = MaterialTheme.colorScheme
    val motion = MaterialTheme.motionScheme
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        presets.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                pair.forEach { preset ->
                    val on = active(preset)
                    val container by animateColorAsState(if (on) c.secondaryContainer else c.surfaceContainerHigh, motion.defaultEffectsSpec(), label = "preset")
                    val corner by animateDpAsState(if (on) 28.dp else 16.dp, motion.defaultSpatialSpec(), label = "presetCorner")
                    val colors = preset.colors.mapNotNull(::parseColor).ifEmpty { listOf(c.outline) }
                    Surface(
                        onClick = { onPick(preset) },
                        enabled = enabled,
                        color = container,
                        shape = RoundedCornerShape(corner.coerceAtLeast(0.dp)),
                        modifier = Modifier.weight(1f).semantics { role = Role.RadioButton; stateDescription = if (on) "On" else "Off" },
                    ) {
                        Row(Modifier.heightIn(min = 56.dp).padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            // The light itself: device data, not theme color. A loop is drawn as a sweep through its colors.
                            Box(
                                Modifier.size(32.dp).clip(CircleShape)
                                    .background(if (colors.size > 1) Brush.sweepGradient(colors + colors.first()) else SolidColor(colors.first()))
                                    .border(1.dp, c.outlineVariant, CircleShape),
                            )
                            Spacer(Modifier.width(12.dp))
                            Text(preset.name, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

/** Slider that follows the finger locally and sends one command when released. */
@Composable
private fun CommitSlider(label: String, value: Int, range: ClosedFloatingPointRange<Float>, valueText: (Int) -> String, enabled: Boolean, onCommit: (Int) -> Unit) {
    // Null when not dragging: the slider then follows the device (which already shows the sent value).
    var drag by remember { mutableStateOf<Float?>(null) }
    Column {
        Row {
            Text(label, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            Text(valueText(drag?.roundToInt() ?: value), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
