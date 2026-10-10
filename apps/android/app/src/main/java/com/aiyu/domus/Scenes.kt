package com.aiyu.domus

import androidx.compose.foundation.layout.Column
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
private fun timeAgo(iso: String?): String? {
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
    onCheckedChange: (Boolean) -> Unit, modifier: Modifier = Modifier, action: @Composable () -> Unit = {},
) {
    val c = MaterialTheme.colorScheme
    Surface(color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = modifier.fillMaxWidth()) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            ShapedIcon(icon, shape, if (checked) c.primary else c.surfaceContainerHighest, if (checked) c.onPrimary else c.onSurfaceVariant)
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            action()
            Spacer(Modifier.width(8.dp))
            Switch(checked, onCheckedChange, enabled = enabled, modifier = Modifier.semantics { contentDescription = title })
        }
    }
}

/** Scenes to switch on and off, automations to pause or run once. They are built in the web app. */
@Composable
fun ScenesScreen(canControl: Boolean) {
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
            EmptyState("Nothing here yet", "Create scenes and automations in the Domus web app. You can run them from here.")
        }
        if (scenes.isNotEmpty()) SectionTitle("Scenes")
        scenes.forEachIndexed { index, scene ->
            val sync = scene.kind == "screen_sync"
            SwitchRow(
                scene.name,
                if (sync) "Screen Sync · starts from a computer" else if (scene.isActive) "Active" else null,
                Icons.Rounded.AutoAwesome, MaterialShapes.Clover4Leaf,
                checked = scene.isActive,
                // A phone can stop a running Screen Sync but can't capture a screen to start one.
                enabled = canControl && (!sync || scene.isActive),
                onCheckedChange = { repository.toggleScene(scene, it) },
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
                modifier = Modifier.enterStaggered(scenes.size + index),
            ) {
                FilledTonalIconButton({ repository.runAutomation(automation) }, enabled = canControl) {
                    Icon(Icons.Rounded.PlayArrow, "Run ${automation.name} now")
                }
            }
        }
    }
}
