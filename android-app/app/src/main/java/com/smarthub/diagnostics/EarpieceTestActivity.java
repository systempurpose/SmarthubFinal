package com.smarthub.diagnostics;

import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

public class EarpieceTestActivity extends AppCompatActivity {
    private MediaPlayer mediaPlayer;
    private Button confirmButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_earpiece_test);

        TextView status = findViewById(R.id.statusText);
        confirmButton = findViewById(R.id.confirmButton);

        AudioManager audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
        // Route audio to earpiece (not speaker)
        audioManager.setSpeakerphoneOn(false);
        audioManager.setMode(AudioManager.MODE_IN_CALL);

        Uri notificationUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        mediaPlayer = MediaPlayer.create(this, notificationUri);
        if (mediaPlayer == null) {
            status.setText("No audio resource");
            Toast.makeText(this, "Cannot play sound", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        mediaPlayer.setVolume(1.0f, 1.0f);
        mediaPlayer.setOnCompletionListener(mp -> {
            mp.release();
            status.setText("Playback finished. Did you hear it?");
            confirmButton.setEnabled(true);
        });
        mediaPlayer.setOnErrorListener((mp, what, extra) -> {
            mp.release();
            Toast.makeText(this, "Playback error", Toast.LENGTH_SHORT).show();
            finish();
            return true;
        });

        status.setText("Listening through earpiece...");
        mediaPlayer.start();

        confirmButton.setOnClickListener(v -> finish());
        confirmButton.setEnabled(false);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (mediaPlayer != null) mediaPlayer.release();
        // Restore audio mode
        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
        am.setMode(AudioManager.MODE_NORMAL);
        am.setSpeakerphoneOn(true);
    }
}