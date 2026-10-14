package com.aiyu.domus

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.ButtonDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aiyu.domus.core.MatterBridge
import com.aiyu.domus.ui.components.SectionTitle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** The pairing QR from the server's module grid; dark on white whatever the theme, as scanners expect. */
@Composable
private fun MatterQr(rows: List<String>) {
    val label = stringResource(R.string.matter_qr)
    Canvas(Modifier.size(200.dp).background(Color.White, MaterialTheme.shapes.small).padding(12.dp).semantics { contentDescription = label }) {
        val cell = size.width / rows.size.coerceAtLeast(1)
        rows.forEachIndexed { y, row ->
            row.forEachIndexed { x, c -> if (c == '1') drawRect(Color.Black, Offset(x * cell, y * cell), Size(cell + 0.5f, cell + 0.5f)) }
        }
    }
}

/** Share devices with Google Home, Apple Home, Alexa or Home Assistant through the Matter bridge (administrators). */
@Composable
fun MatterPage(onBack: () -> Unit) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    val devices by repository.devices.collectAsStateWithLifecycle()
    var bridge by remember { mutableStateOf<MatterBridge?>(null) }
    var resetting by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        while (true) {
            repository.request { it.matter() }?.let { bridge = it }
            delay(5_000)
        }
    }
    fun change(block: suspend (com.aiyu.domus.core.DomusApi) -> MatterBridge) = scope.launch { repository.request(block)?.let { bridge = it } }
    val shareable = devices.filter { it.state.isOn != null && it.type != "sensor" }
    val c = MaterialTheme.colorScheme

    SubPage(stringResource(R.string.matter_title), onBack) {
        val b = bridge ?: return@SubPage
        // SubPage scrolls and pads the body; a second scroll here would crash.
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(stringResource(R.string.matter_explain), style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
            Surface(color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
                Row(
                    Modifier.toggleable(b.enabled, role = Role.Switch) { on ->
                        change { it.saveMatter(on, b.devices.ifEmpty { shareable.map { d -> d.id } }) }
                    }.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(stringResource(R.string.matter_enable), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    Switch(b.enabled, onCheckedChange = null)
                }
            }
            if (!b.enabled) return@Column
            Text(
                b.error?.let { stringResource(R.string.matter_error) + ": " + it } ?: stringResource(if (b.paired) R.string.matter_paired else R.string.matter_waiting),
                style = MaterialTheme.typography.labelLarge,
                color = when { b.error != null -> c.error; b.paired -> c.primary; else -> c.onSurfaceVariant },
            )
            MatterQr(b.qr)
            Text(stringResource(R.string.matter_code), style = MaterialTheme.typography.labelMedium, color = c.onSurfaceVariant)
            Text(b.pairingCode, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
            Text(stringResource(R.string.matter_uncertified), style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant)
            SectionTitle(stringResource(R.string.matter_devices))
            if (shareable.isEmpty()) Text(stringResource(R.string.matter_no_devices), style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
            shareable.forEach { device ->
                val shared = device.id in b.devices
                Row(
                    Modifier.fillMaxWidth().toggleable(shared, role = Role.Checkbox) { on ->
                        change { it.saveMatter(true, if (on) b.devices + device.id else b.devices - device.id) }
                    }.padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(shared, onCheckedChange = null)
                    Spacer(Modifier.width(12.dp))
                    Text(device.name, style = MaterialTheme.typography.bodyLarge)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton({ change { it.matterPairing() } }) { Text(stringResource(R.string.matter_allow_pairing)) }
                TextButton({ resetting = true }, colors = ButtonDefaults.textButtonColors(contentColor = c.error)) { Text(stringResource(R.string.matter_reset)) }
            }
        }
    }
    if (resetting) {
        Confirm(stringResource(R.string.matter_reset_title), stringResource(R.string.matter_reset_message), stringResource(R.string.matter_reset), {
            resetting = false
            change { it.matterReset() }
        }, { resetting = false })
    }
}
