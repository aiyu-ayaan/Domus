package com.atech.domus.ui.home

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.atech.core.common.DomusResult
import com.atech.core.model.Automation
import com.atech.core.model.AutomationUpdate
import com.atech.core.model.BillingSettings
import com.atech.core.model.Device
import com.atech.core.model.DeviceType
import com.atech.core.model.EnergySummary
import com.atech.core.model.Notification
import com.atech.core.model.NotificationType
import com.atech.core.model.Scene
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
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

sealed interface DashboardState {
    data object Loading : DashboardState
    data class Error(val message: String) : DashboardState
    data class Content(
        val homeName: String,
        val devices: List<DeviceUi> = emptyList(),
        val scenes: List<Scene> = emptyList(),
        val automations: List<Automation> = emptyList(),
        val notifications: List<Notification> = emptyList(),
        val energySummary: EnergySummary? = null,
        val billingSettings: BillingSettings = BillingSettings(),

        // UI Action States
        val refreshing: Boolean = false,
        val activatingScenes: Set<String> = emptySet(),
        val triggeringAutomations: Set<String> = emptySet(),
        val togglingAutomations: Set<String> = emptySet(),
        val sectionVisibility: Map<String, Boolean> = defaultSectionVisibility
    ) : DashboardState {
        val totalDevices: Int get() = devices.size
        val onlineDevices: Int get() = devices.count { it.device.online }
        val offlineDevices: Int get() = totalDevices - onlineDevices
        val activeDeviceStates: Int get() = devices.count { it.isOn == true }
        val activeAutomations: Int get() = automations.count { it.enabled }
        val securityAlertsCount: Int get() = notifications.count { it.type == NotificationType.SECURITY_ALERT && !it.read }
        val uptimeScore: Int get() = if (totalDevices == 0) 100 else (onlineDevices * 100) / totalDevices
        val totalPowerW: Double get() {
            return devices.sumOf { dev ->
                val watts = dev.powerW
                    ?: (if (dev.isOn == true && dev.device.device_type == DeviceType.LIGHT) 12.0 else 0.0)
                if (dev.device.online && watts > 0.0) watts else 0.0
            }
        }
        val totalKwh: Double get() = energySummary?.total_kwh ?: 0.0
    }

    companion object {
        val defaultSectionVisibility = mapOf(
            "healthHeader" to true,
            "systemTiles" to true,
            "livePowerDraw" to true,
            "electricity" to true,
            "savedScenes" to true,
            "automationStack" to true
        )
    }
}

class DashboardViewModel(app: Application) : AndroidViewModel(app) {
    private val core = (app as DomusApp).core

    private val _state = MutableStateFlow<DashboardState>(DashboardState.Loading)
    val state: StateFlow<DashboardState> = _state.asStateFlow()

    private val _isSettingsOpen = MutableStateFlow(false)
    val isSettingsOpen = _isSettingsOpen.asStateFlow()

    fun setSettingsOpen(open: Boolean) {
        _isSettingsOpen.value = open
    }

    init {
        loadAll()
        observeRealtime()
    }

