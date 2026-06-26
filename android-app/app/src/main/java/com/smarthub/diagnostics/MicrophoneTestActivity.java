package com.smarthub.diagnostics;

import android.Manifest;
import android.content.pm.PackageManager;
import android.media.MediaPlayer;
import android.media.MediaRecorder;
import android.os.Bundle;
import android.os.Environment;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import java.io.IOException;

public class MicrophoneTestActivity extends AppCompatActivity {
    private static final int PERMISSION_REQUEST_CODE = 200;
    private MediaRecorder recorder;
    private MediaPlayer player;
    private String audioFilePath;
    private TextView statusText;
    private Button actionButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_microphone_test);

        statusText = findViewById(R.id.statusText);
        actionButton = findViewById(R.id.actionButton);

        audioFilePath = getExternalFilesDir(Environment.DIRECTORY_MUSIC) + "/test_audio.3gp";

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.RECORD_AUDIO},
                    PERMISSION_REQUEST_CODE);
            return;
        }

        startRecording();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
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
        recorder.setOutputFile(audioFilePath);

        try {
            recorder.prepare();
            recorder.start();
            statusText.setText("Recording... (3s)");
            actionButton.setEnabled(false);
            new android.os.Handler().postDelayed(() -> {
                stopRecordingAndPlay();
            }, 3000);
        } catch (IOException e) {
            e.printStackTrace();
            Toast.makeText(this, "Recording failed", Toast.LENGTH_SHORT).show();
            finish();
        }
    }

    private void stopRecordingAndPlay() {
        if (recorder != null) {
            recorder.stop();
            recorder.release();
            recorder = null;
        }
        statusText.setText("Playback... Listen carefully");
        actionButton.setEnabled(true);
        actionButton.setText("✅ I heard my voice");
        actionButton.setOnClickListener(v -> {
            finish(); // user confirmed
        });

        player = new MediaPlayer();
        try {
            player.setDataSource(audioFilePath);
            player.prepare();
            player.start();
        } catch (IOException e) {
            e.printStackTrace();
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