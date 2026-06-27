package com.atech.domus.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.atech.domus.DomusApp
import com.atech.domus.ui.dashboard.DashboardScreen
import com.atech.domus.ui.login.LoginScreen
import com.atech.domus.ui.server.ServerConfigScreen
import com.atech.ui_shared.component.DomusBackground

/** Top-level gate: server-config → login → dashboard, driven by DomusCore's flows. */
@Composable
fun DomusRoot() {
    val core = (LocalContext.current.applicationContext as DomusApp).core
    val configured by core.isConfigured.collectAsStateWithLifecycle(initialValue = null)
    val loggedIn by core.isLoggedIn.collectAsStateWithLifecycle(initialValue = false)

    val destination = when {
        configured == null -> Destination.LOADING
        configured == false -> Destination.SERVER
        !loggedIn -> Destination.LOGIN
        else -> Destination.DASHBOARD
    }

    DomusBackground {
        AnimatedContent(
            targetState = destination,
            transitionSpec = { fadeIn(tween(220)) togetherWith fadeOut(tween(180)) },
            label = "root-destination",
        ) { dest ->
            when (dest) {
                Destination.LOADING -> Box(Modifier.fillMaxSize(), Alignment.Center) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                }
                Destination.SERVER -> ServerConfigScreen()
                Destination.LOGIN -> LoginScreen()
                Destination.DASHBOARD -> DashboardScreen()
            }
        }
    }
}

private enum class Destination { LOADING, SERVER, LOGIN, DASHBOARD }
