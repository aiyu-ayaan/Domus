package com.atech.domus.ui.login

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.atech.core.common.DomusResult
import com.atech.domus.DomusApp
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginState(
    val email: String = "",
    val password: String = "",
    val fullName: String = "",
    val registerMode: Boolean = false,
    val submitting: Boolean = false,
    val error: String? = null,
) {
    val canSubmit: Boolean
        get() = email.isNotBlank() && password.length >= 8 && !submitting
}

class LoginViewModel(app: Application) : AndroidViewModel(app) {
    private val core = (app as DomusApp).core

    private val _state = MutableStateFlow(LoginState())
    val state: StateFlow<LoginState> = _state.asStateFlow()

    /** The configured server, shown in the UI and used by the "change server" action. */
    val serverUrl: String get() = core.currentBaseUrl

    fun onEmail(v: String) = _state.update { it.copy(email = v, error = null) }
    fun onPassword(v: String) = _state.update { it.copy(password = v, error = null) }
    fun onFullName(v: String) = _state.update { it.copy(fullName = v, error = null) }
    fun toggleMode() = _state.update { it.copy(registerMode = !it.registerMode, error = null) }

    /** Submit login or registration; on success isLoggedIn flips and the router advances. */
    fun submit() {
        val s = _state.value
        if (!s.canSubmit) return
        _state.update { it.copy(submitting = true, error = null) }
        viewModelScope.launch {
            val result = if (s.registerMode) {
                core.auth.register(s.email.trim(), s.password, s.fullName.trim().ifBlank { null })
            } else {
                core.auth.login(s.email.trim(), s.password)
            }
            if (result is DomusResult.Failure) {
                _state.update { it.copy(submitting = false, error = messageFor(result.error)) }
            }
            // success: token saved -> isLoggedIn emits -> router moves; leave state as-is
        }
    }

    /** Forget the server so the user can point at a different backend. */
    fun changeServer() {
        viewModelScope.launch { core.clearServer() }
    }

    private fun messageFor(e: com.atech.core.common.DomusError): String = when (e.kind) {
        com.atech.core.common.DomusError.Kind.UNAUTHORIZED -> "Incorrect email or password"
        com.atech.core.common.DomusError.Kind.NETWORK -> "Can't reach the server"
        else -> e.message
    }
}
