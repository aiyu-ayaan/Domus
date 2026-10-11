package com.aiyu.domus

import com.aiyu.domus.ui.theme.clickHaptics
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.aiyu.domus.core.User
import java.net.URL
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

val DICEBEAR_STYLES = listOf(
    "bottts" to "Robots",
    "lorelei" to "Lorelei",
    "avataaars" to "Avataaars",
    "adventurer" to "Adventurer",
    "micah" to "Micah",
    "pixel-art" to "Pixel Art",
    "fun-emoji" to "Fun Emoji",
    "thumbs" to "Thumbs",
    "shapes" to "Shapes",
    "rings" to "Rings",
    "identicon" to "Identicon",
    "notionists" to "Notionists",
)

private val bitmapCache = LruCache<String, Bitmap>(50)

fun parseDiceBearSpec(spec: String?, fallbackUsername: String = "user"): Pair<String, String> {
    val trimmed = spec?.trim().orEmpty()
    return when {
        trimmed.startsWith("dicebear:") -> {
            val parts = trimmed.split(":")
            val style = parts.getOrNull(1)?.ifBlank { "bottts" } ?: "bottts"
            val seed = parts.drop(2).joinToString(":").ifBlank { fallbackUsername }
            style to seed
        }
        trimmed.isNotEmpty() -> "bottts" to trimmed
        else -> "bottts" to fallbackUsername
    }
}

fun dicebearPngUrl(spec: String?, fallbackUsername: String = "user", size: Int = 256): String {
    val (style, seed) = parseDiceBearSpec(spec, fallbackUsername)
    val kebab = style.replace(Regex("([a-z])([A-Z])"), "$1-$2").lowercase()
    val encoded = URLEncoder.encode(seed, "UTF-8")
    return "https://api.dicebear.com/9.x/$kebab/png?seed=$encoded&size=$size"
}

private val SEED_WORDS = listOf(
    "Nova", "Cosmic", "Solar", "Cyber", "Neon", "Pixel", "Stellar", "Quantum",
    "Echo", "Spark", "Atlas", "Pulse", "Vivid", "Apex", "Aero", "Hyper",
    "Bot", "Pilot", "Hero", "Fox", "Panda", "Otter", "Falcon", "Phoenix"
)

fun randomDiceBearSpec(preferredStyle: String? = null): String {
    val style = preferredStyle ?: DICEBEAR_STYLES.random().first
    val seed = "${SEED_WORDS.random()}${SEED_WORDS.random()}${(100..999).random()}"
    return "dicebear:$style:$seed"
}

@Composable
fun rememberDiceBearBitmap(url: String): Bitmap? {
    var bitmap by remember(url) { mutableStateOf(bitmapCache.get(url)) }

    LaunchedEffect(url) {
        if (bitmap != null) return@LaunchedEffect
        val loaded: Bitmap? = withContext(Dispatchers.IO) {
            try {
                URL(url).openStream().use { BitmapFactory.decodeStream(it) }
            } catch (_: Exception) {
                null
            }
        }
        if (loaded != null) {
            bitmapCache.put(url, loaded)
            bitmap = loaded
        }
    }
    return bitmap
}

/**
 * Universal DiceBear Avatar component for Android.
 * Renders high-quality PNGs, cleanly centered without intrusive circular container borders.
 */
@Composable
fun UserAvatar(
    avatarSpec: String?,
    username: String,
    size: Dp = 48.dp,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
) {
    val url = remember(avatarSpec, username, size) {
        dicebearPngUrl(avatarSpec, username, size = (size.value * 3).toInt().coerceAtLeast(128))
    }
    val bitmap = rememberDiceBearBitmap(url)
    val c = MaterialTheme.colorScheme
    val initial = username.trim().firstOrNull()?.uppercase() ?: "U"

    Box(
        modifier = modifier
            .size(size)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        Crossfade(targetState = bitmap, label = "avatarCrossfade") { bmp ->
            if (bmp != null) {
                Image(
                    bitmap = bmp.asImageBitmap(),
                    contentDescription = username,
                    contentScale = ContentScale.Fit,
                    alignment = Alignment.Center,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Box(
                    modifier = Modifier
                        .size(size)
                        .clip(CircleShape)
                        .background(c.primaryContainer),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = initial,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = c.onPrimaryContainer,
                    )
                }
            }
        }
    }
}

/**
 * Dedicated Full Screen Avatar Customization Studio.
 */
