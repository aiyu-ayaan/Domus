package com.atech.domus.ui.electricity

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.atech.core.common.DomusResult
import com.atech.core.model.EnergySummary
import com.atech.domus.DomusApp
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

sealed interface ElectricityState {
    data object Loading : ElectricityState
    data class Error(val message: String) : ElectricityState
    data class Content(val summary: EnergySummary) : ElectricityState
}

/** Live power usage: polls /energy/summary on an interval so the number tracks reality. */
class ElectricityViewModel(app: Application) : AndroidViewModel(app) {
    private val core = (app as DomusApp).core

    private val _state = MutableStateFlow<ElectricityState>(ElectricityState.Loading)
    val state: StateFlow<ElectricityState> = _state.asStateFlow()

    /** Latest instantaneous draw in watts, for the dashboard overview. */
    val currentPowerW: Double?
        get() = (_state.value as? ElectricityState.Content)?.summary?.total_power_w

    init { startPolling() }

    private fun startPolling() {
        viewModelScope.launch {
            while (isActive) {
                refresh()
                delay(POLL_MS)
            }
        }
    }

    suspend fun refresh() {
        when (val result = core.energy.summary(hours = 24)) {
            is DomusResult.Success -> _state.value = ElectricityState.Content(result.data)
            is DomusResult.Failure ->
                // keep showing the last good reading; only surface an error if we have none yet
                if (_state.value is ElectricityState.Loading) {
                    _state.value = ElectricityState.Error(result.error.message)
                }
        }
    }

    fun retry() {
        _state.value = ElectricityState.Loading
        viewModelScope.launch { refresh() }
    }

    companion object {
        private const val POLL_MS = 5_000L // ponytail: 5s poll; switch to a power WS event if one lands
    }
}
