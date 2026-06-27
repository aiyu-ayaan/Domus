package com.atech.domus.ui.home

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.Lightbulb
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.lifecycle.viewmodel.compose.viewModel
import com.atech.domus.ui.electricity.ElectricityScreen
import com.atech.domus.ui.electricity.ElectricityViewModel
import com.atech.domus.ui.profile.ProfileScreen
import com.atech.domus.ui.profile.ProfileViewModel
import com.atech.ui_shared.component.DomusLogo

private enum class HomeTab(val label: String, val icon: ImageVector) {
    DASHBOARD("Home", Icons.Rounded.GridView),
    DEVICES("Devices", Icons.Rounded.Lightbulb),
    ELECTRICITY("Power", Icons.Rounded.Bolt),
    PROFILE("Profile", Icons.Rounded.Person),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeShell() {
    // Shared across the tabs that need them, so live state is consistent.
    val dashboardVm: DashboardViewModel = viewModel()
    val devicesVm: DevicesViewModel = viewModel()
    val electricityVm: ElectricityViewModel = viewModel()
    val profileVm: ProfileViewModel = viewModel()

    var tab by rememberSaveable { mutableStateOf(HomeTab.DASHBOARD) }

    // Collapses/Hides on scroll
    val scrollBehavior = TopAppBarDefaults.enterAlwaysScrollBehavior()

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        containerColor = Color.Transparent,
        topBar = {
            TopAppBar(
                title = { DomusLogo() },
                actions = {
                    if (tab == HomeTab.DASHBOARD) {
                        IconButton(onClick = { dashboardVm.setSettingsOpen(true) }) {
                            Icon(
                                Icons.Rounded.Settings,
                                contentDescription = "Customize Dashboard",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
                scrollBehavior = scrollBehavior,
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent,
                    scrolledContainerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                HomeTab.entries.forEach { item ->
                    NavigationBarItem(
                        selected = tab == item,
                        onClick = { tab = item },
                        icon = { Icon(item.icon, contentDescription = item.label) },
                        label = { Text(item.label) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = MaterialTheme.colorScheme.onPrimary,
                            indicatorColor = MaterialTheme.colorScheme.primary,
                            selectedTextColor = MaterialTheme.colorScheme.primary,
                            unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                            unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        ),
                    )
                }
            }
        },
    ) { padding ->
        Crossfade(targetState = tab, animationSpec = tween(200), label = "home-tab") { current ->
            Box(Modifier.fillMaxSize()) {
                when (current) {
                    HomeTab.DASHBOARD -> DashboardTab(dashboardVm, padding)
                    HomeTab.DEVICES -> DevicesTab(devicesVm, padding)
                    HomeTab.ELECTRICITY -> ElectricityScreen(electricityVm, padding)
                    HomeTab.PROFILE -> ProfileScreen(profileVm, padding)
                }
            }
        }
    }
}
