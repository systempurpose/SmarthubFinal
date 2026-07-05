import { execFile } from 'node:child_process';
import express, { Request, Response } from 'express';
import cors from 'cors';
import fs from 'node:fs/promises';

import path from 'node:path';
import os from 'node:os';
import networkRoutes from './routes/networkRoutes';
import crypto from 'node:crypto';
import { registerBsodRoutes } from './routes/bsodRoutes';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import overlayRoutes from './routes/overlayRoutes';
import fridaRoutes from './routes/fridaRoutes';
import rootkitRoutes from './routes/rootkitRoutes';
import straceRoutes from './routes/straceRoutes';
import fileMonitorRoutes from './routes/fileMonitorRoutes';
import WebSocket from 'ws';
import largeFilesRoutes from './routes/largeFilesRoutes';
import fileRoutes from './routes/fileRoutes';
import storageCategoryRoutes from './routes/storageCategoryRoutes';

import { registerConnectivityFixRoutes } from './routes/connectivityFixRoutes';

// At the top with other imports
import { detectPackerIndicators } from './heuristics';

let httpServer: ReturnType<typeof app.listen> | undefined;
const execAsync = promisify(exec);


import {
  listDevices,
  screencap,
  dumpsysDisplay,
  surfaceFlinger,
  logcatErrors,
  deviceProps,
  battery,
  storage,
  memoryInfo,
  listApps,
  packagePermissions,
  getInstallerMap,
  sensors,
  cameraInfo,
  connectivityInfo,
  hardwareFeatures,
  adb,
  pull as adbPull,
} from './adb';
import {
  analyzeBattery,
  analyzeStorage,
  analyzeLogs,
  analyzeApps,
  classifyAppRisk,
  assessAppRisk,
  scoreAppRisk,
  detectSuspiciousApps,
  classifyThreatTypes,
  hasDangerousPermissions,
  RiskLevel,
  TRUSTED_PREFIXES,
  TRUSTED_EXACT_PACKAGES,
  LEGITIMATE_INSTALLERS,
} from './heuristics';
import { assessPackageLegitimacy } from './packageLegitimacy';
import { classifyMalware } from './malwareClassifier';

import { type SavedRun } from './lib/historyStore';
import {
  fetchDiagnosticRunsFromCloud,
  saveDiagnosticRunToCloud,
} from './lib/supabaseDiagnosticsStore';

import {
  beginMobileDiagnostic,
  dataRoot,
  endMobileDiagnostic,
  ensureBaseDirs,
  execFileAsync,
  getMobileAppState,
  pickPrimaryDeviceId,
  resolvePythonCommand,
  safeDeviceKey,
  screenTestsRoot,
  smartLinkConfigPath,
  SMARTLINK_CHALLENGE_TTL_MS,
  smartLinkChallenges,
  createSmartLinkChallengeId,
  findSmartLinkPairing,
  loadSmartLinkConfig,
  verifySmartLinkSignature,
} from './serverContext';

import { registerAiRoutes } from './routes/aiRoutes';
import { registerConnectionCheckRoutes } from './routes/connectionCheckRoutes';
import { registerDeviceRoutes } from './routes/deviceRoutes';
import { registerOnDeviceReportRoutes } from './routes/onDeviceReportRoutes';
import { registerScreenRoutes } from './routes/screenRoutes';
import { registerBlueTestRoutes } from './routes/blueTestRoutes';
import { registerInstallRoutes } from './routes/installRoutes';
import { registerCollectRoutes } from './routes/collectRoutes';
import { registerDeepScanRoutes } from './routes/deepScanRoutes';
import { registerAdbMaintenanceRoutes } from './routes/adbMaintenanceRoutes';
import { registerOnlineAiRoutes } from './routes/onlineAiRoutes';
import { createAuthMiddleware, registerAuthRoutes } from './routes/authRoutes';
import { registerWifiRoutes } from './routes/wifiRoutes';
import { registerAndroidConnectivityRoutes } from './routes/androidConnectivityRoutes';
import { registerAppBehaviorRoutes } from './routes/appBehaviorRoutes';
import hardwareRoutes from './routes/hardwareRoutes';
import repairRoutes from './routes/repairRoutes';




// Helper to run PowerShell scripts without quoting issues
async function runPowerShellScript(script: string, timeoutMs = 6000): Promise<string> {
    // Convert the script to UTF-16LE base64 (required for -EncodedCommand)
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const { stdout } = await promisify(execFile)(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
        { timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 }
    );
    return stdout;
}
// YARA scan using official yara64.exe
async function scanWithYara(apkPath: string): Promise<{ rule: string; matches: string[] }[]> {
    const yaraExe = path.join(process.cwd(), 'tools', 'yara64.exe');
    const rulesDir = path.join(process.cwd(), 'yara-rules');
    // Check if executable and rules directory exist
    try {
        await fs.access(yaraExe);
        await fs.access(rulesDir);
    } catch {
        console.warn('YARA executable or rules directory not found, skipping YARA scan');
        return [];
    }
    try {
        // Run: yara64.exe -r rulesDir apkPath
        const { stdout } = await execAsync(`"${yaraExe}" -r "${rulesDir}" "${apkPath}"`);
        const lines = stdout.split('\n').filter(l => l.trim());
        const results: { rule: string; matches: string[] }[] = [];
        for (const line of lines) {
            const match = line.match(/^(\S+)\s+(.+)$/);
            if (match) {
                results.push({ rule: match[1], matches: match[2].split(',') });
            }
        }
        return results;
    } catch (err: any) {
        // yara returns exit code 1 when no matches; ignore that.
        if (err.message.includes('exit code 1')) return [];
        console.warn('YARA scan error:', err.message);
        return [];
    }
}
 // ----- ENTROPY & POLYMORPHIC CODE DETECTION -----
    async function calculateEntropy(filePath: string): Promise<number> {
      const buffer = await fs.readFile(filePath);
      const byteCounts = new Array(256).fill(0);
      for (const byte of buffer) byteCounts[byte]++;
      let entropy = 0;
      for (let i = 0; i < 256; i++) {
        if (byteCounts[i] === 0) continue;
        const p = byteCounts[i] / buffer.length;
        entropy -= p * Math.log2(p);
      }
      return entropy / 8; // normalized 0..1
    }
async function pullApk(deviceId: string, packageName: string): Promise<string> {
  const tmpDir = os.tmpdir();
  const safePkg = packageName.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const localApk = path.join(tmpDir, `smarthub-scan-${safePkg}-${Date.now()}.apk`);
  const pmPath = await adb('-s', deviceId, 'shell', 'pm', 'path', packageName);
  const match = pmPath.match(/package:(.+)/);
  if (!match) throw new Error(`Could not find APK path for ${packageName}`);
  const remotePath = match[1].trim();
  await adbPull(deviceId, remotePath, localApk);
  return localApk;
}

