import { adb, listDevices } from './adb';

// Track how many long-running diagnostic operations are active per device so
// we can keep the on-device mobile app's loading indicator in sync with the
// real desktop diagnostic work (collect, app scan, file scan, etc.).
const activeDiagnostics: Record<string, number> = {};

export interface MobileAppState {
  installed: boolean;
  running: boolean;
}

export async function getMobileAppState(deviceId: string): Promise<MobileAppState> {
  const pkg = 'com.smarthub.diagnostics';
  let installed = false;
  let running = false;

  try {
    const out = await adb('-s', deviceId, 'shell', 'pm', 'list', 'packages', pkg);
    if (typeof out === 'string' && out.includes(pkg)) {
      installed = true;
    }
  } catch {
    // ignore
  }

  if (installed) {
    try {
      const pidOut = await adb('-s', deviceId, 'shell', 'pidof', pkg);
      if (typeof pidOut === 'string' && pidOut.trim().length > 0) {
        running = true;
      }
    } catch {
      try {
        const act = await adb('-s', deviceId, 'shell', 'dumpsys', 'activity', 'activities');
        if (typeof act === 'string' && act.includes(pkg)) {
          running = true;
        }
      } catch {
        // ignore
      }
    }
  }

  return { installed, running };
}

async function notifyMobileDiagnostic(
  deviceId: string,
  action: 'com.smarthub.DIAGNOSTICS_START' | 'com.smarthub.DIAGNOSTICS_STOP',
): Promise<void> {
  try {
    await adb('-s', deviceId, 'shell', 'am', 'broadcast', '-a', action);
  } catch {
    // Best-effort only.
  }
}

export async function beginMobileDiagnostic(deviceId: string): Promise<void> {
  const current = activeDiagnostics[deviceId] || 0;
  activeDiagnostics[deviceId] = current + 1;
  if (current === 0) {
    await notifyMobileDiagnostic(deviceId, 'com.smarthub.DIAGNOSTICS_START');
  }
}

export async function endMobileDiagnostic(deviceId: string): Promise<void> {
  const current = activeDiagnostics[deviceId] || 0;
  if (current <= 1) {
    delete activeDiagnostics[deviceId];
    await notifyMobileDiagnostic(deviceId, 'com.smarthub.DIAGNOSTICS_STOP');
  } else {
    activeDiagnostics[deviceId] = current - 1;
  }
}

export async function pickPrimaryDeviceId(): Promise<string | undefined> {
  try {
    const devices = await listDevices();
    if (!devices.length) return undefined;
    const ready = devices.find(d => d.state === 'device');
    return (ready || devices[0]).id;
  } catch {
    return undefined;
  }
}
