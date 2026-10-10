package com.aiyu.domus

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Public
import androidx.compose.material.icons.rounded.MeetingRoom
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aiyu.domus.core.EnergySettings
import com.aiyu.domus.core.Notice
import com.aiyu.domus.core.Room
import com.aiyu.domus.core.Slab
import com.aiyu.domus.core.User
import com.aiyu.domus.ui.components.SectionTitle
import com.aiyu.domus.ui.components.ShapedIcon
import kotlinx.coroutines.launch

/** A full-screen page opened from a tab: back arrow, title, scrolling body capped at 840dp. */
@Composable
fun SubPage(title: String, onBack: () -> Unit, actions: @Composable RowScope.() -> Unit = {}, content: @Composable ColumnScope.() -> Unit) {
    Surface(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            Column(Modifier.widthIn(max = 840.dp).fillMaxSize().statusBarsPadding().imePadding()) {
                Row(Modifier.padding(horizontal = 4.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") }
                    Text(title, style = MaterialTheme.typography.headlineSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).semantics { heading() })
                    actions()
                }
                Column(
                    Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp).navigationBarsPadding(),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    content = content,
                )
            }
        }
    }
}

@Composable
fun Field(
    value: String, onChange: (String) -> Unit, label: String, modifier: Modifier = Modifier.fillMaxWidth(),
    keyboard: KeyboardType = KeyboardType.Text, secret: Boolean = false, supporting: String? = null,
) {
    OutlinedTextField(
        value, onChange,
        label = { Text(label) },
        supportingText = supporting?.let { { Text(it) } },
        singleLine = true,
        visualTransformation = if (secret) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = keyboard),
        modifier = modifier,
    )
}

/** List row on a tonal card; clickable when [onClick] is given. */
@Composable
fun RowCard(title: String, subtitle: String?, icon: ImageVector, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, trailing: @Composable RowScope.() -> Unit = {}) {
    val c = MaterialTheme.colorScheme
    val body: @Composable () -> Unit = {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            ShapedIcon(icon, MaterialShapes.Cookie9Sided, c.secondaryContainer, c.onSecondaryContainer)
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (!subtitle.isNullOrBlank()) Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
            trailing()
        }
    }
    if (onClick != null) Surface(onClick, modifier.fillMaxWidth(), color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, content = body)
    else Surface(modifier.fillMaxWidth(), color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, content = body)
}

/** One choice out of a list that may be long (devices, rooms): a field that opens the list in a dialog. */
@Composable
fun <T> Picker(label: String, options: List<Pair<T, String>>, selected: T, onSelect: (T) -> Unit, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    OutlinedCard({ open = true }, modifier.fillMaxWidth()) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(options.firstOrNull { it.first == selected }?.second ?: "Choose…", style = MaterialTheme.typography.bodyLarge)
        }
    }
    if (open) {
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text(label) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    options.forEach { (value, name) ->
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(value == selected, { onSelect(value); open = false })
                            Text(name, Modifier.weight(1f))
                        }
                    }
                }
            },
            confirmButton = { TextButton({ open = false }) { Text("Close") } },
        )
    }
}

/** A few short options as chips. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun <T> Choice(options: List<Pair<T, String>>, selected: T, onSelect: (T) -> Unit, enabled: Boolean = true) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { (value, name) -> FilterChip(value == selected, { onSelect(value) }, { Text(name) }, enabled = enabled) }
    }
}

@Composable
fun Confirm(title: String, text: String, action: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(text) },
        confirmButton = { Button({ onDismiss(); onConfirm() }, colors = ButtonDefaults.buttonColors(MaterialTheme.colorScheme.error, MaterialTheme.colorScheme.onError)) { Text(action) } },
        dismissButton = { TextButton(onDismiss) { Text("Cancel") } },
    )
}

/** Dialog with a form: Save on the right, an optional Delete on the left. */
@Composable
fun FormDialog(title: String, canSave: Boolean, onSave: () -> Unit, onDismiss: () -> Unit, onDelete: (() -> Unit)? = null, save: String = "Save", content: @Composable ColumnScope.() -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp), content = content) },
        confirmButton = { Button(onSave, enabled = canSave) { Text(save) } },
        dismissButton = {
            Row {
                if (onDelete != null) TextButton(onDelete, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Text("Delete") }
                TextButton(onDismiss) { Text("Cancel") }
            }
        },
    )
}

