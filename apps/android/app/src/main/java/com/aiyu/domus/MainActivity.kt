package com.aiyu.domus

import android.app.Application
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.view.ViewTreeObserver
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.Crossfade
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aiyu.domus.core.DomusRepository
import com.aiyu.domus.core.Session
import com.aiyu.domus.ui.theme.DomusTheme

class DomusApp : Application() {
    val repository by lazy { DomusRepository(this) }
}

val LocalRepository = staticCompositionLocalOf<DomusRepository> { error("No repository") }

/** `drawable/splash_mark` runs 980ms from process start; onCreate is ~200ms in, so the first frame waits the rest. */
private const val SPLASH_MS = 780L

class MainActivity : ComponentActivity() {
    private val repository get() = (application as DomusApp).repository

    /** Android 12+ drops the system splash at the first drawn frame, so hold that frame on a cold start. */
    private fun holdSplash(coldStart: Boolean) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || !coldStart) return
        val until = SystemClock.uptimeMillis() + SPLASH_MS
        val content = findViewById<View>(android.R.id.content)
        content.viewTreeObserver.addOnPreDrawListener(object : ViewTreeObserver.OnPreDrawListener {
            override fun onPreDraw(): Boolean {
                if (SystemClock.uptimeMillis() < until) return false
                content.viewTreeObserver.removeOnPreDrawListener(this)
                return true
            }
        })
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        holdSplash(savedInstanceState == null)
        setContent {
            val appearance by repository.appearance.collectAsStateWithLifecycle()
            val dark = when (appearance.theme) {
                "light" -> false
                "dark" -> true
                else -> isSystemInDarkTheme()
            }
            // System bar icons follow the in-app theme, not only the system setting.
            DisposableEffect(dark) {
                enableEdgeToEdge(
                    statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT) { dark },
                    navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT) { dark },
                )
                onDispose { }
            }
            DomusTheme(dark = dark, dynamicColor = appearance.dynamicColor) {
                // Surface (not a bare Box) so LocalContentColor is onSurface for every screen.
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
                    CompositionLocalProvider(LocalRepository provides repository) { DomusRoot() }
                }
            }
        }
    }

    // Live events run only while the app is on screen.
    override fun onStart() {
        super.onStart()
        repository.onForeground()
        AlertsService.apply(this) // the app is in front: the one moment a foreground service may always start
    }

    override fun onStop() {
        super.onStop()
        if (!isChangingConfigurations) repository.onBackground()
    }
}

/** Connect -> sign in -> home, driven by the session. Steps swap with a fade-through. */
@Composable
private fun DomusRoot() {
    val session by LocalRepository.current.session.collectAsStateWithLifecycle()
    val motion = MaterialTheme.motionScheme
    AnimatedContent(
        targetState = session,
        contentKey = { it::class },
        transitionSpec = {
            (fadeIn(motion.defaultEffectsSpec()) + scaleIn(motion.defaultSpatialSpec(), initialScale = 0.94f))
                .togetherWith(fadeOut(motion.fastEffectsSpec()))
        },
        label = "session",
    ) { s ->
        when (s) {
            Session.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { LoadingIndicator() }
            Session.NoServer -> {
                val onboarded by LocalRepository.current.onboarded.collectAsStateWithLifecycle()
                Crossfade(onboarded, label = "intro") { if (it) ConnectScreen() else OnboardingScreen() }
            }
            is Session.Unreachable -> UnreachableScreen(s)
            is Session.SignedOut -> AuthScreen(s)
            is Session.SignedIn -> MainScreen(s)
        }
    }
}
