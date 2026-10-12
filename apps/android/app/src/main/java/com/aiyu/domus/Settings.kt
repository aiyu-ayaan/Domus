package com.aiyu.domus

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AddHome
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Dns
import androidx.compose.material.icons.rounded.Extension
import androidx.compose.material.icons.rounded.Group
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.MeetingRoom
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.LockReset
import androidx.compose.material.icons.rounded.Public
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material.icons.rounded.WbTwilight
import androidx.compose.material.icons.rounded.SystemUpdate
import androidx.compose.material.icons.rounded.Translate
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import kotlinx.coroutines.launch
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.annotation.StringRes
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aiyu.domus.core.AppUpdate
import com.aiyu.domus.core.Session
import com.aiyu.domus.core.UpdateChannel
import com.aiyu.domus.core.Updates
import com.aiyu.domus.ui.components.CollapsibleCard
import com.aiyu.domus.ui.components.ScreenColumn
import com.aiyu.domus.ui.components.ScreenHeader
import com.aiyu.domus.ui.components.SectionTitle
import com.aiyu.domus.ui.components.ShapedIcon
import com.aiyu.domus.ui.components.enterStaggered
import kotlinx.coroutines.delay

private val Themes: List<Pair<String, Int>> = listOf(
    "system" to R.string.settings_theme_system,
    "light" to R.string.settings_theme_light,
    "dark" to R.string.settings_theme_dark,
)