async function computeSha256(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
const app = express();
app.get('/ping', (req, res) => {
    res.json({ ok: true, message: 'pong' });
});

// ---- Bluetooth state ----
// ---- Bluetooth state ----
// ---- Bluetooth state ----
// ---- Bluetooth state ----
app.get('/bluetooth/state/:id', async (req, res) => {
    const deviceId = req.params.id;
    try {
        const adb = require('./adb');
        let dump = '';
        try {
            dump = await adb('-s', deviceId, 'shell', 'dumpsys bluetooth');
        } catch (e) {
            // Fallback: use service call
            try {
                const service = await adb('-s', deviceId, 'shell', 'service call bluetooth_manager 8');
                // Parse the integer state from the parcel
                const match = service.match(/Result: Parcel\(([\s\S]*?)\)/);
                if (match) {
                    // The state is usually in the parcel as an int
                    const intMatch = match[1].match(/0x([0-9a-fA-F]+)/);
                    if (intMatch) {
                        const stateCode = parseInt(intMatch[1], 16);
                        // 0 = OFF, 1 = ON (or 2 = BLE_ON, etc.)
                        let state = 'UNKNOWN';
                        if (stateCode === 0) state = 'OFF';
                        else if (stateCode === 1 || stateCode === 2) state = 'ON';
                        else state = 'UNKNOWN';
                        const enabled = state === 'ON';
                        res.json({ enabled, state, bondedCount: 0 });
                        return;
                    }
                }
                // If we can't parse, fallback to settings
                const setting = await adb('-s', deviceId, 'shell', 'settings get global bluetooth_on');
                const enabled = setting.trim() === '1';
                res.json({ enabled, state: enabled ? 'ON' : 'OFF', bondedCount: 0 });
                return;
            } catch (e2) {
                // Fallback to settings
                const setting = await adb('-s', deviceId, 'shell', 'settings get global bluetooth_on');
                const enabled = setting.trim() === '1';
                res.json({ enabled, state: enabled ? 'ON' : 'OFF', bondedCount: 0 });
                return;
            }
        }
        // Parse adapter state from dumpsys
        let state = 'UNKNOWN';
        const patterns = [
            /Adapter state:\s*(\w+)/i,
            /State:\s*(\w+)/i,
            /mAdapterState\s*=\s*(\d+)/i,
            /bluetooth state\s*=\s*(\w+)/i
        ];
        for (const pattern of patterns) {
            const match = dump.match(pattern);
            if (match) {
                state = match[1];
                // If it's a number, map it: 10 = OFF, 11 = TURNING_ON, 12 = ON, 13 = TURNING_OFF
                if (!isNaN(parseInt(state))) {
                    const num = parseInt(state);
                    if (num === 10) state = 'OFF';
                    else if (num === 11) state = 'TURNING_ON';
                    else if (num === 12) state = 'ON';
                    else if (num === 13) state = 'TURNING_OFF';
                    else state = 'UNKNOWN';
                }
                break;
            }
        }
        // If still unknown, try settings as last resort
        if (state === 'UNKNOWN') {
            try {
                const setting = await adb('-s', deviceId, 'shell', 'settings get global bluetooth_on');
                if (typeof setting === 'string' && setting.trim() !== '') {
                    state = (String(setting).trim().toLowerCase() === '1' || String(setting).trim().toLowerCase() === 'true') ? 'ON' : 'OFF';
                }
            } catch {}
        }
        // Determine enabled using dumpsys state OR settings fallbacks (global/secure/system)
        const isStateOn = state === 'ON' || state === 'TURNING_ON' || state === 'BLE_ON';
        let settingGlobal = '';
        let settingSecure = '';
        let settingSystem = '';
        try { settingGlobal = (await adb('-s', deviceId, 'shell', 'settings get global bluetooth_on')) || ''; } catch (e) { settingGlobal = ''; }
        try { settingSecure = (await adb('-s', deviceId, 'shell', 'settings get secure bluetooth_on')) || ''; } catch (e) { settingSecure = ''; }
        try { settingSystem = (await adb('-s', deviceId, 'shell', 'settings get system bluetooth_on')) || ''; } catch (e) { settingSystem = ''; }
        const normalize = (v: any) => { if (!v && v !== 0) return false; const s = String(v).trim().toLowerCase(); return s === '1' || s === 'true'; };
        const settingEnabled = normalize(settingGlobal) || normalize(settingSecure) || normalize(settingSystem);
        const enabled = isStateOn || settingEnabled;
        const bondMatch = dump.match(/Bonded devices:\s*(\d+)/i);
        const bondedCount = bondMatch ? parseInt(bondMatch[1]) || 0 : 0;
        res.json({ enabled, state, bondedCount, settingGlobal: String(settingGlobal).trim(), settingSecure: String(settingSecure).trim(), settingSystem: String(settingSystem).trim() });
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});

// ---- Mobile Data state ----
// ---- Mobile Data state ----
// ---- Mobile Data state ----
// ---- Mobile Data state ----
app.get('/mobile-data/state/:id', async (req, res) => {
    const deviceId = req.params.id;
    try {
        const adb = require('./adb');
        let dump = '';
        try {
            dump = await adb('-s', deviceId, 'shell', 'dumpsys telephony.registry');
        } catch (e) {
            // Fallback: use settings (global/secure/system)
            const setting = await adb('-s', deviceId, 'shell', 'settings get global mobile_data').catch(() => '');
            const setting2 = await adb('-s', deviceId, 'shell', 'settings get secure mobile_data').catch(() => '');
            const setting3 = await adb('-s', deviceId, 'shell', 'settings get system mobile_data').catch(() => '');
            const normalize = (v: any) => { if (!v && v !== 0) return false; const s = String(v).trim().toLowerCase(); return s === '1' || s === 'true'; };
            const enabled = normalize(setting) || normalize(setting2) || normalize(setting3);
            res.json({ enabled, connected: enabled, networkType: 'Unknown', operator: 'Unknown', settingGlobal: String(setting).trim(), settingSecure: String(setting2).trim(), settingSystem: String(setting3).trim() });
            return;
        }
        // Parse data registration state
        let connected = false;
        // Try mDataRegState first (0=not registered, 1=registered)
        const regMatch = dump.match(/mDataRegState=(\d+)/);
        if (regMatch) {
            connected = regMatch[1] === '1';
        } else {
            // Fallback: mDataConnectionState (0=disconnected, 1=connecting, 2=connected)
            const connMatch = dump.match(/mDataConnectionState=(\d+)/);
            if (connMatch) {
                connected = connMatch[1] === '2';
            } else {
                // Another fallback: mDataEnabled
                const enabledMatch = dump.match(/mDataEnabled=(\w+)/);
                if (enabledMatch) {
                    connected = enabledMatch[1] === 'true';
                }
            }
        }
        // Check if mobile data is enabled (toggle)
        let enabled = false;
        try {
            const setting = await adb('-s', deviceId, 'shell', 'settings get global mobile_data');
            enabled = setting.trim() === '1';
        } catch {}
        // If we couldn't get toggle state, infer from connection
        if (!enabled && connected) enabled = true;
        // Parse network type
        let networkType = 'Unknown';
        const networkTypeCode = dump.match(/mDataNetworkType=(\d+)/)?.[1];
        if (networkTypeCode) {
            const networkMap: Record<string, string> = {
                '0': 'Unknown', '1': 'GPRS', '2': 'EDGE', '3': 'UMTS', '4': 'CDMA',
                '5': 'EVDO_0', '6': 'EVDO_A', '7': '1xRTT', '8': 'HSDPA', '9': 'HSUPA',
                '10': 'HSPA', '11': 'IDEN', '12': 'EVDO_B', '13': 'LTE', '14': 'EHRPD',
                '15': 'HSPAP', '16': 'GSM', '17': 'TD_SCDMA', '18': 'IWLAN', '19': 'LTE_CA',
                '20': 'NR'
            };
            networkType = networkMap[networkTypeCode] || networkTypeCode;
        }
        // Parse operator
        let operator = 'Unknown';
        const operatorMatch = dump.match(/mOperatorAlphaLong=(.+)/)?.[1];
        if (operatorMatch) operator = operatorMatch.trim();
        // Additionally consult settings values which may reflect the toggle faster on some devices
        let s1 = '';
        let s2 = '';
        let s3 = '';
        try { s1 = (await adb('-s', deviceId, 'shell', 'settings get global mobile_data')) || ''; } catch(e) { s1 = ''; }
        try { s2 = (await adb('-s', deviceId, 'shell', 'settings get secure mobile_data').catch(() => '')) || ''; } catch(e) { s2 = ''; }
        try { s3 = (await adb('-s', deviceId, 'shell', 'settings get system mobile_data').catch(() => '')) || ''; } catch(e) { s3 = ''; }
        const normalize = (v: any) => { if (!v && v !== 0) return false; const ss = String(v).trim().toLowerCase(); return ss === '1' || ss === 'true'; };
        if (normalize(s1) || normalize(s2) || normalize(s3)) enabled = true;

        res.json({ enabled, connected, networkType, operator, settingGlobal: String(s1).trim(), settingSecure: String(s2).trim(), settingSystem: String(s3).trim() });
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});

// TEMPORARY: Public endpoint for testing (no auth)
app.get('/api/test-scan', async (req, res) => {
    console.log('✅ Test endpoint reached');
    const deviceId = req.query.deviceId as string;
    if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });
    try {
        const allApps = await listApps(deviceId);
        const permsByPkg: Record<string, string[]> = {};
        for (const app of allApps) {
            if (!app.packageName) continue;
            permsByPkg[app.packageName] = await packagePermissions(deviceId, app.packageName);
        }
        const installerMap = await getInstallerMap(deviceId);
        const suspiciousApps = detectSuspiciousApps(allApps, permsByPkg, installerMap);
        res.json({ suspiciousApps, debug: { totalApps: allApps.length } });
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
app.disable('x-powered-by');

function envBool(name: string, fallback = false): boolean {
  const raw = (process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return fallback;
}

const allowRemote = envBool('SMARTHUB_ALLOW_REMOTE') || envBool('SMART_HUB_ALLOW_REMOTE');

function isAllowedOrigin(origin: string | undefined): boolean {
  // WebView2 loading local files typically sends Origin: null.
  if (!origin || origin === 'null') return true;
  return (
    origin.startsWith('http://localhost:') ||
    origin === 'http://localhost' ||
    origin.startsWith('http://127.0.0.1:') ||
    origin === 'http://127.0.0.1'
  );
}

function isLoopbackAddress(addr: string | undefined | null): boolean {
  const a = String(addr || '').toLowerCase();
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

app.get('/api/suspicious-apps', async (req, res) => {
  console.log('✅ Suspicious apps endpoint was called'); // ← ADD THIS LINE
  const deviceId = req.query.deviceId as string;
    if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });
    try {
        const allApps = await listApps(deviceId);
        const permsByPkg: Record<string, string[]> = {};
        for (const app of allApps) {
            if (!app.packageName) continue;
            permsByPkg[app.packageName] = await packagePermissions(deviceId, app.packageName);
        }
        const installerMap = await getInstallerMap(deviceId);
    const suspiciousAppsRaw = detectSuspiciousApps(allApps, permsByPkg, installerMap);
    const legitimacyChecks = await Promise.all(
      suspiciousAppsRaw.map(app => assessPackageLegitimacy(app.packageName, app.installer ?? installerMap?.[app.packageName] ?? null))
    );
    const legitimacyByPkg = new Map<string, (typeof legitimacyChecks)[number]>();
    suspiciousAppsRaw.forEach((app, index) => {
      legitimacyByPkg.set(app.packageName, legitimacyChecks[index]);
    });
    const suspiciousApps = suspiciousAppsRaw
      .map((app, index) => ({ ...app, packageLegitimacy: legitimacyChecks[index] }))
      .filter((app, index) => legitimacyChecks[index]?.verdict !== 'trusted');

        // Collect debug stats
        let totalApps = allApps.length;
        let skippedByTrustedPrefix = 0;
        let skippedByTrustedExact = 0;
        let skippedByLegitStore = 0;
    let skippedByLegitSearch = 0;
        let evaluatedSideloaded = 0;
        let evaluatedLegitStoreDangerous = 0;
        let sampleSkippedTrustedPrefix: string[] = [];
        let sampleSkippedTrustedExact: string[] = [];
        let sampleSkippedLegitStore: string[] = [];
    let sampleSkippedLegitSearch: string[] = [];

        for (const app of allApps) {
            const pkg = app.packageName;
            if (!pkg) continue;
            if (TRUSTED_PREFIXES.some(prefix => pkg.startsWith(prefix))) {
                skippedByTrustedPrefix++;
                if (sampleSkippedTrustedPrefix.length < 5) sampleSkippedTrustedPrefix.push(pkg);
                continue;
            }
            if (TRUSTED_EXACT_PACKAGES.includes(pkg)) {
                skippedByTrustedExact++;
                if (sampleSkippedTrustedExact.length < 5) sampleSkippedTrustedExact.push(pkg);
                continue;
            }
            const installer = installerMap?.[pkg];
            const fromLegitStore = installer !== null && LEGITIMATE_INSTALLERS.includes(installer || '');
            const perms = permsByPkg[pkg] || [];
            const hasDangerous = hasDangerousPermissions(perms);
            if (fromLegitStore) {
                if (hasDangerous) {
                    evaluatedLegitStoreDangerous++;
                    continue;
                }
                skippedByLegitStore++;
                if (sampleSkippedLegitStore.length < 5) sampleSkippedLegitStore.push(pkg);
                continue;
            }
              const legitimacy = legitimacyByPkg.get(pkg);
              if (legitimacy?.verdict === 'trusted') {
                skippedByLegitSearch++;
                if (sampleSkippedLegitSearch.length < 5) sampleSkippedLegitSearch.push(pkg);
                continue;
              }
            evaluatedSideloaded++;
        }

        res.json({
            suspiciousApps,
            debug: {
                totalApps,
                skippedByTrustedPrefix,
                skippedByTrustedExact,
                skippedByLegitStore,
                skippedByLegitSearch,
                evaluatedSideloaded,
                evaluatedLegitStoreDangerous,
                sampleSkippedTrustedPrefix,
                sampleSkippedTrustedExact,
                sampleSkippedLegitStore,
                sampleSkippedLegitSearch
            }
        });
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
// Basic hardening: security headers.
app.use((_req: Request, res: Response, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Secure-by-default: only allow loopback access unless explicitly enabled.
app.use((req: Request, res: Response, next) => {
  if (allowRemote) return next();
  if (isLoopbackAddress(req.socket.remoteAddress)) return next();
  return res.status(403).json({
    ok: false,
    error:
      'Remote access is disabled. Set SMARTHUB_ALLOW_REMOTE=1 to allow non-local connections.',
  });
});

// CORS: allow only local origins (and Origin: null for WebView/file://).
app.use(
  cors({
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (allowRemote) return cb(null, true);
      if (isAllowedOrigin(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  }),
);

app.use('/api/network', networkRoutes);

app.use('/android_logo', express.static('android_logo'));
// Extra guard: block non-local Origins on mutating requests.
app.use((req: Request, res: Response, next) => {
  if (allowRemote) return next();
  const method = String(req.method || '').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({ ok: false, error: 'Blocked request from untrusted Origin.' });
  }
  return next();
});

app.use(express.json({ limit: '1mb' }));



let readOnlyEnabled = envBool('SMARTHUB_READ_ONLY') || envBool('SMART_HUB_READ_ONLY');
const readOnlyForced = envBool('SMARTHUB_READ_ONLY_FORCE') || envBool('SMART_HUB_READ_ONLY_FORCE');

function isReadOnlyEnabled(): boolean {
  return readOnlyForced ? true : readOnlyEnabled;
}

app.get('/read-only', (_req: Request, res: Response) => {
  res.json({ ok: true, enabled: isReadOnlyEnabled(), forced: !!readOnlyForced });
});

      let androidWebSocket: WebSocket | null = null;

async function connectToAndroidRealTime(deviceId: string) {
  // Ensure ADB forward is set
  await execAsync(`adb -s ${deviceId} forward tcp:12345 tcp:8080`);
  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:12345');
    ws.on('open', () => {
      console.log('Connected to Android real‑time service');
      androidWebSocket = ws;
      resolve();
    });
    ws.on('error', (err) => {
      console.error('WebSocket connection failed:', err);
      reject(err);
    });
    ws.on('message', (data) => {
      const event = JSON.parse(data.toString());
      console.log('[RealTime]', event);
      // Store event in a global queue for the diagnostic modal
      // (e.g., push to an array that runDeepDiagnostic can later read)
    });
  });
}
app.post('/api/adb-forward', async (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });
  try {
    await execAsync(`adb -s ${deviceId} forward tcp:12345 tcp:8080`);
        const apkPath = path.join(process.cwd(), '3rdpartyApp', 'app.apk');
        await fs.access(apkPath); // check existence
        const installOutput = await adb('-s', deviceId, 'install', '-r', apkPath);
        // Launch the app after successful install
        let launchOutput = '';
        try {
            launchOutput = await adb('-s', deviceId, 'shell', 'am', 'start', '-n', 'com.smarthub.diagnostics/.MainActivity');
        } catch (launchErr) {
            launchOutput = 'Failed to auto-launch. Please open manually.';
        }
        res.json({ ok: true, installOutput: installOutput.trim(), launchOutput: launchOutput.trim() });
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: errorMessage });
    }
});

// 🔽 Public endpoint for suspicious apps (no authentication required)


app.post('/api/uninstall-package', async (req, res) => {
    const { deviceId, packageName } = req.body;
    if (!deviceId || !packageName) return res.status(400).json({ error: 'Missing deviceId or packageName' });
    try {
        const output = await adb('-s', deviceId, 'uninstall', packageName);
        res.json({ ok: true, output: output.trim() });
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});

app.post('/read-only', (req: Request, res: Response) => {
  const next = !!(req.body && (req.body as any).enabled);
  if (readOnlyForced && !next) {
    res.status(403).json({ ok: false, error: 'Read-only mode is enforced by the backend.', enabled: true, forced: true });
    return;
  }
  readOnlyEnabled = next;
  res.json({ ok: true, enabled: isReadOnlyEnabled(), forced: !!readOnlyForced });
});

// Lightweight readiness endpoint for the Windows shell (and diagnostics UI)
// to confirm the companion service is up.
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, ts: Date.now() });
});

// Best-effort shutdown endpoint for the Windows desktop shell.
// Local-only by default (loopback guard middleware applies).
// Used to "reset" the local server on app open/close.

app.post('/shutdown', (_req: Request, res: Response) => {
  res.json({ ok: true, ts: Date.now() });
  // Close after responding.
  setTimeout(() => {
    try {
      if (httpServer) {
        httpServer.close(() => process.exit(0));
        return;
      }
    } catch {
      // ignore
    }
    process.exit(0);
  }, 50);
});

// 🔽 Authentication routes – keep public endpoints above this line
// registerAuthRoutes(app);
// app.use(createAuthMiddleware()); // Authentication is disabled for now (no token required)

// Backend enforcement: block mutating device actions when Read-only mode is enabled.
app.use((req: Request, res: Response, next) => {
  if (!isReadOnlyEnabled()) return next();
  if (req.path === '/read-only') return next();

  const method = String(req.method || '').toUpperCase();
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') {
    return next();
  }

  const p = req.path || '';
  const blocked =
    p === '/install-app' ||
    p === '/install-smartlink-app' ||
    p === '/adb-uninstall' ||
    p.startsWith('/blue-test/') ||
    p.startsWith('/test/') ||
    p.startsWith('/screen-test/') ||
    p.startsWith('/wifi/fix/') ||
    p.startsWith('/android-connectivity/');

  if (!blocked) return next();
  res.status(403).json({ ok: false, error: 'Read-only mode is enabled. This action is disabled.' });
});
registerConnectivityFixRoutes(app);
app.use('/api', fileMonitorRoutes);
app.use('/api', straceRoutes);
app.use('/api', rootkitRoutes);
app.use('/api', fridaRoutes);
app.use('/api', overlayRoutes);
app.use('/api/hardware', hardwareRoutes);
app.use('/api/repair', repairRoutes);
app.get(['/', '/ui', '/ui.html', '/html', '/html/ui.html'], (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'html', 'ui.html'));
});
app.use(express.static('html'));
app.use('/css', express.static('css'));
app.use('/js', express.static('js'));
app.use('/api', largeFilesRoutes);
app.use('/api', fileRoutes);
app.use('/api', storageCategoryRoutes);


