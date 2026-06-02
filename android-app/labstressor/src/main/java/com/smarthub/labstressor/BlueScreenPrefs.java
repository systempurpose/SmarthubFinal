package com.smarthub.labstressor;

import android.content.Context;
import android.content.SharedPreferences;

final class BlueScreenPrefs {
    private static final String PREFS = "labstressor";
    private static final String KEY_ENABLED = "blue_screen_enabled";
    private static final String KEY_ENABLED_UNTIL_MS = "blue_screen_enabled_until_ms";
    private static final String KEY_FIRST_RUN_DONE = "blue_screen_first_run_done";

    static boolean isEnabled(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean enabled = prefs.getBoolean(KEY_ENABLED, false);
        if (!enabled) return false;

        long untilMs = prefs.getLong(KEY_ENABLED_UNTIL_MS, 0L);
        if (untilMs <= 0L) return true;

        long now = System.currentTimeMillis();
        if (now <= untilMs) return true;

        // Auto-expired.
        prefs.edit().putBoolean(KEY_ENABLED, false).putLong(KEY_ENABLED_UNTIL_MS, 0L).apply();
        return false;
    }

    static void setEnabled(Context context, boolean enabled) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!enabled) {
            prefs.edit().putBoolean(KEY_ENABLED, false).putLong(KEY_ENABLED_UNTIL_MS, 0L).apply();
            return;
        }
        prefs.edit().putBoolean(KEY_ENABLED, true).apply();
    }

    static void enableForDurationMs(Context context, long durationMs) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        long until = now + Math.max(60_000L, durationMs);
        prefs.edit().putBoolean(KEY_ENABLED, true).putLong(KEY_ENABLED_UNTIL_MS, until).apply();
    }

    static boolean isFirstRunDone(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return prefs.getBoolean(KEY_FIRST_RUN_DONE, false);
    }

    static void setFirstRunDone(Context context, boolean done) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(KEY_FIRST_RUN_DONE, done).apply();
    }

    private BlueScreenPrefs() {}
}
