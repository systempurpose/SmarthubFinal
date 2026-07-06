package com.smarthub.diagnostics;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.hardware.biometrics.BiometricManager;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.common.util.concurrent.ListenableFuture;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutionException;

import android.Manifest;

public class ExtraHardwareTestActivity extends AppCompatActivity implements SensorEventListener, View.OnClickListener {

    private String mode;
    private TextView tvInstruction;
    private TextView tvStatus;
    private TextView tvTouchCount;
    private TextView tvReadings;
    private TextView tvColorName;
    private Button btnNext;
    private SensorManager sensorManager;
    private Sensor activeSensor;

    // Multi-touch
    private int maxPointersSeen = 0;

    // Physical buttons
    private final Set<String> buttonsPressed = new HashSet<>();

    // Color sweep
    private static final String[] SWEEP_COLORS = {"Red", "Green", "Blue", "White", "Black"};
    private int sweepIndex = 0;
    private LinearLayout rootLayout;

    // Camera
    private static final int REQUEST_CAMERA_PERMISSION = 200;
    private PreviewView previewView;
    private TextView tvCameraStatus;
    private ListenableFuture<ProcessCameraProvider> cameraProviderFuture;
    private boolean cameraTestFront = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        mode = getIntent().getStringExtra("mode");
        if (mode == null) {
            finish();
            return;
        }

        switch (mode) {
            case "multitouch":
                setContentView(R.layout.activity_multitouch);
                tvInstruction = findViewById(R.id.tvInstruction);
                tvTouchCount = findViewById(R.id.tvTouchCount);
                runMultiTouchTest();
                return;
            case "colorsweep":
                setContentView(R.layout.activity_colorsweep);
                tvColorName = findViewById(R.id.tvColorName);
                tvInstruction = findViewById(R.id.tvInstruction);
                btnNext = findViewById(R.id.btnNext);
                rootLayout = findViewById(R.id.rootLayout);
                btnNext.setOnClickListener(this);
                runColorSweep();
                return;
            case "magnetometer":
                setContentView(R.layout.activity_magnetometer);
                tvInstruction = findViewById(R.id.tvInstruction);
                tvReadings = findViewById(R.id.tvReadings);
                tvStatus = tvReadings;
                runSensorTest(Sensor.TYPE_MAGNETIC_FIELD, "Magnetometer");
                return;
            case "barometer":
                setContentView(R.layout.activity_magnetometer);
                tvInstruction = findViewById(R.id.tvInstruction);
                tvReadings = findViewById(R.id.tvReadings);
                tvStatus = tvReadings;
                runSensorTest(Sensor.TYPE_PRESSURE, "Barometer");
                return;
            case "face_unlock":
                setContentView(R.layout.activity_face_unlock);
                tvInstruction = findViewById(R.id.tvInstruction);
                tvStatus = findViewById(R.id.tvStatus);
                runFaceUnlockCheck();
                return;
            case "camera_front":
            case "camera_rear":
                // Camera uses a different layout; handled in runCameraTest()
                runCameraTest(mode.equals("camera_front"));
                return;
            default:
                setContentView(R.layout.activity_extra_hardware_test);
                tvInstruction = findViewById(R.id.tvInstruction);
                tvStatus = findViewById(R.id.tvStatus);
                break;
        }

        switch (mode) {
            case "buttons":
                runButtonTest();
                break;
            case "ir_blaster":
                runIrBlasterCheck();
                break;
            default:
                tvStatus.setText("Unknown test mode: " + mode);
        }
    }

    // ---- Multi-touch ----
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
    }

    // ---- Physical buttons ----
    private void runButtonTest() {
        tvInstruction.setText("Press Volume Up and Volume Down.");
        tvStatus.setText("Detected: (none yet)");
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
            tvInstruction.setText("All colors shown. Close the app when done.");
            btnNext.setVisibility(View.GONE);
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
        if (rootLayout != null) rootLayout.setBackgroundColor(color);
        tvColorName.setText(colorName);
        tvColorName.setTextColor(color == Color.WHITE || color == Color.GREEN ? Color.BLACK : Color.WHITE);
        tvInstruction.setText("Check for dead pixels. Tap 'Next' to cycle.");
        btnNext.setVisibility(View.VISIBLE);
    }

    @Override
    public void onClick(View v) {
        if (v.getId() == R.id.btnNext) {
            sweepIndex++;
            showNextSweepColor();
        }
    }

    // ---- Sensor tests ----
    private void runSensorTest(int sensorType, String label) {
        sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
        if (sensorManager == null) {
            tvStatus.setText(label + ": SensorManager unavailable");
            return;
        }
        activeSensor = sensorManager.getDefaultSensor(sensorType);
        if (activeSensor == null) {
            tvStatus.setText(label + ": Not present on this device");
            return;
        }
        tvInstruction.setText("Move the device to get readings.");
        tvStatus.setText(label + ": Reading sensor...");
        sensorManager.registerListener(this, activeSensor, SensorManager.SENSOR_DELAY_NORMAL);
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

    // ---- Camera tests using CameraX ----
    private void runCameraTest(boolean front) {
        cameraTestFront = front;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, REQUEST_CAMERA_PERMISSION);
            // Show a temporary message; will continue after permission grant
            return;
        }
        // Switch to camera preview layout
        setContentView(R.layout.activity_camera_preview);
        previewView = findViewById(R.id.previewView);
        tvCameraStatus = findViewById(R.id.tvCameraStatus);
        tvInstruction = findViewById(R.id.tvInstruction);

        startCamera(front);
    }

    private void startCamera(boolean front) {
        cameraProviderFuture = ProcessCameraProvider.getInstance(this);
        cameraProviderFuture.addListener(() -> {
            try {
                ProcessCameraProvider cameraProvider = cameraProviderFuture.get();
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());

                CameraSelector cameraSelector = new CameraSelector.Builder()
                        .requireLensFacing(front ? CameraSelector.LENS_FACING_FRONT : CameraSelector.LENS_FACING_BACK)
                        .build();

                cameraProvider.unbindAll();
                Camera camera = cameraProvider.bindToLifecycle(this, cameraSelector, preview);

                String facing = front ? "Front" : "Rear";
                tvCameraStatus.setText(facing + " camera is active");
                tvInstruction.setText("Check that the preview is clear and working.\nClose the app when done.");

            } catch (ExecutionException | InterruptedException e) {
                tvCameraStatus.setText("Camera error: " + e.getMessage());
            }
        }, ContextCompat.getMainExecutor(this));
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_CAMERA_PERMISSION) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                runCameraTest(cameraTestFront);
            } else {
                // If permission denied, show a message and finish.
                setContentView(R.layout.activity_extra_hardware_test);
                tvInstruction = findViewById(R.id.tvInstruction);
                tvStatus = findViewById(R.id.tvStatus);
                tvInstruction.setText("Camera permission required.");
                tvStatus.setText("Permission denied – cannot test camera.");
            }
        }
    }

    // ---- IR blaster ----
    private void runIrBlasterCheck() {
        PackageManager pm = getPackageManager();
        boolean hasIr = pm.hasSystemFeature(PackageManager.FEATURE_CONSUMER_IR);
        tvInstruction.setText("IR blaster test.");
        tvStatus.setText("IR blaster: " + (hasIr ? "Present" : "Not present"));
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
        tvInstruction.setText("Face unlock hardware check.");
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (sensorManager != null && activeSensor != null) {
            try { sensorManager.unregisterListener(this); } catch (Exception ignored) {}
        }
    }
}