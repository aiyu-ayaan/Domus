package com.aiyu.domus

import android.content.Context
import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import com.aiyu.domus.core.AirLevel
import com.aiyu.domus.core.ApiException
import com.aiyu.domus.core.DomusRepository
import com.aiyu.domus.core.FoundServer
import com.aiyu.domus.core.Notice
import com.aiyu.domus.core.ServerDiscovery
import com.aiyu.domus.core.UpdateChannel
import com.aiyu.domus.core.User

@get:StringRes
val AirLevel.labelRes: Int
    get() = when (this) {
        AirLevel.EXCELLENT -> R.string.air_excellent
        AirLevel.GOOD -> R.string.air_good
        AirLevel.MODERATE -> R.string.air_moderate
        AirLevel.POOR -> R.string.air_poor
    }

@Composable
fun AirLevel.text(): String = stringResource(labelRes)

@get:StringRes
val UpdateChannel.labelRes: Int
    get() = when (this) {
        UpdateChannel.STABLE -> R.string.channel_stable
        UpdateChannel.BETA -> R.string.channel_beta
        UpdateChannel.ALPHA -> R.string.channel_alpha
    }

@Composable
fun UpdateChannel.text(): String = stringResource(labelRes)

@Composable
fun FoundServer.displayName(): String =
    if (code == ServerDiscovery.CODE_THIS_COMPUTER) stringResource(R.string.connect_this_computer) else name

/** Resolves a core or server message [code] and `{name}` [params] against `strings.xml`, falling back to [fallback]. */
fun Context.resolveDomusMessage(code: String?, params: Map<String, String> = emptyMap(), fallback: String = ""): String {
    if (code.isNullOrBlank()) return fallback
    val resId = when (code) {
        ApiException.CODE_UNTRUSTED -> R.string.api_untrusted
        ApiException.CODE_OFFLINE -> R.string.api_offline
        ApiException.CODE_BAD_RESPONSE -> R.string.api_bad_response
        ApiException.CODE_REQUEST_FAILED -> R.string.api_request_failed
        DomusRepository.CODE_NO_SERVER -> R.string.error_no_server
        DomusRepository.CODE_CERT_CHANGED -> R.string.connect_cert_changed
        DomusRepository.CODE_ADDRESS_INVALID -> R.string.connect_address_invalid
        DomusRepository.CODE_CERT_UNREADABLE -> R.string.connect_cert_unreadable
        DomusRepository.CODE_AUTOMATION_RAN -> R.string.automation_ran
        else -> {
            val base = "code_" + code.lowercase().replace('.', '_').replace('-', '_')
            val count = params["count"]
            val pluralId = if (count != null) {
                val suffix = if (count == "1") "_one" else "_other"
                resources.getIdentifier(base + suffix, "string", packageName)
            } else 0
            if (pluralId != 0) pluralId else resources.getIdentifier(base, "string", packageName)
        }
    }
    if (resId == 0) return fallback.ifEmpty { code }
    val raw = getString(resId)
    return params.entries.fold(raw) { acc, (k, v) -> acc.replace("{$k}", v) }
}

@Composable
fun Notice.localizedTitle(): String {
    val context = LocalContext.current
    return if (code != null) context.resolveDomusMessage("$code.title", params, title) else title
}

@Composable
fun Notice.localizedMessage(): String {
    val context = LocalContext.current
    return if (code != null) context.resolveDomusMessage(code, params, message) else message
}

fun User.localizedHandoverText(context: Context, server: String, hour24: Boolean): String = resetCode?.let { code ->
    val formatted = code.chunked(4).joinToString(" ")
    val until = resetUntil(hour24)
    if (until != null) {
        context.getString(R.string.handover_reset_until, username, formatted, until)
    } else {
        context.getString(R.string.handover_reset, username, formatted)
    }
} ?: if (kid) {
    context.getString(R.string.handover_signin_kid, server, username, generatedPassword.orEmpty())
} else {
    context.getString(R.string.handover_signin, server, username, generatedPassword.orEmpty())
}
