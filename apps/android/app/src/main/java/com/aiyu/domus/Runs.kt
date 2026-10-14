package com.aiyu.domus

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aiyu.domus.core.Automation
import com.aiyu.domus.core.AutomationRun
import com.aiyu.domus.core.Device
import com.aiyu.domus.core.formatClockTime
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/** An automation's recent runs, newest first, with what held each one back (the same traces the web shows). */
@Composable
fun AutomationRunsPage(id: String, onBack: () -> Unit) {
    val repository = LocalRepository.current
    val automations by repository.automations.collectAsStateWithLifecycle()
    val devices by repository.devices.collectAsStateWithLifecycle()
    val scenes by repository.scenes.collectAsStateWithLifecycle()
    val automation = automations.firstOrNull { it.id == id }
    var runs by remember(id) { mutableStateOf<List<AutomationRun>?>(null) }
    LaunchedEffect(id) {
        while (true) {
            repository.automationRuns(id)?.let { runs = it }
            delay(15_000)
        }
    }
    val is24Hour = rememberIs24HourFormat()
    val c = MaterialTheme.colorScheme
    SubPage(stringResource(R.string.runs_title, automation?.name.orEmpty()), onBack) {
        // SubPage scrolls and pads the body; a second scroll here would crash.
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.runs_hint), style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
            val list = runs ?: return@Column
            if (list.isEmpty() || automation == null) {
                Text(stringResource(R.string.runs_empty), style = MaterialTheme.typography.bodyLarge)
                return@Column
            }
            list.forEach { run ->
                Surface(color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            val (label, color) = when (run.outcome) {
                                "done" -> R.string.runs_outcome_done to c.primary
                                "failed" -> R.string.runs_outcome_failed to c.error
                                "running" -> R.string.runs_outcome_running to c.tertiary
                                else -> R.string.runs_outcome_blocked to c.onSurfaceVariant
                            }
                            Text(stringResource(label), style = MaterialTheme.typography.labelLarge, color = color, modifier = Modifier.weight(1f))
                            Text(moment(run.startedAt), style = MaterialTheme.typography.labelMedium, color = c.onSurfaceVariant)
                        }
                        Text(trigger(run, automation, devices, scenes, is24Hour), style = MaterialTheme.typography.bodyLarge)
                        val reasons = if (run.outcome == "blocked") heldBack(run, automation, devices, is24Hour) else run.errors
                        reasons.forEach {
                            Text(
                                if (run.outcome == "blocked") stringResource(R.string.runs_held_back, it) else it,
                                style = MaterialTheme.typography.bodySmall,
                                color = if (run.outcome == "failed") c.error else c.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun trigger(run: AutomationRun, automation: Automation, devices: List<Device>, scenes: List<com.aiyu.domus.core.Scene>, is24Hour: Boolean): String {
    (run.trigger["manual"] as? JsonObject)?.let { actor ->
        return stringResource(R.string.runs_manual, (actor["name"] as? JsonPrimitive)?.contentOrNull.orEmpty())
    }
    val index = (run.trigger["index"] as? JsonPrimitive)?.intOrNull
    return automation.triggers.getOrNull(index ?: -1)?.let { describe(it, devices, scenes, is24Hour) } ?: stringResource(R.string.runs_trigger_removed)
}

@Composable
private fun heldBack(run: AutomationRun, automation: Automation, devices: List<Device>, is24Hour: Boolean): List<String> =
    run.conditions.filter { !it.passed }.map { check ->
        val condition = automation.conditions.getOrNull(check.index)
        val text = { key: String -> (condition?.get(key) as? JsonPrimitive)?.contentOrNull }
        when (text("type")) {
            null -> stringResource(R.string.runs_cond_removed)
            "weather" -> stringResource(
                R.string.runs_cond_weather,
                WeatherReadings.firstOrNull { it.first == text("property") }?.let { stringResource(it.second) } ?: text("property").orEmpty(),
            )
            "time_between" -> stringResource(
                R.string.runs_cond_between,
                text("start")?.let { formatClockTime(it, is24Hour) }.orEmpty(),
                text("end")?.let { formatClockTime(it, is24Hour) }.orEmpty(),
            )
            else -> stringResource(R.string.runs_cond_state, devices.firstOrNull { it.id == text("device_id") }?.name ?: stringResource(R.string.editor_removed_device))
        }
    }
