package com.atech.domus.ui.electricity

import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import com.atech.ui_shared.component.DomusLogo
import androidx.compose.ui.graphics.Color
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.atech.core.model.EnergyDevice
import com.atech.core.model.EnergySummary
import com.atech.ui_shared.theme.DomusGreen
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ElectricityScreen(vm: ElectricityViewModel, contentPadding: PaddingValues) {
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
            is ElectricityState.Loading -> Box(
                Modifier.fillMaxSize()
                    .padding(top = innerPadding.calculateTopPadding())
                    .padding(bottom = contentPadding.calculateBottomPadding()),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator(color = MaterialTheme.colorScheme.primary) }

            is ElectricityState.Error -> Box(
                Modifier.fillMaxSize()
                    .padding(top = innerPadding.calculateTopPadding())
                    .padding(bottom = contentPadding.calculateBottomPadding())
                    .padding(24.dp),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Couldn't load usage", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onBackground)
                    Spacer(Modifier.height(8.dp))
                    Text(s.message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(16.dp))
                    TextButton(onClick = vm::retry) { Text("Retry", color = MaterialTheme.colorScheme.primary) }
                }
            }

            is ElectricityState.Content -> Box(Modifier.padding(top = innerPadding.calculateTopPadding())) {
                Content(s.summary, contentPadding)
            }
        }
    }
}

@Composable
private fun Content(summary: EnergySummary, contentPadding: PaddingValues) {
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
            Text(
                "Electricity",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp),
            )
        }
        item { PowerHero(summary) }
        if (summary.series.isNotEmpty()) {
            item { UsageChart(summary) }
        }
        if (summary.devices.isNotEmpty()) {
            item {
                Text(
                    "By device",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.padding(start = 4.dp, end = 4.dp, top = 8.dp),
                )
            }
            items(summary.devices.sortedByDescending { it.power_w }) { DeviceUsageRow(it) }
        }
    }
}

@Composable
private fun PowerHero(summary: EnergySummary) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.large,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Drawing now", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        summary.total_power_w.roundToInt().toString(),
                        style = MaterialTheme.typography.headlineLarge,
                        fontWeight = FontWeight.Bold,
                        color = DomusGreen,
                    )
                    Spacer(Modifier.width(4.dp))
                    Text("W", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(bottom = 4.dp))
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("Last ${summary.range_hours.roundToInt()}h", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(4.dp))
                Text(
                    "%.2f kWh".format(summary.total_kwh),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}

@Composable
private fun UsageChart(summary: EnergySummary) {
    val bars = summary.series.map { it.kwh.toFloat() }
    val max = (bars.maxOrNull() ?: 0f).coerceAtLeast(0.0001f)
    val barColor = DomusGreen
    val trackColor = MaterialTheme.colorScheme.surfaceVariant
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.large,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text("Usage over time", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
            Canvas(Modifier.fillMaxWidth().height(120.dp)) {
                val n = bars.size
                if (n == 0) return@Canvas
                val gap = 3.dp.toPx()
                val barWidth = ((size.width - gap * (n - 1)) / n).coerceAtLeast(1f)
                bars.forEachIndexed { i, v ->
                    val h = (v / max) * size.height
                    val x = i * (barWidth + gap)
                    drawRoundRect(
                        color = trackColor,
                        topLeft = Offset(x, 0f),
                        size = Size(barWidth, size.height),
                        cornerRadius = androidx.compose.ui.geometry.CornerRadius(barWidth / 2),
                    )
                    drawRoundRect(
                        color = barColor,
                        topLeft = Offset(x, size.height - h),
                        size = Size(barWidth, h),
                        cornerRadius = androidx.compose.ui.geometry.CornerRadius(barWidth / 2),
                    )
                }
            }
        }
    }
}

@Composable
private fun DeviceUsageRow(device: EnergyDevice) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(
                color = DomusGreen,
                shape = RoundedCornerShape(2.dp),
                modifier = Modifier.height(36.dp).width(4.dp),
            ) {}
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(device.name, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                device.model?.let {
                    Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("${device.power_w.roundToInt()} W", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                Text("%.2f kWh".format(device.energy_kwh), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
