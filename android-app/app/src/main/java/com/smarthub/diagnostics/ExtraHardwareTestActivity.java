package com.smarthub.diagnostics;

import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.hardware.biometrics.BiometricManager;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.view.KeyEvent;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Handles all the "extra" hardware tests added on top of the existing TestRunnerActivity flow:
 * multi-touch, physical buttons, dead-pixel/burn-in color sweep, camera facing + autofocus,
 * magnetometer, barometer, wireless charging, IR blaster, and face-unlock hardware detection.
 *
 * Routed here from TestRunnerActivity via an intent extra "mode" matching the test name.
 * Uses a plain programmatic TextView as its content view so no new layout XML is required.
 */
public class ExtraHardwareTestActivity extends AppCompatActivity implements SensorEventListener {

    private String mode;
    private TextView statusView;
    private SensorManager sensorManager;
    private Sensor activeSensor;

    // Multi-touch tracking
    private int maxPointersSeen = 0;

    // Physical button tracking
    private final Set<String> buttonsPressed = new HashSet<>();
    private static final long BUTTON_TEST_TIMEOUT_MS = 8000;

    // Color sweep
    private static final String[] SWEEP_COLORS = {"red", "green", "blue", "white", "black"};
    private int sweepIndex = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        statusView = new TextView(this);
        statusView.setTextSize(18f);
        statusView.setPadding(40, 100, 40, 40);
        setContentView(statusView);

        mode = getIntent().getStringExtra("mode");
        if (mode == null) {
            finish();
            return;
        }

