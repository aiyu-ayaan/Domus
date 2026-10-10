package com.aiyu.domus

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.material3.MaterialTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Insights
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aiyu.domus.core.Session
import com.aiyu.domus.ui.components.FloatingNavScaffold
import com.aiyu.domus.ui.components.NavTab

private val Tabs = listOf(
    "home" to NavTab("Home", Icons.Outlined.Home, Icons.Rounded.Home),
    "devices" to NavTab("Devices", Icons.Outlined.Devices, Icons.Rounded.Devices),
    "scenes" to NavTab("Scenes", Icons.Outlined.AutoAwesome, Icons.Rounded.AutoAwesome),
    "analytics" to NavTab("Analytics", Icons.Outlined.Insights, Icons.Rounded.Insights),
    "settings" to NavTab("Settings", Icons.Outlined.Settings, Icons.Rounded.Settings),
)

@Composable
fun MainScreen(session: Session.SignedIn) {
    val repository = LocalRepository.current
    var tab by rememberSaveable { mutableStateOf("home") }
    // The open device sheet. Kept as an id so the sheet follows live state changes.
    var openDevice by rememberSaveable { mutableStateOf<String?>(null) }
    val devices by repository.devices.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(repository) { repository.messages.collect { snackbar.showSnackbar(it) } }
    BackHandler(tab != "home") { tab = "home" }

    // A page opened over the tabs: "rooms", "scene:<id>", ... Null shows the tabs.
    var page by rememberSaveable { mutableStateOf<String?>(null) }
    val open = { key: String -> page = key }
    val close = { page = null }
    BackHandler(page != null, close)

    val user = session.user
    val canControl = user.canControl
    val motion = MaterialTheme.motionScheme
    Box(Modifier.fillMaxSize()) {
        AnimatedContent(
            targetState = page,
            // Shared axis X: a page slides in from the end, the tabs come back from the start.
            transitionSpec = {
                val forward = targetState != null
                (slideInHorizontally(motion.defaultSpatialSpec()) { if (forward) it / 4 else -it / 4 } + fadeIn(motion.defaultEffectsSpec()))
                    .togetherWith(slideOutHorizontally(motion.fastSpatialSpec()) { if (forward) -it / 4 else it / 4 } + fadeOut(motion.fastEffectsSpec()))
            },
            label = "page",
        ) { current ->
            when {
                current == null -> {
                    // Analytics exists only when the home measures power or air.
                    val tabs = Tabs.filter { it.first != "analytics" || devices.measuresPower() || devices.measuresAir() }
                    val index = tabs.indexOfFirst { it.first == tab }.coerceAtLeast(0)
                    FloatingNavScaffold(tabs.map { it.second }, index, { tab = tabs[it].first }) { selected ->
                        when (tabs[selected].first) {
                            "home" -> HomeScreen(user, onOpenDevice = { openDevice = it }, onShowDevices = { tab = "devices" }, open = open)
                            "devices" -> DevicesScreen(user, onOpenDevice = { openDevice = it }, onAdd = { open("discover") })
                            "scenes" -> ScenesScreen(user, open)
                            "analytics" -> AnalyticsScreen(user, onOpenDevice = { openDevice = it }, onEditTariff = { open("tariff") })
                            else -> SettingsScreen(session, open)
                        }
                    }
                }
                current == "discover" -> DiscoverPage(close, onOpenPlugins = { open("plugins") })
                current == "plugins" -> IntegrationsPage(close, onFindDevices = { open("discover") })
                current == "rooms" -> RoomsPage(close)
                current == "people" -> UsersPage(user, close)
                current == "tariff" -> TariffPage(close)
                current == "notices" -> NoticesPage(close)
                current == "links" -> ServerLinksPage(user.isAdmin, close)
                current.startsWith("scene:") -> SceneEditorPage(current.removePrefix("scene:"), close)
                current.startsWith("automation:") -> AutomationEditorPage(current.removePrefix("automation:"), close)
            }
        }
        // Above the floating pill.
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 80.dp))
    }

    devices.firstOrNull { it.id == openDevice }?.let { device ->
        DeviceSheet(device, user, onDismiss = { openDevice = null })
    }
}
