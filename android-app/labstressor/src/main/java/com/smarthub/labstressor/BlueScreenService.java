package com.smarthub.labstressor;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

public class BlueScreenService extends Service {
    static final String ACTION_START = "com.smarthub.labstressor.BLUE_START";
    static final String ACTION_STOP = "com.smarthub.labstressor.BLUE_STOP";

    private static final String CHANNEL_ID = "labstressor.blue";
    private static final int NOTIF_ID = 101;

    private WindowManager windowManager;
    private View overlayView;

    @Override
    public void onCreate() {
        super.onCreate();
        windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (getPackageManager().isSafeMode()) {
            BlueScreenPrefs.setEnabled(this, false);
            stopSelf();
            return START_NOT_STICKY;
        }

        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            BlueScreenPrefs.setEnabled(this, false);
            removeOverlay();
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        if (!BlueScreenPrefs.isEnabled(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }

        if (!Settings.canDrawOverlays(this)) {
            // Cannot draw; keep preference but stop so user can grant permission from the app.
            stopSelf();
            return START_NOT_STICKY;
        }

        ensureNotificationChannel();
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(getString(R.string.app_name))
                .setContentText(getString(R.string.blue_title))
                .setSmallIcon(android.R.drawable.stat_notify_error)
                .setOngoing(true)
                .build();

        startForeground(NOTIF_ID, notification);
        showOverlay();
        return START_STICKY;
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID);
        if (existing != null) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Lab Stressor Blue Screen",
                NotificationManager.IMPORTANCE_LOW
        );
        nm.createNotificationChannel(channel);
    }

    private void showOverlay() {
        if (overlayView != null || windowManager == null) return;

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(50, 70, 50, 50);
        root.setBackgroundColor(getResources().getColor(R.color.lab_blue));

        TextView title = new TextView(this);
        title.setText(getString(R.string.blue_title));
        title.setTextColor(getResources().getColor(R.color.lab_blue_text));
        title.setTextSize(22f);

        TextView body = new TextView(this);
        body.setText(getString(R.string.blue_body));
        body.setTextColor(getResources().getColor(R.color.lab_blue_text));
        body.setPadding(0, 30, 0, 30);

        Button exit = new Button(this);
        exit.setText(getString(R.string.btn_blue_off));
        exit.setOnClickListener(v -> {
            BlueScreenPrefs.setEnabled(this, false);
            removeOverlay();
            stopForeground(true);
            stopSelf();
        });

        root.addView(title);
        root.addView(body);
        root.addView(exit);

        int type = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;

        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_FULLSCREEN,
                PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.START;

        overlayView = root;
        windowManager.addView(overlayView, params);
    }

    private void removeOverlay() {
        if (windowManager == null || overlayView == null) return;
        try {
            windowManager.removeView(overlayView);
        } catch (Exception ignored) {
        }
        overlayView = null;
    }

    @Override
    public void onDestroy() {
        removeOverlay();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