ensureBaseDirs();
registerBsodRoutes(app);
registerAiRoutes(app);
registerDeviceRoutes(app);
registerConnectionCheckRoutes(app);
registerScreenRoutes(app);
registerOnDeviceReportRoutes(app);
registerBlueTestRoutes(app);
registerInstallRoutes(app);
registerCollectRoutes(app);
registerDeepScanRoutes(app);
registerWifiRoutes(app);
registerAndroidConnectivityRoutes(app);
registerAppBehaviorRoutes(app);
registerAdbMaintenanceRoutes(app);
registerOnlineAiRoutes(app);

async function duMap(deviceId: string, dir: string): Promise<{ map: Record<string, number>; error?: string }> {
  try {
    const script = `cd ${dir} 2>/dev/null || exit 0; du -k -s * 2>/dev/null`;
    const out = await adb('-s', deviceId, 'shell', 'sh', '-c', script);
    const map: Record<string, number> = {};
    out
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)
      .forEach(line => {
        const parts = line.split(/\s+/);
        if (parts.length < 2) return;
        const sizeKb = Number(parts[0]);
        const name = parts.slice(1).join(' ');
        if (!name || Number.isNaN(sizeKb)) return;
        map[name] = sizeKb * 1024; // store in bytes
      });
    return { map };
  } catch (e: any) {
    return { map: {}, error: e?.message || 'du command failed' };
  }
}

function findCodeBytes(codeMap: Record<string, number>, pkg: string): number | undefined {
  if (!pkg) return undefined;
  if (typeof codeMap[pkg] === 'number') return codeMap[pkg];
  const entry = Object.entries(codeMap).find(([name]) => name === pkg || name.startsWith(`${pkg}-`));
  return entry ? entry[1] : undefined;
}

// No-debug + camera + AI routes were extracted to src/routes/noDebugRoutes.ts

// Blue/blank-screen quick tests were extracted to src/routes/blueTestRoutes.ts

app.get('/api/screenshot', async (req, res) => {
    const deviceId = req.query.deviceId as string;
    if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

    try {
        const tempFile = `/sdcard/screenshot_${Date.now()}.png`;
        await execAsync(`adb -s ${deviceId} shell screencap -p ${tempFile}`);
        const localFile = `./temp_screenshot_${Date.now()}.png`;
        await execAsync(`adb -s ${deviceId} pull ${tempFile} ${localFile}`);
        await execAsync(`adb -s ${deviceId} shell rm ${tempFile}`);
        const imageBuffer = await fs.readFile(localFile);   // <-- async
        const base64 = imageBuffer.toString('base64');
        await fs.unlink(localFile);                          // <-- async
        res.json({ image: base64 });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// CPU usage and temperature
app.get('/api/system/cpu', async (req, res) => {
    const deviceId = req.query.deviceId as string;
    if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });
    try {
        // Get CPU usage from top
        const topOutput = await adb('-s', deviceId, 'shell', 'top -n 1 -b | head -5');
        const usageMatch = topOutput.match(/CPU:\s*(\d+)%/);
        const usage = usageMatch ? parseInt(usageMatch[1]) : 0;
        
        // Get CPU cores count
        const cpuPresent = await adb('-s', deviceId, 'shell', 'cat /sys/devices/system/cpu/present');
        let cores = '?';
        if (cpuPresent) {
            const match = cpuPresent.match(/0-(\d+)/);
            if (match) cores = (parseInt(match[1]) + 1).toString();
        }
        
        // Get temperature (try common thermal zones)
        let temp = '?';
        try {
            const tempRaw = await adb('-s', deviceId, 'shell', 'cat /sys/class/thermal/thermal_zone0/temp');
            if (tempRaw) temp = (parseInt(tempRaw) / 1000).toFixed(0);
        } catch(e) { /* ignore */ }
        
        res.json({ usage, temp, cores });
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});


// System uptime
app.get('/api/system/uptime', async (req, res) => {
    const deviceId = req.query.deviceId as string;
    if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });
    try {
        const uptime = await adb('-s', deviceId, 'shell', 'cat /proc/uptime');
        const seconds = parseFloat(uptime.split(' ')[0]);
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        res.json({ uptime: `${days}d ${hours}h ${mins}m` });
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});



app.get('/mobile-app-state/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing device id.' });
    return;
  }
  try {
    const state = await getMobileAppState(id);
    res.json({ ok: true, ...state });
  } catch (e: any) {
    res
      .status(500)
      .json({ ok: false, error: e?.message || 'Failed to check mobile app state.' });
  }
});

