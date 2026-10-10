package com.aiyu.domus

import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Extension
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aiyu.domus.core.Account
import com.aiyu.domus.core.Discovered
import com.aiyu.domus.core.Integration
import com.aiyu.domus.core.TuyaQr
import com.aiyu.domus.core.xiaomiAccount
import com.aiyu.domus.ui.components.SectionTitle
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Black on white whatever the theme: a scanner needs that contrast. */
@Composable
private fun QrCode(content: String, modifier: Modifier = Modifier) {
    val matrix = remember(content) { runCatching { QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, 0, 0) }.getOrNull() }
    Canvas(modifier.background(Color.White).padding(12.dp).semantics { contentDescription = "QR code to scan with the Smart Life app" }) {
        val m = matrix ?: return@Canvas
        val cell = size.minDimension / m.width
        for (y in 0 until m.height) for (x in 0 until m.width) {
            if (m[x, y]) drawRect(Color.Black, Offset(x * cell, y * cell), Size(cell + 0.5f, cell + 0.5f))
        }
    }
}

private val XiaomiRegions = listOf("i2" to "India", "cn" to "China", "de" to "Europe", "us" to "United States", "sg" to "Singapore", "ru" to "Russia", "tw" to "Taiwan", "in" to "India (old)")

/** Link accounts of the device makers. Linked accounts are what discovery finds devices through. */
@Composable
fun IntegrationsPage(onBack: () -> Unit, onFindDevices: () -> Unit) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    val revision by repository.revision.collectAsStateWithLifecycle()
    var integrations by remember { mutableStateOf<List<Integration>?>(null) }
    var linking by remember { mutableStateOf<Integration?>(null) }
    var removing by remember { mutableStateOf<Account?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    LaunchedEffect(revision, reload) { integrations = repository.request { it.integrations() } ?: integrations ?: emptyList() }

    // Linking is a page of its own (Xiaomi asks for a code, Tuya shows a QR), not a dialog over the list.
    val linkBack = rememberPredictiveBack(linking != null) { linking = null }
    val motion = MaterialTheme.motionScheme
    // The list and the link page change places like any other page.
    AnimatedContent(linking, transitionSpec = { sharedAxisX(targetState != null, motion) }, label = "link") { link ->
    if (link != null) {
        Box(Modifier.fillMaxSize().predictiveBackEffect { linkBack.value }) { LinkPage(link, onBack = { linking = null }, onDone = { linking = null; reload++ }) }
        return@AnimatedContent
    }

    SubPage("Plugins", onBack) {
        val list = integrations
        if (list == null) LoadingIndicator(Modifier.align(Alignment.CenterHorizontally))
        list?.forEach { integration ->
            val c = MaterialTheme.colorScheme
            Surface(color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(integration.name, style = MaterialTheme.typography.titleLarge)
                    Text(integration.description, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                    Text(
                        listOf(if (integration.local) "Local control" else "Cloud", "${integration.deviceCount} ${if (integration.deviceCount == 1) "device" else "devices"}").joinToString(" · "),
                        style = MaterialTheme.typography.labelLarge,
                    )
                    integration.accounts.forEach { account ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(account.name, style = MaterialTheme.typography.titleSmall)
                                Text(
                                    if (account.status == "ok") "Linked" else account.lastError ?: "Needs attention",
                                    style = MaterialTheme.typography.bodySmall, color = if (account.status == "ok") c.onSurfaceVariant else c.error,
                                )
                            }
                            IconButton({ removing = account }) { Icon(Icons.Rounded.Close, "Unlink ${account.name}") }
                        }
                    }
                    if (!integration.enabled) Text("Turned off in the server configuration.", color = c.error, style = MaterialTheme.typography.bodyMedium)
                    else if (integration.link != "none") FilledTonalButton({ linking = integration }) { Text(if (integration.accounts.isEmpty()) "Link account" else "Link another account") }
                }
            }
        }
        if (list != null) Button(onFindDevices, Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text("Find devices") }
    }
    }

    removing?.let { account ->
        Confirm("Unlink ${account.name}?", "Devices that came from this account are removed from Domus.", "Unlink", { scope.launch { repository.change { it.removeAccount(account.id) }; reload++ } }, { removing = null })
    }
}

