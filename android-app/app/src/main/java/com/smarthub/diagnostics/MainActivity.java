package com.smarthub.diagnostics;

import android.app.ActivityManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.StatFs;
import android.text.format.Formatter;
import android.graphics.Color;
import android.view.WindowManager;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.ProgressBar;
import android.content.SharedPreferences;
import android.content.res.Resources;
import java.io.InputStream;
import java.io.BufferedReader;
import java.io.InputStreamReader;

import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;

public class MainActivity extends AppCompatActivity {

    private TextView connectionStatus;
    private TextView lastUpdated;
    private BroadcastReceiver powerReceiver;
    private ProgressBar diagnosticSpinner;
    private BroadcastReceiver diagnosticStateReceiver;
    private boolean diagnosticActive = false;
    private boolean usbConnected = false;
    private PowerStabilityMonitor powerMonitor;
    private long lastReportWriteAtMs = 0L;
    private static final long REPORT_WRITE_MIN_INTERVAL_MS = 12_000L;

    private static final String ACTION_DIAGNOSTIC_START = "com.smarthub.DIAGNOSTICS_START";
    private static final String ACTION_DIAGNOSTIC_STOP = "com.smarthub.DIAGNOSTICS_STOP";
    private static final String PREFS_NAME = "smarthub_prefs";
    private static final String KEY_LICENSE_ACCEPTED = "license_accepted";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        connectionStatus = findViewById(R.id.connection_status);
        lastUpdated = findViewById(R.id.last_updated);
        diagnosticSpinner = findViewById(R.id.diagnostic_spinner);

        if (diagnosticSpinner != null) {
            diagnosticSpinner.setVisibility(ProgressBar.GONE);
        }

        connectionStatus.setText("Desktop connection: waiting for SmartHub…");

