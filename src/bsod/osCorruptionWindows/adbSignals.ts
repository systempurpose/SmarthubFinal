import { adbWithLimits } from '../../adb';
import { loadUptimeState, saveUptimeState, recordRebootEvent } from './stateStore';

function sampleLines(text: string, rx: RegExp, limit: number): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (rx.test(line)) {
      const trimmed = line.trim();
      if (trimmed) out.push(trimmed);
      if (out.length >= limit) break;
    }
  }
  return out;
}

function parseUptimeSec(text: string): number | undefined {
  // /proc/uptime format: "12345.67 890.12"
  const raw = String(text || '').trim();
  const m = /^([0-9]+(?:\.[0-9]+)?)/.exec(raw);
  if (!m) return undefined;
  const v = Number(m[1]);
  if (!Number.isFinite(v) || v < 0) return undefined;
  return Math.round(v);
}

export async function collectAdbUptimeRebootSignals(input: {
  deviceId: string;
  timeoutMs: number;
}): Promise<{
  ok: boolean;
  error?: string;
  uptimeSec?: number;
  previousUptimeSec?: number;
  suspiciousReboot?: boolean;
  rebootEventsLast5Min?: number;
  bootloopSuspected?: boolean;
}> {
  const deviceId = String(input.deviceId || '').trim();
  if (!deviceId) return { ok: false, error: 'No ADB device id provided' };

  try {
    const out = await adbWithLimits(['-s', deviceId, 'shell', 'cat', '/proc/uptime'], {
      attempts: 2,
      timeoutMs: Math.min(8_000, input.timeoutMs),
      maxBufferBytes: 128 * 1024,
    });

    const uptimeSec = parseUptimeSec(out);
    const prev = loadUptimeState(deviceId);
    const previousUptimeSec = typeof prev.lastUptimeSec === 'number' ? prev.lastUptimeSec : undefined;

    const suspiciousReboot = !!(
      typeof previousUptimeSec === 'number' &&
      typeof uptimeSec === 'number' &&
      previousUptimeSec > 0 &&
      uptimeSec < 300
    );

    // Record a reboot event if uptime decreased significantly since last sample.
    if (
      typeof previousUptimeSec === 'number' &&
      typeof uptimeSec === 'number' &&
      previousUptimeSec >= 60 &&
      uptimeSec + 30 < previousUptimeSec
    ) {
      recordRebootEvent(deviceId, Date.now());
    }

    // If we detected a suspicious reboot (uptime < 5m with previous sample),
    // also record it as a reboot event.
    if (suspiciousReboot) {
      const r = recordRebootEvent(deviceId, Date.now());
      // Save the new uptime afterwards.
      saveUptimeState(deviceId, {
        ...prev,
        lastUptimeSec: uptimeSec,
        lastSeenMs: Date.now(),
        rebootEventsMs: loadUptimeState(deviceId).rebootEventsMs,
      });

      const rebootEventsLast5Min = r.rebootEventsLast5Min;
      const bootloopSuspected = rebootEventsLast5Min >= 3;

      return {
        ok: true,
        uptimeSec,
        previousUptimeSec,
        suspiciousReboot,
        rebootEventsLast5Min,
        bootloopSuspected,
      };
    }

    // Persist uptime state.
    saveUptimeState(deviceId, {
      ...prev,
      lastUptimeSec: uptimeSec,
      lastSeenMs: Date.now(),
    });

    const current = loadUptimeState(deviceId);
    const events = Array.isArray(current.rebootEventsMs) ? current.rebootEventsMs : [];
    const rebootEventsLast5Min = events.length;

    return {
      ok: true,
      uptimeSec,
      previousUptimeSec,
      suspiciousReboot,
      rebootEventsLast5Min,
      bootloopSuspected: rebootEventsLast5Min >= 3,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to read /proc/uptime via ADB' };
  }
}

export async function collectPstoreKernelPanic(input: {
  deviceId: string;
  timeoutMs: number;
}): Promise<{ ok: boolean; found: boolean; evidence?: string[]; error?: string }>{
  const deviceId = String(input.deviceId || '').trim();
  if (!deviceId) return { ok: false, found: false, error: 'No ADB device id provided' };

  const script = `
set +e
for f in /sys/fs/pstore/console-ramoops /sys/fs/pstore/console-ramoops-0; do
  if [ -e "$f" ]; then
    cat "$f" 2>/dev/null | (tail -n 220 2>/dev/null || toybox tail -n 220 2>/dev/null || busybox tail -n 220 2>/dev/null || cat)
    exit 0
  fi
done
exit 0
`;

  try {
    const out = await adbWithLimits(['-s', deviceId, 'shell', 'sh', '-c', script], {
      attempts: 1,
      timeoutMs: input.timeoutMs,
      maxBufferBytes: 2 * 1024 * 1024,
    });

    const text = String(out || '');
    const found = /Kernel\s*panic|not\s*syncing|panic\s*cpu|Unable\s+to\s+handle\s+kernel|NULL\s+pointer\s+deref|Internal\s+error|\bOops\b|sysrq/i.test(text);
    const evidence = found ? sampleLines(text, /Kernel\s*panic|not\s*syncing|panic\s*cpu|Unable\s+to\s+handle\s+kernel|NULL\s+pointer\s+deref|Internal\s+error|\bOops\b|sysrq/i, 10) : undefined;

    return { ok: true, found, evidence };
  } catch (e: any) {
    return { ok: false, found: false, error: e?.message || 'Failed to read pstore console-ramoops' };
  }
}

export async function collectRecoveryLastLogCrashHints(input: {
  deviceId: string;
  timeoutMs: number;
}): Promise<{ ok: boolean; found: boolean; evidence?: string[]; error?: string }>{
  const deviceId = String(input.deviceId || '').trim();
  if (!deviceId) return { ok: false, found: false, error: 'No ADB device id provided' };

  try {
    const out = await adbWithLimits(['-s', deviceId, 'shell', 'sh', '-c', 'cat /cache/recovery/last_log 2>/dev/null || true'], {
      attempts: 1,
      timeoutMs: input.timeoutMs,
      maxBufferBytes: 1024 * 1024,
    });

    const text = String(out || '').trim();
    if (!text) return { ok: true, found: false };

    const found = /(\breason\b\s*[:=])|(--reason=)|watchdog|panic|crash/i.test(text);
    const evidence = found ? sampleLines(text, /(\breason\b\s*[:=])|(--reason=)|watchdog|panic|crash/i, 10) : undefined;
    return { ok: true, found, evidence };
  } catch (e: any) {
    return { ok: false, found: false, error: e?.message || 'Failed to read /cache/recovery/last_log' };
  }
}

export async function collectLogcatPanicKeywords(input: {
  deviceId: string;
  timeoutMs: number;
}): Promise<{ ok: boolean; found: boolean; evidence?: string[]; error?: string }>{
  const deviceId = String(input.deviceId || '').trim();
  if (!deviceId) return { ok: false, found: false, error: 'No ADB device id provided' };

  try {
    let out = '';
    try {
      out = await adbWithLimits(['-s', deviceId, 'logcat', '-d', '-b', 'main', '-t', '500'], {
        attempts: 1,
        timeoutMs: input.timeoutMs,
        maxBufferBytes: 3 * 1024 * 1024,
      });
    } catch {
      out = await adbWithLimits(['-s', deviceId, 'logcat', '-d', '-b', 'main'], {
        attempts: 1,
        timeoutMs: input.timeoutMs,
        maxBufferBytes: 2 * 1024 * 1024,
      });
    }

    const text = String(out || '');
    const found = /Kernel\s*panic|not\s*syncing|panic\s*cpu|system_server\s+crash|FATAL\s+EXCEPTION.*system_server|watchdog/i.test(text);
    const evidence = found
      ? sampleLines(text, /Kernel\s*panic|not\s*syncing|panic\s*cpu|system_server\s+crash|FATAL\s+EXCEPTION.*system_server|watchdog/i, 10)
      : undefined;

    return { ok: true, found, evidence };
  } catch (e: any) {
    return { ok: false, found: false, error: e?.message || 'Failed to read logcat' };
  }
}

export async function collectDmesgPanicKeywords(input: {
  deviceId: string;
  timeoutMs: number;
}): Promise<{ ok: boolean; found: boolean; evidence?: string[]; error?: string }>{
  const deviceId = String(input.deviceId || '').trim();
  if (!deviceId) return { ok: false, found: false, error: 'No ADB device id provided' };

  try {
    const out = await adbWithLimits(['-s', deviceId, 'shell', 'dmesg'], {
      attempts: 1,
      timeoutMs: input.timeoutMs,
      maxBufferBytes: 2 * 1024 * 1024,
    });

    const text = String(out || '');
    const found = /Kernel\s*panic|not\s*syncing|panic\s*cpu|\bOops\b|Internal\s+error|Unable\s+to\s+handle\s+kernel/i.test(text);
    const evidence = found
      ? sampleLines(text, /Kernel\s*panic|not\s*syncing|panic\s*cpu|\bOops\b|Internal\s+error|Unable\s+to\s+handle\s+kernel/i, 10)
      : undefined;

    return { ok: true, found, evidence };
  } catch (e: any) {
    return { ok: false, found: false, error: e?.message || 'Failed to run dmesg via ADB (often restricted)' };
  }
}
