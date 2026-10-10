package com.aiyu.domus

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import java.net.URL
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
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
 * Renders high-quality PNGs with smooth caching and fallback initials.
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
            .clip(CircleShape)
            .border(1.dp, c.outlineVariant.copy(alpha = 0.5f), CircleShape)
            .background(c.surfaceContainerHigh)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        Crossfade(targetState = bitmap, label = "avatarCrossfade") { bmp ->
            if (bmp != null) {
                Image(
                    bitmap = bmp.asImageBitmap(),
                    contentDescription = username,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(size),
                )
            } else {
                Box(
                    modifier = Modifier
                        .size(size)
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
 * Android Avatar Picker dialog allowing user to randomize or customize their DiceBear avatar.
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

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Customize Avatar") },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                // High-resolution preview
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

                // Randomize buttons
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

                // Style selection chips
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

                // Custom seed input
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