@Composable
fun RoomsPage(onBack: () -> Unit) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    val rooms by repository.rooms.collectAsStateWithLifecycle()
    val devices by repository.devices.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<Room?>(null) }
    var open by remember { mutableStateOf(false) }

    SubPage("Rooms", onBack, actions = { IconButton({ editing = null; open = true }) { Icon(Icons.Rounded.Add, "Add room") } }) {
        if (rooms.isEmpty()) EmptyState("No rooms yet", "Rooms group devices and decide which ones a member or guest can see.")
        rooms.sortedBy { it.floor }.forEach { room ->
            val count = devices.count { it.roomId == room.id }
            RowCard(room.name, "Floor ${room.floor} · $count ${if (count == 1) "device" else "devices"}", Icons.Rounded.MeetingRoom, onClick = { editing = room; open = true })
        }
    }
    if (open) {
        val room = editing
        var name by remember { mutableStateOf(room?.name.orEmpty()) }
        var floor by remember { mutableStateOf((room?.floor ?: 1).toString()) }
        FormDialog(
            if (room == null) "New room" else "Edit room",
            canSave = name.isNotBlank() && floor.toIntOrNull() != null,
            onSave = { open = false; scope.launch { repository.change { it.saveRoom(room?.id, name.trim(), floor.toInt()) } } },
            onDismiss = { open = false },
            // Devices stay; they just move to "No room".
            onDelete = room?.let { { open = false; scope.launch { repository.change { api -> api.removeRoom(it.id) } } } },
        ) {
            Field(name, { name = it }, "Name")
            Field(floor, { floor = it }, "Floor", keyboard = KeyboardType.Number)
        }
    }
}

private val Roles = listOf("admin" to "Admin", "member" to "Member", "guest" to "Guest")

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun UsersPage(me: User, onBack: () -> Unit) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    val rooms by repository.rooms.collectAsStateWithLifecycle()
    var users by remember { mutableStateOf<List<User>?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    var editing by remember { mutableStateOf<User?>(null) }
    var open by remember { mutableStateOf(false) }
    LaunchedEffect(reload) { users = repository.request { it.users() } ?: users ?: emptyList() }

    SubPage("People", onBack, actions = { IconButton({ editing = null; open = true }) { Icon(Icons.Rounded.Add, "Add person") } }) {
        val list = users
        if (list == null) LoadingIndicator(Modifier.align(Alignment.CenterHorizontally))
        list?.forEach { user ->
            val access = if (user.isAdmin || user.allRooms) "all rooms" else "${user.roomIds.size} rooms"
            RowCard(user.username, "${user.role.replaceFirstChar(Char::uppercase)} · $access", Icons.Rounded.Person, onClick = { editing = user; open = true })
        }
    }
    if (open) {
        val user = editing
        var username by remember { mutableStateOf(user?.username.orEmpty()) }
        var email by remember { mutableStateOf(user?.email.orEmpty()) }
        var password by remember { mutableStateOf("") }
        var role by remember { mutableStateOf(user?.role ?: "member") }
        var allRooms by remember { mutableStateOf(user?.allRooms ?: true) }
        var roomIds by remember { mutableStateOf(user?.roomIds.orEmpty().toSet()) }
        FormDialog(
            if (user == null) "New person" else user.username,
            canSave = if (user == null) username.trim().length >= 3 && password.length >= 8 else password.isEmpty() || password.length >= 8,
            onSave = {
                open = false
                scope.launch {
                    repository.request { it.saveUser(user?.id, username.trim(), email.trim(), password.ifEmpty { null }, role, allRooms, roomIds.toList()) }
                    reload++
                }
            },
            onDismiss = { open = false },
            // You can't delete the account you are signed in with.
            onDelete = user?.takeIf { it.id != me.id }?.let { { open = false; scope.launch { repository.request { api -> api.removeUser(it.id) }; reload++ } } },
        ) {
            if (user == null) Field(username, { username = it }, "Username", supporting = "At least 3 characters")
            Field(email, { email = it }, "Email", keyboard = KeyboardType.Email)
            Field(password, { password = it }, if (user == null) "Password" else "New password", secret = true, supporting = if (user == null) "At least 8 characters" else "Leave empty to keep the current one")
            Choice(Roles, role, { role = it })
            Text(
                when (role) { "admin" -> "Manages everything."; "member" -> "Controls devices in their rooms."; else -> "Sees devices in their rooms, can't control them." },
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (role != "admin") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("All rooms", Modifier.weight(1f))
                    Switch(allRooms, { allRooms = it })
                }
                if (!allRooms) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    rooms.forEach { room ->
                        FilterChip(room.id in roomIds, { roomIds = if (room.id in roomIds) roomIds - room.id else roomIds + room.id }, { Text(room.name) })
                    }
                }
            }
        }
    }
}

