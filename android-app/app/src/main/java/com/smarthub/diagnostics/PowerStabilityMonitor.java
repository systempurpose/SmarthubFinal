package com.smarthub.diagnostics;

import android.content.Context;
import android.content.Intent;
import android.os.BatteryManager;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayDeque;

/**
 * Best-effort power/USB stability monitor.
 *
 * Goal: capture signals that can suggest a loose USB cable/port (frequent connect/disconnect)
 * or power-path instability hints (sudden voltage drops) while the SmartHub desktop is running.
 *
 * Limitations: Android cannot reliably detect "loose internal battery connector" directly.
 * We only infer from observable symptoms (voltage/current/plug flapping).
 */
public final class PowerStabilityMonitor {

    private static final int MAX_SAMPLES = 25;
    private static final long TOGGLE_WINDOW_MS = 2 * 60 * 1000L;
    private static final long VOLT_DROP_WINDOW_MS = 45 * 1000L;

    private final Context appContext;

    private final ArrayDeque<JSONObject> samples = new ArrayDeque<>();
    private final ArrayDeque<Long> usbToggleTimes = new ArrayDeque<>();

    private long startedAtMs = System.currentTimeMillis();

    private boolean lastUsbConnectedKnown = false;
    private boolean lastUsbConnected = false;
    private long lastUsbChangeAtMs = 0L;

    private int usbToggleTotal = 0;
    private int powerConnectedTotal = 0;
    private int powerDisconnectedTotal = 0;

    private long lastVoltageSampleAtMs = 0L;
    private Integer lastVoltageMv = null;
    private int voltageDropEvents = 0;

    public PowerStabilityMonitor(Context context) {
        this.appContext = context.getApplicationContext();
    }

    public synchronized void reset() {
        samples.clear();
        usbToggleTimes.clear();
        startedAtMs = System.currentTimeMillis();
        lastUsbConnectedKnown = false;
        lastUsbConnected = false;
        lastUsbChangeAtMs = 0L;
        usbToggleTotal = 0;
        powerConnectedTotal = 0;
        powerDisconnectedTotal = 0;
        lastVoltageSampleAtMs = 0L;
        lastVoltageMv = null;
        voltageDropEvents = 0;
    }

    /**
     * Feed sticky ACTION_BATTERY_CHANGED intents here.
     */
    public synchronized void recordBatteryIntent(Intent batteryIntent) {
        if (batteryIntent == null) return;

        final long now = System.currentTimeMillis();

        int plugged = batteryIntent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
        boolean usbConnected = (plugged & BatteryManager.BATTERY_PLUGGED_USB) != 0;

        if (!lastUsbConnectedKnown) {
            lastUsbConnectedKnown = true;
            lastUsbConnected = usbConnected;
            lastUsbChangeAtMs = now;
        } else if (usbConnected != lastUsbConnected) {
            lastUsbConnected = usbConnected;
            lastUsbChangeAtMs = now;
            usbToggleTotal++;
            usbToggleTimes.addLast(now);
            trimOldToggles(now);
            if (usbConnected) powerConnectedTotal++; else powerDisconnectedTotal++;
        }

        // Capture a lightweight sample.
        JSONObject sample = buildSampleFromIntent(batteryIntent, now);
        if (sample != null) {
            samples.addLast(sample);
            while (samples.size() > MAX_SAMPLES) samples.removeFirst();

            Integer v = sample.optInt("voltageMv", -1);
            if (v != null && v > 0) {
                updateVoltageDropHeuristic(v, now);
            }
        }
    }

    private void trimOldToggles(long now) {
        while (!usbToggleTimes.isEmpty()) {
            Long t = usbToggleTimes.peekFirst();
            if (t == null) break;
            if (now - t > TOGGLE_WINDOW_MS) usbToggleTimes.removeFirst();
            else break;
        }
    }

