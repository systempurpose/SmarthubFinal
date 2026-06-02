import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Some devices/USB drivers become unstable when many ADB commands are issued
// concurrently (especially during diagnostics where multiple endpoints run).
// To reduce transport flapping (device going offline / USB re-enumeration), we
// serialize ADB calls per device id. Different devices may still run in
// parallel.
const deviceCommandTail: Map<string, Promise<unknown>> = new Map();
const GLOBAL_ADB_KEY = '__adb_global__';
const deviceCooldownUntilMs: Map<string, number> = new Map();

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForCooldown(deviceId: string): Promise<void> {
  const until = deviceCooldownUntilMs.get(deviceId) || 0;
  const now = Date.now();
  if (until > now) {
    await sleep(until - now);
  }
}

function startCooldown(deviceId: string, ms: number): void {
  const now = Date.now();
  const until = Math.max(deviceCooldownUntilMs.get(deviceId) || 0, now + ms);
  deviceCooldownUntilMs.set(deviceId, until);
}

function extractDeviceId(args: string[]): string | undefined {
  // Supports: adb -s <serial> ...
  const idx = args.indexOf('-s');
  if (idx !== -1 && idx + 1 < args.length) {
    const id = String(args[idx + 1] || '').trim();
    return id || undefined;
  }
  return undefined;
}

function isDisallowedNonUsbAdbTarget(deviceId: string): boolean {
  const id = String(deviceId || '').trim();
  if (!id) return false;
  if (/^emulator-\d+$/i.test(id)) return true;
  // ADB-over-network serials are host:port (e.g. 127.0.0.1:5555, localhost:5555, 192.168.x.x:5555)
  if (id.includes(':')) return true;
  return false;
}

function assertUsbOnlyTarget(deviceId: string): void {
  if (isDisallowedNonUsbAdbTarget(deviceId)) {
    throw new Error(`Refusing ADB target "${deviceId}": only USB-connected Android devices are supported.`);
  }
}

function enqueueForDevice<T>(deviceId: string, task: () => Promise<T>): Promise<T> {
  const prev = deviceCommandTail.get(deviceId) ?? Promise.resolve();
  // Ensure the chain continues even if the previous task failed.
  const next = prev.then(task, task);
  deviceCommandTail.set(deviceId, next.catch(() => undefined));
  return next;
}

function enqueueGlobal<T>(task: () => Promise<T>): Promise<T> {
  return enqueueForDevice(GLOBAL_ADB_KEY, task);
}

function isTransientAdbError(message: string): boolean {
  const m = message.toLowerCase();
  // Common transient transport failures on Windows/USB.
  return (
    m.includes('device offline') ||
    m.includes('offline') ||
    m.includes('closed') ||
    m.includes('cannot connect') ||
    m.includes('connection reset') ||
    m.includes('protocol fault') ||
    m.includes('error: closed') ||
    (m.includes("device '") && m.includes("' not found"))
  );
}

function isWriteClosedError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('connect error for write: closed') || m.includes('error for write: closed');
}

async function bestEffortAdbReconnect(deviceId?: string): Promise<void> {
  try {
    await execFileAsync(ADB, ['reconnect'], { timeout: 12_000, maxBuffer: 1024 * 1024 });
  } catch {
    // ignore
  }

  if (!deviceId) return;
  try {
    // Quick ping to force a new transport.
    await execFileAsync(ADB, ['-s', deviceId, 'get-state'], { timeout: 8_000, maxBuffer: 256 * 1024 });
  } catch {
    // ignore
  }
}

function isAdbSafetyEnabled(): boolean {
  const raw = (process.env.SMARTHUB_ADB_SAFETY ?? process.env.SMART_HUB_ADB_SAFETY ?? '').trim().toLowerCase();
  // Default: enabled.
  if (!raw) return true;
  return !['0', 'false', 'off', 'no', 'disable', 'disabled'].includes(raw);
}

function describeBlockedAdb(args: string[], reason: string): never {
  const preview = args.join(' ');
  throw new Error(`Blocked unsafe ADB command (${reason}). Command: adb ${preview}`);
}

