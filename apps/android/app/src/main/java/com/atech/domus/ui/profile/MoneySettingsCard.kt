package com.atech.domus.ui.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.atech.ui_shared.component.DomusButton
import com.atech.ui_shared.component.DomusTextField

private fun Double.tidy(): String =
    if (this == toLong().toDouble()) toLong().toString() else toString()

@Composable
fun MoneySettingsCard(vm: MoneySettingsViewModel = viewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    val b = s.settings

    var currency by remember(b.currency) { mutableStateOf(b.currency) }
    var rate by remember(b.rate) { mutableStateOf(b.rate.tidy()) }
    var fixed by remember(b.fixed_charge) { mutableStateOf(b.fixed_charge.tidy()) }
    var cycleDay by remember(b.billing_cycle_start_day) {
        mutableStateOf(b.billing_cycle_start_day.toString())
    }
    var tiered by remember(b.type) { mutableStateOf(b.type == "tiered") }

    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Money & Billing",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                "Currency and unit price for cost estimates. Synced to all your devices.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            DomusTextField(value = currency, onValueChange = { currency = it }, label = "Currency symbol")

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = !tiered,
                    onClick = { tiered = false },
                    label = { Text("Flat /unit") },
                )
                FilterChip(
                    selected = tiered,
                    onClick = { tiered = true },
                    label = { Text("Tiered /range") },
                )
            }

            if (!tiered) {
                DomusTextField(
                    value = rate,
                    onValueChange = { rate = it },
                    label = "Rate per kWh",
                    keyboardType = KeyboardType.Decimal,
                )
            } else {
                Text(
                    "Tiered slabs are edited on the web dashboard; currency, fixed charge and "
                        + "billing day still sync from here.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            DomusTextField(
                value = fixed,
                onValueChange = { fixed = it },
                label = "Fixed charge",
                keyboardType = KeyboardType.Decimal,
            )
            DomusTextField(
                value = cycleDay,
                onValueChange = { cycleDay = it },
                label = "Billing cycle start day (1-31)",
                keyboardType = KeyboardType.Number,
            )

            DomusButton(
                text = if (s.savedAt > 0L) "Saved & synced ✓" else "Save & sync",
                onClick = {
                    vm.edit {
                        it.copy(
                            currency = currency.ifBlank { "₹" },
                            type = if (tiered) "tiered" else "flat",
                            rate = rate.toDoubleOrNull() ?: it.rate,
                            fixed_charge = fixed.toDoubleOrNull() ?: 0.0,
                            billing_cycle_start_day = (cycleDay.toIntOrNull() ?: 1).coerceIn(1, 31),
                        )
                    }
                    vm.save()
                },
                loading = s.saving,
                modifier = Modifier.fillMaxWidth().height(50.dp),
            )
        }
    }
}