/** Electricity price: what the Energy tab turns kWh into money with. */
@Composable
fun TariffPage(onBack: () -> Unit) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    var loaded by remember { mutableStateOf(false) }
    var rate by remember { mutableStateOf("") }
    var currency by remember { mutableStateOf("") }
    var budget by remember { mutableStateOf("") }
    var day by remember { mutableStateOf("") }
    var fixed by remember { mutableStateOf("") }
    // (up to kWh, rate) as typed; an empty "up to" is the open-ended last slab.
    val slabs = remember { mutableStateListOf<Pair<String, String>>() }
    fun show(s: EnergySettings) {
        fun text(v: Double) = if (v % 1.0 == 0.0) v.toLong().toString() else v.toString()
        rate = text(s.ratePerKwh); currency = s.currency; budget = s.monthlyBudget?.let(::text).orEmpty()
        day = s.billingCycleDay.toString(); fixed = text(s.fixedMonthlyCharge)
        slabs.clear(); slabs.addAll(s.slabs.map { (it.upToKwh?.let(::text).orEmpty()) to text(it.rate) })
        loaded = true
    }
    LaunchedEffect(Unit) { repository.request { it.energySettings() }?.let(::show) }

    val typed = EnergySettings(
        ratePerKwh = rate.toDoubleOrNull() ?: -1.0,
        currency = currency.trim().uppercase(),
        monthlyBudget = budget.toDoubleOrNull(),
        billingCycleDay = day.toIntOrNull() ?: 0,
        fixedMonthlyCharge = fixed.toDoubleOrNull() ?: -1.0,
        slabs = slabs.map { Slab(it.first.toDoubleOrNull(), it.second.toDoubleOrNull() ?: -1.0) },
    )
    val valid = typed.ratePerKwh >= 0 && typed.fixedMonthlyCharge >= 0 && typed.currency.length == 3 && typed.billingCycleDay in 1..28 &&
        (budget.isBlank() || typed.monthlyBudget != null) && typed.slabs.all { it.rate >= 0 }

    SubPage("Electricity tariff", onBack) {
        if (!loaded) {
            LoadingIndicator(Modifier.align(Alignment.CenterHorizontally))
            return@SubPage
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Field(rate, { rate = it }, "Rate per kWh", Modifier.weight(1f), KeyboardType.Decimal)
            Field(currency, { currency = it.take(3) }, "Currency", Modifier.weight(1f), supporting = "ISO code, e.g. INR")
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Field(fixed, { fixed = it }, "Fixed monthly charge", Modifier.weight(1f), KeyboardType.Decimal)
            Field(day, { day = it }, "Billing day", Modifier.weight(1f), KeyboardType.Number, supporting = "1 to 28")
        }
        Field(budget, { budget = it }, "Monthly budget (optional)", keyboard = KeyboardType.Decimal)

        SectionTitle("Usage slabs")
        Text(
            if (slabs.isEmpty()) "Flat rate. Add slabs if your price changes with how much you use in a billing cycle." else "Each slab's rate applies up to its limit. Leave the last limit empty for everything above.",
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        slabs.forEachIndexed { index, (upTo, slabRate) ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Field(upTo, { slabs[index] = it to slabRate }, "Up to kWh", Modifier.weight(1f), KeyboardType.Decimal)
                Field(slabRate, { slabs[index] = upTo to it }, "Rate", Modifier.weight(1f), KeyboardType.Decimal)
                IconButton({ slabs.removeAt(index) }) { Icon(Icons.Rounded.Close, "Remove slab ${index + 1}") }
            }
        }
        OutlinedButton({ slabs.add("" to "") }) { Text("Add slab") }

        Button(
            { scope.launch { repository.change { it.saveEnergySettings(typed) }?.let { show(it); onBack() } } },
            Modifier.fillMaxWidth().heightIn(min = 56.dp), enabled = valid,
        ) { Text("Save") }
    }
}

