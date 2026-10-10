package com.aiyu.domus

import com.aiyu.domus.ui.theme.HapticSwitch
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aiyu.domus.core.Device
import com.aiyu.domus.core.Scene
import com.aiyu.domus.ui.components.SectionTitle
import kotlin.math.roundToInt
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

// Triggers, conditions and actions stay the JSON objects the server stores (shapes: apps/web/src/lib/types.ts).
// The app builds the common kinds and carries the rest through untouched, so a rule made on the web survives an edit here.

private fun JsonObject.text(key: String) = (this[key] as? JsonPrimitive)?.contentOrNull
private val Days = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun") // the server counts from Monday = 0
private val Properties = listOf("temperature" to "Temperature", "humidity" to "Humidity", "air_quality_pm25" to "PM2.5", "brightness" to "Brightness", "current_power_watts" to "Power (W)")

/** One trigger, condition or action as a sentence. */
fun describe(rule: JsonObject, devices: List<Device>, scenes: List<Scene>): String {
    val device = devices.firstOrNull { it.id == rule.text("device_id") }?.name ?: "a removed device"
    fun comparison(): String {
        val property = Properties.firstOrNull { it.first == rule.text("property") }?.second?.lowercase() ?: rule.text("property").orEmpty()
        return when {
            rule.text("property") == "is_on" -> if ((rule["equals"] as? JsonPrimitive)?.booleanOrNull == false) "is off" else "is on"
            rule["above"] != null -> "$property above ${rule.text("above")}"
            rule["below"] != null -> "$property below ${rule.text("below")}"
            else -> "$property is ${rule.text("equals")}"
        }
    }
    return when (rule.text("type")) {
        "device_state" -> "$device ${comparison()}"
        "time" -> {
            val days = (rule["days"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.toIntOrNull()?.let(Days::getOrNull) }
            "At ${rule.text("at")}" + if (days.isEmpty() || days.size == 7) " every day" else " on ${days.joinToString(", ")}"
        }
        "power_above" -> "$device uses more than ${rule.text("watts")} W"
        "device_offline" -> "$device goes offline"
        "device_discovered" -> "A new device is found"
        "time_between" -> "Between ${rule.text("start")} and ${rule.text("end")}"
        "device_command", "group_command" -> {
            val command = rule["command"] as? JsonObject ?: JsonObject(emptyMap())
            val parts = listOfNotNull(
                (command["is_on"] as? JsonPrimitive)?.booleanOrNull?.let { if (it) "on" else "off" },
                command.text("brightness")?.let { "$it%" },
                command.text("color"),
                command.text("color_temp")?.let { "white $it" },
                command.text("fan_speed"), command.text("mode"),
            )
            "${if (rule.text("type") == "group_command") "Device group" else device}: ${parts.joinToString(", ").ifEmpty { "custom command" }}"
        }
        "notify" -> "Notify: ${rule.text("title")}"
        "scene" -> "Run scene ${scenes.firstOrNull { it.id == rule.text("scene_id") }?.name ?: "(removed)"}"
        "delay" -> "Wait ${rule.text("seconds")} s"
        else -> rule.text("type") ?: "Unknown"
    }
}

private val TriggerKinds = listOf("time" to "Time", "device_state" to "Device state", "power_above" to "Power", "device_offline" to "Goes offline", "device_discovered" to "New device")
private val ConditionKinds = listOf("device_state" to "Device state", "time_between" to "Time window")
private val ActionKinds = listOf("device_command" to "Device", "scene" to "Scene", "notify" to "Notify", "delay" to "Wait")

/** Builds one rule of any of [kinds]. One dialog for triggers, conditions and actions: they share most fields. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AddRuleDialog(title: String, kinds: List<Pair<String, String>>, devices: List<Device>, scenes: List<Scene>, onAdd: (JsonObject) -> Unit, onDismiss: () -> Unit) {
    var kind by remember { mutableStateOf(kinds.first().first) }
    var deviceId by remember { mutableStateOf(devices.firstOrNull()?.id) }
    var sceneId by remember { mutableStateOf(scenes.firstOrNull { it.kind == "standard" }?.id) }
    // device_state: "on" / "off", or a numeric property with above / below
    var state by remember { mutableStateOf("on") }
    var above by remember { mutableStateOf(true) }
    var number by remember { mutableStateOf("") }
    // device_command
    var power by remember { mutableStateOf<Boolean?>(true) }
    var dim by remember { mutableStateOf(false) }
    var brightness by remember { mutableFloatStateOf(50f) }
    var heading by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var days by remember { mutableStateOf(emptySet<Int>()) }
    val start = rememberTimePickerState(7, 0, is24Hour = true)
    val end = rememberTimePickerState(22, 0, is24Hour = true)
    fun time(s: TimePickerState) = "%02d:%02d".format(s.hour, s.minute)

    val needsDevice = kind in setOf("device_state", "power_above", "device_offline", "device_command")
    val needsNumber = kind == "power_above" || kind == "delay" || (kind == "device_state" && state !in setOf("on", "off"))
    val valid = (!needsDevice || deviceId != null) && (!needsNumber || number.toDoubleOrNull() != null) && when (kind) {
        "scene" -> sceneId != null
        "notify" -> heading.isNotBlank()
        "device_command" -> power != null || dim
        else -> true
    }
    fun build() = buildJsonObject {
        put("type", kind)
        if (needsDevice) put("device_id", deviceId)
        when (kind) {
            "time" -> { put("at", time(start)); put("days", JsonArray(days.sorted().map(::JsonPrimitive))) }
            "device_state" -> when (state) {
                "on", "off" -> { put("property", "is_on"); put("equals", state == "on") }
                else -> { put("property", state); put(if (above) "above" else "below", number.toDouble()) }
            }
            "power_above" -> put("watts", number.toDouble())
            "time_between" -> { put("start", time(start)); put("end", time(end)) }
            "device_command" -> put("command", buildJsonObject { power?.let { put("is_on", it) }; if (dim) put("brightness", brightness.roundToInt()) })
            "scene" -> put("scene_id", sceneId)
            "notify" -> { put("title", heading.trim()); put("message", message.trim()) }
            "delay" -> put("seconds", number.toDouble().roundToInt())
        }
    }

    FormDialog(title, canSave = valid, save = "Add", onSave = { onAdd(build()); onDismiss() }, onDismiss = onDismiss) {
        Choice(kinds, kind, { kind = it; number = "" })
        if (needsDevice) Picker("Device", devices.map { it.id to it.name }, deviceId, { deviceId = it })
        when (kind) {
            "time" -> {
                TimeInput(start)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Days.forEachIndexed { i, day -> FilterChip(i in days, { days = if (i in days) days - i else days + i }, { Text(day) }) }
                }
                Text(if (days.isEmpty()) "Every day" else "Only on the chosen days", style = MaterialTheme.typography.bodySmall)
            }
            "device_state" -> {
                Picker("Is", listOf("on" to "On", "off" to "Off") + Properties, state, { state = it; number = "" })
                if (needsNumber) {
                    Choice(listOf(true to "Above", false to "Below"), above, { above = it })
                    Field(number, { number = it }, "Value", keyboard = KeyboardType.Decimal)
                }
            }
            "power_above" -> Field(number, { number = it }, "Watts", keyboard = KeyboardType.Decimal)
            "time_between" -> { Text("From"); TimeInput(start); Text("Until"); TimeInput(end) }
            "device_command" -> {
                Choice(listOf<Pair<Boolean?, String>>(true to "Turn on", false to "Turn off", null to "Leave power"), power, { power = it })
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Set brightness${if (dim) " ${brightness.roundToInt()}%" else ""}", Modifier.weight(1f))
                    HapticSwitch(dim, { dim = it })
                }
                if (dim) Slider(brightness, { brightness = it }, valueRange = 1f..100f)
            }
            "scene" -> Picker("Scene", scenes.filter { it.kind == "standard" }.map { it.id to it.name }, sceneId, { sceneId = it })
            "notify" -> { Field(heading, { heading = it }, "Title"); Field(message, { message = it }, "Message") }
            "delay" -> Field(number, { number = it }, "Seconds", keyboard = KeyboardType.Number)
        }
    }
}

/** A titled list of rules with remove buttons and an Add dialog. */
@Composable
private fun RuleList(title: String, add: String, kinds: List<Pair<String, String>>, rules: SnapshotStateList<JsonObject>, devices: List<Device>, scenes: List<Scene>) {
    var adding by remember { mutableStateOf(false) }
    SectionTitle(title)
    rules.forEachIndexed { index, rule ->
        val text = describe(rule, devices, scenes)
        Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth()) {
            Row(Modifier.padding(start = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(text, Modifier.weight(1f).padding(vertical = 12.dp))
                IconButton({ rules.removeAt(index) }) { Icon(Icons.Rounded.Close, "Remove: $text") }
            }
        }
    }
    OutlinedButton({ adding = true }) { Text(add) }
    if (adding) AddRuleDialog(add, kinds, devices, scenes, { rules.add(it) }, { adding = false })
}

private val SyncStyles = listOf("vivid" to "Vivid", "dominant" to "Dominant", "average" to "Average")

/** [id] is a scene id, or `new` / `newsync` for a new standard / Screen Sync scene. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SceneEditorPage(id: String, onBack: () -> Unit) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    val devices by repository.devices.collectAsStateWithLifecycle()
    val scenes by repository.scenes.collectAsStateWithLifecycle()
    val existing = remember(id) { repository.scenes.value.firstOrNull { it.id == id } }
    val sync = existing?.kind == "screen_sync" || id == "newsync"
    var name by remember { mutableStateOf(existing?.name.orEmpty()) }
    val actions = remember { existing?.actions.orEmpty().toMutableStateList() }
    val config = existing?.config ?: JsonObject(emptyMap())
    var lights by remember { mutableStateOf((config["device_ids"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.toSet()) }
    var style by remember { mutableStateOf(config.text("style") ?: "vivid") }
    var region by remember { mutableStateOf(config.text("region") ?: "full") }
    var follow by remember { mutableStateOf((config["follow_brightness"] as? JsonPrimitive)?.booleanOrNull ?: true) }
    var restore by remember { mutableStateOf((config["restore_on_stop"] as? JsonPrimitive)?.booleanOrNull ?: true) }
    var deleting by remember { mutableStateOf(false) }

    val body = buildJsonObject {
        put("name", name.trim())
        put("actions", JsonArray(actions.toList()))
        put("kind", if (sync) "screen_sync" else "standard")
        // Settings this page doesn't show (groups, smoothing, fps, brightness range) keep their stored values.
        if (sync) put("config", JsonObject(config + buildJsonObject {
            put("device_ids", JsonArray(lights.map(::JsonPrimitive)))
            put("style", style); put("region", region); put("follow_brightness", follow); put("restore_on_stop", restore)
        }))
    }
    val valid = name.isNotBlank() && if (sync) lights.isNotEmpty() || (config["group_ids"] as? JsonArray).orEmpty().isNotEmpty() else actions.isNotEmpty()

    SubPage(if (existing == null) (if (sync) "New Screen Sync" else "New scene") else "Edit scene", onBack, actions = {
        if (existing != null) TextButton({ deleting = true }, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Text("Delete") }
    }) {
        Field(name, { name = it }, "Name")
        if (sync) {
            SectionTitle("Lights that follow the screen")
            val bulbs = devices.filter { it.type == "light" }
            if (bulbs.isEmpty()) Text("No lights in your home yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                bulbs.forEach { light -> FilterChip(light.id in lights, { lights = if (light.id in lights) lights - light.id else lights + light.id }, { Text(light.name) }) }
            }
            SectionTitle("Color")
            Choice(SyncStyles, style, { style = it })
            Text(when (style) { "vivid" -> "The strongest color on screen."; "dominant" -> "The most common color."; else -> "The mean of the whole picture." }, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Choice(listOf("full" to "Whole screen", "edges" to "Edges only"), region, { region = it })
            Row(verticalAlignment = Alignment.CenterVertically) { Text("Dim with dark scenes", Modifier.weight(1f)); HapticSwitch(follow, { follow = it }) }
            Row(verticalAlignment = Alignment.CenterVertically) { Text("Restore lights when it stops", Modifier.weight(1f)); HapticSwitch(restore, { restore = it }) }
        } else {
            RuleList("Actions", "Add action", ActionKinds, actions, devices, scenes)
        }
        Button({ scope.launch { repository.change { it.saveScene(existing?.id, body) }?.let { onBack() } } }, Modifier.fillMaxWidth().heightIn(min = 56.dp), enabled = valid) { Text("Save") }
    }
    if (deleting && existing != null) {
        Confirm("Delete ${existing.name}?", "Automations that run this scene will skip it.", "Delete", { scope.launch { repository.change { it.removeScene(existing.id) }?.let { onBack() } } }, { deleting = false })
    }
}

/** [id] is an automation id or `new`. */
@Composable
fun AutomationEditorPage(id: String, onBack: () -> Unit) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    val devices by repository.devices.collectAsStateWithLifecycle()
    val scenes by repository.scenes.collectAsStateWithLifecycle()
    val existing = remember(id) { repository.automations.value.firstOrNull { it.id == id } }
    var name by remember { mutableStateOf(existing?.name.orEmpty()) }
    var description by remember { mutableStateOf(existing?.description.orEmpty()) }
    var enabled by remember { mutableStateOf(existing?.isEnabled ?: true) }
    val triggers = remember { existing?.triggers.orEmpty().toMutableStateList() }
    val conditions = remember { existing?.conditions.orEmpty().toMutableStateList() }
    val actions = remember { existing?.actions.orEmpty().toMutableStateList() }
    var deleting by remember { mutableStateOf(false) }

    val body = buildJsonObject {
        put("name", name.trim())
        put("description", description.trim())
        put("triggers", JsonArray(triggers.toList()))
        put("conditions", JsonArray(conditions.toList()))
        put("actions", JsonArray(actions.toList()))
        put("is_enabled", enabled)
    }
    SubPage(if (existing == null) "New automation" else "Edit automation", onBack, actions = {
        if (existing != null) TextButton({ deleting = true }, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Text("Delete") }
    }) {
        Field(name, { name = it }, "Name")
        Field(description, { description = it }, "Description (optional)")
        Row(verticalAlignment = Alignment.CenterVertically) { Text("Enabled", Modifier.weight(1f)); HapticSwitch(enabled, { enabled = it }) }
        RuleList("When any of these happens", "Add trigger", TriggerKinds, triggers, devices, scenes)
        RuleList("Only if all of these hold", "Add condition", ConditionKinds, conditions, devices, scenes)
        RuleList("Do this", "Add action", ActionKinds, actions, devices, scenes)
        Button(
            { scope.launch { repository.change { it.saveAutomation(existing?.id, body) }?.let { onBack() } } },
            Modifier.fillMaxWidth().heightIn(min = 56.dp), enabled = name.isNotBlank() && triggers.isNotEmpty() && actions.isNotEmpty(),
        ) { Text("Save") }
    }
    if (deleting && existing != null) {
        Confirm("Delete ${existing.name}?", "It stops running.", "Delete", { scope.launch { repository.change { it.removeAutomation(existing.id) }?.let { onBack() } } }, { deleting = false })
    }
}
