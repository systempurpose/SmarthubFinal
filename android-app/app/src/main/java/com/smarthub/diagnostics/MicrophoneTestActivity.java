package com.smarthub.diagnostics;

import android.Manifest;
import android.content.pm.PackageManager;
import android.media.MediaPlayer;
import android.media.MediaRecorder;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import java.io.IOException;

public class MicrophoneTestActivity extends AppCompatActivity {
    private static final int PERMISSION_REQUEST = 200;
    private MediaRecorder recorder;
    private MediaPlayer player;
    private String audioPath;
    private TextView status;
    private Button confirmBtn;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_microphone_test);
        status = findViewById(R.id.statusText);
        confirmBtn = findViewById(R.id.actionButton);

        audioPath = getExternalFilesDir(Environment.DIRECTORY_MUSIC) + "/test_audio.3gp";

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.RECORD_AUDIO}, PERMISSION_REQUEST);
            return;
        }
        startRecording();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startRecording();
            } else {
                Toast.makeText(this, "Audio permission required", Toast.LENGTH_SHORT).show();
                finish();
            }
        }
    }

    private void startRecording() {
        recorder = new MediaRecorder();
        recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
        recorder.setOutputFormat(MediaRecorder.OutputFormat.THREE_GPP);
        recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AMR_NB);
        recorder.setOutputFile(audioPath);

        try {
            recorder.prepare();
        } catch (IOException e) {
            Toast.makeText(this, "Prepare failed", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        // Countdown UI
        status.setText("Recording in 3...");
        Handler h = new Handler();
        h.postDelayed(() -> status.setText("2..."), 1000);
        h.postDelayed(() -> status.setText("1..."), 2000);
        h.postDelayed(() -> {
            status.setText("Recording...");
            recorder.start();
            // Stop after 3 seconds
            h.postDelayed(this::stopAndPlay, 3000);
        }, 3000);
    }

    private void stopAndPlay() {
        if (recorder != null) {
            recorder.stop();
            recorder.release();
            recorder = null;
        }
        status.setText("Playback...");
        confirmBtn.setEnabled(true);
        confirmBtn.setText("✅ I heard my voice");
        confirmBtn.setOnClickListener(v -> finish());

        player = new MediaPlayer();
        try {
            player.setDataSource(audioPath);
            player.prepare();
            player.start();
            player.setOnCompletionListener(mp -> {
                mp.release();
                status.setText("Playback finished");
            });
        } catch (IOException e) {
            Toast.makeText(this, "Playback failed", Toast.LENGTH_SHORT).show();
            finish();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (recorder != null) { recorder.release(); recorder = null; }
        if (player != null) { player.release(); player = null; }
    }
}