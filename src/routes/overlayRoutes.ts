import { Router } from 'express';
import { exec } from 'child_process';
import { EventEmitter } from 'events';

const router = Router();
let monitoringProcess: any = null;
let overlayEvents: { timestamp: number; package: string; windowTitle?: string }[] = [];
const eventEmitter = new EventEmitter();

// Start monitoring (without auto-stop)
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
      const overlayMatch = line.match(/Adding window.*?(?:type=(\d+)|\(has system alert window\))/i);
      if (overlayMatch) {
        const windowType = overlayMatch[1];
        if (windowType === '2038' || windowType === '2003' || line.includes('SYSTEM_ALERT_WINDOW')) {
          const pkgMatch = line.match(/Window\{[^}]+? ([a-zA-Z0-9_.]+)/);
          const packageName = pkgMatch ? pkgMatch[1] : 'unknown';
          overlayEvents.unshift({
            timestamp: Date.now(),
            package: packageName,
            windowTitle: line.substring(0, 200)
          });
          if (overlayEvents.length > 100) overlayEvents.pop();
          eventEmitter.emit('overlay', packageName);
        }
      }
    }
  });
  monitoringProcess.stderr?.on('data', (err: string) => console.error('[overlay monitor]', err));
  monitoringProcess.on('close', () => { monitoringProcess = null; });
  
  res.json({ ok: true, message: 'Overlay monitoring started' });
});

// Start monitoring with auto-stop (calls the start endpoint then sets a timeout)
router.post('/overlay-monitor/start-timeout', async (req, res) => {
  const { deviceId, durationMs = 60000 } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });
  
  // Call the start endpoint internally
  const startRes = await fetch(`http://127.0.0.1:3333/api/overlay-monitor/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId })
  });
  if (!startRes.ok) return res.status(500).json({ error: 'Failed to start monitoring' });
  
  // Auto-stop after duration
  setTimeout(async () => {
    await fetch(`http://127.0.0.1:3333/api/overlay-monitor/stop`, { method: 'POST' });
  }, durationMs);
  
  res.json({ ok: true, message: `Monitoring started for ${durationMs}ms` });
});

// Stop monitoring
router.post('/overlay-monitor/stop', (req, res) => {
  if (monitoringProcess) {
    monitoringProcess.kill();
    monitoringProcess = null;
  }
  res.json({ ok: true, message: 'Monitoring stopped' });
});

// Get recent overlay events
router.get('/overlay-monitor/events', (req, res) => {
  res.json({ events: overlayEvents });
});

// Stream overlay events via Server-Sent Events (for live UI updates)
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

export default router;