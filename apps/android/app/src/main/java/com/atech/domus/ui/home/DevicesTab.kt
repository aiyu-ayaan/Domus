package com.atech.domus.ui.home

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AcUnit
import androidx.compose.material.icons.rounded.DeviceUnknown
import androidx.compose.material.icons.rounded.Lightbulb
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Power
import androidx.compose.material.icons.rounded.Sensors
import androidx.compose.material.icons.rounded.Thermostat
import androidx.compose.material.icons.rounded.ToggleOn
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.atech.core.model.DeviceType
import com.atech.ui_shared.theme.DomusGreen
import com.atech.ui_shared.component.DomusLogo
import androidx.compose.ui.graphics.Color

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DevicesTab(vm: DevicesViewModel, contentPadding: PaddingValues, onDeviceClick: (String) -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { DomusLogo() },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent,
                    scrolledContainerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        containerColor = Color.Transparent
    ) { innerPadding ->
        when (val s = state) {
            is DevicesState.Loading -> Centered(contentPadding) {
                CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            }
            is DevicesState.Error -> Centered(contentPadding) {
                Message("Couldn't load devices", s.message, vm::load)
            }
            is DevicesState.Empty -> Centered(contentPadding) {
                Message(
                    s.homeName?.let { "No devices in $it yet" } ?: "No home set up yet",
                    "Add devices from the Domus web dashboard, then pull to refresh.",
                    vm::load,
                )
            }
            is DevicesState.Content -> PullToRefreshBox(
                isRefreshing = s.refreshing,
                onRefresh = { vm.load(isRefresh = true) },
                modifier = Modifier.fillMaxSize().padding(top = innerPadding.calculateTopPadding()),
            ) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(
                        start = 16.dp, end = 16.dp,
                        top = 8.dp,
                        bottom = contentPadding.calculateBottomPadding() + 16.dp,
                    ),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item {
                        Column(Modifier.padding(horizontal = 4.dp, vertical = 4.dp)) {
                            Text(
                                s.homeName,
                                style = MaterialTheme.typography.headlineMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onBackground,
                            )
                            Text(
                                "${s.devices.size} device${if (s.devices.size == 1) "" else "s"} · ${s.onlineCount} online",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    items(s.devices, key = { it.device.id }) { d ->
                        DeviceCard(
                            d = d,
                            onToggle = { vm.toggle(d.device.id) },
                            onClick = { onDeviceClick(d.device.id) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun DeviceCard(d: DeviceUi, onToggle: () -> Unit, onClick: () -> Unit) {
    val on = d.isOn == true
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth().clickable { onClick() },
    ) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            val iconTint = if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
            val iconBg = if (on) MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)
            else MaterialTheme.colorScheme.surfaceVariant
            Box(
                Modifier.size(44.dp).background(iconBg, RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(iconFor(d.device.device_type), null, tint = iconTint, modifier = Modifier.size(24.dp))
            }
            Spacer(Modifier.size(14.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    d.device.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Spacer(Modifier.height(2.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(8.dp).background(
                            if (d.device.online) DomusGreen else MaterialTheme.colorScheme.outline,
                            CircleShape,
                        ),
                    )
                    Spacer(Modifier.size(6.dp))
                    Text(
                        subtitle(d),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(Modifier.size(8.dp))
            if (d.controllable) {
                Switch(
                    checked = on,
                    onCheckedChange = { onToggle() },
                    enabled = d.device.online && !d.busy,
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = MaterialTheme.colorScheme.onPrimary,
                        checkedTrackColor = MaterialTheme.colorScheme.primary,
                    ),
                    thumbContent = if (d.busy) {
                        {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 1.5.dp,
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                    } else null
                )
            }
        }
    }
}

private fun subtitle(d: DeviceUi): String {
    val type = d.device.device_type.name.lowercase().replaceFirstChar { it.uppercase() }
    val status = when {
        !d.device.online -> "Offline"
        d.controllable && d.isOn == true -> "On"
        d.controllable && d.isOn == false -> "Off"
        else -> "Online"
    }
    return "$type · $status"
}

private fun iconFor(type: DeviceType): ImageVector = when (type) {
    DeviceType.LIGHT -> Icons.Rounded.Lightbulb
    DeviceType.PLUG -> Icons.Rounded.Power
    DeviceType.SWITCH -> Icons.Rounded.ToggleOn
    DeviceType.SENSOR -> Icons.Rounded.Sensors
    DeviceType.CAMERA -> Icons.Rounded.Videocam
    DeviceType.THERMOSTAT -> Icons.Rounded.Thermostat
    DeviceType.FAN -> Icons.Rounded.AcUnit
    DeviceType.LOCK -> Icons.Rounded.Lock
    DeviceType.OTHER -> Icons.Rounded.DeviceUnknown
}

@Composable
private fun Centered(padding: PaddingValues, content: @Composable () -> Unit) {
    Box(
        Modifier.fillMaxSize().padding(padding).padding(24.dp),
        contentAlignment = Alignment.Center,
    ) { content() }
}

@Composable
private fun Message(title: String, body: String, onRetry: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onBackground, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        Spacer(Modifier.height(16.dp))
        TextButton(onClick = onRetry) { Text("Retry", color = MaterialTheme.colorScheme.primary) }
    }
}
