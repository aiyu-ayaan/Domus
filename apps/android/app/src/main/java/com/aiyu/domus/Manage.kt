package com.aiyu.domus

import com.aiyu.domus.ui.theme.HapticSwitch
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Share
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.os.PersistableBundle
import android.text.format.DateFormat
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Public
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material.icons.rounded.MeetingRoom
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.material.icons.rounded.ArrowDropDown
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.ui.draw.clip
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
import com.aiyu.domus.core.Device
import com.aiyu.domus.core.EnergySettings
import com.aiyu.domus.core.Grants
import com.aiyu.domus.core.Notice
import com.aiyu.domus.core.Room
import com.aiyu.domus.core.Session
import com.aiyu.domus.core.Slab
import com.aiyu.domus.core.User
import com.aiyu.domus.ui.components.SectionTitle
import com.aiyu.domus.ui.components.ShapedIcon
import kotlinx.coroutines.delay
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
    keyboard: KeyboardType = KeyboardType.Text, secret: Boolean = false, supporting: String? = null, error: Boolean = false,
) {
    // A secret field can be revealed to check what was typed.
    var shown by remember { mutableStateOf(false) }
    OutlinedTextField(
        value, onChange,
        label = { Text(label) },
        supportingText = supporting?.let { { Text(it) } },
        isError = error,
        singleLine = true,
        visualTransformation = if (secret && !shown) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = if (secret) KeyboardType.Password else keyboard),
        trailingIcon = if (secret) {
            { IconButton({ shown = !shown }) { Icon(if (shown) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility, if (shown) "Hide $label" else "Show $label") } }
        } else null,
        modifier = modifier,
    )
}

