package com.aiyu.domus

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
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aiyu.domus.core.Session
import com.aiyu.domus.ui.components.FloatingNavScaffold
import com.aiyu.domus.ui.components.NavTab

/** How deep a page sits: tabs 0, pages 1, About's Acknowledgements and a person under People 2. Decides which way a change slides. */
private fun pageDepth(page: String?) = when {
    page == null -> 0
    page == "acknowledgements" || page.startsWith("person:") -> 2
    else -> 1
}

@Composable
fun MainScreen(session: Session.SignedIn) {
    val repository = LocalRepository.current
    var tab by rememberSaveable { mutableStateOf("home") }
    // The open device sheet. Kept as an id so the sheet follows live state changes.
    var openDevice by rememberSaveable { mutableStateOf<String?>(null) }
    val devices by repository.devices.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(repository) { repository.messages.collect { snackbar.showSnackbar(it) } }

    // A page opened over the tabs: "rooms", "scene:<id>", ... Null shows the tabs.
    var page by rememberSaveable { mutableStateOf<String?>(null) }
    // Each screen keeps its scroll while another one covers it. Opening a page drops what it kept, so it starts at the top.
    val saved = rememberSaveableStateHolder()
    val open = { key: String -> saved.removeState(key); page = key }
    // Acknowledgements sits one level under About and a person under People; every other page returns to the tabs.
    val close = { page = when { page == "acknowledgements" -> "about"; page?.startsWith("person:") == true -> "people"; else -> null } }
    // Back from a tab or a page previews as the screen shrinking, then returns to Home or the tabs.
    val pageBack = rememberPredictiveBack(page != null, close)
    val tabBack = rememberPredictiveBack(page == null && tab != "home") { tab = "home" }

    val user = session.user
    val canControl = user.canControl
    val motion = MaterialTheme.motionScheme
    Box(Modifier.fillMaxSize().predictiveBackEffect { maxOf(pageBack.value, tabBack.value) }) {
        AnimatedContent(
            targetState = page,
            // Shared axis X: a page slides in from the end, the tabs come back from the start.
            // Shared axis X: a page slides in from the end, the tabs come back from the start.
            transitionSpec = { sharedAxisX(pageDepth(targetState) > pageDepth(initialState), motion) },
            label = "page",
        ) { current -> saved.SaveableStateProvider(current ?: "tabs") {
            when {
                current == null -> {
                    val allTabs = listOf(
                        "home" to NavTab(stringResource(R.string.nav_home), Icons.Outlined.Home, Icons.Rounded.Home),
                        "devices" to NavTab(stringResource(R.string.nav_devices), Icons.Outlined.Devices, Icons.Rounded.Devices),
                        "scenes" to NavTab(stringResource(R.string.nav_scenes), Icons.Outlined.AutoAwesome, Icons.Rounded.AutoAwesome),
                        "analytics" to NavTab(stringResource(R.string.nav_analytics), Icons.Outlined.Insights, Icons.Rounded.Insights),
                        "settings" to NavTab(stringResource(R.string.nav_settings), Icons.Outlined.Settings, Icons.Rounded.Settings),
                    )
                    // Analytics exists only when the home measures power or air.
                    val tabs = allTabs.filter { it.first != "analytics" || devices.measuresPower() || devices.measuresAir() }
                    val index = tabs.indexOfFirst { it.first == tab }.coerceAtLeast(0)
                    FloatingNavScaffold(tabs.map { it.second }, index, { tab = tabs[it].first }) { selected ->
                        when (tabs[selected].first) {
                            "home" -> HomeScreen(user, onOpenDevice = { openDevice = it }, onShowDevices = { tab = "devices" }, open = open)
                            "devices" -> DevicesScreen(user, onOpenDevice = { openDevice = it }, onAdd = { open("discover") }, onManageRooms = { open("rooms") })
                            "scenes" -> ScenesScreen(user, open)
                            "analytics" -> AnalyticsScreen(user, onOpenDevice = { openDevice = it }, onEditTariff = { open("tariff") })
                            else -> SettingsScreen(session, open)
                        }
                    }
                }
                current == "discover" -> DiscoverPage(close, onOpenPlugins = { open("plugins") })
                current == "plugins" -> IntegrationsPage(close, onFindDevices = { open("discover") })
                current == "rooms" -> RoomsPage(close)
                current == "people" -> UsersPage(open, close)
                current.startsWith("person:") -> PersonEditorPage(current.removePrefix("person:"), user, close)
                current == "tariff" -> TariffPage(close)
                current == "notices" -> NoticesPage(close)
                current == "location" -> LocationPage(close)
                current == "password" -> ChangePasswordPage(close)
                current == "links" -> ServerLinksPage(user.isAdmin, close)
                current == "updates" -> UpdatesPage(close)
                current == "about" -> AboutPage(close, onOpenAcknowledgements = { open("acknowledgements") })
                current == "acknowledgements" -> AcknowledgementsPage(close)
                current == "avatar" -> AvatarCustomizationPage(user, close)
                current.startsWith("scene:") -> SceneEditorPage(current.removePrefix("scene:"), close)
                current.startsWith("automation:") -> AutomationEditorPage(current.removePrefix("automation:"), close)
            }
        } }
        // Above the floating pill.
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 80.dp))
    }

    devices.firstOrNull { it.id == openDevice }?.let { device ->
        DeviceSheet(device, user, onDismiss = { openDevice = null })
    }
}
