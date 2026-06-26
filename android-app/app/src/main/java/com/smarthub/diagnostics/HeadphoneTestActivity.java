package com.smarthub.diagnostics;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.util.Log;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

public class HeadphoneTestActivity extends AppCompatActivity {
    private MediaPlayer player;
    private Button yesBtn, noBtn;
    private TextView status;
    private Handler handler = new Handler();
    private boolean isLooping = false;
    private boolean headphonesConnected = false;
    private BroadcastReceiver headsetReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_headphone_test);

        status = findViewById(R.id.statusText);
        yesBtn = findViewById(R.id.yesButton);
        noBtn = findViewById(R.id.noButton);
        yesBtn.setEnabled(false);
        noBtn.setEnabled(false);

        // Check initial headphone state
        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
        boolean wired = am.isWiredHeadsetOn();
        boolean bluetooth = am.isBluetoothA2dpOn();
        headphonesConnected = wired || bluetooth;

        if (headphonesConnected) {
            status.setText("Headphones detected. Playing sound...");
            startLoop();
        } else {
            status.setText("Please plug in headphones or Bluetooth headset.");
        }

        // Register receiver for headset plug/unplug events
        headsetReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (Intent.ACTION_HEADSET_PLUG.equals(intent.getAction())) {
                    int state = intent.getIntExtra("state", 0);
                    headphonesConnected = (state == 1);
                    if (headphonesConnected) {
                        status.setText("Headphones connected. Playing sound...");
                        startLoop();
                    } else {
                        status.setText("Headphones disconnected. Please reconnect.");
                        stopLoop();
                    }
                }
            }
        };
        IntentFilter filter = new IntentFilter(Intent.ACTION_HEADSET_PLUG);
        registerReceiver(headsetReceiver, filter);

        yesBtn.setOnClickListener(v -> {
            stopLoop();
            finish();
        });
        noBtn.setOnClickListener(v -> {
            stopLoop();
            finish();
        });
    }

    private void startLoop() {
        isLooping = true;
        yesBtn.setEnabled(true);
        noBtn.setEnabled(true);
        playLoop();
    }

    private void stopLoop() {
        isLooping = false;
        if (player != null) {
            player.stop();
            player.release();
            player = null;
        }
    }

    private void playLoop() {
        if (!isLooping) return;
        if (player != null) {
            player.release();
            player = null;
        }
        MediaPlayer mp = null;
        // Try custom tone first
        try {
            mp = MediaPlayer.create(this, R.raw.test_tone);
        } catch (Exception e) {
            Log.w("HeadphoneTest", "Custom tone not found, using system notification");
        }
        if (mp == null) {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            if (uri != null) {
                mp = MediaPlayer.create(this, uri);
            }
        }
        if (mp == null) {
            status.setText("No audio resource available");
            Toast.makeText(this, "No audio", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }
        player = mp;
        player.setAudioStreamType(AudioManager.STREAM_MUSIC);
        player.setVolume(1.0f, 1.0f);
        player.setOnCompletionListener(mp1 -> {
            mp1.release();
            if (isLooping) {
                handler.postDelayed(this::playLoop, 500);
            }
        });
        player.setOnErrorListener((mp1, what, extra) -> {
            mp1.release();
            if (isLooping) {
                handler.postDelayed(this::playLoop, 500);
            }
            return true;
        });
        player.start();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        stopLoop();
        if (headsetReceiver != null) {
            try { unregisterReceiver(headsetReceiver); } catch (Exception ignored) {}
        }
    }
}