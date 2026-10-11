package com.aiyu.domus

import com.aiyu.domus.ui.theme.clickHaptics
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.rounded.AdminPanelSettings
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.LockReset
import androidx.compose.material.icons.rounded.Pin
import androidx.compose.material.icons.rounded.Mail
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Router
import androidx.compose.material3.Surface
import androidx.compose.material3.toShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.graphics.shapes.RoundedPolygon
import com.aiyu.domus.ui.theme.rememberReducedMotion
import kotlin.math.absoluteValue
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

/** Two large tonal shapes drifting behind the screens before sign-in. Decoration only; still with animations off. */
@Composable
private fun Backdrop() {
    val c = MaterialTheme.colorScheme
    val turn = if (rememberReducedMotion()) 0f else rememberInfiniteTransition(label = "backdrop")
        .animateFloat(0f, 360f, infiniteRepeatable(tween(60_000, easing = LinearEasing)), label = "turn").value
    Box(Modifier.fillMaxSize().clipToBounds()) {
        Box(Modifier.align(Alignment.TopStart).offset((-110).dp, (-90).dp).size(320.dp).graphicsLayer { rotationZ = turn }.clip(MaterialShapes.Flower.toShape()).background(c.primaryContainer.copy(alpha = 0.55f)))
        Box(Modifier.align(Alignment.BottomEnd).offset(120.dp, 100.dp).size(340.dp).graphicsLayer { rotationZ = -turn }.clip(MaterialShapes.Cookie12Sided.toShape()).background(c.tertiaryContainer.copy(alpha = 0.55f)))
    }
}

/**
 * Frame of the screens before sign-in: the morphing mark carrying [icon], a headline, and the form on a raised
 * panel. Each part rises in after the one above it.
 */
@Composable
private fun EntryColumn(icon: ImageVector, title: String, subtitle: String, content: @Composable ColumnScope.() -> Unit) {
    val c = MaterialTheme.colorScheme
    Box(Modifier.fillMaxSize()) {
        Backdrop()
        Box(Modifier.fillMaxSize().systemBarsPadding().imePadding(), contentAlignment = Alignment.TopCenter) {
            Column(
                Modifier.widthIn(max = 520.dp).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Spacer(Modifier.height(32.dp))
                Box(Modifier.enterStaggered(0), contentAlignment = Alignment.Center) {
                    MorphingShape(Modifier.size(136.dp))
                    Icon(icon, contentDescription = null, tint = c.onPrimary, modifier = Modifier.size(56.dp))
                }
                Spacer(Modifier.height(24.dp))
                Text(title, style = MaterialTheme.typography.displaySmall, textAlign = TextAlign.Center, modifier = Modifier.enterStaggered(1).semantics { heading() })
                Spacer(Modifier.height(8.dp))
                Text(subtitle, style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.enterStaggered(2))
                Spacer(Modifier.height(28.dp))
                Surface(color = c.surfaceContainerLow, shape = MaterialTheme.shapes.extraLarge, shadowElevation = 2.dp, modifier = Modifier.fillMaxWidth().enterStaggered(3)) {
                    Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp), content = content)
                }
            }
        }
    }
}

private class Intro(val icon: ImageVector, val shape: RoundedPolygon, val title: String, val body: String)

private val Intros = listOf(
    Intro(Icons.Rounded.Home, MaterialShapes.Cookie9Sided, "Your whole home, one app", "Lights, plugs, purifiers and sensors from Tuya, Tapo, Xiaomi, Philips Hue and MQTT, side by side."),
    Intro(Icons.Rounded.Lock, MaterialShapes.Clover4Leaf, "Private by design", "Domus talks only to the server in your home, over an encrypted connection. No cloud account."),
    Intro(Icons.Rounded.Router, MaterialShapes.Sunny, "It finds your server", "On your Wi‑Fi the app finds the server by itself. Away from home, enter its address."),
)

