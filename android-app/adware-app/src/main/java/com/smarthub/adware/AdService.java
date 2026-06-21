package com.smarthub.adware;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.WindowManager;
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
    private boolean isShowing = false;
    private boolean isLoading = false;
    private int retryCount = 0;
    private boolean isNetworkAvailable = false;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;

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
                .setContentText("Waiting for network...")
                .setSmallIcon(android.R.drawable.ic_menu_report_image)
                .build();
        startForeground(1, notification);

        // Register network callback
        registerNetworkCallback();
    }

    private void registerNetworkCallback() {
        connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkRequest request = new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build();

        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                isNetworkAvailable = true;
                // Start ads immediately
                if (!isShowing) showAd();
            }

            @Override
            public void onLost(Network network) {
                isNetworkAvailable = false;
                // Stop ads – dismiss overlay and cancel scheduling
                dismissAd();
                handler.removeCallbacksAndMessages(null);
            }
        };
        connectivityManager.registerNetworkCallback(request, networkCallback);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    private void showAd() {
        if (isShowing || !isNetworkAvailable) return;
        isShowing = true;
        isLoading = true;
        retryCount = 0;

        adView = LayoutInflater.from(this).inflate(R.layout.ad_overlay, null);
        videoView = adView.findViewById(R.id.ad_video);
        adText = adView.findViewById(R.id.ad_text);
        adText.setText("Loading video...");

        videoView.setVideoURI(Uri.parse(VIDEO_URL));

        videoView.setOnPreparedListener(mp -> {
            isLoading = false;
            adText.setText("Sponsored Content");
            videoView.start();
            sendTrackingPing();
        });

        videoView.setOnCompletionListener(mp -> {
            dismissAd();
            // Schedule next ad after 30s (only if network still available)
            if (isNetworkAvailable) {
                handler.postDelayed(() -> {
                    isShowing = false;
                    showAd();
                }, 30000);
            }
        });

        videoView.setOnErrorListener((mp, what, extra) -> {
            isLoading = false;
            retryCount++;
            if (retryCount <= 3 && isNetworkAvailable) {
                adText.setText("Error – retrying (" + retryCount + "/3)...");
                handler.postDelayed(() -> {
                    videoView.setVideoURI(Uri.parse(VIDEO_URL));
                    videoView.start();
                }, 5000);
            } else {
                adText.setText("Unavailable – waiting for network.");
                dismissAd();
                if (isNetworkAvailable) {
                    handler.postDelayed(() -> {
                        isShowing = false;
                        retryCount = 0;
                        showAd();
                    }, 60000);
                }
            }
            return true;
        });

        handler.postDelayed(() -> {
            if (isLoading && isNetworkAvailable) {
                adText.setText("Timeout – retrying...");
                videoView.stopPlayback();
                videoView.setVideoURI(Uri.parse(VIDEO_URL));
                videoView.start();
            }
        }, 15000);

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
        }
    }

    private void dismissAd() {
        if (adView != null) {
            try { windowManager.removeView(adView); } catch (Exception ignored) {}
            adView = null;
        }
        isShowing = false;
        isLoading = false;
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
        if (networkCallback != null) {
            connectivityManager.unregisterNetworkCallback(networkCallback);
        }
        dismissAd();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}