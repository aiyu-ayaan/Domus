package com.aiyu.domus

import com.aiyu.domus.ui.theme.clickHaptics
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.runtime.mutableIntStateOf
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aiyu.domus.core.UpdateChannel
import com.aiyu.domus.core.UpdateCheck
import com.aiyu.domus.ui.components.SectionTitle
import com.mikepenz.markdown.coil3.Coil3ImageTransformerImpl
import com.mikepenz.markdown.m3.Markdown
import com.mikepenz.markdown.m3.markdownTypography
import kotlinx.coroutines.CoroutineScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.SystemUpdate
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearWavyProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.aiyu.domus.core.AppUpdate
import com.aiyu.domus.core.Updates
import java.io.File
import kotlinx.coroutines.launch

/** The installed version name; a dev build's does not parse as a release ([Updates.versionKey]). */
fun installedVersion(context: Context): String =
    runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull().orEmpty()

/** Downloads [update], reporting 0..1 to [onProgress], and hands it to Android's installer. Throws when it fails. */
suspend fun installUpdate(context: Context, update: AppUpdate, onProgress: (Float) -> Unit) {
    val apk = Updates.download(update, File(context.cacheDir, "updates"), onProgress)
    // Android's own installer; it asks to allow installs from Domus the first time.
    context.startActivity(
        Intent(Intent.ACTION_VIEW)
            .setDataAndType(FileProvider.getUriForFile(context, "${context.packageName}.updates", apk), "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK),
    )
}

@Composable
fun UpdateProgress(progress: Float) = LinearWavyProgressIndicator(progress = { progress.coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())

/** One download at a time: [progress] is 0..1 while it runs and null otherwise. */
class Installer(private val context: Context, private val scope: CoroutineScope) {
    var progress by mutableStateOf<Float?>(null)
        private set
    var failed by mutableStateOf(false)
        private set

    fun start(update: AppUpdate, onDone: () -> Unit = {}) {
        if (progress != null) return
        scope.launch {
            failed = false
            progress = 0f
            failed = runCatching { installUpdate(context, update) { progress = it } }.isFailure
            progress = null
            if (!failed) onDone()
        }
    }
}

@Composable
fun rememberInstaller(): Installer {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    return remember { Installer(context, scope) }
}

/** Release notes as written on the release: Markdown with headings, lists, links, tables and images. */
@Composable
fun ReleaseNotes(markdown: String, modifier: Modifier = Modifier) {
    val type = MaterialTheme.typography
    Markdown(
        markdown,
        modifier = modifier.fillMaxWidth(),
        // Notes sit inside a page that already has a title: their headings stay below it.
        typography = markdownTypography(h1 = type.titleLarge, h2 = type.titleMedium, h3 = type.titleSmall, h4 = type.titleSmall, h5 = type.labelLarge, h6 = type.labelLarge),
        imageTransformer = Coil3ImageTransformerImpl,
    )
}

/** At start: offers a newer release on the chosen channel with its notes. "Later" is remembered for that version. */
@Composable
fun UpdatePrompt() {
    val repository = LocalRepository.current
    val context = LocalContext.current
    val installed = remember { installedVersion(context) }
    var found by remember { mutableStateOf<AppUpdate?>(null) }
    val installer = rememberInstaller()
    LaunchedEffect(Unit) {
        // A dev build is its own app; a release APK would install beside it, not over it.
        if (Updates.versionKey(installed) == null) return@LaunchedEffect
        found = runCatching { Updates.check(installed, repository.updateChannel.value ?: Updates.channelOf(installed)).update }.getOrNull()
            ?.takeIf { it.version != repository.skippedUpdate }
    }
    val update = found ?: return
    val progress = installer.progress
    AlertDialog(modifier = Modifier.clickHaptics(), 
        onDismissRequest = { if (progress == null) found = null },
        icon = { Icon(Icons.Rounded.SystemUpdate, null) },
        title = { Text(stringResource(R.string.update_available_title, update.version)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(if (installer.failed) stringResource(R.string.update_download_failed_retry_prompt) else stringResource(R.string.update_prompt_body, installed))
                // Long notes scroll inside the dialog so its buttons stay in reach.
                if (update.notes.isNotBlank()) ReleaseNotes(update.notes, Modifier.heightIn(max = 260.dp).verticalScroll(rememberScrollState()))
                progress?.let { UpdateProgress(it) }
            }
        },
        confirmButton = {
            TextButton(enabled = progress == null, onClick = { installer.start(update) { found = null } }) {
                Text(progress?.let { stringResource(R.string.update_downloading_percent, (it * 100).toInt()) } ?: stringResource(R.string.update_action))
            }
        },
        dismissButton = {
            TextButton(enabled = progress == null, onClick = { repository.skipUpdate(update.version); found = null }) { Text(stringResource(R.string.update_later)) }
        },
    )
}

/**
 * Settings > Updates: what is installed, whether the channel has something newer, and the release notes.
 * The notes are those of the update when there is one, otherwise those of the installed version.
 */
@Composable
fun UpdatesPage(onBack: () -> Unit) {
    val repository = LocalRepository.current
    val context = LocalContext.current
    val c = MaterialTheme.colorScheme
    val installed = remember { installedVersion(context) }
    // A dev build is its own app; a release APK would install beside it, not over it.
    val released = Updates.versionKey(installed) != null
    val chosen by repository.updateChannel.collectAsStateWithLifecycle()
    val channel = chosen ?: Updates.channelOf(installed)
    // null: still asking.
    var result by remember { mutableStateOf<Result<UpdateCheck>?>(null) }
    var asked by remember { mutableIntStateOf(0) }
    LaunchedEffect(channel, asked) {
        result = null
        result = runCatching { Updates.check(installed, channel) }
    }
    val installer = rememberInstaller()
    val progress = installer.progress
    val found = result?.getOrNull()?.update

    SubPage(stringResource(R.string.update_title), onBack) {
        Surface(color = if (found != null) c.primaryContainer else c.surfaceContainerHigh, shape = MaterialTheme.shapes.extraLarge, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Icon(Icons.Rounded.SystemUpdate, contentDescription = null)
                Text(
                    when {
                        found != null -> stringResource(R.string.update_available_title, found.version)
                        result == null -> stringResource(R.string.update_checking)
                        result?.isFailure == true -> stringResource(R.string.update_check_failed)
                        !released -> stringResource(R.string.update_dev_build)
                        else -> stringResource(R.string.update_up_to_date)
                    },
                    style = MaterialTheme.typography.titleLarge,
                )
                Text(
                    when {
                        installer.failed -> stringResource(R.string.update_download_failed_retry)
                        result?.isFailure == true -> stringResource(R.string.update_check_failed_body, installed)
                        !released -> stringResource(R.string.update_dev_build_body, installed)
                        else -> stringResource(R.string.update_you_have, installed)
                    },
                    style = MaterialTheme.typography.bodyMedium,
                )
                progress?.let { UpdateProgress(it) }
                if (found != null) {
                    Button({ installer.start(found) }, Modifier.fillMaxWidth().heightIn(min = 56.dp), enabled = progress == null) {
                        Text(progress?.let { stringResource(R.string.update_downloading_percent, (it * 100).toInt()) } ?: stringResource(R.string.update_download_install))
                    }
                } else if (result != null) {
                    OutlinedButton({ asked++ }, Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text(stringResource(R.string.update_check_again)) }
                }
            }
        }

        if (released) {
            SectionTitle(stringResource(R.string.update_channel))
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                UpdateChannel.entries.forEachIndexed { index, item ->
                    SegmentedButton(channel == item, { repository.setUpdateChannel(item) }, SegmentedButtonDefaults.itemShape(index, UpdateChannel.entries.size), enabled = progress == null) { Text(item.text()) }
                }
            }
            Text(stringResource(R.string.update_channel_hint), style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
        }

        val notes = found?.notes ?: result?.getOrNull()?.installedNotes
        SectionTitle(if (found != null) stringResource(R.string.update_whats_new_in, found.version) else stringResource(R.string.update_in_this_version))
        when {
            !notes.isNullOrBlank() -> ReleaseNotes(notes)
            result == null -> Text(stringResource(R.string.update_loading_notes), style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
            else -> Text(stringResource(R.string.update_no_notes), style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
        }
    }
}