/** Home and remote address of the server. Saved on the server, so every app and the desktop get them. */
@Composable
fun ServerLinksPage(admin: Boolean, onBack: () -> Unit) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    val links by repository.links.collectAsStateWithLifecycle()
    var local by remember(links) { mutableStateOf(links.localUrl) }
    var remote by remember(links) { mutableStateOf(links.remoteUrl) }
    var error by remember { mutableStateOf<String?>(null) }

    SubPage("Server addresses", onBack) {
        Text(
            "Domus uses the home address on your network and the remote one everywhere else. You stay signed in on both.",
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (admin) {
            Field(local, { local = it }, "Home network", keyboard = KeyboardType.Uri, supporting = "For example https://192.168.1.10:8443")
            Field(remote, { remote = it }, "Remote", keyboard = KeyboardType.Uri, supporting = "For example a Cloudflare Tunnel hostname")
            error?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error) }
            Button(
                { scope.launch { error = repository.saveLinks(local, remote); if (error == null) onBack() } },
                Modifier.fillMaxWidth().heightIn(min = 56.dp), enabled = local != links.localUrl || remote != links.remoteUrl,
            ) { Text("Save") }
        } else {
            RowCard("Home network", links.localUrl.ifBlank { "Not set" }, Icons.Rounded.Home)
            RowCard("Remote", links.remoteUrl.ifBlank { "Not set" }, Icons.Rounded.Public)
        }
    }
}

/** The server's notification inbox. */
@Composable
fun NoticesPage(onBack: () -> Unit) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    val revision by repository.revision.collectAsStateWithLifecycle()
    var notices by remember { mutableStateOf<List<Notice>?>(null) }
    LaunchedEffect(revision) { notices = repository.request { it.notices() }?.items ?: notices ?: emptyList() }

    SubPage("Notifications", onBack, actions = {
        TextButton({ scope.launch { repository.request { it.readAllNotices() }; notices = notices?.map { it.copy(isRead = true) } } }, enabled = notices?.any { !it.isRead } == true) { Text("Mark all read") }
    }) {
        val list = notices
        if (list == null) LoadingIndicator(Modifier.align(Alignment.CenterHorizontally))
        if (list?.isEmpty() == true) EmptyState("Nothing yet", "Alerts from automations, new devices and offline devices appear here.")
        list?.forEach { notice ->
            RowCard(notice.title, listOfNotNull(notice.message.ifBlank { null }, timeAgo(notice.createdAt)).joinToString("\n"), Icons.Rounded.Notifications) {
                if (!notice.isRead) Badge()
            }
        }
    }
}
