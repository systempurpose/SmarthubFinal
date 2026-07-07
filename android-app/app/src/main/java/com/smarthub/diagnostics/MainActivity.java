package com.smarthub.diagnostics;

import android.Manifest;
import android.app.ActivityManager;
import android.app.admin.DevicePolicyManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;  

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
import android.os.Debug;
import android.os.Environment;
import android.os.StatFs;
import android.telephony.SignalStrength;
import android.telephony.TelephonyManager;
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
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.net.InetAddress;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Random;

import android.content.pm.PackageInfo;
import android.content.pm.Signature;
import android.content.pm.PackageManager;
import android.content.pm.PermissionInfo;
import android.os.Build;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.view.accessibility.AccessibilityManager;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import java.security.MessageDigest;
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
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
                // Added: needed for IMEI, signal strength, network type
                Manifest.permission.READ_PHONE_STATE
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
        appendLine(sb, "  Cycle count: " + getBatteryCycleCount());
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
        appendLine(sb, "  App memory stability (3s sample): " + testMemoryStability());
        appendLine(sb, "");

        appendLine(sb, "STORAGE (internal data)");
        File internal = Environment.getDataDirectory();
        appendStorageStats(sb, "  /data", internal);
        appendLine(sb, "  Speed benchmark: " + testStorageSpeed());
        appendLine(sb, "");

        appendLine(sb, "OS / BUILD");
        appendLine(sb, "  Android: " + Build.VERSION.RELEASE + " (SDK " + Build.VERSION.SDK_INT + ")");
        appendLine(sb, "  Device: " + Build.MANUFACTURER + " " + Build.MODEL);
        appendLine(sb, "  Fingerprint: " + Build.FINGERPRINT);
        appendLine(sb, "");

        appendLine(sb, "CELLULAR / IMEI");
        appendLine(sb, "  IMEI: " + getImeiInfo());
        appendLine(sb, "  Signal strength: " + getSignalStrengthInfo());
        appendLine(sb, "  Network type: " + getNetworkTypeInfo());
        appendLine(sb, "");

        appendLine(sb, "DNS RESOLUTION");
        appendLine(sb, "  " + testDnsResolution());
        appendLine(sb, "");

        SensorSummary sensorSummary = new SensorSummary(this);
        appendLine(sb, "SENSORS");
        appendLine(sb, "  Accelerometer: " + sensorSummary.hasAccelerometer);
        appendLine(sb, "  Gyroscope: " + sensorSummary.hasGyroscope);
        appendLine(sb, "  Proximity: " + sensorSummary.hasProximity);
        appendLine(sb, "  Light: " + sensorSummary.hasLight);
        appendLine(sb, "  Magnetometer: " + sensorSummary.hasMagnetometer);
        appendLine(sb, "  Barometer: " + sensorSummary.hasBarometer);

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

    // ==== NEW: NATIVE TELEPHONY DIAGNOSTICS ====

    /**
     * TelephonyManager.getImei() works reliably here (unlike ADB shell attempts) ONLY if this
     * app is Device Owner. Without that, Android 10+ blocks IMEI for every non-privileged app,
     * app or shell, with no workaround. Provision once via:
     *   adb shell dpm set-device-owner com.smarthub.diagnostics/.SmartHubDeviceAdminReceiver
     * on a freshly factory-reset device before any account is added.
     */
    private String getImeiInfo() {
        TelephonyManager tm = (TelephonyManager) getSystemService(Context.TELEPHONY_SERVICE);
        if (tm == null) return "TelephonyManager unavailable";

        DevicePolicyManager dpm = (DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE);
        boolean isDeviceOwner = dpm != null && dpm.isDeviceOwnerApp(getPackageName());

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE)
                != PackageManager.PERMISSION_GRANTED) {
            return "READ_PHONE_STATE not granted";
        }

        try {
            String imei;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                imei = tm.getImei();
            } else {
                //noinspection deprecation
                imei = tm.getDeviceId();
            }
            if (imei != null && imei.length() >= 14) {
                return imei + (isDeviceOwner ? " (via Device Owner)" : "");
            }
            return "Not accessible" + (isDeviceOwner ? "" : " — app is not Device Owner (required on Android 10+)");
        } catch (SecurityException e) {
            return "Not accessible — requires Device Owner or system privilege on Android 10+ (dial *#06# to view manually)";
        }
    }

    /**
     * Uses TelephonyManager.getSignalStrength() (API 28+), which returns Android's own computed
     * 0-4 level directly. This avoids the exact bug seen when parsing `dumpsys telephony.registry`
     * text over ADB — that approach grabbed the wrong RAT block (CDMA sentinel) instead of the
     * real LTE reading, since the CDMA "no signal" sentinel field appears first in the dump.
     */
    private String getSignalStrengthInfo() {
        TelephonyManager tm = (TelephonyManager) getSystemService(Context.TELEPHONY_SERVICE);
        if (tm == null) return "TelephonyManager unavailable";
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE)
                != PackageManager.PERMISSION_GRANTED) {
            return "READ_PHONE_STATE not granted";
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            return "Requires Android 9+ (direct signal strength API)";
        }
        try {
            SignalStrength ss = tm.getSignalStrength();
            if (ss == null) return "No signal data available (no active cellular connection)";
            int level = ss.getLevel(); // 0 (none/unknown) .. 4 (excellent)
            String[] labels = {"None/Unknown", "Poor", "Fair", "Good", "Excellent"};
            int clamped = Math.max(0, Math.min(4, level));
            return labels[clamped] + " (level " + level + "/4)";
        } catch (SecurityException e) {
            return "Permission denied reading signal strength";
        }
    }

    /**
     * Uses TelephonyManager.getDataNetworkType(), a stable enum. The ADB-side equivalent broke
     * because `mDataNetworkType` doesn't exist at all in this device's telephony.registry dump —
     * confirmed by direct testing. This API doesn't depend on dumpsys text format at all.
     */
    private String getNetworkTypeInfo() {
        TelephonyManager tm = (TelephonyManager) getSystemService(Context.TELEPHONY_SERVICE);
        if (tm == null) return "TelephonyManager unavailable";
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE)
                != PackageManager.PERMISSION_GRANTED) {
            return "READ_PHONE_STATE not granted";
        }
        try {
            int simState = tm.getSimState();
            if (simState == TelephonyManager.SIM_STATE_ABSENT || simState == TelephonyManager.SIM_STATE_UNKNOWN) {
                return "No SIM installed — mobile data not applicable";
            }
            int networkType = tm.getDataNetworkType();
            return networkTypeToString(networkType);
        } catch (SecurityException e) {
            return "Permission denied reading network type";
        }
    }

    private String networkTypeToString(int type) {
        switch (type) {
            case TelephonyManager.NETWORK_TYPE_LTE: return "LTE";
            case TelephonyManager.NETWORK_TYPE_NR: return "NR (5G)";
            case TelephonyManager.NETWORK_TYPE_HSPAP: return "HSPA+";
            case TelephonyManager.NETWORK_TYPE_HSPA: return "HSPA";
            case TelephonyManager.NETWORK_TYPE_HSDPA: return "HSDPA";
            case TelephonyManager.NETWORK_TYPE_HSUPA: return "HSUPA";
            case TelephonyManager.NETWORK_TYPE_UMTS: return "UMTS";
            case TelephonyManager.NETWORK_TYPE_EDGE: return "EDGE";
            case TelephonyManager.NETWORK_TYPE_GPRS: return "GPRS";
            case TelephonyManager.NETWORK_TYPE_CDMA: return "CDMA";
            case TelephonyManager.NETWORK_TYPE_EVDO_0: return "EVDO_0";
            case TelephonyManager.NETWORK_TYPE_EVDO_A: return "EVDO_A";
            case TelephonyManager.NETWORK_TYPE_EVDO_B: return "EVDO_B";
            case TelephonyManager.NETWORK_TYPE_UNKNOWN: return "Unknown";
            default: return "Type " + type;
        }
    }

    /**
     * In-process DNS resolution using InetAddress — no dependency on `ping`/`curl` binaries
     * existing on-device, which the ADB-side equivalent required.
     * Note: runs on a background thread with a join() timeout to keep this callable synchronously
     * from the existing report-building flow; for a smoother UI this should ideally be fully async.
     */
    private String testDnsResolution() {
        final String[] result = {"Not tested"};
        Thread t = new Thread(() -> {
            try {
                InetAddress addr = InetAddress.getByName("google.com");
                result[0] = "Resolved: " + addr.getHostAddress();
            } catch (Exception e) {
                result[0] = "Failed: " + e.getMessage();
            }
        });
        t.start();
        try {
            t.join(5000);
        } catch (InterruptedException ignored) {}
        if (t.isAlive()) {
            return "Timed out after 5s (no network route or DNS unreachable)";
        }
        return result[0];
    }

    /**
     * Real write/read benchmark against the app's own cache directory. Avoids the `dd`/toybox
     * dependency the ADB-side version needed, and works identically across every device since
     * it uses plain java.io instead of shelling out.
     */
    private String testStorageSpeed() {
        File testFile = new File(getCacheDir(), "speedtest.tmp");
        byte[] buffer = new byte[1024 * 1024]; // 1MB buffer
        new Random().nextBytes(buffer);
        long totalBytes = 50L * 1024 * 1024; // 50MB test

        try {
            long writeStart = System.nanoTime();
            try (FileOutputStream fos = new FileOutputStream(testFile)) {
                long written = 0;
                while (written < totalBytes) {
                    fos.write(buffer);
                    written += buffer.length;
                }
                fos.getFD().sync(); // force to storage, not just page cache
            }
            long writeElapsedNs = System.nanoTime() - writeStart;
            double writeMBps = (totalBytes / (1024.0 * 1024.0)) / (writeElapsedNs / 1_000_000_000.0);

            long readStart = System.nanoTime();
            try (FileInputStream fis = new FileInputStream(testFile)) {
                byte[] readBuf = new byte[1024 * 1024];
                //noinspection StatementWithEmptyBody
                while (fis.read(readBuf) != -1) { /* discard */ }
            }
            long readElapsedNs = System.nanoTime() - readStart;
            double readMBps = (totalBytes / (1024.0 * 1024.0)) / (readElapsedNs / 1_000_000_000.0);

            return String.format(Locale.US, "Write: %.1f MB/s, Read: %.1f MB/s", writeMBps, readMBps);
        } catch (Exception e) {
            return "Error: " + e.getMessage();
        } finally {
            //noinspection ResultOfMethodCallIgnored
            testFile.delete();
        }
    }

    /**
     * BATTERY_PROPERTY_CYCLE_COUNT was added in API 34; referenced by its literal int value (10)
     * via reflection-free direct call so this compiles regardless of compileSdk version. Includes
     * the same plausibility guard used on the Windows side (values above ~3000 are treated as
     * invalid rather than trusted, since some devices misreport a different counter here).
     */
    private String getBatteryCycleCount() {
        BatteryManager bm = (BatteryManager) getSystemService(Context.BATTERY_SERVICE);
        if (bm == null) return "Not available";
        try {
            int cycles = bm.getIntProperty(10); // BatteryManager.BATTERY_PROPERTY_CYCLE_COUNT
            if (cycles > 0 && cycles <= 3000) return cycles + " cycles";
            if (cycles > 3000) return "Reported value (" + cycles + ") is not a valid cycle count on this device";
            return "Not reported by this device";
        } catch (Exception e) {
            return "Not available (requires Android 14+)";
        }
    }

    /**
     * Tracks this app's own PSS over a short window as a lightweight stability signal.
     * IMPORTANT: post-Android 8, apps cannot inspect other processes' memory for privacy reasons —
     * true system-wide leak detection across arbitrary apps is only reliably available via the
     * Windows/ADB side (`dumpsys meminfo <package>`), which has broader access. This is a
     * same-process proxy only, not a replacement for that.
     */
    private String testMemoryStability() {
        Debug.MemoryInfo mi1 = new Debug.MemoryInfo();
        Debug.getMemoryInfo(mi1);
        int pss1 = mi1.getTotalPss();

        try { Thread.sleep(3000); } catch (InterruptedException ignored) {}

        Debug.MemoryInfo mi2 = new Debug.MemoryInfo();
        Debug.getMemoryInfo(mi2);
        int pss2 = mi2.getTotalPss();

        int delta = pss2 - pss1;
        return "App PSS: " + pss1 + "KB -> " + pss2 + "KB (Δ" + delta + "KB over 3s, this app's process only)";
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
/**
 * Returns a JSONArray with per‑app security metadata.
 * Now more conservative: only marks as "suspicious" if:
 *   - dangerous permissions ≥ 3 AND (accessibility OR deviceAdmin) AND not from Play Store
 *   - OR obfuscated package name + dangerous permissions ≥ 2
 * Also checks for launcher icon to reduce false positives.
 */
private JSONArray getAppSecurityMetadata() {
    JSONArray result = new JSONArray();
    PackageManager pm = getPackageManager();
    List<ApplicationInfo> apps = pm.getInstalledApplications(PackageManager.GET_META_DATA);
    AccessibilityManager am = (AccessibilityManager) getSystemService(Context.ACCESSIBILITY_SERVICE);
    DevicePolicyManager dpm = (DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE);

    for (ApplicationInfo appInfo : apps) {
        try {
            String packageName = appInfo.packageName;
            JSONObject obj = new JSONObject();
            obj.put("packageName", packageName);
            obj.put("appName", pm.getApplicationLabel(appInfo).toString());

            // Installer
            String installer = pm.getInstallerPackageName(packageName);
            obj.put("installer", installer != null ? installer : "unknown");

            // System app?
            boolean isSystem = (appInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0;
            obj.put("isSystem", isSystem);

            // Dangerous permissions count
            int dangerousCount = 0;
            try {
                PackageInfo pkgInfo = pm.getPackageInfo(packageName, PackageManager.GET_PERMISSIONS);
                String[] requestedPerms = pkgInfo.requestedPermissions;
                if (requestedPerms != null) {
                    for (String perm : requestedPerms) {
                        try {
                            PermissionInfo permInfo = pm.getPermissionInfo(perm, 0);
                            if ((permInfo.protectionLevel & PermissionInfo.PROTECTION_DANGEROUS) != 0) {
                                dangerousCount++;
                            }
                        } catch (PackageManager.NameNotFoundException ignored) {}
                    }
                }
            } catch (PackageManager.NameNotFoundException e) {
                // ignore
            }
            obj.put("dangerousPermissionsCount", dangerousCount);

            // Accessibility enabled?
            boolean accessibilityEnabled = false;
            if (am != null) {
                List<AccessibilityServiceInfo> services = am.getEnabledAccessibilityServiceList(
                        AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
                for (AccessibilityServiceInfo service : services) {
                    android.content.pm.ResolveInfo resolveInfo = service.getResolveInfo();
                    if (resolveInfo != null && resolveInfo.serviceInfo != null) {
                        ComponentName cn = new ComponentName(resolveInfo.serviceInfo.packageName,
                                resolveInfo.serviceInfo.name);
                        if (cn.getPackageName().equals(packageName)) {
                            accessibilityEnabled = true;
                            break;
                        }
                    }
                }
            }
            obj.put("accessibilityEnabled", accessibilityEnabled);

            // Device admin enabled?
            boolean deviceAdminEnabled = false;
            if (dpm != null && dpm.isDeviceOwnerApp(packageName)) {
                deviceAdminEnabled = true;
            }
            if (!deviceAdminEnabled) {
                List<ComponentName> admins = dpm != null ? dpm.getActiveAdmins() : null;
                if (admins != null) {
                    for (ComponentName cn : admins) {
                        if (cn.getPackageName().equals(packageName)) {
                            deviceAdminEnabled = true;
                            break;
                        }
                    }
                }
            }
            obj.put("deviceAdminEnabled", deviceAdminEnabled);

            // ---- Check if app has launcher icon (reduces false positives) ----
            boolean hasLauncher = false;
            Intent intent = new Intent(Intent.ACTION_MAIN);
            intent.addCategory(Intent.CATEGORY_LAUNCHER);
            intent.setPackage(packageName);
            List<ResolveInfo> resolveInfos = pm.queryIntentActivities(intent, 0);
            hasLauncher = resolveInfos != null && !resolveInfos.isEmpty();
            obj.put("hasLauncher", hasLauncher);

            // ---- Security verdict (more conservative) ----
            String verdict;
            // Trusted installer (Play Store, Galaxy Store, etc.)
            boolean fromLegitStore = installer != null && (
                    installer.equals("com.android.vending") ||
                    installer.equals("com.sec.android.app.samsungapps") ||
                    installer.equals("com.google.android.feedback") ||
                    installer.startsWith("com.google.")
            );

            // Obfuscated package name check (simple)
            boolean isObfuscated = packageName.split("\\.").length > 4 ||
                    packageName.chars().filter(c -> c == '.').count() > 4 ||
                    packageName.matches(".*[0-9a-f]{8,}.*");

            // Only mark as suspicious if:
            //   - dangerous permissions >= 3 AND (accessibility OR deviceAdmin) AND not from legit store
            //   - OR obfuscated AND dangerous permissions >= 2 AND not from legit store
            if (!isSystem && !fromLegitStore) {
                boolean highRisk = (dangerousCount >= 3 && (accessibilityEnabled || deviceAdminEnabled));
                boolean obfuscatedRisk = isObfuscated && dangerousCount >= 2;
                if (highRisk || obfuscatedRisk) {
                    // If it has a launcher, reduce suspicion (assume it's a normal app with many perms)
                    if (hasLauncher) {
                        verdict = "unknown"; // not safe, but not high risk
                    } else {
                        verdict = "suspicious";
                    }
                } else {
                    verdict = "unknown";
                }
            } else {
                verdict = "safe";
            }
            obj.put("securityVerdict", verdict);

            result.put(obj);
        } catch (Exception e) {
            // Skip this app
        }
    }
    return result;
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
            JSONArray appSecurityMeta = getAppSecurityMetadata();
            root.put("appSecurityMeta", appSecurityMeta);

            JSONObject batteryJson = new JSONObject();
            if (level >= 0) batteryJson.put("levelPercent", level);
            if (currentNow != Integer.MIN_VALUE) batteryJson.put("currentMicroAmp", currentNow);
            batteryJson.put("cycleCount", getBatteryCycleCount());

            JSONObject memoryJson = new JSONObject();
            memoryJson.put("totalBytes", memInfo.totalMem);
            memoryJson.put("availableBytes", memInfo.availMem);
            memoryJson.put("lowMemory", memInfo.lowMemory);
            memoryJson.put("stabilitySample", testMemoryStability());

            JSONObject storageJson = new JSONObject();
            storageJson.put("path", internal.getPath());
            storageJson.put("totalBytes", totalBytes);
            storageJson.put("usedBytes", usedBytes);
            storageJson.put("freeBytes", freeBytes);
            storageJson.put("speedBenchmark", testStorageSpeed());

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
            sensorsJson.put("hasMagnetometer", sensorSummary.hasMagnetometer);
            sensorsJson.put("hasBarometer", sensorSummary.hasBarometer);

            JSONObject cellularJson = new JSONObject();
            cellularJson.put("imei", getImeiInfo());
            cellularJson.put("signalStrength", getSignalStrengthInfo());
            cellularJson.put("networkType", getNetworkTypeInfo());
            root.put("cellular", cellularJson);

            JSONObject dnsJson = new JSONObject();
            dnsJson.put("result", testDnsResolution());
            root.put("dns", dnsJson);

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
            // Keep the appStorage key with an empty array (backend scan is used)
            root.put("appStorage", new JSONArray());

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

    // This method is now a placeholder – real data comes from backend scan
    private JSONArray getAppStorageStats() {
        return new JSONArray();
    }

    private static class SensorSummary {
        final boolean hasAccelerometer;
        final boolean hasGyroscope;
        final boolean hasProximity;
        final boolean hasLight;
        final boolean hasMagnetometer;
        final boolean hasBarometer;

        SensorSummary(Context context) {
            SensorManager sm = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
            boolean accel = false;
            boolean gyro = false;
            boolean prox = false;
            boolean light = false;
            boolean mag = false;
            boolean baro = false;
            if (sm != null) {
                java.util.List<Sensor> list = sm.getSensorList(Sensor.TYPE_ALL);
                for (Sensor s : list) {
                    int type = s.getType();
                    if (type == Sensor.TYPE_ACCELEROMETER) accel = true;
                    else if (type == Sensor.TYPE_GYROSCOPE) gyro = true;
                    else if (type == Sensor.TYPE_PROXIMITY) prox = true;
                    else if (type == Sensor.TYPE_LIGHT) light = true;
                    else if (type == Sensor.TYPE_MAGNETIC_FIELD) mag = true;
                    else if (type == Sensor.TYPE_PRESSURE) baro = true;
                }
            }
            this.hasAccelerometer = accel;
            this.hasGyroscope = gyro;
            this.hasProximity = prox;
            this.hasLight = light;
            this.hasMagnetometer = mag;
            this.hasBarometer = baro;
        }
    }
}