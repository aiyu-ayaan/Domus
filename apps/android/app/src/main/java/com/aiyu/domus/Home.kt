package com.aiyu.domus

import com.aiyu.domus.ui.theme.clickHaptics
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.heading
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.MeetingRoom
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.key
import kotlinx.coroutines.launch
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
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.IconButton
import androidx.compose.material.icons.rounded.Info
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
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
import com.aiyu.domus.ui.components.SectionTitle
import com.aiyu.domus.ui.components.ShapedIcon
import com.aiyu.domus.ui.components.LocalWideScreen
import com.aiyu.domus.ui.components.SideBySide
import com.aiyu.domus.ui.components.enterStaggered
import java.util.Calendar
import kotlin.math.roundToInt

@Composable
private fun greeting(): String = stringResource(
    when (Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) {
        in 0..4 -> R.string.home_greeting_night
        in 5..11 -> R.string.home_greeting_morning
        in 12..17 -> R.string.home_greeting_afternoon
        else -> R.string.home_greeting_evening
    },
)

/** One live number on a tonal card. */
@Composable
fun StatCard(
    label: String, value: String, detail: String?, icon: ImageVector, shape: RoundedPolygon,
    container: Color, content: Color, modifier: Modifier = Modifier, info: String? = null,
) {
    var showInfo by remember { mutableStateOf(false) }
    if (showInfo && info != null) {
        AlertDialog(modifier = Modifier.clickHaptics(), onDismissRequest = { showInfo = false }, confirmButton = { TextButton({ showInfo = false }) { Text(stringResource(R.string.home_got_it)) } }, title = { Text(label) }, text = { Text(info) })
    }
    Surface(color = container, contentColor = content, shape = MaterialTheme.shapes.large, modifier = modifier.semantics(mergeDescendants = true) {}) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                ShapedIcon(icon, shape, content, container, size = 40.dp)
                if (info != null) IconButton({ showInfo = true }, Modifier.size(32.dp)) { Icon(Icons.Rounded.Info, stringResource(R.string.home_about_stat, label), Modifier.size(18.dp)) }
            }
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
    val stateText = stringResource(if (scene.isActive) R.string.device_on else R.string.device_off)
    Card(
        onClick = onToggle,
        enabled = enabled,
        shape = RoundedCornerShape(corner.coerceAtLeast(0.dp)),
        colors = CardDefaults.cardColors(containerColor = container, contentColor = content),
        interactionSource = source,
        modifier = Modifier.width(156.dp).pressScale(source).semantics { role = Role.Switch; stateDescription = stateText },
    ) {
        Column(Modifier.padding(16.dp)) {
            ShapedIcon(Icons.Rounded.AutoAwesome, MaterialShapes.Clover4Leaf, if (scene.isActive) c.primary else c.surfaceContainerHighest, if (scene.isActive) c.onPrimary else c.onSurfaceVariant)
            Spacer(Modifier.height(16.dp))
            Text(scene.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(stringResource(if (scene.isActive) R.string.home_scene_on_hint else R.string.home_scene_off_hint), style = MaterialTheme.typography.bodySmall)
        }
    }
}

/**
 * The dashboard: what the home is doing right now, scenes one tap away, what is on, each room at a glance and
 * what happened lately. [open] opens a page over the tabs.
 */
/**
 * Home's top bar: the avatar in a circle at the start, the greeting over the name beside it, and what is on
 * right now as a pill at the end. Everything sits on one center line, and the name gives way before the pill does.
 */