@Composable
fun SettingsScreen(session: Session.SignedIn, open: (String) -> Unit) {
    val repository = LocalRepository.current
    val appearance by repository.appearance.collectAsStateWithLifecycle()
    val live by repository.live.collectAsStateWithLifecycle()
    val c = MaterialTheme.colorScheme
    val context = LocalContext.current
    val version = remember { installedVersion(context) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    ScreenColumn {
        ScreenHeader(stringResource(R.string.settings_title), stringResource(R.string.settings_subtitle_version, version))

        Surface(color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth().enterStaggered(0)) {
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                UserAvatar(
                    avatarSpec = session.user.avatar,
                    username = session.user.username,
                    size = 56.dp,
                    onClick = { open("avatar") },
                )
                Spacer(Modifier.width(16.dp))
                Column(Modifier.weight(1f)) {
                    Text(session.user.username, style = MaterialTheme.typography.titleLarge)
                    val roleLabel = when (session.user.role) {
                        "admin" -> stringResource(R.string.settings_role_admin)
                        "member" -> stringResource(R.string.settings_role_member)
                        "guest" -> stringResource(R.string.settings_role_guest)
                        else -> session.user.role.replaceFirstChar(Char::uppercase)
                    }
                    Text(roleLabel, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                }
                FilledTonalButton(onClick = { open("avatar") }) {
                    Text(stringResource(R.string.settings_avatar))
                }
            }
        }

        SectionTitle(stringResource(R.string.settings_section_home))
        if (session.user.isAdmin) {
            RowCard(stringResource(R.string.settings_add_devices), stringResource(R.string.settings_add_devices_subtitle), Icons.Rounded.AddHome, onClick = { open("discover") })
            RowCard(stringResource(R.string.settings_plugins), stringResource(R.string.settings_plugins_subtitle), Icons.Rounded.Extension, onClick = { open("plugins") })
            RowCard(stringResource(R.string.settings_rooms), null, Icons.Rounded.MeetingRoom, onClick = { open("rooms") })
            RowCard(stringResource(R.string.settings_people), stringResource(R.string.settings_people_subtitle), Icons.Rounded.Group, onClick = { open("people") })
            RowCard(stringResource(R.string.settings_tariff), stringResource(R.string.settings_tariff_subtitle), Icons.Rounded.Payments, onClick = { open("tariff") })
            RowCard(stringResource(R.string.settings_location), stringResource(R.string.settings_location_subtitle), Icons.Rounded.WbTwilight, onClick = { open("location") })
        }
        RowCard(stringResource(R.string.settings_notifications), stringResource(R.string.settings_notifications_subtitle), Icons.Rounded.Notifications, onClick = { open("notices") })
        // Opt-in: without a cloud push service, alerts need a connection that stays open.
        val alerts by repository.backgroundAlerts.collectAsStateWithLifecycle()
        val setAlerts = { on: Boolean -> repository.setBackgroundAlerts(on); AlertsService.apply(context) }
        val askToNotify = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> setAlerts(granted) }
        Surface(color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
            Row(
                Modifier
                    .toggleable(alerts, role = Role.Switch) { on ->
                        if (on && Build.VERSION.SDK_INT >= 33) askToNotify.launch(Manifest.permission.POST_NOTIFICATIONS) else setAlerts(on)
                    }
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.settings_background_alerts), style = MaterialTheme.typography.titleMedium)
                    Text(stringResource(R.string.settings_background_alerts_subtitle), style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                }
                Switch(alerts, onCheckedChange = null)
            }
        }

        SectionTitle(stringResource(R.string.settings_section_server))
        val pin = repository.pinnedFingerprint
        CollapsibleCard(
            title = session.server.removePrefix("https://"),
            subtitle = if (live) (if (pin != null) stringResource(R.string.settings_server_live_pinned) else stringResource(R.string.settings_server_live_public)) else stringResource(R.string.settings_server_reconnecting),
            leading = {
                ShapedIcon(Icons.Rounded.Dns, MaterialShapes.Clover4Leaf, if (live) c.primary else c.surfaceContainerHighest, if (live) c.onPrimary else c.onSurfaceVariant)
            },
            trailingBadge = {
                if (live) {
                    Surface(
                        color = c.primaryContainer.copy(alpha = 0.7f),
                        shape = MaterialTheme.shapes.extraSmall,
                    ) {
                        Text(
                            stringResource(R.string.settings_server_live_badge),
                            style = MaterialTheme.typography.labelSmall,
                            color = c.onPrimaryContainer,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        )
                    }
                }
            },
            modifier = Modifier.fillMaxWidth().enterStaggered(1),
        ) {
            Text(
                if (pin == null) stringResource(R.string.settings_server_cert_public) else stringResource(R.string.settings_server_cert_pinned),
                style = MaterialTheme.typography.bodyMedium,
                color = c.onSurfaceVariant,
            )
            if (pin != null) {
                var copied by remember { mutableStateOf(false) }
                val clipboard = remember { context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager }
                Surface(
                    color = c.surfaceContainerHighest,
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                stringResource(R.string.settings_sha256_fingerprint),
                                style = MaterialTheme.typography.labelMedium,
                                color = c.onSurfaceVariant,
                            )
                            FilledTonalButton(
                                onClick = {
                                    clipboard?.setPrimaryClip(ClipData.newPlainText(context.getString(R.string.settings_fingerprint_clip_label), pin))
                                    copied = true
                                },
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                                modifier = Modifier.heightIn(min = 32.dp),
                            ) {
                                AnimatedContent(
                                    targetState = copied,
                                    label = "copyAnimation",
                                ) { isCopied ->
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    ) {
                                        Icon(
                                            imageVector = if (isCopied) Icons.Rounded.Check else Icons.Rounded.ContentCopy,
                                            contentDescription = null,
                                            modifier = Modifier.size(16.dp),
                                        )
                                        Text(
                                            if (isCopied) stringResource(R.string.settings_copied) else stringResource(R.string.settings_copy),
                                            style = MaterialTheme.typography.labelMedium,
                                        )
                                    }
                                }
                            }
                        }
                        LaunchedEffect(copied) {
                            if (copied) {
                                delay(2000L)
                                copied = false
                            }
                        }
                        Text(
                            pin,
                            style = MaterialTheme.typography.bodySmall,
                            fontFamily = FontFamily.Monospace,
                            color = c.onSurface,
                        )
                    }
                }
            }
        }

        RowCard(stringResource(R.string.settings_change_password), stringResource(R.string.settings_change_password_subtitle), Icons.Rounded.LockReset, onClick = { open("password") })
        RowCard(stringResource(R.string.settings_server_addresses), stringResource(R.string.settings_server_addresses_subtitle), Icons.Rounded.Public, onClick = { open("links") })
        RowCard(stringResource(R.string.settings_updates), stringResource(R.string.settings_updates_subtitle, version), Icons.Rounded.SystemUpdate, onClick = { open("updates") })
        RowCard(stringResource(R.string.settings_about), stringResource(R.string.settings_about_subtitle, version), Icons.Rounded.Info, onClick = { open("about") })

        RowCard(stringResource(R.string.settings_language), languageLabel(), Icons.Rounded.Translate, onClick = { open("language") })

        CollapsibleCard(
            title = stringResource(R.string.settings_appearance),
            subtitle = Themes.firstOrNull { it.first == appearance.theme }?.second?.let { stringResource(it) },
            leading = { ShapedIcon(Icons.Rounded.Palette, MaterialShapes.Clover4Leaf, c.surfaceContainerHighest, c.onSurfaceVariant) },
        ) {
            Column(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    Themes.forEachIndexed { index, (key, labelRes) ->
                        SegmentedButton(appearance.theme == key, { repository.setAppearance(appearance.copy(theme = key)) }, SegmentedButtonDefaults.itemShape(index, Themes.size)) { Text(stringResource(labelRes)) }
                    }
                }
                // Wallpaper colors exist from Android 12.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    Row(
                        Modifier.toggleable(appearance.dynamicColor, role = Role.Switch) { repository.setAppearance(appearance.copy(dynamicColor = it)) },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(stringResource(R.string.settings_wallpaper_colors), style = MaterialTheme.typography.titleMedium)
                            Text(stringResource(R.string.settings_wallpaper_colors_subtitle), style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                        }
                        Switch(appearance.dynamicColor, onCheckedChange = null)
                    }
                }
            }
        }

        SectionTitle(stringResource(R.string.settings_section_account))
        CollapsibleCard(
            title = session.user.username,
            subtitle = stringResource(R.string.settings_account_subtitle),
            leading = { ShapedIcon(Icons.Rounded.Person, MaterialShapes.Clover4Leaf, c.surfaceContainerHighest, c.onSurfaceVariant) },
        ) {
            Column(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                FilledTonalButton(repository::logout, Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text(stringResource(R.string.settings_sign_out)) }
                OutlinedButton(repository::forgetServer, Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text(stringResource(R.string.settings_use_another_server)) }
            }
        }
    }
}
