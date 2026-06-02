import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { adb, listDevices } from './adb';

export const execFileAsync = promisify(execFile);

export const dataRoot = (() => {
  const appData = process.env.APPDATA || process.env.LOCALAPPDATA;
  if (appData) return path.join(appData, 'SmartHubDiagnostics');
  return path.join(process.cwd(), '.smarthub-data');
})();

export const historyPath = path.join(dataRoot, 'history.json');

// SmartLink Host configuration lives alongside other app data.
export const smartLinkConfigPath = path.join(dataRoot, 'smartlink-config.json');

export type SmartLinkPairing = {
  id: string;
  publicKeyPem: string;
  defaultEnableAdb?: boolean;
  defaultEnableUsbTethering?: boolean;
};

export type SmartLinkConfig = {
  pairings: SmartLinkPairing[];
};

export async function loadSmartLinkConfig(): Promise<SmartLinkConfig> {
  try {
    const raw = await fs.readFile(smartLinkConfigPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).pairings)) {
      return parsed as SmartLinkConfig;
    }
  } catch {
    // Missing or invalid config is treated as "no pairings configured".
  }
  return { pairings: [] };
}

export function findSmartLinkPairing(config: SmartLinkConfig, id: string): SmartLinkPairing | undefined {
  if (!id) return undefined;
  const direct = config.pairings.find(p => p.id === id);
  if (direct) return direct;
  return config.pairings.find(p => p.id === 'default');
}

export type SmartLinkChallenge = {
  pairingId: string;
  challenge: Buffer;
  createdAt: number;
};

export const smartLinkChallenges = new Map<string, SmartLinkChallenge>();
export const SMARTLINK_CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function createSmartLinkChallengeId(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function verifySmartLinkSignature(publicKeyPem: string, challenge: Buffer, signature: Buffer): boolean {
  const verify = crypto.createVerify('RSA-SHA256');
  verify.update(challenge);
  verify.end();

  return verify.verify(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    },
    signature,
  );
}

// When installed via the Windows setup, SMARTHUB_HOME points to the
// application root. In development we fall back to the current working directory.
export const appInstallRoot = process.env.SMARTHUB_HOME || process.cwd();

export type PythonCommand = {
  exe: string;
  baseArgs: string[];
  label: string;
};

const defaultPythonExe: string = (() => {
  const venvDir = path.join(appInstallRoot, '.venv');
  const venvPython =
    process.platform === 'win32'
      ? path.join(venvDir, 'Scripts', 'python.exe')
      : path.join(venvDir, 'bin', 'python3');

  // Prefer the bundled virtual environment if it exists.
  if (fsSync.existsSync(venvPython)) {
    return venvPython;
  }

  // Otherwise fall back to an explicit override or system Python.
  const fromEnv = process.env.SMART_HUB_PYTHON_EXE?.trim();
  if (fromEnv) return fromEnv;

  return process.platform === 'win32' ? 'python' : 'python3';
})();

let cachedPythonCommand: PythonCommand | null = null;

function isLikelyBrokenWindowsPythonPath(candidate: string): boolean {
  const p = (candidate || '').trim();
  if (!p) return true;
  const norm = path.normalize(p).toLowerCase();
  if (norm === 'c:\\windows\\system32\\python' || norm === 'c:\\windows\\system32\\python.exe') return true;
  if (norm.includes('\\windowsapps\\python')) return true;
  return false;
}

