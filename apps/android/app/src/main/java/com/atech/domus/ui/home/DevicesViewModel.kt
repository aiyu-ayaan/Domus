package com.atech.domus.ui.home

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.atech.core.common.DomusResult
import com.atech.core.model.Device
import com.atech.core.model.DeviceType
import com.atech.core.realtime.DomusEventType
import com.atech.domus.DomusApp
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonPrimitive

/** A device plus its resolved on/off state for the UI. */
data class DeviceUi(
    val device: Device,
    val isOn: Boolean?,      // null = unknown / not controllable
    val busy: Boolean = false,
) {
    val controllable: Boolean
        get() = device.device_type in CONTROLLABLE

    companion object {
        val CONTROLLABLE = setOf(DeviceType.LIGHT, DeviceType.PLUG, DeviceType.SWITCH, DeviceType.FAN)
    }
}

sealed interface DevicesState {
    data object Loading : DevicesState
    data class Error(val message: String) : DevicesState
    data class Empty(val homeName: String?) : DevicesState
    data class Content(
        val homeName: String,
        val devices: List<DeviceUi>,
        val refreshing: Boolean = false,
    ) : DevicesState {
        val onlineCount: Int get() = devices.count { it.device.online }
        val onCount: Int get() = devices.count { it.isOn == true }
    }
}

/** Shared by the Dashboard (overview) and Devices (list) tabs; keeps device state live. */
class DevicesViewModel(app: Application) : AndroidViewModel(app) {
    private val core = (app as DomusApp).core

    private val _state = MutableStateFlow<DevicesState>(DevicesState.Loading)
    val state: StateFlow<DevicesState> = _state.asStateFlow()

    init {
        load()
        observeRealtime()
    }

    fun load(isRefresh: Boolean = false) {
        if (isRefresh) {
            _state.update { if (it is DevicesState.Content) it.copy(refreshing = true) else it }
        } else {
            _state.value = DevicesState.Loading
        }
        viewModelScope.launch {
            when (val homes = core.homes.list()) {
                is DomusResult.Failure -> _state.value = DevicesState.Error(homes.error.message)
                is DomusResult.Success -> {
                    val home = homes.data.firstOrNull()
                    if (home == null) {
                        _state.value = DevicesState.Empty(null)
                        return@launch
                    }
                    when (val devices = core.devices.list(homeId = home.id, limit = 200)) {
                        is DomusResult.Failure -> _state.value = DevicesState.Error(devices.error.message)
                        is DomusResult.Success -> {
                            val items = devices.data.items
                            if (items.isEmpty()) {
                                _state.value = DevicesState.Empty(home.name)
                            } else {
                                _state.value = DevicesState.Content(home.name, resolveStates(items))
                            }
                        }
                    }
                }
            }
        }
    }

    private suspend fun resolveStates(devices: List<Device>): List<DeviceUi> = coroutineScope {
        devices.map { device ->
            async {
                val controllable = device.device_type in DeviceUi.CONTROLLABLE
                val isOn = if (controllable) {
                    (core.devices.state(device.id) as? DomusResult.Success)
                        ?.data?.state?.equals("on", ignoreCase = true)
                } else null
                DeviceUi(device, isOn)
            }
        }.awaitAll()
    }

    fun toggle(deviceId: String) {
        if (_state.value !is DevicesState.Content) return
        setBusy(deviceId, true)
        viewModelScope.launch {
            when (val result = core.devices.toggle(deviceId)) {
                is DomusResult.Success -> updateDevice(deviceId) {
                    it.copy(isOn = result.data.state.equals("on", ignoreCase = true), busy = false)
                }
                is DomusResult.Failure -> setBusy(deviceId, false)
            }
        }
    }

    /** Reflect device state/online changes pushed over the WebSocket, live. */
    private fun observeRealtime() {
        viewModelScope.launch {
            core.realtime.events().collect { event ->
                val id = event.data["device_id"]?.jsonPrimitive?.content ?: return@collect
                when (event.type) {
                    DomusEventType.DEVICE_STATE_CHANGED -> {
                        val on = event.data["state"]?.jsonPrimitive?.content?.equals("on", ignoreCase = true)
                        updateDevice(id) { it.copy(isOn = on, busy = false) }
                    }
                    DomusEventType.DEVICE_ONLINE_CHANGED -> {
                        val online = event.data["online"]?.jsonPrimitive?.booleanOrNull ?: return@collect
                        updateDevice(id) { it.copy(device = it.device.copy(online = online)) }
                    }
                }
            }
        }
    }

    private fun setBusy(deviceId: String, busy: Boolean) =
        updateDevice(deviceId) { it.copy(busy = busy) }

    private inline fun updateDevice(deviceId: String, crossinline change: (DeviceUi) -> DeviceUi) {
        _state.update { s ->
            if (s !is DevicesState.Content) s
            else s.copy(devices = s.devices.map { if (it.device.id == deviceId) change(it) else it })
        }
    }
}