function assertAdbCommandSafe(args: string[]): void {
  if (!isAdbSafetyEnabled()) return;

  const lower = args.map(a => String(a).toLowerCase());

  // Block ADB-level commands that change device state or commonly cause USB flapping.
  const adbLevelBlocked = new Set([
    'kill-server',
    'start-server',
    'usb',
    'tcpip',
    'reboot',
    'root',
    'unroot',
    'remount',
    'disable-verity',
    'enable-verity',
  ]);

  for (const tok of lower) {
    if (adbLevelBlocked.has(tok)) {
      describeBlockedAdb(args, `adb subcommand '${tok}'`);
    }
  }

  // If the command runs a shell, block obviously destructive operations.
  const shellIdx = lower.indexOf('shell');
  if (shellIdx !== -1) {
    const shellArgs = args.slice(shellIdx + 1).join(' ');
    const s = shellArgs.toLowerCase();

    // Narrow allowlist: Bluetooth cache clear is a common technician action.
    // Permit only "pm clear com.android.bluetooth" (no other packages / flags).
    if (/^pm\s+clear\s+com\.android\.bluetooth\s*$/.test(s.trim())) {
      return;
    }

    // Conservative blacklist for destructive or system-modifying operations.
    const blockedPatterns: Array<{ re: RegExp; reason: string }> = [
      { re: /\breboot\b/, reason: 'shell reboot' },
      { re: /\brm\b/, reason: 'shell rm' },
      { re: /\brm\s+-rf\b/, reason: 'shell rm -rf' },
      { re: /\bdd\b/, reason: 'shell dd' },
      { re: /\bmkfs\b|\bmke2fs\b/, reason: 'shell mkfs' },
      { re: /\bmount\b|\bumount\b/, reason: 'shell mount/umount' },
      { re: /\bsetprop\b/, reason: 'shell setprop' },
      { re: /\bsettings\s+put\b/, reason: 'shell settings put' },
      { re: /\bsvc\b\s+usb\b|\bsvc\b\s+power\b/, reason: 'shell svc usb/power' },
      { re: /\bpm\s+uninstall\b|\bpm\s+clear\b/, reason: 'shell pm uninstall/clear' },
      { re: /\bpm\s+grant\b|\bpm\s+revoke\b/, reason: 'shell pm grant/revoke' },
      { re: /\binput\s+keyevent\b\s+\d+/, reason: 'shell input keyevent' },
    ];

    for (const p of blockedPatterns) {
      if (p.re.test(s)) {
        describeBlockedAdb(args, p.reason);
      }
    }
  }
}

