package com.atech.domus.ui.profile

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.atech.core.common.DomusResult
import com.atech.core.model.User
import com.atech.domus.DomusApp
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ProfileState(
    val user: User? = null,
    val loading: Boolean = true,
    val error: String? = null,
)

class ProfileViewModel(app: Application) : AndroidViewModel(app) {
    private val core = (app as DomusApp).core

    private val _state = MutableStateFlow(ProfileState())
    val state: StateFlow<ProfileState> = _state.asStateFlow()

    val serverUrl: String get() = core.currentBaseUrl

    init { load() }

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val result = core.users.me()) {
                is DomusResult.Success -> _state.update { it.copy(user = result.data, loading = false) }
                is DomusResult.Failure -> _state.update { it.copy(loading = false, error = result.error.message) }
            }
        }
    }

    fun signOut() {
        viewModelScope.launch { core.auth.logout() }
    }

    fun changeServer() {
        viewModelScope.launch { core.clearServer() }
    }
}
