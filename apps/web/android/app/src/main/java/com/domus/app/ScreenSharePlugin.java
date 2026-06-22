package com.domus.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import androidx.activity.result.ActivityResult;

@CapacitorPlugin(name = "ScreenShare")
public class ScreenSharePlugin extends Plugin {
    private static ScreenSharePlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    public static void onColorUpdated(String hex) {
        if (instance != null) {
            JSObject data = new JSObject();
            data.put("color", hex);
            instance.notifyListeners("screenColor", data);
        }
    }

    public static void onCaptureStopped() {
        if (instance != null) {
            instance.notifyListeners("screenStopped", new JSObject());
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity is null");
            return;
        }

        MediaProjectionManager mediaProjectionManager = (MediaProjectionManager) activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (mediaProjectionManager == null) {
            call.reject("MediaProjectionManager not available");
            return;
        }

        Intent permissionIntent = mediaProjectionManager.createScreenCaptureIntent();
        startActivityForResult(call, permissionIntent, "handleScreenCaptureResult");
    }

    @ActivityCallback
    private void handleScreenCaptureResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result.getResultCode() == Activity.RESULT_OK) {
            Intent data = result.getData();
            if (data == null) {
                call.reject("Activity result returned null intent data");
                return;
            }

            final Context context = getContext();
            final Intent serviceIntent = new Intent(context, ScreenCaptureService.class);
            serviceIntent.setAction(ScreenCaptureService.ACTION_START);
            serviceIntent.putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, result.getResultCode());
            serviceIntent.putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, data);

            // A tiny delay ensures the system permission dialog is fully dismissed,
            // focus returns to the MainActivity, and the OS registers the app as in-foreground
            // and permission granted before starting the foreground service.
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(new Runnable() {
                @Override
                public void run() {
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            context.startForegroundService(serviceIntent);
                        } else {
                            context.startService(serviceIntent);
                        }
                        call.resolve();
                    } catch (Exception e) {
                        call.reject("Failed to start screen capture service: " + e.getMessage());
                    }
                }
            }, 200);
        } else {
            call.reject("Screen capture permission denied by user");
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        Intent serviceIntent = new Intent(context, ScreenCaptureService.class);
        serviceIntent.setAction(ScreenCaptureService.ACTION_STOP);
        context.startService(serviceIntent);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        Context context = getContext();
        if (context != null) {
            Intent serviceIntent = new Intent(context, ScreenCaptureService.class);
            serviceIntent.setAction(ScreenCaptureService.ACTION_STOP);
            context.startService(serviceIntent);
        }
        instance = null;
        super.handleOnDestroy();
    }
}
