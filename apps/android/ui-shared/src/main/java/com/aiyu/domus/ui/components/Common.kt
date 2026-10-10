package com.aiyu.domus.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialShapes
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.toPath
import androidx.compose.material3.toShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Matrix
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.graphics.shapes.Morph
import androidx.graphics.shapes.RoundedPolygon
import com.aiyu.domus.ui.theme.rememberReducedMotion
import kotlinx.coroutines.delay

private val Emphasized = CubicBezierEasing(0.2f, 0f, 0f, 1f)

/**
 * The brand mark: morphs through Material shapes while slowly turning. Each segment morphs for 60% of its time,
 * then rests, so it reads as breathing rather than spinning. Still when system animations are off.
 */
@Composable
fun MorphingShape(modifier: Modifier = Modifier) {
    val c = MaterialTheme.colorScheme
    val brush = Brush.linearGradient(listOf(c.primary, c.inversePrimary))
    val shapes: List<RoundedPolygon> = remember {
        listOf(MaterialShapes.Cookie9Sided, MaterialShapes.Clover4Leaf, MaterialShapes.Sunny, MaterialShapes.Gem, MaterialShapes.Puffy, MaterialShapes.SoftBurst)
    }
    val morphs = remember { shapes.indices.map { Morph(shapes[it], shapes[(it + 1) % shapes.size]) } }
    val live = !rememberReducedMotion()
    val transition = rememberInfiniteTransition(label = "morph")
    val t = if (live) transition.animateFloat(0f, shapes.size.toFloat(), infiniteRepeatable(tween(2400 * shapes.size, easing = LinearEasing)), label = "t") else null
    val rotation = if (live) transition.animateFloat(0f, 360f, infiniteRepeatable(tween(18_000, easing = LinearEasing)), label = "rot") else null

    val path = remember { Path() }
    val matrix = remember { Matrix() }
    Canvas(modifier) {
        val value = t?.value ?: 0f
        val index = value.toInt() % morphs.size
        val progress = Emphasized.transform(((value - value.toInt()) / 0.6f).coerceAtMost(1f))
        path.rewind()
        morphs[index].toPath(progress, path)
        // Polygons are normalized around (0.5,0.5) in unit space -> scale to canvas.
        matrix.reset()
        matrix.scale(size.width, size.height)
        path.transform(matrix)
        rotate(rotation?.value ?: 0f, pivot = Offset(size.width / 2, size.height / 2)) { drawPath(path, brush) }
    }
}

/** Tab top bar: the morphing mark, a title and a subtitle, with optional actions at the end. */
@Composable
fun ScreenHeader(title: String, subtitle: String, modifier: Modifier = Modifier, actions: @Composable RowScope.() -> Unit = {}) {
    Row(modifier.fillMaxWidth().padding(top = 16.dp), verticalAlignment = Alignment.CenterVertically) {
        MorphingShape(Modifier.size(44.dp))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.headlineLarge, modifier = Modifier.semantics { heading() })
            RollingText(subtitle, MaterialTheme.typography.bodyMedium, MaterialTheme.colorScheme.onSurfaceVariant)
        }
        actions()
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = modifier.padding(top = 8.dp).semantics { heading() })
}

/** An icon on one of the expressive Material shapes (cookie, clover, ...). */
@Composable
fun ShapedIcon(icon: ImageVector, shape: RoundedPolygon, container: Color, content: Color, modifier: Modifier = Modifier, size: Dp = 44.dp) {
    Box(modifier.size(size).clip(shape.toShape()).background(container), contentAlignment = Alignment.Center) {
        Icon(icon, contentDescription = null, tint = content, modifier = Modifier.size(size * 0.5f))
    }
}

/** Text whose changes roll in from below (live readings, counters). */
@Composable
fun RollingText(text: String, style: TextStyle, color: Color = Color.Unspecified, modifier: Modifier = Modifier) {
    val effects = MaterialTheme.motionScheme.fastEffectsSpec<Float>()
    val spatial = MaterialTheme.motionScheme.fastSpatialSpec<androidx.compose.ui.unit.IntOffset>()
    AnimatedContent(
        text,
        modifier = modifier,
        transitionSpec = { (slideInVertically(spatial) { it / 2 } + fadeIn(effects)).togetherWith(slideOutVertically(spatial) { -it / 2 } + fadeOut(effects)) },
        label = "rolling",
    ) { Text(it, style = style, color = color, maxLines = 1) }
}

/** Springs down a little while pressed. Pass the component's own interaction source. */
@Composable
fun Modifier.pressScale(source: InteractionSource): Modifier {
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.95f else 1f, MaterialTheme.motionScheme.fastSpatialSpec(), label = "press")
    return graphicsLayer { scaleX = scale; scaleY = scale }
}

/** Slides up and fades in on first show; [index] staggers siblings by 40ms. Use in plain (non-lazy) layouts. */
@Composable
fun Modifier.enterStaggered(index: Int): Modifier {
    if (rememberReducedMotion()) return this
    val progress = remember { Animatable(0f) }
    val spec = MaterialTheme.motionScheme.defaultSpatialSpec<Float>()
    LaunchedEffect(Unit) {
        delay(index.coerceAtMost(10) * 40L)
        progress.animateTo(1f, spec)
    }
    return graphicsLayer {
        alpha = progress.value.coerceIn(0f, 1f)
        translationY = (1f - progress.value) * 24.dp.toPx()
    }
}