async function execAdbWithRetry(args: string[], attempts: number): Promise<string> {
  assertAdbCommandSafe(args);
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const { stdout } = await execFileAsync(ADB, args, {
        maxBuffer: 25 * 1024 * 1024,
        // Avoid hanging forever if the transport is flapping.
        timeout: 45_000,
      });
      return stdout as string;
    } catch (e: any) {
      lastErr = e;
      const stderr = typeof e?.stderr === 'string' ? e.stderr : '';
      const msg = String(e?.message || stderr || 'ADB command failed');
      if (attempt < attempts - 1 && isTransientAdbError(msg)) {
        // Backoff a bit and retry; do not run additional recovery commands
        // that could make the USB flap worse.
        await sleep(400 + attempt * 600);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

type AdbExecOptions = {
  attempts: number;
  timeoutMs: number;
  maxBufferBytes: number;
};

async function execAdbWithRetryOptions(args: string[], opts: AdbExecOptions): Promise<string> {
  assertAdbCommandSafe(args);
  let lastErr: unknown;
  for (let attempt = 0; attempt < opts.attempts; attempt++) {
    try {
      const { stdout } = await execFileAsync(ADB, args, {
        maxBuffer: opts.maxBufferBytes,
        timeout: opts.timeoutMs,
      });
      return stdout as string;
    } catch (e: any) {
      lastErr = e;
      const stderr = typeof e?.stderr === 'string' ? e.stderr : '';
      const msg = String(e?.message || stderr || 'ADB command failed');
      if (attempt < opts.attempts - 1 && isTransientAdbError(msg)) {
        const id = extractDeviceId(args);
        if (id) {
          // Give the USB stack time to settle if the device is flapping.
          startCooldown(id, 2_500);
        }

        // Special-case: when the ADB client loses the socket mid-write, a reconnect
        // plus a longer backoff significantly reduces install/push flakiness.
        if (isWriteClosedError(msg)) {
          await bestEffortAdbReconnect(id);
          if (id) startCooldown(id, 4_000);
          await sleep(1_200 + attempt * 900);
          continue;
        }

        await sleep(400 + attempt * 600);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

function tryFindAndroidSdkAdb(): string | undefined {
  const exeName = process.platform === 'win32' ? 'adb.exe' : 'adb';

  const envRoots = [
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
  ]
    .map(v => (v || '').trim())
    .filter(Boolean);

  for (const root of envRoots) {
    const p = path.join(root, 'platform-tools', exeName);
    if (fs.existsSync(p)) return p;
  }

  if (process.platform === 'win32') {
    const localAppData = (process.env.LOCALAPPDATA || '').trim();
    if (localAppData) {
      const p = path.join(localAppData, 'Android', 'Sdk', 'platform-tools', exeName);
      if (fs.existsSync(p)) return p;
    }
  }

  return undefined;
}

async function adbWithOptions(args: string[], opts: AdbExecOptions): Promise<string> {
  const deviceId = extractDeviceId(args);
  if (deviceId) {
    assertUsbOnlyTarget(deviceId);
    return enqueueGlobal(() =>
      enqueueForDevice(deviceId, async () => {
        await waitForCooldown(deviceId);
        return execAdbWithRetryOptions(args, opts);
      }),
    );
  }
  return enqueueGlobal(() => execAdbWithRetryOptions(args, opts));
}

const ADB: string = (() => {
  // 1. Explicit override via environment, if provided.
  const fromEnv = process.env.ADB_PATH?.trim();
  if (fromEnv) return fromEnv;

  // 2. Android SDK platform-tools (if installed). This is especially important
  // when working with emulators, to avoid client/server version mismatches.
  const sdkAdb = tryFindAndroidSdkAdb();
  if (sdkAdb) return sdkAdb;

  // 3. Bundled platform-tools/adb under the SmartHub installation root.
  const home = process.env.SMARTHUB_HOME || process.env.SMART_HUB_HOME || process.cwd();
  const exeName = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const bundled = path.join(home, '3rdpartyApp', 'platform-tools', exeName);
  if (fs.existsSync(bundled)) return bundled;

  // 4. Fallback to plain "adb" (relies on system PATH).
  return 'adb';
})();

export type DeviceConnectionType = 'usb' | 'tcpip' | 'emulator' | 'unknown';

export interface DeviceConnection {
  type: DeviceConnectionType;
  host?: string;
  port?: number;
  usbPath?: string;
}

export interface DeviceInfo {
  id: string;
  state: string;
  model?: string;
  product?: string;
  deviceCode?: string;
  usbPath?: string;
  transportId?: string;
  connection?: DeviceConnection;
}

export async function adb(...args: string[]): Promise<string> {
  const deviceId = extractDeviceId(args);
  if (deviceId) {
    assertUsbOnlyTarget(deviceId);
    // Serialize globally *and* per-device to avoid ADB server contention.
    return enqueueGlobal(() =>
      enqueueForDevice(deviceId, async () => {
        await waitForCooldown(deviceId);
        return execAdbWithRetry(args, 3);
      }),
    );
  }
  return enqueueGlobal(() => execAdbWithRetry(args, 2));
}

export async function adbWithLimits(
  args: string[],
  limits: Partial<AdbExecOptions> = {},
): Promise<string> {
  const attempts = typeof limits.attempts === 'number' && Number.isFinite(limits.attempts) ? limits.attempts : 1;
  const timeoutMs = typeof limits.timeoutMs === 'number' && Number.isFinite(limits.timeoutMs) ? limits.timeoutMs : 10_000;
  const maxBufferBytes =
    typeof limits.maxBufferBytes === 'number' && Number.isFinite(limits.maxBufferBytes) ? limits.maxBufferBytes : 2 * 1024 * 1024;
  return adbWithOptions(args, { attempts, timeoutMs, maxBufferBytes });
}

export async function listDevices(): Promise<DeviceInfo[]> {
  const out = await adb('devices', '-l');
  const lines = out
    .trim()
    .split('\n')
    .slice(1)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const devices: DeviceInfo[] = [];

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const [id, state, ...rest] = parts;
    if (!id || !state) continue;

    // Strict: only treat USB-connected Android devices as valid targets.
    // This intentionally excludes emulators and ADB-over-network (tcpip) devices.
    if (/^emulator-\d+$/i.test(id)) {
      continue;
    }
    if (id.includes(':')) {
      continue;
    }

    const extras: Record<string, string> = {};
    for (const token of rest) {
      const idx = token.indexOf(':');
      if (idx === -1) continue;
      const key = token.slice(0, idx);
      const value = token.slice(idx + 1);
      if (key && value) {
        extras[key] = value;
      }
    }

    const model = extras.model;
    const product = extras.product;
    const deviceCode = extras.device;
    const usbPath = extras.usb;
    const transportId = extras.transport_id;

    let connectionType: DeviceConnectionType = 'unknown';
    let host: string | undefined;
    let port: number | undefined;

    if (/^emulator-\d+$/i.test(id)) {
      connectionType = 'emulator';
    } else if (id.includes(':')) {
      connectionType = 'tcpip';
      const [h, p] = id.split(':');
      host = h;
      const parsed = Number(p);
      if (!Number.isNaN(parsed)) {
        port = parsed;
      }
    } else {
      connectionType = 'usb';
    }

    const connection: DeviceConnection = { type: connectionType };
    if (host) connection.host = host;
    if (typeof port === 'number') connection.port = port;
    if (usbPath) connection.usbPath = usbPath;

    // If we ever classify a device as non-USB here, do not return it.
    if (connectionType !== 'usb') continue;

    devices.push({
      id,
      state,
      model,
      product,
      deviceCode,
      usbPath,
      transportId,
      connection,
    });
  }

  return devices;
}

export async function screencap(deviceId: string) {
  // Use binary encoding so we get a real PNG buffer instead of a UTF-8 string.
  return enqueueGlobal(() => enqueueForDevice(deviceId, async () => {
    return new Promise<Buffer>((resolve, reject) => {
      execFile(
        ADB,
        ['-s', deviceId, 'exec-out', 'screencap', '-p'],
        { maxBuffer: 20 * 1024 * 1024, encoding: 'buffer', timeout: 45_000 },
        (err, stdout) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(stdout as Buffer);
        },
      );
    });
  }));
}

type DiagnosticSnapshot = {
  propsDump: string;
  batteryDump: string;
  batteryDump2: string;
  batteryDump3: string;
  storageDump: string;
  memInfoDump: string;
  displayDump: string;
  wmSizeDump: string;
  wmDensityDump: string;
  cpuInfoDump: string;
  sensorsDump: string;
  cameraDump: string;
  connectivityDump: string;
  featuresDump: string;
};

function parseSnapshotSections(raw: string, marker: string): Record<string, string> {
  const sections: Record<string, string> = {};
  let current: string | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (!current) return;
    sections[current] = buf.join('\n').trim();
  };

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith(marker) && trimmed.endsWith(marker) && trimmed.length > marker.length * 2) {
      flush();
      current = trimmed.slice(marker.length, trimmed.length - marker.length);
      buf = [];
      continue;
    }
    if (current) buf.push(line);
  }

  flush();
  return sections;
}

export async function diagnosticSnapshot(deviceId: string): Promise<DiagnosticSnapshot> {
  // Batch multiple dumps into ONE adb shell invocation to reduce USB/ADB churn.
  const marker = '__SMARTHUB_SNAP__';
  const mk = (name: string) => `echo ${marker}${name}${marker}`;
  const script = [
    mk('PROPS'),
    'getprop',
    mk('BATTERY'),
    'dumpsys battery',
    mk('BATTERY2'),
    // Best-effort delay + second sample to detect intermittent battery presence/voltage reads.
    // Keep the delay short, but long enough to catch fast unplug/replug events.
    'sleep 2 2>/dev/null || /system/bin/sleep 2 2>/dev/null || toybox sleep 2 2>/dev/null || busybox sleep 2 2>/dev/null || true',
    'dumpsys battery',
    mk('BATTERY3'),
    // Third sample improves detection of intermittent power-path / connector instability.
    'sleep 2 2>/dev/null || /system/bin/sleep 2 2>/dev/null || toybox sleep 2 2>/dev/null || busybox sleep 2 2>/dev/null || true',
    'dumpsys battery',
    mk('STORAGE'),
    'df -h',
    mk('MEMINFO'),
    'cat /proc/meminfo',
    mk('DISPLAY'),
    'dumpsys display',
    mk('WMSIZE'),
    'wm size',
    mk('WMDENSITY'),
    'wm density',
    mk('CPUINFO'),
    'cat /proc/cpuinfo',
    mk('SENSORS'),
    'dumpsys sensorservice',
    mk('CAMERA'),
    'dumpsys media.camera',
    mk('CONNECTIVITY'),
    'dumpsys connectivity',
    mk('FEATURES'),
    'pm list features',
  ].join('; ');

  const out = await adbWithOptions(
    ['-s', deviceId, 'shell', 'sh', '-c', script],
    {
      attempts: 3,
      timeoutMs: 120_000,
      maxBufferBytes: 80 * 1024 * 1024,
    },
  );

  const sec = parseSnapshotSections(out, marker);
  return {
    propsDump: sec.PROPS || '',
    batteryDump: sec.BATTERY || '',
    batteryDump2: sec.BATTERY2 || '',
    batteryDump3: sec.BATTERY3 || '',
    storageDump: sec.STORAGE || '',
    memInfoDump: sec.MEMINFO || '',
    displayDump: sec.DISPLAY || '',
    wmSizeDump: sec.WMSIZE || '',
    wmDensityDump: sec.WMDENSITY || '',
    cpuInfoDump: sec.CPUINFO || '',
    sensorsDump: sec.SENSORS || '',
    cameraDump: sec.CAMERA || '',
    connectivityDump: sec.CONNECTIVITY || '',
    featuresDump: sec.FEATURES || '',
  };
}

export async function basicSnapshot(deviceId: string): Promise<Pick<DiagnosticSnapshot, 'propsDump' | 'batteryDump' | 'storageDump' | 'memInfoDump'>> {
  const marker = '__SMARTHUB_BASIC__';
  const mk = (name: string) => `echo ${marker}${name}${marker}`;
  const script = [
    mk('PROPS'),
    'getprop',
    mk('BATTERY'),
    'dumpsys battery',
    mk('STORAGE'),
    'df -h',
    mk('MEMINFO'),
    'cat /proc/meminfo',
  ].join('; ');

  const out = await adbWithOptions(
    ['-s', deviceId, 'shell', 'sh', '-c', script],
    {
      attempts: 3,
      timeoutMs: 60_000,
      maxBufferBytes: 40 * 1024 * 1024,
    },
  );

  const sec = parseSnapshotSections(out, marker);
  return {
    propsDump: sec.PROPS || '',
    batteryDump: sec.BATTERY || '',
    storageDump: sec.STORAGE || '',
    memInfoDump: sec.MEMINFO || '',
  };
}

export async function dumpsysDisplay(deviceId: string) {
  return adb('-s', deviceId, 'shell', 'dumpsys', 'display');
}

export async function surfaceFlinger(deviceId: string) {
  return adb('-s', deviceId, 'shell', 'dumpsys', 'SurfaceFlinger');
}

export async function logcatErrors(deviceId: string) {
  return adb('-s', deviceId, 'logcat', '-d', '-v', 'time', '-b', 'main', '-b', 'system', '-b', 'events', '*:E');
}

export async function logcatWarnings(deviceId: string) {
  // Many battery/power path issues surface as WARN (not ERROR) on some OEM builds.
  // Keep this separate from logcatErrors to avoid inflating the default error payload.
  return adb('-s', deviceId, 'logcat', '-d', '-v', 'time', '-b', 'main', '-b', 'system', '-b', 'events', '*:W');
}

export async function deviceProps(deviceId: string) {
  return adb('-s', deviceId, 'shell', 'getprop');
}

export async function battery(deviceId: string) {
  return adb('-s', deviceId, 'shell', 'dumpsys', 'battery');
}

export async function storage(deviceId: string) {
  return adb('-s', deviceId, 'shell', 'df', '-h');
}

export async function memoryInfo(deviceId: string) {
  // /proc/meminfo is simple to parse (MemTotal in kB)
  return adb('-s', deviceId, 'shell', 'cat', '/proc/meminfo');
}

export interface ListedApp {
  packageName?: string;
  path?: string;
  raw?: string;
}

export async function listApps(deviceId: string): Promise<ListedApp[]> {
  const raw = await adb('-s', deviceId, 'shell', 'pm', 'list', 'packages', '-f', '--user', '0');
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      // Newer Android versions sometimes omit the apk path and only emit `package:com.foo`.
      const pathAndPkg = line.match(/^package:(.+)=(.+)$/);
      if (pathAndPkg) {
        return { path: pathAndPkg[1], packageName: pathAndPkg[2], raw: line };
      }

      const pkgOnly = line.match(/^package:([^=\s]+)$/);
      if (pkgOnly) {
        return { packageName: pkgOnly[1], raw: line };
      }

      return { raw: line };
    });
}