        // Show license agreement once on first launch. Do not proceed with
        // diagnostics/report generation unless the user agrees.
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        if (prefs.getBoolean(KEY_LICENSE_ACCEPTED, false)) {
            startDiagnosticsSession();
        } else {
            showLicenseGate(prefs);
        }
    }

    private String loadLicenseText() {
        StringBuilder sb = new StringBuilder();
        try {
            Resources res = getResources();
            InputStream in = res.openRawResource(R.raw.license);
            BufferedReader reader = new BufferedReader(new InputStreamReader(in));
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
            reader.close();
        } catch (Exception e) {
            sb.append("License text unavailable.");
        }
        return sb.toString();
    }

    private void showLicenseGate(SharedPreferences prefs) {
        String text = loadLicenseText();
        MaterialAlertDialogBuilder builder = new MaterialAlertDialogBuilder(this);
        builder.setTitle("License agreement");
        builder.setMessage("Please read and accept the SmartHub Mobile Diagnostics license before using the app.\n\n" + text);
        builder.setCancelable(false);
        builder.setPositiveButton("I agree", (dialog, which) -> {
            prefs.edit().putBoolean(KEY_LICENSE_ACCEPTED, true).apply();
            dialog.dismiss();
            startDiagnosticsSession();
        });
        builder.setNegativeButton("Exit", (dialog, which) -> {
            dialog.dismiss();
            finish();
        });
        builder.show();
    }

    private void startDiagnosticsSession() {
        if (powerMonitor == null) {
            powerMonitor = new PowerStabilityMonitor(this);
            powerMonitor.reset();
        }

        // Generate a fresh JSON report for the desktop companion as soon as
        // the app opens so the PC can pull it over ADB without additional taps.
        saveJsonReport(false);

        // After saving, update the timestamp hint so the technician knows
        // that the desktop can now read a fresh report.
        long now = System.currentTimeMillis();
        String when = android.text.format.DateFormat.format("yyyy-MM-dd HH:mm", now).toString();
        if (lastUpdated != null) {
            lastUpdated.setText("Latest report generated: " + when + " (visible in SmartHub desktop)");
        }

        // Listen for changes in power/USB state so we can reflect whether the
        // phone is physically connected over USB (approximation of desktop link).
        powerReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                updateConnectionStatus(intent);
            }
        };
        Intent sticky = registerReceiver(powerReceiver, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (sticky != null) {
            updateConnectionStatus(sticky);
        }

        // Listen for desktop-controlled diagnostic start/stop broadcasts so the
        // loading spinner only appears while the Windows/desktop app is
        // actively running diagnostics.
        diagnosticStateReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if (ACTION_DIAGNOSTIC_START.equals(action)) {
                    diagnosticActive = true;
                    // Reset monitor at the start of each desktop-driven run so the
                    // stability window reflects the current diagnostic session.
                    if (powerMonitor != null) powerMonitor.reset();
                    maybeWriteReport(true);
                } else if (ACTION_DIAGNOSTIC_STOP.equals(action)) {
                    diagnosticActive = false;
                    maybeWriteReport(true);
                }
                applySpinnerState();
            }
        };
        IntentFilter diagFilter = new IntentFilter();
        diagFilter.addAction(ACTION_DIAGNOSTIC_START);
        diagFilter.addAction(ACTION_DIAGNOSTIC_STOP);
        // Android 13+ requires specifying exported/not-exported for
        // non-system broadcasts when registering a receiver.
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(diagnosticStateReceiver, diagFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(diagnosticStateReceiver, diagFilter);
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (powerReceiver != null) {
            try {
                unregisterReceiver(powerReceiver);
            } catch (Exception ignored) {
            }
        }
        if (diagnosticStateReceiver != null) {
            try {
                unregisterReceiver(diagnosticStateReceiver);
            } catch (Exception ignored) {
            }
        }
    }

    private void saveJsonReport(boolean showToast) {
        JSONObject json = buildJsonReport();
        String jsonString = json.toString();

        File dir = getExternalFilesDir(null);
        if (dir == null) {
            dir = getFilesDir();
        }
        File outFile = new File(dir, "smarthub_diagnostics.json");
        try {
            FileUtils.writeText(outFile, jsonString);
            if (showToast) {
                Toast.makeText(this, "JSON report saved to " + outFile.getAbsolutePath(), Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            if (showToast) {
                Toast.makeText(this, "Failed to save JSON: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        }
    }

    private String buildSummary() {
        BatteryManager bm = (BatteryManager) getSystemService(Context.BATTERY_SERVICE);
        int level = bm != null ? bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) : -1;

        ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo memInfo = new ActivityManager.MemoryInfo();
        if (am != null) {
            am.getMemoryInfo(memInfo);
        }
        String totalRam = memInfo.totalMem > 0 ? readableBytes(memInfo.totalMem) : "-";

        File internal = Environment.getDataDirectory();
        StatFs internalStats = new StatFs(internal.getPath());
        long blockSize = internalStats.getBlockSizeLong();
        long totalBlocks = internalStats.getBlockCountLong();
        long availBlocks = internalStats.getAvailableBlocksLong();

        long totalBytes = blockSize * totalBlocks;
        long freeBytes = blockSize * availBlocks;

        String totalStorage = readableBytes(totalBytes);
        String freeStorage = readableBytes(freeBytes);

        return "Battery " + (level >= 0 ? level + "%" : "-") + " · RAM " + totalRam + " · Storage " + freeStorage + " / " + totalStorage;
    }

    private String buildDetails() {
        StringBuilder sb = new StringBuilder();

        BatteryManager bm = (BatteryManager) getSystemService(Context.BATTERY_SERVICE);
        int level = bm != null ? bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) : -1;
        int currentNow = bm != null ? bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW) : Integer.MIN_VALUE;

        appendLine(sb, "BATTERY");
        appendLine(sb, "  Level: " + (level >= 0 ? level + "%" : "-"));
        if (currentNow != Integer.MIN_VALUE) appendLine(sb, "  Current now: " + currentNow + " µA (sign/device dependent)");
        appendLine(sb, "");

        ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo memInfo = new ActivityManager.MemoryInfo();
        if (am != null) {
            am.getMemoryInfo(memInfo);
        }
        appendLine(sb, "MEMORY");
        appendLine(sb, "  Total RAM: " + readableBytes(memInfo.totalMem));
        appendLine(sb, "  Available: " + readableBytes(memInfo.availMem));
        appendLine(sb, "  Low memory?: " + memInfo.lowMemory);
        appendLine(sb, "");

        appendLine(sb, "STORAGE (internal data)");
        File internal = Environment.getDataDirectory();
        appendStorageStats(sb, "  /data", internal);
        appendLine(sb, "");

        appendLine(sb, "OS / BUILD");
        appendLine(sb, "  Android: " + Build.VERSION.RELEASE + " (SDK " + Build.VERSION.SDK_INT + ")");
        appendLine(sb, "  Device: " + Build.MANUFACTURER + " " + Build.MODEL);
        appendLine(sb, "  Fingerprint: " + Build.FINGERPRINT);
        appendLine(sb, "");

        SensorSummary sensorSummary = new SensorSummary(this);
        appendLine(sb, "SENSORS");
        appendLine(sb, "  Accelerometer: " + sensorSummary.hasAccelerometer);
        appendLine(sb, "  Gyroscope: " + sensorSummary.hasGyroscope);
        appendLine(sb, "  Proximity: " + sensorSummary.hasProximity);
        appendLine(sb, "  Light: " + sensorSummary.hasLight);

        return sb.toString().trim();
    }

    private JSONObject buildJsonReport() {
        JSONObject root = new JSONObject();

        BatteryManager bm = (BatteryManager) getSystemService(Context.BATTERY_SERVICE);
        int level = bm != null ? bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) : -1;
        int currentNow = bm != null ? bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW) : Integer.MIN_VALUE;

        ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo memInfo = new ActivityManager.MemoryInfo();
        if (am != null) {
            am.getMemoryInfo(memInfo);
        }

        File internal = Environment.getDataDirectory();
        StatFs stat = new StatFs(internal.getPath());
        long blockSize = stat.getBlockSizeLong();
        long totalBlocks = stat.getBlockCountLong();
        long availBlocks = stat.getAvailableBlocksLong();
        long totalBytes = blockSize * totalBlocks;
        long freeBytes = blockSize * availBlocks;
        long usedBytes = totalBytes - freeBytes;

        SensorSummary sensorSummary = new SensorSummary(this);

        try {
            JSONObject batteryJson = new JSONObject();
            if (level >= 0) batteryJson.put("levelPercent", level);
            if (currentNow != Integer.MIN_VALUE) batteryJson.put("currentMicroAmp", currentNow);

            JSONObject memoryJson = new JSONObject();
            memoryJson.put("totalBytes", memInfo.totalMem);
            memoryJson.put("availableBytes", memInfo.availMem);
            memoryJson.put("lowMemory", memInfo.lowMemory);

            JSONObject storageJson = new JSONObject();
            storageJson.put("path", internal.getPath());
            storageJson.put("totalBytes", totalBytes);
            storageJson.put("usedBytes", usedBytes);
            storageJson.put("freeBytes", freeBytes);

            JSONObject osJson = new JSONObject();
            osJson.put("androidVersion", Build.VERSION.RELEASE);
            osJson.put("sdkInt", Build.VERSION.SDK_INT);
            osJson.put("manufacturer", Build.MANUFACTURER);
            osJson.put("model", Build.MODEL);
            osJson.put("fingerprint", Build.FINGERPRINT);

            JSONObject sensorsJson = new JSONObject();
            sensorsJson.put("hasAccelerometer", sensorSummary.hasAccelerometer);
            sensorsJson.put("hasGyroscope", sensorSummary.hasGyroscope);
            sensorsJson.put("hasProximity", sensorSummary.hasProximity);
            sensorsJson.put("hasLight", sensorSummary.hasLight);

            root.put("summary", buildSummary());
            root.put("battery", batteryJson);
            root.put("memory", memoryJson);
            root.put("storage", storageJson);
            root.put("os", osJson);
            root.put("sensors", sensorsJson);
            if (powerMonitor != null) {
                root.put("powerStability", powerMonitor.toJson());
            }
            root.put("generatedAt", System.currentTimeMillis());
        } catch (JSONException ignored) {
        }

        return root;
    }

    private void updateConnectionStatus(Intent batteryIntent) {
        if (connectionStatus == null) return;

        if (powerMonitor != null && batteryIntent != null) {
            powerMonitor.recordBatteryIntent(batteryIntent);
        }

        int plugged = batteryIntent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
        usbConnected = (plugged & BatteryManager.BATTERY_PLUGGED_USB) != 0;

        if (usbConnected) {
            connectionStatus.setText("USB cable connected – SmartHub desktop can read this phone.");
            connectionStatus.setBackgroundColor(0xFFCCE8CF); // soft green
            connectionStatus.setTextColor(Color.BLACK);
        } else {
            connectionStatus.setText("USB cable not detected – connect to SmartHub desktop via USB.");
            connectionStatus.setBackgroundColor(0xFFFDE0E0); // soft red
            connectionStatus.setTextColor(Color.BLACK);
        }

        applySpinnerState();

        // While a desktop diagnostic is active, keep the JSON report reasonably fresh
        // so the PC can pull a near-real-time stability snapshot.
        maybeWriteReport(false);
    }

    private void maybeWriteReport(boolean force) {
        long now = System.currentTimeMillis();
        if (!force) {
            if (!diagnosticActive) return;
            if (now - lastReportWriteAtMs < REPORT_WRITE_MIN_INTERVAL_MS) return;
        }
        lastReportWriteAtMs = now;
        saveJsonReport(false);
    }

    private void applySpinnerState() {
        if (diagnosticSpinner == null) return;
        if (usbConnected && diagnosticActive) {
            diagnosticSpinner.setVisibility(ProgressBar.VISIBLE);
            // Prevent the screen from sleeping during an active desktop-driven
            // diagnostic session. Some OEM builds aggressively power-manage USB
            // when the device is idle/locked, which can look like repeated
            // disconnect/reconnect on the PC.
            try {
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } catch (Exception ignored) {
            }
        } else {
            diagnosticSpinner.setVisibility(ProgressBar.GONE);
            try {
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } catch (Exception ignored) {
            }
        }
    }

    private void appendStorageStats(StringBuilder sb, String label, File dir) {
        try {
            StatFs stat = new StatFs(dir.getPath());
            long blockSize = stat.getBlockSizeLong();
            long totalBlocks = stat.getBlockCountLong();
            long availBlocks = stat.getAvailableBlocksLong();
            long total = blockSize * totalBlocks;
            long free = blockSize * availBlocks;
            long used = total - free;
            appendLine(sb, label + "  total " + readableBytes(total) + ", used " + readableBytes(used) + ", free " + readableBytes(free));
        } catch (Exception e) {
            appendLine(sb, label + "  error reading stats: " + e.getMessage());
        }
    }

    private String readableBytes(long bytes) {
        return Formatter.formatFileSize(this, bytes);
    }

    private void appendLine(StringBuilder sb, String text) {
        sb.append(text).append('\n');
    }

    private static class FileUtils {
        static void writeText(File file, String contents) throws Exception {
            java.io.FileOutputStream fos = null;
            try {
                fos = new java.io.FileOutputStream(file);
                fos.write(contents.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            } finally {
                if (fos != null) {
                    try {
                        fos.close();
                    } catch (Exception ignored) {
                    }
                }
            }
        }
    }

    private static class SensorSummary {
        final boolean hasAccelerometer;
        final boolean hasGyroscope;
        final boolean hasProximity;
        final boolean hasLight;

        SensorSummary(Context context) {
            SensorManager sm = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
            boolean accel = false;
            boolean gyro = false;
            boolean prox = false;
            boolean light = false;
            if (sm != null) {
                java.util.List<Sensor> list = sm.getSensorList(Sensor.TYPE_ALL);
                for (Sensor s : list) {
                    int type = s.getType();
                    if (type == Sensor.TYPE_ACCELEROMETER) accel = true;
                    else if (type == Sensor.TYPE_GYROSCOPE) gyro = true;
                    else if (type == Sensor.TYPE_PROXIMITY) prox = true;
                    else if (type == Sensor.TYPE_LIGHT) light = true;
                }
            }
            this.hasAccelerometer = accel;
            this.hasGyroscope = gyro;
            this.hasProximity = prox;
            this.hasLight = light;
        }
    }
}
