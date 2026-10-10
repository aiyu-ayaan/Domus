package com.aiyu.domus.baselineprofile

import androidx.benchmark.macro.junit4.BaselineProfileRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Until
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Records what the app runs on a launch and on a walk through its tabs, so ART compiles that code at install
 * instead of interpreting it on the first runs. Run with `pnpm android:profile` (see PERFORMANCE.md), not the bare
 * Gradle task: that one uninstalls the app, and its session, when it ends.
 *
 * The app is installed over the one on the device and keeps its session: sign in on the device first, or the
 * walk finds no tabs and the profile covers the launch and connect screens only.
 */
@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {
    @get:Rule
    val rule = BaselineProfileRule()

    private val target = InstrumentationRegistry.getArguments().getString("targetAppId")
        ?: error("targetAppId not passed as an instrumentation argument")

    /** The launch alone: this is also the startup profile, which orders the dex file. */
    @Test
    fun startup() = rule.collect(target, includeInStartupProfile = true) {
        pressHome()
        startActivityAndWait()
    }

    @Test
    fun tabs() = rule.collect(target) {
        pressHome()
        startActivityAndWait()
        for (tab in listOf("Devices", "Scenes", "Analytics", "Settings", "Home")) {
            // Analytics is absent in a home that measures nothing; signed out, every tab is.
            device.wait(Until.findObject(By.desc(tab)), 3_000)?.click() ?: continue
            device.waitForIdle()
            val x = device.displayWidth / 2
            val (low, high) = device.displayHeight * 2 / 3 to device.displayHeight / 3
            device.swipe(x, low, x, high, 20)
            device.waitForIdle()
            device.swipe(x, high, x, low, 20) // back up: the tab pill tucks away while scrolling down
            device.waitForIdle()
        }
    }
}
