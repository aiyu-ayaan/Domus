package com.aiyu.domus

import androidx.activity.compose.PredictiveBackHandler
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.core.animate
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.material3.MotionScheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlin.coroutines.cancellation.CancellationException

/**
 * Back gesture with a live preview. While the user drags, the returned progress runs 0..1 so the screen can shrink
 * with [predictiveBackEffect]; [onBack] runs when the gesture is committed, and a cancelled gesture eases back to 0.
 */
@Composable
fun rememberPredictiveBack(enabled: Boolean, onBack: () -> Unit): State<Float> {
    val progress = remember { mutableFloatStateOf(0f) }
    PredictiveBackHandler(enabled) { events ->
        try {
            events.collect { progress.floatValue = it.progress }
            onBack()
            progress.floatValue = 0f
        } catch (e: CancellationException) {
            withContext(NonCancellable) { animate(progress.floatValue, 0f) { value, _ -> progress.floatValue = value } }
            throw e
        }
    }
    return progress
}

/** The Material back preview: the screen scales down to 90 % and rounds its corners as [progress] grows. */
fun Modifier.predictiveBackEffect(progress: () -> Float): Modifier = graphicsLayer {
    val p = progress()
    if (p > 0f) {
        scaleX = 1f - 0.1f * p
        scaleY = 1f - 0.1f * p
        shape = RoundedCornerShape((28 * p).dp)
        clip = true
    }
}

/** Shared axis X, the motion every page change uses: the new screen slides in from the end (or back from the start) while the old one fades out. */
fun <T> AnimatedContentTransitionScope<T>.sharedAxisX(forward: Boolean, motion: MotionScheme): ContentTransform =
    (slideInHorizontally(motion.defaultSpatialSpec()) { if (forward) it / 4 else -it / 4 } + fadeIn(motion.defaultEffectsSpec()))
        .togetherWith(slideOutHorizontally(motion.fastSpatialSpec()) { if (forward) -it / 4 else it / 4 } + fadeOut(motion.fastEffectsSpec()))
