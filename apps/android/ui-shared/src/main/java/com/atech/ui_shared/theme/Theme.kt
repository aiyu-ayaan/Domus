package com.atech.ui_shared.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp

private val LightColors = lightColorScheme(
    primary = DomusGreen,
    onPrimary = LightOnPrimary,
    primaryContainer = LightAccent,
    onPrimaryContainer = LightAccentForeground,
    secondary = LightForeground,
    onSecondary = LightBackground,
    secondaryContainer = LightSecondary,
    onSecondaryContainer = LightForeground,
    tertiary = DomusGreenDark,
    background = LightBackground,
    onBackground = LightForeground,
    surface = LightCard,
    onSurface = LightForeground,
    surfaceVariant = LightMuted,
    onSurfaceVariant = LightMutedForeground,
    error = LightDestructive,
    onError = LightOnPrimary,
    outline = LightBorder,
    outlineVariant = LightBorder,
)

private val DarkColors = darkColorScheme(
    primary = DomusGreen,
    onPrimary = DarkOnPrimary,
    primaryContainer = DarkAccent,
    onPrimaryContainer = DarkAccentForeground,
    secondary = DarkForeground,
    onSecondary = DarkBackground,
    secondaryContainer = DarkSecondary,
    onSecondaryContainer = DarkForeground,
    tertiary = DomusGreen,
    background = DarkBackground,
    onBackground = DarkForeground,
    surface = DarkCard,
    onSurface = DarkForeground,
    surfaceVariant = DarkMuted,
    onSurfaceVariant = DarkMutedForeground,
    error = DarkDestructive,
    onError = DarkDestructiveForeground,
    outline = DarkBorder,
    outlineVariant = DarkBorder,
)

// Web uses --radius: 0.5rem (8px) as the base, with larger cards.
val DomusShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(24.dp),
)

@Composable
fun DomusTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = DomusTypography,
        shapes = DomusShapes,
        content = content,
    )
}
