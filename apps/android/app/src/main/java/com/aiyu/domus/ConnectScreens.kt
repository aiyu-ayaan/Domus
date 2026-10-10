package com.aiyu.domus

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material.icons.rounded.Dns
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.MaterialShapes
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.aiyu.domus.core.ConnectResult
import com.aiyu.domus.core.FoundServer
import com.aiyu.domus.core.ServerDiscovery
import com.aiyu.domus.core.Session
import com.aiyu.domus.ui.components.MorphingShape
import com.aiyu.domus.ui.components.ShapedIcon
import com.aiyu.domus.ui.components.enterStaggered
import kotlinx.coroutines.launch

/** Centered, scrollable column for the screens before sign-in. */
@Composable
private fun EntryColumn(title: String, subtitle: String, content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxSize().systemBarsPadding().imePadding(), contentAlignment = Alignment.TopCenter) {
        Column(
            Modifier.widthIn(max = 520.dp).fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Spacer(Modifier.height(24.dp))
            MorphingShape(Modifier.size(120.dp))
            Text(title, style = MaterialTheme.typography.displaySmall, textAlign = TextAlign.Center, modifier = Modifier.semantics { heading() })
            Text(subtitle, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
            content()
        }
    }
}

@Composable
private fun ErrorText(message: String?) {
    AnimatedVisibility(message != null) {
        Text(message.orEmpty(), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.fillMaxWidth())
    }
}

/** A full-width button that shows the expressive loading indicator while [busy]. */
@Composable
private fun SubmitButton(text: String, busy: Boolean, enabled: Boolean = true, onClick: () -> Unit) {
    Button(onClick, enabled = enabled && !busy, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) {
        if (busy) LoadingIndicator(Modifier.size(28.dp)) else Text(text)
    }
}

/** First run: servers found on the network, or an address typed by hand (a hosted server, another subnet). */
@Composable
fun ConnectScreen() {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    var scan by remember { mutableIntStateOf(0) }
    var scanning by remember { mutableStateOf(true) }
    var found by remember { mutableStateOf(emptyList<FoundServer>()) }
    var address by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var untrusted by remember { mutableStateOf<ConnectResult.Untrusted?>(null) }

    LaunchedEffect(scan) {
        scanning = true
        found = ServerDiscovery.scan()
        scanning = false
    }

    fun connect(input: String, fingerprint: String? = null) {
        scope.launch {
            busy = true
            error = null
            when (val result = repository.connect(input, fingerprint)) {
                ConnectResult.Connected -> Unit
                is ConnectResult.Untrusted -> untrusted = result
                is ConnectResult.Failed -> error = result.message
            }
            busy = false
        }
    }

    EntryColumn("Welcome to Domus", "Connect to the server that runs your home.") {
        Text("On this network", style = MaterialTheme.typography.titleMedium, modifier = Modifier.fillMaxWidth().semantics { heading() })
        found.forEachIndexed { index, server ->
            Card(
                onClick = { connect(server.url) },
                enabled = !busy,
                colors = CardDefaults.cardColors(MaterialTheme.colorScheme.primaryContainer),
                modifier = Modifier.fillMaxWidth().enterStaggered(index),
            ) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    ShapedIcon(Icons.Rounded.Dns, MaterialShapes.Cookie9Sided, MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.onPrimary)
                    Spacer(Modifier.width(16.dp))
                    Column(Modifier.weight(1f)) {
                        Text(server.name, style = MaterialTheme.typography.titleMedium)
                        Text(server.url.removePrefix("https://"), style = MaterialTheme.typography.bodyMedium)
                    }
                    Icon(Icons.AutoMirrored.Rounded.ArrowForward, contentDescription = null)
                }
            }
        }
        if (scanning) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                LoadingIndicator()
                Spacer(Modifier.width(12.dp))
                Text("Looking for servers…", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            if (found.isEmpty()) {
                Text(
                    "No server answered. Check that this phone is on the same Wi‑Fi as the server, or enter its address below.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            FilledTonalButton({ scan++ }, Modifier.align(Alignment.Start)) {
                Icon(Icons.Rounded.Refresh, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Scan again")
            }
        }

        Text("Or enter the address", style = MaterialTheme.typography.titleMedium, modifier = Modifier.fillMaxWidth().padding(top = 8.dp).semantics { heading() })
        OutlinedTextField(
            value = address,
            onValueChange = { address = it; error = null },
            label = { Text("Server address") },
            placeholder = { Text("192.168.1.10:8443 or home.example.com") },
            singleLine = true,
            isError = error != null,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go),
            keyboardActions = KeyboardActions(onGo = { connect(address) }),
            modifier = Modifier.fillMaxWidth(),
        )
        ErrorText(error)
        SubmitButton("Connect", busy, enabled = address.isNotBlank()) { connect(address) }
    }

    untrusted?.let { pending ->
        AlertDialog(
            onDismissRequest = { untrusted = null },
            title = { Text("Trust this server?") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("${pending.url.removePrefix("https://")} uses a certificate it made itself, which is normal for a home server. Trust it only if the fingerprint matches the one the server prints when it starts.")
                    Text(pending.fingerprint, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = { Button({ untrusted = null; connect(pending.url, pending.fingerprint) }) { Text("Trust") } },
            dismissButton = { TextButton({ untrusted = null }) { Text("Cancel") } },
        )
    }
}

/** Sign in, or create the first administrator on a fresh server. */
@Composable
fun AuthScreen(session: Session.SignedOut) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    var username by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun submit() {
        scope.launch {
            busy = true
            error = if (session.needsSetup) repository.setup(username, email, password) else repository.login(username, password)
            busy = false
        }
    }

    EntryColumn(
        if (session.needsSetup) "Create the admin account" else "Welcome back",
        if (session.needsSetup) "This server is new. The first account manages everything." else session.server.removePrefix("https://"),
    ) {
        OutlinedTextField(
            username, { username = it; error = null },
            label = { Text("Username") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth(),
        )
        if (session.needsSetup) {
            OutlinedTextField(
                email, { email = it; error = null },
                label = { Text("Email") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        OutlinedTextField(
            password, { password = it; error = null },
            label = { Text("Password") },
            supportingText = if (session.needsSetup) ({ Text("At least 8 characters") }) else null,
            singleLine = true,
            isError = error != null,
            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = {
                IconButton({ showPassword = !showPassword }) {
                    Icon(if (showPassword) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility, if (showPassword) "Hide password" else "Show password")
                }
            },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
            keyboardActions = KeyboardActions(onGo = { submit() }),
            modifier = Modifier.fillMaxWidth(),
        )
        ErrorText(error)
        SubmitButton(if (session.needsSetup) "Create account" else "Sign in", busy, enabled = username.isNotBlank() && password.isNotEmpty()) { submit() }
        TextButton(repository::forgetServer) { Text("Use another server") }
    }
}

@Composable
fun UnreachableScreen(session: Session.Unreachable) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    EntryColumn("Can't reach your home", session.server.removePrefix("https://")) {
        ShapedIcon(Icons.Rounded.CloudOff, MaterialShapes.Pill, MaterialTheme.colorScheme.errorContainer, MaterialTheme.colorScheme.onErrorContainer)
        Text(session.message, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Button({ scope.launch { repository.restore() } }, Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text("Try again") }
        TextButton(repository::forgetServer) { Text("Use another server") }
    }
}