app.post('/mobile-app-open', async (req: Request, res: Response) => {
  const body = req.body || {};
  const bodyId = typeof (body as any).id === 'string' ? String((body as any).id).trim() : '';
  const queryId = typeof req.query.id === 'string' ? String(req.query.id).trim() : '';
  const id = bodyId || queryId || (await pickPrimaryDeviceId());

  if (!id) {
    return res.status(400).json({ ok: false, error: 'Missing device id.' });
  }

  try {
    const stateBefore = await getMobileAppState(id);
    if (!stateBefore.installed) {
      return res.status(404).json({
        ok: false,
        installed: false,
        running: false,
        error:
          'SmartHub Diagnostics app is not installed on this phone. Install it first, then retry.',
      });
    }

    let launchOk = false;
    let launchOutput = '';
    let launchError = '';

    try {
      launchOutput = await adb(
        '-s',
        id,
        'shell',
        'am',
        'start',
        '-a',
        'android.intent.action.MAIN',
        '-c',
        'android.intent.category.LAUNCHER',
        '-n',
        'com.smarthub.diagnostics/.MainActivity',
      );
      launchOk = true;
    } catch (primaryErr: any) {
      try {
        launchOutput = await adb(
          '-s',
          id,
          'shell',
          'monkey',
          '-p',
          'com.smarthub.diagnostics',
          '-c',
          'android.intent.category.LAUNCHER',
          '1',
        );
        launchOk = true;
      } catch (fallbackErr: any) {
        launchError =
          fallbackErr?.message || primaryErr?.message || 'Failed to auto-open SmartHub app.';
      }
    }

    await new Promise(resolve => setTimeout(resolve, 1200));
    const stateAfter = await getMobileAppState(id);

    if (!launchOk && !stateAfter.running) {
      return res.status(500).json({
        ok: false,
        installed: stateAfter.installed,
        running: stateAfter.running,
        error: launchError || 'Could not open SmartHub Diagnostics app automatically.',
      });
    }

    return res.json({
      ok: true,
      installed: stateAfter.installed,
      running: stateAfter.running,
      launchOk: launchOk || stateAfter.running,
      message: stateAfter.running
        ? 'SmartHub Diagnostics app is now running on the phone.'
        : 'Launch command sent. Verify the app is visible on the phone screen.',
      output: launchOutput ? launchOutput.trim() : undefined,
      warning: launchError || undefined,
    });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, error: e?.message || 'Failed to open SmartHub Diagnostics app.' });
  }
});

// Lightweight file scan for user storage to help technicians spot
// potentially suspicious content. This does not attempt signature-based
// antivirus; it uses simple heuristics on file names and extensions.
app.get('/file-scan/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  try {
    await beginMobileDiagnostic(id);

    const roots = ['/sdcard', '/storage/emulated/0'];
    let usedRoot: string | undefined;
    let listing = '';

    for (const root of roots) {
      try {
        // Limit depth to avoid walking the entire filesystem while still
        // covering the majority of user-visible files.
        listing = await adb('-s', id, 'shell', 'find', root, '-maxdepth', '6', '-type', 'f');
        usedRoot = root;
        break;
      } catch {
        // Try next candidate root
      }
    }

    if (!usedRoot) {
      return res.json({ ok: false, error: 'Could not enumerate user files from device.' });
    }

    const paths = listing
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('find:'));

    const totalFiles = paths.length;

    const suspiciousExts = [
      '.apk',
      '.dex',
      '.jar',
      '.so',
      '.exe',
      '.bat',
      '.scr',
      '.msi',
      '.zip',
      '.rar',
      '.7z',
      '.tar',
      '.tar.gz',
      '.tgz',
    ];
    const suspiciousKeywords = [
      'hack',
      'crack',
      'cheat',
      'mod',
      'keygen',
      'trojan',
      'virus',
      'spy',
      'keylogger',
      'stealer',
      'ransom',
      'locker',
      'rat',
      'remote_admin',
      'miner',
      'cryptominer',
      'bitcoin',
      'crypto',
    ];

    const suspicious: string[] = [];
    for (const p of paths) {
      const lower = p.toLowerCase();
      let flagged = suspiciousExts.some(ext => lower.endsWith(ext));
      if (!flagged) {
        flagged = suspiciousKeywords.some(k => lower.includes(k));
      }
      if (flagged) {
        suspicious.push(p);
      }
    }

    const suspiciousFiles = suspicious.length;
    const summary = totalFiles
      ? `Scanned ~${totalFiles} files in user storage; flagged ${suspiciousFiles} as potentially suspicious.`
      : 'No user files were reported from the main storage area.';

    res.json({
      ok: true,
      root: usedRoot,
      totalFiles,
      suspiciousFiles,
      suspiciousSamples: suspicious.slice(0, 50),
      summary,
    });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('file-scan failed:', e);
    res.status(500).json({ ok: false, error: e?.message || 'File scan failed' });
  } finally {
    await endMobileDiagnostic(id);
  }
});

async function runDeepApkScan(deviceId: string, pkg: string): Promise<any> {
  const pathOut = await adb('-s', deviceId, 'shell', 'pm', 'path', pkg);
  const line = pathOut
    .split(/\r?\n/)
    .map(l => l.trim())
    .find(l => l.startsWith('package:'));

  if (!line) {
    throw new Error('Could not determine APK path for package');
  }

  const apkPath = line.replace(/^package:/, '').trim();
  if (!apkPath) {
    throw new Error('Empty APK path reported by pm path');
  }
  const safePkg = pkg.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const tmpDir = os.tmpdir();
  const localApk = path.join(tmpDir, `smarthub-apk-${safePkg}-${Date.now()}.apk`);

  await adbPull(deviceId, apkPath, localApk);

  const python = await resolvePythonCommand();
  const scanScript = path.resolve(__dirname, '..', 'security-tools', 'apk_security_scan.py');
  const { stdout: scanOut } = await execFileAsync(python.exe, [...python.baseArgs, scanScript, localApk], {
    maxBuffer: 10 * 1024 * 1024,
  });

  let parsed: any;
  try {
    parsed = JSON.parse(scanOut);
  } catch {
    parsed = { raw: scanOut };
  }

  try {
    await fs.unlink(localApk);
  } catch {
    // ignore cleanup failures
  }

  return parsed;
}

app.get('/app-usage/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  try {
    const apps = await listApps(id);

    const [codeSizes, dataSizes] = await Promise.all([
      duMap(id, '/data/app'),
      duMap(id, '/data/user/0'),
    ]);

    let dataMap = dataSizes.map;
    const duErrors: string[] = [];
    if (codeSizes.error) duErrors.push(codeSizes.error);
    if (dataSizes.error) duErrors.push(dataSizes.error);

    // Fallback for devices that expose data dirs via /data/data instead of /data/user/0
    if (!Object.keys(dataMap).length) {
      const alt = await duMap(id, '/data/data');
      dataMap = alt.map;
      if (alt.error) duErrors.push(alt.error);
    }

    const errors: string[] = [];
    const codeMapEmpty = Object.keys(codeSizes.map).length === 0;
    const dataMapEmpty = Object.keys(dataMap).length === 0;
    const permissionDenied = duErrors.some(e => /permission denied|not permitted|denied/i.test(e));
    if ((codeMapEmpty && dataMapEmpty) || permissionDenied) {
      errors.push('App storage sizes unavailable (device blocked access to /data). This is expected on non-rooted or locked-down builds.');
    }

    const appsWithSizes = apps.map(app => {
      const pkg = app.packageName || '';
      const codeBytes = findCodeBytes(codeSizes.map, pkg) || undefined;
      const dataBytes = pkg && typeof dataMap[pkg] === 'number' ? dataMap[pkg] : undefined;
      const totalBytes =
        typeof codeBytes === 'number' || typeof dataBytes === 'number'
          ? (codeBytes || 0) + (dataBytes || 0)
          : undefined;

      return {
        ...app,
        codeBytes,
        dataBytes,
        totalBytes,
      };
    });

    res.json({ apps: appsWithSizes, errors });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Unknown error' });
  }
});