    fun loadAll(isRefresh: Boolean = false) {
        if (isRefresh) {
            _state.update { if (it is DashboardState.Content) it.copy(refreshing = true) else it }
        } else {
            _state.value = DashboardState.Loading
        }

        viewModelScope.launch {
            when (val homes = core.homes.list()) {
                is DomusResult.Failure -> _state.value = DashboardState.Error(homes.error.message)
                is DomusResult.Success -> {
                    val home = homes.data.firstOrNull()
                    if (home == null) {
                        _state.value = DashboardState.Error("No home setup yet")
                        return@launch
                    }

                    coroutineScope {
                        val devicesDeferred = async { core.devices.list(homeId = home.id, limit = 200) }
                        val scenesDeferred = async { core.scenes.list(homeId = home.id) }
                        val automationsDeferred = async { core.automations.list(homeId = home.id) }
                        val notificationsDeferred = async { core.notifications.list(homeId = home.id, limit = 50) }
                        val energyDeferred = async { core.energy.summary(hours = 24) }

                        val devicesRes = devicesDeferred.await()
                        val scenesRes = scenesDeferred.await()
                        val automationsRes = automationsDeferred.await()
                        val notificationsRes = notificationsDeferred.await()
                        val energyRes = energyDeferred.await()

                        if (devicesRes is DomusResult.Success &&
                            scenesRes is DomusResult.Success &&
                            automationsRes is DomusResult.Success &&
                            notificationsRes is DomusResult.Success
                        ) {
                            val resolvedDevices = resolveStates(devicesRes.data.items)
                            val energySummary = (energyRes as? DomusResult.Success)?.data

                            _state.value = DashboardState.Content(
                                homeName = home.name,
                                devices = resolvedDevices,
                                scenes = scenesRes.data,
                                automations = automationsRes.data,
                                notifications = notificationsRes.data,
                                energySummary = energySummary,
                                billingSettings = home.billing_settings ?: BillingSettings(),
                                refreshing = false
                            )
                        } else {
                            val errorMsg = listOfNotNull(
                                (devicesRes as? DomusResult.Failure)?.error?.message,
                                (scenesRes as? DomusResult.Failure)?.error?.message,
                                (automationsRes as? DomusResult.Failure)?.error?.message,
                                (notificationsRes as? DomusResult.Failure)?.error?.message
                            ).firstOrNull() ?: "Failed to load dashboard data"

                            _state.value = DashboardState.Error(errorMsg)
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
                val st = (core.devices.state(device.id) as? DomusResult.Success)?.data
                val isOn = if (controllable) st?.state?.equals("on", ignoreCase = true) else null
                DeviceUi(device, isOn, powerW = powerOf(st?.attributes))
            }
        }.awaitAll()
    }

    fun toggleDevice(deviceId: String) {
        val s = _state.value as? DashboardState.Content ?: return
        updateDeviceBusy(deviceId, true)
        viewModelScope.launch {
            when (val result = core.devices.toggle(deviceId)) {
                is DomusResult.Success -> {
                    updateDevice(deviceId) {
                        it.copy(isOn = result.data.state.equals("on", ignoreCase = true), busy = false)
                    }
                    // Reload energy summary after action
                    reloadEnergy()
                }
                is DomusResult.Failure -> updateDeviceBusy(deviceId, false)
            }
        }
    }

    fun activateScene(sceneId: String) {
        val s = _state.value as? DashboardState.Content ?: return
        _state.update { state ->
            if (state is DashboardState.Content) {
                state.copy(activatingScenes = state.activatingScenes + sceneId)
            } else state
        }
        viewModelScope.launch {
            core.scenes.activate(sceneId)
            _state.update { state ->
                if (state is DashboardState.Content) {
                    state.copy(activatingScenes = state.activatingScenes - sceneId)
                } else state
            }
            // Reload devices state
            reloadDevices()
        }
    }

    fun toggleAutomation(automationId: String, enabled: Boolean) {
        val s = _state.value as? DashboardState.Content ?: return
        _state.update { state ->
            if (state is DashboardState.Content) {
                state.copy(togglingAutomations = state.togglingAutomations + automationId)
            } else state
        }
        viewModelScope.launch {
            when (core.automations.update(automationId, AutomationUpdate(enabled = enabled))) {
                is DomusResult.Success -> {
                    loadAutomations()
                }
                is DomusResult.Failure -> {}
            }
            _state.update { state ->
                if (state is DashboardState.Content) {
                    state.copy(togglingAutomations = state.togglingAutomations - automationId)
                } else state
            }
        }
    }

    fun triggerAutomation(automationId: String) {
        val s = _state.value as? DashboardState.Content ?: return
        _state.update { state ->
            if (state is DashboardState.Content) {
                state.copy(triggeringAutomations = state.triggeringAutomations + automationId)
            } else state
        }
        viewModelScope.launch {
            core.automations.trigger(automationId)
            _state.update { state ->
                if (state is DashboardState.Content) {
                    state.copy(triggeringAutomations = state.triggeringAutomations - automationId)
                } else state
            }
            // Reload devices state
            reloadDevices()
        }
    }

    fun markNotificationRead(notificationId: String) {
        viewModelScope.launch {
            if (core.notifications.markRead(notificationId) is DomusResult.Success) {
                loadNotifications()
            }
        }
    }

    fun toggleSectionVisibility(sectionKey: String) {
        _state.update { s ->
            if (s !is DashboardState.Content) s
            else {
                val nextVisibility = s.sectionVisibility.toMutableMap()
                nextVisibility[sectionKey] = !(nextVisibility[sectionKey] ?: true)
                s.copy(sectionVisibility = nextVisibility)
            }
        }
    }

    fun resetSectionVisibility() {
        _state.update { s ->
            if (s !is DashboardState.Content) s
            else s.copy(sectionVisibility = DashboardState.defaultSectionVisibility)
        }
    }

    private fun reloadDevices() {
        viewModelScope.launch {
            val content = _state.value as? DashboardState.Content ?: return@launch
            val rawDevices = content.devices.map { it.device }
            val resolved = resolveStates(rawDevices)
            _state.update { if (it is DashboardState.Content) it.copy(devices = resolved) else it }
        }
    }

    private fun reloadEnergy() {
        viewModelScope.launch {
            val energyRes = core.energy.summary(hours = 24)
            if (energyRes is DomusResult.Success) {
                _state.update { if (it is DashboardState.Content) it.copy(energySummary = energyRes.data) else it }
            }
        }
    }

    private fun loadAutomations() {
        viewModelScope.launch {
            val content = _state.value as? DashboardState.Content ?: return@launch
            val homes = core.homes.list()
            val homeId = (homes as? DomusResult.Success)?.data?.firstOrNull()?.id ?: return@launch
            val automationsRes = core.automations.list(homeId = homeId)
            if (automationsRes is DomusResult.Success) {
                _state.update { if (it is DashboardState.Content) it.copy(automations = automationsRes.data) else it }
            }
        }
    }

    private fun loadNotifications() {
        viewModelScope.launch {
            val content = _state.value as? DashboardState.Content ?: return@launch
            val homes = core.homes.list()
            val homeId = (homes as? DomusResult.Success)?.data?.firstOrNull()?.id ?: return@launch
            val notificationsRes = core.notifications.list(homeId = homeId, limit = 50)
            if (notificationsRes is DomusResult.Success) {
                _state.update { if (it is DashboardState.Content) it.copy(notifications = notificationsRes.data) else it }
            }
        }
    }

    private fun observeRealtime() {
        viewModelScope.launch {
            core.realtime.events().collect { event ->
                val id = event.data["device_id"]?.jsonPrimitive?.content ?: ""
                when (event.type) {
                    DomusEventType.DEVICE_STATE_CHANGED -> {
                        val on = event.data["state"]?.jsonPrimitive?.content?.equals("on", ignoreCase = true)
                        val power = powerOf(event.data["attributes"] as? kotlinx.serialization.json.JsonObject)
                        if (id.isNotEmpty()) {
                            updateDevice(id) { it.copy(isOn = on, powerW = power ?: it.powerW) }
                        }
                        reloadEnergy()
                    }
                    DomusEventType.DEVICE_ONLINE_CHANGED -> {
                        val online = event.data["online"]?.jsonPrimitive?.booleanOrNull ?: return@collect
                        if (id.isNotEmpty()) {
                            updateDevice(id) { it.copy(device = it.device.copy(online = online)) }
                        }
                    }
                    DomusEventType.NOTIFICATION_CREATED -> {
                        loadNotifications()
                    }
                }
            }
        }
    }

    /** Live watts from a device state's attributes, if it's a metered device. */
    private fun powerOf(attrs: kotlinx.serialization.json.JsonObject?): Double? {
        if (attrs == null) return null
        val w = (attrs["power_w"] ?: attrs["current_consumption"])?.jsonPrimitive?.doubleOrNull
        return w?.takeIf { it > 0.0 }
    }

    private fun updateDeviceBusy(deviceId: String, busy: Boolean) {
        updateDevice(deviceId) { it.copy(busy = busy) }
    }

    private inline fun updateDevice(deviceId: String, crossinline change: (DeviceUi) -> DeviceUi) {
        _state.update { s ->
            if (s !is DashboardState.Content) s
            else s.copy(devices = s.devices.map { if (it.device.id == deviceId) change(it) else it })
        }
    }
}