@Composable
fun AvatarCustomizationPage(
    user: User,
    onBack: () -> Unit,
) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    val initial = remember(user.avatar, user.username) { parseDiceBearSpec(user.avatar, user.username) }
    var selectedStyle by remember { mutableStateOf(initial.first) }
    var seed by remember { mutableStateOf(initial.second) }
    var saving by remember { mutableStateOf(false) }
    val spec = remember(selectedStyle, seed) { "dicebear:$selectedStyle:$seed" }
    val c = MaterialTheme.colorScheme

    SubPage(
        title = "Customize Avatar",
        onBack = onBack,
        actions = {
            Button(
                onClick = {
                    scope.launch {
                        saving = true
                        repository.updateAvatar(spec)
                        saving = false
                        onBack()
                    }
                },
                enabled = !saving,
            ) {
                if (saving) {
                    LoadingIndicator(Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                } else {
                    Icon(Icons.Rounded.Check, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                }
                Text("Save")
            }
        }
    ) {
        // High-resolution Hero Preview
        Surface(
            shape = MaterialTheme.shapes.extraLarge,
            color = c.surfaceContainerHigh,
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                UserAvatar(
                    avatarSpec = spec,
                    username = user.username,
                    size = 140.dp,
                )
                Spacer(Modifier.height(16.dp))
                Text(
                    text = DICEBEAR_STYLES.firstOrNull { it.first == selectedStyle }?.second ?: selectedStyle,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "Seed: $seed",
                    style = MaterialTheme.typography.bodyMedium,
                    color = c.onSurfaceVariant,
                )
            }
        }

        // Randomize and Roll Seed buttons
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            FilledTonalButton(
                onClick = {
                    val rolled = randomDiceBearSpec()
                    val p = parseDiceBearSpec(rolled, user.username)
                    selectedStyle = p.first
                    seed = p.second
                },
                modifier = Modifier.weight(1f).heightIn(min = 48.dp),
            ) {
                Icon(Icons.Rounded.AutoAwesome, null, Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("Randomize")
            }
            FilledTonalButton(
                onClick = {
                    seed = "${SEED_WORDS.random()}${(100..999).random()}"
                },
                modifier = Modifier.weight(1f).heightIn(min = 48.dp),
            ) {
                Icon(Icons.Rounded.Refresh, null, Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("Roll Seed")
            }
        }

        Spacer(Modifier.height(8.dp))

        // Avatar Style collection selector
        Text(
            text = "Avatar Style",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            DICEBEAR_STYLES.forEach { (id, label) ->
                FilterChip(
                    selected = id == selectedStyle,
                    onClick = { selectedStyle = id },
                    label = { Text(label) },
                )
            }
        }

        Spacer(Modifier.height(8.dp))

        // Custom seed input
        Text(
            text = "Seed Phrase",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            text = "Enter any keyword, name, or character string to morph this avatar style.",
            style = MaterialTheme.typography.bodySmall,
            color = c.onSurfaceVariant,
        )
        OutlinedTextField(
            value = seed,
            onValueChange = { seed = it },
            label = { Text("Seed") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            trailingIcon = {
                IconButton(onClick = { seed = "${SEED_WORDS.random()}${(100..999).random()}" }) {
                    Icon(Icons.Rounded.Refresh, "Roll seed")
                }
            }
        )

        Spacer(Modifier.height(16.dp))

        Button(
            onClick = {
                scope.launch {
                    saving = true
                    repository.updateAvatar(spec)
                    saving = false
                    onBack()
                }
            },
            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
            enabled = !saving,
        ) {
            Icon(Icons.Rounded.Check, null, Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text("Apply Avatar")
        }
    }
}

/**
 * Kept for dialog use cases (e.g. user creation sheet).
 */
@Composable
fun AvatarPickerDialog(
    currentSpec: String?,
    username: String,
    onSave: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val initial = remember(currentSpec, username) { parseDiceBearSpec(currentSpec, username) }
    var selectedStyle by remember { mutableStateOf(initial.first) }
    var seed by remember { mutableStateOf(initial.second) }
    val spec = remember(selectedStyle, seed) { "dicebear:$selectedStyle:$seed" }

    AlertDialog(modifier = Modifier.clickHaptics(), 
        onDismissRequest = onDismiss,
        title = { Text("Customize Avatar") },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Surface(
                    shape = MaterialTheme.shapes.extraLarge,
                    color = MaterialTheme.colorScheme.surfaceContainerHigh,
                    modifier = Modifier.padding(vertical = 8.dp),
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        UserAvatar(
                            avatarSpec = spec,
                            username = username,
                            size = 88.dp,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = DICEBEAR_STYLES.firstOrNull { it.first == selectedStyle }?.second ?: selectedStyle,
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text = "Seed: $seed",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                Spacer(Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Button(
                        onClick = {
                            val rolled = randomDiceBearSpec()
                            val p = parseDiceBearSpec(rolled, username)
                            selectedStyle = p.first
                            seed = p.second
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Rounded.AutoAwesome, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Randomize")
                    }
                    Button(
                        onClick = {
                            seed = "${SEED_WORDS.random()}${(100..999).random()}"
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Rounded.Refresh, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Roll seed")
                    }
                }

                Spacer(Modifier.height(16.dp))

                Text(
                    text = "Avatar Style",
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.align(Alignment.Start),
                )
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    DICEBEAR_STYLES.forEach { (id, label) ->
                        FilterChip(
                            selected = id == selectedStyle,
                            onClick = { selectedStyle = id },
                            label = { Text(label) },
                        )
                    }
                }

                Spacer(Modifier.height(16.dp))

                OutlinedTextField(
                    value = seed,
                    onValueChange = { seed = it },
                    label = { Text("Seed") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            Button(onClick = { onSave(spec); onDismiss() }) {
                Icon(Icons.Rounded.Check, null, Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("Apply")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        },
    )
}
