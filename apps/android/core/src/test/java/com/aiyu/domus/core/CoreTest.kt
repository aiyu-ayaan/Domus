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

    @Test
    fun screenColorFollowsTheStyle() {
        val grey = 0xFF808080.toInt()
        val red = 0xFFFF0000.toInt()
        // 3x1 frame: two grey pixels, one red.
        val frame = intArrayOf(grey, grey, red)
        assertEquals("#ff0000", screenColor(frame, 3, 1, "vivid", false).hex)
        assertEquals("#808080", screenColor(frame, 3, 1, "dominant", false).hex)
        assertEquals("#aa5555", screenColor(frame, 3, 1, "average", false).hex)
        assertEquals(10, syncBrightness(0f, 10, 100))
        assertEquals(100, syncBrightness(1f, 10, 100))
    }

    @Test
    fun edgesIgnoreTheMiddleOfTheScreen() {
        val blue = 0xFF0000FF.toInt()
        val white = 0xFFFFFFFF.toInt()
        // 5x5: blue border, white center.
        val frame = IntArray(25) { i -> if (i % 5 in 1..3 && i / 5 in 1..3) white else blue }
        assertEquals("#0000ff", screenColor(frame, 5, 5, "average", true).hex)
    }
}