@Composable
private fun HomeHeader(user: User, status: String, onAvatar: () -> Unit) {
    val c = MaterialTheme.colorScheme
    Row(Modifier.fillMaxWidth().padding(top = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(48.dp).clip(CircleShape).background(c.surfaceContainerHigh).clickable(onClickLabel = stringResource(R.string.home_change_avatar), role = Role.Button, onClick = onAvatar)) {
            UserAvatar(avatarSpec = user.avatar, username = user.username, size = 48.dp)
        }
        Column(Modifier.weight(1f)) {
            Text(greeting(), style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant, maxLines = 1)
            Text(user.username, style = MaterialTheme.typography.headlineSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.semantics { heading() })
        }
        Surface(color = c.secondaryContainer, contentColor = c.onSecondaryContainer, shape = CircleShape) {
            RollingText(status, MaterialTheme.typography.labelLarge, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
        }
    }
}

@Composable
fun HomeScreen(user: User, onOpenDevice: (String) -> Unit, onShowDevices: () -> Unit, open: (String) -> Unit) {
    val repository = LocalRepository.current
    val devices by repository.devices.collectAsStateWithLifecycle()
    val scenes by repository.scenes.collectAsStateWithLifecycle()
    val energy by repository.energy.collectAsStateWithLifecycle()
    val weather by repository.weather.collectAsStateWithLifecycle()
    val loading by repository.loading.collectAsStateWithLifecycle()
    val live by repository.live.collectAsStateWithLifecycle()
    val c = MaterialTheme.colorScheme
    val on = devices.filter { it.isOnline && it.state.isOn == true }
    val rooms by repository.rooms.collectAsStateWithLifecycle()
    val revision by repository.revision.collectAsStateWithLifecycle()
    var notices by remember { mutableStateOf(emptyList<Notice>()) }
    var clearNotices by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    if (clearNotices) Confirm(stringResource(R.string.home_clear_notices_title), stringResource(R.string.home_clear_notices_body), stringResource(R.string.home_delete_all), { clearNotices = false; scope.launch { repository.request { it.clearNotices() }; notices = emptyList() } }, { clearNotices = false })
    LaunchedEffect(revision) { repository.request { it.notices() }?.let { notices = it.items.take(3) } }

    ScreenColumn {
        HomeHeader(
            user,
            if (!live && !loading) stringResource(R.string.home_reconnecting) else devices.filter { it.type != "sensor" }.let { all -> stringResource(R.string.home_devices_on_of_total, all.count { it.isOnline && it.state.isOn == true }, all.size) },
            onAvatar = { open("avatar") },
        )
        if (loading && devices.isEmpty()) {
            LoadingIndicator(Modifier.align(Alignment.CenterHorizontally).padding(top = 48.dp))
            return@ScreenColumn
        }

        val cards: @Composable ColumnScope.() -> Unit = {
            // Cards appear only for what the home can measure, like the web overview.
            val metered = devices.any { it.state.watts != null }
            val overview = energy
            if (metered && overview != null) {
                val liveWatts = devices.filter { it.isOnline }.mapNotNull { it.state.watts }.sum().toDouble()
                val wattsToDisplay = if (devices.any { it.isOnline && it.state.watts != null }) liveWatts else overview.watts

                // Both cards take the height of the taller one.
                Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).enterStaggered(0), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatCard(stringResource(R.string.home_using_now), formatWatts(wattsToDisplay), null, Icons.Rounded.Bolt, MaterialShapes.Sunny, c.primaryContainer, c.onPrimaryContainer, Modifier.weight(1f).fillMaxHeight(), info = stringResource(R.string.home_using_now_info))
                    StatCard(
                        stringResource(R.string.home_today), formatKwh(overview.todayKwh), formatMoney(overview.todayCost, overview.settings.currency),
                        Icons.Rounded.Today, MaterialShapes.Clover4Leaf, c.secondaryContainer, c.onSecondaryContainer, Modifier.weight(1f).fillMaxHeight(),
                        info = stringResource(R.string.home_today_info),
                    )
                }
            }
            devices.filter { it.isOnline }.mapNotNull { it.state.pm25 }.maxOrNull()?.let { pm ->
                StatCard(
                    stringResource(R.string.home_air_quality), airLevel(pm).text(), stringResource(R.string.home_pm25_reading, pm.roundToInt()),
                    Icons.Rounded.Air, MaterialShapes.Flower, c.tertiaryContainer, c.onTertiaryContainer, Modifier.fillMaxWidth().enterStaggered(1),
                )
            }
            weather?.let { OutdoorCard(it, Modifier.fillMaxWidth().enterStaggered(1)) }
        }

        val quickScenes: @Composable ColumnScope.() -> Unit = {
            val quick = scenes.filter { it.kind == "standard" }
            if (quick.isNotEmpty()) {
                SectionTitle(stringResource(R.string.home_scenes))
                Row(Modifier.horizontalScroll(rememberScrollState()).enterStaggered(2), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    quick.forEach { scene -> SceneCard(scene, user.canControl) { repository.toggleScene(scene, !scene.isActive) } }
                }
            }
        }

        val onNow: @Composable ColumnScope.() -> Unit = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SectionTitle(stringResource(R.string.home_on_right_now), Modifier.weight(1f))
                TextButton(onShowDevices) { Text(stringResource(R.string.home_all_devices)) }
            }
            when {
                devices.isEmpty() -> EmptyState(stringResource(R.string.home_no_devices_title), stringResource(if (user.isAdmin) R.string.home_no_devices_admin else R.string.home_no_devices_member))
                on.isEmpty() -> Text(stringResource(R.string.home_everything_off), color = c.onSurfaceVariant, style = MaterialTheme.typography.bodyLarge)
                else -> DeviceGrid(on, user.canControl, onOpenDevice, firstIndex = 3)
            }
        }

        val roomCards: @Composable ColumnScope.() -> Unit = {
            val lived = rooms.sortedBy { it.floor }.map { room -> room to devices.filter { it.roomId == room.id } }.filter { it.second.isNotEmpty() }
            if (lived.isNotEmpty()) {
                SectionTitle(stringResource(R.string.home_rooms))
                Row(Modifier.horizontalScroll(rememberScrollState()).enterStaggered(5), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    lived.forEach { (room, inRoom) ->
                        val active = inRoom.count { it.isOnline && it.state.isOn == true }
                        val summary = if (active == 0) {
                            pluralStringResource(R.plurals.home_room_summary_off, inRoom.size, inRoom.size)
                        } else {
                            pluralStringResource(R.plurals.home_room_summary_on, inRoom.size, inRoom.size, active)
                        }
                        Surface(onShowDevices, Modifier.width(156.dp), color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large) {
                            Column(Modifier.padding(16.dp)) {
                                ShapedIcon(Icons.Rounded.MeetingRoom, MaterialShapes.Cookie9Sided, c.secondaryContainer, c.onSecondaryContainer)
                                Spacer(Modifier.height(16.dp))
                                Text(room.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(summary, style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant)
                                // The room's temperature, when something in it measures one.
                                inRoom.firstNotNullOfOrNull { it.state.temperature }?.let { Text("${it.roundToInt()}°", style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant) }
                            }
                        }
                    }
                }
            }
        }

        val activity: @Composable ColumnScope.() -> Unit = {
            if (notices.isNotEmpty()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SectionTitle(stringResource(R.string.home_recent_activity), Modifier.weight(1f))
                    TextButton({ clearNotices = true }) { Text(stringResource(R.string.home_delete_all)) }
                    TextButton({ open("notices") }) { Text(stringResource(R.string.home_see_all)) }
                }
                notices.forEachIndexed { i, notice ->
                    key(notice.id) {
                        // Swipe a row away to delete it; the server then tells every other client.
                        SwipeNotice(notice, { notices = notices.filter { it.id != notice.id }; scope.launch { repository.request { it.removeNotice(notice.id) } } }, Modifier.enterStaggered(6 + i), onClick = { open("notices") })
                    }
                }
            }
        }

        // A wide screen keeps the glanceable cards on the start side and what can be acted on beside them.
        if (LocalWideScreen.current) SideBySide({ cards(); quickScenes(); roomCards() }, { onNow(); activity() })
        else { cards(); quickScenes(); onNow(); roomCards(); activity() }
    }
}
