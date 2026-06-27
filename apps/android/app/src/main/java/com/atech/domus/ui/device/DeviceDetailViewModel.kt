package com.atech.domus.ui.device

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.atech.core.common.DomusResult
import com.atech.core.model.Device
import com.atech.core.model.DeviceState
import com.atech.core.model.DeviceUpdate
import com.atech.core.model.EnergySummary
import com.atech.core.model.Room
import com.atech.core.realtime.DomusEventType
import com.atech.domus.DomusApp
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*

data class DeviceDetailUiState(
    val device: Device? = null,
    val deviceState: DeviceState? = null,
    val history: List<DeviceState> = emptyList(),
    val rooms: List<Room> = emptyList(),
    val energySummary: EnergySummary? = null,
    val isLoading: Boolean = true,
    val isSaving: Boolean = false,
    val isDeleting: Boolean = false,
    val errorMessage: String? = null
)

class DeviceDetailViewModel(app: Application) : AndroidViewModel(app) {
    private val core = (app as DomusApp).core

    private val _uiState = MutableStateFlow(DeviceDetailUiState())
    val uiState: StateFlow<DeviceDetailUiState> = _uiState.asStateFlow()

    private var deviceId: String? = null

    fun loadDevice(id: String) {
        if (deviceId == id) return
        deviceId = id
        _uiState.update { it.copy(isLoading = true, errorMessage = null) }
        
        viewModelScope.launch {
            when (val devResult = core.devices.get(id)) {
                is DomusResult.Failure -> {
                    _uiState.update { it.copy(isLoading = false, errorMessage = devResult.error.message) }
                }
                is DomusResult.Success -> {
                    val device = devResult.data
                    
                    val stateResult = core.devices.state(id)
                    val historyResult = core.devices.history(id, limit = 50)
                    val roomsResult = core.rooms.list(homeId = device.home_id)
                    
                    val energyResult = if (device.device_type.name.equals("plug", ignoreCase = true)) {
                        core.energy.summary(homeId = device.home_id, hours = 24)
                    } else null

                    val resolvedState = (stateResult as? DomusResult.Success)?.data
                    val resolvedHistory = (historyResult as? DomusResult.Success)?.data ?: emptyList()
                    val resolvedRooms = (roomsResult as? DomusResult.Success)?.data ?: emptyList()
                    val resolvedEnergy = (energyResult as? DomusResult.Success)?.data

                    _uiState.update {
                        it.copy(
                            device = device,
                            deviceState = resolvedState,
                            history = resolvedHistory,
                            rooms = resolvedRooms,
                            energySummary = resolvedEnergy,
                            isLoading = false
                        )
                    }
                }
            }
        }
        observeRealtimeEvents()
    }

    private fun observeRealtimeEvents() {
        val id = deviceId ?: return
        viewModelScope.launch {
            core.realtime.events().collect { event ->
                val eventDeviceId = event.data["device_id"]?.jsonPrimitive?.content ?: return@collect
                if (eventDeviceId != id) return@collect

                when (event.type) {
                    DomusEventType.DEVICE_STATE_CHANGED -> {
                        val stateStr = event.data["state"]?.jsonPrimitive?.content ?: return@collect
                        val attributesObj = event.data["attributes"]?.jsonObject ?: JsonObject(emptyMap())
                        val formatter = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply {
                            timeZone = java.util.TimeZone.getTimeZone("UTC")
                        }
                        val createdAtStr = formatter.format(java.util.Date())
                        val devState = DeviceState(
                            id = "",
                            device_id = id,
                            state = stateStr,
                            attributes = attributesObj,
                            created_at = createdAtStr
                        )
                        _uiState.update { s ->
                            val exists = s.history.any { it.id == devState.id || it.created_at == devState.created_at }
                            val newHistory = if (exists) s.history else (listOf(devState) + s.history)
                            s.copy(
                                deviceState = devState,
                                history = newHistory.take(100)
                            )
                        }
                    }
                    DomusEventType.DEVICE_ONLINE_CHANGED -> {
                        val online = event.data["online"]?.jsonPrimitive?.booleanOrNull ?: return@collect
                        _uiState.update { s ->
                            s.device?.let { dev ->
                                s.copy(device = dev.copy(online = online))
                            } ?: s
                        }
                    }
                }
            }
        }
    }

    fun togglePower() {
        val id = deviceId ?: return
        viewModelScope.launch {
            val result = core.devices.toggle(id)
            if (result is DomusResult.Success) {
                _uiState.update { s ->
                    s.copy(deviceState = s.deviceState?.copy(state = result.data.state) ?: result.data)
                }
            }
        }
    }

    fun setAttribute(key: String, value: JsonElement) {
        val id = deviceId ?: return
        viewModelScope.launch {
            val attributes = buildJsonObject {
                put(key, value)
            }
            val result = core.devices.setAttributes(id, attributes)
            if (result is DomusResult.Success) {
                _uiState.update { s ->
                    s.copy(deviceState = result.data)
                }
            }
        }
    }

    fun setAttributes(attrs: JsonObject) {
        val id = deviceId ?: return
        viewModelScope.launch {
            val result = core.devices.setAttributes(id, attrs)
            if (result is DomusResult.Success) {
                _uiState.update { s ->
                    s.copy(deviceState = result.data)
                }
            }
        }
    }

    fun updateSettings(name: String, roomId: String?, onSuccess: () -> Unit) {
        val id = deviceId ?: return
        _uiState.update { it.copy(isSaving = true) }
        viewModelScope.launch {
            val updateData = DeviceUpdate(
                name = name,
                room_id = if (roomId == "none" || roomId.isNullOrBlank()) null else roomId
            )
            when (val result = core.devices.update(id, updateData)) {
                is DomusResult.Success -> {
                    _uiState.update { s ->
                        s.copy(device = result.data, isSaving = false)
                    }
                    onSuccess()
                }
                is DomusResult.Failure -> {
                    _uiState.update { it.copy(isSaving = false, errorMessage = result.error.message) }
                }
            }
        }
    }

    fun deleteDevice(onSuccess: () -> Unit) {
        val id = deviceId ?: return
        _uiState.update { it.copy(isDeleting = true) }
        viewModelScope.launch {
            when (val result = core.devices.delete(id)) {
                is DomusResult.Success -> {
                    _uiState.update { it.copy(isDeleting = false) }
                    onSuccess()
                }
                is DomusResult.Failure -> {
                    _uiState.update { it.copy(isDeleting = false, errorMessage = result.error.message) }
                }
            }
        }
    }
}
