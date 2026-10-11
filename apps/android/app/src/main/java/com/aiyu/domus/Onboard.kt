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
import androidx.annotation.StringRes
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aiyu.domus.core.Account
import com.aiyu.domus.core.Discovered
import com.aiyu.domus.core.FormField
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
    val qrDesc = stringResource(R.string.onboard_qr_content_description)
    Canvas(modifier.background(Color.White).padding(12.dp).semantics { contentDescription = qrDesc }) {
        val m = matrix ?: return@Canvas
        val cell = size.minDimension / m.width
        for (y in 0 until m.height) for (x in 0 until m.width) {
            if (m[x, y]) drawRect(Color.Black, Offset(x * cell, y * cell), Size(cell + 0.5f, cell + 0.5f))
        }
    }
}

private val XiaomiRegions: List<Pair<String, Int>> = listOf(
    "i2" to R.string.onboard_region_india,
    "cn" to R.string.onboard_region_china,
    "de" to R.string.onboard_region_europe,
    "us" to R.string.onboard_region_us,
    "sg" to R.string.onboard_region_singapore,
    "ru" to R.string.onboard_region_russia,
    "tw" to R.string.onboard_region_taiwan,
    "in" to R.string.onboard_region_india_old,
)

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

    SubPage(stringResource(R.string.onboard_plugins_title), onBack) {
        val list = integrations
        if (list == null) LoadingIndicator(Modifier.align(Alignment.CenterHorizontally))
        list?.forEach { integration ->
            val c = MaterialTheme.colorScheme
            Surface(color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(integration.name, style = MaterialTheme.typography.titleLarge)
                    Text(integration.description, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                    Text(
                        listOf(
                            if (integration.local) stringResource(R.string.onboard_local_control) else stringResource(R.string.onboard_cloud),
                            pluralStringResource(R.plurals.onboard_device_count, integration.deviceCount, integration.deviceCount),
                        ).joinToString(" · "),
                        style = MaterialTheme.typography.labelLarge,
                    )
                    integration.accounts.forEach { account ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(account.name, style = MaterialTheme.typography.titleSmall)
                                Text(
                                    if (account.status == "ok") stringResource(R.string.onboard_account_linked) else account.lastError ?: stringResource(R.string.onboard_account_needs_attention),
                                    style = MaterialTheme.typography.bodySmall, color = if (account.status == "ok") c.onSurfaceVariant else c.error,
                                )
                            }
                            IconButton({ removing = account }) { Icon(Icons.Rounded.Close, stringResource(R.string.onboard_unlink_account, account.name)) }
                        }
                    }
                    if (!integration.enabled) Text(stringResource(R.string.onboard_integration_disabled), color = c.error, style = MaterialTheme.typography.bodyMedium)
                    else if (integration.link != "none") FilledTonalButton({ linking = integration }) { Text(if (integration.accounts.isEmpty()) stringResource(R.string.onboard_link_account) else stringResource(R.string.onboard_link_another_account)) }
                }
            }
        }
        if (list != null) Button(onFindDevices, Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text(stringResource(R.string.onboard_find_devices)) }
    }
    }

    removing?.let { account ->
        Confirm(stringResource(R.string.onboard_unlink_title, account.name), stringResource(R.string.onboard_unlink_text), stringResource(R.string.onboard_unlink), { scope.launch { repository.change { it.removeAccount(account.id) }; reload++ } }, { removing = null })
    }
}

