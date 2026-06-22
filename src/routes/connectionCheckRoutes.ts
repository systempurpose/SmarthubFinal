import type { Express, Request, Response } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { listDevices } from '../adb';
import { summarizeTransportProfile, type TransportDeviceLike } from '../bsodTransportProfiles';
import { detectBsodOsCorruptionWindowsUsb } from '../bsod/osCorruptionWindows/detect';
import { saveDiagnosticRunToCloud } from '../lib/supabaseDiagnosticsStore';
import { fetchDiagnosticRunsFromCloud } from '../lib/supabaseDiagnosticsStore';

const execFileAsync = promisify(execFile);

type PortableDevice = {
  name?: string;
  status?: string;
  class?: string;
  instanceId?: string;
  problemCode?: number | null;
};

type TransportDevice = {
  name?: string;
  status?: string;
  class?: string;
  instanceId?: string;
  problemCode?: number | null;
  vid?: string;
  pid?: string;
  locationInfo?: string;
  locationPaths?: string[];
};

type MtpProbeEvidence = {
  tool: 'wpd' | 'shell' | 'none';
  ok: boolean;
  timedOut?: boolean;
  elapsedMs: number;
  // Alias for UI compatibility (some UI paths expect durationMs).
  durationMs?: number;
  error?: string;
  errorHResult?: number;
  errorHResultHex?: string;
  // True when the probe failure is likely a host COM/WPD capability issue
  // (e.g. interface not supported), not a phone-side unresponsiveness.
  hostUnsupported?: boolean;
  deviceName?: string;
  deviceCount?: number;
  deepOk?: boolean;
  deepError?: string;
  deepErrorHResult?: number;
  deepErrorHResultHex?: string;
  sampleItems?: string[];
  deepSampleItems?: string[];
  deepDurationMs?: number;
  deepEnumeratedCount?: number;
};

// If WPD/COM is broken on this PC (e.g. E_NOINTERFACE), probing it repeatedly is noisy and slow.
// Cache the detection for this server process and prefer the Shell-based probe thereafter.
let cachedHostWpdUnsupported = false;

type BsodSavedRun = {
  id: number;
  key: string;
  deviceId: string;
  deviceLabel: string;
  timestamp: number;
  summary?: string;
  category?: string;
  confidence?: string;
  reasons?: string[];
  counts?: { high: number; medium: number; low: number };
  autoTest?: any;
  query?: Record<string, string | string[]>;
  osCorruption?: any;
  evidence?: {
    adbCount: number;
    fastbootCount: number;
    portableCount: number;
    transportCount: number;
    hostError?: string;
    hostVerdict?: any;
    mtpProbeEvidence?: any;
    mtpHeartbeat?: any;
    transportProfile?: any;
  };
};

function sanitizeHistoryKeyPart(v: string): string {
  return String(v || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 180);
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x || '').trim()).filter(Boolean);
}

function normalizeQueryForHistory(query: Request['query']): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, raw] of Object.entries(query || {})) {
    if (raw == null) continue;
    if (Array.isArray(raw)) {
      out[key] = raw.map((x) => String(x));
    } else {
      out[key] = String(raw);
    }
  }
  return out;
}

function confidenceToCounts(confidence: unknown): { high: number; medium: number; low: number } {
  const c = String(confidence || 'low').toLowerCase();
  if (c === 'high') return { high: 1, medium: 0, low: 0 };
  if (c === 'medium') return { high: 0, medium: 1, low: 0 };
  return { high: 0, medium: 0, low: 1 };
}

function resolveBsodHistoryIdentity(result: any): { key: string; deviceId: string; deviceLabel: string } {
  const adbDevices = Array.isArray(result?.adb?.devices) ? result.adb.devices : [];
  const fbDevices = Array.isArray(result?.fastboot?.devices) ? result.fastboot.devices : [];
  const portable = Array.isArray(result?.hostUsb?.portableDevices) ? result.hostUsb.portableDevices : [];
  const transport = Array.isArray(result?.hostUsb?.transportDevices) ? result.hostUsb.transportDevices : [];

  const adbFirst = adbDevices[0];
  if (adbFirst && adbFirst.id) {
    const id = String(adbFirst.id);
    const label = String(adbFirst.label || adbFirst.model || id);
    return {
      key: `adb_${sanitizeHistoryKeyPart(id)}`,
      deviceId: id,
      deviceLabel: label,
    };
  }

  const fbFirst = fbDevices[0];
  if (fbFirst && fbFirst.id) {
    const id = String(fbFirst.id);
    return {
      key: `fastboot_${sanitizeHistoryKeyPart(id)}`,
      deviceId: id,
      deviceLabel: `Fastboot ${id}`,
    };
  }

  const pFirst = portable[0];
  const pId = pFirst?.instanceId ? String(pFirst.instanceId) : '';
  const pName = pFirst?.name ? String(pFirst.name) : '';
  if (pId || pName) {
    const keyPart = sanitizeHistoryKeyPart(pId || pName);
    return {
      key: `mtp_${keyPart || 'unknown'}`,
      deviceId: pId || `mtp:${keyPart || 'unknown'}`,
      deviceLabel: pName || pId || 'MTP/Portable device',
    };
  }

  const tFirst = transport[0];
  const tId = tFirst?.instanceId ? String(tFirst.instanceId) : '';
  const tName = tFirst?.name ? String(tFirst.name) : '';
  if (tId || tName) {
    const keyPart = sanitizeHistoryKeyPart(tId || tName);
    return {
      key: `usb_${keyPart || 'unknown'}`,
      deviceId: tId || `usb:${keyPart || 'unknown'}`,
      deviceLabel: tName || tId || 'USB transport device',
    };
  }

  return {
    key: 'usb_unknown',
    deviceId: 'usb:unknown',
    deviceLabel: 'USB-only (no device identity)',
  };
}

async function autoSaveBsodHistoryRun(
  result: any,
  query: Request['query'],
  ownerUserId?: string,
): Promise<{ runId: number; historyKey: string }> {
  const owner = String(ownerUserId || '').trim();
  if (!owner) {
    throw new Error('Authenticated Supabase account required. Local/offline BSOD history is disabled.');
  }

  const now = Date.now();
  const identity = resolveBsodHistoryIdentity(result);
  const bsodAnalysis = (result && result.bsodAnalysis && typeof result.bsodAnalysis === 'object')
    ? result.bsodAnalysis
    : {};

  const hostUsb = (result && result.hostUsb && typeof result.hostUsb === 'object') ? result.hostUsb : {};
  const heartbeatRaw = hostUsb?.mtpHeartbeat;
  const heartbeat = heartbeatRaw && typeof heartbeatRaw === 'object'
    ? {
      enabled: !!heartbeatRaw.enabled,
      freezeConfirmed: !!heartbeatRaw.freezeConfirmed,
      timeoutCount: typeof heartbeatRaw.timeoutCount === 'number' ? heartbeatRaw.timeoutCount : undefined,
      consecutiveTimeouts: typeof heartbeatRaw.consecutiveTimeouts === 'number' ? heartbeatRaw.consecutiveTimeouts : undefined,
      attempts: Array.isArray(heartbeatRaw.attempts) ? heartbeatRaw.attempts.slice(-20) : undefined,
      windowMs: typeof heartbeatRaw.windowMs === 'number' ? heartbeatRaw.windowMs : undefined,
    }
    : undefined;

  const adbCount = Array.isArray(result?.adb?.devices) ? result.adb.devices.length : 0;
  const fastbootCount = Array.isArray(result?.fastboot?.devices) ? result.fastboot.devices.length : 0;
  const portableCount = Array.isArray(hostUsb?.portableDevices) ? hostUsb.portableDevices.length : 0;
  const transportCount = Array.isArray(hostUsb?.transportDevices) ? hostUsb.transportDevices.length : 0;

  const run: BsodSavedRun = {
    id: now,
    key: identity.key,
    deviceId: identity.deviceId,
    deviceLabel: identity.deviceLabel,
    timestamp: now,
    summary: typeof result?.summary === 'string' ? result.summary : undefined,
    category: typeof bsodAnalysis?.category === 'string' ? bsodAnalysis.category : undefined,
    confidence: typeof bsodAnalysis?.confidence === 'string' ? bsodAnalysis.confidence : undefined,
    reasons: toStringArray(bsodAnalysis?.reasons),
    counts: confidenceToCounts(bsodAnalysis?.confidence),
    autoTest: result?.autoTest,
    query: normalizeQueryForHistory(query),
    osCorruption: result?.osCorruption,
    evidence: {
      adbCount,
      fastbootCount,
      portableCount,
      transportCount,
      hostError: typeof hostUsb?.error === 'string' ? hostUsb.error : undefined,
      hostVerdict: hostUsb?.hostVerdict,
      mtpProbeEvidence: hostUsb?.mtpProbeEvidence,
      mtpHeartbeat: heartbeat,
      transportProfile: hostUsb?.transportProfile,
    },
  };

  const cloud = await saveDiagnosticRunToCloud({
    ownerUserId: owner,
    diagnosticType: 'bsod',
    deviceId: identity.deviceId,
    runId: run.id,
    runTimestamp: run.timestamp,
    payload: run,
  });
  if (!cloud.ok) {
    throw new Error(cloud.error || 'Failed to save BSOD history to Supabase.');
  }

  return { runId: run.id, historyKey: identity.key };
}

