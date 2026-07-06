package com.smarthub.diagnostics;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.hardware.biometrics.BiometricManager;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.view.KeyEvent;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

import android.Manifest;

public class ExtraHardwareTestActivity extends AppCompatActivity implements SensorEventListener, View.OnClickListener {

    private String mode;
    private TextView tvInstruction;
    private TextView tvStatus;
    private TextView tvTouchCount;
    private TextView tvReadings;
    private Button btnDone;
    private Button btnTestCamera;
    private SensorManager sensorManager;
    private Sensor activeSensor;

    // Multi‑touch
    private int maxPointersSeen = 0;

    // Physical buttons
    private final Set<String> buttonsPressed = new HashSet<>();
    private static final long BUTTON_TEST_TIMEOUT_MS = 8000;

    // Color sweep
    private static final String[] SWEEP_COLORS = {"Red", "Green", "Blue", "White", "Black"};
    private int sweepIndex = 0;
    private TextView tvColorName;
    private Button btnNext;

    // Camera permission
    private static final int REQUEST_CAMERA_PERMISSION = 200;
    private boolean cameraStarted = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        mode = getIntent().getStringExtra("mode");
        if (mode == null) {
            finish();
            return;
        }

        // Choose layout based on mode
        switch (mode) {
            case "multitouch":
                setContentView(R.layout.activity_multitouch);
                tvInstruction = findViewById(R.id.tvInstruction);
                tvTouchCount = findViewById(R.id.tvTouchCount);
                btnDone = findViewById(R.id.btnDone);
                btnDone.setOnClickListener(this);
                runMultiTouchTest();
                return;
            case "magnetometer":
                setContentView(R.layout.activity_magnetometer);
                tvInstruction = findViewById(R.id.tvInstruction);
                tvReadings = findViewById(R.id.tvReadings);
                tvStatus = tvReadings; // alias for generic code
                btnDone = findViewById(R.id.btnDone);
                btnDone.setOnClickListener(this);
                runSensorTest(Sensor.TYPE_MAGNETIC_FIELD, "Magnetometer");
                return;
            case "barometer":
                setContentView(R.layout.activity_magnetometer);
                tvInstruction = findViewById(R.id.tvInstruction);
                tvReadings = findViewById(R.id.tvReadings);
                tvStatus = tvReadings;
                btnDone = findViewById(R.id.btnDone);
                btnDone.setOnClickListener(this);
                runSensorTest(Sensor.TYPE_PRESSURE, "Barometer");
                return;
            case "face_unlock":
                setContentView(R.layout.activity_face_unlock);
                tvInstruction = findViewById(R.id.tvInstruction);
                tvStatus = findViewById(R.id.tvStatus);
                btnDone = findViewById(R.id.btnDone);
                btnTestCamera = findViewById(R.id.btnTestCamera);
                btnDone.setOnClickListener(this);
                btnTestCamera.setOnClickListener(this);
                runFaceUnlockCheck();
                return;
            case "colorsweep":
                setContentView(R.layout.activity_colorsweep);
                tvColorName = findViewById(R.id.tvColorName);
                tvInstruction = findViewById(R.id.tvInstruction);
                btnNext = findViewById(R.id.btnNext);
                btnNext.setOnClickListener(this);
                runColorSweep();
                return;
            default:
                // Generic layout for buttons, camera, ir
                setContentView(R.layout.activity_extra_hardware_test);
                tvInstruction = findViewById(R.id.tvInstruction);
                tvStatus = findViewById(R.id.tvStatus);
                btnDone = findViewById(R.id.btnDone);
                btnDone.setOnClickListener(this);
                break;
        }

