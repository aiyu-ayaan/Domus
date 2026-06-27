package com.atech.domus.ui.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.List
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Timer
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.atech.core.model.Automation
import com.atech.core.model.DeviceType
import com.atech.core.model.Notification
import com.atech.core.model.NotificationType
import com.atech.core.model.Scene
import com.atech.ui_shared.theme.DomusGreen
import com.atech.ui_shared.component.DomusLogo
import kotlinx.serialization.json.jsonPrimitive
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardTab(
    dashboardVm: DashboardViewModel,
    contentPadding: PaddingValues
) {
    val state by dashboardVm.state.collectAsState()
    val isSettingsOpen by dashboardVm.isSettingsOpen.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { DomusLogo() },
                actions = {
                    IconButton(onClick = { dashboardVm.setSettingsOpen(true) }) {
                        Icon(
                            Icons.Rounded.Settings,
                            contentDescription = "Customize Dashboard",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent,
                    scrolledContainerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        containerColor = Color.Transparent
    ) { innerPadding ->
        when (val s = state) {
            is DashboardState.Loading -> Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(top = innerPadding.calculateTopPadding())
                    .padding(bottom = contentPadding.calculateBottomPadding()),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            }
            is DashboardState.Error -> Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(top = innerPadding.calculateTopPadding())
                    .padding(bottom = contentPadding.calculateBottomPadding())
                    .padding(24.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "Couldn't load dashboard",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.error
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = s.message,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center
                    )
                    Spacer(Modifier.height(16.dp))
                    Button(onClick = { dashboardVm.loadAll() }) {
                        Text("Retry")
                    }
                }
            }
            is DashboardState.Content -> {
                PullToRefreshBox(
                    isRefreshing = s.refreshing,
                    onRefresh = { dashboardVm.loadAll(isRefresh = true) },
                    modifier = Modifier.fillMaxSize().padding(top = innerPadding.calculateTopPadding())
                ) {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(
                            start = 16.dp,
                            end = 16.dp,
                            top = 8.dp,
                            bottom = contentPadding.calculateBottomPadding() + 24.dp
                        ),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {


                    // 1. Operational Health Header
                    if (s.sectionVisibility["healthHeader"] == true) {
                        item {
                            OperationalHealthCard(
                                uptimeScore = s.uptimeScore,
                                offlineCount = s.offlineDevices,
                                homeName = s.homeName
                            )
                        }
                    }

                    // 2. System Bento Grid (Status Tiles)
                    if (s.sectionVisibility["systemTiles"] == true) {
                        item {
                            SystemBentoGrid(
                                activeAutomations = s.activeAutomations,
                                totalAutomations = s.automations.size,
                                activeDeviceStates = s.activeDeviceStates,
                                securityAlertsCount = s.securityAlertsCount,
                                totalPowerW = s.totalPowerW
                            )
                        }
                    }

                    // 3. Electricity & Billing
                    if (s.sectionVisibility["electricity"] == true) {
                        item {
                            ElectricityBillingCard(
                                totalKwh = s.totalKwh,
                                activeHomeName = s.homeName
                            )
                        }
                    }

                    // 4. Live Power Draw
                    if (s.sectionVisibility["livePowerDraw"] == true) {
                        val activePowerDraw = s.devices
                            .mapNotNull { dev ->
                                val watts = dev.device.meta["current_consumption"]?.jsonPrimitive?.content?.toDoubleOrNull()
                                    ?: (if (dev.isOn == true && dev.device.device_type == DeviceType.LIGHT) 12.0 else 0.0) // Mock default if on
                                if (dev.device.online && watts > 0.0) {
                                    dev.device.name to watts
                                } else null
                            }
                            .sortedByDescending { it.second }
                            .take(5)

                        if (activePowerDraw.isNotEmpty()) {
                            item {
                                LivePowerDrawList(
                                    powerDraw = activePowerDraw,
                                    totalPowerW = s.totalPowerW.coerceAtLeast(activePowerDraw.sumOf { it.second })
                                )
                            }
                        }
                    }

                    // 5. Saved Scenes
                    if (s.sectionVisibility["savedScenes"] == true && s.scenes.isNotEmpty()) {
                        item {
                            SavedScenesCard(
                                scenes = s.scenes,
                                activating = s.activatingScenes,
                                onActivate = { dashboardVm.activateScene(it.id) }
                            )
                        }
                    }

                    // 6. Automation Stack
                    if (s.sectionVisibility["automationStack"] == true && s.automations.isNotEmpty()) {
                        item {
                            AutomationStackCard(
                                automations = s.automations,
                                triggering = s.triggeringAutomations,
                                toggling = s.togglingAutomations,
                                onToggle = { auth, enabled -> dashboardVm.toggleAutomation(auth.id, enabled) },
                                onTrigger = { dashboardVm.triggerAutomation(it.id) }
                            )
                        }
                    }

                    // 7. Activity Feed
                    if (s.sectionVisibility["activityFeed"] == true && s.notifications.isNotEmpty()) {
                        item {
                            ActivityFeedCard(
                                notifications = s.notifications,
                                onMarkRead = { dashboardVm.markNotificationRead(it.id) }
                            )
                        }
                    }
                }
            }

            // Customize Sections Dialog
            if (isSettingsOpen) {
                CustomizeDashboardDialog(
                    visibility = s.sectionVisibility,
                    onToggle = { dashboardVm.toggleSectionVisibility(it) },
                    onReset = { dashboardVm.resetSectionVisibility() },
                    onClose = { dashboardVm.setSettingsOpen(false) }
                )
            }
        }
    }
}
}

