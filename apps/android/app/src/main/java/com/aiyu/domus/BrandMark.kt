package com.aiyu.domus

import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

private const val BRAND_MARK = "domus.brand.mark"

/**
 * The Domus mark (design-system/domus/brand/logo.svg): a D of three modules, one switched on. Drawn in theme
 * colours so it reads on the hero shape: modules in [base], the switched-on one in [on]. Nudged 10/256 right of
 * centre like the app icons (development/docs/BRAND.md).
 */
fun brandMark(base: Color, on: Color): ImageVector =
    ImageVector.Builder(BRAND_MARK, 24.dp, 24.dp, 256f, 256f)
        .addGroup(translationX = 10f)
        .addPath(addPathNodes("M36 52a12 12 0 0 1 12-12H116V120H36ZM132 40a88 88 0 0 1 0 176Z"), fill = SolidColor(base))
        .addPath(addPathNodes("M36 136H116V216H48a12 12 0 0 1-12-12Z"), fill = SolidColor(on))
        .clearGroup()
        .build()

/**
 * The mark on a primary-coloured hero shape, in any scheme (light, dark, wallpaper colours). Material builds every
 * scheme from fixed tones, so the choice holds for all of them: the modules are onPrimary (tone 100 light / 20 dark),
 * and the switched-on module takes the tone that stands apart from both the modules and what is behind it.
 * - Solid primary shape (40 / 80): inversePrimary (80 / 40).
 * - The primary to inversePrimary [gradient] (MorphingShape): onPrimaryContainer, outside the gradient's range;
 *   inversePrimary would melt into its far end.
 */
@Composable
fun rememberBrandMark(gradient: Boolean = false): ImageVector {
    val c = MaterialTheme.colorScheme
    val on = if (gradient) c.onPrimaryContainer else c.inversePrimary
    return remember(c.onPrimary, on) { brandMark(c.onPrimary, on) }
}

/** A hero icon on the primary shape: one colour, except the brand mark, which keeps its own two. */
@Composable
fun HeroIcon(icon: ImageVector, modifier: Modifier) =
    Icon(icon, contentDescription = null, tint = if (icon.name == BRAND_MARK) Color.Unspecified else MaterialTheme.colorScheme.onPrimary, modifier = modifier)
