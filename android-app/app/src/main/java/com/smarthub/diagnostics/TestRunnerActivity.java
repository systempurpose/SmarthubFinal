package com.smarthub.diagnostics;

import android.Manifest;
import android.content.Intent;  // <-- ADD THIS IMPORT
import android.content.pm.PackageManager;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class TestRunnerActivity extends AppCompatActivity {

    private static final String TAG = "TestRunner";
    private static final int PERMISSION_REQUEST_CODE = 100;
    private String pendingTestType;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_test_runner);

        String testType = getIntent().getStringExtra("test");
        pendingTestType = testType;
        if (testType == null) {
            finish();
            return;
        }

        if (testType.equals("flash")) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                        new String[]{Manifest.permission.CAMERA},
                        PERMISSION_REQUEST_CODE);
                return;
            }
        }

        runTest(testType);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                runTest(pendingTestType);
            } else {
                Toast.makeText(this, "Camera permission required for flashlight", Toast.LENGTH_SHORT).show();
                finish();
            }
        }
    }

    private void runTest(String testType) {
        TextView status = findViewById(R.id.testStatus);
        if (status != null) status.setText("Running: " + testType);

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
                startActivity(new Intent(this, TouchTestActivity.class));
                finish();
                break;
            case "proximity":
                startActivity(new Intent(this, ProximityTestActivity.class));
                finish();
                break;
            case "gyro":
                startActivity(new Intent(this, GyroTestActivity.class));
                finish();
                break;
            case "microphone":
                startActivity(new Intent(this, MicrophoneTestActivity.class));
                finish();
                break;
            case "earpiece":
                startActivity(new Intent(this, EarpieceTestActivity.class));
                finish();
                break;
            case "gps":
                startActivity(new Intent(this, GpsTestActivity.class));
                finish();
                break;
            case "fingerprint":
                startActivity(new Intent(this, FingerprintTestActivity.class));
                finish();
                break;
            case "nfc":
                startActivity(new Intent(this, NfcTestActivity.class));
                finish();
                break;
            default:
                Toast.makeText(this, "Unknown test: " + testType, Toast.LENGTH_SHORT).show();
                finish();
        }
    }

    private void runVibrateTest() {
        PackageManager pm = getPackageManager();
        if (!pm.hasSystemFeature("android.hardware.vibrator")) {
            Toast.makeText(this, "Vibrator hardware not present", Toast.LENGTH_LONG).show();
            Log.w(TAG, "Vibrator not supported");
            finish();
            return;
        }

        Vibrator vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) {
            Toast.makeText(this, "Vibrator service unavailable", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(500, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                vibrator.vibrate(500);
            }
            Toast.makeText(this, "Vibrating...", Toast.LENGTH_SHORT).show();
            Log.i(TAG, "Vibration triggered");
        } catch (Exception e) {
            Log.e(TAG, "Vibration error", e);
            Toast.makeText(this, "Vibration error: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }

        new android.os.Handler().postDelayed(this::finish, 1500);
    }

    private void runSoundTest() {
        PackageManager pm = getPackageManager();
        if (!pm.hasSystemFeature("android.hardware.audio.output")) {
            Toast.makeText(this, "Audio output not present", Toast.LENGTH_LONG).show();
            Log.w(TAG, "Audio output not supported");
            finish();
            return;
        }

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
            Log.e(TAG, "MediaPlayer error: what=" + what + ", extra=" + extra);
            finish();
            return true;
        });
        mp.start();
        Toast.makeText(this, "Playing notification sound...", Toast.LENGTH_SHORT).show();
        Log.i(TAG, "Sound playback started");
    }

    private void runFlashTest() {
        PackageManager pm = getPackageManager();
        if (!pm.hasSystemFeature("android.hardware.camera.flash")) {
            Toast.makeText(this, "Flash hardware not present", Toast.LENGTH_LONG).show();
            Log.w(TAG, "Flash not supported");
            finish();
            return;
        }

        CameraManager cameraManager = (CameraManager) getSystemService(CAMERA_SERVICE);
        if (cameraManager == null) {
            Toast.makeText(this, "Camera service unavailable", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        try {
            String flashCameraId = findFlashCameraId(cameraManager);
            if (flashCameraId == null) {
                Toast.makeText(this, "No flash unit found", Toast.LENGTH_SHORT).show();
                finish();
                return;
            }

            cameraManager.setTorchMode(flashCameraId, true);
            Toast.makeText(this, "Flash on", Toast.LENGTH_SHORT).show();
            Log.i(TAG, "Flash turned on");

            final String finalCameraId = flashCameraId;
            new android.os.Handler().postDelayed(() -> {
                try {
                    cameraManager.setTorchMode(finalCameraId, false);
                } catch (CameraAccessException e) {
                    Log.e(TAG, "Failed to turn off flash", e);
                }
                finish();
            }, 2000);

        } catch (Exception e) {
            Log.e(TAG, "Flash error", e);
            Toast.makeText(this, "Flash error: " + e.getMessage(), Toast.LENGTH_LONG).show();
            finish();
        }
    }

    private String findFlashCameraId(CameraManager manager) throws CameraAccessException {
        for (String id : manager.getCameraIdList()) {
            Boolean hasFlash = manager.getCameraCharacteristics(id)
                    .get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
            if (hasFlash != null && hasFlash) return id;
        }
        return null;
    }
}