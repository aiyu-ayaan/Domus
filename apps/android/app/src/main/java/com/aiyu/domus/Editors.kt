package com.aiyu.domus

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aiyu.domus.core.Device
import com.aiyu.domus.core.Scene
import com.aiyu.domus.core.formatClockTime
import com.aiyu.domus.ui.components.SectionTitle
import kotlin.math.abs
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
private val Days = listOf(R.string.editor_day_mon, R.string.editor_day_tue, R.string.editor_day_wed, R.string.editor_day_thu, R.string.editor_day_fri, R.string.editor_day_sat, R.string.editor_day_sun) // the server counts from Monday = 0
private val Properties = listOf("temperature" to R.string.editor_prop_temperature, "humidity" to R.string.editor_prop_humidity, "air_quality_pm25" to R.string.editor_prop_pm25, "brightness" to R.string.editor_prop_brightness, "current_power_watts" to R.string.editor_prop_power_watts)

/** One trigger, condition or action as a sentence. */
@Composable
fun describe(rule: JsonObject, devices: List<Device>, scenes: List<Scene>, is24Hour: Boolean = true): String {
    val device = devices.firstOrNull { it.id == rule.text("device_id") }?.name ?: stringResource(R.string.editor_removed_device)
    val property = Properties.firstOrNull { it.first == rule.text("property") }?.let { stringResource(it.second).lowercase() } ?: rule.text("property").orEmpty()
    return when (rule.text("type")) {
        "device_state" -> when {
            rule.text("property") == "is_on" -> if ((rule["equals"] as? JsonPrimitive)?.booleanOrNull == false) stringResource(R.string.editor_rule_device_is_off, device) else stringResource(R.string.editor_rule_device_is_on, device)
            rule["above"] != null -> stringResource(R.string.editor_rule_device_prop_above, device, property, rule.text("above").orEmpty())
            rule["below"] != null -> stringResource(R.string.editor_rule_device_prop_below, device, property, rule.text("below").orEmpty())
            else -> stringResource(R.string.editor_rule_device_prop_is, device, property, rule.text("equals").orEmpty())
        }
        "time" -> {
            val at = rule.text("at")?.let { formatClockTime(it, is24Hour) }.orEmpty()
            val days = (rule["days"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.toIntOrNull()?.let(Days::getOrNull) }.map { stringResource(it) }
            if (days.isEmpty() || days.size == 7) stringResource(R.string.editor_rule_time_every_day, at) else stringResource(R.string.editor_rule_time_on_days, at, days.joinToString(", "))
        }
        "sun" -> {
            val offset = rule.text("offset_minutes")?.toIntOrNull() ?: 0
            val event = when (rule.text("event")) {
                "sunrise" -> stringResource(R.string.editor_sun_event_sunrise)
                "sunset" -> stringResource(R.string.editor_sun_event_sunset)
                else -> rule.text("event").orEmpty()
            }
            val days = (rule["days"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.toIntOrNull()?.let(Days::getOrNull) }.map { stringResource(it) }
            val everyDay = days.isEmpty() || days.size == 7
            val dayList = days.joinToString(", ")
            when {
                offset == 0 && everyDay -> stringResource(R.string.editor_rule_sun_at_every_day, event)
                offset == 0 -> stringResource(R.string.editor_rule_sun_at_on_days, event, dayList)
                offset < 0 && everyDay -> stringResource(R.string.editor_rule_sun_before_every_day, abs(offset), event)
                offset < 0 -> stringResource(R.string.editor_rule_sun_before_on_days, abs(offset), event, dayList)
                everyDay -> stringResource(R.string.editor_rule_sun_after_every_day, abs(offset), event)
                else -> stringResource(R.string.editor_rule_sun_after_on_days, abs(offset), event, dayList)
            }
        }
        "power_above" -> stringResource(R.string.editor_rule_power_above, device, rule.text("watts").orEmpty())
        "device_offline" -> stringResource(R.string.editor_rule_device_offline, device)
        "device_discovered" -> stringResource(R.string.editor_rule_device_discovered)
        "time_between" -> {
            val start = rule.text("start")?.let { formatClockTime(it, is24Hour) }.orEmpty()
            val end = rule.text("end")?.let { formatClockTime(it, is24Hour) }.orEmpty()
            stringResource(R.string.editor_rule_time_between, start, end)
        }
        "device_command", "group_command" -> {
            val command = rule["command"] as? JsonObject ?: JsonObject(emptyMap())
            val parts = listOfNotNull(
                (command["is_on"] as? JsonPrimitive)?.booleanOrNull?.let { stringResource(if (it) R.string.editor_cmd_on else R.string.editor_cmd_off) },
                command.text("brightness")?.let { stringResource(R.string.editor_cmd_brightness_pct, it) },
                command.text("color"),
                command.text("color_temp")?.let { stringResource(R.string.editor_cmd_white, it) },
                command.text("fan_speed"), command.text("mode"),
            )
            val target = if (rule.text("type") == "group_command") stringResource(R.string.editor_device_group) else device
            val summary = parts.joinToString(", ").ifEmpty { stringResource(R.string.editor_cmd_custom) }
            stringResource(R.string.editor_rule_command, target, summary)
        }
        "notify" -> stringResource(R.string.editor_rule_notify, rule.text("title").orEmpty())
        "scene" -> stringResource(R.string.editor_rule_scene, scenes.firstOrNull { it.id == rule.text("scene_id") }?.name ?: stringResource(R.string.editor_removed_scene))
        "delay" -> stringResource(R.string.editor_rule_delay, rule.text("seconds").orEmpty())
        else -> rule.text("type") ?: stringResource(R.string.editor_rule_unknown)
    }
}

private val TriggerKinds = listOf("time" to R.string.editor_trigger_time, "sun" to R.string.editor_trigger_sun, "device_state" to R.string.editor_trigger_device_state, "power_above" to R.string.editor_trigger_power, "device_offline" to R.string.editor_trigger_offline, "device_discovered" to R.string.editor_trigger_discovered)
private val ConditionKinds = listOf("device_state" to R.string.editor_condition_device_state, "time_between" to R.string.editor_condition_time_between)
private val ActionKinds = listOf("device_command" to R.string.editor_action_device, "scene" to R.string.editor_action_scene, "notify" to R.string.editor_action_notify, "delay" to R.string.editor_action_delay)

/** Builds one rule of any of [kinds]. One dialog for triggers, conditions and actions: they share most fields. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AddRuleDialog(title: String, kinds: List<Pair<String, Int>>, devices: List<Device>, scenes: List<Scene>, onAdd: (JsonObject) -> Unit, onDismiss: () -> Unit) {
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
    // sun: the event, and [number] minutes before or after it
    var sun by remember { mutableStateOf("sunset") }
    var before by remember { mutableStateOf(false) }
    val is24Hour = rememberIs24HourFormat()
    val start = rememberTimePickerState(7, 0, is24Hour = is24Hour)
    val end = rememberTimePickerState(22, 0, is24Hour = is24Hour)
    fun time(s: TimePickerState) = "%02d:%02d".format(s.hour, s.minute)

    val needsDevice = kind in setOf("device_state", "power_above", "device_offline", "device_command")
    val needsNumber = kind == "power_above" || kind == "delay" || (kind == "device_state" && state !in setOf("on", "off"))
    val valid = (!needsDevice || deviceId != null) && (!needsNumber || number.toDoubleOrNull() != null) && when (kind) {
        "scene" -> sceneId != null
        "notify" -> heading.isNotBlank()
        "device_command" -> power != null || dim
        "sun" -> number.isBlank() || number.toIntOrNull() in 0..360
        else -> true
    }
    fun build() = buildJsonObject {
        put("type", kind)
        if (needsDevice) put("device_id", deviceId)
        when (kind) {
            "time" -> { put("at", time(start)); put("days", JsonArray(days.sorted().map(::JsonPrimitive))) }
            "sun" -> {
                put("event", sun)
                put("offset_minutes", (number.toIntOrNull() ?: 0) * if (before) -1 else 1)
                put("days", JsonArray(days.sorted().map(::JsonPrimitive)))
            }
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

    FormDialog(title, canSave = valid, save = stringResource(R.string.editor_add), onSave = { onAdd(build()); onDismiss() }, onDismiss = onDismiss) {
        Choice(kinds.map { it.first to stringResource(it.second) }, kind, { kind = it; number = "" })
        if (needsDevice) Picker(stringResource(R.string.editor_field_device), devices.map { it.id to it.name }, deviceId, { deviceId = it })
        when (kind) {
            "time", "sun" -> {
                if (kind == "time") TimeInput(start) else {
                    Choice(listOf("sunrise" to stringResource(R.string.editor_sun_sunrise), "sunset" to stringResource(R.string.editor_sun_sunset)), sun, { sun = it })
                    Choice(listOf(false to stringResource(R.string.editor_sun_after), true to stringResource(R.string.editor_sun_before)), before, { before = it })
                    Field(number, { number = it }, stringResource(R.string.editor_field_minutes), keyboard = KeyboardType.Number, supporting = stringResource(if (sun == "sunrise") R.string.editor_sun_supporting_sunrise else R.string.editor_sun_supporting_sunset))
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Days.forEachIndexed { i, dayRes -> FilterChip(i in days, { days = if (i in days) days - i else days + i }, { Text(stringResource(dayRes)) }) }
                }
                Text(stringResource(if (days.isEmpty()) R.string.editor_every_day else R.string.editor_chosen_days), style = MaterialTheme.typography.bodySmall)
            }
            "device_state" -> {
                Picker(stringResource(R.string.editor_field_is), listOf("on" to stringResource(R.string.editor_state_on), "off" to stringResource(R.string.editor_state_off)) + Properties.map { it.first to stringResource(it.second) }, state, { state = it; number = "" })
                if (needsNumber) {
                    Choice(listOf(true to stringResource(R.string.editor_compare_above), false to stringResource(R.string.editor_compare_below)), above, { above = it })
                    Field(number, { number = it }, stringResource(R.string.editor_field_value), keyboard = KeyboardType.Decimal)
                }
            }
            "power_above" -> Field(number, { number = it }, stringResource(R.string.editor_field_watts), keyboard = KeyboardType.Decimal)
            "time_between" -> { Text(stringResource(R.string.editor_time_from)); TimeInput(start); Text(stringResource(R.string.editor_time_until)); TimeInput(end) }
            "device_command" -> {
                Choice(listOf<Pair<Boolean?, String>>(true to stringResource(R.string.editor_power_turn_on), false to stringResource(R.string.editor_power_turn_off), null to stringResource(R.string.editor_power_leave)), power, { power = it })
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (dim) stringResource(R.string.editor_set_brightness_value, brightness.roundToInt()) else stringResource(R.string.editor_set_brightness), Modifier.weight(1f))
                    Switch(dim, { dim = it })
                }
                if (dim) Slider(brightness, { brightness = it }, valueRange = 1f..100f)
            }
            "scene" -> Picker(stringResource(R.string.editor_field_scene), scenes.filter { it.kind == "standard" }.map { it.id to it.name }, sceneId, { sceneId = it })
            "notify" -> { Field(heading, { heading = it }, stringResource(R.string.editor_field_title)); Field(message, { message = it }, stringResource(R.string.editor_field_message)) }
            "delay" -> Field(number, { number = it }, stringResource(R.string.editor_field_seconds), keyboard = KeyboardType.Number)
        }
    }
}

/** A titled list of rules with remove buttons and an Add dialog. */
@Composable
private fun RuleList(title: String, add: String, kinds: List<Pair<String, Int>>, rules: SnapshotStateList<JsonObject>, devices: List<Device>, scenes: List<Scene>) {
    var adding by remember { mutableStateOf(false) }
    val is24Hour = rememberIs24HourFormat()
    SectionTitle(title)
    rules.forEachIndexed { index, rule ->
        val text = describe(rule, devices, scenes, is24Hour)
        Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth()) {
            Row(Modifier.padding(start = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(text, Modifier.weight(1f).padding(vertical = 12.dp))
                IconButton({ rules.removeAt(index) }) { Icon(Icons.Rounded.Close, stringResource(R.string.editor_remove_rule, text)) }
            }
        }
    }
    OutlinedButton({ adding = true }) { Text(add) }
    if (adding) AddRuleDialog(add, kinds, devices, scenes, { rules.add(it) }, { adding = false })
}

private val SyncStyles = listOf("vivid" to R.string.editor_style_vivid, "dominant" to R.string.editor_style_dominant, "average" to R.string.editor_style_average)

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

    SubPage(stringResource(if (existing == null) (if (sync) R.string.editor_new_screen_sync else R.string.editor_new_scene) else R.string.editor_edit_scene), onBack, actions = {
        if (existing != null) TextButton({ deleting = true }, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Text(stringResource(R.string.editor_delete)) }
    }) {
        Field(name, { name = it }, stringResource(R.string.editor_field_name))
        if (sync) {
            SectionTitle(stringResource(R.string.editor_sync_lights_title))
            val bulbs = devices.filter { it.type == "light" }
            if (bulbs.isEmpty()) Text(stringResource(R.string.editor_sync_no_lights), color = MaterialTheme.colorScheme.onSurfaceVariant)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                bulbs.forEach { light -> FilterChip(light.id in lights, { lights = if (light.id in lights) lights - light.id else lights + light.id }, { Text(light.name) }) }
            }
            SectionTitle(stringResource(R.string.editor_sync_color_title))
            Choice(SyncStyles.map { it.first to stringResource(it.second) }, style, { style = it })
            Text(stringResource(when (style) { "vivid" -> R.string.editor_style_vivid_desc; "dominant" -> R.string.editor_style_dominant_desc; else -> R.string.editor_style_average_desc }), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Choice(listOf("full" to stringResource(R.string.editor_region_full), "edges" to stringResource(R.string.editor_region_edges)), region, { region = it })
            Row(verticalAlignment = Alignment.CenterVertically) { Text(stringResource(R.string.editor_sync_dim_dark), Modifier.weight(1f)); Switch(follow, { follow = it }) }
            Row(verticalAlignment = Alignment.CenterVertically) { Text(stringResource(R.string.editor_sync_restore_lights), Modifier.weight(1f)); Switch(restore, { restore = it }) }
        } else {
            RuleList(stringResource(R.string.editor_actions_title), stringResource(R.string.editor_add_action), ActionKinds, actions, devices, scenes)
        }
        Button({ scope.launch { repository.change { it.saveScene(existing?.id, body) }?.let { onBack() } } }, Modifier.fillMaxWidth().heightIn(min = 56.dp), enabled = valid) { Text(stringResource(R.string.editor_save)) }
    }
    if (deleting && existing != null) {
        Confirm(stringResource(R.string.editor_delete_confirm_title, existing.name), stringResource(R.string.editor_delete_scene_body), stringResource(R.string.editor_delete), { scope.launch { repository.change { it.removeScene(existing.id) }?.let { onBack() } } }, { deleting = false })
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
    SubPage(stringResource(if (existing == null) R.string.editor_new_automation else R.string.editor_edit_automation), onBack, actions = {
        if (existing != null) TextButton({ deleting = true }, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Text(stringResource(R.string.editor_delete)) }
    }) {
        Field(name, { name = it }, stringResource(R.string.editor_field_name))
        Field(description, { description = it }, stringResource(R.string.editor_field_description_optional))
        Row(verticalAlignment = Alignment.CenterVertically) { Text(stringResource(R.string.editor_enabled), Modifier.weight(1f)); Switch(enabled, { enabled = it }) }
        RuleList(stringResource(R.string.editor_triggers_title), stringResource(R.string.editor_add_trigger), TriggerKinds, triggers, devices, scenes)
        RuleList(stringResource(R.string.editor_conditions_title), stringResource(R.string.editor_add_condition), ConditionKinds, conditions, devices, scenes)
        RuleList(stringResource(R.string.editor_do_this_title), stringResource(R.string.editor_add_action), ActionKinds, actions, devices, scenes)
        Button(
            { scope.launch { repository.change { it.saveAutomation(existing?.id, body) }?.let { onBack() } } },
            Modifier.fillMaxWidth().heightIn(min = 56.dp), enabled = name.isNotBlank() && triggers.isNotEmpty() && actions.isNotEmpty(),
        ) { Text(stringResource(R.string.editor_save)) }
    }
    if (deleting && existing != null) {
        Confirm(stringResource(R.string.editor_delete_confirm_title, existing.name), stringResource(R.string.editor_delete_automation_body), stringResource(R.string.editor_delete), { scope.launch { repository.change { it.removeAutomation(existing.id) }?.let { onBack() } } }, { deleting = false })
    }
}
