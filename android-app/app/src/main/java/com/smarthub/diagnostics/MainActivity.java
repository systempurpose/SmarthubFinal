package com.smarthub.diagnostics;

import android.Manifest;
import android.app.ActivityManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.StatFs;
import android.provider.Settings;
import android.text.format.Formatter;
import android.util.DisplayMetrics;
import android.view.Display;
import android.view.WindowManager;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;

import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONArray;

import java.io.File;
import java.io.FileReader;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private static final int PERMISSION_REQUEST_CODE = 100;

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
    private MalwareScanner malwareScanner;

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
        malwareScanner = new MalwareScanner(this);

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        if (prefs.getBoolean(KEY_LICENSE_ACCEPTED, false)) {
            // License already accepted – check and request permissions
            checkAndRequestPermissions();
        } else {
            showLicenseGate(prefs);
        }
    }

    private String loadLicenseText() {
        return "SmartHub Mobile Diagnostics - License Agreement\n\n" +
                "This software is provided for diagnostic purposes only.\n" +
                "By using this software, you agree that the developer is not liable for any damages.\n" +
                "Data collected is used solely for device diagnostics.\n";
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
            checkAndRequestPermissions();
        });
        builder.setNegativeButton("Exit", (dialog, which) -> {
            dialog.dismiss();
            finish();
        });
        builder.show();
    }

    // ==================== PERMISSION REQUEST ====================
    private void checkAndRequestPermissions() {
        String[] permissions = {
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
        };

        List<String> missing = new ArrayList<>();
        for (String perm : permissions) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                missing.add(perm);
            }
        }

        if (missing.isEmpty()) {
            Toast.makeText(this, "All permissions granted", Toast.LENGTH_SHORT).show();
            startDiagnosticsSession();
        } else {
            ActivityCompat.requestPermissions(this,
                    missing.toArray(new String[0]),
                    PERMISSION_REQUEST_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
            boolean allGranted = true;
            for (int i = 0; i < permissions.length; i++) {
                if (grantResults[i] != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    Toast.makeText(this, "Permission " + permissions[i] + " denied – some tests may not work",
                            Toast.LENGTH_LONG).show();
                }
            }
            // Start diagnostics regardless (some tests may be limited)
            startDiagnosticsSession();
        }
    }

    // ==================== DIAGNOSTICS SESSION ====================
    private void startDiagnosticsSession() {
        if (powerMonitor == null) {
            powerMonitor = new PowerStabilityMonitor(this);
            powerMonitor.reset();
        }

        saveJsonReport(false);

        long now = System.currentTimeMillis();
        String when = android.text.format.DateFormat.format("yyyy-MM-dd HH:mm", now).toString();
        if (lastUpdated != null) {
            lastUpdated.setText("Latest report generated: " + when + " (visible in SmartHub desktop)");
        }

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

        diagnosticStateReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if (ACTION_DIAGNOSTIC_START.equals(action)) {
                    diagnosticActive = true;
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
            try { unregisterReceiver(powerReceiver); } catch (Exception ignored) {}
        }
        if (diagnosticStateReceiver != null) {
            try { unregisterReceiver(diagnosticStateReceiver); } catch (Exception ignored) {}
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
            writeText(outFile, jsonString);
            if (showToast) {
                Toast.makeText(this, "JSON report saved to " + outFile.getAbsolutePath(), Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            if (showToast) {
                Toast.makeText(this, "Failed to save JSON: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        }
    }

    private void writeText(File file, String contents) throws Exception {
        FileOutputStream fos = null;
        try {
            fos = new FileOutputStream(file);
            fos.write(contents.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        } finally {
            if (fos != null) {
                try { fos.close(); } catch (Exception ignored) {}
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

        appendLine(sb, "\nCPU");
        appendLine(sb, getCpuInfo());
        appendLine(sb, "\nNETWORK");
        appendLine(sb, getNetworkInfo());
        appendLine(sb, "\nDISPLAY");
        appendLine(sb, getDisplayInfo());
        appendLine(sb, "\nGPU");
        appendLine(sb, getGpuInfo());
        appendLine(sb, "\nEXTERNAL STORAGE");
        appendLine(sb, getExternalStorageInfo());

        appendLine(sb, "\nMALWARE SCAN");
        try {
            JSONObject scanResults = getMalwareScanResults();
            appendLine(sb, "  Total Apps: " + scanResults.getInt("totalApps"));
            appendLine(sb, "  Suspicious: " + scanResults.getInt("suspiciousCount"));
            appendLine(sb, "  High Risk: " + scanResults.getInt("highRiskCount"));
            appendLine(sb, "  Device Rooted: " + (scanResults.getBoolean("isRooted") ? "YES" : "NO"));
        } catch (Exception e) {
            appendLine(sb, "  Error: " + e.getMessage());
        }

        return sb.toString().trim();
    }

    // ==== HARDWARE HELPERS ====

    private String getCpuInfo() {
        StringBuilder sb = new StringBuilder();
        try {
            BufferedReader br = new BufferedReader(new FileReader("/proc/cpuinfo"));
            String line;
            while ((line = br.readLine()) != null) {
                if (line.startsWith("processor") || line.startsWith("Hardware") || line.startsWith("model name")) {
                    sb.append(line.trim()).append("\n");
                }
            }
            br.close();
            int cores = Runtime.getRuntime().availableProcessors();
            sb.append("Cores: ").append(cores).append("\n");
            try {
                BufferedReader freqBr = new BufferedReader(new FileReader("/sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq"));
                String freq = freqBr.readLine();
                if (freq != null) {
                    long freqKhz = Long.parseLong(freq);
                    sb.append("Max frequency: ").append(freqKhz / 1000).append(" MHz\n");
                }
                freqBr.close();
            } catch (Exception ignored) {}
        } catch (Exception e) {
            sb.append("Error reading CPU info: ").append(e.getMessage());
        }
        return sb.toString();
    }

    private String getNetworkInfo() {
        StringBuilder sb = new StringBuilder();
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (cm == null) return "ConnectivityManager not available";
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
            if (wm != null) {
                WifiInfo wifiInfo = wm.getConnectionInfo();
                if (wifiInfo != null) {
                    String ssid = wifiInfo.getSSID();
                    if (ssid != null && !ssid.equals("<unknown ssid>")) {
                        sb.append("WiFi SSID: ").append(ssid).append("\n");
                        int rssi = wifiInfo.getRssi();
                        int level = WifiManager.calculateSignalLevel(rssi, 4);
                        sb.append("WiFi signal: ").append(level + 1).append("/4 bars\n");
                        int ip = wifiInfo.getIpAddress();
                        if (ip != 0) {
                            String ipStr = String.format("%d.%d.%d.%d", (ip & 0xff), (ip >> 8 & 0xff), (ip >> 16 & 0xff), (ip >> 24 & 0xff));
                            sb.append("IP address: ").append(ipStr).append("\n");
                        }
                    }
                }
            }
            NetworkInfo mobileNet = cm.getNetworkInfo(ConnectivityManager.TYPE_MOBILE);
            if (mobileNet != null && mobileNet.isConnected()) {
                sb.append("Mobile data: connected (").append(mobileNet.getSubtypeName()).append(")\n");
            } else {
                sb.append("Mobile data: not connected\n");
            }
        } catch (Exception e) {
            sb.append("Error reading network info: ").append(e.getMessage());
        }
        return sb.toString();
    }

    private String getDisplayInfo() {
        StringBuilder sb = new StringBuilder();
        try {
            WindowManager wm = (WindowManager) getSystemService(WINDOW_SERVICE);
            if (wm == null) return "Display info not available";
            Display display = wm.getDefaultDisplay();
            DisplayMetrics metrics = new DisplayMetrics();
            display.getMetrics(metrics);
            int width = metrics.widthPixels;
            int height = metrics.heightPixels;
            sb.append("Resolution: ").append(width).append("x").append(height).append("\n");
            sb.append("Density: ").append(metrics.densityDpi).append(" dpi\n");
            float refreshRate = display.getRefreshRate();
            sb.append("Refresh rate: ").append(refreshRate).append(" Hz\n");
        } catch (Exception e) {
            sb.append("Error reading display info: ").append(e.getMessage());
        }
        return sb.toString();
    }

    private String getGpuInfo() {
        StringBuilder sb = new StringBuilder();
        try {
            try {
                BufferedReader br = new BufferedReader(new FileReader("/system/build.prop"));
                String line;
                while ((line = br.readLine()) != null) {
                    if (line.startsWith("ro.hwui.renderer")) {
                        sb.append("Renderer: ").append(line.split("=")[1]).append("\n");
                    }
                    if (line.startsWith("ro.gpu.driver")) {
                        sb.append("GPU driver: ").append(line.split("=")[1]).append("\n");
                    }
                }
                br.close();
            } catch (Exception ignored) {}
            try {
                BufferedReader br = new BufferedReader(new FileReader("/proc/cpuinfo"));
                String line;
                while ((line = br.readLine()) != null) {
                    if (line.toLowerCase().contains("gpu")) {
                        sb.append(line.trim()).append("\n");
                    }
                }
                br.close();
            } catch (Exception ignored) {}
            if (sb.length() == 0) {
                sb.append("GPU info not available");
            }
        } catch (Exception e) {
            sb.append("Error reading GPU info: ").append(e.getMessage());
        }
        return sb.toString();
    }

    private String getExternalStorageInfo() {
        StringBuilder sb = new StringBuilder();
        try {
            File[] storages = getExternalFilesDirs(null);
            if (storages != null && storages.length > 1) {
                for (int i = 0; i < storages.length; i++) {
                    if (storages[i] != null) {
                        File path = storages[i];
                        try {
                            StatFs stat = new StatFs(path.getPath());
                            long blockSize = stat.getBlockSizeLong();
                            long totalBlocks = stat.getBlockCountLong();
                            long availBlocks = stat.getAvailableBlocksLong();
                            long totalBytes = blockSize * totalBlocks;
                            long freeBytes = blockSize * availBlocks;
                            long usedBytes = totalBytes - freeBytes;
                            sb.append("External storage ").append(i).append(": ")
                                    .append(readableBytes(totalBytes)).append(" total, ")
                                    .append(readableBytes(usedBytes)).append(" used, ")
                                    .append(readableBytes(freeBytes)).append(" free\n");
                        } catch (Exception ignored) {}
                    }
                }
            } else {
                sb.append("No external storage (SD card) detected.\n");
            }
        } catch (Exception e) {
            sb.append("Error reading external storage: ").append(e.getMessage());
        }
        return sb.toString();
    }

    // ==== MALWARE SCAN ====

    private JSONObject getMalwareScanResults() {
        if (malwareScanner == null) {
            malwareScanner = new MalwareScanner(this);
        }
        try {
            return malwareScanner.scanAllApps(false);
        } catch (Exception e) {
            JSONObject error = new JSONObject();
            try { error.put("error", e.getMessage()); } catch (Exception ignored) {}
            return error;
        }
    }

    // ==== JSON REPORT ====

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

            JSONObject cpuJson = new JSONObject();
            cpuJson.put("info", getCpuInfo());
            root.put("cpu", cpuJson);

            JSONObject networkJson = new JSONObject();
            networkJson.put("info", getNetworkInfo());
            root.put("network", networkJson);

            JSONObject displayJson = new JSONObject();
            displayJson.put("info", getDisplayInfo());
            root.put("display", displayJson);

            JSONObject gpuJson = new JSONObject();
            gpuJson.put("info", getGpuInfo());
            root.put("gpu", gpuJson);

            JSONObject extStorageJson = new JSONObject();
            extStorageJson.put("info", getExternalStorageInfo());
            root.put("externalStorage", extStorageJson);

            JSONObject malwareJson = new JSONObject();
            try {
                JSONObject scanResults = getMalwareScanResults();
                malwareJson.put("totalApps", scanResults.getInt("totalApps"));
                malwareJson.put("suspiciousCount", scanResults.getInt("suspiciousCount"));
                malwareJson.put("highRiskCount", scanResults.getInt("highRiskCount"));
                malwareJson.put("isRooted", scanResults.getBoolean("isRooted"));
                malwareJson.put("suspiciousApps", scanResults.getJSONArray("suspicious"));
                malwareJson.put("highRiskApps", scanResults.getJSONArray("highRisk"));
            } catch (Exception e) {
                malwareJson.put("error", e.getMessage());
            }
            root.put("malwareScan", malwareJson);

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

    // ==== UI METHODS ====

    private void updateConnectionStatus(Intent batteryIntent) {
        if (connectionStatus == null) return;

        if (powerMonitor != null && batteryIntent != null) {
            powerMonitor.recordBatteryIntent(batteryIntent);
        }

        int plugged = batteryIntent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
        usbConnected = (plugged & BatteryManager.BATTERY_PLUGGED_USB) != 0;

        if (usbConnected) {
            connectionStatus.setText("USB cable connected – SmartHub desktop can read this phone.");
            connectionStatus.setBackgroundColor(0xFFCCE8CF);
            connectionStatus.setTextColor(Color.BLACK);
        } else {
            connectionStatus.setText("USB cable not detected – connect to SmartHub desktop via USB.");
            connectionStatus.setBackgroundColor(0xFFFDE0E0);
            connectionStatus.setTextColor(Color.BLACK);
        }

        applySpinnerState();
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
            try {
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } catch (Exception ignored) {}
        } else {
            diagnosticSpinner.setVisibility(ProgressBar.GONE);
            try {
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } catch (Exception ignored) {}
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
            appendLine(sb, label + " total " + readableBytes(total) + ", used " + readableBytes(used) + ", free " + readableBytes(free));
        } catch (Exception e) {
            appendLine(sb, label + " error reading stats: " + e.getMessage());
        }
    }

    private String readableBytes(long bytes) {
        return Formatter.formatFileSize(this, bytes);
    }

    private void appendLine(StringBuilder sb, String text) {
        sb.append(text).append('\n');
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