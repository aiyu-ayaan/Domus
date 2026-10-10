package com.aiyu.domus.ui.theme

import androidx.compose.foundation.Indication
import androidx.compose.foundation.IndicationNodeFactory
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.material3.Switch
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.node.CompositionLocalConsumerModifierNode
import androidx.compose.ui.node.DelegatableNode
import androidx.compose.ui.node.DelegatingNode
import androidx.compose.ui.node.currentValueOf
import androidx.compose.ui.platform.LocalHapticFeedback
import kotlinx.coroutines.launch

/**
 * The ripple, plus a light tick when a press completes. Every Material component and `clickable`
 * reads [LocalIndication], so providing this once gives the whole app click feedback.
 * A cancelled press (scroll, drag off) emits no Release, so it stays silent.
 */
private object HapticRipple : IndicationNodeFactory {
    private val ripple = ripple()

    override fun create(interactionSource: InteractionSource): DelegatableNode = HapticNode(interactionSource, ripple)
    override fun equals(other: Any?) = other === this
    override fun hashCode() = -1
}

private class HapticNode(private val source: InteractionSource, ripple: IndicationNodeFactory) :
    DelegatingNode(), CompositionLocalConsumerModifierNode {
    init {
        delegate(ripple.create(source))
    }

    override fun onAttach() {
        val haptic = currentValueOf(LocalHapticFeedback)
        coroutineScope.launch {
            source.interactions.collect { if (it is PressInteraction.Release) haptic.performHapticFeedback(HapticFeedbackType.VirtualKey) }
        }
    }
}

/** Wrap the app once, inside the theme, so [LocalIndication] is the haptic ripple. */
@Composable
fun WithClickHaptics(content: @Composable () -> Unit) =
    CompositionLocalProvider(LocalIndication provides HapticRipple as Indication, content = content)

/** [Switch] ticks on and off. Its own toggle draws no indication, so [WithClickHaptics] can't reach it. */
@Composable
fun HapticSwitch(checked: Boolean, onCheckedChange: (Boolean) -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val haptic = LocalHapticFeedback.current
    Switch(
        checked,
        { haptic.performHapticFeedback(if (it) HapticFeedbackType.ToggleOn else HapticFeedbackType.ToggleOff); onCheckedChange(it) },
        modifier,
        enabled = enabled,
    )
}