@Composable
fun OperationalHealthCard(
    uptimeScore: Int,
    offlineCount: Int,
    homeName: String
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier
            .fillMaxWidth()
            .border(
                BorderStroke(
                    1.dp,
                    Brush.verticalGradient(
                        colors = listOf(
                            Color(0xFFE61919).copy(alpha = 0.5f),
                            Color.Transparent
                        )
                    )
                ),
                shape = RoundedCornerShape(16.dp)
            )
    ) {
        Box(modifier = Modifier.fillMaxWidth()) {
            // High Tech Tech Grid Overlay
            Canvas(
                modifier = Modifier
                    .matchParentSize()
            ) {
                clipRect {
                    val lineSpacing = 6.dp.toPx()
                    var y = 0f
                    while (y < size.height) {
                        drawLine(
                            color = Color.White.copy(alpha = 0.03f),
                            start = Offset(0f, y),
                            end = Offset(size.width, y),
                            strokeWidth = 1f
                        )
                        y += lineSpacing
                    }
                }
            }

            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .background(
                                    if (offlineCount > 0) Color(0xFFF59E0B).copy(alpha = 0.15f)
                                    else DomusGreen.copy(alpha = 0.15f),
                                    RoundedCornerShape(8.dp)
                                )
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = if (offlineCount > 0) Icons.Rounded.Warning else Icons.Rounded.CheckCircle,
                                    contentDescription = null,
                                    tint = if (offlineCount > 0) Color(0xFFF59E0B) else DomusGreen,
                                    modifier = Modifier.size(14.dp)
                                )
                                Spacer(Modifier.width(4.dp))
                                Text(
                                    text = if (offlineCount > 0) "$offlineCount offline" else "All systems nominal",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = if (offlineCount > 0) Color(0xFFF59E0B) else DomusGreen,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }

                        Spacer(Modifier.width(8.dp))

                        Box(
                            modifier = Modifier
                                .background(
                                    MaterialTheme.colorScheme.surfaceVariant,
                                    RoundedCornerShape(8.dp)
                                )
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Rounded.Home,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(14.dp)
                                )
                                Spacer(Modifier.width(4.dp))
                                Text(
                                    text = homeName,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }

                    Text(
                        text = "UNIT / D-01",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                        fontWeight = FontWeight.Bold,
                        fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
                    )
                }

                Spacer(Modifier.height(16.dp))

                Text(
                    text = "Your home is running at $uptimeScore% operational health.",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )

                Spacer(Modifier.height(8.dp))

                Text(
                    text = "Monitoring device connectivity, live electricity metrics, active scenes, and real-time events.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
fun SystemBentoGrid(
    activeAutomations: Int,
    totalAutomations: Int,
    activeDeviceStates: Int,
    securityAlertsCount: Int,
    totalPowerW: Double
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            BentoTile(
                modifier = Modifier.weight(1f),
                title = "ACTIVE AUTOMATIONS",
                value = "$activeAutomations / $totalAutomations",
                subText = "enabled rules",
                icon = Icons.Rounded.Timer,
                accentColor = MaterialTheme.colorScheme.primary
            )
            BentoTile(
                modifier = Modifier.weight(1f),
                title = "ACTIVE DEVICES",
                value = "$activeDeviceStates",
                subText = "devices turned on",
                icon = Icons.Rounded.Bolt,
                accentColor = DomusGreen
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            BentoTile(
                modifier = Modifier.weight(1f),
                title = "SECURITY ALERTS",
                value = "$securityAlertsCount",
                subText = "unread alerts",
                icon = Icons.Rounded.Warning,
                accentColor = if (securityAlertsCount > 0) Color(0xFFEF4444) else MaterialTheme.colorScheme.onSurfaceVariant
            )
            BentoTile(
                modifier = Modifier.weight(1f),
                title = "TOTAL POWER LOAD",
                value = "${totalPowerW.roundToInt()} W",
                subText = "live draw",
                icon = Icons.Rounded.Bolt,
                accentColor = Color(0xFFEAB308)
            )
        }
    }
}

