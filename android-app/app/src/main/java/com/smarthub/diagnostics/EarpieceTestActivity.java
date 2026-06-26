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
    private MediaPlayer player;
    private Button confirmBtn;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_earpiece_test);

        TextView status = findViewById(R.id.statusText);
        confirmBtn = findViewById(R.id.confirmButton);

        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
        am.setMode(AudioManager.MODE_IN_CALL);
        am.setSpeakerphoneOn(false);

        Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        player = MediaPlayer.create(this, uri);
        if (player == null) {
            status.setText("No audio resource");
            Toast.makeText(this, "Cannot play sound", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        player.setAudioStreamType(AudioManager.STREAM_VOICE_CALL);
        player.setVolume(1.0f, 1.0f);
        player.setOnCompletionListener(mp -> {
            mp.release();
            status.setText("Playback finished. Did you hear it?");
            confirmBtn.setEnabled(true);
        });
        player.setOnErrorListener((mp, what, extra) -> {
            mp.release();
            Toast.makeText(this, "Playback error", Toast.LENGTH_SHORT).show();
            finish();
            return true;
        });

        status.setText("Listening through earpiece...");
        player.start();
        confirmBtn.setEnabled(false);
        confirmBtn.setOnClickListener(v -> finish());
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (player != null) player.release();
        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
        am.setMode(AudioManager.MODE_NORMAL);
        am.setSpeakerphoneOn(true);
    }
}