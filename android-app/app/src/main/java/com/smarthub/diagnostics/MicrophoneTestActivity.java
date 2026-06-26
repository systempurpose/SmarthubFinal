package com.smarthub.diagnostics;

import android.Manifest;
import android.content.pm.PackageManager;
import android.media.MediaPlayer;
import android.media.MediaRecorder;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.util.Log;
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
    private Button yesBtn, noBtn;
    private Handler handler = new Handler();
    private boolean isLooping = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_microphone_test);

        status = findViewById(R.id.statusText);
        yesBtn = findViewById(R.id.yesButton);
        noBtn = findViewById(R.id.noButton);
        yesBtn.setEnabled(false);
        noBtn.setEnabled(false);

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

        // Countdown
        status.setText("Recording in 3...");
        handler.postDelayed(() -> status.setText("2..."), 1000);
        handler.postDelayed(() -> status.setText("1..."), 2000);
        handler.postDelayed(() -> {
            status.setText("Recording... speak now");
            recorder.start();
            handler.postDelayed(this::stopAndPlayLoop, 3000);
        }, 3000);
    }

    private void stopAndPlayLoop() {
        if (recorder != null) {
            recorder.stop();
            recorder.release();
            recorder = null;
        }
        status.setText("Playback (looping) – did you hear your voice?");
        yesBtn.setEnabled(true);
        noBtn.setEnabled(true);

        isLooping = true;
        playLoop();

        yesBtn.setOnClickListener(v -> {
            isLooping = false;
            if (player != null) player.stop();
            finish();
        });
        noBtn.setOnClickListener(v -> {
            isLooping = false;
            if (player != null) player.stop();
            finish();
        });
    }

    private void playLoop() {
        if (!isLooping) return;
        if (player != null) {
            player.release();
            player = null;
        }
        player = new MediaPlayer();
        try {
            player.setDataSource(audioPath);
            player.prepare();
            player.setVolume(1.0f, 1.0f);
            player.start();
            player.setOnCompletionListener(mp -> {
                mp.release();
                if (isLooping) {
                    handler.postDelayed(this::playLoop, 300);
                }
            });
            player.setOnErrorListener((mp, what, extra) -> {
                mp.release();
                if (isLooping) {
                    handler.postDelayed(this::playLoop, 300);
                }
                return true;
            });
        } catch (IOException e) {
            Toast.makeText(this, "Playback failed", Toast.LENGTH_SHORT).show();
            finish();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        isLooping = false;
        if (recorder != null) { recorder.release(); recorder = null; }
        if (player != null) { player.release(); player = null; }
    }
}