    private void updateVoltageDropHeuristic(int voltageMv, long now) {
        if (lastVoltageMv == null) {
            lastVoltageMv = voltageMv;
            lastVoltageSampleAtMs = now;
            return;
        }

        long dt = now - lastVoltageSampleAtMs;
        int dv = lastVoltageMv - voltageMv;

        // Count only sudden drops within a short window.
        // 250–400 mV drops can happen under load, but repeated sudden drops are suspicious.
        if (dt > 0 && dt <= VOLT_DROP_WINDOW_MS && dv >= 350) {
            voltageDropEvents++;
        }

        lastVoltageMv = voltageMv;
        lastVoltageSampleAtMs = now;
    }

    private JSONObject buildSampleFromIntent(Intent i, long now) {
        try {
            JSONObject s = new JSONObject();
            s.put("t", now);

            int level = i.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = i.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            if (level >= 0 && scale > 0) {
                int pct = Math.round((level * 100f) / scale);
                s.put("levelPercent", pct);
            }

            int plugged = i.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
            s.put("plugged", plugged);

            int status = i.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            if (status != -1) s.put("status", status);

            int health = i.getIntExtra(BatteryManager.EXTRA_HEALTH, -1);
            if (health != -1) s.put("health", health);

            int voltageMv = i.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1);
            if (voltageMv > 0) s.put("voltageMv", voltageMv);

            int tempDeciC = i.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
            if (tempDeciC != Integer.MIN_VALUE) s.put("tempDeciC", tempDeciC);

            BatteryManager bm = (BatteryManager) appContext.getSystemService(Context.BATTERY_SERVICE);
            if (bm != null) {
                int currentUa = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW);
                if (currentUa != Integer.MIN_VALUE) s.put("currentMicroAmp", currentUa);

                int chargeCounterUah = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER);
                if (chargeCounterUah != Integer.MIN_VALUE) s.put("chargeCounterMicroAh", chargeCounterUah);
            }

            return s;
        } catch (JSONException e) {
            return null;
        }
    }

    public synchronized JSONObject toJson() {
        try {
            long now = System.currentTimeMillis();
            trimOldToggles(now);

            JSONObject root = new JSONObject();
            root.put("startedAt", startedAtMs);
            root.put("collectedForMs", Math.max(0, now - startedAtMs));

            JSONObject usb = new JSONObject();
            usb.put("usbConnected", lastUsbConnectedKnown && lastUsbConnected);
            usb.put("lastUsbChangeAt", lastUsbChangeAtMs);
            usb.put("toggleTotal", usbToggleTotal);
            usb.put("togglesLast2Min", usbToggleTimes.size());
            usb.put("powerConnectedTotal", powerConnectedTotal);
            usb.put("powerDisconnectedTotal", powerDisconnectedTotal);
            root.put("usb", usb);

            JSONObject battery = new JSONObject();
            battery.put("voltageDropEvents", voltageDropEvents);
            JSONArray arr = new JSONArray();
            for (JSONObject s : samples) arr.put(s);
            battery.put("samples", arr);
            root.put("battery", battery);

            JSONObject suspected = new JSONObject();
            boolean looseCableOrPort = usbToggleTimes.size() >= 3;
            boolean powerPathInstability = voltageDropEvents >= 2 && usbToggleTimes.size() == 0;
            suspected.put("looseUsbCableOrPort", looseCableOrPort);
            suspected.put("powerPathInstabilityPossible", powerPathInstability);

            JSONArray notes = new JSONArray();
            if (looseCableOrPort) {
                notes.put("Frequent USB power connect/disconnect events were seen in a short window. This often indicates a loose cable, loose port, or unstable USB connection.");
            }
            if (powerPathInstability) {
                notes.put("Multiple sudden battery-voltage drops were observed without USB toggling. This can happen under heavy load, but repeated drops can also suggest battery wear or power-path instability.");
            }
            if (notes.length() > 0) suspected.put("notes", notes);

            root.put("suspected", suspected);
            return root;
        } catch (JSONException e) {
            return new JSONObject();
        }
    }
}
