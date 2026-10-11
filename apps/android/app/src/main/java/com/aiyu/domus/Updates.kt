package com.aiyu.domus

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
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

/** At start: offers a newer release on the chosen channel. "Later" is remembered for that version. */
@Composable
fun UpdatePrompt() {
    val repository = LocalRepository.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val installed = remember { installedVersion(context) }
    var found by remember { mutableStateOf<AppUpdate?>(null) }
    // null: not downloading.
    var progress by remember { mutableStateOf<Float?>(null) }
    var failed by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        // A dev build is its own app; a release APK would install beside it, not over it.
        if (Updates.versionKey(installed) == null) return@LaunchedEffect
        found = runCatching { Updates.check(installed, repository.updateChannel.value ?: Updates.channelOf(installed)) }.getOrNull()
            ?.takeIf { it.version != repository.skippedUpdate }
    }
    val update = found ?: return
    AlertDialog(
        onDismissRequest = { if (progress == null) found = null },
        icon = { Icon(Icons.Rounded.SystemUpdate, null) },
        title = { Text("Domus ${update.version} is available") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(if (failed) "The download failed. Try again?" else "You have $installed. The update channel is in Settings.")
                progress?.let { UpdateProgress(it) }
            }
        },
        confirmButton = {
            TextButton(
                enabled = progress == null,
                onClick = {
                    scope.launch {
                        failed = false
                        progress = 0f
                        failed = runCatching { installUpdate(context, update) { progress = it } }.isFailure
                        progress = null
                        if (!failed) found = null
                    }
                },
            ) { Text(progress?.let { "Downloading ${(it * 100).toInt()}%" } ?: "Update") }
        },
        dismissButton = {
            TextButton(enabled = progress == null, onClick = { repository.skipUpdate(update.version); found = null }) { Text("Later") }
        },
    )
}
