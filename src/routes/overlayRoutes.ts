import { Router } from 'express';
import { exec } from 'child_process';
import { EventEmitter } from 'events';
import { adb } from '../adb'; // Assume we have an adb helper

const router = Router();
let monitoringProcess: any = null;
let overlayEvents: { timestamp: number; package: string; windowTitle?: string; type?: string }[] = [];
const eventEmitter = new EventEmitter();

// Known safe system packages to ignore
const IGNORED_PACKAGES = [
  'com.android.systemui',
  'com.android.launcher',
  'com.google.android.apps.nexuslauncher',
  'com.google.android.apps.recents',
  'com.android.incallui',
  'com.android.keyguard',
  'com.android.phone',
  'com.android.settings',
  'com.android.systemui.plugin',
  'com.android.dialer',
  'com.android.mms',
  'com.android.shell',
  'com.google.android.gms',
  'com.google.android.googlequicksearchbox',
  'com.google.android.apps.maps',
];

function isIgnoredPackage(pkg: string): boolean {
  return IGNORED_PACKAGES.includes(pkg) || pkg.startsWith('com.android.');
}

function parsePackageFromWindow(line: string): string | null {
  const match = line.match(/Window\{(.+?)\s+([a-zA-Z0-9_.]+)/);
  return match ? match[2] : null;
}

function isOverlayWindow(line: string): boolean {
  // Detect SYSTEM_ALERT_WINDOW, TYPE_APPLICATION_OVERLAY, TYPE_SYSTEM_ALERT
  return (
    line.includes('SYSTEM_ALERT_WINDOW') ||
    line.includes('TYPE_APPLICATION_OVERLAY') ||
    line.includes('TYPE_SYSTEM_ALERT') ||
    line.includes('type=2038') || // TYPE_APPLICATION_OVERLAY
    line.includes('type=2003')    // TYPE_SYSTEM_ALERT
  );
}

// ---- Real‑time monitoring (logcat) ----
router.post('/overlay-monitor/start', (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

  if (monitoringProcess) {
    return res.json({ ok: true, message: 'Monitoring already active' });
  }

  overlayEvents = [];
  const logcatCmd = `adb -s ${deviceId} logcat -v brief WindowManager:I *:S`;
  monitoringProcess = exec(logcatCmd);

  monitoringProcess.stdout?.on('data', (data: string) => {
    const lines = data.split('\n');
    for (const line of lines) {
      if (isOverlayWindow(line)) {
        const pkg = parsePackageFromWindow(line);
        if (pkg && !isIgnoredPackage(pkg)) {
          overlayEvents.unshift({
            timestamp: Date.now(),
            package: pkg,
            windowTitle: line.substring(0, 300),
            type: line.includes('SYSTEM_ALERT_WINDOW') ? 'SYSTEM_ALERT_WINDOW' :
                  line.includes('TYPE_APPLICATION_OVERLAY') ? 'TYPE_APPLICATION_OVERLAY' :
                  line.includes('TYPE_SYSTEM_ALERT') ? 'TYPE_SYSTEM_ALERT' : 'unknown',
          });
          if (overlayEvents.length > 100) overlayEvents.pop();
          eventEmitter.emit('overlay', pkg);
        }
      }
    }
  });
  monitoringProcess.stderr?.on('data', (err: string) => console.error('[overlay monitor]', err));
  monitoringProcess.on('close', () => { monitoringProcess = null; });

  res.json({ ok: true, message: 'Overlay monitoring started' });
});

router.post('/overlay-monitor/start-timeout', async (req, res) => {
  const { deviceId, durationMs = 60000 } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

  const startRes = await fetch(`http://127.0.0.1:3333/api/overlay-monitor/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId })
  });
  if (!startRes.ok) return res.status(500).json({ error: 'Failed to start monitoring' });

  setTimeout(async () => {
    await fetch(`http://127.0.0.1:3333/api/overlay-monitor/stop`, { method: 'POST' });
  }, durationMs);

  res.json({ ok: true, message: `Monitoring started for ${durationMs}ms` });
});

router.post('/overlay-monitor/stop', (req, res) => {
  if (monitoringProcess) {
    monitoringProcess.kill();
    monitoringProcess = null;
  }
  res.json({ ok: true, message: 'Monitoring stopped' });
});

router.get('/overlay-monitor/events', (req, res) => {
  res.json({ events: overlayEvents });
});

router.get('/overlay-monitor/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  const listener = (pkg: string) => {
    res.write(`data: ${JSON.stringify({ package: pkg, timestamp: Date.now() })}\n\n`);
  };
  eventEmitter.on('overlay', listener);
  req.on('close', () => {
    eventEmitter.off('overlay', listener);
    res.end();
  });
});

// ---- Comprehensive one‑shot check (new) ----
router.get('/overlay-monitor/check-all', async (req, res) => {
  const deviceId = req.query.deviceId as string;
  if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

  try {
    const result: any[] = [];

    // 1. dumpsys window – find active overlay windows
    const windowDump = await adb('-s', deviceId, 'shell', 'dumpsys window');
    const lines = windowDump.split('\n');
    let currentWindow: any = null;
    for (const line of lines) {
      if (line.includes('Window{')) {
        const pkg = parsePackageFromWindow(line);
        if (pkg && !isIgnoredPackage(pkg)) {
          currentWindow = { package: pkg, type: 'unknown', title: line.trim() };
          if (isOverlayWindow(line)) {
            currentWindow.type = 'overlay';
          }
        }
      } else if (currentWindow && (line.includes('SYSTEM_ALERT_WINDOW') || line.includes('TYPE_APPLICATION_OVERLAY'))) {
        currentWindow.type = 'overlay';
        currentWindow.details = line.trim();
      }
      // When we hit a new window or end of dump, push current
      if (currentWindow && (line.includes('Window{') || line === '')) {
        if (currentWindow.type === 'overlay') {
          result.push(currentWindow);
        }
        currentWindow = null;
      }
    }

    // 2. dumpsys activity – find apps with SYSTEM_ALERT_WINDOW permission
    const activityDump = await adb('-s', deviceId, 'shell', 'dumpsys activity');
    const permMatches = activityDump.match(/Package: (.*?)\n.*?SYSTEM_ALERT_WINDOW/g);
    if (permMatches) {
      for (const match of permMatches) {
        const pkgMatch = match.match(/Package: (.*?)\n/);
        if (pkgMatch) {
          const pkg = pkgMatch[1].trim();
          if (!isIgnoredPackage(pkg)) {
            result.push({ package: pkg, type: 'has_permission', source: 'dumpsys activity' });
          }
        }
      }
    }

    // 3. appops – check actual permission usage
    const appOps = await adb('-s', deviceId, 'shell', 'appops get android.permission.SYSTEM_ALERT_WINDOW');
    const opsLines = appOps.split('\n');
    for (const line of opsLines) {
      const pkgMatch = line.match(/^([a-zA-Z0-9_.]+):/);
      if (pkgMatch) {
        const pkg = pkgMatch[1];
        if (!isIgnoredPackage(pkg) && line.includes('allow')) {
          result.push({ package: pkg, type: 'appops_granted', detail: line.trim() });
        }
      }
    }

    // Deduplicate by package
    const seen = new Set();
    const unique = result.filter(r => {
      const key = r.package;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json({ events: unique });
  } catch (err: any) {
    console.error('Overlay check-all error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;