/** First-run introduction: three pages to swipe or step through, then the connect screen. */
@Composable
fun OnboardingScreen() {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    val pager = rememberPagerState { Intros.size }
    val c = MaterialTheme.colorScheme
    val last = pager.currentPage == Intros.lastIndex
    // Back steps to the previous intro page; on the first page it leaves the app as usual.
    val back = rememberPredictiveBack(pager.currentPage > 0) { scope.launch { pager.animateScrollToPage(pager.currentPage - 1) } }
    Box(Modifier.fillMaxSize().predictiveBackEffect { back.value }) {
        Backdrop()
        Column(Modifier.fillMaxSize().systemBarsPadding().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            TextButton(repository::finishOnboarding, Modifier.align(Alignment.End)) { Text("Skip") }
            HorizontalPager(pager, Modifier.weight(1f)) { page ->
                val intro = Intros[page]
                Column(Modifier.fillMaxSize().padding(horizontal = 8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Box(
                        Modifier
                            .size(220.dp)
                            // The shape shrinks and turns away as its page leaves.
                            .graphicsLayer {
                                val away = ((pager.currentPage - page) + pager.currentPageOffsetFraction).absoluteValue.coerceIn(0f, 1f)
                                scaleX = 1f - away * 0.3f
                                scaleY = 1f - away * 0.3f
                                rotationZ = away * 45f
                            }
                            .clip(intro.shape.toShape())
                            .background(c.primary),
                        contentAlignment = Alignment.Center,
                    ) { Icon(intro.icon, contentDescription = null, tint = c.onPrimary, modifier = Modifier.size(96.dp)) }
                    Spacer(Modifier.height(40.dp))
                    Text(intro.title, style = MaterialTheme.typography.displaySmall, textAlign = TextAlign.Center, modifier = Modifier.semantics { heading() })
                    Spacer(Modifier.height(12.dp))
                    Text(intro.body, style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant, textAlign = TextAlign.Center)
                }
            }
            Row(Modifier.padding(vertical = 24.dp).semantics { contentDescription = "Page ${pager.currentPage + 1} of ${Intros.size}" }, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                repeat(Intros.size) { i ->
                    val width by animateDpAsState(if (i == pager.currentPage) 28.dp else 8.dp, MaterialTheme.motionScheme.fastSpatialSpec(), label = "dot")
                    Box(Modifier.height(8.dp).width(width.coerceAtLeast(8.dp)).clip(CircleShape).background(if (i == pager.currentPage) c.primary else c.outlineVariant))
                }
            }
            Button(
                { if (last) repository.finishOnboarding() else scope.launch { pager.animateScrollToPage(pager.currentPage + 1) } },
                Modifier.widthIn(max = 520.dp).fillMaxWidth().heightIn(min = 56.dp),
            ) { Text(if (last) "Get started" else "Next") }
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
        if (busy) LoadingIndicator(Modifier.size(28.dp)) else {
            Text(text)
            Spacer(Modifier.width(8.dp))
            Icon(Icons.AutoMirrored.Rounded.ArrowForward, contentDescription = null)
        }
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

    EntryColumn(Icons.Rounded.Home, "Welcome to Domus", "Connect to the server that runs your home.") {
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
        AlertDialog(modifier = Modifier.clickHaptics(), 
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

/** A password field that can be revealed to check what was typed. */
@Composable
private fun PasswordField(
    value: String, onChange: (String) -> Unit, label: String,
    supporting: String? = null, error: Boolean = false, action: ImeAction = ImeAction.Next, onGo: () -> Unit = {},
) {
    var shown by remember { mutableStateOf(false) }
    OutlinedTextField(
        value, onChange,
        label = { Text(label) },
        leadingIcon = { Icon(Icons.Rounded.Key, contentDescription = null) },
        supportingText = supporting?.let { { Text(it) } },
        singleLine = true,
        isError = error,
        visualTransformation = if (shown) VisualTransformation.None else PasswordVisualTransformation(),
        trailingIcon = {
            IconButton({ shown = !shown }) {
                Icon(if (shown) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility, if (shown) "Hide password" else "Show password")
            }
        },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = action),
        keyboardActions = KeyboardActions(onGo = { onGo() }),
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun UsernameField(value: String, onChange: (String) -> Unit, action: ImeAction = ImeAction.Next, onGo: () -> Unit = {}) {
    OutlinedTextField(
        value, onChange,
        label = { Text("Username") },
        leadingIcon = { Icon(Icons.Rounded.Person, contentDescription = null) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(imeAction = action),
        keyboardActions = KeyboardActions(onGo = { onGo() }),
        modifier = Modifier.fillMaxWidth(),
    )
}

/** The new password typed twice; [onGo] runs from the keyboard once both match. */
@Composable
private fun NewPasswordFields(password: String, onPassword: (String) -> Unit, confirm: String, onConfirm: (String) -> Unit, onGo: () -> Unit) {
    val mismatch = confirm.isNotEmpty() && confirm != password
    PasswordField(password, onPassword, "New password", supporting = "At least 8 characters")
    PasswordField(confirm, onConfirm, "Confirm password", supporting = if (mismatch) "The passwords do not match" else null, error = mismatch, action = ImeAction.Go, onGo = onGo)
}

private fun newPasswordValid(password: String, confirm: String) = password.length >= 8 && password == confirm

/**
 * Sign in, or create the first administrator on a fresh server. "Forgot password?" opens two pages over it:
 * name the account, then the one-time code and the new password. Each goes back with the predictive gesture.
 */
@Composable
fun AuthScreen(session: Session.SignedOut) {
    // 0 sign in, 1 name the account, 2 code and new password.
    var step by rememberSaveable { mutableIntStateOf(0) }
    var username by rememberSaveable { mutableStateOf("") }
    val back = rememberPredictiveBack(step > 0) { step-- }
    val motion = MaterialTheme.motionScheme
    AnimatedContent(step, transitionSpec = { sharedAxisX(targetState > initialState, motion) }, label = "auth") { s ->
        Box(Modifier.fillMaxSize().predictiveBackEffect { if (s == step) back.value else 0f }) {
            when (s) {
                0 -> SignInPage(session, username, { username = it }, onForgot = { step = 1 })
                1 -> ForgotPage(username, { username = it }, onAsked = { step = 2 }, onBack = { step = 0 })
                else -> ResetCodePage(username, onBack = { step = 1 })
            }
        }
    }
}

@Composable
private fun SignInPage(session: Session.SignedOut, username: String, onUsername: (String) -> Unit, onForgot: () -> Unit) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
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
        if (session.needsSetup) Icons.Rounded.AdminPanelSettings else Icons.Rounded.Home,
        if (session.needsSetup) "Create the admin account" else "Welcome back",
        if (session.needsSetup) "This server is new. The first account manages everything." else "Sign in to your home.",
    ) {
        // Which server, and that the connection to it is encrypted.
        Surface(color = MaterialTheme.colorScheme.secondaryContainer, contentColor = MaterialTheme.colorScheme.onSecondaryContainer, shape = CircleShape) {
            Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.Lock, contentDescription = "Encrypted connection to", modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(session.server.removePrefix("https://"), style = MaterialTheme.typography.labelLarge)
            }
        }
        UsernameField(username, { onUsername(it); error = null })
        if (session.needsSetup) {
            OutlinedTextField(
                email, { email = it; error = null },
                label = { Text("Email") },
                leadingIcon = { Icon(Icons.Rounded.Mail, contentDescription = null) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        PasswordField(
            password, { password = it; error = null }, "Password",
            supporting = if (session.needsSetup) "At least 8 characters" else null, error = error != null, action = ImeAction.Go, onGo = ::submit,
        )
        ErrorText(error)
        SubmitButton(if (session.needsSetup) "Create account" else "Sign in", busy, enabled = username.isNotBlank() && password.isNotEmpty()) { submit() }
        if (!session.needsSetup) TextButton(onForgot) { Text("Forgot password?") }
        TextButton(repository::forgetServer) { Text("Use another server") }
    }
}

/** There is no mail server: asking tells the administrators of this home, who hand over a one-time code. */
@Composable
private fun ForgotPage(username: String, onUsername: (String) -> Unit, onAsked: () -> Unit, onBack: () -> Unit) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun submit() {
        if (username.isBlank()) return
        scope.launch {
            busy = true
            error = repository.forgotPassword(username)
            busy = false
            if (error == null) onAsked()
        }
    }

    EntryColumn(Icons.Rounded.LockReset, "Forgot your password?", "Domus sends no email. An administrator of this home is told instead, and gives you a one-time code.") {
        UsernameField(username, { onUsername(it); error = null }, action = ImeAction.Go, onGo = ::submit)
        ErrorText(error)
        SubmitButton("Ask an administrator", busy, enabled = username.isNotBlank()) { submit() }
        TextButton(onBack) { Text("Back to sign in") }
    }
}

/** The code works once and signs in straight away. */
@Composable
private fun ResetCodePage(username: String, onBack: () -> Unit) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    var code by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var confirm by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val valid = code.length == 8 && newPasswordValid(password, confirm)

    fun submit() {
        if (!valid) return
        scope.launch {
            busy = true
            error = repository.resetPassword(username, code, password)
            busy = false
        }
    }

    EntryColumn(Icons.Rounded.Pin, "Enter your reset code", "An administrator has been told. Ask them for the 8-digit code for ${username.trim()}; it works once and for 30 minutes.") {
        OutlinedTextField(
            code, { code = it.filter(Char::isDigit).take(8); error = null },
            label = { Text("Reset code") },
            leadingIcon = { Icon(Icons.Rounded.Pin, contentDescription = null) },
            singleLine = true,
            isError = error != null,
            textStyle = MaterialTheme.typography.titleLarge.copy(fontFamily = FontFamily.Monospace),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth(),
        )
        NewPasswordFields(password, { password = it; error = null }, confirm, { confirm = it }, ::submit)
        ErrorText(error)
        SubmitButton("Set password and sign in", busy, enabled = valid) { submit() }
        TextButton(onBack) { Text("Back") }
    }
}

/** Shown instead of the app while the account is still on the password an administrator handed over. */
@Composable
fun ChangePasswordScreen(session: Session.SignedIn) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    var password by rememberSaveable { mutableStateOf("") }
    var confirm by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val valid = newPasswordValid(password, confirm)

    fun submit() {
        if (!valid) return
        scope.launch {
            busy = true
            error = repository.choosePassword(password)
            busy = false
        }
    }

    EntryColumn(Icons.Rounded.LockReset, "Choose your password", "Welcome, ${session.user.username}. The password you signed in with was made for you and has been seen by someone else. Choose your own to continue.") {
        NewPasswordFields(password, { password = it; error = null }, confirm, { confirm = it }, ::submit)
        ErrorText(error)
        SubmitButton("Save and continue", busy, enabled = valid) { submit() }
        TextButton(repository::logout) { Text("Sign out") }
    }
}

@Composable
fun UnreachableScreen(session: Session.Unreachable) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    EntryColumn(Icons.Rounded.CloudOff, "Can't reach your home", session.server.removePrefix("https://")) {
        Text(session.message, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Button({ scope.launch { repository.restore() } }, Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text("Try again") }
        TextButton(repository::forgetServer) { Text("Use another server") }
    }
}