function extractFirstHResultHex(text: string | undefined): string | undefined {
  const t = String(text || '');
  const m = /0x[0-9A-Fa-f]{8}/.exec(t);
  return m ? m[0].toUpperCase() : undefined;
}

function isHostWpdUnsupportedError(ev: MtpProbeEvidence | undefined): boolean {
  if (!ev) return false;
  if (ev.tool !== 'wpd') return false;
  if (ev.ok !== false) return false;

  const hrHex = (typeof ev.errorHResultHex === 'string' && ev.errorHResultHex.trim())
    ? ev.errorHResultHex.trim().toUpperCase()
    : extractFirstHResultHex(ev.error);
  const err = String(ev.error || '');

  // 0x80004002 E_NOINTERFACE: QueryInterface failed, host COM interface missing/mismatched.
  if (hrHex === '0X80004002') return true;
  if (/E_NOINTERFACE/i.test(err)) return true;
  if (/No such interface supported/i.test(err)) return true;
  if (/QueryInterface/i.test(err) && /IPortableDevice/i.test(err)) return true;

  // 0x80040154 REGDB_E_CLASSNOTREG: COM class not registered.
  if (hrHex === '0X80040154') return true;
  if (/Class not registered/i.test(err)) return true;

  return false;
}

function clampNumber(n: unknown, min: number, max: number): number | null {
  const v = typeof n === 'number' ? n : Number(String(n || '').trim());
  if (!Number.isFinite(v)) return null;
  return Math.max(min, Math.min(max, Math.round(v)));
}

type MtpHeartbeatAttempt = {
  startedAt: string;
  ok: boolean;
  timedOut?: boolean;
  elapsedMs: number;
  error?: string;
  errorHResult?: number;
  errorHResultHex?: string;
  deepOk?: boolean;
  deepError?: string;
  deepErrorHResult?: number;
  deepErrorHResultHex?: string;
  stillEnumeratedAfter?: boolean;
};

type MtpHeartbeatEvidence = {
  enabled: boolean;
  attemptTimeoutMs: number;
  intervalMs: number;
  maxAttempts: number;
  windowTargetMs: number;
  attempts: MtpHeartbeatAttempt[];
  consecutiveFailures: number;
  consecutiveTimeouts: number;
  timeoutCount: number;
  baselineMs?: number;
  slowExtraMs: number;
  slowCount: number;
  freezeConfirmed: boolean;
  windowMs: number;
};

