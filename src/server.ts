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
// At the top with other imports
import { detectPackerIndicators } from './heuristics';



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
        const suspiciousApps = detectSuspiciousApps(allApps, permsByPkg, installerMap);

        // Collect debug stats
        let totalApps = allApps.length;
        let skippedByTrustedPrefix = 0;
        let skippedByTrustedExact = 0;
        let skippedByLegitStore = 0;
        let evaluatedSideloaded = 0;
        let evaluatedLegitStoreDangerous = 0;
        let sampleSkippedTrustedPrefix: string[] = [];
        let sampleSkippedTrustedExact: string[] = [];
        let sampleSkippedLegitStore: string[] = [];

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
            evaluatedSideloaded++;
        }

        res.json({
            suspiciousApps,
            debug: {
                totalApps,
                skippedByTrustedPrefix,
                skippedByTrustedExact,
                skippedByLegitStore,
                evaluatedSideloaded,
                evaluatedLegitStoreDangerous,
                sampleSkippedTrustedPrefix,
                sampleSkippedTrustedExact,
                sampleSkippedLegitStore
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
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  }),
);

app.use('/api/network', networkRoutes);
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
    res.json({ ok: true });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/install-apk', async (req, res) => {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });
    try {
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
let httpServer: ReturnType<typeof app.listen> | null = null;
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

app.use('/api', fileMonitorRoutes);
app.use('/api', straceRoutes);
app.use('/api', rootkitRoutes);
app.use('/api', fridaRoutes);
app.use('/api', overlayRoutes);
app.use('/api/hardware', hardwareRoutes);
app.use('/api/repair', repairRoutes);
app.use(express.static('html'));
app.use('/css', express.static('css'));
app.use('/js', express.static('js'));

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

    // FAST: Only get permissions for sideloaded/suspicious apps (not all 69+)
    const FAST_TRUSTED = [
      'com.google.', 'com.android.', 'com.samsung.', 'com.huawei.',
      'com.xiaomi.', 'com.oppo.', 'com.vivo.', 'com.oneplus.',
      'com.microsoft.', 'com.facebook.', 'com.whatsapp', 'com.instagram.',
      'com.twitter.', 'com.spotify.', 'com.netflix.', 'com.amazon.',
      'org.mozilla.', 'com.brave.', 'com.opera.', 'com.coloros.',
      'com.heytap.', 'com.oplus.',
      'com.sec.android.',
    ];

    // Only check apps that are: sideloaded OR match suspicious patterns
    const SUSPICIOUS_QUICK_PATTERNS = [
      /cleaner|booster|optimizer/i, /battery[._-]?saver/i,
      /super[._-]?clean/i, /fast[._-]?clean/i, /turbo[._-]?clean/i,
      /mod[._-]?apk|crack|hack|cheat/i, /fake|virus|trojan|malware|spy/i,
      /airpush|startapp|leadbolt|applovin/i,
      /\.ad(s|vert|mob)|\.push|\.popup|\.banner/i,
    ];

    const appsToCheck = allApps.filter(a => {
      if (!a.packageName) return false;
      const pkg = a.packageName;
      // Skip trusted prefixes
      if (FAST_TRUSTED.some(p => pkg.startsWith(p))) return false;
      // Include if: sideloaded OR matches suspicious pattern OR is a known fake
      const isSideloaded = pkg in installerMap && (installerMap[pkg] === null || !['com.android.vending', 'com.google.android.packageinstaller', 'com.sec.android.app.samsungapps', 'com.huawei.appmarket', 'com.xiaomi.market', 'com.oppo.market', 'com.heytap.market', 'com.bbk.appstore', 'com.amazon.venezia'].includes(installerMap[pkg]!));
      const isPatternMatch = SUSPICIOUS_QUICK_PATTERNS.some(p => p.test(pkg));
      return isSideloaded || isPatternMatch;
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

    // ----- YARA SCAN -----
    let yaraMatches: { rule: string; matches: string[] }[] = [];
    if (apkPath) {
      yaraMatches = await scanWithYara(apkPath);
    }
    analysis.yara_matches = yaraMatches.map(m => ({ rule: m.rule, count: m.matches.length }));

    // ----- PACKER DETECTION -----
    if (apkPath) {
      const packer = detectPackerIndicators(packageName, apkPath);
      analysis.isPacked = packer.isPacked;
      analysis.packerReason = packer.reason;
    }

   
    const entropy = await calculateEntropy(apkPath);
    analysis.entropy = entropy;
    if (entropy > 0.85) {
      analysis.isPolymorphic = true;
      analysis.polymorphicReason = `High entropy (${entropy.toFixed(3)}) suggests packed/polymorphic code.`;
    }

    // ----- MALWARE TYPE CLASSIFICATION -----
    if (analysis && !analysis.error) {
      const malwareTypes = classifyMalware({
        dangerousPermissions: analysis.dangerous_permissions || [],
        suspiciousIndicators: analysis.suspicious_indicators || [],
        riskScore: analysis.risk_score || 0
      });
      analysis.malware_types = malwareTypes;
    }

    // ----- VIRUSTOTAL INTEGRATION (optional) -----
    let vtResult = null;
    const vtApiKey = process.env.VIRUSTOTAL_API_KEY;
    if (vtApiKey) {
      const hash = await computeSha256(apkPath);
      const vtResp = await fetch(`https://www.virustotal.com/api/v3/files/${hash}`, {
        headers: { 'x-apikey': vtApiKey }
      });
      if (vtResp.ok) vtResult = await vtResp.json();
    }

    res.json({
      ok: true,
      packageName,
      staticAnalysis: analysis,
      virusTotal: vtResult ? {
        malicious: vtResult.data?.attributes?.last_analysis_stats?.malicious || 0,
        suspicious: vtResult.data?.attributes?.last_analysis_stats?.suspicious || 0,
        totalEngines: Object.keys(vtResult.data?.attributes?.last_analysis_results || {}).length
      } : null
    });
  } catch (err: any) {
    console.error('APK scan error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (apkPath) try { await fs.unlink(apkPath); } catch { }
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
  // eslint-disable-next-line no-console
  const shownHost = host === '0.0.0.0' ? 'localhost' : host;
  console.log(`Companion service listening on http://${shownHost}:${port}`);

  // Record process info so the Windows shell can safely stop stale instances.
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
  const execAsync = promisify(exec);


});