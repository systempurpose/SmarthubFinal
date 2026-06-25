package com.smarthub.diagnostics;

import android.Manifest;
import android.content.pm.PackageManager;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.widget.TextView;
import android.widget.Toast;
import android.media.RingtoneManager;
import android.net.Uri;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class TestRunnerActivity extends AppCompatActivity {

    private static final int PERMISSION_REQUEST_CODE = 100;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_test_runner);

        String testType = getIntent().getStringExtra("test");
        if (testType == null) {
            finish();
            return;
        }

        // Check required permissions (if needed)
        if (testType.equals("flash") || testType.equals("camera")) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                        new String[]{Manifest.permission.CAMERA},
                        PERMISSION_REQUEST_CODE);
                // The test will be triggered after permission result.
                return;
            }
        }

        runTest(testType);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
            String testType = getIntent().getStringExtra("test");
            if (testType != null) {
                runTest(testType);
            } else {
                finish();
            }
        }
    }

    private void runTest(String testType) {
        TextView status = findViewById(R.id.testStatus);
        if (status != null) {
            status.setText("Running: " + testType);
        }

        switch (testType) {
            case "vibrate":
                runVibrateTest();
                break;
            case "sound":
                runSoundTest();
                break;
            case "flash":
                runFlashTest();
                break;
            case "touch":
                // Already handled by separate activity? For now just show a message.
                Toast.makeText(this, "Touch test should be run via the main app.", Toast.LENGTH_LONG).show();
                finish();
                break;
            default:
                Toast.makeText(this, "Unknown test: " + testType, Toast.LENGTH_SHORT).show();
                finish();
        }
    }

    private void runVibrateTest() {
        Vibrator vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) {
            Toast.makeText(this, "Vibrator not available", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(500, VibrationEffect.DEFAULT_AMPLITUDE));
        } else {
            vibrator.vibrate(500);
        }

        Toast.makeText(this, "Vibrating...", Toast.LENGTH_SHORT).show();
        // Finish after a short delay
        new android.os.Handler().postDelayed(this::finish, 1500);
    }

    private void runSoundTest() {
    // Use a system notification sound instead of a custom raw file
    Uri notificationUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
    if (notificationUri == null) {
        Toast.makeText(this, "No notification sound available", Toast.LENGTH_SHORT).show();
        finish();
        return;
    }

    MediaPlayer mp = MediaPlayer.create(this, notificationUri);
    if (mp == null) {
        Toast.makeText(this, "Could not create MediaPlayer", Toast.LENGTH_SHORT).show();
        finish();
        return;
    }

    mp.setVolume(1.0f, 1.0f);
    mp.setOnCompletionListener(mp1 -> {
        mp1.release();
        finish();
    });
    mp.setOnErrorListener((mp1, what, extra) -> {
        mp1.release();
        Toast.makeText(this, "Audio playback error", Toast.LENGTH_SHORT).show();
        finish();
        return true;
    });
    mp.start();
    Toast.makeText(this, "Playing notification sound...", Toast.LENGTH_SHORT).show();
}

    private void runFlashTest() {
        CameraManager cameraManager = (CameraManager) getSystemService(CAMERA_SERVICE);
        if (cameraManager == null) {
            Toast.makeText(this, "Camera service not available", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        try {
            String cameraId = null;
            for (String id : cameraManager.getCameraIdList()) {
                if (cameraManager.getCameraCharacteristics(id)
                        .get(android.hardware.camera2.CameraCharacteristics.FLASH_INFO_AVAILABLE)) {
                    cameraId = id;
                    break;
                }
            }
            if (cameraId == null) {
                Toast.makeText(this, "No flash unit available", Toast.LENGTH_SHORT).show();
                finish();
                return;
            }

            cameraManager.setTorchMode(cameraId, true);
            Toast.makeText(this, "Flash on", Toast.LENGTH_SHORT).show();

            // Turn off after 2 seconds
            new android.os.Handler().postDelayed(() -> {
                try {
                    cameraManager.setTorchMode(cameraId, false);
                } catch (CameraAccessException e) {
                    e.printStackTrace();
                }
                finish();
            }, 2000);
        } catch (Exception e) {
            Toast.makeText(this, "Flash error: " + e.getMessage(), Toast.LENGTH_SHORT).show();
            finish();
        }
    }
}