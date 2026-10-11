package com.aiyu.domus.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CoreTest {
    @Test
    fun updateIsTheNewestReleaseOnTheChannelWithAnApk() {
        fun release(tag: String, apk: Boolean = true) =
            """{"tag_name":"v$tag","assets":[${if (apk) """{"browser_download_url":"https://x/Domus-$tag.apk"}""" else ""}]}"""
        val releases = "[" + listOf(release("0.0.2-alpha.1"), release("0.0.1"), release("0.0.1-beta.2"), release("0.0.3", apk = false)).joinToString(",") + "]"
        assertEquals("0.0.2-alpha.1", Updates.pick(releases, "0.0.1-alpha.1", UpdateChannel.ALPHA)?.version)
        // Beta takes the stable release too; the alpha is not for it, and 0.0.3 has no APK.
        assertEquals(AppUpdate("0.0.1", "https://x/Domus-0.0.1.apk"), Updates.pick(releases, "0.0.1-beta.2", UpdateChannel.BETA))
        assertNull(Updates.pick(releases, "0.0.1", UpdateChannel.STABLE))
        assertNull(Updates.pick(releases, "0.0.0-dev", UpdateChannel.ALPHA))
        assertEquals(UpdateChannel.ALPHA, Updates.channelOf("0.0.1-alpha.1"))
        assertEquals(UpdateChannel.STABLE, Updates.channelOf("1.2.3"))
    }

    @Test
    fun releaseNotesComeWithTheUpdateAndForTheInstalledVersion() {
        val releases = """[
            {"tag_name":"v0.0.2","body":"## New\n- Sunrise triggers","assets":[{"browser_download_url":"https://x/Domus-0.0.2.apk"}]},
            {"tag_name":"v0.0.1","body":"First release","assets":[]},
            {"tag_name":"v0.0.1-beta.1","body":null,"assets":[]}
        ]"""
        assertEquals("## New\n- Sunrise triggers", Updates.pick(releases, "0.0.1", UpdateChannel.STABLE)?.notes)
        assertEquals("First release", Updates.notesOf(releases, "0.0.1"))
        // A dev build shows the notes of the release it was built from.
        assertEquals("First release", Updates.notesOf(releases, "0.0.1-dev"))
        assertNull(Updates.notesOf(releases, "0.0.1-beta.1"))
        assertNull(Updates.notesOf(releases, "9.9.9"))
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
        val india = java.time.ZoneId.of("Asia/Kolkata")
        assertEquals("11:05 PM", formatBucket("2026-10-11T23:05:00+05:30", "hour", is24Hour = false, india))
        assertEquals("11:05:10 PM", formatBucket("2026-10-11T23:05:10+05:30", "live", is24Hour = false, india))
        assertEquals("23:05", formatBucket("2026-10-11T23:05:00+05:30", "hour", is24Hour = true, india))
        assertEquals("11 PM – 12 AM", formatBucket("2026-10-11T23:00:00+05:30", "day", is24Hour = false, india))
        assertEquals("23:00 – 00:00", formatBucket("2026-10-11T23:00:00+05:30", "day", is24Hour = true, india))
        // A server in UTC: its 17:00 hour is 10:30 PM on a phone in India, never "5:00 PM".
        assertEquals("10:30 PM – 11:30 PM", formatBucket("2026-10-11T17:00:00Z", "day", is24Hour = false, india))
        assertEquals("Mon 12", formatBucket("2026-10-11T20:00:00Z", "week", is24Hour = false, india))
        assertEquals("Oct 11", formatBucket("2026-10-11T15:00:00+05:30", "month", is24Hour = false, india))
        assertEquals("7:00 AM", formatClockTime("07:00", is24Hour = false))
        assertEquals("10:00 PM", formatClockTime("22:00", is24Hour = false))
        assertEquals("22:00", formatClockTime("22:00", is24Hour = true))
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

    @Test
    fun xiaomiAccountKeepsEmailsAndCleansPhoneNumbers() {
        assertEquals("me@mail.com", xiaomiAccount("  me@mail.com "))
        assertEquals("123456789", xiaomiAccount("123456789"))
        assertEquals("+916268993859", xiaomiAccount("+91 62689-93859"))
        assertEquals("+916268993859", xiaomiAccount("+91 (626) 899 3859"))
        assertEquals("mi user 7", xiaomiAccount("mi user 7"))
    }

    @Test
    fun grantsFollowRoomsAndSingleDevices() {
        val lamp = Device("lamp", "Lamp", roomId = "bed")
        val fan = Device("fan", "Fan", roomId = "bed")
        val all = listOf(lamp, fan, Device("lock", "Lock"))
        val user = User("1", "kid", roomIds = listOf("bed"), deviceIds = listOf("lock"), viewOnlyDeviceIds = listOf("lock"))
        assertEquals(Grants(mapOf("bed" to "control"), mapOf("lock" to "view")), user.grants)
        // Edit comes back from the server's edit lists.
        assertEquals(Grants(mapOf("bed" to "edit"), mapOf("lock" to "view")), user.copy(editRoomIds = listOf("bed")).grants)
        // A device overrides its room; the room's own level needs no entry.
        val seeLamp = user.grants.withDevice(lamp, "view", all)
        assertEquals("view", seeLamp.levelOf(lamp))
        assertEquals("control", seeLamp.levelOf(fan))
        assertEquals(user.grants, seeLamp.withDevice(lamp, "control", all))
        // Taking one device out of a whole room keeps the rest as single devices.
        val noLamp = seeLamp.withDevice(lamp, "none", all)
        assertEquals(Grants(devices = mapOf("lock" to "view", "fan" to "control")), noLamp)
        // Setting the whole room clears the single levels in it.
        assertEquals(Grants(mapOf("bed" to "view"), mapOf("lock" to "view")), noLamp.withRoom("bed", "view", all))
        assertEquals("none", Grants().levelOf(lamp))
    }

    @Test
    fun handoverCarriesTheCodeOrTheFirstPassword() {
        val bea = User("1", "bea", generatedPassword = "abcd2345efgh")
        assertEquals(
            "Domus sign-in\nAddress: https://home\nUsername: bea\nPassword: abcd2345efgh\n\nYou will be asked to choose your own password the first time you sign in.",
            bea.handoverText("https://home", true),
        )
        val reset = User("1", "bea", resetCode = "12345678", resetAllowedUntil = "not a time").handoverText("https://home", true)
        assertEquals(true, reset.contains("Code: 1234 5678") && reset.endsWith("It works once."))
    }
}
