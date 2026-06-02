import type { BsodOsCorruptionWindowsUsbReport, OsCorruptionSignal } from './types';
import {
  collectAdbUptimeRebootSignals,
  collectPstoreKernelPanic,
  collectRecoveryLastLogCrashHints,
  collectLogcatPanicKeywords,
  collectDmesgPanicKeywords,
} from './adbSignals';
import { getFastbootVars } from './fastbootSignals';
import { scoreOsCorruptionSignals, summarizeReport } from './score';

export async function detectBsodOsCorruptionWindowsUsb(input: {
  adbDeviceId?: string;
  fastbootDeviceId?: string;
  timeoutMs?: number;
  enableDmesg?: boolean;
}): Promise<BsodOsCorruptionWindowsUsbReport> {
  const started = Date.now();
  const startedAt = new Date().toISOString();

  const adbDeviceId = typeof input.adbDeviceId === 'string' ? input.adbDeviceId.trim() : '';
  const fastbootDeviceId = typeof input.fastbootDeviceId === 'string' ? input.fastbootDeviceId.trim() : '';
  const timeoutMs = Math.max(8_000, Math.min(35_000, Math.round(input.timeoutMs ?? 20_000)));

  if (!adbDeviceId && !fastbootDeviceId) {
    return {
      ok: true,
      skipped: true,
      startedAt,
      durationMs: 0,
      summary: 'Skipped: no ADB or fastboot device was detected.',
    };
  }

  const signals: OsCorruptionSignal[] = [];
  const raw: BsodOsCorruptionWindowsUsbReport['raw'] = {};

  try {
    // ADB-side collectors (read-only).
    if (adbDeviceId) {
      const uptime = await collectAdbUptimeRebootSignals({ deviceId: adbDeviceId, timeoutMs });
      if (uptime.ok) {
        raw.uptimeSec = uptime.uptimeSec;
        raw.previousUptimeSec = uptime.previousUptimeSec;
        raw.suspiciousReboot = uptime.suspiciousReboot;
        raw.rebootEventsLast5Min = uptime.rebootEventsLast5Min;
        raw.bootloopSuspected = uptime.bootloopSuspected;

        if (uptime.suspiciousReboot) {
          signals.push({
            id: 'adb_unexplained_reboot',
            title: 'Suspicious reboot detected (uptime < 5 minutes)',
            points: 20,
            severity: 'warning',
            evidence: [
              `uptimeSec=${uptime.uptimeSec ?? 'unknown'}`,
              `previousUptimeSec=${uptime.previousUptimeSec ?? 'unknown'}`,
            ],
          });
        }

        if (uptime.bootloopSuspected) {
          signals.push({
            id: 'bootloop_suspected',
            title: 'Bootloop suspected (>= 3 reboots within 5 minutes)',
            points: 45,
            severity: 'critical',
            evidence: [`rebootEventsLast5Min=${uptime.rebootEventsLast5Min ?? 'unknown'}`],
          });
        }
      }

      const pstore = await collectPstoreKernelPanic({ deviceId: adbDeviceId, timeoutMs: Math.min(timeoutMs, 16_000) });
      raw.kernelPanicFound = pstore.ok ? pstore.found : undefined;
      if (pstore.ok && pstore.found) {
        signals.push({
          id: 'adb_kernel_panic_pstore',
          title: 'Kernel panic evidence found in pstore (console-ramoops)',
          points: 60,
          severity: 'critical',
          evidence: pstore.evidence,
        });
      }

      const recovery = await collectRecoveryLastLogCrashHints({ deviceId: adbDeviceId, timeoutMs: Math.min(timeoutMs, 12_000) });
      raw.recoveryCrashReasonFound = recovery.ok ? recovery.found : undefined;
      if (recovery.ok && recovery.found) {
        signals.push({
          id: 'adb_recovery_last_log',
          title: 'Recovery last_log indicates crash/panic/watchdog reasons',
          points: 40,
          severity: 'critical',
          evidence: recovery.evidence,
        });
      }

      const logcat = await collectLogcatPanicKeywords({ deviceId: adbDeviceId, timeoutMs: Math.min(timeoutMs, 14_000) });
      raw.logcatKeywordFound = logcat.ok ? logcat.found : undefined;
      if (logcat.ok && logcat.found) {
        signals.push({
          id: 'adb_logcat_panic_keywords',
          title: 'Logcat contains panic/watchdog/system_server crash keywords',
          points: 35,
          severity: 'warning',
          evidence: logcat.evidence,
        });
      }

      if (input.enableDmesg) {
        const dmesg = await collectDmesgPanicKeywords({ deviceId: adbDeviceId, timeoutMs: Math.min(timeoutMs, 10_000) });
        raw.dmesgKeywordFound = dmesg.ok ? dmesg.found : undefined;
        if (dmesg.ok && dmesg.found) {
          signals.push({
            id: 'adb_dmesg_panic_keywords',
            title: 'dmesg contains panic keywords (may require privileges)',
            points: 35,
            severity: 'warning',
            evidence: dmesg.evidence,
          });
        }
      }
    }

    // Fastboot-side collectors.
    if (fastbootDeviceId) {
      const vars = await getFastbootVars(fastbootDeviceId, Math.min(timeoutMs, 12_000));
      raw.fastbootVarsSample = vars.sampleLines;
      raw.bootloaderUnlocked = vars.ok ? vars.unlocked : undefined;

      if (vars.ok && vars.unlocked === true) {
        signals.push({
          id: 'fastboot_unlocked',
          title: 'Bootloader reported as unlocked (higher tamper / custom ROM risk)',
          points: 20,
          severity: 'warning',
          evidence: vars.sampleLines?.filter(l => /unlocked/i.test(l)).slice(0, 8),
        });
      }
    }

    const { score0to100, confidence } = scoreOsCorruptionSignals(signals);

    const report: BsodOsCorruptionWindowsUsbReport = {
      ok: true,
      startedAt,
      durationMs: Math.max(0, Date.now() - started),
      adbDeviceId: adbDeviceId || undefined,
      fastbootDeviceId: fastbootDeviceId || undefined,
      score0to100,
      confidence,
      signals,
      raw,
    };

    report.summary = summarizeReport(report);
    return report;
  } catch (e: any) {
    return {
      ok: false,
      startedAt,
      durationMs: Math.max(0, Date.now() - started),
      adbDeviceId: adbDeviceId || undefined,
      fastbootDeviceId: fastbootDeviceId || undefined,
      error: e?.message || 'OS corruption detection failed',
      signals,
      raw,
    };
  }
}
