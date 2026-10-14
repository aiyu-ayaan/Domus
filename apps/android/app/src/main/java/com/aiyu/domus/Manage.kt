package com.aiyu.domus

import com.aiyu.domus.ui.theme.clickHaptics
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
import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.CancellationSignal
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material.icons.rounded.MyLocation
import androidx.compose.material.icons.rounded.Place
import androidx.compose.material.icons.rounded.Search
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import com.aiyu.domus.core.Place
import java.util.Locale
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
import java.time.ZoneId
import java.time.OffsetDateTime
import com.aiyu.domus.core.formatClockTime
import com.aiyu.domus.core.HomeLocation
import androidx.annotation.StringRes
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.selection.selectable
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
import com.aiyu.domus.core.TimeOfUse
import com.aiyu.domus.core.User
import com.aiyu.domus.ui.components.SectionTitle
import com.aiyu.domus.ui.components.ShapedIcon
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** True for a page shown in the right pane of a two-pane Settings: it has no back arrow to leave it. */
val LocalHideBack = androidx.compose.runtime.compositionLocalOf { false }

/** A full-screen page opened from a tab: back arrow, title, scrolling body capped at 840dp. */
@Composable
fun SubPage(title: String, onBack: () -> Unit, actions: @Composable RowScope.() -> Unit = {}, content: @Composable ColumnScope.() -> Unit) {
    Surface(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            Column(Modifier.widthIn(max = 840.dp).fillMaxSize().statusBarsPadding().imePadding()) {
                val hideBack = LocalHideBack.current
                Row(Modifier.padding(horizontal = if (hideBack) 16.dp else 4.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (!hideBack) IconButton(onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, stringResource(R.string.manage_back)) }
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
            { IconButton({ shown = !shown }) { Icon(if (shown) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility, if (shown) stringResource(R.string.manage_hide_field, label) else stringResource(R.string.manage_show_field, label)) } }
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
    selected: Boolean = false,
    trailing: @Composable RowScope.() -> Unit = {}
) {
    val c = MaterialTheme.colorScheme
    val container by androidx.compose.animation.animateColorAsState(
        if (selected) c.secondaryContainer else c.surfaceContainerHigh,
        MaterialTheme.motionScheme.defaultEffectsSpec(),
        label = "rowSelected",
    )
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
    if (onClick != null) Surface(onClick, modifier.fillMaxWidth(), color = container, shape = MaterialTheme.shapes.large, content = body)
    else Surface(modifier.fillMaxWidth(), color = container, shape = MaterialTheme.shapes.large, content = body)
}

/** One choice out of a list that may be long (devices, rooms): a field that opens the list in a dialog. */
@Composable
fun <T> Picker(label: String, options: List<Pair<T, String>>, selected: T, onSelect: (T) -> Unit, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    OutlinedCard({ open = true }, modifier.fillMaxWidth()) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(options.firstOrNull { it.first == selected }?.second ?: stringResource(R.string.manage_choose), style = MaterialTheme.typography.bodyLarge)
        }
    }
    if (open) {
        AlertDialog(modifier = Modifier.clickHaptics(), 
            onDismissRequest = { open = false },
            title = { Text(label) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    options.forEach { (value, name) ->
                        // The whole row picks, not just the radio dot.
                        Row(
                            Modifier.fillMaxWidth().selectable(value == selected, role = Role.RadioButton) { onSelect(value); open = false },
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(value == selected, onClick = null, modifier = Modifier.minimumInteractiveComponentSize())
                            Text(name, Modifier.weight(1f))
                        }
                    }
                }
            },
            confirmButton = { TextButton({ open = false }) { Text(stringResource(R.string.manage_close)) } },
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
    AlertDialog(modifier = Modifier.clickHaptics(), 
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(text) },
        confirmButton = { Button({ onDismiss(); onConfirm() }, colors = ButtonDefaults.buttonColors(MaterialTheme.colorScheme.error, MaterialTheme.colorScheme.onError)) { Text(action) } },
        dismissButton = { TextButton(onDismiss) { Text(stringResource(R.string.manage_cancel)) } },
    )
}

/** Dialog with a form: Save on the right, an optional Delete on the left. */
@Composable
fun FormDialog(title: String, canSave: Boolean, onSave: () -> Unit, onDismiss: () -> Unit, onDelete: (() -> Unit)? = null, save: String = stringResource(R.string.manage_save), content: @Composable ColumnScope.() -> Unit) {
    AlertDialog(modifier = Modifier.clickHaptics(), 
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp), content = content) },
        confirmButton = { Button(onSave, enabled = canSave) { Text(save) } },
        dismissButton = {
            Row {
                if (onDelete != null) TextButton(onDelete, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Text(stringResource(R.string.manage_delete)) }
                TextButton(onDismiss) { Text(stringResource(R.string.manage_cancel)) }
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

    SubPage(stringResource(R.string.manage_rooms_title), onBack, actions = { IconButton({ editing = null; open = true }) { Icon(Icons.Rounded.Add, stringResource(R.string.manage_add_room)) } }) {
        if (rooms.isEmpty()) EmptyState(stringResource(R.string.manage_no_rooms), stringResource(R.string.manage_no_rooms_subtitle))
        rooms.sortedBy { it.floor }.forEach { room ->
            val count = devices.count { it.roomId == room.id }
            val devicesText = pluralStringResource(R.plurals.manage_device_count, count, count)
            RowCard(room.name, stringResource(R.string.manage_room_subtitle, room.floor, devicesText), Icons.Rounded.MeetingRoom, onClick = { editing = room; open = true })
        }
    }
    if (open) {
        val room = editing
        var name by remember { mutableStateOf(room?.name.orEmpty()) }
        var floor by remember { mutableStateOf((room?.floor ?: 1).toString()) }
        FormDialog(
            if (room == null) stringResource(R.string.manage_new_room) else stringResource(R.string.manage_edit_room),
            canSave = name.isNotBlank() && floor.toIntOrNull() != null,
            onSave = { open = false; scope.launch { repository.change { it.saveRoom(room?.id, name.trim(), floor.toInt()) } } },
            onDismiss = { open = false },
            // Devices stay; they just move to "No room".
            onDelete = room?.let { { open = false; scope.launch { repository.change { api -> api.removeRoom(it.id) } } } },
        ) {
            Field(name, { name = it }, stringResource(R.string.manage_field_name))
            Field(floor, { floor = it }, stringResource(R.string.manage_field_floor), keyboard = KeyboardType.Number)
        }
    }
}

private val Roles: List<Pair<String, Int>> = listOf(
    "admin" to R.string.manage_role_admin,
    "member" to R.string.manage_role_member,
    "guest" to R.string.manage_role_guest,
)
private val Levels: List<Pair<String, Int>> = listOf(
    "none" to R.string.manage_level_none,
    "view" to R.string.manage_level_view,
    "control" to R.string.manage_level_control,
    "edit" to R.string.manage_level_edit,
)

/** The level of one room or device: a chip that opens the four levels. It is tinted while access is given. */
@Composable
private fun LevelMenu(what: String, level: String, onLevel: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val accessDesc = stringResource(R.string.manage_access_to, what)
    Box {
        FilterChip(
            selected = level != "none",
            onClick = { open = true },
            label = { Text(stringResource(Levels.first { it.first == level }.second)) },
            trailingIcon = { Icon(Icons.Rounded.ArrowDropDown, null, Modifier.size(18.dp)) },
            modifier = Modifier.semantics { contentDescription = accessDesc },
        )
        DropdownMenu(open, { open = false }, Modifier.clickHaptics()) {
            Levels.forEach { (value, nameRes) ->
                DropdownMenuItem(
                    text = { Text(stringResource(nameRes)) },
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
        room != null -> stringResource(R.string.manage_whole_room_level, stringResource(Levels.first { it.first == room }.second).lowercase())
        count > 0 -> stringResource(R.string.manage_room_devices_of_total, count, devices.size)
        else -> stringResource(R.string.manage_no_access)
    }
    val turn by animateFloatAsState(if (open) 180f else 0f, MaterialTheme.motionScheme.fastSpatialSpec(), label = "chevron")
    val clickLabel = if (open) stringResource(R.string.manage_close_item, name) else stringResource(R.string.manage_open_item, name)
    Surface(color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(
                Modifier.fillMaxWidth().clickable(onClickLabel = clickLabel) { open = !open }.heightIn(min = 64.dp).padding(horizontal = 16.dp, vertical = 12.dp),
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
                        AccessRow(stringResource(R.string.manage_whole_room), room ?: "none", onRoom, hint = stringResource(R.string.manage_whole_room_hint))
                        if (devices.isNotEmpty()) HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = c.outlineVariant)
                    }
                    devices.forEach { device -> AccessRow(device.name, grants.levelOf(device), { onDevice(device, it) }) }
                    if (devices.isEmpty()) Text(stringResource(R.string.manage_no_devices_in_room), Modifier.padding(16.dp), style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
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

    SubPage(stringResource(R.string.manage_people_title), onBack, actions = { IconButton({ open("person:new") }) { Icon(Icons.Rounded.Add, stringResource(R.string.manage_add_person)) } }) {
        val list = users
        if (list == null) LoadingIndicator(Modifier.align(Alignment.CenterHorizontally))
        list?.forEach { user ->
            val access = if (user.isAdmin || user.allRooms) stringResource(R.string.manage_access_whole_home) else listOfNotNull(
                pluralStringResource(R.plurals.manage_room_count, user.roomIds.size, user.roomIds.size).takeIf { user.roomIds.isNotEmpty() },
                pluralStringResource(R.plurals.manage_device_count, user.deviceIds.size, user.deviceIds.size).takeIf { user.deviceIds.isNotEmpty() },
            ).joinToString(", ").ifEmpty { stringResource(R.string.manage_access_none) }
            val roleText = Roles.firstOrNull { it.first == user.role }?.second?.let { stringResource(it) } ?: user.role.replaceFirstChar(Char::uppercase)
            RowCard(
                title = user.username,
                subtitle = listOfNotNull(
                    roleText,
                    access,
                    stringResource(R.string.manage_user_tag_kid).takeIf { user.kid },
                    stringResource(R.string.manage_user_tag_reset_requested).takeIf { user.resetRequested },
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
        SubPage(stringResource(R.string.manage_person_title), onBack) { LoadingIndicator(Modifier.align(Alignment.CenterHorizontally)) }
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
            Switch(checked, onChange, enabled = enabled)
        }
    }
}

/** Shows a first password or a reset code once, to copy or share. Domus keeps no readable copy. */
@Composable
private fun Handover(user: User, onDone: () -> Unit) {
    val context = LocalContext.current
    val server = (LocalRepository.current.session.collectAsStateWithLifecycle().value as? Session.SignedIn)?.server.orEmpty()
    val text = remember(user, server, context) { user.localizedHandoverText(context, server, DateFormat.is24HourFormat(context)) }
    AlertDialog(modifier = Modifier.clickHaptics(), 
        onDismissRequest = onDone,
        title = { Text(if (user.resetCode != null) stringResource(R.string.manage_handover_reset_title, user.username) else stringResource(R.string.manage_handover_signin_title, user.username)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(stringResource(R.string.manage_handover_shown_once))
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
                        Text(stringResource(R.string.manage_copy))
                    }
                    FilledTonalButton({
                        context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), null))
                    }) {
                        Icon(Icons.Rounded.Share, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(stringResource(R.string.manage_share))
                    }
                }
            }
        },
        confirmButton = { TextButton(onDone) { Text(stringResource(R.string.manage_done)) } },
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

    SubPage(user?.username ?: stringResource(R.string.manage_new_person), onBack, actions = {
        // You can't delete the account you are signed in with.
        if (user != null && user.id != me.id) TextButton({ deleting = true }, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Text(stringResource(R.string.manage_delete)) }
    }) {
        Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            UserAvatar(avatarSpec = avatar, username = username.ifEmpty { "User" }, size = 56.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.manage_avatar), style = MaterialTheme.typography.titleSmall)
                Text(parseDiceBearSpec(avatar).first, style = MaterialTheme.typography.bodySmall, color = muted)
            }
            FilledTonalButton(onClick = { avatar = randomDiceBearSpec() }) {
                Icon(Icons.Rounded.AutoAwesome, null, Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text(stringResource(R.string.manage_roll))
            }
        }
        if (user == null) Field(username, { username = it }, stringResource(R.string.manage_field_username), supporting = stringResource(R.string.manage_username_supporting))
        Field(
            email, { email = it }, stringResource(R.string.manage_field_email), keyboard = KeyboardType.Email, error = emailFree == false,
            supporting = when (emailFree) {
                false -> stringResource(R.string.manage_email_taken)
                true -> stringResource(R.string.manage_email_available)
                null -> stringResource(R.string.manage_email_hint)
            },
        )
        TextButton(
            { scope.launch { repository.request { it.suggestEmail(name, user?.id) }?.let { email = it.email } } },
            Modifier.align(Alignment.End), enabled = name.length >= 3,
        ) { Text(stringResource(R.string.manage_generate_email)) }
        // Your own password is changed by you, not from here.
        if (user?.id != me.id) {
            SectionTitle(stringResource(R.string.manage_section_password))
            ToggleCard(stringResource(R.string.manage_kid_account), if (kid) stringResource(R.string.manage_kid_account_on) else stringResource(R.string.manage_kid_account_off), kid) { kid = it }
            val account = current
            when {
                kid -> Field(
                    password, { password = it },
                    if (user?.kid == true) stringResource(R.string.manage_field_new_password) else stringResource(R.string.manage_field_password),
                    secret = true,
                    supporting = if (user?.kid == true) stringResource(R.string.manage_password_keep_current) else stringResource(R.string.manage_password_min_length),
                )
                account == null -> Text(stringResource(R.string.manage_password_after_saving), style = MaterialTheme.typography.bodyMedium, color = muted)
                else -> {
                    if (account.resetRequested) Text(stringResource(R.string.manage_reset_requested_notice, account.username), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.tertiary)
                    val until = account.resetUntil(DateFormat.is24HourFormat(LocalContext.current))
                    ToggleCard(
                        stringResource(R.string.manage_reset_code),
                        if (account.resetAllowed && until != null) stringResource(R.string.manage_reset_code_active, until)
                        else stringResource(R.string.manage_reset_code_help),
                        account.resetAllowed, enabled = !issuing,
                    ) { issue("reset_allowed", it) }
                    FilledTonalButton({ issue("reset_password") }, enabled = !issuing) { Text(stringResource(R.string.manage_generate_new_password)) }
                }
            }
        }

        SectionTitle(stringResource(R.string.manage_section_role))
        Choice(Roles.map { it.first to stringResource(it.second) }, role, { role = it })
        Text(
            when (role) {
                "admin" -> stringResource(R.string.manage_role_admin_desc)
                "member" -> stringResource(R.string.manage_role_member_desc)
                else -> stringResource(R.string.manage_role_guest_desc)
            },
            style = MaterialTheme.typography.bodyMedium, color = muted,
        )

        if (role != "admin") {
            SectionTitle(stringResource(R.string.manage_section_access))
            ToggleCard(stringResource(R.string.manage_custom_access), if (allRooms) stringResource(R.string.manage_custom_access_off) else stringResource(R.string.manage_custom_access_on), !allRooms) { allRooms = !it }
            if (!allRooms) {
                if (rooms.isEmpty() && devices.isEmpty()) Text(stringResource(R.string.manage_create_rooms_first), color = muted)
                rooms.forEach { room ->
                    RoomAccess(room.name, devices.filter { it.roomId == room.id }, grants, grants.rooms[room.id], { grants = grants.withRoom(room.id, it, devices) }) { device, level -> grants = grants.withDevice(device, level, devices) }
                }
                val loose = devices.filter { it.roomId == null }
                if (loose.isNotEmpty()) RoomAccess(stringResource(R.string.manage_no_room), loose, grants, null, null) { device, level -> grants = grants.withDevice(device, level, devices) }
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
        ) { Text(stringResource(R.string.manage_save)) }
    }
    handover?.let { Handover(it) { handover = null; if (closeAfter) onBack() } }
    if (deleting && user != null) {
        Confirm(stringResource(R.string.manage_remove_user_title, user.username), stringResource(R.string.manage_remove_user_text), stringResource(R.string.manage_remove), { scope.launch { repository.change { it.removeUser(user.id) }?.let { onBack() } } }, { deleting = false })
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
    // (start, end, difference per kWh) as typed.
    val windows = remember { mutableStateListOf<Triple<String, String, String>>() }
    val solarIds = remember { mutableStateListOf<String>() }
    var exportMode by remember { mutableStateOf("net") }
    var exportRate by remember { mutableStateOf("") }
    val devices by repository.devices.collectAsStateWithLifecycle()
    fun show(s: EnergySettings) {
        fun text(v: Double) = if (v % 1.0 == 0.0) v.toLong().toString() else v.toString()
        rate = text(s.ratePerKwh); currency = s.currency; budget = s.monthlyBudget?.let(::text).orEmpty()
        day = s.billingCycleDay.toString(); fixed = text(s.fixedMonthlyCharge)
        slabs.clear(); slabs.addAll(s.slabs.map { (it.upToKwh?.let(::text).orEmpty()) to text(it.rate) })
        windows.clear(); windows.addAll(s.timeOfUse.map { Triple(it.start, it.end, text(it.adjust)) })
        solarIds.clear(); solarIds.addAll(s.solarDeviceIds); exportMode = s.exportMode; exportRate = text(s.exportRate)
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
        timeOfUse = windows.map { TimeOfUse(it.first.trim(), it.second.trim(), it.third.toDoubleOrNull() ?: 0.0) },
        solarDeviceIds = solarIds.toList(),
        exportMode = exportMode,
        exportRate = if (exportMode == "feed_in") exportRate.toDoubleOrNull() ?: -1.0 else exportRate.toDoubleOrNull() ?: 0.0,
    )
    val clock = Regex("""([01]\d|2[0-3]):[0-5]\d""")
    val valid = typed.ratePerKwh >= 0 && typed.fixedMonthlyCharge >= 0 && typed.exportRate >= 0 && typed.currency.length == 3 && typed.billingCycleDay in 1..28 &&
        (budget.isBlank() || typed.monthlyBudget != null) && typed.slabs.all { it.rate >= 0 } &&
        windows.all { clock.matches(it.first.trim()) && clock.matches(it.second.trim()) && it.third.toDoubleOrNull() != null }

    SubPage(stringResource(R.string.manage_tariff_title), onBack) {
        if (!loaded) {
            LoadingIndicator(Modifier.align(Alignment.CenterHorizontally))
            return@SubPage
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Field(rate, { rate = it }, stringResource(R.string.manage_rate_per_kwh), Modifier.weight(1f), KeyboardType.Decimal)
            Field(currency, { currency = it.take(3) }, stringResource(R.string.manage_currency), Modifier.weight(1f), supporting = stringResource(R.string.manage_currency_supporting))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Field(fixed, { fixed = it }, stringResource(R.string.manage_fixed_monthly_charge), Modifier.weight(1f), KeyboardType.Decimal)
            Field(day, { day = it }, stringResource(R.string.manage_billing_day), Modifier.weight(1f), KeyboardType.Number, supporting = stringResource(R.string.manage_billing_day_supporting))
        }
        Field(budget, { budget = it }, stringResource(R.string.manage_monthly_budget), keyboard = KeyboardType.Decimal)

        SectionTitle(stringResource(R.string.manage_usage_slabs))
        Text(
            if (slabs.isEmpty()) stringResource(R.string.manage_slabs_empty) else stringResource(R.string.manage_slabs_help),
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        slabs.forEachIndexed { index, (upTo, slabRate) ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Field(upTo, { slabs[index] = it to slabRate }, stringResource(R.string.manage_up_to_kwh), Modifier.weight(1f), KeyboardType.Decimal)
                Field(slabRate, { slabs[index] = upTo to it }, stringResource(R.string.manage_slab_rate), Modifier.weight(1f), KeyboardType.Decimal)
                IconButton({ slabs.removeAt(index) }) { Icon(Icons.Rounded.Close, stringResource(R.string.manage_remove_slab, index + 1)) }
            }
        }
        OutlinedButton({ slabs.add("" to "") }) { Text(stringResource(R.string.manage_add_slab)) }

        SectionTitle(stringResource(R.string.manage_time_of_day))
        Text(
            stringResource(R.string.manage_time_of_day_help),
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        windows.forEachIndexed { index, (from, until, adjust) ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Field(from, { windows[index] = Triple(it, until, adjust) }, stringResource(R.string.manage_window_from), Modifier.weight(1f), supporting = "22:00")
                Field(until, { windows[index] = Triple(from, it, adjust) }, stringResource(R.string.manage_window_until), Modifier.weight(1f), supporting = "06:00")
                Field(adjust, { windows[index] = Triple(from, until, it) }, stringResource(R.string.manage_window_per_kwh), Modifier.weight(1f))
                IconButton({ windows.removeAt(index) }) { Icon(Icons.Rounded.Close, stringResource(R.string.manage_remove_time_window, index + 1)) }
            }
        }
        OutlinedButton({ windows.add(Triple("", "", "")) }) { Text(stringResource(R.string.manage_add_time_window)) }

        val meters = devices.filter { it.state.watts != null || it.id in solarIds }
        if (meters.isNotEmpty()) {
            SectionTitle(stringResource(R.string.manage_solar))
            Text(stringResource(R.string.manage_solar_help), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            meters.forEach { device ->
                Row(
                    Modifier.fillMaxWidth().toggleable(device.id in solarIds, role = Role.Checkbox) { if (it) solarIds.add(device.id) else solarIds.remove(device.id) }.padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(device.id in solarIds, onCheckedChange = null)
                    Spacer(Modifier.width(12.dp))
                    Text(device.name, style = MaterialTheme.typography.bodyLarge)
                }
            }
            if (solarIds.isNotEmpty()) {
                Text(stringResource(R.string.manage_solar_export), style = MaterialTheme.typography.titleSmall)
                Choice(listOf("net" to stringResource(R.string.manage_solar_net), "feed_in" to stringResource(R.string.manage_solar_feed_in)), exportMode, { exportMode = it })
                if (exportMode == "feed_in") Field(exportRate, { exportRate = it }, stringResource(R.string.manage_solar_export_rate), keyboard = KeyboardType.Decimal)
            }
        }

        Button(
            { scope.launch { repository.change { it.saveEnergySettings(typed) }?.let { show(it); onBack() } } },
            Modifier.fillMaxWidth().heightIn(min = 56.dp), enabled = valid,
        ) { Text(stringResource(R.string.manage_save)) }
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

    SubPage(stringResource(R.string.manage_server_addresses_title), onBack) {
        Text(
            stringResource(R.string.manage_server_addresses_help),
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (admin) {
            Field(local, { local = it }, stringResource(R.string.manage_home_network), keyboard = KeyboardType.Uri, supporting = stringResource(R.string.manage_home_network_supporting))
            Field(remote, { remote = it }, stringResource(R.string.manage_remote), keyboard = KeyboardType.Uri, supporting = stringResource(R.string.manage_remote_supporting))
            error?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error) }
            Button(
                { scope.launch { error = repository.saveLinks(local, remote); if (error == null) onBack() } },
                Modifier.fillMaxWidth().heightIn(min = 56.dp), enabled = local != links.localUrl || remote != links.remoteUrl,
            ) { Text(stringResource(R.string.manage_save)) }
        } else {
            RowCard(stringResource(R.string.manage_home_network), links.localUrl.ifBlank { stringResource(R.string.manage_not_set) }, Icons.Rounded.Home)
            RowCard(stringResource(R.string.manage_remote), links.remoteUrl.ifBlank { stringResource(R.string.manage_not_set) }, Icons.Rounded.Public)
        }
    }
}

/** Where the home is, for automations that run at sunrise and sunset. */
@Composable
fun LocationPage(onBack: () -> Unit) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    var place by remember { mutableStateOf<HomeLocation?>(null) }
    var latitude by rememberSaveable { mutableStateOf("") }
    var longitude by rememberSaveable { mutableStateOf("") }
    val is24Hour = rememberIs24HourFormat()
    fun show(loaded: HomeLocation) { place = loaded; latitude = loaded.latitude?.toString().orEmpty(); longitude = loaded.longitude?.toString().orEmpty() }
    LaunchedEffect(Unit) { repository.request { it.homeLocation() }?.let(::show) }
    fun clock(instant: String?) = instant?.let { runCatching { OffsetDateTime.parse(it).atZoneSameInstant(ZoneId.systemDefault()).toLocalTime().toString().take(5) }.getOrNull() }?.let { formatClockTime(it, is24Hour) }
    val lat = latitude.toDoubleOrNull()?.takeIf { it in -90.0..90.0 }
    val lon = longitude.toDoubleOrNull()?.takeIf { it in -180.0..180.0 }
    val context = LocalContext.current
    var query by rememberSaveable { mutableStateOf("") }
    var places by remember { mutableStateOf<List<Place>?>(null) }
    var busy by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }
    // Two decimals is about a kilometre: enough for the sun, and not the address.
    fun fill(newLatitude: Double, newLongitude: Double) {
        latitude = "%.2f".format(Locale.US, newLatitude); longitude = "%.2f".format(Locale.US, newLongitude); places = null; notice = null
    }

    @SuppressLint("MissingPermission") // only reached once the permission is granted
    fun locate() {
        val manager = context.getSystemService(LocationManager::class.java)
        val provider = listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER).firstOrNull { runCatching { manager.isProviderEnabled(it) }.getOrDefault(false) }
        if (provider == null) {
            notice = context.getString(R.string.manage_location_disabled)
            return
        }
        busy = true
        LocationManagerCompat.getCurrentLocation(manager, provider, null as CancellationSignal?, ContextCompat.getMainExecutor(context)) { found ->
            busy = false
            if (found == null) notice = context.getString(R.string.manage_location_not_found) else fill(found.latitude, found.longitude)
        }
    }
    val askLocation = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) locate() else notice = context.getString(R.string.manage_location_permission_denied)
    }

    SubPage(stringResource(R.string.manage_location_title), onBack) {
        val rise = clock(place?.sunrise)
        val set = clock(place?.sunset)
        Text(
            if (rise != null && set != null) stringResource(R.string.manage_location_sun_times, rise, set)
            else stringResource(R.string.manage_location_help),
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        FilledTonalButton(
            {
                if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) locate()
                else askLocation.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
            },
            Modifier.fillMaxWidth().heightIn(min = 56.dp), enabled = !busy,
        ) {
            Icon(Icons.Rounded.MyLocation, contentDescription = null)
            Text(stringResource(R.string.manage_use_phone_location), Modifier.padding(start = 8.dp))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Field(query, { query = it }, stringResource(R.string.manage_find_place), Modifier.weight(1f), supporting = stringResource(R.string.manage_find_place_supporting))
            FilledTonalIconButton(
                { scope.launch { busy = true; notice = null; places = repository.request { it.searchPlaces(query.trim()) }; busy = false } },
                enabled = !busy && query.trim().length >= 2,
            ) { Icon(Icons.Rounded.Search, stringResource(R.string.manage_search_place)) }
        }
        if (busy) LoadingIndicator(Modifier.align(Alignment.CenterHorizontally))
        notice?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error) }
        places?.let { found ->
            if (found.isEmpty()) Text(stringResource(R.string.manage_no_place_found), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            found.forEach { RowCard(it.name, "${it.latitude}, ${it.longitude}", Icons.Rounded.Place, onClick = { fill(it.latitude, it.longitude) }) }
        }
        Field(latitude, { latitude = it }, stringResource(R.string.manage_latitude), keyboard = KeyboardType.Text, supporting = stringResource(R.string.manage_latitude_supporting), error = latitude.isNotBlank() && lat == null)
        Field(longitude, { longitude = it }, stringResource(R.string.manage_longitude), keyboard = KeyboardType.Text, supporting = stringResource(R.string.manage_longitude_supporting), error = longitude.isNotBlank() && lon == null)
        Button(
            { scope.launch { repository.request { it.saveHomeLocation(lat!!, lon!!) }?.let(::show) } },
            Modifier.fillMaxWidth().heightIn(min = 56.dp), enabled = lat != null && lon != null && (lat != place?.latitude || lon != place?.longitude),
        ) { Text(stringResource(R.string.manage_save)) }
    }
}

