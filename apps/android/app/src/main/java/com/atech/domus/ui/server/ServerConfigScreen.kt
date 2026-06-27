package com.atech.domus.ui.server

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Dns
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.atech.ui_shared.component.DomusButton
import com.atech.ui_shared.component.DomusLogo
import com.atech.ui_shared.component.DomusTextField

@Composable
fun ServerConfigScreen(vm: ServerConfigViewModel = viewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .systemBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Spacer(Modifier.height(48.dp))
        DomusLogo()
        Spacer(Modifier.height(40.dp))

        Text(
            "Connect to your server",
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "Enter the address of your self-hosted Domus backend to get started.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(32.dp))

        DomusTextField(
            value = state.url,
            onValueChange = vm::onUrlChange,
            label = "Server URL",
            placeholder = "http://192.168.1.50:8000",
            leadingIcon = Icons.Rounded.Dns,
            keyboardType = KeyboardType.Uri,
            isError = state.error != null,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "Tip: on the Android emulator, use http://10.0.2.2:8000 to reach your computer.",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
        )

        state.error?.let { err ->
            Spacer(Modifier.height(16.dp))
            StatusRow(error = err)
        }
        if (state.reachable) {
            Spacer(Modifier.height(16.dp))
            StatusRow(success = "Server reachable")
        }

        Spacer(Modifier.height(28.dp))
        DomusButton(
            text = "Connect",
            onClick = vm::connect,
            loading = state.testing,
            enabled = state.url.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        )

        if (state.error != null) {
            TextButton(onClick = vm::saveAnyway) {
                Text("Save anyway", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.height(48.dp))
    }
}

@Composable
private fun StatusRow(error: String? = null, success: String? = null) {
    val color = if (error != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
    Surface(
        color = color.copy(alpha = 0.10f),
        shape = MaterialTheme.shapes.small,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                if (error != null) Icons.Rounded.ErrorOutline else Icons.Rounded.CheckCircle,
                contentDescription = null,
                tint = color,
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.size(10.dp))
            Text(
                error ?: success.orEmpty(),
                style = MaterialTheme.typography.bodyMedium,
                color = color,
            )
        }
    }
}