        switch (mode) {
            case "multitouch":
                runMultiTouchTest();
                break;
            case "buttons":
                runButtonTest();
                break;
            case "colorsweep":
                runColorSweep();
                break;
            case "camera_front":
                runCameraFacingCheck(CameraCharacteristics.LENS_FACING_FRONT);
                break;
            case "camera_rear":
                runCameraFacingCheck(CameraCharacteristics.LENS_FACING_BACK);
                break;
            case "magnetometer":
                runSensorTest(Sensor.TYPE_MAGNETIC_FIELD, "Magnetometer");
                break;
            case "barometer":
                runSensorTest(Sensor.TYPE_PRESSURE, "Barometer");
                break;
            case "wireless_charging":
                runWirelessChargingCheck();
                break;
            case "ir_blaster":
                runIrBlasterCheck();
                break;
            case "face_unlock":
                runFaceUnlockCheck();
                break;
            default:
                statusView.setText("Unknown test mode: " + mode);
                new Handler().postDelayed(this::finish, 1500);
        }
    }

    // ---- Multi-touch: track the highest simultaneous pointer count seen over 10 seconds ----
    private void runMultiTouchTest() {
        statusView.setText("Touch the screen with as many fingers as possible at once (2, 5, 10-finger test).\nMax detected so far: 0");
        statusView.setOnTouchListener((v, event) -> {
            int pointers = event.getPointerCount();
            if (pointers > maxPointersSeen) {
                maxPointersSeen = pointers;
                statusView.setText("Touch the screen with as many fingers as possible at once.\nMax detected so far: " + maxPointersSeen);
            }
            return true;
        });
        new Handler().postDelayed(() -> {
            String result = maxPointersSeen >= 5 ? "PASS (" + maxPointersSeen + "-point multitouch detected)"
                    : maxPointersSeen >= 2 ? "PARTIAL (" + maxPointersSeen + "-point only)"
                    : "FAIL (no multitouch detected)";
            statusView.setText("Multi-touch test result: " + result);
            new Handler().postDelayed(this::finish, 2000);
        }, 10000);
    }

    // ---- Physical buttons: listen for volume up/down key events ----
    private void runButtonTest() {
        statusView.setText("Press Volume Up and Volume Down within 8 seconds.\nDetected: (none yet)");
        new Handler().postDelayed(() -> {
            String result = "Detected: " + (buttonsPressed.isEmpty() ? "none" : String.join(", ", buttonsPressed));
            statusView.setText("Button test complete.\n" + result);
            new Handler().postDelayed(this::finish, 1500);
        }, BUTTON_TEST_TIMEOUT_MS);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if ("buttons".equals(mode)) {
            if (keyCode == KeyEvent.KEYCODE_VOLUME_UP) buttonsPressed.add("Volume Up");
            else if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) buttonsPressed.add("Volume Down");
            statusView.setText("Press Volume Up and Volume Down within 8 seconds.\nDetected: " + String.join(", ", buttonsPressed));
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    // ---- Dead pixel / burn-in sweep: cycle full-screen solid colors, tap to advance ----
    private void runColorSweep() {
        showNextSweepColor();
        statusView.setOnClickListener(v -> {
            sweepIndex++;
            if (sweepIndex < SWEEP_COLORS.length) {
                showNextSweepColor();
            } else {
                finish();
            }
        });
    }

    private void showNextSweepColor() {
        String colorName = SWEEP_COLORS[sweepIndex];
        int color;
        switch (colorName) {
            case "red": color = Color.RED; break;
            case "green": color = Color.GREEN; break;
            case "blue": color = Color.BLUE; break;
            case "white": color = Color.WHITE; break;
            default: color = Color.BLACK;
        }
        statusView.setBackgroundColor(color);
        statusView.setTextColor(color == Color.WHITE || color == Color.GREEN ? Color.BLACK : Color.WHITE);
        statusView.setText("Screen: " + colorName + " — tap anywhere for next color (" + (sweepIndex + 1) + "/" + SWEEP_COLORS.length + ")");
    }

    // ---- Camera facing + rough autofocus check ----
    private void runCameraFacingCheck(int facing) {
        CameraManager cameraManager = (CameraManager) getSystemService(CAMERA_SERVICE);
        String label = facing == CameraCharacteristics.LENS_FACING_FRONT ? "Front" : "Rear";
        if (cameraManager == null) {
            statusView.setText(label + " camera: CameraManager unavailable");
            finishDelayed();
            return;
        }
        try {
            boolean found = false;
            boolean hasAutofocus = false;
            for (String id : cameraManager.getCameraIdList()) {
                CameraCharacteristics chars = cameraManager.getCameraCharacteristics(id);
                Integer lensFacing = chars.get(CameraCharacteristics.LENS_FACING);
                if (lensFacing != null && lensFacing == facing) {
                    found = true;
                    // Fixed-focus lenses report a minimum focus distance of 0 (infinity only);
                    // autofocus-capable lenses report a positive value.
                    Float minFocusDistance = chars.get(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE);
                    hasAutofocus = minFocusDistance != null && minFocusDistance > 0f;
                    break;
                }
            }
            statusView.setText(label + " camera: " + (found ? "Present" : "Not found")
                    + (found ? ("\nAutofocus: " + (hasAutofocus ? "Supported" : "Fixed focus / not supported")) : ""));
        } catch (Exception e) {
            statusView.setText(label + " camera check failed: " + e.getMessage());
        }
        finishDelayed();
    }

    // ---- Magnetometer / barometer: register listener, show live readings for 4 seconds ----
    private void runSensorTest(int sensorType, String label) {
        sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
        if (sensorManager == null) {
            statusView.setText(label + ": SensorManager unavailable");
            finishDelayed();
            return;
        }
        activeSensor = sensorManager.getDefaultSensor(sensorType);
        if (activeSensor == null) {
            statusView.setText(label + ": Not present on this device");
            finishDelayed();
            return;
        }
        statusView.setText(label + ": Reading sensor...");
        sensorManager.registerListener(this, activeSensor, SensorManager.SENSOR_DELAY_NORMAL);
        new Handler().postDelayed(() -> {
            sensorManager.unregisterListener(this);
            finish();
        }, 4000);
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (activeSensor == null) return;
        StringBuilder sb = new StringBuilder();
        sb.append(activeSensor.getName()).append(" reading: ");
        for (float v : event.values) sb.append(String.format(Locale.US, "%.2f ", v));
        sb.append("\nAccuracy: ").append(event.accuracy).append("/3");
        statusView.setText(sb.toString());
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) { /* no-op */ }

    // ---- Wireless charging check ----
    private void runWirelessChargingCheck() {
        IntentFilter ifilter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
        Intent batteryStatus = registerReceiver(null, ifilter);
        if (batteryStatus == null) {
            statusView.setText("Wireless charging: unable to read battery status");
            finishDelayed();
            return;
        }
        int plugged = batteryStatus.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1);
        boolean wireless = plugged == BatteryManager.BATTERY_PLUGGED_WIRELESS;
        boolean anyPlugged = plugged != 0 && plugged != -1;
        String msg;
        if (wireless) {
            msg = "Wireless charging: ACTIVE right now";
        } else if (anyPlugged) {
            msg = "Currently charging via wired/USB — place on a wireless charger to test the coil";
        } else {
            msg = "Not currently charging — place on a wireless charger to test";
        }
        statusView.setText(msg);
        finishDelayed();
    }

    // ---- IR blaster check ----
    private void runIrBlasterCheck() {
        PackageManager pm = getPackageManager();
        boolean hasIr = pm.hasSystemFeature(PackageManager.FEATURE_CONSUMER_IR);
        statusView.setText("IR blaster: " + (hasIr ? "Present" : "Not present on this device"));
        finishDelayed();
    }

    // ---- Face unlock hardware check ----
    private void runFaceUnlockCheck() {
        PackageManager pm = getPackageManager();
        boolean hasFaceFeature = pm.hasSystemFeature("android.hardware.biometrics.face");
        String canAuth = "Unknown (requires Android 11+)";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                BiometricManager bm = getSystemService(BiometricManager.class);
                if (bm != null) {
                    int result = bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
                    if (result == BiometricManager.BIOMETRIC_SUCCESS) {
                        canAuth = "Enrolled and available";
                    } else if (result == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
                        canAuth = "Hardware present, nothing enrolled";
                    } else if (result == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE) {
                        canAuth = "No biometric hardware";
                    } else {
                        canAuth = "Unavailable (code " + result + ")";
                    }
                }
            } catch (Exception ignored) {}
        }
        statusView.setText("Face unlock feature flag: " + hasFaceFeature
                + "\nBiometric status: " + canAuth
                + "\n(Note: BiometricManager reports strong biometrics generally — it may not"
                + " distinguish face vs. fingerprint on every OEM skin.)");
        finishDelayed();
    }

    private void finishDelayed() {
        new Handler().postDelayed(this::finish, 2500);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (sensorManager != null && activeSensor != null) {
            try { sensorManager.unregisterListener(this); } catch (Exception ignored) {}
        }
    }
}