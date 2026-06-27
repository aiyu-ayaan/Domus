package com.atech.domus.ui.device

import androidx.activity.compose.BackHandler
import androidx.compose.animation.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.DeviceUnknown
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Lightbulb
import androidx.compose.material.icons.rounded.List
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Monitor
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Power
import androidx.compose.material.icons.rounded.Sensors
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Speed
import androidx.compose.material.icons.rounded.Thermostat
import androidx.compose.material.icons.rounded.ToggleOn
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material.icons.rounded.Wallet
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.atech.core.model.Device
import com.atech.core.model.DeviceState
import com.atech.core.model.DeviceType
import com.atech.core.model.Room
import com.atech.ui_shared.component.DomusBackground
import com.atech.ui_shared.component.DomusButton
import com.atech.ui_shared.component.DomusTextField
import com.atech.ui_shared.theme.DomusGreen
import kotlinx.serialization.json.*
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

private enum class DetailTab(val label: String, val icon: ImageVector) {
    OVERVIEW("Overview", Icons.Rounded.Info),
    HISTORY("History", Icons.Rounded.History),
    LOGS("Logs Feed", Icons.Rounded.List),
    SETTINGS("Settings", Icons.Rounded.Settings)
}

data class ColorPreset(val name: String, val hex: String, val color: Color)

private val LIGHT_COLOR_PRESETS = listOf(
    ColorPreset("Red", "#EF4444", Color(0xFFEF4444)),
    ColorPreset("Orange", "#F97316", Color(0xFFF97316)),
    ColorPreset("Yellow", "#F59E0B", Color(0xFFF59E0B)),
    ColorPreset("Green", "#10B981", Color(0xFF10B981)),
    ColorPreset("Cyan", "#06B6D4", Color(0xFF06B6D4)),
    ColorPreset("Blue", "#3B82F6", Color(0xFF3B82F6)),
    ColorPreset("Purple", "#8B5CF6", Color(0xFF8B5CF6)),
    ColorPreset("Pink", "#EC4899", Color(0xFFEC4899))
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeviceDetailScreen(
    deviceId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    vm: DeviceDetailViewModel = viewModel()
) {
    // Intercept hardware back button
    BackHandler(onBack = onBack)

    // Load device details when screen opens
    LaunchedEffect(deviceId) {
        vm.loadDevice(deviceId)
    }

    val uiState by vm.uiState.collectAsStateWithLifecycle()
    var selectedTab by rememberSaveable { mutableStateOf(DetailTab.OVERVIEW) }

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = "Back",
                            tint = MaterialTheme.colorScheme.onSurface
                        )
                    }
                },
                title = {
                    Column {
                        Text(
                            text = uiState.device?.name ?: "Loading Device...",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        uiState.device?.let { dev ->
                            Text(
                                text = "${dev.manufacturer ?: "Generic"} · ${dev.model ?: "Device"}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
                actions = {
                    uiState.device?.let { dev ->
                        val online = dev.online
                        Surface(
                            shape = CircleShape,
                            color = if (online) DomusGreen.copy(alpha = 0.15f) else MaterialTheme.colorScheme.surfaceVariant,
                            border = BorderStroke(1.dp, if (online) DomusGreen.copy(alpha = 0.4f) else MaterialTheme.colorScheme.outline),
                            modifier = Modifier.padding(end = 16.dp)
                        ) {
                            Text(
                                text = if (online) "Online" else "Offline",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = if (online) DomusGreen else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent,
                    scrolledContainerColor = MaterialTheme.colorScheme.surface,
                )
            )
        },
        containerColor = Color.Transparent,
        modifier = modifier.fillMaxSize()
    ) { padding ->
        DomusBackground {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(top = padding.calculateTopPadding())
            ) {
                if (uiState.isLoading) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                    }
                } else if (uiState.errorMessage != null && uiState.device == null) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .weight(1f)
                            .padding(24.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                "Failed to load device details",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.error,
                                textAlign = TextAlign.Center
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                uiState.errorMessage ?: "",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center
                            )
                            Spacer(Modifier.height(16.dp))
                            Button(onClick = { vm.loadDevice(deviceId) }) {
                                Text("Retry")
                            }
                        }
                    }
                } else {
                    TabRow(
                        selectedTabIndex = selectedTab.ordinal,
                        containerColor = Color.Transparent,
                        contentColor = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        DetailTab.entries.forEach { tab ->
                            Tab(
                                selected = selectedTab == tab,
                                onClick = { selectedTab = tab },
                                text = { Text(tab.label) },
                                icon = { Icon(tab.icon, contentDescription = tab.label) }
                            )
                        }
                    }

                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .weight(1f)
                    ) {
                        when (selectedTab) {
                            DetailTab.OVERVIEW -> OverviewTabContent(uiState, vm)
                            DetailTab.HISTORY -> HistoryTabContent(uiState)
                            DetailTab.LOGS -> LogsTabContent(uiState)
                            DetailTab.SETTINGS -> SettingsTabContent(uiState, vm, onBack)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun OverviewTabContent(state: DeviceDetailUiState, vm: DeviceDetailViewModel) {
    val dev = state.device ?: return
    val devState = state.deviceState
    val attributes = devState?.attributes ?: JsonObject(emptyMap())

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        if (!dev.online) {
            item {
                Surface(
                    color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.3f),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.5f)),
                    shape = MaterialTheme.shapes.large,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "Device offline. Verify power supply or physical wiring.",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.error,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(16.dp)
                    )
                }
            }
        }

        item {
            QuickControlsCard(dev, devState, attributes, vm)
        }

        if (dev.device_type == DeviceType.PLUG) {
            item {
                EnergyCostCard(state)
            }
        }

        item {
            MetadataCard(dev)
        }
    }
}