function median(values: number[]): number | undefined {
  const xs = values.filter(v => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (!xs.length) return undefined;
  const mid = Math.floor(xs.length / 2);
  if (xs.length % 2 === 1) return xs[mid];
  return Math.round((xs[mid - 1] + xs[mid]) / 2);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseVidPidFromInstanceId(instanceId: string | undefined): { vid?: string; pid?: string } {
  const id = String(instanceId || '');
  const vid = /VID_([0-9A-Fa-f]{4})/.exec(id)?.[1]?.toUpperCase();
  const pid = /PID_([0-9A-Fa-f]{4})/.exec(id)?.[1]?.toUpperCase();
  return { vid, pid };
}

function tryJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function isSuspectMtpHResult(hr: unknown): boolean {
  const n = typeof hr === 'number' ? hr : (typeof hr === 'string' ? Number(hr) : NaN);
  if (!Number.isFinite(n)) return false;

  // Common "device visible but operations fail" HRESULTs.
  // We only treat these as freeze evidence when USB is stable and the device stays enumerated.
  const E_FAIL = -2147467259; // 0x80004005
  const E_UNEXPECTED = -2147418113; // 0x8000FFFF
  const E_ABORT = -2147467260; // 0x80004004

  if (n === E_FAIL || n === E_UNEXPECTED || n === E_ABORT) return true;

  // Many WPD errors are in the 0x802Axxxx range.
  const u = n >>> 0;
  if ((u & 0xFFFF0000) === 0x802A0000) return true;

  return false;
}

function resolveBsodToolExePath(exeName: string): string | null {
  const candidates = [
    path.join(process.cwd(), 'Bsod tools', 'bin', exeName),
    path.join(process.cwd(), 'Bsod tools', exeName),
    path.join(process.cwd(), exeName),
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

function resolveUsbEvidenceHelperExePath(): string | null {
  return resolveBsodToolExePath('UsbEvidenceHelper.exe');
}

function resolveUsbPnpSnapshotExePath(): string | null {
  return resolveBsodToolExePath('UsbPnpSnapshot.exe');
}

const ANDROID_VENDOR_IDS = new Set([
  '04E8', // Samsung
  '18D1', // Google
  '0BB4', // HTC
  '1004', // LG
  '22B8', // Motorola
  '12D1', // Huawei
  '2717', // Xiaomi
  '2A70', // OnePlus / BBK
]);

function isLikelyAndroidVendor(vid: string | undefined): boolean {
  return !!vid && ANDROID_VENDOR_IDS.has(String(vid).toUpperCase());
}

type SetupApiSnapshotDevice = {
  instanceId?: string;
  friendlyName?: string;
  deviceDesc?: string;
  manufacturer?: string;
  problemCode?: number;
};

type SetupApiSnapshotResult = {
  ok?: boolean;
  devices?: SetupApiSnapshotDevice[];
  error?: string;
};

async function getSetupApiUsbSnapshot(timeoutMs: number): Promise<TransportDevice[]> {
  const exe = resolveUsbPnpSnapshotExePath();
  if (!exe) return [];

  try {
    const { stdout } = await execFileAsync(exe, ['--max', '350'], {
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    });
    const raw = tryJsonParse<SetupApiSnapshotResult>(String(stdout || '').trim());
    if (!raw || raw.ok === false || !Array.isArray(raw.devices)) return [];

    const out: TransportDevice[] = [];
    for (const d of raw.devices) {
      const instanceId = d?.instanceId ? String(d.instanceId) : '';
      if (!instanceId || !/^USB\\VID_/i.test(instanceId)) continue;
      const { vid, pid } = parseVidPidFromInstanceId(instanceId);
      if (!isLikelyAndroidVendor(vid)) continue;

      out.push({
        name: d?.friendlyName || d?.deviceDesc || d?.manufacturer || 'USB device',
        status: (typeof d?.problemCode === 'number' && d.problemCode !== 0) ? 'Error' : 'OK',
        class: 'USB',
        instanceId,
        problemCode: typeof d?.problemCode === 'number' ? d.problemCode : null,
        vid,
        pid,
      });
    }

    return out;
  } catch {
    return [];
  }
}

async function runPowerShellJson<T>(script: string, timeoutMs: number): Promise<T> {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
    );
    const parsed = tryJsonParse<T>(String(stdout || '').trim());
    if (!parsed) {
      throw new Error('PowerShell did not return valid JSON');
    }
    return parsed;
  } catch (e: any) {
    // PowerShell sometimes exits non-zero while still printing JSON on stdout.
    const stdoutText = String(e?.stdout || '').trim();
    const stderrText = String(e?.stderr || '').trim();

    // If the host query times out/kills PowerShell, surface that explicitly.
    // Node's error message is often just "Command failed: powershell ...".
    if (e && (e.killed === true || typeof e.signal === 'string')) {
      const parsedStdout = stdoutText ? tryJsonParse<T>(stdoutText) : null;
      if (parsedStdout) return parsedStdout;
      const parsedStderr = stderrText ? tryJsonParse<T>(stderrText) : null;
      if (parsedStderr) return parsedStderr;
      throw new Error(`PowerShell timed out while querying Windows USB devices (timeout=${timeoutMs}ms)`);
    }

    const parsedStdout = stdoutText ? tryJsonParse<T>(stdoutText) : null;
    if (parsedStdout) return parsedStdout;

    const parsedStderr = stderrText ? tryJsonParse<T>(stderrText) : null;
    if (parsedStderr) return parsedStderr;

    const exitCode = (typeof e?.code === 'number' || typeof e?.code === 'string') ? String(e.code) : '';
    const msg = stderrText || (typeof e?.message === 'string' ? e.message : 'PowerShell failed');
    // Keep this short to avoid dumping the full script into UI.
    throw new Error(`PowerShell failed${exitCode ? ` (exit ${exitCode})` : ''}: ${msg.split(/\r?\n/)[0]}`);
  }
}

async function getWindowsUsbSnapshot(timeoutMs: number): Promise<{
  portableDevices: PortableDevice[];
  transportDevices: TransportDevice[];
}> {
  const script = `
$ErrorActionPreference = 'SilentlyContinue'

# Use CIM/WMI for speed and stability. Get-PnpDevice can hang on some systems.
$portableOut = @()
$transportOut = @()

try {
  $all2 = @(Get-CimInstance -ClassName Win32_PnPEntity -ErrorAction SilentlyContinue)
  $portable2 = @($all2 | Where-Object {
    ($_.PNPClass -match '^(WPD|PortableDevices)$') -or ($_.Name -match 'MTP' -or $_.Name -match 'Portable')
  } | Select-Object -First 50)
  foreach ($d in $portable2) {
    $portableOut += [PSCustomObject]@{
      name = $d.Name
      status = $d.Status
      class = $d.PNPClass
      instanceId = $d.PNPDeviceID
      problemCode = $null
    }
  }
} catch {}

try {
  if (-not $all2) { $all2 = @(Get-CimInstance -ClassName Win32_PnPEntity -ErrorAction SilentlyContinue) }
  $transport2 = @($all2 | Where-Object { $_.PNPDeviceID -like 'USB\\VID_*' } | Select-Object -First 120)
  foreach ($d in $transport2) {
    $transportOut += [PSCustomObject]@{
      name = $d.Name
      status = $d.Status
      class = $d.PNPClass
      instanceId = $d.PNPDeviceID
      problemCode = $null
      locationInfo = $null
      locationPaths = $null
    }
  }
} catch {}

@{ portableDevices = $portableOut; transportDevices = $transportOut } | ConvertTo-Json -Depth 6 -Compress
`;

  const raw = await runPowerShellJson<any>(script, timeoutMs);
  const portableDevices = (Array.isArray(raw?.portableDevices) ? raw.portableDevices : []) as PortableDevice[];
  const transportDevicesRaw = (Array.isArray(raw?.transportDevices) ? raw.transportDevices : []) as TransportDevice[];

  const transportDevices: TransportDevice[] = transportDevicesRaw.map(t => {
    const instanceId = t?.instanceId;
    const { vid, pid } = parseVidPidFromInstanceId(instanceId);
    const locationPaths = Array.isArray(t?.locationPaths)
      ? (t.locationPaths as any[]).map(x => String(x || '')).filter(Boolean)
      : undefined;
    return {
      name: t?.name,
      status: t?.status,
      class: t?.class,
      instanceId,
      problemCode: typeof t?.problemCode === 'number' ? t.problemCode : null,
      vid,
      pid,
      locationInfo: t?.locationInfo,
      locationPaths,
    };
  });

  // Best-effort SetupAPI snapshot: this catches USB devices even when MTP/ADB are unavailable.
  // If the helper is not present, we continue with WMI-only data.
  const setupApiTransport = await getSetupApiUsbSnapshot(timeoutMs);
  const mergedById = new Map<string, TransportDevice>();
  for (const t of transportDevices) {
    const key = String(t?.instanceId || '').trim();
    if (!key) continue;
    mergedById.set(key.toUpperCase(), t);
  }
  for (const t of setupApiTransport) {
    const key = String(t?.instanceId || '').trim();
    if (!key) continue;
    const id = key.toUpperCase();
    const existing = mergedById.get(id);
    if (!existing) {
      mergedById.set(id, t);
      continue;
    }

    // Prefer richer metadata when merging the same device from multiple sources.
    mergedById.set(id, {
      ...existing,
      name: existing.name || t.name,
      status: existing.status || t.status,
      class: existing.class || t.class,
      problemCode: existing.problemCode ?? t.problemCode ?? null,
      vid: existing.vid || t.vid,
      pid: existing.pid || t.pid,
      locationInfo: existing.locationInfo || t.locationInfo,
      locationPaths: existing.locationPaths || t.locationPaths,
    });
  }

  const mergedTransportDevices = Array.from(mergedById.values());

  return { portableDevices, transportDevices: mergedTransportDevices };
}

async function sampleWindowsUsb(
  count: number,
  delayMs: number,
): Promise<{
  portableDevices: PortableDevice[];
  transportDevices: TransportDevice[];
  sample: { count: number; delayMs: number; anyChange: boolean };
}> {
  const snapshots: Array<{ portable: PortableDevice[]; transport: TransportDevice[]; sig: string }> = [];
  for (let i = 0; i < count; i++) {
    // Some PCs are slow to respond to CIM/WMI queries; keep this conservative but usable.
    const snap = await getWindowsUsbSnapshot(15_000);
    const sig = JSON.stringify({ p: snap.portableDevices, t: snap.transportDevices });
    snapshots.push({ portable: snap.portableDevices, transport: snap.transportDevices, sig });
    if (i < count - 1) {
      await sleep(delayMs);
    }
  }

  const first = snapshots[0];
  const anyChange = snapshots.some(s => s.sig !== first.sig);

  return {
    portableDevices: first?.portable || [],
    transportDevices: first?.transport || [],
    sample: { count, delayMs, anyChange },
  };
}

async function runWpdMtpProbe(
  usbHelperExe: string,
  nameContains: string | undefined,
  timeoutMs: number,
): Promise<MtpProbeEvidence> {
  const started = Date.now();
  try {
    const args = ['mtp-probe'];
    if (nameContains) {
      args.push('--nameContains', nameContains);
    }

    const { stdout } = await execFileAsync(usbHelperExe, args, { timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 });
    const parsed = tryJsonParse<any>(String(stdout || '').trim());
    if (!parsed || typeof parsed !== 'object') {
      const elapsedMs = Date.now() - started;
      return { tool: 'wpd', ok: false, elapsedMs, durationMs: elapsedMs, error: 'UsbEvidenceHelper returned invalid JSON' };
    }

    if (parsed.ok === false) {
      const elapsedMs = Date.now() - started;
      const fallbackHrHex = (typeof parsed.errorHResultHex === 'string' && parsed.errorHResultHex.trim())
        ? String(parsed.errorHResultHex).trim()
        : extractFirstHResultHex(typeof parsed.error === 'string' ? parsed.error : undefined);
      return {
        tool: 'wpd',
        ok: false,
        elapsedMs,
        durationMs: typeof parsed.durationMs === 'number' ? parsed.durationMs : elapsedMs,
        error: typeof parsed.error === 'string' ? parsed.error : 'WPD probe failed',
        errorHResult: typeof parsed.errorHResult === 'number' ? parsed.errorHResult : undefined,
        errorHResultHex: fallbackHrHex,
      };
    }

    const sampleItems = Array.isArray(parsed.sampleItems) ? parsed.sampleItems.map((x: any) => String(x || '')).filter(Boolean) : [];
    const deepSampleItems = Array.isArray(parsed.deepSampleItems) ? parsed.deepSampleItems.map((x: any) => String(x || '')).filter(Boolean) : [];
    const deviceCount = Array.isArray(parsed.devices) ? parsed.devices.length : undefined;
    const elapsedMs = Date.now() - started;
    return {
      tool: 'wpd',
      ok: true,
      elapsedMs,
      durationMs: typeof parsed.durationMs === 'number' ? parsed.durationMs : elapsedMs,
      deviceName: typeof parsed.deviceName === 'string' ? parsed.deviceName : undefined,
      deviceCount,
      sampleItems,
      deepOk: typeof parsed.deepOk === 'boolean' ? parsed.deepOk : undefined,
      deepError: typeof parsed.deepError === 'string' ? parsed.deepError : undefined,
      deepErrorHResult: typeof parsed.deepErrorHResult === 'number' ? parsed.deepErrorHResult : undefined,
      deepErrorHResultHex: typeof parsed.deepErrorHResultHex === 'string' ? parsed.deepErrorHResultHex : undefined,
      deepSampleItems,
      deepDurationMs: typeof parsed.deepDurationMs === 'number' ? parsed.deepDurationMs : undefined,
      deepEnumeratedCount: typeof parsed.deepEnumeratedCount === 'number' ? parsed.deepEnumeratedCount : undefined,
    };
  } catch (e: any) {
    const timedOut = e?.killed === true || e?.signal === 'SIGTERM' || /timed out|timeout/i.test(String(e?.message || ''));
    const elapsedMs = Date.now() - started;
    return {
      tool: 'wpd',
      ok: false,
      timedOut,
      elapsedMs,
      durationMs: elapsedMs,
      error: e?.message || 'WPD probe failed',
    };
  }
}

async function runWpdMtpPing(
  usbHelperExe: string,
  nameContains: string | undefined,
  timeoutMs: number,
): Promise<MtpProbeEvidence> {
  const started = Date.now();
  try {
    const args = ['mtp-ping'];
    if (nameContains) {
      args.push('--nameContains', nameContains);
    }

    const { stdout } = await execFileAsync(usbHelperExe, args, { timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 });
    const parsed = tryJsonParse<any>(String(stdout || '').trim());
    if (!parsed || typeof parsed !== 'object') {
      const elapsedMs = Date.now() - started;
      return { tool: 'wpd', ok: false, elapsedMs, durationMs: elapsedMs, error: 'UsbEvidenceHelper returned invalid JSON (mtp-ping)' };
    }

    if (parsed.ok === false) {
      const elapsedMs = Date.now() - started;
      const fallbackHrHex = (typeof parsed.errorHResultHex === 'string' && parsed.errorHResultHex.trim())
        ? String(parsed.errorHResultHex).trim()
        : extractFirstHResultHex(typeof parsed.error === 'string' ? parsed.error : undefined);
      const ev: MtpProbeEvidence = {
        tool: 'wpd',
        ok: false,
        elapsedMs,
        durationMs: typeof parsed.durationMs === 'number' ? parsed.durationMs : elapsedMs,
        error: typeof parsed.error === 'string' ? parsed.error : 'WPD ping failed',
        errorHResult: typeof parsed.errorHResult === 'number' ? parsed.errorHResult : undefined,
        errorHResultHex: fallbackHrHex,
      };
      if (isHostWpdUnsupportedError(ev)) return { ...ev, hostUnsupported: true };
      return ev;
    }

    const sampleItems = Array.isArray(parsed.sampleItems) ? parsed.sampleItems.map((x: any) => String(x || '')).filter(Boolean) : [];
    const deviceCount = Array.isArray(parsed.devices) ? parsed.devices.length : undefined;
    const elapsedMs = Date.now() - started;
    return {
      tool: 'wpd',
      ok: true,
      elapsedMs,
      durationMs: typeof parsed.durationMs === 'number' ? parsed.durationMs : elapsedMs,
      deviceName: typeof parsed.deviceName === 'string' ? parsed.deviceName : undefined,
      deviceCount,
      sampleItems,
      deepOk: undefined,
    };
  } catch (e: any) {
    const timedOut = e?.killed === true || e?.signal === 'SIGTERM' || /timed out|timeout/i.test(String(e?.message || ''));
    const elapsedMs = Date.now() - started;
    const ev: MtpProbeEvidence = {
      tool: 'wpd',
      ok: false,
      timedOut,
      elapsedMs,
      durationMs: elapsedMs,
      error: e?.message || 'WPD ping failed',
    };
    if (isHostWpdUnsupportedError(ev)) return { ...ev, hostUnsupported: true };
    return ev;
  }
}

async function runShellMtpProbe(timeoutMs: number, nameContains?: string): Promise<MtpProbeEvidence> {
  const started = Date.now();
  const needleJson = JSON.stringify((typeof nameContains === 'string' && nameContains.trim()) ? nameContains.trim() : '');
  const script = `
$ErrorActionPreference = 'Stop'
$needle = ${needleJson}
$shell = New-Object -ComObject Shell.Application
$pc = $shell.Namespace(0x11)
if (-not $pc) { throw 'No Shell.Namespace(0x11) (This PC)'}

$pcItems = @($pc.Items())
$pcNames = New-Object System.Collections.Generic.List[string]
foreach ($it in $pcItems) { try { $pcNames.Add([string]$it.Name) } catch {} }

$target = $null
if ($needle -and $needle.Trim().Length -gt 0) {
  foreach ($it in $pcItems) {
    try {
      if ([string]$it.Name -like ('*' + $needle + '*')) { $target = $it; break }
    } catch {}
  }
}
if (-not $target) {
  foreach ($it in $pcItems) {
    try {
      if ([string]$it.Name -and [string]$it.Name -ne '') { $target = $it; break }
    } catch {}
  }
}
if (-not $target) { throw 'device not found in shell' }

$deviceName = ''
try { $deviceName = [string]$target.Name } catch {}
$devicePath = ''
try { $devicePath = [string]$target.Path } catch {}

$folder = $null
try { $folder = $shell.Namespace($target) } catch {}
if (-not $folder -and $devicePath) { try { $folder = $shell.Namespace($devicePath) } catch {} }
if (-not $folder) { try { $folder = $target.GetFolder() } catch {} }
if (-not $folder) { throw 'cannot open mtp folder via shell' }

$childNames = New-Object System.Collections.Generic.List[string]
try {
  $children = @($folder.Items())
  foreach ($c in $children) { try { $childNames.Add([string]$c.Name) } catch {} }
} catch {}

@{ ok = $true; deviceName = $deviceName; devicePath = $devicePath; childCount = $childNames.Count; childNames = @($childNames) ; pcNames = @($pcNames) } | ConvertTo-Json -Depth 6 -Compress
`;
  try {
    const out = await runPowerShellJson<any>(script, timeoutMs);
    const deviceNameOut = (out && typeof out.deviceName === 'string') ? String(out.deviceName) : undefined;
    const childCount = (out && typeof out.childCount === 'number') ? out.childCount : undefined;
    const childNames = Array.isArray(out?.childNames) ? out.childNames.map((x: any) => String(x || '')).filter(Boolean) : [];
    const elapsedMs = Date.now() - started;
    return {
      tool: 'shell',
      ok: true,
      elapsedMs,
      durationMs: elapsedMs,
      deviceName: deviceNameOut,
      deviceCount: typeof childCount === 'number' ? childCount : undefined,
      sampleItems: childNames.slice(0, 10),
    };
  } catch (e: any) {
    const timedOut = /timed out|timeout/i.test(String(e?.message || ''));
    const elapsedMs = Date.now() - started;
    return { tool: 'shell', ok: false, timedOut, elapsedMs, durationMs: elapsedMs, error: e?.message || 'Shell probe failed' };
  }
}

// Helper to resolve the bundled ADB executable path
function resolveAdbPath(): string {
  const candidates = [
    path.join(process.cwd(), '3rdpartyApp', 'platform-tools', 'adb.exe'),
    path.join(process.cwd(), '3rdpartyApp', 'platform-tools', 'adb'),
    'adb',
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return 'adb';
}

async function runAdbShell(deviceId: string | undefined, command: string): Promise<string> {
  const adbPath = resolveAdbPath();
  const args = ['shell', command];
  if (deviceId) {
    args.unshift('-s', deviceId);
  }
  // Log the command being executed for debugging
  console.debug(`[MobileData] Using ADB: ${adbPath} with args: ${args.join(' ')}`);
  const { stdout } = await execFileAsync(adbPath, args, { timeout: 5000, maxBuffer: 1024 * 1024 });
  return stdout;
}

// Add this helper function at the top of the file or in a separate adb utility
async function getMobileDataState(deviceId?: string): Promise<string> {
  try {
    // First, try reading the global setting
    const result = await runAdbShell(deviceId, 'settings get global mobile_data');
    const trimmed = result.trim();
    if (trimmed === '1') {
      console.log('[MobileData] Setting returned: 1 -> Enabled');
      return 'Enabled';
    }
    if (trimmed === '0') {
      console.log('[MobileData] Setting returned: 0 -> Disabled');
      return 'Disabled';
    }

    // Fallback: dumpsys telephony.registry
    const dump = await runAdbShell(deviceId, 'dumpsys telephony.registry | grep mDataConnectionState');
    if (dump.includes('CONNECTED') || dump.includes('DISCONNECTED')) {
      const match = dump.match(/mDataConnectionState=(\d+)/);
      if (match) {
        const state = parseInt(match[1], 10);
        const resultState = state === 2 ? 'Enabled' : 'Disabled';
        console.log(`[MobileData] dumpsys state: ${state} -> ${resultState}`);
        return resultState;
      }
    }
    console.log('[MobileData] Unknown state (no setting match)');
    return 'Unknown';
  } catch (error) {
    console.error('Failed to get mobile data state:', error);
    return 'Unknown';
  }
}
async function listFastbootDevices(timeoutMs: number): Promise<Array<{ id: string; state?: string }>> {
  const { stdout } = await execFileAsync('fastboot', ['devices'], { timeout: timeoutMs, maxBuffer: 512 * 1024 });
  const lines = String(stdout || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  const devices: Array<{ id: string; state?: string }> = [];
  for (const line of lines) {
    const parts = line.split(/\s+/);
    const id = parts[0];
    const state = parts[1];
    if (id) devices.push({ id, state });
  }
  return devices;
}

export function registerConnectionCheckRoutes(app: Express): void {
  app.get('/connection-check', async (req: Request, res: Response) => {
    const startedAt = Date.now();

    const usbOnly = req.query.usbOnly === '1' || req.query.usbOnly === 'true';
    const deep = req.query.deep === '1' || req.query.deep === 'true' || req.query.autoTest === '1' || req.query.autoTest === 'true';
    const mtpProbe = req.query.mtpProbe === '1' || req.query.mtpProbe === 'true';
    const explicitAutoSave = req.query.autoSave === '1' || req.query.autoSave === 'true';
    const bsodDiagnosticIntent =
      explicitAutoSave ||
      usbOnly ||
      deep ||
      mtpProbe ||
      req.query.skipAdb === '1' ||
      req.query.skipAdb === 'true' ||
      req.query.noAdb === '1' ||
      req.query.noAdb === 'true' ||
      req.query.skipFastboot === '1' ||
      req.query.skipFastboot === 'true' ||
      req.query.userFreeze === '1' ||
      req.query.userFreeze === 'true' ||
      req.query.uiFrozen === '1' ||
      req.query.uiFrozen === 'true' ||
      req.query.techSafeMode === '1' ||
      req.query.techSafeMode === 'true' ||
      (typeof req.query.userSymptom === 'string' && req.query.userSymptom.trim().length > 0);

    // MTP probe timeout: enforce user expectation (5–8s) while preventing too-short timeouts.
    const mtpProbeTimeoutMs = clampNumber(req.query.mtpProbeTimeoutMs, 5_000, 8_000) ?? 8_000;

    // USB stability sampling: accept caller preferences within safe bounds.
    // In deep mode, callers often want more samples to distinguish disconnect/re-enumeration.
    const usbSampleCount = clampNumber(req.query.samples, deep ? 3 : 1, deep ? 40 : 1) ?? (deep ? 5 : 1);
    const usbSampleDelayMs = clampNumber(req.query.delayMs, deep ? 200 : 0, deep ? 4_000 : 0) ?? (deep ? 800 : 0);

    const skipAdb =
      req.query.skipAdb === '1' ||
      req.query.skipAdb === 'true' ||
      req.query.skipPlatformTools === '1' ||
      req.query.skipPlatformTools === 'true';

    const skipFastboot =
      req.query.skipFastboot === '1' ||
      req.query.skipFastboot === 'true' ||
      req.query.skipPlatformTools === '1' ||
      req.query.skipPlatformTools === 'true';

    const result: any = {
      ok: true,
      timestamp: new Date().toISOString(),
      adb: { ok: true, devices: [] as any[] },
      fastboot: { ok: true, devices: [] as any[] },
      hostUsb: {
        platform: process.platform,
        portableDevices: [] as PortableDevice[],
        transportDevices: [] as TransportDevice[],
        sample: { count: 1, delayMs: 0, anyChange: false },
      },
      bsodAnalysis: {
        category: 'USB-only checks completed',
        confidence: 'low',
        reasons: [] as string[],
      },
      summary: 'USB-only checks completed.',
    };

    // ADB
    if (skipAdb) {
      result.adb = { ok: true, skipped: true, devices: [] };
    } else {
      try {
        result.adb = { ok: true, devices: await listDevices() };
      } catch (e: any) {
        result.adb = { ok: false, error: e?.message || 'Failed to list devices via adb', devices: [] };
      }
    }
    // --- Mobile Data State ---
let mobileDataState = 'Unknown';
if (!skipAdb && result.adb.ok && Array.isArray(result.adb.devices)) {
  const device = result.adb.devices.find((d: any) => d && d.state === 'device' && typeof d.id === 'string');
  if (device) {
    try {
      mobileDataState = await getMobileDataState(device.id);
    } catch (e) {
      console.warn('Failed to get mobile data state:', e);
      mobileDataState = 'Unknown';
    }
  }
}
result.mobileData = mobileDataState;

    // Fastboot
    if (skipFastboot) {
      result.fastboot = { ok: true, skipped: true, devices: [] };
    } else {
      try {
        result.fastboot = { ok: true, devices: await listFastbootDevices(12_000) };
      } catch (e: any) {
        result.fastboot = { ok: false, error: e?.message || 'Failed to list devices via fastboot', devices: [] };
      }
    }

    // Optional OS corruption scoring (Windows-side ADB/Fastboot bridge).
    // Additive only: does NOT affect the existing BSOD verdict logic.
    const wantOsCorruption =
      req.query.osCorruption === '1' ||
      req.query.osCorruption === 'true' ||
      (bsodDiagnosticIntent && deep);

    if (wantOsCorruption) {
      try {
        const adbDevices = Array.isArray(result.adb?.devices) ? result.adb.devices : [];
        const adbReady = adbDevices.find((d: any) => d && d.state === 'device' && typeof d.id === 'string' && d.id.trim());
        const adbId = adbReady ? String(adbReady.id) : undefined;

        const fbDevices = Array.isArray(result.fastboot?.devices) ? result.fastboot.devices : [];
        const fbFirst = fbDevices[0] && fbDevices[0].id ? String(fbDevices[0].id) : undefined;

        const enableDmesg = req.query.osCorruptionDmesg === '1' || req.query.osCorruptionDmesg === 'true';

        result.osCorruption = await detectBsodOsCorruptionWindowsUsb({
          adbDeviceId: skipAdb ? undefined : adbId,
          fastbootDeviceId: skipFastboot ? undefined : fbFirst,
          timeoutMs: 20_000,
          enableDmesg,
        });
      } catch (e: any) {
        result.osCorruption = {
          ok: false,
          startedAt: new Date().toISOString(),
          durationMs: 0,
          error: e?.message || 'OS corruption scoring failed',
        };
      }
    }

    // Windows USB evidence
    if (process.platform === 'win32') {
      try {
        const sampled = await sampleWindowsUsb(usbSampleCount, usbSampleDelayMs);

        result.hostUsb.portableDevices = sampled.portableDevices;
        result.hostUsb.transportDevices = sampled.transportDevices;
        result.hostUsb.sample = sampled.sample;

        const transportLike: TransportDeviceLike[] = (sampled.transportDevices || []).map(d => ({
          name: d?.name,
          instanceId: d?.instanceId,
          vid: d?.vid,
          pid: d?.pid,
          status: d?.status,
        }));
        result.hostUsb.transportProfile = summarizeTransportProfile(transportLike);
      } catch (e: any) {
        result.hostUsb.error = e?.message || 'Failed to query Windows USB devices';
      }
    } else {
      result.hostUsb.error = 'Host USB evidence is only supported on Windows in this build.';
    }

    // Optional MTP responsiveness probe
    if (process.platform === 'win32' && deep && mtpProbe) {
      const usbHelperExe = resolveUsbEvidenceHelperExePath();
      const portable = Array.isArray(result.hostUsb.portableDevices) ? result.hostUsb.portableDevices : [];
      const nameContains = portable[0]?.name ? String(portable[0].name) : undefined;

      let evidence: MtpProbeEvidence;

      if (usbHelperExe && !cachedHostWpdUnsupported) {
        const wpdEv = await runWpdMtpProbe(usbHelperExe, nameContains, mtpProbeTimeoutMs);
        if (wpdEv.ok === false && isHostWpdUnsupportedError(wpdEv)) {
          cachedHostWpdUnsupported = true;
          // Host COM/WPD is broken on this PC. Try a Shell-based MTP probe that does not rely on WPD.
          const shellEv = await runShellMtpProbe(mtpProbeTimeoutMs, nameContains);
          if (shellEv.ok === true || shellEv.timedOut === true) {
            evidence = shellEv;
          } else {
            // True host-side limitation: we cannot assess phone responsiveness from this PC.
            evidence = { ...wpdEv, hostUnsupported: true, sampleItems: shellEv.sampleItems };
          }
        } else if (wpdEv.ok === false) {
          // Non-host WPD failure: keep the WPD evidence, but still try Shell for a best-effort item list.
          const shellEv = await runShellMtpProbe(mtpProbeTimeoutMs, nameContains);
          evidence = {
            ...wpdEv,
            sampleItems: (wpdEv.sampleItems && wpdEv.sampleItems.length) ? wpdEv.sampleItems : shellEv.sampleItems,
          };
        } else {
          evidence = wpdEv;
        }
      } else {
        evidence = await runShellMtpProbe(mtpProbeTimeoutMs, nameContains);
      }

      result.hostUsb.mtpProbeEvidence = evidence;

      const mtpProbeDeviceCount = (evidence && typeof evidence.deviceCount === 'number') ? evidence.deviceCount : undefined;
      const mtpProbeSuggestsMtp = !!(
        evidence
        && evidence.ok === true
        && evidence.tool === 'wpd'
        && ((typeof mtpProbeDeviceCount === 'number' && mtpProbeDeviceCount > 0) || (typeof evidence.deviceName === 'string' && evidence.deviceName.trim().length > 0))
      );
      const mtpPresentForHeartbeat = portable.length > 0 || mtpProbeSuggestsMtp;

      async function snapshotStillEnumerated(): Promise<boolean | undefined> {
        try {
          const post = await getWindowsUsbSnapshot(12_000);
          const postPortableCount = Array.isArray(post?.portableDevices) ? post.portableDevices.length : 0;
          const postTransportCount = Array.isArray(post?.transportDevices) ? post.transportDevices.length : 0;
          result.hostUsb.mtpProbePostSnapshot = {
            portableCount: postPortableCount,
            transportCount: postTransportCount,
          };
          return postPortableCount > 0 || postTransportCount > 0;
        } catch (e: any) {
          result.hostUsb.mtpProbePostSnapshot = { error: e?.message || 'Failed to snapshot USB devices after MTP probe failure' };
          return undefined;
        }
      }

      const deepFailed = !!(
        evidence
        && evidence.ok === true
        && typeof evidence.deepOk === 'boolean'
        && evidence.deepOk === false
      );

      const hostUnsupported = !!(evidence && evidence.hostUnsupported === true);

      // Sanity check: if the MTP probe timed out OR failed with a suspect HRESULT
      // OR deep enumeration failed, confirm the device is still enumerated after.
      if (
        evidence
        && (
          (!hostUnsupported && evidence.ok === false && (evidence.timedOut || isSuspectMtpHResult(evidence.errorHResult) || isSuspectMtpHResult(evidence.deepErrorHResult)))
          || deepFailed
        )
      ) {
        const still = await snapshotStillEnumerated();
        if (typeof still === 'boolean') result.hostUsb.mtpProbeStillEnumerated = still;
      }

      // Heartbeat monitoring: repeated deep MTP probes to confirm a freeze.
      // Do NOT run this when the probe is unavailable on this PC (hostUnsupported),
      // otherwise we can "confirm a freeze" from host-side COM failures.

      const hbWindowTargetMs = clampNumber(req.query.hbWindowMs, 15_000, 30_000) ?? 15_000;
      const hbIntervalMs = clampNumber(req.query.hbIntervalMs, 1_500, 5_000) ?? 2_000;
      const hbAttemptTimeoutRawMs = clampNumber(req.query.hbAttemptTimeoutMs, 1_200, 8_000) ?? 4_000;
      const initialProbeMs = (evidence.ok === true && typeof evidence.elapsedMs === 'number' && evidence.elapsedMs > 0)
        ? evidence.elapsedMs
        : 0;
      // Guard against false timeout-based freezes when the initial MTP probe already
      // took ~2s+ on this PC. Keep heartbeat timeout above baseline + cushion.
      const safeFloorFromProbeMs = initialProbeMs > 0
        ? Math.min(8_000, Math.max(3_000, Math.round(initialProbeMs + 1_200)))
        : 3_000;
      const hbAttemptTimeoutMs = Math.max(hbAttemptTimeoutRawMs, safeFloorFromProbeMs);
      const heartbeat: MtpHeartbeatEvidence = {
        // IMPORTANT: when the MTP probe is unavailable on this PC (hostUnsupported),
        // do not attempt heartbeats and do not infer phone state.
        enabled: !hostUnsupported && mtpPresentForHeartbeat,
        attemptTimeoutMs: hbAttemptTimeoutMs,
        intervalMs: hbIntervalMs,
        maxAttempts: Math.max(1, Math.min(40, Math.floor(hbWindowTargetMs / hbIntervalMs) + 1)),
        windowTargetMs: hbWindowTargetMs,
        attempts: [],
        consecutiveFailures: 0,
        consecutiveTimeouts: 0,
        timeoutCount: 0,
        baselineMs: undefined,
        slowExtraMs: 2_000,
        slowCount: 0,
        freezeConfirmed: false,
        windowMs: 0,
      };

      const hbStarted = Date.now();
      let consecutiveFailures = 0;
      let consecutiveTimeouts = 0;
      let timeoutCount = 0;
      const okDurations: number[] = [];

      const initialStill = typeof result.hostUsb?.mtpProbeStillEnumerated === 'boolean'
        ? result.hostUsb.mtpProbeStillEnumerated
        : undefined;

      heartbeat.attempts.push({
        startedAt: new Date().toISOString(),
        ok: !!evidence.ok,
        timedOut: evidence.timedOut,
        elapsedMs: evidence.elapsedMs,
        error: evidence.error,
        errorHResult: evidence.errorHResult,
        errorHResultHex: evidence.errorHResultHex,
        deepOk: evidence.deepOk,
        deepError: evidence.deepError,
        deepErrorHResult: evidence.deepErrorHResult,
        deepErrorHResultHex: evidence.deepErrorHResultHex,
        stillEnumeratedAfter: initialStill,
      });

      // Baseline timing: collect a few quick successes, then warn if later pings are much slower.
      if (evidence.ok === true && typeof evidence.elapsedMs === 'number' && evidence.elapsedMs > 0) {
        okDurations.push(evidence.elapsedMs);
      }

      const initialTimedOut = !!(evidence.ok === false && evidence.timedOut === true);
      if (initialTimedOut) {
        consecutiveFailures = 1;
        consecutiveTimeouts = 1;
        timeoutCount = 1;
      }

      while (heartbeat.enabled && heartbeat.attempts.length < heartbeat.maxAttempts) {
        const elapsedWindow = Date.now() - hbStarted;
        if (elapsedWindow >= heartbeat.windowTargetMs) break;

        await sleep(heartbeat.intervalMs);

        const ev = (usbHelperExe && !hostUnsupported && evidence.tool === 'wpd')
          ? await runWpdMtpPing(usbHelperExe, nameContains, heartbeat.attemptTimeoutMs)
          : await runShellMtpProbe(heartbeat.attemptTimeoutMs, nameContains);

        const timedOut = !!(ev.ok === false && ev.timedOut === true);
        const ok = !!ev.ok;

        let stillAfter: boolean | undefined = undefined;
        if (timedOut) {
          stillAfter = await snapshotStillEnumerated();
          consecutiveFailures++;
          consecutiveTimeouts++;
          timeoutCount++;
        } else if (!ok) {
          // Non-timeout failures are treated as instability/warnings, not freeze proof.
          // Keep a failure counter, but do NOT increment consecutiveTimeouts.
          consecutiveFailures++;
          consecutiveTimeouts = 0;
        } else {
          consecutiveFailures = 0;
          consecutiveTimeouts = 0;
          if (typeof ev.elapsedMs === 'number' && ev.elapsedMs > 0) okDurations.push(ev.elapsedMs);
        }

        const baseline = heartbeat.baselineMs ?? (okDurations.length >= 3 ? median(okDurations.slice(0, 5)) : undefined);
        if (baseline != null) heartbeat.baselineMs = baseline;
        const slow = ok && heartbeat.baselineMs != null && typeof ev.elapsedMs === 'number' && ev.elapsedMs > (heartbeat.baselineMs + heartbeat.slowExtraMs);
        if (slow) heartbeat.slowCount++;

        heartbeat.attempts.push({
          startedAt: new Date().toISOString(),
          ok,
          timedOut: ev.timedOut,
          elapsedMs: ev.elapsedMs,
          error: ev.error,
          errorHResult: ev.errorHResult,
          errorHResultHex: ev.errorHResultHex,
          deepOk: ev.deepOk,
          deepError: ev.deepError,
          deepErrorHResult: ev.deepErrorHResult,
          deepErrorHResultHex: ev.deepErrorHResultHex,
          stillEnumeratedAfter: stillAfter,
        });
      }

      // Freeze confirmation rule (USB-only): all heartbeat attempts timed out while still enumerated.
      // (Requested: ping every ~2s for ~15s; if all fail/time out ⇒ freeze.)
      try {
        const pingAttempts = heartbeat.attempts.slice(1); // exclude the initial deep probe attempt
        const allTimedOut = pingAttempts.length >= 3 && pingAttempts.every(a => a && a.ok === false && a.timedOut === true);
        const lastStill = pingAttempts.length ? pingAttempts[pingAttempts.length - 1].stillEnumeratedAfter : undefined;
        const toolSupportsStrongHeartbeatFreeze = evidence.tool === 'wpd';
        const baselineForTightCheck = (typeof heartbeat.baselineMs === 'number')
          ? heartbeat.baselineMs
          : ((evidence.ok === true && typeof evidence.elapsedMs === 'number') ? evidence.elapsedMs : undefined);
        const timeoutLikelyTooTight = typeof baselineForTightCheck === 'number'
          && heartbeat.attemptTimeoutMs <= (baselineForTightCheck + 200);

        if (allTimedOut && lastStill === true && toolSupportsStrongHeartbeatFreeze && !timeoutLikelyTooTight) {
          heartbeat.freezeConfirmed = true;
        }
      } catch {
        // ignore
      }

      heartbeat.consecutiveFailures = consecutiveFailures;
      heartbeat.consecutiveTimeouts = consecutiveTimeouts;
      heartbeat.timeoutCount = timeoutCount;
      heartbeat.windowMs = Math.max(0, Date.now() - hbStarted);
      result.hostUsb.mtpHeartbeat = heartbeat;
    } else {
      result.hostUsb.mtpProbeEvidence = { tool: 'none', ok: true, elapsedMs: 0 };
    }

    // Verdict / summary (minimal)
    const portableDevices = Array.isArray(result.hostUsb.portableDevices) ? result.hostUsb.portableDevices : [];
    const transportDevices = Array.isArray(result.hostUsb.transportDevices) ? result.hostUsb.transportDevices : [];
    const adbDevices = Array.isArray(result.adb?.devices) ? result.adb.devices : [];
    const fbDevices = Array.isArray(result.fastboot?.devices) ? result.fastboot.devices : [];
    const mtpEv = result.hostUsb?.mtpProbeEvidence as MtpProbeEvidence | undefined;
    const mtpProbeTool = (mtpEv && typeof mtpEv.tool === 'string') ? mtpEv.tool : 'none';

    const usbStable = !result.hostUsb?.error && !!(result.hostUsb?.sample && result.hostUsb.sample.anyChange === false);
    const mtpProbeDeviceCount = (mtpEv && typeof mtpEv.deviceCount === 'number') ? mtpEv.deviceCount : undefined;
    const mtpProbeSuggestsMtp = !!(
      mtpEv &&
      mtpEv.ok === true &&
      (
        (mtpEv.tool === 'wpd' && ((typeof mtpProbeDeviceCount === 'number' && mtpProbeDeviceCount > 0) || (typeof mtpEv.deviceName === 'string' && mtpEv.deviceName.trim().length > 0)))
        || (mtpEv.tool === 'shell' && (typeof mtpEv.deviceName === 'string' && mtpEv.deviceName.trim().length > 0))
      )
    );
    const mtpPresent = portableDevices.length > 0 || mtpProbeSuggestsMtp;
    const mtpProbeTimedOut = !!(mtpEv && mtpEv.ok === false && mtpEv.timedOut === true);
    const mtpProbeHostUnsupported = !!(mtpEv && mtpEv.hostUnsupported === true);
    const mtpProbeZeroDevices = !!(
      portableDevices.length > 0
      && mtpEv
      && mtpEv.tool === 'wpd'
      && mtpEv.ok === true
      && typeof mtpProbeDeviceCount === 'number'
      && mtpProbeDeviceCount === 0
      && !mtpProbeHostUnsupported
    );
    const mtpStillEnumerated =
      typeof result.hostUsb?.mtpProbeStillEnumerated === 'boolean' ? result.hostUsb.mtpProbeStillEnumerated : true;
    const noAdb = skipAdb || adbDevices.length === 0;

    const mtpProbeSuspectError = !!(
      mtpEv
      && mtpEv.ok === false
      && !mtpEv.timedOut
      && (isSuspectMtpHResult(mtpEv.errorHResult) || isSuspectMtpHResult(mtpEv.deepErrorHResult))
    );

    const mtpDeepFailed = !!(
      mtpEv
      && mtpEv.ok === true
      && typeof mtpEv.deepOk === 'boolean'
      && mtpEv.deepOk === false
    );

    const mtpProbeDurationMs = (mtpEv && typeof mtpEv.durationMs === 'number')
      ? mtpEv.durationMs
      : ((mtpEv && typeof mtpEv.elapsedMs === 'number') ? mtpEv.elapsedMs : undefined);
    const mtpProbeSlow = !!(mtpEv && mtpEv.ok === true && typeof mtpProbeDurationMs === 'number' && mtpProbeDurationMs > 3_000);

    const heartbeatFreezeConfirmed = !!(result.hostUsb?.mtpHeartbeat && result.hostUsb.mtpHeartbeat.freezeConfirmed === true);
    const heartbeatTimeoutCount = (result.hostUsb?.mtpHeartbeat && typeof result.hostUsb.mtpHeartbeat.timeoutCount === 'number')
      ? result.hostUsb.mtpHeartbeat.timeoutCount
      : 0;

    const phoneVisible = mtpPresent || adbDevices.length > 0 || fbDevices.length > 0;
    // Treat "MTP present but unresponsive" as a freeze-style hint.
    // We still keep final BSOD classification gated by timeout/heartbeat/user-confirm rules below.
    const mtpLooksFreezeUnresponsive = !mtpProbeHostUnsupported && (mtpProbeTimedOut || heartbeatFreezeConfirmed || mtpProbeZeroDevices);

    const reasons: string[] = [];
    if (portableDevices.length > 0) reasons.push('Windows enumerated a portable/MTP device');
    if (mtpProbeSuggestsMtp && portableDevices.length === 0) reasons.push('MTP probe detected an MTP device (WPD) even though PnP listing was unavailable');
    if (adbDevices.length > 0) reasons.push('ADB sees a USB Android device');
    if (fbDevices.length > 0) reasons.push('Fastboot sees a device');
    if (transportDevices.length > 0) reasons.push('Windows enumerated USB VID/PID transport devices');
    if (usbStable) reasons.push('USB transport remained stable during sampling (no re-enumeration)');
    if (mtpProbeTimedOut) {
      if (mtpProbeTool === 'shell') {
        reasons.push('MTP shell probe timed out (advisory signal only; not a confirmed freeze without technician confirmation)');
      } else {
        reasons.push('MTP command/probe timed out (strong freeze indicator if device stays enumerated)');
      }
    }
    if (mtpProbeZeroDevices) reasons.push('MTP probe returned 0 devices even though Windows enumerated an MTP/portable device (treat as unresponsive)');
    if (mtpProbeSuspectError) reasons.push('MTP probe failed with a device-side HRESULT (warning: could be instability/driver, not necessarily a freeze)');
    if (mtpDeepFailed) reasons.push('Deep MTP enumeration failed (warning: device visible but object listing could not be completed)');
    if (heartbeatFreezeConfirmed) reasons.push(`Heartbeat: sustained MTP timeouts while still enumerated (confirmed freeze)${heartbeatTimeoutCount ? ` [timeouts=${heartbeatTimeoutCount}]` : ''}`);
    if (mtpProbeHostUnsupported) reasons.push('MTP probe is unavailable on this PC (host COM/WPD interface not supported)');
    if (mtpProbeSlow) reasons.push(`MTP probe was slow (${Math.round(mtpProbeDurationMs!)}ms) – possible slowness (not necessarily a freeze)`);
    if (!mtpStillEnumerated && mtpProbeTimedOut) reasons.push('Note: device did not appear enumerated after the timeout (could be a disconnect, not a freeze)');
    if (noAdb) reasons.push('ADB not available (expected for many users)');

    const userConfirmsFreeze = req.query.userFreeze === '1' || req.query.userFreeze === 'true' || req.query.uiFrozen === '1' || req.query.uiFrozen === 'true';

    // Freeze classification rules (USB-only):
    // - Never classify as UI-freeze/BSOD without timeout evidence (deep timeout or sustained heartbeat timeouts).
    // - Require sustained unresponsiveness OR explicit user confirmation.
    // - If the probe is unavailable on this PC (hostUnsupported), only classify if the user confirms.
    const freezeRuleHit = (() => {
      if (!mtpPresent || !mtpStillEnumerated) return false;

      // If the probe is unavailable on this PC (hostUnsupported), do not infer
      // from host-side signals. Only allow an explicit technician confirmation.
      // Note: do not require USB stability for a manual confirmation path.
      if (mtpProbeHostUnsupported) return userConfirmsFreeze;

      if (!usbStable || !noAdb) return false;

      const strongProbeTimeoutEvidence = mtpProbeTimedOut && mtpProbeTool === 'wpd';
      const strongHeartbeatEvidence = heartbeatFreezeConfirmed && mtpProbeTool === 'wpd';

      // Deep timeout is primary evidence: if it times out while still enumerated, confirm freeze.
      if (strongProbeTimeoutEvidence) return true;

      // Heartbeat evidence: if all heartbeat pings time out for the window while still enumerated, confirm freeze.
      if (strongHeartbeatEvidence) return true;

      // Shell-based probe timeouts can be noisy on some PCs. Treat them as
      // advisory only unless a technician explicitly confirms UI freeze.
      if ((mtpProbeTimedOut || heartbeatFreezeConfirmed) && mtpProbeTool !== 'wpd') {
        return userConfirmsFreeze;
      }

      // If the deep probe did not time out, do not declare freeze solely from other errors.
      return false;
    })();

    if (freezeRuleHit) {
      result.bsodAnalysis = {
        category: 'BSOD – UI freeze (likely 3rd-party app)',
        confidence: 'high',
        reasons,
      };
      result.autoTest = {
        verdict: 'BSOD_UI_FREEZE_3P',
        confidence: 'high',
        reasons,
      };
      result.summary = 'BSOD – UI freeze detected. The device is partially alive (MTP), but the UI is unresponsive. Likely caused by a third-party app. Recovery: Safe Mode.';
      result.hostUsb.hostVerdict = { label: 'BSOD – UI freeze (WPD timeout/heartbeat)', confidence: 'high', reasons };
    } else if (mtpPresent) {
      if (mtpProbeHostUnsupported) {
        const hostMsg = 'MTP probe failed due to a host COM interface error. Cannot assess the phone\'s state. Please reinstall Windows Portable Devices drivers or test on another PC. If you can visually see the phone is normal, ignore this result.';
        result.bsodAnalysis = {
          category: 'Inconclusive – host COM interface error (MTP probe unavailable)',
          confidence: 'low',
          reasons: [
            ...reasons,
            hostMsg,
            'If you can visually confirm the phone UI is frozen, check UI-frozen confirmation and re-test.',
          ],
        };
        result.autoTest = { verdict: 'INCONCLUSIVE_MTP_PROBE_HOST', confidence: 'low', reasons: result.bsodAnalysis.reasons };
        result.summary = hostMsg;
        result.hostUsb.hostVerdict = { label: 'Inconclusive (host COM/WPD error)', confidence: 'low', reasons: result.bsodAnalysis.reasons };
      } else {
        result.bsodAnalysis = {
          category: 'Phone visible as storage (MTP) but not to ADB',
          confidence: 'medium',
          reasons,
        };
        result.autoTest = { verdict: 'PHONE_VISIBLE', confidence: 'low', reasons };
        result.summary = 'Windows can see the phone as a portable/MTP device.';
        result.hostUsb.hostVerdict = { label: 'Phone visible via MTP', confidence: 'medium', reasons };
      }
    } else if (adbDevices.length > 0) {
      result.bsodAnalysis = {
        category: 'Phone visible via ADB',
        confidence: 'high',
        reasons,
      };
      result.autoTest = { verdict: 'ADB_VISIBLE', confidence: 'high', reasons };
      result.summary = 'ADB can see the phone.';
      result.hostUsb.hostVerdict = { label: 'ADB visible', confidence: 'high', reasons };
    } else if (fbDevices.length > 0) {
      result.bsodAnalysis = {
        category: 'Phone visible only in fastboot/bootloader mode',
        confidence: 'medium',
        reasons,
      };
      result.autoTest = { verdict: 'FASTBOOT_VISIBLE', confidence: 'medium', reasons };
      result.summary = 'Fastboot can see the phone (bootloader mode).';
      result.hostUsb.hostVerdict = { label: 'Fastboot visible', confidence: 'medium', reasons };
    } else if (transportDevices.length > 0) {
      result.bsodAnalysis = {
        category: 'USB transport device present (no MTP/ADB/Fastboot)',
        confidence: 'low',
        reasons,
      };
      result.autoTest = { verdict: 'USB_PRESENT', confidence: 'low', reasons };
      result.summary = 'Windows sees USB transport activity, but no clear phone-mode signal was detected.';
      result.hostUsb.hostVerdict = { label: 'USB transport present', confidence: 'low', reasons };
    } else {
      result.bsodAnalysis = {
        category: 'No USB phone evidence',
        confidence: 'low',
        reasons: reasons.length ? reasons : ['No relevant USB/ADB/Fastboot signals were detected from this PC'],
      };
      result.autoTest = { verdict: 'NO_DEVICE', confidence: 'low', reasons: result.bsodAnalysis.reasons };
      result.summary = 'No phone evidence detected via this PC.';
      result.hostUsb.hostVerdict = { label: 'No phone evidence', confidence: 'low', reasons: result.bsodAnalysis.reasons };
    }

    // If we could not query Windows USB devices at all, do NOT conclude "NO_DEVICE".
    // This is a host-side limitation (often PowerShell/CIM/WMI), not evidence that the phone is absent.
    if (
      process.platform === 'win32'
      && result.hostUsb?.error
      && adbDevices.length === 0
      && fbDevices.length === 0
      && portableDevices.length === 0
      && transportDevices.length === 0
      && !mtpPresent
    ) {
      const hostErr = String(result.hostUsb.error || '').trim();
      result.bsodAnalysis = {
        category: 'Inconclusive – cannot query Windows USB devices on this PC',
        confidence: 'low',
        reasons: [
          ...(reasons.length ? reasons : []),
          hostErr ? `Windows USB enumeration failed: ${hostErr}` : 'Windows USB enumeration failed on this PC',
          'USB-only mode cannot conclude a BSOD/freeze when the host cannot enumerate USB devices.',
          'Try another PC, or fix host USB/WMI/PowerShell environment, then re-test.',
        ].filter(Boolean),
      };
      result.autoTest = { verdict: 'INCONCLUSIVE_HOST_USB_QUERY', confidence: 'low', reasons: result.bsodAnalysis.reasons };
      result.summary = 'Inconclusive – this PC could not enumerate USB devices. USB-only checks require Windows USB visibility.';
      result.hostUsb.hostVerdict = { label: 'Inconclusive (host USB enumeration failed)', confidence: 'low', reasons: result.bsodAnalysis.reasons };
    }

    result.durationMs = Math.max(0, Date.now() - startedAt);
    result.host = os.hostname();

    if (bsodDiagnosticIntent) {
      try {
        const saved = await autoSaveBsodHistoryRun(
          result,
          req.query,
          String((req as any)?.authUser?.id || '').trim(),
        );
        result.autoSavedBsodHistory = { ok: true, runId: saved.runId, historyKey: saved.historyKey };
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.error('connection-check auto-save failed:', e);
        result.autoSavedBsodHistory = {
          ok: false,
          error: e?.message || 'Failed to auto-save BSOD result',
        };
      }
    } else {
      result.autoSavedBsodHistory = { ok: false, skipped: true };
    }

    res.json(result);
  });
}