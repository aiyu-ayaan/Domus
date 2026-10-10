package com.aiyu.domus.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CoreTest {
    @Test
    fun updateIsTheNewestReleaseOnTheChannelWithAnApk() {
        fun release(tag: String, apk: Boolean = true) =
            """{"tag_name":"v$tag","assets":[${if (apk) """{"browser_download_url":"https://x/Docus-$tag.apk"}""" else ""}]}"""
        val releases = "[" + listOf(release("0.0.2-alpha.1"), release("0.0.1"), release("0.0.1-beta.2"), release("0.0.3", apk = false)).joinToString(",") + "]"
        assertEquals("0.0.2-alpha.1", Updates.pick(releases, "0.0.1-alpha.1", UpdateChannel.ALPHA)?.version)
        // Beta takes the stable release too; the alpha is not for it, and 0.0.3 has no APK.
        assertEquals(AppUpdate("0.0.1", "https://x/Docus-0.0.1.apk"), Updates.pick(releases, "0.0.1-beta.2", UpdateChannel.BETA))
        assertNull(Updates.pick(releases, "0.0.1", UpdateChannel.STABLE))
        assertNull(Updates.pick(releases, "0.0.0-dev", UpdateChannel.ALPHA))
        assertEquals(UpdateChannel.ALPHA, Updates.channelOf("0.0.1-alpha.1"))
        assertEquals(UpdateChannel.STABLE, Updates.channelOf("1.2.3"))
    }

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

    @Test
    fun whiteSettingMapsToWarmAndCoolLight() {
        assertEquals(2000, whiteKelvin(0))
        assertEquals(6500, whiteKelvin(100))
        // Warm light has no blue to speak of; cool light is nearly white (the web app's #FFF9FA at 6500 K).
        assertEquals(0xFF, kelvinRgb(2000) shr 16)
        assertEquals(true, (kelvinRgb(2000) and 0xFF) < 40)
        assertEquals(true, (kelvinRgb(6500) and 0xFF) >= 250)
    }
}
