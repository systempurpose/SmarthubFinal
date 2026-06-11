import type { Express, Request, Response } from 'express';

import { adbWithLimits } from '../adb';

function safeText(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const s = String(v || '').trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function parsePackageNames(text: string): string[] {
  const t = safeText(text);
  // Package names are usually dot-separated identifiers.
  const rx = /\b[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+\b/g;
  const matches = t.match(rx) || [];
  // Exclude obviously-not packages.
  return uniqueStrings(matches.filter(m => m.includes('.') && !m.startsWith('android.')));
}

async function runShellLimited(deviceId: string, args: string[], opts?: { timeoutMs?: number; maxBufferBytes?: number }) {
  const timeoutMs = opts?.timeoutMs ?? 12_000;
  const maxBufferBytes = opts?.maxBufferBytes ?? 3 * 1024 * 1024;
  return adbWithLimits(['-s', deviceId, 'shell', ...args], {
    timeoutMs,
    maxBufferBytes,
    attempts: 1,
  });
}

type PermissionQueryResult = { ok: boolean; packages: string[]; error?: string };

async function queryPermissionUsers(deviceId: string, permission: string): Promise<PermissionQueryResult> {
  try {
    const out = await runShellLimited(deviceId, ['cmd', 'package', 'query-permission-users', permission], {
      timeoutMs: 10_000,
      maxBufferBytes: 1024 * 1024,
    });
    const packages = parsePackageNames(out);
    return { ok: true, packages };
  } catch (e: any) {
    return { ok: false, packages: [], error: e?.message || 'query failed' };
  }
}

type BatteryDrainEntry = { name: string; mah: number };

function parseEstimatedPowerUseMah(dumpsys: string): BatteryDrainEntry[] {
  const text = safeText(dumpsys);
  const marker = 'Estimated power use (mAh):';
  const idx = text.indexOf(marker);
  if (idx === -1) return [];

  const tail = text.slice(idx + marker.length);
  const lines = tail.split(/\r?\n/);

  const out: BatteryDrainEntry[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // Stop at the next section header.
    if (/^[A-Z][A-Za-z\s]+:\s*$/.test(line) && !line.includes('mAh')) break;

    // Common formats (vary by OEM):
    // "com.example.app: 12.34"
    // "Uid u0a123: 9.87"
    // "SYSTEM: 50.00"
    const m = line.match(/^([^:]{2,80}):\s*([0-9]+(?:\.[0-9]+)?)\b/i);
    if (!m) continue;

    const name = String(m[1] || '').trim();
    const mah = Number(m[2]);
    if (!name) continue;
    if (!Number.isFinite(mah) || mah < 0) continue;

    // Skip totals/headers.
    if (/^total$/i.test(name)) continue;

    out.push({ name, mah });
  }

  // Sort largest-first.
  out.sort((a, b) => b.mah - a.mah);
  return out;
}

function summarizeBatteryDrain(entries: BatteryDrainEntry[]): { top: BatteryDrainEntry[]; note?: string } {
  if (!entries.length) return { top: [], note: 'No per-app power estimate found (varies by Android/OEM).' };

  // Filter out noise-like categories while keeping real packages and big system buckets.
  const filtered = entries.filter(e => {
    const n = e.name.toLowerCase();
    if (n.startsWith('uid ')) return false;
    if (n === 'screen' || n === 'cell' || n === 'wifi' || n === 'bluetooth' || n === 'idle') return false;
    return true;
  });

  const top = (filtered.length ? filtered : entries).slice(0, 8);
  return { top };
}

function parseWakeLocksFromPowerDump(dump: string): { activeCount?: number; sample?: string[]; note?: string } {
  const text = safeText(dump);
  const lines = text.split(/\r?\n/);

  // Best-effort: look for a wake lock section or lines containing WakeLock.
  const wakeLines = lines
    .map(l => l.trim())
    .filter(l => !!l && (/wakelock/i.test(l) || /wake locks/i.test(l)));

  const sample = uniqueStrings(
    wakeLines
      .filter(l => l.length <= 140)
      .slice(0, 10),
  );

  // Some AOSP builds include "Wake Locks: size=3".
  const sizeM = text.match(/Wake\s+Locks:\s*size\s*=\s*(\d+)/i);
  const activeCount = sizeM?.[1] ? Number(sizeM[1]) : undefined;

  if (!wakeLines.length && activeCount == null) {
    return { note: 'Wake lock info not exposed in dumpsys power on this device.' };
  }

  return { activeCount: Number.isFinite(activeCount as number) ? (activeCount as number) : undefined, sample };
}

type CrashSummary = {
  fatalExceptionCount: number;
  anrCount: number;
  topProcesses: Array<{ process: string; count: number }>;
};

function parseCrashesFromLogcat(logs: string): CrashSummary {
  const text = safeText(logs);
  const lines = text.split(/\r?\n/);

  let fatal = 0;
  let anr = 0;
  const procCounts = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    if (/FATAL\s+EXCEPTION/i.test(line)) {
      fatal += 1;
      // Look ahead for "Process: com.foo".
      for (let j = i; j < Math.min(i + 14, lines.length); j++) {
        const m = lines[j].match(/\bProcess:\s*([^\s,]+)\b/);
        if (m?.[1]) {
          const p = m[1].trim();
          procCounts.set(p, (procCounts.get(p) || 0) + 1);
          break;
        }
      }
      continue;
    }

    const anrM = line.match(/\bANR\s+in\s+([^\s:]+)\b/i);
    if (anrM?.[1]) {
      anr += 1;
      const p = anrM[1].trim();
      procCounts.set(p, (procCounts.get(p) || 0) + 1);
      continue;
    }
  }

  const topProcesses = Array.from(procCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([process, count]) => ({ process, count }));

  return { fatalExceptionCount: fatal, anrCount: anr, topProcesses };
}

function formatList(label: string, items: string[], max = 10): string {
  if (!items.length) return `${label}: none found`;
  const shown = items.slice(0, max);
  const more = items.length > max ? ` (+${items.length - max} more)` : '';
  return `${label}: ${shown.join(', ')}${more}`;
}

export function registerAppBehaviorRoutes(app: Express) {
  app.get('/app-behavior/scan/:id', async (req: Request, res: Response) => {
    const id = safeText(req.params.id).trim();
    if (!id) return res.status(400).json({ ok: false, error: 'Missing device id' });

    try {
      // Run independent, bounded collection commands.
      const [batterystats, powerDump, logcat] = await Promise.all([
        runShellLimited(id, ['dumpsys', 'batterystats'], { timeoutMs: 14_000, maxBufferBytes: 3 * 1024 * 1024 }),
        runShellLimited(id, ['dumpsys', 'power'], { timeoutMs: 10_000, maxBufferBytes: 2 * 1024 * 1024 }),
        // Limit to recent logs; still best-effort.
        runShellLimited(id, ['logcat', '-d', '-v', 'brief', '-t', '2500'], { timeoutMs: 12_000, maxBufferBytes: 2 * 1024 * 1024 }),
      ]);

      const entries = parseEstimatedPowerUseMah(batterystats);
      const battery = summarizeBatteryDrain(entries);
      const wake = parseWakeLocksFromPowerDump(powerDump);
      const crash = parseCrashesFromLogcat(logcat);

      const [bgLoc, bootRecv, writeSettings, writeSecureSettings, changeWifi, btAdmin, btConnect] = await Promise.all([
        queryPermissionUsers(id, 'android.permission.ACCESS_BACKGROUND_LOCATION'),
        queryPermissionUsers(id, 'android.permission.RECEIVE_BOOT_COMPLETED'),
        queryPermissionUsers(id, 'android.permission.WRITE_SETTINGS'),
        queryPermissionUsers(id, 'android.permission.WRITE_SECURE_SETTINGS'),
        queryPermissionUsers(id, 'android.permission.CHANGE_WIFI_STATE'),
        queryPermissionUsers(id, 'android.permission.BLUETOOTH_ADMIN'),
        queryPermissionUsers(id, 'android.permission.BLUETOOTH_CONNECT'),
      ]);

      const backgroundLocationPkgs = bgLoc.ok ? bgLoc.packages : [];
      const bootPkgs = bootRecv.ok ? bootRecv.packages : [];
      const writeSettingsPkgs = uniqueStrings([...(writeSettings.ok ? writeSettings.packages : []), ...(writeSecureSettings.ok ? writeSecureSettings.packages : [])]);
      const wifiControlPkgs = changeWifi.ok ? changeWifi.packages : [];
      const btControlPkgs = uniqueStrings([...(btAdmin.ok ? btAdmin.packages : []), ...(btConnect.ok ? btConnect.packages : [])]);

      const lines: string[] = [];
      lines.push('App behavior analysis (best-effort)');
      lines.push('');

      if (battery.top.length) {
        lines.push('Battery drain (estimated, top):');
        for (const e of battery.top) {
          lines.push(`- ${e.name}: ${e.mah.toFixed(2)} mAh`);
        }
      } else {
        lines.push(`Battery drain: ${battery.note || 'Not available'}`);
      }

      lines.push('');
      if (wake.activeCount != null) {
        lines.push(`Wake locks: ${wake.activeCount} active (from dumpsys power)`);
      } else {
        lines.push(`Wake locks: ${wake.note || 'Not available'}`);
      }
      if (wake.sample && wake.sample.length) {
        lines.push('Wake lock sample:');
        wake.sample.slice(0, 6).forEach(s => lines.push(`- ${s}`));
      }

      lines.push('');
      lines.push(`Crashes/ANRs (recent logcat):`);
      lines.push(`- FATAL EXCEPTION count: ${crash.fatalExceptionCount}`);
      lines.push(`- ANR count: ${crash.anrCount}`);
      if (crash.topProcesses.length) {
        lines.push('Top affected processes:');
        crash.topProcesses.slice(0, 6).forEach(p => lines.push(`- ${p.process}: ${p.count}`));
      }

      lines.push('');
      lines.push(formatList('Apps with background location permission', backgroundLocationPkgs, 10));
      lines.push(formatList('Apps with boot-completed permission', bootPkgs, 10));
      lines.push(formatList('Apps with WRITE_SETTINGS/WRITE_SECURE_SETTINGS', writeSettingsPkgs, 10));
      lines.push(formatList('Apps that can change Wi‑Fi state (permission)', wifiControlPkgs, 10));
      lines.push(formatList('Apps that can manage Bluetooth (permission)', btControlPkgs, 10));

      // Also include notes if the cmd package queries are not supported.
      const permNotes: string[] = [];
      if (!bgLoc.ok && bgLoc.error) permNotes.push(`Background location query not available: ${bgLoc.error}`);
      if (!bootRecv.ok && bootRecv.error) permNotes.push(`Boot permission query not available: ${bootRecv.error}`);
      if ((!writeSettings.ok && writeSettings.error) || (!writeSecureSettings.ok && writeSecureSettings.error)) {
        permNotes.push('Write-settings permission queries not available on this device.');
      }
      if (!changeWifi.ok && changeWifi.error) permNotes.push(`Wi‑Fi permission query not available: ${changeWifi.error}`);
      if ((!btAdmin.ok && btAdmin.error) && (!btConnect.ok && btConnect.error)) {
        permNotes.push('Bluetooth permission queries not available on this device.');
      }
      if (permNotes.length) {
        lines.push('');
        lines.push('Notes:');
        permNotes.slice(0, 6).forEach(n => lines.push(`- ${n}`));
      }

      res.json({
        ok: true,
        deviceId: id,
        text: lines.join('\n'),
        details: {
          batteryTop: battery.top,
          wakeLocks: wake,
          crashes: crash,
          permissionUsers: {
            backgroundLocation: backgroundLocationPkgs,
            bootCompleted: bootPkgs,
            writeSettings: writeSettingsPkgs,
            changeWifiState: wifiControlPkgs,
            bluetoothControl: btControlPkgs,
          },
        },
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || 'App behavior scan failed' });
    }
  });

  // Individual app behavior endpoint
  app.get('/api/app-behavior/:packageName', async (req: Request, res: Response) => {
    const deviceId = req.query.deviceId as string;
    const packageName = req.params.packageName as string;

    if (!deviceId || !packageName) {
      return res.status(400).json({ error: 'Missing deviceId or packageName' });
    }

    try {
      const { getAppBehavior } = await import('../appBehavior');
      const behavior = await getAppBehavior(deviceId, packageName);
      res.json({ ok: true, behavior });
    } catch (err: any) {
      console.error('App behavior error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });
}
