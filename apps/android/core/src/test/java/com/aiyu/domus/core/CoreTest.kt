package com.aiyu.domus.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CoreTest {
    @Test
    fun serverUrlIsAlwaysHttps() {
        assertEquals("https://192.168.1.10:8443", normalizeServerUrl(" 192.168.1.10 "))
        assertEquals("https://192.168.1.10:9000", normalizeServerUrl("192.168.1.10:9000/"))
        assertEquals("https://home.example.com", normalizeServerUrl("home.example.com"))
        assertEquals("https://home.example.com:8443", normalizeServerUrl("https://home.example.com:8443/api/v1"))
        assertNull(normalizeServerUrl("http://192.168.1.10:8443"))
        assertNull(normalizeServerUrl("ftp://home.example.com"))
        assertNull(normalizeServerUrl("  "))
    }

    @Test
    fun beaconReplyBecomesAServer() {
        val reply = """{"service":"domus","name":"attic","port":8443,"tls":true,"version":"0.1.0"}"""
        assertEquals(FoundServer("attic", "https://192.168.1.7:8443"), ServerDiscovery.parseReply(reply, "192.168.1.7"))
        assertNull(ServerDiscovery.parseReply(reply.replace("true", "false"), "192.168.1.7"))
        assertNull(ServerDiscovery.parseReply("""{"service":"printer","port":8443,"tls":true}""", "192.168.1.7"))
        assertNull(ServerDiscovery.parseReply("not json", "192.168.1.7"))
    }

    @Test
    fun commandIsAppliedOptimistically() {
        val lamp = Device("1", "Lamp", state = DeviceState(isOn = false, brightness = 40))
        val after = lamp.applying(DeviceCommand(isOn = true))
        assertEquals(true, after.state.isOn)
        assertEquals(40, after.state.brightness)
    }

    @Test
    fun energyReadsLikeTheWebApp() {
        java.util.Locale.setDefault(java.util.Locale.US)
        assertEquals("1.5 kW", formatWatts(1500.0))
        assertEquals("0 W", formatWatts(0.01))
        assertEquals("—", formatWatts(null))
        assertEquals("250 Wh", formatKwh(0.25))
        assertEquals(AirLevel.MODERATE, airLevel(40f))
    }
}