/**
 * Hue around the ring, saturation from the center out, at full brightness (a lamp's own brightness is separate).
 * [onPick] gets `#RRGGBB` once, when the finger lifts.
 */
@Composable
fun ColorWheel(onPick: (String) -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    var picked by remember { mutableStateOf<Offset?>(null) }
    val ring = MaterialTheme.colorScheme.outline
    fun hexAt(p: Offset, size: androidx.compose.ui.unit.IntSize): String {
        val center = Offset(size.width / 2f, size.height / 2f)
        val d = p - center
        val hue = (Math.toDegrees(kotlin.math.atan2(d.y, d.x).toDouble()).toFloat() + 360f) % 360f
        val saturation = (d.getDistance() / (minOf(size.width, size.height) / 2f)).coerceIn(0f, 1f)
        return "#%06X".format(0xFFFFFF and android.graphics.Color.HSVToColor(floatArrayOf(hue, saturation, 1f)))
    }
    Canvas(
        modifier
            .semantics { contentDescription = "Color wheel" }
            .then(
                if (!enabled) Modifier else Modifier
                    .pointerInput(Unit) { detectTapGestures { picked = it; onPick(hexAt(it, size)) } }
                    .pointerInput(Unit) {
                        detectDragGestures(onDragEnd = { picked?.let { onPick(hexAt(it, size)) } }) { change, _ -> picked = change.position }
                    },
            ),
    ) {
        val radius = size.minDimension / 2
        // Sweep starts at 3 o'clock like atan2, so the color under the finger is the color sent.
        drawCircle(Brush.sweepGradient(listOf(Color.Red, Color.Yellow, Color.Green, Color.Cyan, Color.Blue, Color.Magenta, Color.Red)), radius)
        drawCircle(Brush.radialGradient(listOf(Color.White, Color.Transparent), radius = radius), radius)
        picked?.let {
            val d = it - center
            val at = if (d.getDistance() > radius) center + d * (radius / d.getDistance()) else it
            drawCircle(Color.White, 12.dp.toPx(), at)
            drawCircle(ring, 12.dp.toPx(), at, style = androidx.compose.ui.graphics.drawscope.Stroke(2.dp.toPx()))
        }
    }
}

/**
 * Material 3 Expressive Collapsible Card.
 *
 * Provides a tonal card surface with an accessible interactive header,
 * spring-based motion on expand/collapse, rotating chevron indicator,
 * and expandable content area separated by a subtle divider.
 *
 * Supports both internal state (`initiallyExpanded`) and hoisted state (`expanded` + `onExpandedChange`).
 */
@Composable
fun CollapsibleCard(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    leading: (@Composable () -> Unit)? = null,
    trailingBadge: (@Composable () -> Unit)? = null,
    initiallyExpanded: Boolean = false,
    expanded: Boolean? = null,
    onExpandedChange: ((Boolean) -> Unit)? = null,
    containerColor: Color = MaterialTheme.colorScheme.surfaceContainerHigh,
    shape: androidx.compose.ui.graphics.Shape = MaterialTheme.shapes.large,
    content: @Composable ColumnScope.() -> Unit,
) {
    var internalExpanded by rememberSaveable { mutableStateOf(initiallyExpanded) }
    val isExpanded = expanded ?: internalExpanded
    val toggle = {
        val next = !isExpanded
        if (onExpandedChange != null) {
            onExpandedChange(next)
        } else {
            internalExpanded = next
        }
    }

    val c = MaterialTheme.colorScheme
    val spatialSpec = MaterialTheme.motionScheme.defaultSpatialSpec<Float>()
    val chevronRotation by animateFloatAsState(
        targetValue = if (isExpanded) 180f else 0f,
        animationSpec = spatialSpec,
        label = "chevronRotation",
    )

    Surface(
        color = containerColor,
        shape = shape,
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(
                        role = Role.Button,
                        onClick = toggle,
                    )
                    .semantics {
                        stateDescription = if (isExpanded) "Expanded" else "Collapsed"
                    }
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (leading != null) {
                    leading()
                    Spacer(Modifier.width(16.dp))
                }
                Column(Modifier.weight(1f)) {
                    Text(title, style = MaterialTheme.typography.titleMedium)
                    if (!subtitle.isNullOrBlank()) {
                        Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                    }
                }
                if (trailingBadge != null) {
                    trailingBadge()
                    Spacer(Modifier.width(8.dp))
                }
                Icon(
                    imageVector = Icons.Rounded.ExpandMore,
                    contentDescription = if (isExpanded) "Collapse" else "Expand",
                    tint = c.onSurfaceVariant,
                    modifier = Modifier
                        .size(24.dp)
                        .graphicsLayer { rotationZ = chevronRotation },
                )
            }

            AnimatedVisibility(
                visible = isExpanded,
                enter = fadeIn(MaterialTheme.motionScheme.defaultEffectsSpec()) + expandVertically(MaterialTheme.motionScheme.defaultSpatialSpec()),
                exit = fadeOut(MaterialTheme.motionScheme.fastEffectsSpec()) + shrinkVertically(MaterialTheme.motionScheme.fastSpatialSpec()),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 16.dp, end = 16.dp, bottom = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    content = content,
                )
            }
        }
    }
}