/** Tuya: QR scanned with the Smart Life app. Tapo / Xiaomi: account sign-in (Xiaomi may then ask for an emailed or texted code). Others: the form the server lists. */
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
    val form = integration.link == "form"
    var values by remember { mutableStateOf(mapOf<String, String>()) } // may hold a password: not saved
    fun value(field: FormField) = values[field.key] ?: field.default

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
                form -> repository.request { it.linkForm(integration.id, integration.fields.associate { f -> f.key to value(f) }) }?.let { finish() }
                verifyId != null -> repository.request { it.verifyXiaomi(verifyId.orEmpty(), code.trim()) }?.let { finish() }
                integration.id == "tapo" -> repository.request { it.linkTapo(username.trim(), password) }?.let { finish() }
                else -> xiaomiSignIn()
            }
            busy = false
        }
    }
    val canSubmit = !busy && when {
        tuya -> qr == null && userCode.isNotBlank()
        form -> integration.fields.all { !it.required || value(it).isNotBlank() }
        verifyId != null -> code.isNotBlank()
        else -> username.isNotBlank() && password.isNotEmpty()
    }

    SubPage(stringResource(R.string.onboard_link_integration, integration.name), onBack) {
        val muted = MaterialTheme.colorScheme.onSurfaceVariant
        val motion = MaterialTheme.motionScheme
        // 0 sign-in / user code, 1 verification code, 2 QR: each step moves in like a page.
        val step = when { tuya && qr != null -> 2; verifyId != null -> 1; else -> 0 }
        AnimatedContent(step, transitionSpec = { sharedAxisX(targetState > initialState, motion) }, label = "step") { s ->
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        when {
            s == 2 -> {
                Text(stringResource(R.string.onboard_tuya_qr_instructions), color = muted)
                QrCode(qr?.content.orEmpty(), Modifier.align(Alignment.CenterHorizontally).size(240.dp))
                Row(Modifier.align(Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
                    LoadingIndicator(Modifier.size(32.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.onboard_waiting_for_scan))
                }
            }
            tuya -> {
                Text(stringResource(R.string.onboard_tuya_user_code_instructions), color = muted)
                Field(userCode, { userCode = it }, stringResource(R.string.onboard_user_code))
                if (expired) Text(stringResource(R.string.onboard_qr_expired), color = MaterialTheme.colorScheme.error)
            }
            s == 1 -> {
                Text(stringResource(R.string.onboard_verify_title), style = MaterialTheme.typography.titleLarge)
                Text(stringResource(if (via == "phone") R.string.onboard_xiaomi_sent_phone else R.string.onboard_xiaomi_sent_email), color = muted)
                Field(code, { code = it }, stringResource(R.string.onboard_verification_code), keyboard = KeyboardType.Number)
                Row {
                    TextButton({ scope.launch { busy = true; xiaomiSignIn(); busy = false } }, enabled = !busy) { Text(stringResource(R.string.onboard_send_new_code)) }
                    TextButton({ verifyId = null; code = "" }, enabled = !busy) { Text(stringResource(R.string.onboard_use_another_account)) }
                }
            }
            form -> {
                Text(integration.description, color = muted)
                integration.fields.forEach { f ->
                    Field(value(f), { values = values + (f.key to it) }, f.label, keyboard = if (f.kind == "number") KeyboardType.Number else KeyboardType.Text, secret = f.kind == "password", supporting = f.hint.ifEmpty { null })
                }
            }
            else -> {
                Text(if (integration.id == "tapo") stringResource(R.string.onboard_tapo_instructions) else stringResource(R.string.onboard_xiaomi_instructions), color = muted)
                if (integration.id == "xiaomi") Field(username, { username = it }, stringResource(R.string.onboard_xiaomi_username), supporting = stringResource(R.string.onboard_xiaomi_username_supporting))
                else Field(username, { username = it }, stringResource(R.string.onboard_email_or_username), keyboard = KeyboardType.Email)
                Field(password, { password = it }, stringResource(R.string.onboard_password), secret = true)
                if (integration.id == "xiaomi") Picker(stringResource(R.string.onboard_server_region), XiaomiRegions.map { it.first to stringResource(it.second) }, region, { region = it })
            }
        }
        }
        }
        if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        if (!(tuya && qr != null)) {
            Button(::submit, Modifier.fillMaxWidth().heightIn(min = 56.dp), enabled = canSubmit) {
                Text(
                    when {
                        tuya -> stringResource(R.string.onboard_show_qr_code)
                        verifyId != null -> stringResource(R.string.onboard_verify)
                        integration.id == "xiaomi" -> stringResource(R.string.onboard_continue)
                        else -> stringResource(R.string.onboard_link)
                    },
                )
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

    SubPage(stringResource(R.string.onboard_add_devices_title), onBack) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Button(::scan, enabled = !scanning) { Text(if (scanning) stringResource(R.string.onboard_scanning) else stringResource(R.string.onboard_scan_again)) }
            OutlinedButton({ manual = true }) { Text(stringResource(R.string.onboard_add_by_address)) }
            if (scanning) LoadingIndicator(Modifier.size(40.dp))
        }
        val list = found
        if (list?.isEmpty() == true && !scanning) {
            EmptyState(stringResource(R.string.onboard_no_new_devices), stringResource(R.string.onboard_no_new_devices_subtitle))
            TextButton(onOpenPlugins) { Text(stringResource(R.string.onboard_open_plugins)) }
        }
        if (!list.isNullOrEmpty()) SectionTitle(stringResource(R.string.onboard_found_count, list.size))
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
                        FilledTonalButton({ adopting = device }) { Text(stringResource(R.string.onboard_add)) }
                        TextButton({ scope.launch { repository.request { it.ignore(device.id) }; found = found?.filter { it.id != device.id } } }) { Text(stringResource(R.string.onboard_ignore)) }
                    }
                }
            }
        }
    }

    adopting?.let { device ->
        var name by remember(device) { mutableStateOf(device.name) }
        var room by remember(device) { mutableStateOf<String?>(null) }
        var token by remember(device) { mutableStateOf("") }
        FormDialog(stringResource(R.string.onboard_add_device_title, device.name), canSave = name.isNotBlank(), save = stringResource(R.string.onboard_add), onDismiss = { adopting = null }, onSave = {
            adopting = null
            scope.launch {
                repository.change { it.adopt(device.id, name.trim(), room, token.trim().ifEmpty { null }) }?.let { found = found?.filter { d -> d.id != device.id } }
            }
        }) {
            Field(name, { name = it }, stringResource(R.string.onboard_field_name))
            Picker(stringResource(R.string.onboard_field_room), listOf<Pair<String?, String>>(null to stringResource(R.string.onboard_no_room)) + rooms.map { it.id to it.name }, room, { room = it })
            // Only LAN-found Xiaomi devices need one; with a linked account the server already has it.
            if (device.integration == "xiaomi") Field(token, { token = it }, stringResource(R.string.onboard_device_token_optional), supporting = stringResource(R.string.onboard_device_token_supporting))
        }
    }
    if (manual) {
        var integration by remember { mutableStateOf("tapo") }
        var host by remember { mutableStateOf("") }
        var token by remember { mutableStateOf("") }
        FormDialog(stringResource(R.string.onboard_add_by_address), canSave = host.isNotBlank(), save = stringResource(R.string.onboard_add), onDismiss = { manual = false }, onSave = {
            manual = false
            scope.launch { repository.change { it.addManual(integration, host.trim(), token.trim().ifEmpty { null }, null) } }
        }) {
            Choice(listOf("tapo" to "Tapo", "xiaomi" to "Xiaomi", "tuya" to "Tuya"), integration, { integration = it })
            Field(host, { host = it }, stringResource(R.string.onboard_ip_address), keyboard = KeyboardType.Uri)
            if (integration == "xiaomi") Field(token, { token = it }, stringResource(R.string.onboard_device_token_optional))
        }
    }
}
