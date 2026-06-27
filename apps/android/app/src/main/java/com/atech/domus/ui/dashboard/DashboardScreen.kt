package com.atech.domus.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.atech.domus.DomusApp
import com.atech.ui_shared.component.DomusLogo
import kotlinx.coroutines.launch

// ponytail: placeholder home — replaced by the device dashboard in the next stage.
@Composable
fun DashboardScreen() {
    val context = LocalContext.current
    val core = (context.applicationContext as DomusApp).core
    val scope = androidx.compose.runtime.rememberCoroutineScope()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .systemBarsPadding()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        DomusLogo()
        Spacer(Modifier.height(24.dp))
        Text(
            "You're connected",
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            core.currentBaseUrl,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(24.dp))
        TextButton(onClick = { scope.launch { core.auth.logout() } }) {
            Text("Sign out", color = MaterialTheme.colorScheme.primary)
        }
    }
}