/** Tuya: QR scanned with the Smart Life app. Tapo / Xiaomi: account sign-in (Xiaomi may then ask for an emailed or texted code). */
@Composable
private fun LinkPage(integration: Integration, onBack: () -> Unit, onDone: () -> Unit) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    // Kept across rotation so a Xiaomi code step is not lost; the password never is.
    var username by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var region by rememberSaveable { mutableStateOf("i2") }
    var userCode by rememberSaveable { mutableStateOf("") }
    var qr by remember { mutableStateOf<TuyaQr?>(null) }
    var expired by remember { mutableStateOf(false) }
    var verifyId by rememberSaveable { mutableStateOf<String?>(null) }
    var via by rememberSaveable { mutableStateOf<String?>(null) }
    var code by rememberSaveable { mutableStateOf("") }
    val tuya = integration.link == "qr"

    fun finish() {
        scope.launch { repository.change { it.scan() } } // pull the new account's devices in right away
        onDone()
    }
    // Wait for the scan to be confirmed in the Smart Life app.
    LaunchedEffect(qr) {
        val current = qr ?: return@LaunchedEffect
        while (true) {
            delay(2_000)
            when (repository.request { it.tuyaQrStatus(current.token) }?.status) {
                "linked" -> return@LaunchedEffect finish()
                "expired" -> { qr = null; expired = true; return@LaunchedEffect }
            }
        }
    }
    /** Signs in to Xiaomi; it either links at once or sends a code. Also used to ask for a new code. */
    suspend fun xiaomiSignIn() {
        repository.request { it.linkXiaomi(xiaomiAccount(username), password, region) }?.let {
            if (it.verifyId != null) { verifyId = it.verifyId; via = it.via; code = "" } else finish()
        }
    }
    fun submit() {
        scope.launch {
            busy = true
            when {
                tuya -> { expired = false; qr = repository.request { it.tuyaQr(userCode.trim()) } }
                verifyId != null -> repository.request { it.verifyXiaomi(verifyId.orEmpty(), code.trim()) }?.let { finish() }
                integration.id == "tapo" -> repository.request { it.linkTapo(username.trim(), password) }?.let { finish() }
                else -> xiaomiSignIn()
            }
            busy = false
        }
    }
    val canSubmit = !busy && when {
        tuya -> qr == null && userCode.isNotBlank()
        verifyId != null -> code.isNotBlank()
        else -> username.isNotBlank() && password.isNotEmpty()
    }

    SubPage("Link ${integration.name}", onBack) {
        val muted = MaterialTheme.colorScheme.onSurfaceVariant
        val motion = MaterialTheme.motionScheme
        // 0 sign-in / user code, 1 verification code, 2 QR: each step moves in like a page.
        val step = when { tuya && qr != null -> 2; verifyId != null -> 1; else -> 0 }
        AnimatedContent(step, transitionSpec = { sharedAxisX(targetState > initialState, motion) }, label = "step") { s ->
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        when {
            s == 2 -> {
                Text("Scan this with the Smart Life or Tuya Smart app (the scan button on its home screen), then confirm there. On the same phone, show this code on another screen.", color = muted)
                QrCode(qr?.content.orEmpty(), Modifier.align(Alignment.CenterHorizontally).size(240.dp))
                Row(Modifier.align(Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
                    LoadingIndicator(Modifier.size(32.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Waiting for the scan…")
                }
            }
            tuya -> {
                Text("In the Smart Life app open Me → Settings → Account and Security → User Code, and type that code here.", color = muted)
                Field(userCode, { userCode = it }, "User Code")
                if (expired) Text("That QR code expired. Try again.", color = MaterialTheme.colorScheme.error)
            }
            s == 1 -> {
                Text("Verify it is you", style = MaterialTheme.typography.titleLarge)
                Text("Xiaomi sent a verification code to your ${if (via == "phone") "phone" else "email"}. Type it here. It expires after a few minutes.", color = muted)
                Field(code, { code = it }, "Verification code", keyboard = KeyboardType.Number)
                Row {
                    TextButton({ scope.launch { busy = true; xiaomiSignIn(); busy = false } }, enabled = !busy) { Text("Send a new code") }
                    TextButton({ verifyId = null; code = "" }, enabled = !busy) { Text("Use another account") }
                }
            }
            else -> {
                Text(if (integration.id == "tapo") "Sign in with your TP-Link account. It is used to talk to your Tapo devices on your network." else "Sign in with your Xiaomi account. Device tokens are fetched once; control stays local. Xiaomi may then send you a code.", color = muted)
                if (integration.id == "xiaomi") Field(username, { username = it }, "Email, phone or Xiaomi ID", supporting = "A phone number needs its country code, like +91…")
                else Field(username, { username = it }, "Email or username", keyboard = KeyboardType.Email)
                Field(password, { password = it }, "Password", secret = true)
                if (integration.id == "xiaomi") Picker("Server region", XiaomiRegions, region, { region = it })
            }
        }
        }
        }
        if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        if (!(tuya && qr != null)) {
            Button(::submit, Modifier.fillMaxWidth().heightIn(min = 56.dp), enabled = canSubmit) {
                Text(when { tuya -> "Show QR code"; verifyId != null -> "Verify"; integration.id == "xiaomi" -> "Continue"; else -> "Link" })
            }
        }
    }
}

/** Devices the linked accounts and the local network offer, waiting to be added to the home. */
@Composable
fun DiscoverPage(onBack: () -> Unit, onOpenPlugins: () -> Unit) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    val revision by repository.revision.collectAsStateWithLifecycle()
    val rooms by repository.rooms.collectAsStateWithLifecycle()
    var found by remember { mutableStateOf<List<Discovered>?>(null) }
    var scanning by remember { mutableStateOf(false) }
    var adopting by remember { mutableStateOf<Discovered?>(null) }
    var manual by remember { mutableStateOf(false) }
    // Reloads on every discovery event, so a device found or added from the web app shows up or leaves here too.
    LaunchedEffect(revision) { found = repository.request { it.discovered() } ?: found ?: emptyList() }
    fun scan() {
        scope.launch {
            scanning = true
            repository.change { it.scan() }?.let { found = repository.request { api -> api.discovered() } ?: found }
            scanning = false
        }
    }
    LaunchedEffect(Unit) { scan() }

    SubPage("Add devices", onBack) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Button(::scan, enabled = !scanning) { Text(if (scanning) "Scanning…" else "Scan again") }
            OutlinedButton({ manual = true }) { Text("Add by address") }
            if (scanning) LoadingIndicator(Modifier.size(40.dp))
        }
        val list = found
        if (list?.isEmpty() == true && !scanning) {
            EmptyState("No new devices", "Everything found is already in your home. Link an account under Plugins to find more.")
            TextButton(onOpenPlugins) { Text("Open Plugins") }
        }
        if (!list.isNullOrEmpty()) SectionTitle("${list.size} found")
        list?.forEach { device ->
            val c = MaterialTheme.colorScheme
            Surface(color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(deviceIcon(device.type), contentDescription = null)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(device.name, style = MaterialTheme.typography.titleMedium)
                            Text(listOfNotNull(device.integration.replaceFirstChar(Char::uppercase), device.model, device.ip).joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                        }
                    }
                    device.note?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant) }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilledTonalButton({ adopting = device }) { Text("Add") }
                        TextButton({ scope.launch { repository.request { it.ignore(device.id) }; found = found?.filter { it.id != device.id } } }) { Text("Ignore") }
                    }
                }
            }
        }
    }

    adopting?.let { device ->
        var name by remember(device) { mutableStateOf(device.name) }
        var room by remember(device) { mutableStateOf<String?>(null) }
        var token by remember(device) { mutableStateOf("") }
        FormDialog("Add ${device.name}", canSave = name.isNotBlank(), save = "Add", onDismiss = { adopting = null }, onSave = {
            adopting = null
            scope.launch {
                repository.change { it.adopt(device.id, name.trim(), room, token.trim().ifEmpty { null }) }?.let { found = found?.filter { d -> d.id != device.id } }
            }
        }) {
            Field(name, { name = it }, "Name")
            Picker("Room", listOf<Pair<String?, String>>(null to "No room") + rooms.map { it.id to it.name }, room, { room = it })
            // Only LAN-found Xiaomi devices need one; with a linked account the server already has it.
            if (device.integration == "xiaomi") Field(token, { token = it }, "Device token (optional)", supporting = "Needed only without a linked Xiaomi account")
        }
    }
    if (manual) {
        var integration by remember { mutableStateOf("tapo") }
        var host by remember { mutableStateOf("") }
        var token by remember { mutableStateOf("") }
        FormDialog("Add by address", canSave = host.isNotBlank(), save = "Add", onDismiss = { manual = false }, onSave = {
            manual = false
            scope.launch { repository.change { it.addManual(integration, host.trim(), token.trim().ifEmpty { null }, null) } }
        }) {
            Choice(listOf("tapo" to "Tapo", "xiaomi" to "Xiaomi", "tuya" to "Tuya"), integration, { integration = it })
            Field(host, { host = it }, "IP address", keyboard = KeyboardType.Uri)
            if (integration == "xiaomi") Field(token, { token = it }, "Device token (optional)")
        }
    }
}
