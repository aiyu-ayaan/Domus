package com.aiyu.domus

import android.text.format.DateUtils
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.History
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.graphics.toColorInt
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aiyu.domus.core.Device
import com.aiyu.domus.ui.components.CollapsibleCard
import com.aiyu.domus.core.EffectCatalog
import com.aiyu.domus.core.LogActor
import com.aiyu.domus.core.LogEntry
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull
import java.time.Instant

private const val PAGE = 20

private val FieldLabels = mapOf(
    "brightness" to R.string.device_brightness,
    "color_temp" to R.string.device_color_temp,
    "color" to R.string.device_color,
    "effect" to R.string.device_light_effect,
    "fan_speed" to R.string.device_fan_speed,
    "fan_percent" to R.string.device_fan_speed,
    "mode" to R.string.device_mode,
)

/** The device's recent changes and who made them, newest first (the same logbook the web shows). */
@Composable
fun DeviceHistory(device: Device) {
    val repository = LocalRepository.current
    val effects by repository.effects.collectAsStateWithLifecycle()
    var limit by remember(device.id) { mutableIntStateOf(PAGE) }
    var entries by remember(device.id) { mutableStateOf<List<LogEntry>?>(null) }
    LaunchedEffect(device.id, device.state, device.isOnline, limit) {
        // The server writes the entry from the same change: give it a moment.
        if (entries != null) delay(800)
        repository.logbook(device.id, limit)?.let { entries = it }
    }
    val list = entries ?: return
    val c = MaterialTheme.colorScheme
    // Collapsed by default: the sheet stays about controls, the latest change still shows.
    CollapsibleCard(
        title = stringResource(R.string.logbook_title),
        subtitle = list.firstOrNull()?.let { "${what(it, effects)} · ${moment(it.at)}" } ?: stringResource(R.string.logbook_empty),
        leading = { Icon(Icons.Rounded.History, contentDescription = null, tint = c.onSurfaceVariant) },
    ) {
        list.forEachIndexed { i, e ->
            // The card already spaces its items and pads the sides.
            if (i > 0) HorizontalDivider(color = c.outlineVariant)
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                val color = (e.value as? JsonPrimitive)?.content?.takeIf { e.field == "color" }
                color?.let { hex -> runCatching { Color(hex.toColorInt()) }.getOrNull() }?.let {
                    Box(Modifier.size(12.dp).background(it, CircleShape))
                }
                Column(Modifier.weight(1f)) {
                    Text(what(e, effects), style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (e.field != "is_online") Text(who(e.actor), style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Text(moment(e.at), style = MaterialTheme.typography.labelMedium, color = c.onSurfaceVariant)
            }
        }
        if (list.size >= limit && limit < 200) TextButton({ limit += PAGE * 2 }) { Text(stringResource(R.string.logbook_more)) }
    }
}

@Composable
private fun what(e: LogEntry, catalog: EffectCatalog): String {
    val value = e.value as? JsonPrimitive
    return when {
        e.field == "is_on" -> stringResource(if (value?.booleanOrNull == true) R.string.logbook_turned_on else R.string.logbook_turned_off)
        e.field == "is_online" -> stringResource(if (value?.booleanOrNull == true) R.string.logbook_came_online else R.string.logbook_went_offline)
        e.field == "effect" && value?.content.isNullOrEmpty() -> stringResource(R.string.logbook_effect_stopped)
        else -> {
            val shown = when {
                value == null -> "—"
                value.intOrNull != null && !value.isString -> "${value.intOrNull}%"
                e.field == "effect" -> (catalog.effects + catalog.moods).firstOrNull { it.id == value.content }?.name ?: value.content
                else -> value.content
            }
            FieldLabels[e.field]?.let { stringResource(R.string.logbook_set_to, stringResource(it), shown) } ?: shown
        }
    }
}

@Composable
private fun who(actor: LogActor?): String = when (actor?.kind) {
    null -> stringResource(R.string.logbook_on_device)
    "screen_sync" -> stringResource(R.string.logbook_screen_sync)
    "matter" -> stringResource(R.string.logbook_matter)
    "automation" -> stringResource(R.string.logbook_by_automation, actor.name.orEmpty())
    else -> when (actor.client) {
        "web" -> stringResource(R.string.logbook_by_user_from, actor.name.orEmpty(), stringResource(R.string.logbook_client_web))
        "desktop" -> stringResource(R.string.logbook_by_user_from, actor.name.orEmpty(), stringResource(R.string.logbook_client_desktop))
        "android" -> stringResource(R.string.logbook_by_user_from, actor.name.orEmpty(), stringResource(R.string.logbook_client_android))
        else -> stringResource(R.string.logbook_by_user, actor.name.orEmpty())
    }
}

/** A clock time, with the day in front when it is not today; follows the phone's 12/24-hour setting. */
@Composable
fun moment(iso: String): String {
    val millis = runCatching { Instant.parse(iso).toEpochMilli() }.getOrNull() ?: return ""
    val flags = if (DateUtils.isToday(millis)) DateUtils.FORMAT_SHOW_TIME
    else DateUtils.FORMAT_SHOW_TIME or DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_ABBREV_MONTH or DateUtils.FORMAT_NO_YEAR
    return DateUtils.formatDateTime(LocalContext.current, millis, flags)
}
