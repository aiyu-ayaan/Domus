package com.atech.core

import com.atech.core.model.ActionType
import com.atech.core.model.DeviceType
import com.atech.core.model.IntegrationType
import com.atech.core.model.Role
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

/** Pure-JVM checks for the two bits of non-trivial logic: URL derivation + enum wire names. */
class CoreContractTest {

    @Test
    fun config_derives_api_and_ws_urls() {
        val c = DomusConfig("http://10.0.2.2:8000/")
        assertEquals("http://10.0.2.2:8000", c.origin)
        assertEquals("http://10.0.2.2:8000/api/v1", c.apiBase)
        assertEquals("ws://10.0.2.2:8000/ws", c.wsUrl)
    }

    @Test
    fun https_maps_to_wss() {
        assertEquals("wss://domus.example.com/ws", DomusConfig("https://domus.example.com").wsUrl)
    }

    @Test
    fun enums_serialize_to_backend_wire_values() {
        val json = Json
        assertEquals("\"light\"", json.encodeToString(DeviceType.serializer(), DeviceType.LIGHT))
        assertEquals("\"philips_hue\"", json.encodeToString(IntegrationType.serializer(), IntegrationType.PHILIPS_HUE))
        assertEquals("\"owner\"", json.encodeToString(Role.serializer(), Role.OWNER))
        assertEquals("\"device.turn_on\"", json.encodeToString(ActionType.serializer(), ActionType.TURN_ON))
    }

    @Test
    fun device_type_query_param_matches_wire_value() {
        // DeviceRepository passes deviceType.name.lowercase() as the filter — verify it stays in sync.
        for (t in DeviceType.entries) {
            val wire = Json.encodeToString(DeviceType.serializer(), t).trim('"')
            assertEquals(wire, t.name.lowercase())
        }
    }
}
