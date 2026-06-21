package com.smarthub.diagnostics;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.FileObserver;
import android.os.IBinder;
import android.util.Log;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;
import java.net.InetSocketAddress;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class RealTimeService extends Service {
    private static final String TAG = "RealTimeService";
    private WebSocketServer server;
    private FileObserver fileObserver;
    private ScheduledExecutorService scheduler;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startForeground(1, createNotification());
        startWebSocketServer();
        startFileObserver();
        startHeartbeat();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel("realtime_channel", "Real-time Sync", NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    private Notification createNotification() {
        return new Notification.Builder(this, "realtime_channel")
                .setContentTitle("SmartHub Sync")
                .setContentText("Running")
                .setSmallIcon(android.R.drawable.ic_menu_camera)
                .build();
    }

    private void startWebSocketServer() {
        try {
            server = new WebSocketServer(new InetSocketAddress(8080)) {
                @Override
                public void onOpen(WebSocket conn, ClientHandshake handshake) {
                    Log.i(TAG, "WebSocket opened");
                }
                @Override
                public void onClose(WebSocket conn, int code, String reason, boolean remote) { }
                @Override
                public void onMessage(WebSocket conn, String message) { }
                @Override
                public void onError(WebSocket conn, Exception ex) { Log.e(TAG, "WS error", ex); }
                @Override
                public void onStart() { Log.i(TAG, "WebSocket server started"); }
            };
            server.start();
        } catch (Exception e) {
            Log.e(TAG, "Failed to start WebSocket server", e);
        }
    }

    private void startFileObserver() {
        fileObserver = new FileObserver("/sdcard", FileObserver.CREATE | FileObserver.MODIFY) {
            @Override
            public void onEvent(int event, String path) {
                if (path != null && server != null) {
                    String json = String.format("{\"type\":\"file\",\"event\":\"%s\",\"path\":\"/sdcard/%s\",\"timestamp\":%d}",
                            (event == FileObserver.CREATE) ? "create" : "modify", path, System.currentTimeMillis());
                    server.broadcast(json);
                }
            }
        };
        fileObserver.startWatching();
    }

    private void startHeartbeat() {
        scheduler = Executors.newSingleThreadScheduledExecutor();
        scheduler.scheduleAtFixedRate(() -> {
            if (server != null) server.broadcast("{\"type\":\"heartbeat\",\"timestamp\":" + System.currentTimeMillis() + "}");
        }, 5, 5, TimeUnit.SECONDS);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (server != null) { try { server.stop(); } catch (Exception e) { } }
        if (fileObserver != null) fileObserver.stopWatching();
        if (scheduler != null) scheduler.shutdown();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}