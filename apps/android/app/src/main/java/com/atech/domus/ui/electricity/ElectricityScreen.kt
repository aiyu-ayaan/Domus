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
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.unit.sp
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import androidx.compose.foundation.BorderStroke


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
    val series = summary.series
    val points = remember(series) {
        series.map { point ->
            val timeString = try {
                val clean = point.t.replace("Z", "").split(".")[0]
                val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault()).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }
                val date = parser.parse(clean) ?: return@map Pair("", point.kwh.toFloat())
                val formatter = SimpleDateFormat("HH:mm", Locale.getDefault())
                formatter.format(date)
            } catch (e: Exception) {
                ""
            }
            Pair(timeString, point.kwh.toFloat())
        }
    }

    val maxVal = remember(points) {
        points.maxOfOrNull { it.second }?.coerceAtLeast(0.0001f) ?: 0.0001f
    }
    val minVal = 0f
    val valRange = maxVal - minVal

    val barColor = DomusGreen
    val gridColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f)

    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(
                "Usage over time",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(16.dp))
            Canvas(Modifier.fillMaxWidth().height(160.dp)) {
                val paddingLeft = 55.dp.toPx()
                val paddingRight = 10.dp.toPx()
                val paddingTop = 10.dp.toPx()
                val paddingBottom = 20.dp.toPx()

                val chartWidth = size.width - paddingLeft - paddingRight
                val chartHeight = size.height - paddingTop - paddingBottom

                val count = points.size
                if (count == 0) return@Canvas

                // 1. Draw horizontal grid lines and Y-axis labels
                val gridLinesCount = 3
                val textPaint = android.graphics.Paint().apply {
                    color = android.graphics.Color.GRAY
                    textSize = 9.sp.toPx()
                    textAlign = android.graphics.Paint.Align.RIGHT
                    isAntiAlias = true
                }

                for (i in 0..gridLinesCount) {
                    val ratio = i.toFloat() / gridLinesCount
                    val y = paddingTop + (1f - ratio) * chartHeight

                    // Grid line
                    drawLine(
                        color = gridColor,
                        start = Offset(paddingLeft, y),
                        end = Offset(size.width - paddingRight, y),
                        strokeWidth = 1.dp.toPx()
                    )

                    // Y-axis Label
                    val labelValue = minVal + ratio * valRange
                    val labelText = if (labelValue >= 1f) "%.1f kWh".format(labelValue) else "%.3f kWh".format(labelValue)
                    drawContext.canvas.nativeCanvas.drawText(
                        labelText,
                        paddingLeft - 8.dp.toPx(),
                        y + 4.dp.toPx(),
                        textPaint
                    )
                }

                // 2. Draw smooth area and line chart
                val stepX = if (count > 1) chartWidth / (count - 1) else chartWidth
                val path = Path()
                val areaPath = Path()

                points.forEachIndexed { idx, pair ->
                    val x = paddingLeft + idx * stepX
                    val ratioY = (pair.second - minVal) / valRange
                    val y = size.height - paddingBottom - ratioY * chartHeight

                    if (idx == 0) {
                        path.moveTo(x, y)
                        areaPath.moveTo(x, size.height - paddingBottom)
                        areaPath.lineTo(x, y)
                    } else {
                        path.lineTo(x, y)
                        areaPath.lineTo(x, y)
                    }

                    if (idx == count - 1) {
                        areaPath.lineTo(x, size.height - paddingBottom)
                        areaPath.close()
                    }
                }

                if (count > 0) {
                    // Fill area
                    drawPath(
                        path = areaPath,
                        brush = Brush.verticalGradient(
                            colors = listOf(barColor.copy(alpha = 0.2f), Color.Transparent),
                            startY = paddingTop,
                            endY = size.height - paddingBottom
                        )
                    )

                    // Draw stroke line
                    drawPath(
                        path = path,
                        color = barColor,
                        style = Stroke(
                            width = 2.dp.toPx(),
                            cap = StrokeCap.Round,
                            join = StrokeJoin.Round
                        )
                    )
                }

                // 3. Draw X-axis timestamps (Start, Mid, End)
                val timePaint = android.graphics.Paint().apply {
                    color = android.graphics.Color.GRAY
                    textSize = 9.sp.toPx()
                    textAlign = android.graphics.Paint.Align.CENTER
                    isAntiAlias = true
                }

                val labelY = size.height - 2.dp.toPx()
                if (count > 0 && points.first().first.isNotEmpty()) {
                    drawContext.canvas.nativeCanvas.drawText(
                        points.first().first,
                        paddingLeft,
                        labelY,
                        timePaint
                    )
                    if (count > 2 && points[count / 2].first.isNotEmpty()) {
                        drawContext.canvas.nativeCanvas.drawText(
                            points[count / 2].first,
                            paddingLeft + chartWidth / 2,
                            labelY,
                            timePaint
                        )
                    }
                    if (count > 1 && points.last().first.isNotEmpty()) {
                        drawContext.canvas.nativeCanvas.drawText(
                            points.last().first,
                            size.width - paddingRight,
                            labelY,
                            timePaint
                        )
                    }
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
