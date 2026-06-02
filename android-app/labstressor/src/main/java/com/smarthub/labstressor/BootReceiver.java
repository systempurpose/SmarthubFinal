package com.smarthub.labstressor;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null) return;

        // In Safe Mode, third-party apps are typically disabled. Also: never persist the simulation in Safe Mode.
        if (context.getPackageManager().isSafeMode()) {
            BlueScreenPrefs.setEnabled(context, false);
            return;
        }

        if (!BlueScreenPrefs.isEnabled(context)) return;

        Intent start = new Intent(context, BlueScreenService.class);
        start.setAction(BlueScreenService.ACTION_START);
        context.startForegroundService(start);
    }
}
