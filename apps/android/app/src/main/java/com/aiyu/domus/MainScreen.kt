package com.aiyu.domus

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
    NavTab("Home", Icons.Outlined.Home, Icons.Rounded.Home),
    NavTab("Devices", Icons.Outlined.Devices, Icons.Rounded.Devices),
    NavTab("Scenes", Icons.Outlined.AutoAwesome, Icons.Rounded.AutoAwesome),
    NavTab("Energy", Icons.Outlined.Bolt, Icons.Rounded.Bolt),
    NavTab("Settings", Icons.Outlined.Settings, Icons.Rounded.Settings),
)

@Composable
fun MainScreen(session: Session.SignedIn) {
    val repository = LocalRepository.current
    var tab by rememberSaveable { mutableIntStateOf(0) }
    // The open device sheet. Kept as an id so the sheet follows live state changes.
    var openDevice by rememberSaveable { mutableStateOf<String?>(null) }
    val devices by repository.devices.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(repository) { repository.messages.collect { snackbar.showSnackbar(it) } }
    BackHandler(tab != 0) { tab = 0 }

    val canControl = session.user.canControl
    Box(Modifier.fillMaxSize()) {
        FloatingNavScaffold(Tabs, tab, { tab = it }) { current ->
            when (current) {
                0 -> HomeScreen(session.user, onOpenDevice = { openDevice = it }, onShowDevices = { tab = 1 })
                1 -> DevicesScreen(canControl, onOpenDevice = { openDevice = it })
                2 -> ScenesScreen(canControl)
                3 -> EnergyScreen()
                else -> SettingsScreen(session)
            }
        }
        // Above the floating pill.
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 80.dp))
    }

    devices.firstOrNull { it.id == openDevice }?.let { device ->
        DeviceSheet(device, canControl, onDismiss = { openDevice = null })
    }
}