/** List row on a tonal card; clickable when [onClick] is given. */
@Composable
fun RowCard(
    title: String,
    subtitle: String?,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    leading: (@Composable () -> Unit)? = null,
    onClick: (() -> Unit)? = null,
    trailing: @Composable RowScope.() -> Unit = {}
) {
    val c = MaterialTheme.colorScheme
    val body: @Composable () -> Unit = {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            if (leading != null) {
                leading()
            } else {
                ShapedIcon(icon, MaterialShapes.Cookie9Sided, c.secondaryContainer, c.onSecondaryContainer)
            }
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
private val Levels = listOf("none" to "None", "view" to "See only", "control" to "Control", "edit" to "Edit")

/** The level of one room or device: a chip that opens the four levels. It is tinted while access is given. */
@Composable
private fun LevelMenu(what: String, level: String, onLevel: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        FilterChip(
            selected = level != "none",
            onClick = { open = true },
            label = { Text(Levels.first { it.first == level }.second) },
            trailingIcon = { Icon(Icons.Rounded.ArrowDropDown, null, Modifier.size(18.dp)) },
            modifier = Modifier.semantics { contentDescription = "Access to $what" },
        )
        DropdownMenu(open, { open = false }) {
            Levels.forEach { (value, name) ->
                DropdownMenuItem(
                    text = { Text(name) },
                    onClick = { open = false; onLevel(value) },
                    trailingIcon = if (value == level) { { Icon(Icons.Rounded.Check, null, Modifier.size(18.dp)) } } else null,
                )
            }
        }
    }
}

/** One line of the access editor: what it is on the left, its level on the right. */
@Composable
private fun AccessRow(label: String, level: String, onLevel: (String) -> Unit, hint: String? = null) {
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(start = 16.dp, end = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).padding(end = 12.dp)) {
            Text(label, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (hint != null) Text(hint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        LevelMenu(label, level, onLevel)
    }
}

/** One room in the access editor: a card that opens to the whole room and its devices (a device overrides the room). */
@Composable
private fun RoomAccess(name: String, devices: List<Device>, grants: Grants, room: String?, onRoom: ((String) -> Unit)?, onDevice: (Device, String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val c = MaterialTheme.colorScheme
    val count = devices.count { grants.levelOf(it) != "none" }
    val status = when {
        room != null -> "Whole room · ${Levels.first { it.first == room }.second.lowercase()}"
        count > 0 -> "$count of ${devices.size} devices"
        else -> "No access"
    }
    val turn by animateFloatAsState(if (open) 180f else 0f, MaterialTheme.motionScheme.fastSpatialSpec(), label = "chevron")
    Surface(color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(
                Modifier.fillMaxWidth().clickable(onClickLabel = if (open) "Close $name" else "Open $name") { open = !open }.heightIn(min = 64.dp).padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(status, style = MaterialTheme.typography.bodyMedium, color = if (room != null || count > 0) c.primary else c.onSurfaceVariant)
                }
                Icon(Icons.Rounded.ExpandMore, null, Modifier.rotate(turn), tint = c.onSurfaceVariant)
            }
            AnimatedVisibility(open) {
                Column(Modifier.padding(bottom = 8.dp)) {
                    HorizontalDivider(color = c.outlineVariant)
                    if (onRoom != null) {
                        AccessRow("Whole room", room ?: "none", onRoom, hint = "Also covers devices added later")
                        if (devices.isNotEmpty()) HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = c.outlineVariant)
                    }
                    devices.forEach { device -> AccessRow(device.name, grants.levelOf(device), { onDevice(device, it) }) }
                    if (devices.isEmpty()) Text("No devices in this room yet.", Modifier.padding(16.dp), style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
fun UsersPage(open: (String) -> Unit, onBack: () -> Unit) {
    val repository = LocalRepository.current
    var users by remember { mutableStateOf<List<User>?>(null) }
    LaunchedEffect(Unit) { users = repository.request { it.users() } ?: users ?: emptyList() }

    SubPage("People", onBack, actions = { IconButton({ open("person:new") }) { Icon(Icons.Rounded.Add, "Add person") } }) {
        val list = users
        if (list == null) LoadingIndicator(Modifier.align(Alignment.CenterHorizontally))
        list?.forEach { user ->
            val access = if (user.isAdmin || user.allRooms) "whole home" else listOfNotNull(
                "${user.roomIds.size} rooms".takeIf { user.roomIds.isNotEmpty() },
                "${user.deviceIds.size} devices".takeIf { user.deviceIds.isNotEmpty() },
            ).joinToString(", ").ifEmpty { "no access" }
            RowCard(
                title = user.username,
                subtitle = listOfNotNull(
                    user.role.replaceFirstChar(Char::uppercase), access, "kid".takeIf { user.kid }, "asked for a password reset".takeIf { user.resetRequested },
                ).joinToString(" · "),
                icon = Icons.Rounded.Person,
                leading = { UserAvatar(avatarSpec = user.avatar, username = user.username, size = 44.dp) },
                onClick = { open("person:${user.id}") },
            )
        }
    }
}

/** [id] is a person's id, or `new`. Opened over People, which reloads when this page closes. */
@Composable
fun PersonEditorPage(id: String, me: User, onBack: () -> Unit) {
    val repository = LocalRepository.current
    var person by remember(id) { mutableStateOf<User?>(null) }
    var loaded by remember(id) { mutableStateOf(id == "new") }
    LaunchedEffect(id) {
        if (id != "new") {
            person = repository.request { it.users() }?.firstOrNull { it.id == id }
            loaded = true
        }
    }
    if (!loaded) {
        SubPage("Person", onBack) { LoadingIndicator(Modifier.align(Alignment.CenterHorizontally)) }
        return
    }
    PersonForm(person, me, onBack)
}

/** A switch with its explanation, on a tonal card. */
@Composable
private fun ToggleCard(title: String, text: String, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f).padding(end = 12.dp)) {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            HapticSwitch(checked, onChange, enabled = enabled)
        }
    }
}

/** Shows a first password or a reset code once, to copy or share. Domus keeps no readable copy. */
@Composable
private fun Handover(user: User, onDone: () -> Unit) {
    val context = LocalContext.current
    val server = (LocalRepository.current.session.collectAsStateWithLifecycle().value as? Session.SignedIn)?.server.orEmpty()
    val text = remember(user, server) { user.handoverText(server, DateFormat.is24HourFormat(context)) }
    AlertDialog(
        onDismissRequest = onDone,
        title = { Text(if (user.resetCode != null) "Reset code for ${user.username}" else "Sign-in details for ${user.username}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Shown only once. Send it to them now.")
                Surface(color = MaterialTheme.colorScheme.surfaceContainerHighest, shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth()) {
                    SelectionContainer { Text(text, Modifier.padding(12.dp), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodyMedium) }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilledTonalButton({
                        val clip = ClipData.newPlainText("Domus", text)
                        // Keeps the secret out of the keyboard's clipboard preview on Android 13+.
                        clip.description.extras = PersistableBundle().apply { putBoolean("android.content.extra.IS_SENSITIVE", true) }
                        context.getSystemService(ClipboardManager::class.java).setPrimaryClip(clip)
                    }) {
                        Icon(Icons.Rounded.ContentCopy, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Copy")
                    }
                    FilledTonalButton({
                        context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), null))
                    }) {
                        Icon(Icons.Rounded.Share, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Share")
                    }
                }
            }
        },
        confirmButton = { TextButton(onDone) { Text("Done") } },
    )
}

@Composable
private fun PersonForm(user: User?, me: User, onBack: () -> Unit) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    val rooms by repository.rooms.collectAsStateWithLifecycle()
    val devices by repository.devices.collectAsStateWithLifecycle()
    var username by remember { mutableStateOf(user?.username.orEmpty()) }
    var email by remember { mutableStateOf(user?.email.orEmpty()) }
    var password by remember { mutableStateOf("") }
    var kid by remember { mutableStateOf(user?.kid ?: false) }
    // The account as last answered by the server: a reset code changes it without Save.
    var current by remember { mutableStateOf(user) }
    var issuing by remember { mutableStateOf(false) }
    // A first password or reset code to pass on, and whether the page closes once it has been.
    var handover by remember { mutableStateOf<User?>(null) }
    var closeAfter by remember { mutableStateOf(false) }
    var role by remember { mutableStateOf(user?.role ?: "member") }
    var avatar by remember { mutableStateOf(user?.avatar ?: "dicebear:bottts:${user?.username ?: "member"}") }
    var allRooms by remember { mutableStateOf(user?.allRooms ?: true) }
    var grants by remember { mutableStateOf(user?.grants ?: Grants()) }
    var deleting by remember { mutableStateOf(false) }
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    // Whether the typed address is free: null while unknown. The account's own address, or none, needs no check.
    var emailFree by remember { mutableStateOf<Boolean?>(null) }
    LaunchedEffect(email) {
        emailFree = null
        val value = email.trim()
        if (!value.contains('@') || value == user?.email) return@LaunchedEffect
        delay(400)
        emailFree = repository.request { it.emailAvailable(value, user?.id) }?.available
    }
    val name = user?.username ?: username.trim()
    // Only a kid's password is typed here; an existing kid keeps theirs when the field is left empty.
    val passwordOk = !kid || password.length >= 8 || (user?.kid == true && password.isEmpty())
    val valid = emailFree != false && (user != null || username.trim().length >= 3) && passwordOk
    fun issue(what: String, on: Boolean = true) {
        val id = user?.id ?: return
        scope.launch {
            issuing = true
            repository.request { it.issue(id, what, on) }?.let {
                current = it
                if (it.resetCode != null || it.generatedPassword != null) handover = it
            }
            issuing = false
        }
    }

    SubPage(user?.username ?: "New person", onBack, actions = {
        // You can't delete the account you are signed in with.
        if (user != null && user.id != me.id) TextButton({ deleting = true }, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Text("Delete") }
    }) {
        Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            UserAvatar(avatarSpec = avatar, username = username.ifEmpty { "User" }, size = 56.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Avatar", style = MaterialTheme.typography.titleSmall)
                Text(parseDiceBearSpec(avatar).first, style = MaterialTheme.typography.bodySmall, color = muted)
            }
            FilledTonalButton(onClick = { avatar = randomDiceBearSpec() }) {
                Icon(Icons.Rounded.AutoAwesome, null, Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("Roll")
            }
        }
        if (user == null) Field(username, { username = it }, "Username", supporting = "At least 3 characters")
        Field(
            email, { email = it }, "Email", keyboard = KeyboardType.Email, error = emailFree == false,
            supporting = when (emailFree) { false -> "Already used by another account"; true -> "Available"; null -> "Type one, or generate it from the username" },
        )
        TextButton(
            { scope.launch { repository.request { it.suggestEmail(name, user?.id) }?.let { email = it.email } } },
            Modifier.align(Alignment.End), enabled = name.length >= 3,
        ) { Text("Generate @domus.home email") }
        // Your own password is changed by you, not from here.
        if (user?.id != me.id) {
            SectionTitle("Password")
            ToggleCard("Kid's account", if (kid) "You set the password and it stays as it is." else "Off: Domus makes a password, and they choose their own at first sign-in.", kid) { kid = it }
            val account = current
            when {
                kid -> Field(password, { password = it }, if (user?.kid == true) "New password" else "Password", secret = true, supporting = if (user?.kid == true) "Leave empty to keep the current one" else "At least 8 characters")
                account == null -> Text("You get the password to copy or share after saving.", style = MaterialTheme.typography.bodyMedium, color = muted)
                else -> {
                    if (account.resetRequested) Text("${account.username} forgot their password and asked for a reset.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.tertiary)
                    val until = account.resetUntil(DateFormat.is24HourFormat(LocalContext.current))
                    ToggleCard(
                        "Reset code",
                        if (account.resetAllowed && until != null) "A code is active until $until. Turn off to withdraw it."
                        else "A one-time code they enter under \"Forgot password?\" to choose a new password. Good for 30 minutes.",
                        account.resetAllowed, enabled = !issuing,
                    ) { issue("reset_allowed", it) }
                    FilledTonalButton({ issue("reset_password") }, enabled = !issuing) { Text("Generate a new password") }
                }
            }
        }

        SectionTitle("Role")
        Choice(Roles, role, { role = it })
        Text(
            when (role) { "admin" -> "Manages everything."; "member" -> "Sees what they are given. Control, or edit to also rename a device, is set per room and device."; else -> "Sees what they are given, can't control it." },
            style = MaterialTheme.typography.bodyMedium, color = muted,
        )

        if (role != "admin") {
            SectionTitle("Access")
            ToggleCard("Custom access", if (allRooms) "Off: they reach the whole home." else "Set a level for each room, or for single devices in it.", !allRooms) { allRooms = !it }
            if (!allRooms) {
                if (rooms.isEmpty() && devices.isEmpty()) Text("Create rooms first.", color = muted)
                rooms.forEach { room ->
                    RoomAccess(room.name, devices.filter { it.roomId == room.id }, grants, grants.rooms[room.id], { grants = grants.withRoom(room.id, it, devices) }) { device, level -> grants = grants.withDevice(device, level, devices) }
                }
                val loose = devices.filter { it.roomId == null }
                if (loose.isNotEmpty()) RoomAccess("No room", loose, grants, null, null) { device, level -> grants = grants.withDevice(device, level, devices) }
            }
        }
        Button(
            {
                scope.launch {
                    repository.change { it.saveUser(user?.id, username.trim(), email.trim(), password.takeIf { kid && it.isNotEmpty() }, kid, role, allRooms, grants, avatar = avatar) }?.let {
                        if (it.generatedPassword != null) { handover = it; closeAfter = true } else onBack()
                    }
                }
            },
            Modifier.fillMaxWidth().heightIn(min = 56.dp), enabled = valid,
        ) { Text("Save") }
    }
    handover?.let { Handover(it) { handover = null; if (closeAfter) onBack() } }
    if (deleting && user != null) {
        Confirm("Remove ${user.username}?", "They lose access immediately.", "Remove", { scope.launch { repository.change { it.removeUser(user.id) }?.let { onBack() } } }, { deleting = false })
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

/** A notice that is deleted by swiping it away in either direction. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SwipeNotice(notice: Notice, onDelete: () -> Unit, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, trailing: @Composable RowScope.() -> Unit = {}) {
    val state = rememberSwipeToDismissBoxState(positionalThreshold = { it * 0.4f })
    LaunchedEffect(state.currentValue) { if (state.currentValue != SwipeToDismissBoxValue.Settled) onDelete() }
    SwipeToDismissBox(
        state = state,
        modifier = modifier,
        backgroundContent = {
            Box(Modifier.fillMaxSize().clip(MaterialTheme.shapes.large).background(MaterialTheme.colorScheme.errorContainer).padding(horizontal = 24.dp), contentAlignment = if (state.dismissDirection == SwipeToDismissBoxValue.StartToEnd) Alignment.CenterStart else Alignment.CenterEnd) {
                Icon(Icons.Rounded.Delete, "Delete", tint = MaterialTheme.colorScheme.onErrorContainer)
            }
        },
    ) {
        RowCard(notice.title, listOfNotNull(notice.message.ifBlank { null }, timeAgo(notice.createdAt)).joinToString("\n"), Icons.Rounded.Notifications, onClick = onClick, trailing = trailing)
    }
}

/** The server's notification inbox. */
@Composable
fun NoticesPage(onBack: () -> Unit) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    val revision by repository.revision.collectAsStateWithLifecycle()
    var notices by remember { mutableStateOf<List<Notice>?>(null) }
    var clearing by remember { mutableStateOf(false) }
    // The server tells every client when the inbox changes, so this reloads after a delete anywhere.
    LaunchedEffect(revision) { notices = repository.request { it.notices() }?.items ?: notices ?: emptyList() }
    if (clearing) Confirm("Delete all notifications?", "They are removed on every device.", "Delete all", { clearing = false; scope.launch { repository.request { it.clearNotices() }; notices = emptyList() } }, { clearing = false })

    SubPage("Notifications", onBack, actions = {
        TextButton({ scope.launch { repository.request { it.readAllNotices() }; notices = notices?.map { it.copy(isRead = true) } } }, enabled = notices?.any { !it.isRead } == true) { Text("Mark all read") }
        IconButton({ clearing = true }, enabled = notices?.isNotEmpty() == true) { Icon(Icons.Rounded.DeleteSweep, "Delete all") }
    }) {
        val list = notices
        if (list == null) LoadingIndicator(Modifier.align(Alignment.CenterHorizontally))
        if (list?.isEmpty() == true) EmptyState("Nothing yet", "Alerts from automations, new devices and offline devices appear here.")
        list?.forEach { notice ->
            key(notice.id) {
                SwipeNotice(notice, { notices = notices?.filter { it.id != notice.id }; scope.launch { repository.request { it.removeNotice(notice.id) } } }) { if (!notice.isRead) Badge() }
            }
        }
    }
}
