package com.aiyu.domus

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import com.aiyu.domus.core.Session
import com.aiyu.domus.core.SyncStream
import com.aiyu.domus.core.screenColor
import com.aiyu.domus.core.syncBrightness
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

private const val STATUS = "status" // quiet, ongoing: "listening", "Screen Sync is on"
private const val ALERTS = "alerts" // what the home reports

private fun Context.notifications() = getSystemService(NotificationManager::class.java).also {
    it.createNotificationChannel(NotificationChannel(STATUS, "Background activity", NotificationManager.IMPORTANCE_LOW))
    it.createNotificationChannel(NotificationChannel(ALERTS, "Home alerts", NotificationManager.IMPORTANCE_DEFAULT))
}

private fun Context.openApp(): PendingIntent =
    PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)

private fun Context.notification(channel: String, title: String, text: String?): Notification.Builder =
    Notification.Builder(this, channel).setSmallIcon(R.drawable.ic_stat_domus).setContentTitle(title).setContentText(text).setContentIntent(openApp())

private val Context.repository get() = (applicationContext as DomusApp).repository

/**
 * Keeps the server's event stream open while the app is closed and turns its notifications into system ones.
 * There is no cloud push service between a home server and the phone, so this is opt-in (Settings): it holds
 * one idle connection with a ping every 25 s.
 */
class AlertsService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    override fun onCreate() {
        super.onCreate()
        val manager = notifications()
        val status = notification(STATUS, "Domus is listening for alerts", null).setOngoing(true).build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, status, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE) else startForeground(1, status)
        repository.keepLive = true
        var next = 100
        scope.launch {
            repository.alerts.collect { (title, message) ->
                // On screen the same event is already a snackbar.
                if (!repository.foreground) manager.notify(next++, notification(ALERTS, title, message).setAutoCancel(true).build())
            }
        }
        // Nothing to listen to once signed out.
        scope.launch { repository.session.collect { if (it is Session.NoServer || it is Session.SignedOut) stopSelf() } }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int) = START_STICKY
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        repository.keepLive = false
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        /** Starts or stops the service to match the user's setting. */
        fun apply(context: Context) {
            val intent = Intent(context, AlertsService::class.java)
            if (context.repository.backgroundAlerts.value) context.startForegroundService(intent) else context.stopService(intent)
        }
    }
}

/** Brings background alerts back after a restart or an app update. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) = AlertsService.apply(context)
}

/**
 * Screen Sync from the phone: mirrors this screen at thumbnail size, picks its color a few times a second and
 * streams it to the scene's lights. Runs until the scene is switched off anywhere, the stream drops, or the
 * user ends screen sharing.
 */
class ScreenSyncService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var socket: SyncStream? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        notifications()
        val stop = PendingIntent.getService(this, 1, Intent(this, ScreenSyncService::class.java).setAction(STOP), PendingIntent.FLAG_IMMUTABLE)
        val status = notification(STATUS, "Screen Sync is on", "Your lights follow this screen")
            .setOngoing(true)
            .addAction(Notification.Action.Builder(null, "Stop", stop).build())
            .build()
        // Must be in the foreground, as mediaProjection, before the projection is taken.
        if (Build.VERSION.SDK_INT >= 29) startForeground(2, status, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION) else startForeground(2, status)

        val sceneId = intent?.getStringExtra(SCENE)
        @Suppress("DEPRECATION") val grant = intent?.getParcelableExtra<Intent>(GRANT)
        if (intent?.action == STOP || sceneId == null || grant == null || projection != null) {
            if (intent?.action == STOP || projection == null) stopSelf()
            return START_NOT_STICKY
        }
        val config = repository.scenes.value.firstOrNull { it.id == sceneId }?.config.orEmpty()
        fun text(key: String) = (config[key] as? JsonPrimitive)?.contentOrNull
        fun int(key: String, default: Int) = (config[key] as? JsonPrimitive)?.intOrNull ?: default
        val style = text("style") ?: "vivid"
        val edges = text("region") == "edges"
        val follow = (config["follow_brightness"] as? JsonPrimitive)?.booleanOrNull ?: true
        // 0 = jump to each new color, 100 = move a tenth of the way per frame.
        val step = 1f - int("smoothing", 40).coerceIn(0, 100) / 100f * 0.9f
        val pause = 1000L / int("fps", 10).coerceIn(1, 30)

        val projection = getSystemService(MediaProjectionManager::class.java).getMediaProjection(Activity.RESULT_OK, grant)
            ?: return START_NOT_STICKY.also { stopSelf() }
        this.projection = projection
        // The user can end sharing from the system UI.
        projection.registerCallback(object : MediaProjection.Callback() { override fun onStop() = stopSelf() }, Handler(Looper.getMainLooper()))
        val reader = ImageReader.newInstance(WIDTH, HEIGHT, PixelFormat.RGBA_8888, 2).also { this.reader = it }
        display = projection.createVirtualDisplay("domus-sync", WIDTH, HEIGHT, resources.displayMetrics.densityDpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.surface, null, null)
        socket = repository.sync(
            sceneId,
            onEvent = { event ->
                val type = (event["type"] as? JsonPrimitive)?.contentOrNull
                if (type == "stopped" || type == "error") stopSelf()
            },
            onClosed = { stopSelf() },
        ) ?: return START_NOT_STICKY.also { stopSelf() }

        scope.launch {
            val pixels = IntArray(WIDTH * HEIGHT)
            var have = false
            var rgb: FloatArray? = null
            var sent = ""
            while (isActive) {
                delay(pause)
                // A still screen produces no new image: keep easing toward the last one.
                reader.acquireLatestImage()?.use { image ->
                    val plane = image.planes[0]
                    val buffer = plane.buffer
                    for (y in 0 until HEIGHT) for (x in 0 until WIDTH) {
                        val at = y * plane.rowStride + x * plane.pixelStride
                        pixels[y * WIDTH + x] = ((buffer.get(at).toInt() and 0xFF) shl 16) or ((buffer.get(at + 1).toInt() and 0xFF) shl 8) or (buffer.get(at + 2).toInt() and 0xFF)
                    }
                    have = true
                }
                if (!have) continue
                val sample = screenColor(pixels, WIDTH, HEIGHT, style, edges)
                val target = floatArrayOf(sample.red.toFloat(), sample.green.toFloat(), sample.blue.toFloat())
                val now = rgb?.also { for (i in 0..2) it[i] += (target[i] - it[i]) * step } ?: target.also { rgb = it }
                val color = "#%02x%02x%02x".format(now[0].toInt(), now[1].toInt(), now[2].toInt())
                val frame = if (follow) """{"c":"$color","b":${syncBrightness(sample.luma, int("min_brightness", 10), int("max_brightness", 100))}}""" else """{"c":"$color"}"""
                if (frame != sent) { socket?.send(frame); sent = frame }
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        socket?.close() // the server then restores the lights and marks the scene inactive
        display?.release()
        reader?.close()
        projection?.stop()
        val repository = repository
        CoroutineScope(Dispatchers.Main).launch { delay(800); repository.refresh() }
        super.onDestroy()
    }

    companion object {
        private const val STOP = "stop"
        private const val SCENE = "scene"
        private const val GRANT = "grant"
        // Colors survive downscaling; a thumbnail keeps the analysis cheap.
        private const val WIDTH = 96
        private const val HEIGHT = 54

        /** [grant] is the result of the system's screen-capture consent dialog. */
        fun start(context: Context, sceneId: String, grant: Intent) {
            context.startForegroundService(Intent(context, ScreenSyncService::class.java).putExtra(SCENE, sceneId).putExtra(GRANT, grant))
        }
    }
}
