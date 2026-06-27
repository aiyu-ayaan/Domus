package com.atech.domus.ui.profile

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.atech.core.common.DomusResult
import com.atech.core.model.BillingSettings
import com.atech.core.model.HomeUpdate
import com.atech.domus.DomusApp
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class MoneyState(
    val settings: BillingSettings = BillingSettings(),
    val loaded: Boolean = false,
    val saving: Boolean = false,
    val savedAt: Long = 0L,
)

/** Edits the home's synced money/tariff settings (currency, rate, billing cycle). */
class MoneySettingsViewModel(app: Application) : AndroidViewModel(app) {
    private val core = (app as DomusApp).core

    private val _state = MutableStateFlow(MoneyState())
    val state: StateFlow<MoneyState> = _state.asStateFlow()

    private var homeId: String? = null

    init { load() }

    fun load() {
        viewModelScope.launch {
            val home = (core.homes.list() as? DomusResult.Success)?.data?.firstOrNull() ?: return@launch
            homeId = home.id
            _state.update {
                it.copy(settings = home.billing_settings ?: BillingSettings(), loaded = true)
            }
        }
    }

    fun edit(transform: (BillingSettings) -> BillingSettings) {
        _state.update { it.copy(settings = transform(it.settings)) }
    }

    fun save() {
        val id = homeId ?: return
        _state.update { it.copy(saving = true) }
        viewModelScope.launch {
            val res = core.homes.update(id, HomeUpdate(billing_settings = _state.value.settings))
            _state.update {
                it.copy(
                    saving = false,
                    settings = (res as? DomusResult.Success)?.data?.billing_settings ?: it.settings,
                    savedAt = if (res is DomusResult.Success) System.currentTimeMillis() else it.savedAt,
                )
            }
        }
    }
}
