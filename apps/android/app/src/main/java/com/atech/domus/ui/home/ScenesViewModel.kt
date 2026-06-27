package com.atech.domus.ui.home

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.atech.core.common.DomusResult
import com.atech.core.model.Scene
import com.atech.domus.DomusApp
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ScenesState(
    val scenes: List<Scene> = emptyList(),
    val activating: Set<String> = emptySet(),
)

/** Scene list + one-tap activation. Device changes flow back via the realtime stream. */
class ScenesViewModel(app: Application) : AndroidViewModel(app) {
    private val core = (app as DomusApp).core

    private val _state = MutableStateFlow(ScenesState())
    val state: StateFlow<ScenesState> = _state.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            val home = (core.homes.list() as? DomusResult.Success)?.data?.firstOrNull() ?: return@launch
            (core.scenes.list(homeId = home.id) as? DomusResult.Success)?.let { result ->
                _state.update { it.copy(scenes = result.data) }
            }
        }
    }

    fun activate(sceneId: String) {
        _state.update { it.copy(activating = it.activating + sceneId) }
        viewModelScope.launch {
            core.scenes.activate(sceneId)
            _state.update { it.copy(activating = it.activating - sceneId) }
        }
    }
}