        switch (mode) {
            case "buttons":
                runButtonTest();
                break;
            case "camera_front":
                runCameraTest(true);
                break;
            case "camera_rear":
                runCameraTest(false);
                break;
            case "ir_blaster":
                runIrBlasterCheck();
                break;
            default:
                tvStatus.setText("Unknown test mode: " + mode);
                btnDone.setVisibility(View.VISIBLE);
        }
    }

    // ---- Multi‑touch ----
    private void runMultiTouchTest() {
        tvInstruction.setText("Place up to 5 fingers on the screen.");
        tvTouchCount.setText("Touches: 0");
        TouchVisualizer visualizer = findViewById(R.id.touchVisualizer);
        visualizer.setOnTouchListener((v, event) -> {
            int count = event.getPointerCount();
            tvTouchCount.setText("Touches: " + count);
            if (count > maxPointersSeen) maxPointersSeen = count;
            return visualizer.onTouchEvent(event);
        });
        new Handler().postDelayed(() -> {
            String result = maxPointersSeen >= 5 ? "PASS (5-point multitouch detected)"
                    : maxPointersSeen >= 2 ? "PARTIAL (" + maxPointersSeen + "-point only)"
                    : "FAIL (no multitouch detected)";
            tvTouchCount.setText("Final: " + result);
            writeResult(result);
            btnDone.setVisibility(View.VISIBLE);
        }, 10000);
    }

    // ---- Physical buttons ----
    private void runButtonTest() {
        tvInstruction.setText("Press Volume Up and Volume Down within 8 seconds.");
        tvStatus.setText("Detected: (none yet)");
        new Handler().postDelayed(() -> {
            String result = "Detected: " + (buttonsPressed.isEmpty() ? "none" : String.join(", ", buttonsPressed));
            tvStatus.setText(result);
            writeResult(result);
            btnDone.setVisibility(View.VISIBLE);
        }, BUTTON_TEST_TIMEOUT_MS);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if ("buttons".equals(mode)) {
            if (keyCode == KeyEvent.KEYCODE_VOLUME_UP) buttonsPressed.add("Volume Up");
            else if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) buttonsPressed.add("Volume Down");
            tvStatus.setText("Detected: " + String.join(", ", buttonsPressed));
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    // ---- Color sweep ----
    private void runColorSweep() {
        showNextSweepColor();
    }

    private void showNextSweepColor() {
        if (sweepIndex >= SWEEP_COLORS.length) {
            tvColorName.setText("Done");
            tvInstruction.setText("Test complete. Tap Done to finish.");
            btnNext.setText("Done");
            btnNext.setOnClickListener(v -> {
                writeResult("PASS: Color sweep completed");
                finish();
            });
            return;
        }
        String colorName = SWEEP_COLORS[sweepIndex];
        int color;
        switch (colorName) {
            case "Red": color = Color.RED; break;
            case "Green": color = Color.GREEN; break;
            case "Blue": color = Color.BLUE; break;
            case "White": color = Color.WHITE; break;
            default: color = Color.BLACK;
        }
        findViewById(android.R.id.content).setBackgroundColor(color);
        tvColorName.setText(colorName);
        tvColorName.setTextColor(color == Color.WHITE || color == Color.GREEN ? Color.BLACK : Color.WHITE);
        tvInstruction.setText("Check for dead pixels or burn‑in. Tap Next to continue.");
    }

    @Override
    public void onClick(View v) {
        if (v.getId() == R.id.btnNext) {
            sweepIndex++;
            showNextSweepColor();
        } else if (v.getId() == R.id.btnDone) {
            writeResult("DONE");
            finish();
        } else if (v.getId() == R.id.btnTestCamera) {
            runCameraTest(true);
        }
    }

    // ---- Sensor test (magnetometer, barometer) ----
    private void runSensorTest(int sensorType, String label) {
        sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
        if (sensorManager == null) {
            tvStatus.setText(label + ": SensorManager unavailable");
            btnDone.setVisibility(View.VISIBLE);
            return;
        }
        activeSensor = sensorManager.getDefaultSensor(sensorType);
        if (activeSensor == null) {
            tvStatus.setText(label + ": Not present on this device");
            writeResult("SKIP: " + label + " not present");
            btnDone.setVisibility(View.VISIBLE);
            return;
        }
        tvInstruction.setText("Move the device to get readings.");
        tvStatus.setText(label + ": Reading sensor...");
        sensorManager.registerListener(this, activeSensor, SensorManager.SENSOR_DELAY_NORMAL);
        new Handler().postDelayed(() -> {
            sensorManager.unregisterListener(this);
            writeResult("DONE: " + label + " readings captured");
            btnDone.setVisibility(View.VISIBLE);
        }, 5000);
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (activeSensor == null) return;
        StringBuilder sb = new StringBuilder();
        sb.append(activeSensor.getName()).append("\n");
        for (float v : event.values) sb.append(String.format(Locale.US, "%.2f ", v));
        sb.append("\nAccuracy: ").append(event.accuracy).append("/3");
        tvStatus.setText(sb.toString());
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    // ---- Camera test (front/rear) ----
    private void runCameraTest(boolean front) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, REQUEST_CAMERA_PERMISSION);
            tvInstruction.setText("Camera permission required.");
            tvStatus.setText("Grant permission and try again.");
            btnDone.setVisibility(View.VISIBLE);
            return;
        }
        Intent intent = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
        if (front) {
            intent.putExtra("android.intent.extras.CAMERA_FACING", 1);
        }
        if (intent.resolveActivity(getPackageManager()) != null) {
            cameraStarted = true;
            startActivityForResult(intent, 100);
            tvInstruction.setText("Camera opened. Check viewfinder.");
            tvStatus.setText("Verify camera works, then press Done.");
            btnDone.setVisibility(View.VISIBLE);
        } else {
            tvStatus.setText("No camera app found.");
            writeResult("FAIL: No camera app");
            btnDone.setVisibility(View.VISIBLE);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 100) {
            tvStatus.setText("Camera returned. Did you see a clear preview?");
            // We'll let the user press Done to confirm.
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_CAMERA_PERMISSION) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                runCameraTest("camera_front".equals(mode));
            } else {
                tvStatus.setText("Camera permission denied.");
                writeResult("FAIL: Permission denied");
                btnDone.setVisibility(View.VISIBLE);
            }
        }
    }

    // ---- IR blaster ----
    private void runIrBlasterCheck() {
        PackageManager pm = getPackageManager();
        boolean hasIr = pm.hasSystemFeature(PackageManager.FEATURE_CONSUMER_IR);
        tvInstruction.setText("Checking IR blaster hardware.");
        tvStatus.setText("IR blaster: " + (hasIr ? "Present" : "Not present"));
        writeResult(hasIr ? "PASS: IR blaster present" : "SKIP: No IR blaster");
        btnDone.setVisibility(View.VISIBLE);
    }

    // ---- Face unlock ----
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
        String msg = "Face unlock feature flag: " + hasFaceFeature + "\nBiometric status: " + canAuth;
        tvStatus.setText(msg);
        writeResult(hasFaceFeature ? "PASS: Face unlock hardware present" : "SKIP: No face unlock hardware");

        if (hasFaceFeature) {
            btnTestCamera.setVisibility(View.VISIBLE);
            btnTestCamera.setText("Test Front Camera");
        }
        btnDone.setVisibility(View.VISIBLE);
    }

    // ---- Write result file ----
    private void writeResult(String text) {
        try {
            java.io.File file = new java.io.File("/data/local/tmp/hwtest_result.txt");
            file.getParentFile().mkdirs();
            java.io.FileWriter fw = new java.io.FileWriter(file);
            fw.write(text);
            fw.close();
        } catch (Exception ignored) {}
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (sensorManager != null && activeSensor != null) {
            try { sensorManager.unregisterListener(this); } catch (Exception ignored) {}
        }
    }
}