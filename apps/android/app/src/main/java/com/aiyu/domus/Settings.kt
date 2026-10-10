package com.aiyu.domus

import android.os.Build
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Dns
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialShapes
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aiyu.domus.core.Session
import com.aiyu.domus.ui.components.ScreenColumn
import com.aiyu.domus.ui.components.ScreenHeader
import com.aiyu.domus.ui.components.SectionTitle
import com.aiyu.domus.ui.components.ShapedIcon
import com.aiyu.domus.ui.components.enterStaggered

private val Themes = listOf("system" to "System", "light" to "Light", "dark" to "Dark")

@Composable
fun SettingsScreen(session: Session.SignedIn) {
    val repository = LocalRepository.current
    val appearance by repository.appearance.collectAsStateWithLifecycle()
    val live by repository.live.collectAsStateWithLifecycle()
    val c = MaterialTheme.colorScheme
    val context = LocalContext.current
    val version = remember { runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull() }

    ScreenColumn {
        ScreenHeader("Settings", "Domus ${version.orEmpty()}")

        Surface(color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth().enterStaggered(0)) {
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                ShapedIcon(Icons.Rounded.Person, MaterialShapes.Cookie9Sided, c.primary, c.onPrimary, size = 56.dp)
                Spacer(Modifier.width(16.dp))
                Column {
                    Text(session.user.username, style = MaterialTheme.typography.titleLarge)
                    Text(session.user.role.replaceFirstChar(Char::uppercase), style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                }
            }
        }

        SectionTitle("Server")
        Surface(color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth().enterStaggered(1)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    ShapedIcon(Icons.Rounded.Dns, MaterialShapes.Clover4Leaf, if (live) c.primary else c.surfaceContainerHighest, if (live) c.onPrimary else c.onSurfaceVariant)
                    Spacer(Modifier.width(16.dp))
                    Column {
                        Text(session.server.removePrefix("https://"), style = MaterialTheme.typography.titleMedium)
                        Text(if (live) "Live" else "Reconnecting…", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                    }
                }
                val pin = repository.pinnedFingerprint
                Text(
                    if (pin == null) "Encrypted · certificate verified by a public authority" else "Encrypted · you approved this server's own certificate:",
                    style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant,
                )
                if (pin != null) Text(pin, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace, color = c.onSurfaceVariant)
            }
        }

        SectionTitle("Appearance")
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().enterStaggered(2)) {
            Themes.forEachIndexed { index, (key, label) ->
                SegmentedButton(appearance.theme == key, { repository.setAppearance(appearance.copy(theme = key)) }, SegmentedButtonDefaults.itemShape(index, Themes.size)) { Text(label) }
            }
        }
        // Wallpaper colors exist from Android 12.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Surface(color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth().enterStaggered(3)) {
                Row(
                    Modifier
                        .toggleable(appearance.dynamicColor, role = Role.Switch) { repository.setAppearance(appearance.copy(dynamicColor = it)) }
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("Wallpaper colors", style = MaterialTheme.typography.titleMedium)
                        Text("Match the app to your wallpaper", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                    }
                    Switch(appearance.dynamicColor, onCheckedChange = null)
                }
            }
        }

        SectionTitle("Account")
        FilledTonalButton(repository::logout, Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text("Sign out") }
        OutlinedButton(repository::forgetServer, Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text("Use another server") }
    }
}
