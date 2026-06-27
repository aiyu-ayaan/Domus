package com.atech.domus.ui.server

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

data class ServerConfigState(
    val url: String = "",
    val testing: Boolean = false,
    val error: String? = null,
    val reachable: Boolean = false,
)

class ServerConfigViewModel(app: Application) : AndroidViewModel(app) {
    private val core = (app as DomusApp).core

    private val _state = MutableStateFlow(ServerConfigState(url = core.currentBaseUrl))
    val state: StateFlow<ServerConfigState> = _state.asStateFlow()

    fun onUrlChange(value: String) {
        _state.update { it.copy(url = value, error = null, reachable = false) }
    }

    /** Validate format, probe `/health`, and persist on success. */
    fun connect() {
        val url = _state.value.url.trim()
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            _state.update { it.copy(error = "URL must start with http:// or https://") }
            return
        }
        _state.update { it.copy(testing = true, error = null) }
        viewModelScope.launch {
            when (val result = core.testConnection(url)) {
                is DomusResult.Success -> {
                    _state.update { it.copy(testing = false, reachable = true) }
                    core.setBaseUrl(url) // flips isConfigured -> router advances to login
                }
                is DomusResult.Failure -> _state.update {
                    it.copy(testing = false, error = "Couldn't reach server: ${result.error.message}")
                }
            }
        }
    }

    /** Save without a reachability check — for configuring before the server is up. */
    fun saveAnyway() {
        val url = _state.value.url.trim()
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            _state.update { it.copy(error = "URL must start with http:// or https://") }
            return
        }
        viewModelScope.launch { core.setBaseUrl(url) }
    }
}
