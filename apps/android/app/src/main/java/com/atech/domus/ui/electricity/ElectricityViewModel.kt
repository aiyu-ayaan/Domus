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
import java.util.Calendar
import java.util.concurrent.TimeUnit

sealed interface ElectricityState {
    data object Loading : ElectricityState
    data class Error(val message: String) : ElectricityState
    data class Content(val summary: EnergySummary) : ElectricityState
}

enum class EnergyRange(val key: String, val label: String, val hours: Int, val minutes: Int? = null) {
    ONE_MINUTE("1m", "1 minute", hours = 0, minutes = 1),
    ONE_HOUR("1h", "1 hour", hours = 1),
    TWELVE_HOURS("12h", "12 hours", hours = 12),
    TWENTY_FOUR_HOURS("24h", "24 hours", hours = 24),
    ONE_WEEK("7d", "1 week", hours = 168),
    THIRTY_DAYS("30d", "30 days", hours = 720),
    BILLING_CYCLE("billing", "Billing Cycle", hours = 24)
}

/** Live power usage: polls /energy/summary on an interval so the number tracks reality. */
class ElectricityViewModel(app: Application) : AndroidViewModel(app) {
    private val core = (app as DomusApp).core

    private val _state = MutableStateFlow<ElectricityState>(ElectricityState.Loading)
    val state: StateFlow<ElectricityState> = _state.asStateFlow()

    private val _selectedRange = MutableStateFlow(EnergyRange.TWENTY_FOUR_HOURS)
    val selectedRange: StateFlow<EnergyRange> = _selectedRange.asStateFlow()

    /** Latest instantaneous draw in watts, for the dashboard overview. */
    val currentPowerW: Double?
        get() = (_state.value as? ElectricityState.Content)?.summary?.total_power_w

    init { startPolling() }

    private fun startPolling() {
        viewModelScope.launch {
            while (isActive) {
                refresh()
                val delayMs = if (_selectedRange.value == EnergyRange.ONE_MINUTE) 2000L else POLL_MS
                delay(delayMs)
            }
        }
    }

    suspend fun refresh() {
        val range = _selectedRange.value
        val hours = if (range == EnergyRange.BILLING_CYCLE) {
            getBillingCycleHours(getActiveHomeBillingStartDay())
        } else {
            range.hours
        }
        val minutes = range.minutes

        when (val result = core.energy.summary(hours = hours, minutes = minutes)) {
            is DomusResult.Success -> _state.value = ElectricityState.Content(result.data)
            is DomusResult.Failure ->
                // keep showing the last good reading; only surface an error if we have none yet
                if (_state.value is ElectricityState.Loading) {
                    _state.value = ElectricityState.Error(result.error.message)
                }
        }
    }

    fun setRange(range: EnergyRange) {
        if (_selectedRange.value == range) return
        _selectedRange.value = range
        viewModelScope.launch {
            _state.value = ElectricityState.Loading
            refresh()
        }
    }

    private suspend fun getActiveHomeBillingStartDay(): Int {
        val homes = (core.homes.list() as? DomusResult.Success)?.data
        val activeHome = homes?.firstOrNull()
        return activeHome?.billing_settings?.billing_cycle_start_day ?: 1
    }

    private fun getBillingCycleHours(startDay: Int): Int {
        val now = Calendar.getInstance()
        val currentYear = now.get(Calendar.YEAR)
        val currentMonth = now.get(Calendar.MONTH)

        val cycleStart = Calendar.getInstance().apply {
            set(Calendar.YEAR, currentYear)
            set(Calendar.MONTH, currentMonth)
            val lastDay = getActualMaximum(Calendar.DAY_OF_MONTH)
            set(Calendar.DAY_OF_MONTH, startDay.coerceAtMost(lastDay))
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }

        if (now.before(cycleStart)) {
            cycleStart.add(Calendar.MONTH, -1)
            val lastDay = cycleStart.getActualMaximum(Calendar.DAY_OF_MONTH)
            cycleStart.set(Calendar.DAY_OF_MONTH, startDay.coerceAtMost(lastDay))
        }

        val diffMs = now.timeInMillis - cycleStart.timeInMillis
        val diffHours = TimeUnit.MILLISECONDS.toHours(diffMs)
        return diffHours.coerceAtLeast(1).toInt()
    }

    fun retry() {
        _state.value = ElectricityState.Loading
        viewModelScope.launch { refresh() }
    }

    companion object {
        private const val POLL_MS = 5_000L // ponytail: 5s poll; switch to a power WS event if one lands
    }
}