app.get('/apps/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  try {
    await beginMobileDiagnostic(id);

    const apps = await listApps(id);
    const [batteryDump, logs] = await Promise.all([
      battery(id),
      logcatErrors(id),
    ]);
    const permsByPkg: Record<string, string[]> = {};
    for (const a of apps) {
      if (!a.packageName) continue;
      try {
    permsByPkg[a.packageName] = await packagePermissions(id, a.packageName);
} catch (err) {
    console.error(`Failed to get permissions for ${a.packageName}:`, err);
    permsByPkg[a.packageName] = [];
}
    }
    const findings = analyzeApps(apps, permsByPkg);
    // Touch / ghost touch heuristics based on logs and charging state
    let hasTouchDriverErrors = false;
    let hasInputAnomalies = false;
    let isChargingDuringLogs = false;

    if (logs) {
      if (/(touchpanel|fts|synaptics|goodix|elan|atmel).*error/i.test(logs) ||
        /InputReader.*(failed|error|not responding)/i.test(logs)) {
        hasTouchDriverErrors = true;
      }

      if (/InputDispatcher.*channel.*unresponsive/i.test(logs) ||
        /pointer .*cancel/i.test(logs) ||
        /touch event rate too high/i.test(logs)) {
        hasInputAnomalies = true;
      }
    }

    if (batteryDump) {
      if (/AC powered:\s*true/i.test(batteryDump) ||
        /USB powered:\s*true/i.test(batteryDump) ||
        /status:\s*(2|3)/i.test(batteryDump)) {
        isChargingDuringLogs = true;
      }
    }

    const touchIssues: string[] = [];
    if (hasTouchDriverErrors) {
      touchIssues.push('Touch controller or driver reported errors in logs');
    }
    if (hasInputAnomalies) {
      touchIssues.push('Input system reported abnormal touch or pointer behaviour');
    }
    if (!hasTouchDriverErrors && !hasInputAnomalies) {
      touchIssues.push('No clear touch-driver or input anomalies seen in recent logs');
    }
    if (isChargingDuringLogs) {
      touchIssues.push('Device was charging; ghost touch can worsen with bad cables/chargers');
    }

    const touchOk = !hasTouchDriverErrors && !hasInputAnomalies;
    const touchSummary = {
      ok: touchOk,
      hasTouchDriverErrors,
      hasInputAnomalies,
      isChargingDuringLogs,
      details: touchIssues.join(' · '),
    };

    const riskByPkg: Record<string, RiskLevel> = {};
    const riskScoreByPkg: Record<string, number> = {};
    const deepScanByPkg: Record<string, any> = {};

    // Get installer info (to detect sideloaded apps)
    let installerMap: Record<string, string | null> = {};
    try {
      installerMap = await getInstallerMap(id);
      console.log('[Apps] Installer map retrieved for', Object.keys(installerMap).length, 'third-party apps');
    } catch (e: any) {
      console.error('[Apps] Failed to get installer map:', e.message);
    }

    // Detect suspicious apps (adware, fake apps, malware signatures, sideloaded)
    const suspiciousApps = detectSuspiciousApps(apps, permsByPkg, installerMap);
    console.log('[Apps] Suspicious apps detected:', suspiciousApps.length);
    if (suspiciousApps.length > 0) {
      suspiciousApps.forEach((sa: any) => {
        console.log(`  - ${sa.displayName} (${sa.packageName}) [${sa.threatLevel}]: ${sa.reason}`);
      });
    }

    // Only run deep APK scans for a bounded set of suspicious packages
    // instead of every installed app. This keeps diagnostics fast on
    // devices with hundreds of apps while still providing strong
    // coverage where it matters most.
    const pkgsToDeepScan = new Set<string>();
    const MAX_DEEP_SCAN = 48;
    for (const sa of suspiciousApps) {
      if (!sa || !sa.packageName) continue;
      if (pkgsToDeepScan.size >= MAX_DEEP_SCAN) break;
      pkgsToDeepScan.add(String(sa.packageName));
    }

    console.log('[Apps] Deep APK scan target count:', pkgsToDeepScan.size);

    for (const app of apps) {
      const pkg = app.packageName;
      if (!pkg || !pkgsToDeepScan.has(pkg)) continue;

      try {
        deepScanByPkg[pkg] = await runDeepApkScan(id, pkg);
      } catch (deepErr: any) {
        // eslint-disable-next-line no-console
        console.error('Deep APK scan (batch) failed for', pkg, deepErr);
        deepScanByPkg[pkg] = { error: deepErr?.message || String(deepErr) };
      }
    }

    for (const app of apps) {
      const pkg = app.packageName;
      if (!pkg) continue;
      const perms = permsByPkg[pkg] || [];
      const base = scoreAppRisk(perms, app.path);

      let level: RiskLevel = base.level ?? classifyAppRisk(perms);
      let score = base.score;

      const deep = deepScanByPkg[pkg];
      const deepRisk = deep && typeof deep.risk === 'string' ? (deep.risk as RiskLevel) : undefined;

      if (deepRisk) {
        const order: Record<RiskLevel, number> = { safe: 0, moderate: 1, risky: 2 };
        if (order[deepRisk] > order[level]) {
          level = deepRisk;
        }

        if (deepRisk === 'risky' && score < 80) {
          score = 80;
        } else if (deepRisk === 'moderate' && score < 50) {
          score = 50;
        }
      }

      riskByPkg[pkg] = level;
      riskScoreByPkg[pkg] = score;
    }
    res.json({ apps, permsByPkg, riskByPkg, riskScoreByPkg, findings, deepScanByPkg, touchSummary, suspiciousApps });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Unknown error' });
  } finally {
    await endMobileDiagnostic(id);
  }
});

// ---- Device state detection (no ADB required) ----
// ============ VENDOR/MODE LOOKUP TABLES ============

const SAMSUNG_DOWNLOAD_PIDS = ['685d', '6860', '6865', '6855'];
const VID_QUALCOMM = '05c6';
const VID_MEDIATEK = '0e8d';
const VID_SAMSUNG = '04e8';
const VID_GOOGLE = '18d1';

interface UsbDeviceInfo {
    friendly: string;
    deviceId: string;
}

function extractVidPid(deviceId: string): { vid: string | null; pid: string | null } {
    const vidMatch = deviceId.match(/vid_([0-9a-f]{4})/i);
    const pidMatch = deviceId.match(/pid_([0-9a-f]{4})/i);
    return {
        vid: vidMatch ? vidMatch[1].toLowerCase() : null,
        pid: pidMatch ? pidMatch[1].toLowerCase() : null
    };
}

type DeviceState =
    | 'adb_ready'
    | 'adb_unauthorized'
    | 'recovery'
    | 'sideload'
    | 'mtp_normal'
    | 'bootloader'
    | 'samsung_download'
    | 'edl_qualcomm'
    | 'preloader_mediatek'
    | 'unknown_enumeration'
    | 'generic_usb_detected'
    | 'no_response';

function classifyUsbDevice(dev: UsbDeviceInfo): DeviceState | null {
    const { friendly, deviceId } = dev;
    const { vid, pid } = extractVidPid(deviceId);

    // Skip system devices
    if (/acpi|pci|system|motherboard|processor|intel|amd|nvidia|realtek|broadcom|conexant|microsoft|usb root hub|generic usb hub/i.test(friendly)) {
        return null;
    }

    // ---- MTP / Portable Device — device booted Android successfully ----
    // Broad pattern: any USB device that isn't a system device and not a firmware mode
    // Many Android phones appear as "Android" or "Phone" or the model name.
    // Also check for common MTP VID/PIDs (Google, Samsung, etc.) but we'll be more generic.

    // If it contains any of these keywords or is a recognizable phone brand/model, treat as MTP.
    // Since we already ruled out system devices, any non-system USB device that doesn't match
    // other specific modes is likely MTP or mass storage.
    if (/mtp|portable device|android usb device|media transfer protocol|mass storage|usb device|phone|smartphone|android|samsung|xiaomi|huawei|oppo|vivo|realme|oneplus|itel|infinix|tecno/i.test(friendly)) {
        return 'mtp_normal';
    }

    // If friendly name contains a common phone brand or "Android" but not already caught, catch it.
    if (/android|phone|mobile|cell|smart/i.test(friendly) && !/download|odin|preloader|edl|recovery/.test(friendly)) {
        return 'mtp_normal';
    }

    // ---- Samsung Download (Odin) mode ----
    if (vid === VID_SAMSUNG || /samsung/.test(friendly)) {
        if (pid && SAMSUNG_DOWNLOAD_PIDS.includes(pid)) return 'samsung_download';
        if (/download|odin/.test(friendly)) return 'samsung_download';
        // If it's Samsung and not specifically download, but also not ADB/fastboot/MTP, we'll treat as download
        // However, we already have MTP check above, so if it's Samsung and not MTP, it's likely download.
        if (!/mtp|portable|android usb device|mass storage/.test(friendly)) {
            return 'samsung_download';
        }
    }

    // ---- Qualcomm EDL (9008) ----
    if (vid === VID_QUALCOMM || /qdloader|9008/.test(friendly)) {
        return 'edl_qualcomm';
    }

    // ---- MediaTek Preloader ----
    if (vid === VID_MEDIATEK || /preloader|mediatek/.test(friendly)) {
        return 'preloader_mediatek';
    }

    // ---- Recovery ----
    if (/recovery/i.test(friendly)) {
        return 'recovery';
    }

    // ---- Unknown ----
    if (/unknown usb device/i.test(friendly)) {
        return 'unknown_enumeration';
    }

    // ---- Fallback: if it's a non-system USB device, treat as generic USB ----
    // But we want to prioritize MTP, so if we got here and it's not system, it's probably MTP.
    // However, to avoid misclassifying, we'll return null and let it be generic.
    return null;
}
// ============ MAIN ROUTE ============

