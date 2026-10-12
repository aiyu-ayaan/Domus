package com.aiyu.domus

import android.app.Activity
import android.app.LocaleManager
import android.content.Context
import android.content.res.Configuration
import android.content.res.Resources
import android.os.Build
import android.os.LocaleList
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import java.util.Locale

/**
 * The app's own language. Android 13+ hands it to the system [LocaleManager], which also lists it under
 * Settings > App languages; below that the choice is kept in prefs and applied to each Context through [wrap].
 * The empty tag follows the phone, and a phone language without a translation shows English.
 */
object AppLocale {
    /** Must match the `values-*` folders; the manifest's locale list is generated from those. */
    val tags = listOf(
        "en", "hi", "es", "pt-BR", "id", "ar", "fr", "ru", "de",
        "tr", "ja", "ko", "it", "vi", "th", "zh-CN", "zh-TW", "pl", "bn",
        "ta", "te", "mr", "gu", "kn", "ml", "pa", "ur",
    )

    private const val PREFS = "app_locale"
    private const val KEY = "tag"

    private fun stored(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "").orEmpty()

    /** The chosen tag, or "" while the app follows the phone. */
    fun current(context: Context): String {
        if (Build.VERSION.SDK_INT < 33) return stored(context)
        val applied = context.getSystemService(LocaleManager::class.java).applicationLocales
        if (applied.isEmpty) return ""
        val locale = applied[0]
        fun matches(tag: String, region: Boolean) = Locale.forLanguageTag(tag).let { it.language == locale.language && (!region || it.country == locale.country) }
        return tags.firstOrNull { matches(it, region = true) } ?: tags.firstOrNull { matches(it, region = false) } ?: ""
    }

    fun set(activity: Activity, tag: String) {
        if (Build.VERSION.SDK_INT >= 33) {
            // The system recreates the activity itself.
            activity.getSystemService(LocaleManager::class.java).applicationLocales =
                if (tag.isEmpty()) LocaleList.getEmptyLocaleList() else LocaleList.forLanguageTags(tag)
        } else {
            activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, tag).apply()
            activity.recreate()
        }
    }

    /** [base] in the chosen language. Only does anything below Android 13; from there the system applies it. */
    fun wrap(base: Context): Context {
        if (Build.VERSION.SDK_INT >= 33) return base
        val tag = stored(base)
        // Formatting follows the same language as the text, and returns to the phone's when the choice is cleared.
        val locale = if (tag.isEmpty()) Resources.getSystem().configuration.locales[0] else Locale.forLanguageTag(tag)
        Locale.setDefault(locale)
        if (tag.isEmpty()) return base
        return base.createConfigurationContext(Configuration(base.resources.configuration).apply { setLocales(LocaleList(locale)) })
    }

    /** A language's own name ("Español"), readable whatever language the app is in. */
    fun nativeName(tag: String): String = Locale.forLanguageTag(tag).let { it.getDisplayName(it).replaceFirstChar { c -> c.titlecase(it) } }
}

/** The language shown in Settings: the chosen one by its own name, or "System default". */
@Composable
fun languageLabel(): String {
    val context = LocalContext.current
    val tag = remember(LocalConfiguration.current) { AppLocale.current(context) }
    return if (tag.isEmpty()) stringResource(R.string.settings_language_system) else AppLocale.nativeName(tag)
}

@Composable
fun LanguagePage(onBack: () -> Unit) {
    val activity = LocalActivity.current
    val context = LocalContext.current
    val shown = LocalConfiguration.current.locales[0]
    // Choosing recreates the activity, so this is read again with the new choice.
    val current = remember(shown) { AppLocale.current(context) }
    val c = MaterialTheme.colorScheme

    SubPage(stringResource(R.string.settings_language), onBack) {
        Surface(color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.selectableGroup()) {
                (listOf("") + AppLocale.tags).forEachIndexed { index, tag ->
                    if (index > 0) HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = c.outlineVariant)
                    val native = if (tag.isEmpty()) stringResource(R.string.settings_language_system) else AppLocale.nativeName(tag)
                    // The same language named in the one on screen, for a reader who cannot read its own script.
                    val translated = if (tag.isEmpty()) null else Locale.forLanguageTag(tag).getDisplayName(shown).takeIf { !it.equals(native, ignoreCase = true) }
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .selectable(tag == current, role = Role.RadioButton) { if (tag != current) activity?.let { AppLocale.set(it, tag) } }
                            .heightIn(min = 64.dp)
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(native, style = MaterialTheme.typography.titleMedium)
                            if (translated != null) Text(translated, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                        }
                        Spacer(Modifier.width(16.dp))
                        RadioButton(tag == current, onClick = null)
                    }
                }
            }
        }
    }
}
