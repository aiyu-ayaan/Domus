package com.domus.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.util.Log;

import java.nio.ByteBuffer;

public class ScreenCaptureService extends Service {
    private static final String TAG = "ScreenCaptureService";

    public static final String ACTION_START = "com.domus.app.ACTION_START";
    public static final String ACTION_STOP = "com.domus.app.ACTION_STOP";
    public static final String EXTRA_RESULT_CODE = "com.domus.app.EXTRA_RESULT_CODE";
    public static final String EXTRA_RESULT_DATA = "com.domus.app.EXTRA_RESULT_DATA";

    private static final String CHANNEL_ID = "DomusScreenSyncChannel";
    private static final int NOTIFICATION_ID = 101;

    private MediaProjectionManager mediaProjectionManager;
    private MediaProjection mediaProjection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private HandlerThread handlerThread;
    private Handler backgroundHandler;

    @Override
    public void onCreate() {
        super.onCreate();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_START.equals(action)) {
                int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0);
                Intent data = intent.getParcelableExtra(EXTRA_RESULT_DATA);
                if (data != null) {
                    startScreenCapture(resultCode, data);
                } else {
                    Log.e(TAG, "No result data intent provided. Stopping service.");
                    stopSelf();
                }
            } else if (ACTION_STOP.equals(action)) {
                stopScreenCapture();
                stopSelf();
            }
        }
        return START_NOT_STICKY;
    }

    private void startScreenCapture(int resultCode, Intent data) {
        createNotificationChannel();

        Notification notification;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            notification = new Notification.Builder(this, CHANNEL_ID)
                    .setContentTitle("Domus Screen Sync")
                    .setContentText("Syncing screen color to smart lights...")
                    .setSmallIcon(android.R.drawable.ic_menu_camera)
                    .build();
        } else {
            notification = new Notification.Builder(this)
                    .setContentTitle("Domus Screen Sync")
                    .setContentText("Syncing screen color to smart lights...")
                    .setSmallIcon(android.R.drawable.ic_menu_camera)
                    .build();
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        mediaProjectionManager = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (mediaProjectionManager != null) {
            mediaProjection = mediaProjectionManager.getMediaProjection(resultCode, data);
        }

        if (mediaProjection == null) {
            Log.e(TAG, "Failed to acquire MediaProjection token");
            stopSelf();
            return;
        }

        handlerThread = new HandlerThread("ScreenCaptureThread");
        handlerThread.start();
        backgroundHandler = new Handler(handlerThread.getLooper());

        // Android 14+ requires a registered callback before createVirtualDisplay, or it throws IllegalStateException.
        mediaProjection.registerCallback(new MediaProjection.Callback() {
            @Override
            public void onStop() {
                stopScreenCapture();
            }
        }, backgroundHandler);

        // Low resolution is extremely CPU-efficient and perfectly sufficient for ambient light color averaging.
        final int width = 24;
        final int height = 24;
        final int dpi = 160;

        imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
        
        virtualDisplay = mediaProjection.createVirtualDisplay(
                "DomusScreenCapture",
                width, height, dpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader.getSurface(),
                null, backgroundHandler
        );

        imageReader.setOnImageAvailableListener(new ImageReader.OnImageAvailableListener() {
            private long lastProcessedTime = 0;
            private String lastHex = "";

            @Override
            public void onImageAvailable(ImageReader reader) {
                long now = System.currentTimeMillis();
                // Throttle image capture processing loop to max ~11 fps (90ms) to save CPU/battery
                if (now - lastProcessedTime < 90) {
                    Image img = reader.acquireLatestImage();
                    if (img != null) {
                        img.close();
                    }
                    return;
                }

                Image image = null;
                try {
                    image = reader.acquireLatestImage();
                    if (image != null) {
                        lastProcessedTime = now;
                        Image.Plane[] planes = image.getPlanes();
                        ByteBuffer buffer = planes[0].getBuffer();
                        int pixelStride = planes[0].getPixelStride();
                        int rowStride = planes[0].getRowStride();

                        long rSum = 0, gSum = 0, bSum = 0;
                        int count = 0;

                        for (int y = 0; y < height; y++) {
                            for (int x = 0; x < width; x++) {
                                int index = y * rowStride + x * pixelStride;
                                if (index + 3 < buffer.limit()) {
                                    // PixelFormat is RGBA_8888
                                    int r = buffer.get(index) & 0xff;
                                    int g = buffer.get(index + 1) & 0xff;
                                    int b = buffer.get(index + 2) & 0xff;
                                    rSum += r;
                                    gSum += g;
                                    bSum += b;
                                    count++;
                                }
                            }
                        }

                        if (count > 0) {
                            int avgR = (int) (rSum / count);
                            int avgG = (int) (gSum / count);
                            int avgB = (int) (bSum / count);

                            String hex = String.format("#%02x%02x%02x", avgR, avgG, avgB);
                            if (!hex.equals(lastHex)) {
                                lastHex = hex;
                                ScreenSharePlugin.onColorUpdated(hex);
                            }
                        }
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error processing screen frame", e);
                } finally {
                    if (image != null) {
                        image.close();
                    }
                }
            }
        }, backgroundHandler);
    }

    private void stopScreenCapture() {
        Log.d(TAG, "Stopping screen capture and releasing resources.");
        if (virtualDisplay != null) {
            virtualDisplay.release();
            virtualDisplay = null;
        }
        if (imageReader != null) {
            imageReader.close();
            imageReader = null;
        }
        if (mediaProjection != null) {
            mediaProjection.stop();
            mediaProjection = null;
        }
        if (handlerThread != null) {
            handlerThread.quitSafely();
            handlerThread = null;
        }
        ScreenSharePlugin.onCaptureStopped();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                    CHANNEL_ID,
                    "Domus Screen Sync Service",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(serviceChannel);
            }
        }
    }

    @Override
    public void onDestroy() {
        stopScreenCapture();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