// ---- Device state detection (no ADB) ----
// ---- Device state detection (no ADB) ----
// ---- Device state detection (no ADB) ----
// ---- Device state detection (no ADB) ----
// ---- Device state detection (no ADB) ----
app.get('/api/device-state', async (req, res) => {
    try {
        // 1. ADB
        let adbDevices: string[] = [];
        let hasDevice = false;
        let hasUnauthorized = false;
        try {
            const { stdout } = await execAsync('adb devices', { timeout: 5000 });
            const lines = stdout.split('\n').filter(l => l.trim() && !l.startsWith('List'));
            hasDevice = lines.some(l => /device\s*$/.test(l) && !l.includes('unauthorized'));
            hasUnauthorized = lines.some(l => /unauthorized/.test(l));
            adbDevices = lines.map(l => l.split('\t')[0]).filter(Boolean);
        } catch (_) {}

        if (hasDevice) {
            return res.json({ state: 'adb_ready', details: 'Device is booted and ADB ready', adbDevices });
        }
        if (hasUnauthorized) {
            return res.json({ state: 'adb_unauthorized', details: 'ADB unauthorized – approve on phone' });
        }

        // 2. Fastboot
        try {
            const { stdout } = await execAsync('fastboot devices', { timeout: 3000 });
            if (stdout.trim().length > 0) {
                return res.json({ state: 'bootloader', details: 'Device in fastboot/bootloader mode' });
            }
        } catch (_) {}

        // 3. USB enumeration (Windows only)
        if (process.platform === 'win32') {
            let stdout = '';
            try {
                const psScript = `
                    Get-PnpDevice | Where-Object { $_.Status -eq 'OK' } | ForEach-Object {
                        $friendly = $_.FriendlyName
                        $deviceId = $_.DeviceID
                        if ($friendly -or $deviceId) { "$friendly|$deviceId" }
                    }
                `;
                stdout = await runPowerShellScript(psScript, 6000);
                console.log('[DeviceState] PowerShell output length:', stdout.length);
                console.log('[DeviceState] PowerShell output (first 500 chars):', stdout.substring(0, 500));
            } catch (psErr) {
                console.warn('[DeviceState] PowerShell failed, falling back to wmic', psErr);
                try {
                    const { stdout: wmicOut } = await execAsync('wmic path Win32_PnPEntity where "Status=\'OK\'" get DeviceID,Name /format:csv', { timeout: 6000 });
                    const lines = wmicOut.split('\n').filter(l => l.trim() !== '');
                    const dataLines = lines.slice(1);
                    stdout = dataLines.map(line => {
                        const parts = line.split(',');
                        if (parts.length < 3) return '';
                        const name = parts.slice(2).join(',').trim();
                        const deviceId = parts[1]?.trim() || '';
                        return `${name}|${deviceId}`;
                    }).filter(Boolean).join('\n');
                    console.log('[DeviceState] wmic output length:', stdout.length);
                } catch (wmicErr) {
                    console.warn('[DeviceState] wmic also failed', wmicErr);
                }
            }

            const lines = stdout.split('\n').filter(l => l.trim() !== '');
            let isMTP = false;
            let isSamsungDownload = false;
            let isQdloader = false;
            let isPreloader = false;
            let isUnknown = false;
            let detectedPhone = false;

            for (const line of lines) {
                const parts = line.split('|');
                if (parts.length < 2) continue;
                const friendly = parts[0].trim().toLowerCase();
                const deviceId = parts[1].trim().toLowerCase();

                // Skip non-USB devices
                if (!deviceId.includes('usb')) continue;

                console.log(`[DeviceState] Checking USB device: friendly="${friendly}", deviceId="${deviceId}"`);

                // ---- Check if this is actually a phone ----
                // Look for phone-specific patterns: MTP, phone brands, or Android USB
                if (/mtp|portable device|android usb device|media transfer protocol|phone|smartphone|android|samsung|xiaomi|huawei|oppo|vivo|realme|oneplus|itel|infinix|tecno/i.test(friendly)) {
                    detectedPhone = true;
                    isMTP = true;
                    break;
                }

                // ---- Samsung Download ----
                if (/samsung/.test(friendly) || /vid_04e8/.test(deviceId)) {
                    if (/download|odin|mobile|composite/.test(friendly) ||
                        /pid_685d|pid_6860|pid_6865|pid_6855/.test(deviceId)) {
                        detectedPhone = true;
                        isSamsungDownload = true;
                        break;
                    }
                    detectedPhone = true;
                    isSamsungDownload = true;
                    break;
                }
                if (/qdloader|9008/.test(friendly) || /vid_05c6/.test(deviceId)) {
                    detectedPhone = true;
                    isQdloader = true;
                    break;
                }
                if (/preloader|mediatek/.test(friendly) || /vid_0e8d/.test(deviceId)) {
                    detectedPhone = true;
                    isPreloader = true;
                    break;
                }
                if (/unknown usb device/.test(friendly)) {
                    isUnknown = true;
                }
            }

            // If we found USB devices but none looked like a phone, return no_response
            if (!detectedPhone) {
                console.log('[DeviceState] No phone detected, returning no_response');
                return res.json({ state: 'no_response', details: 'No phone detected' });
            }

            if (isMTP) {
                console.log('[DeviceState] MTP detected');
                return res.json({ state: 'mtp_normal', details: 'MTP mode – device booted successfully' });
            }
            if (isSamsungDownload) {
                console.log('[DeviceState] Samsung Download detected');
                return res.json({ state: 'samsung_download', details: 'Samsung Download Mode (Odin) – ready for firmware flash' });
            }
            if (isQdloader) {
                console.log('[DeviceState] EDL detected');
                return res.json({ state: 'edl_qualcomm', details: 'Qualcomm EDL (9008) mode – bootloader corrupted' });
            }
            if (isPreloader) {
                console.log('[DeviceState] Preloader detected');
                return res.json({ state: 'preloader_mediatek', details: 'MediaTek Preloader mode – OS did not load' });
            }
            if (isUnknown) {
                console.log('[DeviceState] Unknown USB device detected');
                return res.json({ state: 'unknown_enumeration', details: 'Unknown USB device – partial power but no valid driver' });
            }
            // If we got here but detectedPhone is true and none of the above matched, it's generic
            console.log('[DeviceState] Generic USB detected');
            return res.json({ state: 'generic_usb_detected', details: 'USB device detected, but mode not classified' });
        } else {
            // Linux / macOS
            try {
                const { stdout } = await execAsync('lsusb', { timeout: 3000 });
                if (/04E8/i.test(stdout)) return res.json({ state: 'samsung_download', details: 'Samsung device detected (Download Mode)' });
                if (/05c6/i.test(stdout)) return res.json({ state: 'edl_qualcomm', details: 'Qualcomm EDL mode' });
                if (/0e8d/i.test(stdout)) return res.json({ state: 'preloader_mediatek', details: 'MediaTek Preloader mode' });
            } catch (_) {}
        }

        res.json({ state: 'no_response', details: 'No device detected in any mode' });
    } catch (error) {
        console.error('[DeviceState] Error:', error);
        res.json({ state: 'no_response', details: `Error: ${(error as Error).message}` });
    }
});

// src/server.ts
app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send a ping every 15 seconds to keep the connection alive
    const pingInterval = setInterval(() => {
        res.write(':\n\n'); // comment line = keep‑alive ping
    }, 15000);

    // When device state changes, send an event
    const sendUpdate = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Store the sendUpdate function so other parts of the app can call it
    // e.g., after USB detection or ADB changes
    (req as any).sseSend = sendUpdate;

    // Clean up on client disconnect
    req.on('close', () => {
        clearInterval(pingInterval);
        res.end();
    });
});
// ──────────────────────────────────────────────────────────
// FAST suspicious-apps endpoint (no deep APK scan, ~5-10 seconds)
// ──────────────────────────────────────────────────────────
app.get('/suspicious-apps/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  try {
    await beginMobileDiagnostic(id);

    console.log('[SuspiciousApps] Fast scan starting for', id);
    const startTime = Date.now();

    // List only third-party apps (faster than all apps)
    const allApps = await listApps(id);
    console.log('[SuspiciousApps] Found', allApps.length, 'apps');

    // Get installer info FIRST (single fast ADB command)
    let installerMap: Record<string, string | null> = {};
    try {
      installerMap = await getInstallerMap(id);
      console.log('[SuspiciousApps] Installer map:', Object.keys(installerMap).length, 'third-party apps');
    } catch (e: any) {
      console.error('[SuspiciousApps] Failed to get installer map:', e.message);
    }

    // FAST: Only get permissions for apps that are not from a trusted store.
    const FAST_TRUSTED = [
      'com.google.', 'com.android.', 'com.samsung.', 'com.huawei.',
      'com.xiaomi.', 'com.oppo.', 'com.vivo.', 'com.oneplus.',
      'com.microsoft.', 'com.facebook.', 'com.whatsapp', 'com.instagram.',
      'com.twitter.', 'com.spotify.', 'com.netflix.', 'com.amazon.',
      'org.mozilla.', 'com.brave.', 'com.opera.', 'com.coloros.',
      'com.heytap.', 'com.oplus.',
      'com.sec.android.',
    ];

    const appsToCheck = allApps.filter(a => {
      if (!a.packageName) return false;
      const pkg = a.packageName;
      // Skip trusted prefixes
      if (FAST_TRUSTED.some(p => pkg.startsWith(p))) return false;
      // Include if the app is not installed from a trusted store.
      const installer = installerMap[pkg];
      const isTrustedInstaller = installer !== null && ['com.android.vending', 'com.google.android.packageinstaller', 'com.sec.android.app.samsungapps', 'com.huawei.appmarket', 'com.xiaomi.market', 'com.oppo.market', 'com.heytap.market', 'com.bbk.appstore', 'com.amazon.venezia'].includes(installer!);
      return !isTrustedInstaller;
    });

    console.log('[SuspiciousApps] Getting permissions for', appsToCheck.length, 'candidate apps');

    const permsByPkg: Record<string, string[]> = {};
    // Process in batches of 5 for speed
    for (let i = 0; i < appsToCheck.length; i += 5) {
      const batch = appsToCheck.slice(i, i + 5);
      const results = await Promise.all(
        batch.map(a => packagePermissions(id, a.packageName!).catch(() => []))
      );
      batch.forEach((a, idx) => {
        permsByPkg[a.packageName!] = results[idx];
      });
    }

    // Detect suspicious apps
    const suspiciousApps = detectSuspiciousApps(appsToCheck, permsByPkg, installerMap);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[SuspiciousApps] Done in ${elapsed}s. Found ${suspiciousApps.length} suspicious app(s).`);
    suspiciousApps.forEach((sa: any) => {
      console.log(`  - ${sa.displayName} (${sa.packageName}) [${sa.threatLevel}]: ${sa.reason}`);
    });

    res.json({ suspiciousApps, totalApps: allApps.length });
  } catch (e: any) {
    console.error('[SuspiciousApps] Error:', e.message);
    res.status(500).json({ error: e.message ?? 'Unknown error' });
  } finally {
    await endMobileDiagnostic(id);
  }
});
// ---- APK SCAN WITH VIRUSTOTAL ----
app.post('/api/scan-apk', async (req, res) => {
  const { deviceId, packageName } = req.body;
  if (!deviceId || !packageName) {
    return res.status(400).json({ error: 'Missing deviceId or packageName' });
  }

  let apkPath: string | null = null;
  try {
    apkPath = await pullApk(deviceId, packageName);

    const python = await resolvePythonCommand();
    const analyzerScript = path.join(process.cwd(), 'tools', 'apk_analyzer.py');
    const { stdout } = await execAsync(
      `"${python.exe}" "${analyzerScript}" "${apkPath}"`,
      { timeout: 120_000, maxBuffer: 50 * 1024 * 1024 }
    );

    let analysis: any = {};
    try {
      analysis = JSON.parse(stdout);
    } catch {
      analysis = { error: 'Failed to parse analyzer output', raw: stdout };
    }

    // ---- YARA SCAN ----
    let yaraMatches: { rule: string; matches: string[] }[] = [];
    if (apkPath) {
      yaraMatches = await scanWithYara(apkPath);
    }
    analysis.yara_matches = yaraMatches.map(m => ({ rule: m.rule, count: m.matches.length }));

    // ---- PACKER DETECTION ----
    if (apkPath) {
      const packer = detectPackerIndicators(packageName, apkPath);
      analysis.isPacked = packer.isPacked;
      analysis.packerReason = packer.reason;
    }

    // ---- ENTROPY ----
    const entropy = await calculateEntropy(apkPath);
    analysis.entropy = entropy;
    if (entropy > 0.85) {
      analysis.isPolymorphic = true;
      analysis.polymorphicReason = `High entropy (${entropy.toFixed(3)}) suggests packed/polymorphic code.`;
    }

    // ---- MALWARE TYPE CLASSIFICATION ----
    if (analysis && !analysis.error) {
      const malwareTypes = classifyMalware({
        dangerousPermissions: analysis.dangerous_permissions || [],
        suspiciousIndicators: analysis.suspicious_indicators || [],
        riskScore: analysis.risk_score || 0
      });
      analysis.malware_types = malwareTypes;
    }

    // ---- VIRUSTOTAL INTEGRATION (automatic) ----
    const vtApiKey = process.env.VIRUSTOTAL_API_KEY;
    let vtResult: any = null;
    if (vtApiKey) {
      try {
        const hash = await computeSha256(apkPath);
        const vtResp = await fetch(`https://www.virustotal.com/api/v3/files/${hash}`, {
          headers: { 'x-apikey': vtApiKey }
        });
        if (vtResp.ok) {
          const vtData = await vtResp.json();
          const stats = vtData.data?.attributes?.last_analysis_stats || {};
          vtResult = {
            malicious: stats.malicious || 0,
            suspicious: stats.suspicious || 0,
            undetected: stats.undetected || 0,
            totalEngines: Object.keys(vtData.data?.attributes?.last_analysis_results || {}).length,
            link: `https://www.virustotal.com/gui/file/${hash}`
          };
        } else if (vtResp.status === 404) {
          vtResult = { notFound: true, message: 'Not found in VirusTotal database' };
        } else {
          vtResult = { error: `VirusTotal API error: ${vtResp.status}` };
        }
      } catch (e: any) {
        vtResult = { error: e.message || 'VirusTotal query failed' };
      }
    } else {
      vtResult = { notAvailable: true, message: 'VIRUSTOTAL_API_KEY not set' };
    }
    analysis.virusTotal = vtResult;

    res.json({
      ok: true,
      packageName,
      staticAnalysis: analysis,
    });
  } catch (err: any) {
    console.error('APK scan error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (apkPath) try { await fs.unlink(apkPath); } catch {}
  }
});
app.post('/adb-uninstall', async (req: Request, res: Response) => {
  const body = req.body || {};
  const deviceIdRaw = typeof (body as any).deviceId === 'string' ? (body as any).deviceId : String((body as any).deviceId || '');
  const packageRaw = typeof (body as any).packageName === 'string' ? (body as any).packageName : String((body as any).packageName || '');

  const deviceId = deviceIdRaw.trim();
  const packageName = packageRaw.trim();

  if (!deviceId) {
    return res.status(400).json({ ok: false, error: 'deviceId is required.' });
  }
  if (!packageName) {
    return res.status(400).json({ ok: false, error: 'packageName is required.' });
  }

  // Basic input validation: prevent shell-like injection and keep to
  // expected Android package identifier characters.
  if (!/^[a-zA-Z0-9._]+$/.test(packageName) || !packageName.includes('.')) {
    return res.status(400).json({ ok: false, error: 'Invalid packageName.' });
  }

  try {
    await beginMobileDiagnostic(deviceId);
    const output = await adb('-s', deviceId, 'uninstall', packageName);
    return res.json({ ok: true, deviceId, packageName, output });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'Uninstall failed.' });
  } finally {
    await endMobileDiagnostic(deviceId);
  }
});

