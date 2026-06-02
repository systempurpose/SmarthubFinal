import type { Express, Request, Response } from 'express';

import { adb, adbWithLimits } from '../adb';

function safeText(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function truncate(s: string, max = 2500): string {
  const t = safeText(s);
  return t.length > max ? `${t.slice(0, max)}\n…(truncated)…` : t;
}

type FixStep = { label: string; ok: boolean; output?: string; error?: string };

type BluetoothDeviceSummary = {
  name?: string;
  address?: string;
  connected?: boolean;
  bonded?: boolean;
  batteryLevelPct?: number;
  rssiDbm?: number;
};

function parseBluetoothScanAddresses(text: string): string[] {
  const out = new Set<string>();
  const lines = safeText(text).split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/\b([0-9A-F]{2}(?::[0-9A-F]{2}){5})\b/i);
    if (m?.[1]) out.add(m[1].toUpperCase());
  }
  return Array.from(out);
}

async function tryBluetoothScanAddresses(deviceId: string): Promise<string[]> {
  try {
    const out = await adbWithLimits(['-s', deviceId, 'shell', 'dumpsys', 'bluetooth_manager'], {
      timeoutMs: 10_000,
      maxBufferBytes: 1024 * 1024,
      attempts: 1,
    });
    return parseBluetoothScanAddresses(out);
  } catch {
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function adbStep(deviceId: string, label: string, args: string[]): Promise<FixStep> {
  try {
    const out = await adb('-s', deviceId, 'shell', ...args);
    const text = truncate(out);
    return { label, ok: true, output: text };
  } catch (e: any) {
    return { label, ok: false, error: e?.message || 'command failed' };
  }
}

function parseBluetoothDump(dump: string): {
  enabled?: boolean;
  state?: string;
  devices: BluetoothDeviceSummary[];
  notes?: string[];
} {
  const text = safeText(dump || '');
  const notes: string[] = [];

  // Try to pick an enabled/state hint.
  const enabledM = text.match(/\b(enabled|isEnabled)\s*[:=]\s*(true|false)\b/i);
  const enabled = enabledM ? enabledM[2].toLowerCase() === 'true' : undefined;

  const stateM = text.match(/\bstate\s*[:=]\s*([A-Z_]+)\b/i);
  const state = stateM ? stateM[1] : undefined;

  // Best-effort device parsing: many dumpsys variants include lines with address + name.
  // Example fragments: "Device: AA:BB:CC:DD:EE:FF" or "mAddress: ..." or "address=..."
  const devices: BluetoothDeviceSummary[] = [];
  const byAddr = new Map<string, BluetoothDeviceSummary>();

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;

    const addrM = l.match(/\b([0-9A-F]{2}(?::[0-9A-F]{2}){5})\b/i);
    if (!addrM) continue;
    const address = addrM[1].toUpperCase();
    let d = byAddr.get(address);
    if (!d) {
      d = { address };
      byAddr.set(address, d);
      devices.push(d);
    }

    const nameM = l.match(/\bname\s*[:=]\s*([^,]+)$/i) || l.match(/\bAlias\s*[:=]\s*(.+)$/i);
    if (nameM && !d.name) d.name = String(nameM[1] || '').trim().replace(/^"|"$/g, '');

    if (/\bconnected\b\s*[:=]\s*true\b/i.test(l) || /\bACL\b.*\bCONNECTED\b/i.test(l)) d.connected = true;
    if (/\bbond\w*\b\s*[:=]\s*\w+/i.test(l) || /\bBOND_BONDED\b/i.test(l)) d.bonded = true;

    const battM = l.match(/\bbattery\w*\b\s*[:=]\s*(\d{1,3})\b/i);
    if (battM) {
      const v = Number(battM[1]);
      if (Number.isFinite(v) && v >= 0 && v <= 100) d.batteryLevelPct = v;
    }

    const rssiM = l.match(/\bRSSI\b\s*[:=]\s*(-?\d{2,3})\b/i);
    if (rssiM) {
      const v = Number(rssiM[1]);
      if (Number.isFinite(v)) d.rssiDbm = v;
    }
  }

  if (!devices.length) {
    notes.push('No Bluetooth device details could be parsed from dumpsys output (varies by Android/OEM).');
  }

  return { enabled, state, devices, notes: notes.length ? notes : undefined };
}

export function registerAndroidConnectivityRoutes(app: Express) {
  app.get('/android-connectivity/diagnose/:id', async (req: Request, res: Response) => {
    const id = safeText(req.params.id).trim();
    const target = safeText(req.query?.target || 'bluetooth').trim().toLowerCase();
    if (!id) return res.status(400).json({ ok: false, error: 'Missing device id' });

    if (target !== 'bluetooth') {
      return res.status(400).json({ ok: false, error: 'Unsupported diagnose target' });
    }

    try {
      const [mgr, bt] = await Promise.all([
        adb('-s', id, 'shell', 'dumpsys', 'bluetooth_manager'),
        adb('-s', id, 'shell', 'dumpsys', 'bluetooth'),
      ]);

      const parsedMgr = parseBluetoothDump(mgr);
      const parsedBt = parseBluetoothDump(bt);
      const scanAddresses = await tryBluetoothScanAddresses(id);

      // Merge by address, prefer bluetooth dump for fields.
      const merged: BluetoothDeviceSummary[] = [];
      const map = new Map<string, BluetoothDeviceSummary>();
      const add = (d: BluetoothDeviceSummary) => {
        const addr = d.address || '';
        if (!addr) return;
        const cur = map.get(addr) || { address: addr };
        map.set(addr, {
          address: addr,
          name: cur.name || d.name,
          connected: cur.connected || d.connected,
          bonded: cur.bonded || d.bonded,
          batteryLevelPct: typeof cur.batteryLevelPct === 'number' ? cur.batteryLevelPct : d.batteryLevelPct,
          rssiDbm: typeof cur.rssiDbm === 'number' ? cur.rssiDbm : d.rssiDbm,
        });
      };

      (parsedMgr.devices || []).forEach(add);
      (parsedBt.devices || []).forEach(add);
      for (const v of map.values()) merged.push(v);

      const connectedCount = merged.filter(d => d.connected).length;
      const bondedCount = merged.filter(d => d.bonded).length;

      const macConflictNotes: string[] = [];
      if (scanAddresses.length && merged.length) {
        const bondedAddrs = merged.filter(d => d.bonded && d.address).map(d => String(d.address || '').toUpperCase());
        const missingFromScan = bondedAddrs.filter(addr => addr && !scanAddresses.includes(addr));
        if (missingFromScan.length) {
          macConflictNotes.push(`Bonded device address mismatch / possible MAC randomization issue for: ${missingFromScan.slice(0, 6).join(', ')}`);
        }
      }

      return res.json({
        ok: true,
        deviceId: id,
        bluetooth: {
          enabled: parsedMgr.enabled ?? parsedBt.enabled,
          state: parsedMgr.state || parsedBt.state,
          summary: {
            bondedCount,
            connectedCount,
            devicesWithBattery: merged.filter(d => typeof d.batteryLevelPct === 'number').length,
            devicesWithRssi: merged.filter(d => typeof d.rssiDbm === 'number').length,
            scanAddressCount: scanAddresses.length,
          },
          devices: merged.slice(0, 24),
          notes: [...(parsedMgr.notes || []), ...(parsedBt.notes || []), ...macConflictNotes].filter(Boolean),
        },
      });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message || 'Bluetooth diagnose failed' });
    }
  });

  app.post('/android-connectivity/fix/:id', async (req: Request, res: Response) => {
    const id = safeText(req.params.id).trim();
    const action = safeText((req.body as any)?.action || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'Missing device id' });
    if (!action) return res.status(400).json({ ok: false, error: 'Missing action' });

    const steps: FixStep[] = [];

    if (action === 'bluetooth_reset') {
      steps.push(await adbStep(id, 'Bluetooth OFF', ['svc', 'bluetooth', 'disable']));
      await sleep(1200);
      steps.push(await adbStep(id, 'Bluetooth ON', ['svc', 'bluetooth', 'enable']));
      await sleep(1400);
      return res.json({ ok: true, action, deviceId: id, steps });
    }

    if (action === 'bluetooth_force_stop') {
      steps.push(await adbStep(id, 'Force-stop Bluetooth app', ['am', 'force-stop', 'com.android.bluetooth']));
      await sleep(900);
      steps.push(await adbStep(id, 'Bluetooth OFF', ['svc', 'bluetooth', 'disable']));
      await sleep(1200);
      steps.push(await adbStep(id, 'Bluetooth ON', ['svc', 'bluetooth', 'enable']));
      await sleep(1400);
      return res.json({ ok: true, action, deviceId: id, steps });
    }

    if (action === 'bluetooth_clear_cache') {
      // Best-effort. Some OEMs restrict this. Our ADB safety layer must allow this specific clear.
      steps.push(await adbStep(id, 'Force-stop Bluetooth app', ['am', 'force-stop', 'com.android.bluetooth']));
      await sleep(900);
      steps.push(await adbStep(id, 'Clear Bluetooth app data (best-effort)', ['pm', 'clear', 'com.android.bluetooth']));
      await sleep(900);
      steps.push(await adbStep(id, 'Bluetooth OFF', ['svc', 'bluetooth', 'disable']));
      await sleep(1200);
      steps.push(await adbStep(id, 'Bluetooth ON', ['svc', 'bluetooth', 'enable']));
      await sleep(1400);
      return res.json({ ok: true, action, deviceId: id, steps });
    }

    if (action === 'mobile_data_reset') {
      steps.push(await adbStep(id, 'Mobile data OFF', ['svc', 'data', 'disable']));
      await sleep(1200);
      steps.push(await adbStep(id, 'Mobile data ON', ['svc', 'data', 'enable']));
      await sleep(1200);
      return res.json({ ok: true, action, deviceId: id, steps });
    }

    if (action === 'gps_reset') {
      // Avoid `settings put` (blocked by ADB safety). Prefer cmd location if present.
      steps.push(await adbStep(id, 'Location OFF', ['cmd', 'location', 'set-location-enabled', 'false']));
      await sleep(900);
      steps.push(await adbStep(id, 'Location ON', ['cmd', 'location', 'set-location-enabled', 'true']));
      await sleep(900);
      return res.json({ ok: true, action, deviceId: id, steps });
    }

    return res.status(400).json({ ok: false, error: 'Unsupported action' });
  });
}