/** Anyone changes their own password here; it needs the current one. */
@Composable
fun ChangePasswordPage(onBack: () -> Unit) {
    val repository = LocalRepository.current
    val scope = rememberCoroutineScope()
    var current by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var confirm by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val mismatch = confirm.isNotEmpty() && confirm != password

    SubPage(stringResource(R.string.manage_change_password_title), onBack) {
        Text(stringResource(R.string.manage_change_password_help), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Field(current, { current = it; error = null }, stringResource(R.string.manage_current_password), keyboard = KeyboardType.Password, secret = true)
        Field(password, { password = it; error = null }, stringResource(R.string.manage_field_new_password), keyboard = KeyboardType.Password, secret = true, supporting = stringResource(R.string.manage_password_min_length))
        Field(confirm, { confirm = it }, stringResource(R.string.manage_repeat_new_password), keyboard = KeyboardType.Password, secret = true, supporting = if (mismatch) stringResource(R.string.manage_passwords_mismatch) else null, error = mismatch)
        error?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error) }
        Button(
            { scope.launch { busy = true; error = repository.changePassword(current, password); busy = false; if (error == null) onBack() } },
            Modifier.fillMaxWidth().heightIn(min = 56.dp), enabled = !busy && current.isNotEmpty() && password.length >= 8 && password == confirm,
        ) { Text(stringResource(R.string.manage_change_password_title)) }
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
                Icon(Icons.Rounded.Delete, stringResource(R.string.manage_delete), tint = MaterialTheme.colorScheme.onErrorContainer)
            }
        },
    ) {
        val message = notice.localizedMessage()
        RowCard(notice.localizedTitle(), listOfNotNull(message.ifBlank { null }, timeAgo(notice.createdAt)).joinToString("\n"), Icons.Rounded.Notifications, onClick = onClick, trailing = trailing)
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
    if (clearing) Confirm(stringResource(R.string.manage_delete_all_notices_title), stringResource(R.string.manage_delete_all_notices_text), stringResource(R.string.manage_delete_all), { clearing = false; scope.launch { repository.request { it.clearNotices() }; notices = emptyList() } }, { clearing = false })

    SubPage(stringResource(R.string.manage_notifications_title), onBack, actions = {
        TextButton({ scope.launch { repository.request { it.readAllNotices() }; notices = notices?.map { it.copy(isRead = true) } } }, enabled = notices?.any { !it.isRead } == true) { Text(stringResource(R.string.manage_mark_all_read)) }
        IconButton({ clearing = true }, enabled = notices?.isNotEmpty() == true) { Icon(Icons.Rounded.DeleteSweep, stringResource(R.string.manage_delete_all)) }
    }) {
        val list = notices
        if (list == null) LoadingIndicator(Modifier.align(Alignment.CenterHorizontally))
        if (list?.isEmpty() == true) EmptyState(stringResource(R.string.manage_no_notices), stringResource(R.string.manage_no_notices_subtitle))
        list?.forEach { notice ->
            key(notice.id) {
                SwipeNotice(notice, { notices = notices?.filter { it.id != notice.id }; scope.launch { repository.request { it.removeNotice(notice.id) } } }) { if (!notice.isRead) Badge() }
            }
        }
    }
}