@Composable
fun BentoTile(
    modifier: Modifier = Modifier,
    title: String,
    value: String,
    subText: String,
    icon: ImageVector,
    accentColor: Color
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = modifier
    ) {
        Column(
            modifier = Modifier.padding(14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
                )
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = accentColor.copy(alpha = 0.8f),
                    modifier = Modifier.size(16.dp)
                )
            }

            Spacer(Modifier.height(8.dp))

            Text(
                text = value,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = accentColor
            )

            Spacer(Modifier.height(2.dp))

            Text(
                text = subText,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
            )
        }
    }
}

@Composable
fun ElectricityBillingCard(
    totalKwh: Double,
    activeHomeName: String
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(
                text = "ELECTRICITY & BILLING",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
                fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
            )

            Spacer(Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text(
                        text = "Today's Consumption",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = String.format("%.2f kWh", totalKwh),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }

                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = "Estimated Cost",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    // Compute cost based on default tariff of $0.15/kWh
                    val cost = totalKwh * 0.15
                    Text(
                        text = String.format("$%.2f", cost),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = DomusGreen
                    )
                }
            }

            Spacer(Modifier.height(12.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Spacer(Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Billing Period Target: 100 kWh",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                val progress = (totalKwh / 100.0).toFloat().coerceIn(0f, 1f)
                Box(modifier = Modifier.width(100.dp)) {
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp),
                        color = if (progress > 0.8f) Color(0xFFEF4444) else DomusGreen,
                        trackColor = MaterialTheme.colorScheme.surfaceVariant,
                        strokeCap = androidx.compose.ui.graphics.StrokeCap.Round
                    )
                }
            }
        }
    }
}