export async function packagePermissions(deviceId: string, pkg: string) {
  const out = await adb('-s', deviceId, 'shell', 'dumpsys', 'package', pkg);
  const perms = Array.from(out.matchAll(/requested permissions:\s*([\s\S]*?)\n\n/gi))
    .flatMap(m => m[1].split('\n').map(s => s.trim()).filter(Boolean));
  return perms;
}

/**
 * Get installer info for all packages.
 * Returns a map of packageName -> installerPackageName.
 * Apps not from Play Store will have null or non-Play-Store installer.
 */
export async function getInstallerMap(deviceId: string): Promise<Record<string, string | null>> {
  const raw = await adb('-s', deviceId, 'shell', 'pm', 'list', 'packages', '-i', '-3');
  const map: Record<string, string | null> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Format: package:com.example.app  installer=com.android.vending
    const match = trimmed.match(/^package:([^\s]+)\s+installer=(.+)$/);
    if (match) {
      const pkg = match[1];
      const installer = match[2].trim();
      map[pkg] = installer === 'null' ? null : installer;
    }
  }
  return map;
}

export async function sensors(deviceId: string) {
  return adb('-s', deviceId, 'shell', 'dumpsys', 'sensorservice');
}

export async function cameraInfo(deviceId: string) {
  return adb('-s', deviceId, 'shell', 'dumpsys', 'media.camera');
}

export async function connectivityInfo(deviceId: string) {
  return adb('-s', deviceId, 'shell', 'dumpsys', 'connectivity');
}

export async function hardwareFeatures(deviceId: string) {
  return adb('-s', deviceId, 'shell', 'pm', 'list', 'features');
}

export async function pull(deviceId: string, remotePath: string, localPath: string): Promise<void> {
  // File transfers can take longer than regular shell commands.
  await enqueueGlobal(() =>
    enqueueForDevice(deviceId, async () => {
      await execFileAsync(ADB, ['-s', deviceId, 'pull', remotePath, localPath], {
        maxBuffer: 2 * 1024 * 1024,
        timeout: 5 * 60_000,
      });
      return '';
    }),
  );
}
