package com.aiyu.domus

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.WbSunny
import androidx.compose.material3.MaterialShapes
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.aiyu.domus.core.Weather
import com.aiyu.domus.core.airLevel
import kotlin.math.roundToInt

/** Outdoor readings a weather trigger or condition can compare (the server's `weather::PROPERTIES`). */
val WeatherReadings = listOf(
    "temperature" to R.string.weather_reading_temperature,
    "humidity" to R.string.weather_reading_humidity,
    "pm25" to R.string.weather_reading_pm25,
    "us_aqi" to R.string.weather_reading_us_aqi,
)

/** WMO weather code to a phrase. */
@Composable
fun weatherLabel(code: Int?): String? = when (code) {
    null -> null
    0 -> R.string.weather_clear
    1, 2 -> R.string.weather_partly_cloudy
    3 -> R.string.weather_overcast
    45, 48 -> R.string.weather_fog
    in 51..57 -> R.string.weather_drizzle
    in 61..67, in 80..82 -> R.string.weather_rain
    in 71..77, 85, 86 -> R.string.weather_snow
    in 95..99 -> R.string.weather_storm
    else -> null
}?.let { stringResource(it) }

/** Outside the home right now, as a card beside the home's own readings. */
@Composable
fun OutdoorCard(weather: Weather, modifier: Modifier = Modifier) {
    val c = MaterialTheme.colorScheme
    val detail = listOfNotNull(
        weatherLabel(weather.weatherCode),
        weather.humidity?.let { stringResource(R.string.weather_humidity, it.roundToInt()) },
        weather.pm25?.let { stringResource(R.string.weather_outdoor_pm25_value, it.roundToInt(), airLevel(it.toFloat()).text()) },
    ).joinToString(" · ")
    StatCard(
        stringResource(R.string.weather_title),
        weather.temperature?.let { "${it.roundToInt()}°" } ?: "—",
        detail.ifEmpty { null },
        Icons.Rounded.WbSunny, MaterialShapes.Sunny, c.surfaceContainerHigh, c.onSurface, modifier,
    )
}
