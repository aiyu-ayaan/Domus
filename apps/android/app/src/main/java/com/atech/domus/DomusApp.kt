package com.atech.domus

import android.app.Application
import android.content.pm.ApplicationInfo
import com.atech.core.DomusCore

/**
 * Owns the single [DomusCore] instance for the process. Screens/ViewModels reach it
 * via `(application as DomusApp).core`. Backend URL is configured at runtime through
 * `core.setBaseUrl(...)` from the settings UI — nothing is hardcoded.
 */
class DomusApp : Application() {

    lateinit var core: DomusCore
        private set

    override fun onCreate() {
        super.onCreate()
        val debuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        core = DomusCore.create(
            context = this,
            enableLogging = debuggable,
        )
    }
}
