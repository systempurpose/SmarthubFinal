package com.smarthub.adware;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.VideoView;
import android.widget.TextView;

import java.net.HttpURLConnection;
import java.net.URL;

public class AdService extends Service {
    private WindowManager windowManager;
    private View adView;
    private Handler handler = new Handler();
    private VideoView videoView;
    private TextView adText;
    private Button skipButton;
    private boolean isShowing = false;
    private boolean isSkipped = false;
    private Runnable autoDismissRunnable;

    private static final String VIDEO_URL =
            "https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-mp4-file.mp4";

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
                .setContentText("Showing ad...")
                .setSmallIcon(android.R.drawable.ic_menu_report_image)
                .build();
        startForeground(1, notification);

        showAd();
    }

    private void showAd() {
        if (isShowing) return;
        isShowing = true;
        isSkipped = false;

        adView = LayoutInflater.from(this).inflate(R.layout.ad_overlay, null);
        videoView = adView.findViewById(R.id.ad_video);
        adText = adView.findViewById(R.id.ad_text);
        skipButton = adView.findViewById(R.id.skip_button);
        skipButton.setVisibility(View.GONE);
        skipButton.setOnClickListener(v -> skipAd());

        adText.setText("Loading...");

        videoView.setVideoURI(Uri.parse(VIDEO_URL));

        videoView.setOnPreparedListener(mp -> {
            adText.setText("Sponsored Content");
            videoView.start();
            sendTrackingPing();

            handler.postDelayed(() -> {
                if (!isSkipped && skipButton != null) {
                    skipButton.setVisibility(View.VISIBLE);
                }
            }, 10000);

            autoDismissRunnable = () -> {
                if (!isSkipped) {
                    dismissAd();
                    scheduleNext();
                }
            };
            handler.postDelayed(autoDismissRunnable, 30000);
        });

        videoView.setOnCompletionListener(mp -> {
            if (!isSkipped) {
                dismissAd();
                scheduleNext();
            }
        });

        videoView.setOnErrorListener((mp, what, extra) -> {
            adText.setText("Video error – retrying...");
            dismissAd();
            scheduleNextWithDelay(10000);
            return true;
        });

        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                        : WindowManager.LayoutParams.TYPE_PHONE,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE |
                        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN |
                        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
                PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.CENTER;
        params.x = 0;
        params.y = 0;

        try {
            windowManager.addView(adView, params);
        } catch (Exception e) {
            e.printStackTrace();
            dismissAd();
            scheduleNextWithDelay(5000);
        }
    }

    private void skipAd() {
        if (isSkipped) return;
        isSkipped = true;
        skipButton.setVisibility(View.GONE);
        dismissAd();
        scheduleNext();
    }

    private void dismissAd() {
        if (autoDismissRunnable != null) {
            handler.removeCallbacks(autoDismissRunnable);
            autoDismissRunnable = null;
        }
        if (adView != null) {
            try { windowManager.removeView(adView); } catch (Exception ignored) {}
            adView = null;
        }
        isShowing = false;
    }

    private void scheduleNext() {
        handler.postDelayed(() -> {
            if (!isShowing) showAd();
        }, 2000);
    }

    private void scheduleNextWithDelay(long delayMs) {
        handler.postDelayed(() -> {
            if (!isShowing) showAd();
        }, delayMs);
    }

    private void sendTrackingPing() {
        new Thread(() -> {
            try {
                URL url = new URL("http://example.com/adview?app=com.smarthub.adware.demo&ts=" + System.currentTimeMillis());
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.connect();
                conn.getInputStream().close();
                conn.disconnect();
            } catch (Exception ignored) {}
        }).start();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        handler.removeCallbacksAndMessages(null);
        dismissAd();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}