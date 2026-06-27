package com.atech.domus.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.atech.domus.ui.electricity.ElectricityState
import com.atech.domus.ui.electricity.ElectricityViewModel
import com.atech.ui_shared.theme.DomusGreen
import kotlin.math.roundToInt

/** Overview: home name, at-a-glance stats (online / on / power), and quick controls. */
@Composable
fun DashboardTab(
    devicesVm: DevicesViewModel,
    electricityVm: ElectricityViewModel,
    contentPadding: PaddingValues,
) {
    val state by devicesVm.state.collectAsStateWithLifecycle()
    val power by electricityVm.state.collectAsStateWithLifecycle()
    val powerW = (power as? ElectricityState.Content)?.summary?.total_power_w

    when (val s = state) {
        is DevicesState.Loading -> Box(Modifier.fillMaxSize().padding(contentPadding), Alignment.Center) {
            CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
        }
        is DevicesState.Error -> Box(Modifier.fillMaxSize().padding(contentPadding).padding(24.dp), Alignment.Center) {
            Text(s.message, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        is DevicesState.Empty -> Box(Modifier.fillMaxSize().padding(contentPadding).padding(24.dp), Alignment.Center) {
            Text(
                s.homeName?.let { "No devices in $it yet" } ?: "No home set up yet",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        is DevicesState.Content -> LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = 16.dp, end = 16.dp,
                top = contentPadding.calculateTopPadding() + 8.dp,
                bottom = contentPadding.calculateBottomPadding() + 16.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Column(Modifier.padding(horizontal = 4.dp, vertical = 4.dp)) {
                    Text(
                        s.homeName,
                        style = MaterialTheme.typography.headlineLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    Text(
                        "Welcome home",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatCard(Modifier.weight(1f), "${s.onlineCount}/${s.devices.size}", "Online")
                    StatCard(Modifier.weight(1f), s.onCount.toString(), "On now")
                    StatCard(
                        Modifier.weight(1f),
                        powerW?.let { "${it.roundToInt()}" } ?: "—",
                        "Watts",
                        accent = true,
                    )
                }
            }
            val controllable = s.devices.filter { it.controllable }
            if (controllable.isNotEmpty()) {
                item {
                    Text(
                        "Quick controls",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onBackground,
                        modifier = Modifier.padding(start = 4.dp, end = 4.dp, top = 8.dp),
                    )
                }
                items(controllable, key = { it.device.id }) { d ->
                    DeviceCard(d, onToggle = { devicesVm.toggle(d.device.id) })
                }
            }
        }
    }
}

@Composable
private fun StatCard(modifier: Modifier, value: String, label: String, accent: Boolean = false) {
    Surface(
        modifier = modifier,
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.large,
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(
                value,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = if (accent) DomusGreen else MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(2.dp))
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
