package com.smarthub.adware;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;

public class AdService extends Service {
    private WindowManager windowManager;
    private View adView;
    private Handler handler = new Handler();
    private Runnable adRunnable;

    @Override
    public void onCreate() {
        super.onCreate();
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                "adware_channel",
                "Ad Service",
                NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }

        Notification notification = new Notification.Builder(this, "adware_channel")
            .setContentTitle("Adware Demo")
            .setContentText("Running in background...")
            .setSmallIcon(android.R.drawable.ic_menu_report_image)
            .build();
        startForeground(1, notification);

        adRunnable = new Runnable() {
            @Override
            public void run() {
                showAd();
                handler.postDelayed(this, 30000);
            }
        };
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        handler.post(adRunnable);
        return START_STICKY;
    }

    private void showAd() {
        if (adView != null) {
            try { windowManager.removeView(adView); } catch (Exception ignored) {}
            adView = null;
        }

        adView = LayoutInflater.from(this).inflate(R.layout.ad_overlay, null);
        TextView adText = adView.findViewById(R.id.ad_text);
        adText.setText("🔥 ADWARE DEMO\nOverlay appears every 30s!");

        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE |
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        );

        params.gravity = Gravity.TOP | Gravity.CENTER;
        params.x = 0;
        params.y = 100;

        try {
            windowManager.addView(adView, params);
            handler.postDelayed(() -> {
                if (adView != null) {
                    try { windowManager.removeView(adView); } catch (Exception ignored) {}
                    adView = null;
                }
            }, 5000);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        handler.removeCallbacks(adRunnable);
        if (adView != null) {
            try { windowManager.removeView(adView); } catch (Exception ignored) {}
            adView = null;
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
