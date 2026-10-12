package com.aiyu.domus

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.aiyu.domus.core.Session

/** The page Settings opens in its right pane: the first thing the person can use. */
private fun defaultPane(session: Session.SignedIn) = if (session.user.isAdmin) "discover" else "notices"

/** The list row a pane page belongs to, so a nested page keeps its parent highlighted. */
private fun listRow(page: String) = when {
    page == "acknowledgements" -> "about"
    page.startsWith("person:") -> "people"
    else -> page
}

/**
 * Settings as one list on phones, as list and detail side by side from 600dp: the list keeps the selected row
 * highlighted and the page it stands for fills the right pane, changing with a fade-through (a slide for a
 * page opened inside another).
 */
@Composable
fun SettingsTab(session: Session.SignedIn, open: (String) -> Unit) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        if (maxWidth < 600.dp) return@BoxWithConstraints SettingsScreen(session, open)

        var pane by rememberSaveable { mutableStateOf(defaultPane(session)) }
        val saved = rememberSaveableStateHolder()
        val select = { key: String -> if (key != pane) { saved.removeState(key); pane = key } }
        val close = { if (pane != listRow(pane)) pane = listRow(pane) }
        // Back from a page opened inside another returns to its parent, not out of Settings.
        BackHandler(pane != listRow(pane), close)
        val motion = MaterialTheme.motionScheme
        Row(Modifier.fillMaxSize()) {
            Surface(Modifier.width(360.dp).fillMaxHeight()) { SettingsScreen(session, select, selectedPage = listRow(pane)) }
            Surface(
                Modifier.weight(1f).fillMaxHeight().padding(top = 16.dp, end = 16.dp, bottom = 16.dp),
                color = MaterialTheme.colorScheme.surfaceContainerLow,
                shape = MaterialTheme.shapes.extraLarge,
            ) {
                AnimatedContent(
                    targetState = pane,
                    modifier = Modifier.fillMaxSize(),
                    transitionSpec = {
                        if (pageDepth(targetState) != pageDepth(initialState)) sharedAxisX(pageDepth(targetState) > pageDepth(initialState), motion)
                        else ContentTransform(
                            fadeIn(motion.defaultEffectsSpec()) + scaleIn(motion.defaultSpatialSpec(), initialScale = 0.96f),
                            fadeOut(motion.fastEffectsSpec()),
                        )
                    },
                    label = "settingsPane",
                ) { current ->
                    saved.SaveableStateProvider(current) {
                        CompositionLocalProvider(LocalHideBack provides (current == listRow(current))) {
                            PageHost(current, session, select, close)
                        }
                    }
                }
            }
        }
    }
}
