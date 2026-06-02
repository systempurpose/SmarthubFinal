package com.smarthub.diagnostics;

import android.content.Context;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.MotionEvent;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

/**
 * Activity used only for technician-controlled tests.
 * It is started via ADB from the desktop app with an extra "test" value
 * (e.g. flash, vibrate, sound) and performs the corresponding action.
 * No results are shown here; the technician records outcomes on the desktop.
 */
public class TestRunnerActivity extends AppCompatActivity {

    private final Handler handler = new Handler(Looper.getMainLooper());
    private ToneGenerator toneGenerator;
    private String torchCameraId;
    private boolean touchTestActive = false;
    private TextView hintView;
    private int touchPointsRegistered = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_test_runner);

        TextView title = findViewById(R.id.test_title);
        TextView instructions = findViewById(R.id.test_instructions);
        hintView = findViewById(R.id.test_hint);

        String test = getIntent().getStringExtra("test");
        if (test == null) test = "";

        switch (test) {
            case "flash":
                title.setText("Flashlight test");
                instructions.setText("The SmartHub desktop app is testing the flashlight. Look at the rear LED – it should turn on briefly and then off. Tell the technician what you saw.");
                runFlashTest();
                break;
            case "vibrate":
                title.setText("Vibration test");
                instructions.setText("The SmartHub desktop app is testing vibration. Hold the phone and wait for a short buzz. Tell the technician if you felt it.");
                runVibrateTest();
                break;
            case "sound":
                title.setText("Speaker test");
                instructions.setText("The SmartHub desktop app is testing the speaker. Listen for a short test tone and tell the technician if you heard it clearly.");
                runSoundTest();
                break;
            case "touch":
                title.setText("Touch screen test");
                instructions.setText("The SmartHub desktop app is testing the touch screen. Slowly drag your finger across the entire screen and tap different spots. Tell the technician if any area does not respond.");
                if (hintView != null) {
                    hintView.setText("Move and tap your finger around. The counter below should keep increasing as touches are detected.");
                }
                touchTestActive = true;
                break;
            default:
                title.setText("SmartHub device test");
                instructions.setText("A technician is running a test from the SmartHub desktop app. Follow their instructions and watch what the phone does.");
                break;
        }
    }

    private void runFlashTest() {
        CameraManager cm = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
        if (cm == null) return;

        try {
            for (String id : cm.getCameraIdList()) {
                CameraCharacteristics cc = cm.getCameraCharacteristics(id);
                Boolean hasFlash = cc.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                if (Boolean.TRUE.equals(hasFlash)) {
                    torchCameraId = id;
                    try {
                        cm.setTorchMode(id, true);
                    } catch (SecurityException se) {
                        // Missing camera/flash permission – nothing else to do here.
                        return;
                    }
                    handler.postDelayed(() -> {
                        try {
                            cm.setTorchMode(id, false);
                        } catch (Exception ignored) {
                        }
                    }, 2500);
                    break;
                }
            }
        } catch (CameraAccessException ignored) {
        }
    }

    private void runVibrateTest() {
        Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (v == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(VibrationEffect.createOneShot(800, VibrationEffect.DEFAULT_AMPLITUDE));
        } else {
            //noinspection deprecation
            v.vibrate(800);
        }
    }

    private void runSoundTest() {
        toneGenerator = new ToneGenerator(AudioManager.STREAM_MUSIC, 100);
        toneGenerator.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 1500);
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        if (touchTestActive) {
            int action = ev.getActionMasked();
            if (action == MotionEvent.ACTION_DOWN || action == MotionEvent.ACTION_POINTER_DOWN) {
                touchPointsRegistered++;
                if (hintView != null) {
                    hintView.setText("Touches detected: " + touchPointsRegistered + ". Continue tapping and dragging across the whole screen.");
                }
            }
        }
        return super.dispatchTouchEvent(ev);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (toneGenerator != null) {
            toneGenerator.release();
            toneGenerator = null;
        }

        if (torchCameraId != null) {
            CameraManager cm = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
            if (cm != null) {
                try {
                    cm.setTorchMode(torchCameraId, false);
                } catch (Exception ignored) {
                }
            }
        }
    }
}
