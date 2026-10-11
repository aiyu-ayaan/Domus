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
import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.aiyu.domus.ui.components.SectionTitle

private const val REPO_URL = "https://github.com/aiyu-ayaan/Domus-Rust"
private const val GITHUB_URL = "https://github.com/aiyu-ayaan"
private const val PORTFOLIO_URL = "https://aiyu.co.in"

private data class Library(
    val name: String? = null,
    val url: String,
    val license: String? = null,
    @StringRes val nameRes: Int = 0,
    @StringRes val licenseRes: Int = 0,
)

/** Keep in sync with apps/android/gradle/libs.versions.toml. */
private val libraries = listOf(
    Library("Kotlin", "https://github.com/JetBrains/kotlin", "Apache-2.0"),
    Library("kotlinx.coroutines", "https://github.com/Kotlin/kotlinx.coroutines", "Apache-2.0"),
    Library("kotlinx.serialization", "https://github.com/Kotlin/kotlinx.serialization", "Apache-2.0"),
    Library("Jetpack Compose", "https://developer.android.com/jetpack/compose", "Apache-2.0"),
    Library("Material 3 for Compose", "https://developer.android.com/jetpack/androidx/releases/compose-material3", "Apache-2.0"),
    Library("AndroidX Activity, Lifecycle, Core", "https://developer.android.com/jetpack/androidx", "Apache-2.0"),
    Library("AndroidX ProfileInstaller", "https://developer.android.com/jetpack/androidx/releases/profileinstaller", "Apache-2.0"),
    Library("OkHttp", "https://github.com/square/okhttp", "Apache-2.0"),
    Library("AndroidX Graphics Shapes", "https://developer.android.com/jetpack/androidx/releases/graphics", "Apache-2.0"),
    Library("ZXing", "https://github.com/zxing/zxing", "Apache-2.0"),
    Library("Markdown Renderer", "https://github.com/mikepenz/multiplatform-markdown-renderer", "Apache-2.0"),
    Library("Coil", "https://github.com/coil-kt/coil", "Apache-2.0"),
    Library(url = "https://github.com/dicebear/dicebear", license = "MIT", nameRes = R.string.about_lib_dicebear),
    Library(url = "https://open-meteo.com", license = "CC BY 4.0", nameRes = R.string.about_lib_open_meteo),
    Library(url = "https://www.home-assistant.io", nameRes = R.string.about_lib_home_assistant, licenseRes = R.string.about_license_inspiration),
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
    val version = info?.versionName ?: stringResource(R.string.about_version_unknown)
    val build = info?.longVersionCode ?: 0L
    val c = MaterialTheme.colorScheme

    SubPage(stringResource(R.string.about_title), onBack) {
        SectionTitle(stringResource(R.string.about_section_app))
        RowCard("Domus", stringResource(R.string.about_version_build, version, build), Icons.Rounded.Info)
        RowCard(stringResource(R.string.about_privacy_title), stringResource(R.string.about_privacy_subtitle), Icons.Rounded.Lock)
        RowCard(stringResource(R.string.about_source_code), "github.com/aiyu-ayaan/Domus-Rust", Icons.Rounded.Code, onClick = { open(REPO_URL) }) {
            androidx.compose.material3.Icon(Icons.AutoMirrored.Rounded.OpenInNew, null, tint = c.onSurfaceVariant)
        }

        SectionTitle(stringResource(R.string.about_section_developer))
        Column(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Image(painterResource(R.drawable.developer), "aiyu-ayaan", Modifier.size(96.dp).clip(CircleShape), contentScale = ContentScale.Crop)
            Text("aiyu-ayaan", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 8.dp))
            Text(stringResource(R.string.about_developer_tagline), style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant, textAlign = TextAlign.Center)
        }
        RowCard(stringResource(R.string.about_github), "github.com/aiyu-ayaan", Icons.Rounded.Code, onClick = { open(GITHUB_URL) }) {
            androidx.compose.material3.Icon(Icons.AutoMirrored.Rounded.OpenInNew, null, tint = c.onSurfaceVariant)
        }
        RowCard(stringResource(R.string.about_portfolio), "aiyu.co.in", Icons.Rounded.Language, onClick = { open(PORTFOLIO_URL) }) {
            androidx.compose.material3.Icon(Icons.AutoMirrored.Rounded.OpenInNew, null, tint = c.onSurfaceVariant)
        }

        SectionTitle(stringResource(R.string.about_section_open_source))
        RowCard(stringResource(R.string.about_acknowledgements), stringResource(R.string.about_acknowledgements_subtitle), Icons.Rounded.Description, onClick = onOpenAcknowledgements)
    }
}

@Composable
fun AcknowledgementsPage(onBack: () -> Unit) {
    val open = rememberOpenUrl()
    SubPage(stringResource(R.string.about_acknowledgements), onBack) {
        libraries.forEach { lib ->
            val name = if (lib.nameRes != 0) stringResource(lib.nameRes) else lib.name.orEmpty()
            val license = if (lib.licenseRes != 0) stringResource(lib.licenseRes) else lib.license.orEmpty()
            RowCard(name, "$license · ${lib.url.removePrefix("https://")}", Icons.Rounded.Description, onClick = { open(lib.url) }) {
                androidx.compose.material3.Icon(Icons.AutoMirrored.Rounded.OpenInNew, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
