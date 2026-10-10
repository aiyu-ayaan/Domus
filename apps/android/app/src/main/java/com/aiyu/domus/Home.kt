package com.aiyu.domus

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Air
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Today
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.MaterialShapes
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.graphics.shapes.RoundedPolygon
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aiyu.domus.core.User
import com.aiyu.domus.core.airLevel
import com.aiyu.domus.core.formatKwh
import com.aiyu.domus.core.formatMoney
import com.aiyu.domus.core.formatWatts
import com.aiyu.domus.ui.components.RollingText
import com.aiyu.domus.ui.components.ScreenColumn
import com.aiyu.domus.ui.components.ScreenHeader
import com.aiyu.domus.ui.components.SectionTitle
import com.aiyu.domus.ui.components.ShapedIcon
import com.aiyu.domus.ui.components.enterStaggered
import java.util.Calendar
import kotlin.math.roundToInt

private fun greeting(): String = when (Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) {
    in 0..4 -> "Good night"
    in 5..11 -> "Good morning"
    in 12..17 -> "Good afternoon"
    else -> "Good evening"
}

/** One live number on a tonal card. */
@Composable
fun StatCard(
    label: String, value: String, detail: String?, icon: ImageVector, shape: RoundedPolygon,
    container: Color, content: Color, modifier: Modifier = Modifier,
) {
    Surface(color = container, contentColor = content, shape = MaterialTheme.shapes.large, modifier = modifier.semantics(mergeDescendants = true) {}) {
        Column(Modifier.padding(16.dp)) {
            ShapedIcon(icon, shape, content, container, size = 40.dp)
            Spacer(Modifier.height(12.dp))
            Text(label, style = MaterialTheme.typography.labelLarge)
            RollingText(value, MaterialTheme.typography.headlineMedium)
            if (detail != null) RollingText(detail, MaterialTheme.typography.bodyMedium)
        }
    }
}

/** The dashboard: what the home is doing right now, scenes one tap away, and everything that is on. */
@Composable
fun HomeScreen(user: User, onOpenDevice: (String) -> Unit, onShowDevices: () -> Unit) {
    val repository = LocalRepository.current
    val devices by repository.devices.collectAsStateWithLifecycle()
    val scenes by repository.scenes.collectAsStateWithLifecycle()
    val energy by repository.energy.collectAsStateWithLifecycle()
    val loading by repository.loading.collectAsStateWithLifecycle()
    val live by repository.live.collectAsStateWithLifecycle()
    val c = MaterialTheme.colorScheme
    val on = devices.filter { it.isOnline && it.state.isOn == true }

    ScreenColumn {
        ScreenHeader(
            "${greeting()}, ${user.username}",
            if (!live && !loading) "Reconnecting…" else "${on.size} of ${devices.size} devices on",
        )
        if (loading && devices.isEmpty()) {
            LoadingIndicator(Modifier.align(Alignment.CenterHorizontally).padding(top = 48.dp))
            return@ScreenColumn
        }

        // Cards appear only for what the home can measure, like the web overview.
        val metered = devices.any { it.state.watts != null }
        val overview = energy
        if (metered && overview != null) {
            Row(Modifier.fillMaxWidth().enterStaggered(0), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard("Using now", formatWatts(overview.watts), null, Icons.Rounded.Bolt, MaterialShapes.Sunny, c.primaryContainer, c.onPrimaryContainer, Modifier.weight(1f))
                StatCard(
                    "Today", formatKwh(overview.todayKwh), formatMoney(overview.todayCost, overview.settings.currency),
                    Icons.Rounded.Today, MaterialShapes.Clover4Leaf, c.secondaryContainer, c.onSecondaryContainer, Modifier.weight(1f),
                )
            }
        }
        devices.mapNotNull { it.state.pm25 }.maxOrNull()?.let { pm ->
            StatCard(
                "Air quality", airLevel(pm).label, "PM2.5 ${pm.roundToInt()} µg/m³",
                Icons.Rounded.Air, MaterialShapes.Flower, c.tertiaryContainer, c.onTertiaryContainer, Modifier.fillMaxWidth().enterStaggered(1),
            )
        }

        val quick = scenes.filter { it.kind == "standard" }
        if (quick.isNotEmpty()) {
            SectionTitle("Scenes")
            Row(Modifier.horizontalScroll(rememberScrollState()).enterStaggered(2), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                quick.forEach { scene ->
                    FilterChip(
                        selected = scene.isActive,
                        onClick = { repository.toggleScene(scene, !scene.isActive) },
                        label = { Text(scene.name) },
                        leadingIcon = if (scene.isActive) ({ Icon(Icons.Rounded.Check, contentDescription = null) }) else null,
                        enabled = user.canControl,
                    )
                }
            }
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            SectionTitle("On right now", Modifier.weight(1f))
            TextButton(onShowDevices) { Text("All devices") }
        }
        when {
            devices.isEmpty() -> EmptyState("No devices yet", if (user.isAdmin) "Open Devices and tap + to link Tuya, Tapo or Xiaomi." else "Ask an admin to add devices or give you access to a room.")
            on.isEmpty() -> EmptyState("Everything is off", "Devices you switch on appear here.")
            else -> DeviceGrid(on, user.canControl, onOpenDevice, firstIndex = 3)
        }
    }
}