// SmartLink Host: issue cryptographic challenges and verify signatures
// from the Android SmartLink Agent. This does not talk to ADB directly;
// it only decides whether an action is allowed and with which policy.
app.post('/smartlink/challenge', async (req: Request, res: Response) => {
  const body = req.body || {};
  const pairingIdRaw = typeof body.pairingId === 'string' ? body.pairingId.trim() : '';
  const pairingId = pairingIdRaw || 'default';

  try {
    const config = await loadSmartLinkConfig();
    const pairing = findSmartLinkPairing(config, pairingId);
    if (!pairing) {
      return res.status(400).json({
        ok: false,
        error:
          'No SmartLink pairing configured. Create smartlink-config.json with at least a "default" pairing and its publicKeyPem.',
      });
    }

    const challenge = crypto.randomBytes(32);
    const challengeId = createSmartLinkChallengeId();
    const now = Date.now();

    smartLinkChallenges.set(challengeId, {
      pairingId: pairing.id,
      challenge,
      createdAt: now,
    });

    // Best-effort cleanup of expired challenges
    for (const [id, entry] of smartLinkChallenges) {
      if (now - entry.createdAt > SMARTLINK_CHALLENGE_TTL_MS) {
        smartLinkChallenges.delete(id);
      }
    }

    return res.json({
      ok: true,
      pairingId: pairing.id,
      challengeId,
      challenge: challenge.toString('base64'),
    });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, error: e?.message || 'Failed to create SmartLink challenge.' });
  }
});

app.post('/smartlink/verify', async (req: Request, res: Response) => {
  const body = req.body || {};
  const pairingIdRaw = typeof body.pairingId === 'string' ? body.pairingId.trim() : '';
  const pairingId = pairingIdRaw || 'default';
  const challengeId = typeof body.challengeId === 'string' ? body.challengeId.trim() : '';
  const signatureB64 = typeof body.signature === 'string' ? body.signature.trim() : '';

  if (!challengeId || !signatureB64) {
    return res.status(400).json({ ok: false, error: 'challengeId and signature are required.' });
  }

  const entry = smartLinkChallenges.get(challengeId);
  if (!entry) {
    return res.status(400).json({ ok: false, error: 'Unknown or expired SmartLink challenge.' });
  }

  smartLinkChallenges.delete(challengeId);

  const now = Date.now();
  if (now - entry.createdAt > SMARTLINK_CHALLENGE_TTL_MS) {
    return res.status(400).json({ ok: false, error: 'SmartLink challenge has expired.' });
  }

  try {
    const config = await loadSmartLinkConfig();
    const pairing =
      findSmartLinkPairing(config, pairingId) || findSmartLinkPairing(config, entry.pairingId);
    if (!pairing) {
      return res.status(400).json({
        ok: false,
        error:
          'No SmartLink pairing found for verification. Ensure smartlink-config.json defines the pairing id used.',
      });
    }

    const signature = Buffer.from(signatureB64, 'base64');
    const ok = verifySmartLinkSignature(pairing.publicKeyPem, entry.challenge, signature);
    if (!ok) {
      return res.status(401).json({ ok: false, error: 'SmartLink signature verification failed.' });
    }

    const enableAdb = pairing.defaultEnableAdb !== false;
    const enableUsbTethering = pairing.defaultEnableUsbTethering === true;

    return res.json({
      ok: true,
      allowExecute: true,
      command: {
        enableAdb,
        enableUsbTethering,
      },
    });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      error: e?.message || 'Failed to verify SmartLink signature.',
    });
  }
});

// Download the SmartLink Agent APK so a technician can copy it to a phone via
// MTP (no USB debugging required) and install it manually on-device.
app.get('/smartlink/agent-apk', async (_req: Request, res: Response) => {
  // Prefer the APK that ships with the Windows installer under the
  // installation root (SMARTHUB_HOME / appInstallRoot).
  const home = process.env.SMARTHUB_HOME || process.env.SMART_HUB_HOME || process.cwd();
  const candidates: string[] = [
    path.join(home, '3rdpartyApp', 'smartlink.apk'),
    path.join(home, '3rdpartyApp', 'app-debug.apk'),
  ];

  let apkPath: string | undefined;
  for (const p of candidates) {
    try {
      await fs.access(p);
      apkPath = p;
      break;
    } catch {
      // try next
    }
  }

  if (!apkPath) {
    return res.status(404).json({
      ok: false,
      error:
        'SmartLink Agent APK not found. Place it as 3rdpartyApp/smartlink.apk under the SmartHub installation folder.',
    });
  }

  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="smartlink.apk"');
  return res.sendFile(apkPath);
});

app.get('/history/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  try {
    const ownerUserId = String((req as any)?.authUser?.id || '').trim();
    if (!ownerUserId) {
      return res.status(401).json({
        error: 'Authenticated Supabase account required. Local/offline history is disabled.',
      });
    }

    const cloud = await fetchDiagnosticRunsFromCloud<SavedRun>({
      ownerUserId,
      diagnosticType: 'history',
      deviceId: id,
      limit: 500,
    });
    if (!cloud.ok) {
      return res.status(502).json({
        error: cloud.error || 'Failed to load diagnostic history from Supabase.',
      });
    }

    const runs: SavedRun[] = cloud.runs;
    runs.sort((a, b) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0));
    res.json({ runs });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Unknown error' });
  }
});
// Get device info (manufacturer, model, Android version, resolution)
// Get device info (manufacturer, model, Android version, resolution)
// Get device info (manufacturer, model, Android version, resolution)
app.get('/device-info', async (req, res) => {
    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : undefined;
    if (!deviceId) return res.status(400).json({ error: 'Device ID required' });
    try {
        // Use the imported `adb` function (not `require`)
        const [props, wm] = await Promise.all([
            adb('-s', deviceId, 'shell', 'getprop'),
            adb('-s', deviceId, 'shell', 'wm size')
        ]);
        const manufacturer = (props.match(/ro\.product\.manufacturer:\s*(.*)/) || [])[1]?.trim() || 'Unknown';
        const model = (props.match(/ro\.product\.model:\s*(.*)/) || [])[1]?.trim() || 'Unknown';
        const androidVersion = (props.match(/ro\.build\.version\.release:\s*(.*)/) || [])[1]?.trim() || '';
        const resolution = (wm.match(/Physical size:\s*(.*)/) || [])[1]?.trim() || '';
        res.json({ manufacturer, model, androidVersion, resolution });
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error('[device-info] Error:', errorMessage);
        res.status(500).json({ error: errorMessage });
    }
});


// Add a simple endpoint to get the list of connected devices
app.get('/api/devices', async (_req, res) => {
  try {
    const devices = await listDevices();
    res.json({ devices });
  } catch (err) {
    console.error('Failed to list devices:', err);
    res.status(500).json({ error: String(err) });
  }
});

// Legacy fallback endpoint for UI variants using /devices
app.get('/devices', async (_req, res) => {
  try {
    const devices = await listDevices();
    res.json({ devices });
  } catch (err) {
    console.error('Failed to list devices (legacy fallback):', err);
    res.status(500).json({ error: String(err) });
  }
});

