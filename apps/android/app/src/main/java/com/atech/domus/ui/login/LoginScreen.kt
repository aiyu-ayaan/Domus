package com.atech.domus.ui.login

import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.material.icons.rounded.AlternateEmail
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Person
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
fun LoginScreen(vm: LoginViewModel = viewModel()) {
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
        Spacer(Modifier.height(40.dp))
        DomusLogo()
        Spacer(Modifier.height(36.dp))

        Text(
            if (state.registerMode) "Create your account" else "Welcome back",
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            vm.serverUrl,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(28.dp))

        AnimatedVisibility(visible = state.registerMode) {
            Column {
                DomusTextField(
                    value = state.fullName,
                    onValueChange = vm::onFullName,
                    label = "Full name",
                    placeholder = "Optional",
                    leadingIcon = Icons.Rounded.Person,
                )
                Spacer(Modifier.height(14.dp))
            }
        }

        DomusTextField(
            value = state.email,
            onValueChange = vm::onEmail,
            label = "Email",
            placeholder = "you@home.local",
            leadingIcon = Icons.Rounded.AlternateEmail,
            keyboardType = KeyboardType.Email,
            isError = state.error != null,
        )
        Spacer(Modifier.height(14.dp))
        DomusTextField(
            value = state.password,
            onValueChange = vm::onPassword,
            label = "Password",
            placeholder = "At least 8 characters",
            leadingIcon = Icons.Rounded.Lock,
            isPassword = true,
            keyboardType = KeyboardType.Password,
            isError = state.error != null,
        )

        AnimatedVisibility(visible = state.error != null) {
            Column {
                Spacer(Modifier.height(16.dp))
                ErrorBanner(state.error.orEmpty())
            }
        }

        Spacer(Modifier.height(24.dp))
        DomusButton(
            text = if (state.registerMode) "Create account" else "Sign in",
            onClick = vm::submit,
            loading = state.submitting,
            enabled = state.canSubmit,
            modifier = Modifier.fillMaxWidth(),
        )

        Spacer(Modifier.height(4.dp))
        TextButton(onClick = vm::toggleMode) {
            Text(
                if (state.registerMode) "Already have an account? Sign in"
                else "New here? Create an account",
                color = MaterialTheme.colorScheme.primary,
            )
        }

        Spacer(Modifier.height(8.dp))
        TextButton(onClick = vm::changeServer) {
            Text("Change server", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.height(32.dp))
    }
}

@Composable
private fun ErrorBanner(message: String) {
    Surface(
        color = MaterialTheme.colorScheme.error.copy(alpha = 0.10f),
        shape = MaterialTheme.shapes.small,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Rounded.ErrorOutline,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.error,
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.size(10.dp))
            Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
        }
    }
}