@Composable
fun LivePowerDrawList(
    powerDraw: List<Pair<String, Double>>,
    totalPowerW: Double
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(
                text = "LIVE POWER DRAW BY DEVICE",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
                fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
            )

            Spacer(Modifier.height(12.dp))

            Column(
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                powerDraw.forEach { (name, watts) ->
                    val percentage = if (totalPowerW > 0) (watts / totalPowerW).toFloat() else 0f
                    Column {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = name,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = "${watts.roundToInt()} W",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFEAB308)
                            )
                        }
                        Spacer(Modifier.height(4.dp))
                        LinearProgressIndicator(
                            progress = { percentage },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(4.dp),
                            color = Color(0xFFEAB308),
                            trackColor = MaterialTheme.colorScheme.surfaceVariant,
                            strokeCap = androidx.compose.ui.graphics.StrokeCap.Round
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SavedScenesCard(
    scenes: List<Scene>,
    activating: Set<String>,
    onActivate: (Scene) -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(
                text = "SAVED SCENES",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
                fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
            )

            Spacer(Modifier.height(12.dp))

            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                scenes.forEach { scene ->
                    val isActivating = activating.contains(scene.id)
                    Surface(
                        onClick = { if (!isActivating) onActivate(scene) },
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                        modifier = Modifier.clickable(!isActivating) { onActivate(scene) }
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            if (isActivating) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(14.dp),
                                    strokeWidth = 1.5.dp,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            } else {
                                Icon(
                                    Icons.Rounded.Home,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(14.dp)
                                )
                            }
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = scene.name,
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AutomationStackCard(
    automations: List<Automation>,
    triggering: Set<String>,
    toggling: Set<String>,
    onToggle: (Automation, Boolean) -> Unit,
    onTrigger: (Automation) -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(
                text = "AUTOMATION STACK",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
                fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
            )

            Spacer(Modifier.height(12.dp))

            Column(
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                automations.forEach { automation ->
                    val isTriggering = triggering.contains(automation.id)
                    val isToggling = toggling.contains(automation.id)

                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        color = MaterialTheme.colorScheme.surface,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = automation.name,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = if (automation.enabled) MaterialTheme.colorScheme.onSurface 
                                            else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Text(
                                    text = "Trigger: ${automation.trigger.type.name.uppercase()}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }

                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                // Run button
                                IconButton(
                                    onClick = { onTrigger(automation) },
                                    enabled = !isTriggering && automation.enabled,
                                    modifier = Modifier
                                        .background(
                                            if (automation.enabled) MaterialTheme.colorScheme.surfaceVariant 
                                            else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                                            CircleShape
                                        )
                                        .size(32.dp)
                                ) {
                                    if (isTriggering) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(16.dp),
                                            strokeWidth = 2.dp,
                                            color = MaterialTheme.colorScheme.primary
                                        )
                                    } else {
                                        Icon(
                                            Icons.Rounded.PlayArrow,
                                            contentDescription = "Trigger Now",
                                            tint = if (automation.enabled) MaterialTheme.colorScheme.primary 
                                                   else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                }

                                // Toggle Switch
                                if (isToggling) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(24.dp),
                                        strokeWidth = 2.dp,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                } else {
                                    Switch(
                                        checked = automation.enabled,
                                        onCheckedChange = { onToggle(automation, it) },
                                        modifier = Modifier.scale(0.8f)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}


@Composable
fun ActivityFeedCard(
    notifications: List<Notification>,
    onMarkRead: (Notification) -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(
                text = "ACTIVITY FEED",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
                fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
            )

            Spacer(Modifier.height(12.dp))

            Column(
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                notifications.take(8).forEach { notification ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(enabled = !notification.read) { onMarkRead(notification) }
                            .padding(vertical = 6.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.weight(1f)
                        ) {
                            val tint = when (notification.type) {
                                NotificationType.SECURITY_ALERT -> Color(0xFFEF4444)
                                NotificationType.DEVICE_OFFLINE -> Color(0xFFF59E0B)
                                NotificationType.AUTOMATION_FAILED -> Color(0xFFEF4444)
                                else -> MaterialTheme.colorScheme.primary
                            }

                            Icon(
                                imageVector = when (notification.type) {
                                    NotificationType.SECURITY_ALERT -> Icons.Rounded.Warning
                                    NotificationType.DEVICE_OFFLINE -> Icons.Rounded.Bolt
                                    else -> Icons.Rounded.Notifications
                                },
                                contentDescription = null,
                                tint = tint,
                                modifier = Modifier.size(16.dp)
                            )

                            Spacer(Modifier.width(10.dp))

                            Column {
                                Text(
                                    text = notification.title,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = if (notification.read) MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                                            else MaterialTheme.colorScheme.onSurface,
                                    textDecoration = if (notification.read) TextDecoration.LineThrough else null,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    text = notification.body,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }

                        if (!notification.read) {
                            Box(
                                modifier = Modifier
                                    .padding(start = 8.dp)
                                    .size(6.dp)
                                    .background(MaterialTheme.colorScheme.primary, CircleShape)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun CustomizeDashboardDialog(
    visibility: Map<String, Boolean>,
    onToggle: (String) -> Unit,
    onReset: () -> Unit,
    onClose: () -> Unit
) {
    Dialog(onDismissRequest = onClose) {
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "CUSTOMIZE DASHBOARD",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    IconButton(onClick = onClose) {
                        Icon(Icons.Rounded.Close, contentDescription = "Close")
                    }
                }

                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Spacer(Modifier.height(12.dp))

                val sections = listOf(
                    "healthHeader" to "Operational Health Card",
                    "systemTiles" to "System Status Tiles",
                    "electricity" to "Electricity & Billing Card",
                    "livePowerDraw" to "Live Power Draw List",
                    "savedScenes" to "Saved Scenes Card",
                    "automationStack" to "Automation Stack",
                    "activityFeed" to "Activity Feed"
                )

                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    sections.forEach { (key, label) ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(
                                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.2f),
                                    RoundedCornerShape(8.dp)
                                )
                                .clickable { onToggle(key) }
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = label,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Checkbox(
                                checked = visibility[key] ?: true,
                                onCheckedChange = { onToggle(key) }
                            )
                        }
                    }
                }

                Spacer(Modifier.height(16.dp))
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Spacer(Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    TextButton(onClick = onReset) {
                        Text("RESET")
                    }
                    Spacer(Modifier.width(8.dp))
                    Button(
                        onClick = onClose,
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                    ) {
                        Text("DONE")
                    }
                }
            }
        }
    }
}