// ----- FALLBACK ROUTES FOR DEVICE INFO AND NETWORK -----
// These ensure /device/:id and /wifi/status/:id work even if the
// registered route files have different paths.
app.get('/device/:id', async (req, res) => {
  const deviceId = req.params.id;
  try {
    const props = await deviceProps(deviceId);
    res.json(props);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Software Safety ----
// ---- Software Safety ----
app.get('/api/software-safety', async (req, res) => {
    const deviceId = req.query.deviceId as string;
    if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

    try {
        const patch = await adb('-s', deviceId, 'shell', 'getprop', 'ro.build.version.security_patch');
        const patchDate = patch.trim() || 'Unknown';

        let isRooted = false;
        try {
            const suCheck = await adb('-s', deviceId, 'shell', 'which', 'su');
            if (suCheck.trim()) isRooted = true;
        } catch {}
        const secure = await adb('-s', deviceId, 'shell', 'getprop', 'ro.secure');
        if (secure.trim() === '0') isRooted = true;

        const verifier = await adb('-s', deviceId, 'shell', 'settings', 'get', 'global', 'package_verifier_enable');
        const playProtectEnabled = verifier.trim() === '1';

        const unknownSources = await adb('-s', deviceId, 'shell', 'settings', 'get', 'secure', 'install_non_market_apps');
        const unknownSourcesEnabled = unknownSources.trim() === '1';

        const adbEnabled = await adb('-s', deviceId, 'shell', 'settings', 'get', 'global', 'adb_enabled');
        const adbDebugging = adbEnabled.trim() === '1';

        res.json({
            patchDate,
            isRooted,
            playProtectEnabled,
            unknownSourcesEnabled,
            adbDebugging,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Software safety check failed' });
    }
});
// Improved WiFi status endpoint that returns structured JSON with real values
app.get('/wifi/status/:id', async (req, res) => {
    const deviceId = req.params.id;
    if (!deviceId) {
        return res.status(400).json({ error: 'Missing device ID' });
    }
    try {
        // Get Wi-Fi dumpsys (primary source)
        const wifiDump = await adb('-s', deviceId, 'shell', 'dumpsys wifi');
        
        // Parse SSID
        let ssid = 'Not connected';
        const ssidMatch = wifiDump.match(/SSID:\s*"?([^",\r\n]+?)"?(?:,|$)/i);
        if (ssidMatch) {
            let rawSsid = ssidMatch[1].trim();
            if (rawSsid !== '<unknown ssid>' && rawSsid !== '""' && rawSsid) {
                ssid = rawSsid;
            }
        }

        // Parse RSSI (signal strength)
        let rssi = null;
        const rssiMatch = wifiDump.match(/RSSI:\s*(-?\d+)/i);
        if (rssiMatch) rssi = parseInt(rssiMatch[1]);

        // Parse link speed (Mbps) - try multiple patterns
        let linkSpeed = null;
        const speedPatterns = [
            /link\s*speed:\s*(\d+)/i,
            /tx_bitrate=\s*(\d+)/i,
            /bitrate:\s*(\d+)/i,
            /mWifiInfo.*?linkSpeed=(\d+)/i
        ];
        for (const pattern of speedPatterns) {
            const match = wifiDump.match(pattern);
            if (match) {
                linkSpeed = parseInt(match[1]);
                break;
            }
        }

        // Parse frequency (MHz)
        let frequency = null;
        const freqMatch = wifiDump.match(/frequency:\s*(\d+)/i);
        if (freqMatch) frequency = parseInt(freqMatch[1]);

        // Get IP address - try multiple methods
        let ipAddress = '';
        try {
            // Method 1: ip addr show wlan0
            let ipRaw = await adb('-s', deviceId, 'shell', "ip addr show wlan0 | grep 'inet ' | awk '{print $2}' | cut -d/ -f1");
            ipAddress = ipRaw.trim();
            if (!ipAddress) {
                // Method 2: ifconfig wlan0
                ipRaw = await adb('-s', deviceId, 'shell', "ifconfig wlan0 | grep 'inet addr' | awk '{print $2}' | cut -d: -f2");
                ipAddress = ipRaw.trim();
            }
            if (!ipAddress) {
                // Method 3: netcfg (older devices)
                ipRaw = await adb('-s', deviceId, 'shell', "netcfg | grep wlan0 | awk '{print $3}'");
                ipAddress = ipRaw.trim();
            }
        } catch (e) {
            // Ignore – IP may not be available
        }

        // Build response object, only include fields that have real values
        const wifiInfo: any = { ssid };
        if (rssi !== null) wifiInfo.rssi = rssi;
        if (ipAddress && ipAddress !== '') wifiInfo.ipAddress = ipAddress;
        if (linkSpeed !== null) wifiInfo.linkSpeed = linkSpeed;
        if (frequency !== null) wifiInfo.frequency = frequency;

        res.json({ wifi: wifiInfo });
    } catch (err) {
        console.error(`WiFi status error for device ${deviceId}:`, err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: errorMessage });
    }
});
// -----------------------------------------------------
app.post('/wifi/toggle', async (req, res) => {
    const deviceId = req.body.deviceId;
    const enable = req.body.enable === true;
    if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });
    try {
        const cmd = enable ? 'svc wifi enable' : 'svc wifi disable';
        const output = await adb('-s', deviceId, 'shell', cmd);
        res.json({ ok: true, output });
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});

// Generic ADB shell command endpoint (use with caution)
app.post('/adb-shell', async (req, res) => {
    const { deviceId, command } = req.body;
    if (!deviceId || !command) {
        return res.status(400).json({ error: 'Missing deviceId or command' });
    }
    try {
        const output = await adb('-s', deviceId, 'shell', command);
        res.json({ output: output.trim() });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/history/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const body = req.body || {};
  try {
    const ownerUserId = String((req as any)?.authUser?.id || '').trim();
    if (!ownerUserId) {
      return res.status(401).json({
        ok: false,
        error: 'Authenticated Supabase account required. Local/offline history is disabled.',
      });
    }

    const now = typeof body.timestamp === 'number' ? body.timestamp : Date.now();
    const run: SavedRun = {
      id: now,
      deviceId: id,
      deviceLabel: typeof body.deviceLabel === 'string' ? body.deviceLabel : undefined,
      timestamp: now,
      counts: body.counts,
      diagStages: body.diagStages,
      diagDetails: body.diagDetails,
      textReport: body.textReport,
      screenTestImage: typeof body.screenTestImage === 'string' ? body.screenTestImage : undefined,
    };

    const cloud = await saveDiagnosticRunToCloud({
      ownerUserId,
      diagnosticType: 'history',
      deviceId: id,
      runId: run.id,
      runTimestamp: run.timestamp,
      payload: run,
    });
    if (!cloud.ok) {
      return res.status(502).json({
        ok: false,
        error: cloud.error || 'Failed to save diagnostic history to Supabase.',
      });
    }

    res.json({ ok: true, run, cloudSaved: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Unknown error' });
  }
});

app.get('/app-risk/:id/:pkg', async (req: Request, res: Response) => {
  const id = req.params.id;
  const pkg = req.params.pkg;

  if (!pkg) {
    res.status(400).json({ error: 'Package name is required' });
    return;
  }

  try {
    const perms = await packagePermissions(id, pkg);
    const details = assessAppRisk(perms);
    const mappedRisk = details.risk === 'risky' ? 'dangerous' : details.risk;

    // Optional deep APK scan using the offline Python tool.
    // This pulls the APK to the PC and runs security-tools/apk_security_scan.py.
    let deepScan: any = null;
    try {
      deepScan = await runDeepApkScan(id, pkg);
    } catch (deepErr: any) {
      // eslint-disable-next-line no-console
      console.error('Deep APK scan failed:', deepErr);
      deepScan = { error: deepErr?.message || String(deepErr) };
    }

    res.json({
      packageName: pkg,
      risk: mappedRisk,
      permissions: perms,
      riskyPermissions: details.riskyPermissions,
      moderatePermissions: details.moderatePermissions,
      deepScan,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Unknown error' });
  }
});

const port = Number.parseInt(String(process.env.PORT ?? ''), 10) || 3333;
const host = allowRemote ? '0.0.0.0' : '127.0.0.1';

httpServer = app.listen(port, host, async () => {
    const shownHost = host === '0.0.0.0' ? 'localhost' : host;
    console.log(`Companion service listening on http://${shownHost}:${port}`);

    // ---- Initialize WebSocket server ----
    const wss = new WebSocket.Server({ server: httpServer! });
    console.log('WebSocket server initialized');

    wss.on('connection', (ws) => {
        console.log('WebSocket client connected');

        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message.toString());
                if (data.action === 'ping') {
                    ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
                }
            } catch (err) {
                console.error('WebSocket message error:', err);
            }
        });

        ws.on('close', () => console.log('WebSocket client disconnected'));
    });

    // ---- Record process info ----
    try {
        const infoPath = path.join(dataRoot, 'backend-process.json');
        const payload = {
            pid: process.pid,
            startedAt: Date.now(),
            port,
            host,
            smarthubHome: process.env.SMARTHUB_HOME || process.env.SMART_HUB_HOME || process.cwd(),
        };
        await fs.writeFile(infoPath, JSON.stringify(payload, null, 2), 'utf8');
    } catch {
        // ignore
    }
});



async function cleanupProcessInfo(): Promise<void> {
  try {
    const infoPath = path.join(dataRoot, 'backend-process.json');
    await fs.unlink(infoPath);
  } catch {
    // ignore
  }
}

process.once('exit', () => {
  // Fire-and-forget cleanup.
  void cleanupProcessInfo();
});
process.once('SIGINT', () => {
  void cleanupProcessInfo().finally(() => process.exit(0));
});
process.once('SIGTERM', () => {
  void cleanupProcessInfo().finally(() => process.exit(0));
});

httpServer.on('error', (err: any) => {
  const code = String(err?.code || '');
  if (code === 'EADDRINUSE') {
    // eslint-disable-next-line no-console
    console.error(
      `Port ${port} is already in use. Another SmartHub companion service may already be running. Close the SmartHub desktop app or stop the existing node process, then retry.`,
    );
    process.exit(1);
  }
  if (code === 'EACCES') {
    // eslint-disable-next-line no-console
    console.error(`Permission denied while binding to port ${port}. Try a different PORT.`);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.error('Backend server error:', err);
  process.exit(1);
  


});