@Composable
private fun QuickControlsCard(
    dev: Device,
    devState: DeviceState?,
    attributes: JsonObject,
    vm: DeviceDetailViewModel
) {
    val isEnabled = dev.online
    val isPowerOn = devState?.state?.lowercase() == "on" || devState?.state?.lowercase() == "closed"

    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                "Quick Control Actions",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )

            // Power Toggle Row
            if (dev.device_type in listOf(DeviceType.LIGHT, DeviceType.PLUG, DeviceType.SWITCH, DeviceType.LOCK)) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
                            MaterialTheme.shapes.medium
                        )
                        .border(
                            1.dp,
                            MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
                            MaterialTheme.shapes.medium
                        )
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text("Power State", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                        Text(
                            "Current state is ${devState?.state?.uppercase() ?: "OFF"}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Switch(
                        checked = isPowerOn,
                        onCheckedChange = { vm.togglePower() },
                        enabled = isEnabled,
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = MaterialTheme.colorScheme.onPrimary,
                            checkedTrackColor = MaterialTheme.colorScheme.primary,
                        )
                    )
                }
            }

            // Thermostat Climate Controls
            if (dev.device_type == DeviceType.THERMOSTAT) {
                val targetTemp = attributes["target_temperature"]?.jsonPrimitive?.doubleOrNull ?: 22.0
                var sliderValue by remember(targetTemp) { mutableStateOf(targetTemp.toFloat()) }

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
                            MaterialTheme.shapes.medium
                        )
                        .border(
                            1.dp,
                            MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
                            MaterialTheme.shapes.medium
                        )
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Target Climate", fontWeight = FontWeight.SemiBold)
                        Text(
                            String.format(Locale.US, "%.1f°C", sliderValue),
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                    Slider(
                        value = sliderValue,
                        onValueChange = { sliderValue = it },
                        onValueChangeFinished = {
                            vm.setAttribute("target_temperature", JsonPrimitive(sliderValue.toDouble()))
                        },
                        valueRange = 16f..28f,
                        steps = 23, // 0.5 increments
                        enabled = isEnabled,
                        colors = SliderDefaults.colors(
                            thumbColor = MaterialTheme.colorScheme.primary,
                            activeTrackColor = MaterialTheme.colorScheme.primary
                        )
                    )
                }
            }

            // Light Brightness & Color Controls
            if (dev.device_type == DeviceType.LIGHT) {
                // Brightness slider
                val brightness = attributes["brightness"]?.jsonPrimitive?.intOrNull
                var brightnessSlider by remember { mutableStateOf(100f) }
                LaunchedEffect(brightness) {
                    if (brightness != null) {
                        brightnessSlider = brightness.toFloat()
                    }
                }

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
                            MaterialTheme.shapes.medium
                        )
                        .border(
                            1.dp,
                            MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
                            MaterialTheme.shapes.medium
                        )
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Brightness Level", fontWeight = FontWeight.SemiBold)
                        Text(
                            "${brightnessSlider.toInt()}%",
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                    Slider(
                        value = brightnessSlider,
                        onValueChange = { brightnessSlider = it },
                        onValueChangeFinished = {
                            vm.setAttribute("brightness", JsonPrimitive(brightnessSlider.toInt()))
                        },
                        valueRange = 1f..100f,
                        enabled = isEnabled && isPowerOn,
                        colors = SliderDefaults.colors(
                            thumbColor = MaterialTheme.colorScheme.primary,
                            activeTrackColor = MaterialTheme.colorScheme.primary
                        )
                    )
                }

                // Color Selection Area (visible at all times but greyed out when off)
                var colorTab by rememberSaveable { mutableStateOf("temp") } // temp vs color
                val colorTemp = attributes["color_temp"]?.jsonPrimitive?.intOrNull
                var tempSlider by remember { mutableStateOf(4000f) }
                LaunchedEffect(colorTemp) {
                    if (colorTemp != null && colorTemp > 0) {
                        tempSlider = colorTemp.toFloat()
                    }
                }

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .alpha(if (isPowerOn) 1f else 0.4f),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("Color Configuration", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                            Text(
                                if (colorTab == "temp") "White light color temperature" else "Select color presets",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        // Sub tabs selector
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))
                        ) {
                            Row(modifier = Modifier.padding(2.dp)) {
                                Box(
                                    modifier = Modifier
                                        .background(
                                            if (colorTab == "temp") MaterialTheme.colorScheme.surface else Color.Transparent,
                                            RoundedCornerShape(6.dp)
                                        )
                                        .clickable(enabled = isEnabled && isPowerOn) { colorTab = "temp" }
                                        .padding(horizontal = 12.dp, vertical = 6.dp)
                                ) {
                                    Text("White", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                                }
                                Box(
                                    modifier = Modifier
                                        .background(
                                            if (colorTab == "color") MaterialTheme.colorScheme.surface else Color.Transparent,
                                            RoundedCornerShape(6.dp)
                                        )
                                        .clickable(enabled = isEnabled && isPowerOn) { colorTab = "color" }
                                        .padding(horizontal = 12.dp, vertical = 6.dp)
                                ) {
                                    Text("Colors", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }

                    if (colorTab == "temp") {
                        // Temperature control
                        val activeColorTemp = colorTemp ?: 4000
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            listOf(
                                Pair("Warm", 2700),
                                Pair("Neutral", 4000),
                                Pair("Cool", 6500)
                            ).forEach { (name, kelvin) ->
                                val active = activeColorTemp == kelvin
                                val bg = when(kelvin) {
                                    2700 -> Color(0xFFFFB347)
                                    4000 -> Color(0xFFFFFAED)
                                    else -> Color(0xFFA8D3FF)
                                }
                                Surface(
                                    color = bg,
                                    shape = CircleShape,
                                    border = if (active) BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else null,
                                    modifier = Modifier
                                        .size(36.dp)
                                        .clickable(enabled = isEnabled && isPowerOn) {
                                            vm.setAttributes(buildJsonObject {
                                                put("color_temp", JsonPrimitive(kelvin))
                                                put("color", JsonNull)
                                            })
                                        }
                                ) {
                                    if (active) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                Icons.Rounded.Check,
                                                null,
                                                tint = Color.Black,
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        // Kelvin Warm-to-Cool Slider with colored background
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp)
                                .background(
                                    Brush.horizontalGradient(
                                        colors = listOf(
                                            Color(0xFFFFB347),
                                            Color(0xFFFFDFA9),
                                            Color(0xFFFFFAED),
                                            Color(0xFFD8EBFF),
                                            Color(0xFFA8D3FF)
                                        )
                                    ),
                                    RoundedCornerShape(12.dp)
                                )
                                .padding(horizontal = 8.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Slider(
                                value = tempSlider,
                                onValueChange = { tempSlider = it },
                                onValueChangeFinished = {
                                    vm.setAttributes(buildJsonObject {
                                        put("color_temp", JsonPrimitive(tempSlider.toInt()))
                                        put("color", JsonNull)
                                    })
                                },
                                valueRange = 2700f..6500f,
                                enabled = isEnabled && isPowerOn,
                                colors = SliderDefaults.colors(
                                    activeTrackColor = Color.Transparent,
                                    inactiveTrackColor = Color.Transparent,
                                    thumbColor = Color.White
                                )
                            )
                            Text(
                                "${tempSlider.toInt()} K",
                                color = Color.DarkGray,
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .padding(top = 4.dp, end = 12.dp)
                            )
                        }
                    } else {
                        // Colors grid presets
                        val activeColorHex = attributes["color"]?.jsonPrimitive?.contentOrNull
                        val isColorsActive = (colorTemp ?: 4000) == 0 && activeColorHex != null

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            LIGHT_COLOR_PRESETS.forEach { preset ->
                                val active = isColorsActive && activeColorHex?.lowercase() == preset.hex.lowercase()
                                Surface(
                                    color = preset.color,
                                    shape = CircleShape,
                                    border = if (active) BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else BorderStroke(1.dp, Color.LightGray.copy(alpha = 0.5f)),
                                    modifier = Modifier
                                        .size(36.dp)
                                        .clickable(enabled = isEnabled && isPowerOn) {
                                            vm.setAttributes(buildJsonObject {
                                                put("color", JsonPrimitive(preset.hex))
                                                put("color_temp", JsonPrimitive(0))
                                            })
                                        }
                                ) {
                                    if (active) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                Icons.Rounded.Check,
                                                null,
                                                tint = Color.White,
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        // Custom color Hue slider picker
                        var customHue by remember { mutableStateOf(180f) }
                        val rgbColor = remember(customHue) {
                            val hsv = floatArrayOf(customHue, 1f, 1f)
                            Color(android.graphics.Color.HSVToColor(hsv))
                        }

                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("Custom Rainbow Palette", style = MaterialTheme.typography.labelMedium)
                                Box(
                                    modifier = Modifier
                                        .size(24.dp)
                                        .background(rgbColor, CircleShape)
                                        .border(1.dp, Color.White, CircleShape)
                                )
                            }
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(36.dp)
                                    .background(
                                        Brush.horizontalGradient(
                                            colors = listOf(
                                                Color.Red, Color.Yellow, Color.Green, Color.Cyan, Color.Blue, Color.Magenta, Color.Red
                                            )
                                        ),
                                        RoundedCornerShape(8.dp)
                                    )
                                    .padding(horizontal = 8.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Slider(
                                    value = customHue,
                                    onValueChange = { customHue = it },
                                    onValueChangeFinished = {
                                        val hsv = floatArrayOf(customHue, 1f, 1f)
                                        val rgbHex = String.format("#%06X", 0xFFFFFF and android.graphics.Color.HSVToColor(hsv))
                                        vm.setAttributes(buildJsonObject {
                                            put("color", JsonPrimitive(rgbHex))
                                            put("color_temp", JsonPrimitive(0))
                                        })
                                    },
                                    valueRange = 0f..360f,
                                    enabled = isEnabled && isPowerOn,
                                    colors = SliderDefaults.colors(
                                        activeTrackColor = Color.Transparent,
                                        inactiveTrackColor = Color.Transparent,
                                        thumbColor = Color.White
                                    )
                                )
                            }
                        }
                    }

                    // Ambient Sync & Pattern controls (like web)
                    HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                    
                    val ambientSync = attributes["ambient_sync"]?.jsonPrimitive?.contentOrNull
                    val isScreenSync = ambientSync == "screen"
                    val isMusicSync = ambientSync == "music"

                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text("Ambient Sync Modes", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                        
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            // Screen Sync
                            InputChip(
                                selected = isScreenSync,
                                onClick = {
                                    val nextVal = if (isScreenSync) null else "screen"
                                    vm.setAttributes(buildJsonObject {
                                        put("ambient_sync", nextVal?.let { JsonPrimitive(it) } ?: JsonNull)
                                        put("color", JsonNull)
                                        put("color_temp", JsonPrimitive(0))
                                    })
                                },
                                label = { Text("Screen Sync") },
                                leadingIcon = { Icon(Icons.Rounded.Monitor, "Screen") },
                                enabled = isEnabled && isPowerOn
                            )

                            // Music Sync
                            InputChip(
                                selected = isMusicSync,
                                onClick = {
                                    val nextVal = if (isMusicSync) null else "music"
                                    vm.setAttributes(buildJsonObject {
                                        put("ambient_sync", nextVal?.let { JsonPrimitive(it) } ?: JsonNull)
                                        put("music_theme", if (nextVal == "music") JsonPrimitive("spectrum") else JsonNull)
                                        put("color", JsonNull)
                                        put("color_temp", JsonPrimitive(0))
                                    })
                                },
                                label = { Text("Music Sync") },
                                leadingIcon = { Icon(Icons.Rounded.MusicNote, "Music") },
                                enabled = isEnabled && isPowerOn
                            )
                        }

                        if (isMusicSync) {
                            val musicTheme = attributes["music_theme"]?.jsonPrimitive?.contentOrNull ?: "spectrum"
                            ScrollableTabRow(
                                selectedTabIndex = listOf("spectrum", "fire", "ocean", "neon", "sunset").indexOf(musicTheme).coerceAtLeast(0),
                                containerColor = Color.Transparent,
                                edgePadding = 0.dp
                            ) {
                                listOf("spectrum", "fire", "ocean", "neon", "sunset").forEach { t ->
                                    Tab(
                                        selected = musicTheme == t,
                                        onClick = {
                                            vm.setAttribute("music_theme", JsonPrimitive(t))
                                        },
                                        text = { Text(t.replaceFirstChar { it.uppercase() }) },
                                        enabled = isEnabled && isPowerOn
                                    )
                                }
                            }
                        }

                        Text("Animated Loop Patterns", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 6.dp))
                        
                        val activePattern = attributes["light_scene"]?.jsonPrimitive?.contentOrNull
                        
                        FlowRow(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            listOf(
                                Triple("rainbow", "Rainbow Loop", 500),
                                Triple("breathe", "Breathe", 350),
                                Triple("strobe", "Strobe", 250),
                                Triple("party", "Party", 600),
                                Triple("candle", "Candle", 450),
                                Triple("sunrise", "Sunrise", 1000)
                            ).forEach { (id, label, gap) ->
                                val isSelected = activePattern == id
                                FilterChip(
                                    selected = isSelected,
                                    onClick = {
                                        vm.setAttributes(buildJsonObject {
                                            put("light_scene", if (isSelected) JsonNull else JsonPrimitive(id))
                                            put("light_scene_gap", if (isSelected) JsonNull else JsonPrimitive(gap))
                                            put("custom_scene_colors", JsonNull)
                                            put("color", JsonNull)
                                            put("color_temp", JsonPrimitive(0))
                                        })
                                    },
                                    label = { Text(label) },
                                    enabled = isEnabled && isPowerOn
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FlowRow(
    modifier: Modifier = Modifier,
    horizontalArrangement: Arrangement.Horizontal = Arrangement.Start,
    verticalArrangement: Arrangement.Vertical = Arrangement.Top,
    content: @Composable () -> Unit
) {
    androidx.compose.foundation.layout.FlowRow(
        modifier = modifier,
        horizontalArrangement = horizontalArrangement,
        verticalArrangement = verticalArrangement
    ) {
        content()
    }
}

@Composable
private fun EnergyCostCard(state: DeviceDetailUiState) {
    val dev = state.device ?: return
    val energySummary = state.energySummary
    val devState = state.deviceState
    val attributes = devState?.attributes ?: JsonObject(emptyMap())

    val energyDevice = energySummary?.devices?.find { it.device_id == dev.id }

    val currentDraw = energyDevice?.power_w ?: attributes["current_consumption"]?.jsonPrimitive?.doubleOrNull ?: attributes["power_w"]?.jsonPrimitive?.doubleOrNull ?: 0.0
    val energy24h = energyDevice?.energy_kwh ?: 0.0
    val cost24h = energy24h * 8.0 // default flat rate ₹8.0/kWh

    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                "Energy & Cost (24h)",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Current Draw Card
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.2f),
                    shape = MaterialTheme.shapes.medium,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)),
                    modifier = Modifier.weight(1f)
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Rounded.Bolt, null, tint = DomusGreen, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Draw Now", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "${currentDraw.toInt()} W",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                }

                // Energy Card
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.2f),
                    shape = MaterialTheme.shapes.medium,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)),
                    modifier = Modifier.weight(1f)
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Rounded.Speed, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Energy (24h)", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = String.format(Locale.US, "%.3f kWh", energy24h),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                }
            }

            // Total Cost Row
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
                shape = MaterialTheme.shapes.medium,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.Wallet, null, tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Est. Cost (Flat ₹8.0/kWh)", fontWeight = FontWeight.SemiBold)
                    }
                    Text(
                        text = String.format(Locale.US, "₹%.2f", cost24h),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = DomusGreen,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
        }
    }
}

