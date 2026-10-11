package com.aiyu.domus

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.aiyu.domus.ui.components.SectionTitle

private const val REPO_URL = "https://github.com/aiyu-ayaan/Domus-Rust"
private const val GITHUB_URL = "https://github.com/aiyu-ayaan"
private const val PORTFOLIO_URL = "https://aiyu.co.in"

private data class Library(val name: String, val url: String, val license: String)

/** Keep in sync with apps/android/gradle/libs.versions.toml. */
private val libraries = listOf(
    Library("Kotlin", "https://github.com/JetBrains/kotlin", "Apache-2.0"),
    Library("kotlinx.coroutines", "https://github.com/Kotlin/kotlinx.coroutines", "Apache-2.0"),
    Library("kotlinx.serialization", "https://github.com/Kotlin/kotlinx.serialization", "Apache-2.0"),
    Library("Jetpack Compose", "https://developer.android.com/jetpack/compose", "Apache-2.0"),
    Library("Material 3 for Compose", "https://developer.android.com/jetpack/androidx/releases/compose-material3", "Apache-2.0"),
    Library("AndroidX Activity, Lifecycle, Core", "https://developer.android.com/jetpack/androidx", "Apache-2.0"),
    Library("AndroidX ProfileInstaller", "https://developer.android.com/jetpack/androidx/releases/profileinstaller", "Apache-2.0"),
    Library("ZXing", "https://github.com/zxing/zxing", "Apache-2.0"),
    Library("Markdown Renderer", "https://github.com/mikepenz/multiplatform-markdown-renderer", "Apache-2.0"),
    Library("Coil", "https://github.com/coil-kt/coil", "Apache-2.0"),
    Library("DiceBear (avatar artwork)", "https://github.com/dicebear/dicebear", "MIT"),
    Library("Home Assistant (Tuya QR flow)", "https://www.home-assistant.io", "Inspiration"),
)

@Composable
private fun rememberOpenUrl(): (String) -> Unit {
    val context = LocalContext.current
    return remember(context) { { url -> context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } }
}

@Composable
fun AboutPage(onBack: () -> Unit, onOpenAcknowledgements: () -> Unit) {
    val context = LocalContext.current
    val open = rememberOpenUrl()
    val info = remember { runCatching { context.packageManager.getPackageInfo(context.packageName, 0) }.getOrNull() }
    val version = info?.versionName ?: "unknown"
    val build = info?.longVersionCode ?: 0L
    val c = MaterialTheme.colorScheme

    SubPage("About Domus", onBack) {
        SectionTitle("App")
        RowCard("Domus", "Version $version · build $build", Icons.Rounded.Info)
        RowCard("Privacy", "Runs on your own server. Credentials stay encrypted there.", Icons.Rounded.Lock)
        RowCard("Source code", "github.com/aiyu-ayaan/Domus-Rust", Icons.Rounded.Code, onClick = { open(REPO_URL) }) {
            androidx.compose.material3.Icon(Icons.AutoMirrored.Rounded.OpenInNew, null, tint = c.onSurfaceVariant)
        }

        SectionTitle("Developer")
        Column(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Image(painterResource(R.drawable.developer), "aiyu-ayaan", Modifier.size(96.dp).clip(CircleShape), contentScale = ContentScale.Crop)
            Text("aiyu-ayaan", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 8.dp))
            Text("Designed and built by one developer.", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant, textAlign = TextAlign.Center)
        }
        RowCard("GitHub", "github.com/aiyu-ayaan", Icons.Rounded.Code, onClick = { open(GITHUB_URL) }) {
            androidx.compose.material3.Icon(Icons.AutoMirrored.Rounded.OpenInNew, null, tint = c.onSurfaceVariant)
        }
        RowCard("Portfolio", "aiyu.co.in", Icons.Rounded.Language, onClick = { open(PORTFOLIO_URL) }) {
            androidx.compose.material3.Icon(Icons.AutoMirrored.Rounded.OpenInNew, null, tint = c.onSurfaceVariant)
        }

        SectionTitle("Open source")
        RowCard("Acknowledgements", "Libraries and projects Domus is built on", Icons.Rounded.Description, onClick = onOpenAcknowledgements)
    }
}

@Composable
fun AcknowledgementsPage(onBack: () -> Unit) {
    val open = rememberOpenUrl()
    SubPage("Acknowledgements", onBack) {
        libraries.forEach { lib ->
            RowCard(lib.name, "${lib.license} · ${lib.url.removePrefix("https://")}", Icons.Rounded.Description, onClick = { open(lib.url) }) {
                androidx.compose.material3.Icon(Icons.AutoMirrored.Rounded.OpenInNew, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