async function probePythonVersion(cmd: PythonCommand): Promise<{ major: number; minor: number } | null> {
  try {
    const { stdout } = await execFileAsync(
      cmd.exe,
      [...cmd.baseArgs, '-c', 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")'],
      {
        maxBuffer: 64 * 1024,
        timeout: 5000,
      } as any,
    );
    const text = String(stdout || '').trim();
    const m = text.match(/(\d+)\.(\d+)/);
    if (!m) return null;
    const major = Number.parseInt(m[1], 10);
    const minor = Number.parseInt(m[2], 10);
    if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
    return { major, minor };
  } catch {
    return null;
  }
}

export async function resolvePythonCommand(): Promise<PythonCommand> {
  if (cachedPythonCommand) return cachedPythonCommand;

  const candidates: PythonCommand[] = [];
  const venvDir = path.join(appInstallRoot, '.venv');
  const venvPython =
    process.platform === 'win32'
      ? path.join(venvDir, 'Scripts', 'python.exe')
      : path.join(venvDir, 'bin', 'python3');
  const hasVenv = fsSync.existsSync(venvPython);
  if (hasVenv) {
    // When the bundled venv exists, always prefer it and ignore
    // SMART_HUB_PYTHON_EXE / PYTHON_EXE to avoid picking a global
    // Python without the required dependencies.
    candidates.push({ exe: venvPython, baseArgs: [], label: venvPython });
  } else {
    const env = process.env.SMART_HUB_PYTHON_EXE?.trim();
    if (env) {
      candidates.push({ exe: env, baseArgs: [], label: env });
    }

    const legacyEnv = process.env.PYTHON_EXE?.trim();
    if (legacyEnv) {
      candidates.push({ exe: legacyEnv, baseArgs: [], label: legacyEnv });
    }
  }

  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('where.exe', ['python'], {
        maxBuffer: 256 * 1024,
        timeout: 5000,
      } as any);
      const lines = String(stdout || '')
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);
      for (const line of lines) {
        candidates.push({ exe: line, baseArgs: [], label: line });
      }
    } catch {
      // ignore
    }

    candidates.push({ exe: 'py', baseArgs: ['-3'], label: 'py -3' });
  }

  candidates.push({ exe: defaultPythonExe, baseArgs: [], label: defaultPythonExe });
  if (process.platform !== 'win32') {
    candidates.push({ exe: 'python', baseArgs: [], label: 'python' });
  }

  const seen = new Set<string>();
  const unique: PythonCommand[] = [];
  for (const c of candidates) {
    const key = `${c.exe}::${c.baseArgs.join(' ')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }

  const viable: Array<{ cmd: PythonCommand; ver: { major: number; minor: number } }> = [];
  for (const c of unique) {
    if (process.platform === 'win32' && isLikelyBrokenWindowsPythonPath(c.exe)) continue;
    const ver = await probePythonVersion(c);
    if (!ver) continue;
    if (ver.major > 3 || (ver.major === 3 && ver.minor >= 8)) {
      viable.push({ cmd: c, ver });
    }
  }

  if (viable.length) {
    const preferred = viable.filter(v => v.ver.major === 3 && v.ver.minor <= 13);
    const pool = preferred.length ? preferred : viable;
    let best = pool[0];
    for (const item of pool) {
      if (item.ver.major > best.ver.major) best = item;
      else if (item.ver.major === best.ver.major && item.ver.minor > best.ver.minor) best = item;
    }
    cachedPythonCommand = best.cmd;
    return cachedPythonCommand;
  }

  cachedPythonCommand = { exe: defaultPythonExe, baseArgs: [], label: defaultPythonExe };
  return cachedPythonCommand;
}

export const screenTestsRoot = path.join(appInstallRoot, 'screenshot');

const apkCacheDir = path.join(dataRoot, 'apk-cache');

export function safeDeviceKey(id: string): string {
  return id.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

export function ensureBaseDirs(): void {
  fs.mkdir(dataRoot, { recursive: true }).catch(() => {
    // eslint-disable-next-line no-console
    console.error('Failed to ensure dataRoot directory');
  });

  fs.mkdir(screenTestsRoot, { recursive: true }).catch(() => {
    // eslint-disable-next-line no-console
    console.error('Failed to ensure screenTestsRoot directory');
  });

  fs.rm(apkCacheDir, { recursive: true, force: true }).catch(() => {
    // eslint-disable-next-line no-console
    console.error('Failed to remove legacy apk-cache directory');
  });
}

// Track how many long-running diagnostic operations are active per device.
const activeDiagnostics: Record<string, number> = {};

interface MobileAppState {
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
    // ignore
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

export function tmpDirPath(...parts: string[]): string {
  return path.join(os.tmpdir(), ...parts);
}
