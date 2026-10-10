package com.aiyu.domus

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.MeetingRoom
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import com.aiyu.domus.core.Notice
import com.aiyu.domus.core.Scene
import com.aiyu.domus.ui.components.pressScale
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
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

/** A scene as a card: lights up while active, one tap switches it. */
@Composable
private fun SceneCard(scene: Scene, enabled: Boolean, onToggle: () -> Unit) {
    val c = MaterialTheme.colorScheme
    val motion = MaterialTheme.motionScheme
    val container by animateColorAsState(if (scene.isActive) c.primaryContainer else c.surfaceContainerHigh, motion.defaultEffectsSpec(), label = "scene")
    val content by animateColorAsState(if (scene.isActive) c.onPrimaryContainer else c.onSurface, motion.defaultEffectsSpec(), label = "sceneContent")
    val corner by animateDpAsState(if (scene.isActive) 36.dp else 20.dp, motion.defaultSpatialSpec(), label = "sceneCorner")
    val source = remember { MutableInteractionSource() }
    Card(
        onClick = onToggle,
        enabled = enabled,
        shape = RoundedCornerShape(corner.coerceAtLeast(0.dp)),
        colors = CardDefaults.cardColors(containerColor = container, contentColor = content),
        interactionSource = source,
        modifier = Modifier.width(156.dp).pressScale(source).semantics { role = Role.Switch; stateDescription = if (scene.isActive) "On" else "Off" },
    ) {
        Column(Modifier.padding(16.dp)) {
            ShapedIcon(Icons.Rounded.AutoAwesome, MaterialShapes.Clover4Leaf, if (scene.isActive) c.primary else c.surfaceContainerHighest, if (scene.isActive) c.onPrimary else c.onSurfaceVariant)
            Spacer(Modifier.height(16.dp))
            Text(scene.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(if (scene.isActive) "On · tap to turn off" else "Tap to run", style = MaterialTheme.typography.bodySmall)
        }
    }
}

/**
 * The dashboard: what the home is doing right now, scenes one tap away, what is on, each room at a glance and
 * what happened lately. [open] opens a page over the tabs.
 */
@Composable
fun HomeScreen(user: User, onOpenDevice: (String) -> Unit, onShowDevices: () -> Unit, open: (String) -> Unit) {
    val repository = LocalRepository.current
    val devices by repository.devices.collectAsStateWithLifecycle()
    val scenes by repository.scenes.collectAsStateWithLifecycle()
    val energy by repository.energy.collectAsStateWithLifecycle()
    val loading by repository.loading.collectAsStateWithLifecycle()
    val live by repository.live.collectAsStateWithLifecycle()
    val c = MaterialTheme.colorScheme
    val on = devices.filter { it.isOnline && it.state.isOn == true }
    val rooms by repository.rooms.collectAsStateWithLifecycle()
    val revision by repository.revision.collectAsStateWithLifecycle()
    var notices by remember { mutableStateOf(emptyList<Notice>()) }
    LaunchedEffect(revision) { repository.request { it.notices() }?.let { notices = it.items.take(3) } }

    ScreenColumn {
        ScreenHeader(
            "${greeting()}, ${user.username}",
            if (!live && !loading) "Reconnecting…" else "${on.size} of ${devices.size} devices on",
            actions = {
                UserAvatar(
                    avatarSpec = user.avatar,
                    username = user.username,
                    size = 44.dp,
                    onClick = { open("settings") },
                )
            },
        )
        if (loading && devices.isEmpty()) {
            LoadingIndicator(Modifier.align(Alignment.CenterHorizontally).padding(top = 48.dp))
            return@ScreenColumn
        }

        // Cards appear only for what the home can measure, like the web overview.
        val metered = devices.any { it.state.watts != null }
        val overview = energy
        if (metered && overview != null) {
            // Both cards take the height of the taller one.
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).enterStaggered(0), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard("Using now", formatWatts(overview.watts), null, Icons.Rounded.Bolt, MaterialShapes.Sunny, c.primaryContainer, c.onPrimaryContainer, Modifier.weight(1f).fillMaxHeight())
                StatCard(
                    "Today", formatKwh(overview.todayKwh), formatMoney(overview.todayCost, overview.settings.currency),
                    Icons.Rounded.Today, MaterialShapes.Clover4Leaf, c.secondaryContainer, c.onSecondaryContainer, Modifier.weight(1f).fillMaxHeight(),
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
            Row(Modifier.horizontalScroll(rememberScrollState()).enterStaggered(2), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                quick.forEach { scene -> SceneCard(scene, user.canControl) { repository.toggleScene(scene, !scene.isActive) } }
            }
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            SectionTitle("On right now", Modifier.weight(1f))
            TextButton(onShowDevices) { Text("All devices") }
        }
        when {
            devices.isEmpty() -> EmptyState("No devices yet", if (user.isAdmin) "Open Devices and tap + to link Tuya, Tapo or Xiaomi." else "Ask an admin to add devices or give you access to a room.")
            on.isEmpty() -> Text("Everything is off.", color = c.onSurfaceVariant, style = MaterialTheme.typography.bodyLarge)
            else -> DeviceGrid(on, user.canControl, onOpenDevice, firstIndex = 3)
        }

        val lived = rooms.sortedBy { it.floor }.map { room -> room to devices.filter { it.roomId == room.id } }.filter { it.second.isNotEmpty() }
        if (lived.isNotEmpty()) {
            SectionTitle("Rooms")
            Row(Modifier.horizontalScroll(rememberScrollState()).enterStaggered(5), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                lived.forEach { (room, inRoom) ->
                    val active = inRoom.count { it.isOnline && it.state.isOn == true }
                    Surface(onShowDevices, Modifier.width(156.dp), color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large) {
                        Column(Modifier.padding(16.dp)) {
                            ShapedIcon(Icons.Rounded.MeetingRoom, MaterialShapes.Cookie9Sided, c.secondaryContainer, c.onSecondaryContainer)
                            Spacer(Modifier.height(16.dp))
                            Text(room.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("${inRoom.size} ${if (inRoom.size == 1) "device" else "devices"} · ${if (active == 0) "all off" else "$active on"}", style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant)
                            // The room's temperature, when something in it measures one.
                            inRoom.firstNotNullOfOrNull { it.state.temperature }?.let { Text("${it.roundToInt()}°", style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant) }
                        }
                    }
                }
            }
        }

        if (notices.isNotEmpty()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SectionTitle("Recent activity", Modifier.weight(1f))
                TextButton({ open("notices") }) { Text("See all") }
            }
            notices.forEachIndexed { i, notice ->
                RowCard(notice.title, listOfNotNull(notice.message.ifBlank { null }, timeAgo(notice.createdAt)).joinToString(" · "), Icons.Rounded.Notifications, Modifier.enterStaggered(6 + i), onClick = { open("notices") })
            }
        }
    }
}