@Composable
private fun MetadataCard(dev: Device) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                "Metadata Specs",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )

            val specs = listOf(
                Pair("Manufacturer", dev.manufacturer ?: "—"),
                Pair("Model Name", dev.model ?: "—"),
                Pair("Serial Code", dev.serial_number ?: "—"),
                Pair("External ID", dev.external_id),
                Pair("Last Seen", dev.last_seen?.let { formatIsoTimestamp(it) } ?: "Never")
            )

            specs.forEach { (label, value) ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        value,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        fontFamily = if (label in listOf("Serial Code", "External ID")) FontFamily.Monospace else FontFamily.Default,
                        fontSize = if (label in listOf("Serial Code", "External ID")) 12.sp else 14.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun HistoryTabContent(state: DeviceDetailUiState) {
    val dev = state.device ?: return
    val history = state.history

    // Format and parse coordinates for custom drawing
    val points = remember(history, dev.device_type) {
        history.mapNotNull { h ->
            val timeString = try {
                val clean = h.created_at.replace("Z", "").split(".")[0]
                val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault()).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }
                val date = parser.parse(clean) ?: return@mapNotNull null
                val formatter = SimpleDateFormat("HH:mm", Locale.getDefault())
                formatter.format(date)
            } catch (e: Exception) {
                ""
            }

            val value = when (dev.device_type) {
                DeviceType.PLUG -> {
                    h.attributes["current_consumption"]?.jsonPrimitive?.doubleOrNull
                        ?: h.attributes["power_w"]?.jsonPrimitive?.doubleOrNull ?: 0.0
                }
                DeviceType.THERMOSTAT -> {
                    h.state.toDoubleOrNull() ?: h.attributes["temperature"]?.jsonPrimitive?.doubleOrNull ?: 0.0
                }
                DeviceType.LIGHT -> {
                    if (h.state.lowercase() == "on") {
                        h.attributes["brightness"]?.jsonPrimitive?.doubleOrNull ?: 100.0
                    } else 0.0
                }
                else -> {
                    if (h.state.lowercase() == "on") 100.0 else 0.0
                }
            }
            Pair(timeString, value)
        }.reversed()
    }

    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)),
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                "Telemetry Plot",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = when (dev.device_type) {
                    DeviceType.PLUG -> "Power consumption load curve (Watts)"
                    DeviceType.THERMOSTAT -> "Temperature sensor log (°C)"
                    else -> "Active operation curve (%)"
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(Modifier.height(20.dp))

            if (points.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text("No telemetry points recorded yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                val primaryColor = MaterialTheme.colorScheme.primary

                // Render custom line and area graph
                Canvas(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp)
                ) {
                    val paddingX = 40.dp.toPx()
                    val paddingY = 20.dp.toPx()
                    val chartWidth = size.width - 2 * paddingX
                    val chartHeight = size.height - 2 * paddingY

                    val maxVal = points.maxOfOrNull { it.second }?.toFloat()?.coerceAtLeast(1f) ?: 100f
                    val minVal = 0f
                    val valRange = (maxVal - minVal).coerceAtLeast(0.1f)

                    val count = points.size
                    val stepX = if (count > 1) chartWidth / (count - 1) else chartWidth

                    val path = Path()
                    val areaPath = Path()

                    points.forEachIndexed { idx, pair ->
                        val x = paddingX + idx * stepX
                        val y = size.height - paddingY - ((pair.second.toFloat() - minVal) / valRange) * chartHeight

                        if (idx == 0) {
                            path.moveTo(x, y)
                            areaPath.moveTo(x, size.height - paddingY)
                            areaPath.lineTo(x, y)
                        } else {
                            path.lineTo(x, y)
                            areaPath.lineTo(x, y)
                        }

                        if (idx == count - 1) {
                            areaPath.lineTo(x, size.height - paddingY)
                            areaPath.close()
                        }
                    }

                    // Background grid lines
                    val gridLines = 4
                    for (i in 0..gridLines) {
                        val y = paddingY + (i.toFloat() / gridLines) * chartHeight
                        drawLine(
                            color = Color.LightGray.copy(alpha = 0.15f),
                            start = Offset(paddingX, y),
                            end = Offset(size.width - paddingX, y),
                            strokeWidth = 1.dp.toPx()
                        )
                    }

                    // Draw area and line
                    if (count > 0) {
                        drawPath(
                            path = areaPath,
                            brush = Brush.verticalGradient(
                                colors = listOf(primaryColor.copy(alpha = 0.25f), Color.Transparent),
                                startY = paddingY,
                                endY = size.height - paddingY
                            )
                        )

                        drawPath(
                            path = path,
                            color = primaryColor,
                            style = Stroke(
                                width = 3.dp.toPx(),
                                cap = StrokeCap.Round,
                                join = StrokeJoin.Round
                            )
                        )
                    }

                    // Draw bounds/texts
                    val textPaint = android.graphics.Paint().apply {
                        color = android.graphics.Color.GRAY
                        textSize = 9.sp.toPx()
                        textAlign = android.graphics.Paint.Align.RIGHT
                    }

                    drawContext.canvas.nativeCanvas.drawText(
                        "${maxVal.toInt()}",
                        paddingX - 8.dp.toPx(),
                        paddingY + 4.dp.toPx(),
                        textPaint
                    )

                    drawContext.canvas.nativeCanvas.drawText(
                        "0",
                        paddingX - 8.dp.toPx(),
                        size.height - paddingY + 4.dp.toPx(),
                        textPaint
                    )

                    // Draw bottom timestamps
                    val timePaint = android.graphics.Paint().apply {
                        color = android.graphics.Color.GRAY
                        textSize = 9.sp.toPx()
                        textAlign = android.graphics.Paint.Align.CENTER
                    }

                    if (count > 0) {
                        drawContext.canvas.nativeCanvas.drawText(
                            points.first().first,
                            paddingX,
                            size.height - 2.dp.toPx(),
                            timePaint
                        )
                        if (count > 2) {
                            drawContext.canvas.nativeCanvas.drawText(
                                points[count / 2].first,
                                paddingX + chartWidth / 2,
                                size.height - 2.dp.toPx(),
                                timePaint
                            )
                        }
                        if (count > 1) {
                            drawContext.canvas.nativeCanvas.drawText(
                                points.last().first,
                                size.width - paddingX,
                                size.height - 2.dp.toPx(),
                                timePaint
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LogsTabContent(state: DeviceDetailUiState) {
    val history = state.history

    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)),
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                "State Change Logs Feed",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Text(
                "Logs pushed over websocket connections.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(Modifier.height(12.dp))

            if (history.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    Text("No logged events.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(history) { log ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(
                                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.15f),
                                    MaterialTheme.shapes.medium
                                )
                                .border(
                                    1.dp,
                                    MaterialTheme.colorScheme.outline.copy(alpha = 0.1f),
                                    MaterialTheme.shapes.medium
                                )
                                .padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = formatIsoTimestamp(log.created_at),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    text = "State: ${log.state.uppercase()}",
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                            
                            Text(
                                text = log.attributes.toString(),
                                style = MaterialTheme.typography.bodySmall,
                                fontFamily = FontFamily.Monospace,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier
                                    .padding(start = 12.dp)
                                    .weight(1.5f),
                                maxLines = 3
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingsTabContent(
    state: DeviceDetailUiState,
    vm: DeviceDetailViewModel,
    onBack: () -> Unit
) {
    val dev = state.device ?: return
    var name by remember { mutableStateOf(dev.name) }
    var selectedRoomId by remember { mutableStateOf(dev.room_id ?: "none") }
    var showDeleteConfirm by remember { mutableStateOf(false) }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Remove Device?") },
            text = { Text("Are you sure you want to delete \"${dev.name}\"? This removes the hardware integration and all historical logging records.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteConfirm = false
                        vm.deleteDevice(onSuccess = onBack)
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Remove")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shape = MaterialTheme.shapes.large,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Text(
                        "Edit Device Settings",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )

                    DomusTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = "Device Name"
                    )

                    Column {
                        Text(
                            "Room Assignment",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(bottom = 6.dp)
                        )

                        // Room selector dropdown (custom layout in Box)
                        var dropdownExpanded by remember { mutableStateOf(false) }
                        val currentRoomName = if (selectedRoomId == "none") "Unassigned / None" else {
                            state.rooms.find { it.id == selectedRoomId }?.name ?: "Unknown Room"
                        }

                        Box(modifier = Modifier.fillMaxWidth()) {
                            Surface(
                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                shape = MaterialTheme.shapes.small,
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.4f)),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { dropdownExpanded = true }
                            ) {
                                Row(
                                    modifier = Modifier.padding(16.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(currentRoomName, style = MaterialTheme.typography.bodyMedium)
                                    Text("▼", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }

                            DropdownMenu(
                                expanded = dropdownExpanded,
                                onDismissRequest = { dropdownExpanded = false },
                                modifier = Modifier.fillMaxWidth(0.9f)
                            ) {
                                DropdownMenuItem(
                                    text = { Text("Unassigned / None") },
                                    onClick = {
                                        selectedRoomId = "none"
                                        dropdownExpanded = false
                                    }
                                )
                                state.rooms.forEach { r ->
                                    DropdownMenuItem(
                                        text = { Text(r.name) },
                                        onClick = {
                                            selectedRoomId = r.id
                                            dropdownExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }

                    if (state.errorMessage != null) {
                        Text(
                            state.errorMessage,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }

                    DomusButton(
                        text = "Save Settings",
                        onClick = {
                            vm.updateSettings(name, selectedRoomId) {
                                // optional feedback toast or success action
                            }
                        },
                        loading = state.isSaving,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }

        // Danger Zone
        item {
            Surface(
                color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.15f),
                shape = MaterialTheme.shapes.large,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.3f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        "Danger Zone",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.error
                    )
                    Text(
                        "Actions cannot be reverted. Removing a device detaches it from room scopes and deletes all history logging records.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Button(
                        onClick = { showDeleteConfirm = true },
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !state.isDeleting
                    ) {
                        if (state.isDeleting) {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = Color.White)
                        } else {
                            Icon(Icons.Rounded.Delete, null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Remove Device")
                        }
                    }
                }
            }
        }
    }
}

// Utility to parse/format ISO strings robustly
private fun formatIsoTimestamp(isoString: String): String {
    return try {
        val clean = isoString.replace("Z", "").split(".")[0]
        val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault()).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
        val date = parser.parse(clean) ?: return isoString
        val formatter = SimpleDateFormat("dd MMM, HH:mm:ss", Locale.getDefault())
        formatter.format(date)
    } catch (e: Exception) {
        isoString
    }
}
