package com.smarthub.labstressor;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

public class MainActivity extends AppCompatActivity {

    private TextView status;
    private TextView timer;
    private TextView expected;
    private TextView version;
    private View blueOverlay;
    private TextView blueTimer;
    private TextView blueWorking;
    private TextView blueVersion;

    private final AtomicBoolean running = new AtomicBoolean(false);
    private final List<Thread> workers = new ArrayList<>();

    private long stressStartMs = 0L;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Runnable statusTick = new Runnable() {
        @Override
        public void run() {
            updateUi();
            ui.postDelayed(this, 750);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // Keep the screen on during the lab run so the overlay/timer remains visible.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        status = findViewById(R.id.status);
        timer = findViewById(R.id.timer);
        expected = findViewById(R.id.expected);
        version = findViewById(R.id.version);
        blueOverlay = findViewById(R.id.blue_overlay);
        blueTimer = findViewById(R.id.blue_timer);
        blueWorking = findViewById(R.id.blue_working);
        blueVersion = findViewById(R.id.blue_version);

        String versionText = "Version: " + BuildConfig.VERSION_NAME + " (" + BuildConfig.VERSION_CODE + ")";
        if (version != null) version.setText(versionText);
        if (blueVersion != null) blueVersion.setText(versionText);

        // Record first run, but do NOT auto-enable the persistent (system overlay) mode.
        // We only auto-show the in-app simulation when the app is opened.
        if (!BlueScreenPrefs.isFirstRunDone(this)) {
            BlueScreenPrefs.setFirstRunDone(this, true);
        }

        // Lab behavior: fully automatic. When the app opens, start stress and show the simulated blue screen.
        // Safe Mode is the "fix" path: never run the stressor there.
        if (getPackageManager().isSafeMode()) {
            BlueScreenPrefs.setEnabled(this, false);
            setBlueOverlayVisible(false);
        } else {
            // Immediate visual confirmation that the lab run started.
            setBlueOverlayVisible(true);
            startStress();
            autoStartSimulatedBsodOnLaunch();

            // Optional: time-limited persistence (auto-expires) so you can reboot and still see the simulation
            // without any UI buttons. User can still disable via the system overlay's button or by Safe Mode.
            if (Settings.canDrawOverlays(this)) {
                BlueScreenPrefs.enableForDurationMs(this, 30L * 60L * 1000L);
                Intent start = new Intent(this, BlueScreenService.class);
                start.setAction(BlueScreenService.ACTION_START);
                startForegroundService(start);
            }
        }

        updateUi();
        ui.post(statusTick);
    }

    private void autoStartSimulatedBsodOnLaunch() {
        if (getPackageManager().isSafeMode()) {
            // Safe Mode is the "fix" signal in the lab: never persist the simulation here.
            BlueScreenPrefs.setEnabled(this, false);
            setBlueOverlayVisible(false);
            return;
        }

        // Lab behavior: whenever the app is opened, immediately show the simulated "blue screen".
        // This is in-app and always has an Exit button + back-button escape.
        setBlueOverlayVisible(true);

        // If the user previously enabled the persistent overlay mode, ensure the service is running.
        if (BlueScreenPrefs.isEnabled(this) && Settings.canDrawOverlays(this)) {
            Intent start = new Intent(this, BlueScreenService.class);
            start.setAction(BlueScreenService.ACTION_START);
            startForegroundService(start);
        }
    }

    @Override
    public void onBackPressed() {
        if (blueOverlay != null && blueOverlay.getVisibility() == View.VISIBLE) {
            // Single recovery path (no buttons): Back stops the stress and exits.
            stopStress();
            finish();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        ui.removeCallbacks(statusTick);
        stopStress();
    }

    private void updateUi() {
        boolean isRunning = running.get();
        if (status != null) {
            status.setText(isRunning ? getString(R.string.status_running) : getString(R.string.status_idle));
        }

        String timerText;
        if (!isRunning || stressStartMs <= 0L) {
            timerText = getString(R.string.timer_initial);
        } else {
            long elapsedMs = System.currentTimeMillis() - stressStartMs;
            if (elapsedMs < 0) elapsedMs = 0;
            long totalSec = elapsedMs / 1000L;
            long min = totalSec / 60L;
            long sec = totalSec % 60L;
            timerText = String.format("Timer: %02d:%02d", min, sec);
        }

        if (timer != null) timer.setText(timerText);
        if (blueTimer != null) blueTimer.setText(timerText);
        if (blueWorking != null) blueWorking.setVisibility(isRunning ? View.VISIBLE : View.GONE);
    }

    private void setBlueOverlayVisible(boolean visible) {
        if (blueOverlay == null) return;
        blueOverlay.setVisibility(visible ? View.VISIBLE : View.GONE);
    }

    private void enablePersistentBlueScreen() {
        if (getPackageManager().isSafeMode()) {
            BlueScreenPrefs.setEnabled(this, false);
            setBlueOverlayVisible(false);
            return;
        }

        if (!Settings.canDrawOverlays(this)) {
            Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getPackageName()));
            startActivity(i);
            // Keep an in-app overlay as immediate feedback while user grants permission.
            setBlueOverlayVisible(true);
            return;
        }

        BlueScreenPrefs.setEnabled(this, true);
        Intent start = new Intent(this, BlueScreenService.class);
        start.setAction(BlueScreenService.ACTION_START);
        startForegroundService(start);
        setBlueOverlayVisible(true);
    }

    private void disablePersistentBlueScreen() {
        BlueScreenPrefs.setEnabled(this, false);
        Intent stop = new Intent(this, BlueScreenService.class);
        stop.setAction(BlueScreenService.ACTION_STOP);
        startService(stop);
        setBlueOverlayVisible(false);
    }

    private void startStress() {
        if (!running.compareAndSet(false, true)) return;

        stressStartMs = System.currentTimeMillis();

        // For lab testing: switch to the full-screen blue overlay as soon as stress begins.
        // This makes the "freeze" scenario visually obvious even before the UI becomes sluggish.
        setBlueOverlayVisible(true);

        // Use all cores to make the effect obvious even on fast devices.
        int cores = Runtime.getRuntime().availableProcessors();
        int workerCount = Math.max(1, cores);

        workers.clear();
        for (int i = 0; i < workerCount; i++) {
            Thread t = new Thread(new CpuBurner(running), "LabStressor-" + i);
            t.setPriority(Thread.MAX_PRIORITY);
            t.start();
            workers.add(t);
        }

        updateUi();
    }

    private void stopStress() {
        if (!running.compareAndSet(true, false)) {
            updateUi();
            return;
        }

        stressStartMs = 0L;

        for (Thread t : workers) {
            try {
                t.interrupt();
            } catch (Exception ignored) {
            }
        }
        workers.clear();

        updateUi();
    }

    private static class CpuBurner implements Runnable {
        private final AtomicBoolean running;

        CpuBurner(AtomicBoolean running) {
            this.running = running;
        }

        @Override
        public void run() {
            // Tight loop to consume CPU. We intentionally avoid allocations.
            double x = 0.0001;
            while (running.get() && !Thread.currentThread().isInterrupted()) {
                // Some floating point work so it doesn't get optimized away.
                x = Math.sin(x) * Math.cos(x) + 1.0000001;
                if (x > 10_000) x = 0.0001;
            }
        }
    }
}
