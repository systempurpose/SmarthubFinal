package com.smarthub.diagnostics;

import android.app.admin.DeviceAdminReceiver;
import android.content.Context;
import android.content.Intent;
import android.widget.Toast;

/**
 * Required to make this app eligible for Device Owner provisioning via:
 *   adb shell dpm set-device-owner com.smarthub.diagnostics/.SmartHubDeviceAdminReceiver
 *
 * This must be run on a freshly factory-reset device before any account is added — it's an
 * Android platform requirement, not something the app itself can trigger.
 *
 * Once granted, DevicePolicyManager.isDeviceOwnerApp() returns true and
 * TelephonyManager.getImei() works reliably on Android 10+, which is otherwise blocked for
 * every non-privileged app regardless of which permissions are granted.
 */
public class SmartHubDeviceAdminReceiver extends DeviceAdminReceiver {

    @Override
    public void onEnabled(Context context, Intent intent) {
        super.onEnabled(context, intent);
        Toast.makeText(context, "SmartHub device admin enabled", Toast.LENGTH_SHORT).show();
    }

    @Override
    public void onDisabled(Context context, Intent intent) {
        super.onDisabled(context, intent);
        Toast.makeText(context, "SmartHub device admin disabled", Toast.LENGTH_SHORT).show();
    }
}