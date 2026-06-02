import type { Express, Request, Response } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { screencap, dumpsysDisplay, surfaceFlinger } from '../adb';
import { appInstallRoot, screenTestsRoot } from '../serverConfig';
import { isSafeLocalFilename, safeDeviceKey } from '../utils';
import { resolvePythonCommand } from '../pythonResolver';

const execFileAsync = promisify(execFile);

export function registerScreenRoutes(app: Express): void {
  // Launch the optional Windows BSOD helper GUI.
  app.post('/launch-bsod-gui', async (_req, res) => {
    try {
      const python = await resolvePythonCommand();
      const bsodDir = path.join(appInstallRoot, 'bsod-diagnostic');
      const child = spawn(python.exe, [...python.baseArgs, 'bsod_gui.py'], {
        cwd: bsodDir,
        stdio: 'ignore',
        detached: true,
      });

      child.unref();
      res.json({ ok: true });
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('Failed to launch BSOD GUI:', err);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  app.get('/screenshot/:id', async (req: Request, res: Response) => {
    try {
      const buf = await screencap(req.params.id);
      res.setHeader('Content-Type', 'image/png');
      res.send(buf);
    } catch (e: any) {
      res.status(500).json({ error: e.message ?? 'Unknown error' });
    }
  });

  app.get('/screen-test-image/:deviceId/:file', async (req: Request, res: Response) => {
    const safeId = safeDeviceKey(req.params.deviceId || '');
    const file = req.params.file || '';
    if (!isSafeLocalFilename(file) || !file.toLowerCase().endsWith('.png')) {
      return res.status(400).json({ ok: false, error: 'Invalid image filename.' });
    }
    const fullPath = path.join(screenTestsRoot, safeId, file);
    try {
      const buf = await fs.readFile(fullPath);
      res.setHeader('Content-Type', 'image/png');
      res.send(buf);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('screen-test-image read failed:', e);
      res.status(404).end();
    }
  });

  app.get('/screen-visual-check', async (req: Request, res: Response) => {
    try {
      const python = await resolvePythonCommand();
      const scriptPath = path.join(appInstallRoot, 'bsod-diagnostic', 'phone_screen_diag.py');

      const clampInt = (value: any, fallback: number, min: number, max: number) => {
        const parsed = Number.parseInt(String(value ?? ''), 10);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(min, Math.min(max, parsed));
      };

      const samples = clampInt(req.query.samples, 8, 1, 60);
      const delayMs = clampInt(req.query.delayMs, 600, 0, 2000);

      let stdout: string;
      try {
        const args =
          samples > 1
            ? [scriptPath, '--json-samples', String(samples), '--sample-delay-ms', String(delayMs)]
            : [scriptPath, '--json-once'];

        ({ stdout } = await execFileAsync(python.exe, [...python.baseArgs, ...args], {
          maxBuffer: 2 * 1024 * 1024,
        }));
      } catch (e: any) {
        const pyStdout = typeof e?.stdout === 'string' ? e.stdout : '';
        const pyStderr = typeof e?.stderr === 'string' ? e.stderr : '';
        const combined = `${pyStdout}\n${pyStderr}`.trim();
        const baseMsg =
          `Could not run screen visual analysis. Ensure Python 3.8+, opencv-python and numpy are installed on this PC, and that a webcam is accessible. (Python: ${python.label})`;
        const msg = combined ? `${baseMsg} Details: ${combined}` : baseMsg;
        // eslint-disable-next-line no-console
        console.error('screen-visual-check: Python helper failed:', e);
        return res.status(500).json({ ok: false, error: msg });
      }

      let parsed: any;
      try {
        parsed = JSON.parse(stdout);
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.error('screen-visual-check: failed to parse JSON from Python:', e, 'stdout=', stdout);
        return res.status(500).json({ ok: false, error: 'Could not parse screen visual analysis.' });
      }

      if (!parsed || typeof parsed !== 'object') {
        return res.status(500).json({ ok: false, error: 'Invalid response from screen visual analysis.' });
      }

      return res.json(parsed);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('screen-visual-check: failed to run Python helper:', e);
      const msg =
        e?.message ||
        'Could not run screen visual analysis. Ensure Python, opencv-python and numpy are installed on this PC.';
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  app.get('/screen-camera-snapshot', async (req: Request, res: Response) => {
    try {
      const python = await resolvePythonCommand();
      const scriptPath = path.join(appInstallRoot, 'bsod-diagnostic', 'phone_screen_diag.py');

      const safeId = safeDeviceKey('camera');
      const dir = path.join(screenTestsRoot, safeId);
      await fs.mkdir(dir, { recursive: true });
      const filename = `${Date.now()}-cam.png`;
      const fullPath = path.join(dir, filename);

      let stdout: string;
      try {
        ({ stdout } = await execFileAsync(
          python.exe,
          [...python.baseArgs, scriptPath, '--json-once', '--snapshot-path', fullPath],
          {
            maxBuffer: 2 * 1024 * 1024,
          },
        ));
      } catch (e: any) {
        const pyStdout = typeof e?.stdout === 'string' ? e.stdout : '';
        const pyStderr = typeof e?.stderr === 'string' ? e.stderr : '';
        const combined = `${pyStdout}\n${pyStderr}`.trim();
        const baseMsg =
          `Could not capture camera snapshot. Ensure Python 3.8+, opencv-python and numpy are installed on this PC, and that a webcam is accessible. (Python: ${python.label})`;
        const msg = combined ? `${baseMsg} Details: ${combined}` : baseMsg;
        // eslint-disable-next-line no-console
        console.error('screen-camera-snapshot: Python helper failed:', e);
        return res.status(500).json({ ok: false, error: msg });
      }

      let parsed: any;
      try {
        parsed = JSON.parse(stdout);
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.error('screen-camera-snapshot: failed to parse JSON from Python:', e, 'stdout=', stdout);
        return res.status(500).json({ ok: false, error: 'Could not parse camera snapshot analysis.' });
      }

      const relativePath = `/screen-test-image/${encodeURIComponent(safeId)}/${encodeURIComponent(filename)}`;
      const host = req.headers.host || '127.0.0.1:3333';
      const baseUrl = `${req.protocol}://${host}`;
      const imageUrl = `${baseUrl}${relativePath}`;

      return res.json({ ok: parsed?.ok !== false, imagePath: relativePath, imageUrl, analysis: parsed?.analysis });
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('screen-camera-snapshot: failed to run Python helper:', e);
      const msg =
        e?.message ||
        'Could not capture camera snapshot. Ensure Python, opencv-python and numpy are installed on this PC.';
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post('/screen-test/:id', async (req: Request, res: Response) => {
    const id = req.params.id;
    try {
      const buf = await screencap(id);
      const safeId = safeDeviceKey(id);
      const dir = path.join(screenTestsRoot, safeId);
      await fs.mkdir(dir, { recursive: true });
      const filename = `${Date.now()}.png`;
      const fullPath = path.join(dir, filename);
      await fs.writeFile(fullPath, buf);

      const relativePath = `/screen-test-image/${encodeURIComponent(safeId)}/${encodeURIComponent(filename)}`;
      const host = req.headers.host || '127.0.0.1:3333';
      const baseUrl = `${req.protocol}://${host}`;
      const imageUrl = `${baseUrl}${relativePath}`;

      res.json({ ok: true, imagePath: relativePath, imageUrl });
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('screen-test capture failed:', e);
      res
        .status(500)
        .json({ ok: false, error: e?.message || 'Screen test capture failed. Ensure the device is connected.' });
    }
  });

  app.get('/display-state/:id', async (req: Request, res: Response) => {
    const id = req.params.id;
    try {
      const display = await dumpsysDisplay(id);
      const sf = await surfaceFlinger(id);
      res.json({ display, surfaceFlinger: sf });
    } catch (e: any) {
      res.status(500).json({ error: e.message ?? 'Unknown error' });
    }
  });
}
