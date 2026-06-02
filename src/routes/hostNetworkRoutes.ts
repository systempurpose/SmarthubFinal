import type { Express, Request, Response } from 'express';
import os from 'node:os';
import { execFile } from 'node:child_process';

function safeText(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function execFileAsync(file: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string; code?: number }> {
  return new Promise(resolve => {
    const child = execFile(file, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      const code = (err as any)?.code;
      resolve({ stdout: safeText(stdout), stderr: safeText(stderr), code: typeof code === 'number' ? code : undefined });
    });

    // If we hit the timeout, kill the process.
    child.on('error', () => {
      // handled by callback
    });
  });
}

function truncate(s: string, max = 6000): string {
  const t = safeText(s);
  return t.length > max ? `${t.slice(0, max)}\n…(truncated)…` : t;
}

export function registerHostNetworkRoutes(app: Express) {
  app.get('/host-network/status', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      platform: process.platform,
      release: os.release(),
    });
  });

  app.post('/host-network/fix', async (req: Request, res: Response) => {
    const action = safeText((req.body as any)?.action || '').trim();
    if (!action) return res.status(400).json({ ok: false, error: 'Missing action' });

    if (process.platform !== 'win32') {
      return res.status(400).json({ ok: false, error: 'Host network fixes are currently implemented for Windows only.' });
    }

    // Note: Some actions require admin rights.
    if (action === 'flush_dns') {
      const result = await execFileAsync('ipconfig', ['/flushdns'], 12_000);
      return res.json({
        ok: true,
        action,
        requiresAdmin: false,
        stdout: truncate(result.stdout),
        stderr: truncate(result.stderr),
        code: result.code,
      });
    }

    if (action === 'reset_winsock_tcpip') {
      const winsock = await execFileAsync('netsh', ['winsock', 'reset'], 20_000);
      const tcpip = await execFileAsync('netsh', ['int', 'ip', 'reset'], 25_000);

      return res.json({
        ok: true,
        action,
        requiresAdmin: true,
        note: 'This usually requires Administrator privileges and a reboot to fully take effect.',
        steps: [
          { tool: 'netsh', args: 'winsock reset', ...winsock, stdout: truncate(winsock.stdout), stderr: truncate(winsock.stderr) },
          { tool: 'netsh', args: 'int ip reset', ...tcpip, stdout: truncate(tcpip.stdout), stderr: truncate(tcpip.stderr) },
        ],
      });
    }

    return res.status(400).json({ ok: false, error: 'Unsupported action' });
  });
}
