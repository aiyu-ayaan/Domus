package com.aiyu.domus

import com.aiyu.domus.ui.theme.HapticSwitch
import android.app.Activity
import android.media.projection.MediaProjectionManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import com.aiyu.domus.core.User
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.MaterialShapes
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.graphics.shapes.RoundedPolygon
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aiyu.domus.ui.components.ScreenColumn
import com.aiyu.domus.ui.components.ScreenHeader
import com.aiyu.domus.ui.components.SectionTitle
import com.aiyu.domus.ui.components.ShapedIcon
import com.aiyu.domus.ui.components.enterStaggered
import java.time.Duration
import java.time.Instant

/** "5 min ago" for a server timestamp; null when it never happened or can't be read. */
fun timeAgo(iso: String?): String? {
    val seconds = runCatching { Duration.between(Instant.parse(iso), Instant.now()).seconds }.getOrNull() ?: return null
    return when {
        seconds < 60 -> "just now"
        seconds < 3600 -> "${seconds / 60} min ago"
        seconds < 86_400 -> "${seconds / 3600} h ago"
        else -> "${seconds / 86_400} d ago"
    }
}

@Composable
private fun SwitchRow(
    title: String, subtitle: String?, icon: ImageVector, shape: RoundedPolygon, checked: Boolean, enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit, modifier: Modifier = Modifier, onEdit: (() -> Unit)? = null, action: @Composable () -> Unit = {},
) {
    val c = MaterialTheme.colorScheme
    // Admins tap the row to edit it.
    Surface(
        color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large,
        modifier = modifier.fillMaxWidth().clip(MaterialTheme.shapes.large).then(if (onEdit != null) Modifier.clickable(onClickLabel = "Edit $title", onClick = onEdit) else Modifier),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            ShapedIcon(icon, shape, if (checked) c.primary else c.surfaceContainerHighest, if (checked) c.onPrimary else c.onSurfaceVariant)
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            action()
            Spacer(Modifier.width(8.dp))
            HapticSwitch(checked, onCheckedChange, enabled = enabled, modifier = Modifier.semantics { contentDescription = title })
        }
    }
}

/** Scenes to switch on and off, automations to pause or run once. Admins create and edit both. [open] opens an editor page. */
@Composable
fun ScenesScreen(user: User, open: (String) -> Unit) {
    val canControl = user.canControl
    val context = LocalContext.current
    // Screen Sync needs the system's consent to capture this screen, asked each time it starts.
    var syncing by remember { mutableStateOf<String?>(null) }
    val capture = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val scene = syncing
        val grant = result.data
        if (result.resultCode == Activity.RESULT_OK && scene != null && grant != null) ScreenSyncService.start(context, scene, grant)
        syncing = null
    }
    val repository = LocalRepository.current
    val scenes by repository.scenes.collectAsStateWithLifecycle()
    val automations by repository.automations.collectAsStateWithLifecycle()
    val loading by repository.loading.collectAsStateWithLifecycle()

    ScreenColumn {
        ScreenHeader("Scenes", "${scenes.count { it.isActive }} active · ${automations.count { it.isEnabled }.let { if (it == 1) "1 automation" else "$it automations" }} on")
        if (loading && scenes.isEmpty() && automations.isEmpty()) {
            LoadingIndicator(Modifier.align(Alignment.CenterHorizontally).padding(top = 48.dp))
            return@ScreenColumn
        }
        if (scenes.isEmpty() && automations.isEmpty()) {
            EmptyState("Nothing here yet", "A scene sets several devices at once. An automation does it for you when something happens.")
        }
        if (user.isAdmin) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilledTonalButton({ open("scene:new") }) { Text("New scene") }
                FilledTonalButton({ open("automation:new") }) { Text("New automation") }
                OutlinedButton({ open("scene:newsync") }) { Text("New Screen Sync") }
            }
        }
        if (scenes.isNotEmpty()) SectionTitle("Scenes")
        scenes.forEachIndexed { index, scene ->
            val sync = scene.kind == "screen_sync"
            SwitchRow(
                scene.name,
                if (sync) (if (scene.isActive) "Screen Sync · lights follow a screen" else "Screen Sync · mirrors this screen onto lights") else if (scene.isActive) "Active" else null,
                Icons.Rounded.AutoAwesome, MaterialShapes.Clover4Leaf,
                checked = scene.isActive,
                enabled = canControl,
                onCheckedChange = { on ->
                    if (sync && on) {
                        syncing = scene.id
                        capture.launch(context.getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent())
                    } else repository.toggleScene(scene, on) // off also ends a Screen Sync running here or on a computer
                },
                onEdit = if (user.isAdmin) ({ open("scene:${scene.id}") }) else null,
                modifier = Modifier.enterStaggered(index),
            )
        }
        if (automations.isNotEmpty()) SectionTitle("Automations")
        automations.forEachIndexed { index, automation ->
            SwitchRow(
                automation.name,
                automation.description?.ifBlank { null } ?: timeAgo(automation.lastTriggeredAt)?.let { "Last ran $it" } ?: "Never ran",
                Icons.Rounded.Bolt, MaterialShapes.Sunny,
                checked = automation.isEnabled,
                enabled = canControl,
                onCheckedChange = { repository.toggleAutomation(automation) },
                onEdit = if (user.isAdmin) ({ open("automation:${automation.id}") }) else null,
                modifier = Modifier.enterStaggered(scenes.size + index),
            ) {
                FilledTonalIconButton({ repository.runAutomation(automation) }, enabled = canControl) {
                    Icon(Icons.Rounded.PlayArrow, "Run ${automation.name} now")
                }
            }
        }
    }
}
