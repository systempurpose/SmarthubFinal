import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const router = Router();

// ---- Helper to parse size strings like "1.2G" to bytes ----
function parseSizeToBytes(sizeStr: string): number {
  const match = sizeStr.match(/^([\d.]+)\s*([GMK]?)/i);
  if (!match) return 0;
  let val = parseFloat(match[1]);
  const unit = (match[2] || '').toUpperCase();
  if (unit === 'G') return val * 1024 * 1024 * 1024;
  if (unit === 'M') return val * 1024 * 1024;
  if (unit === 'K') return val * 1024;
  return val;
}

// ---- GET /api/large-files ----
router.get('/large-files', async (req, res) => {
  const deviceId = req.query.deviceId as string;
  const minSizeGB = parseFloat(req.query.minSize as string) || 1;

  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId required' });
  }

  try {
    // Find files > minSizeGB in /sdcard
    const command = `find /sdcard -type f -size +${minSizeGB}G -exec ls -lh {} \\; 2>/dev/null | awk '{print $5, $9}'`;
    const args = ['shell', command];
    if (deviceId) args.unshift('-s', deviceId);

    const { stdout } = await execFileAsync('adb', args, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
    const lines = stdout.split(/\r?\n/).filter(line => line.trim() !== '');
    const files = lines.map(line => {
      const parts = line.trim().split(/\s+/);
      const sizeStr = parts[0];
      const path = parts.slice(1).join(' ');
      const bytes = parseSizeToBytes(sizeStr);
      return { path, size: sizeStr, bytes };
    }).filter(f => f.bytes > 0);

    files.sort((a, b) => b.bytes - a.bytes);
    res.json({ files, count: files.length });
  } catch (err: any) {
    console.error('Large files scan error:', err);
    res.status(500).json({ error: err.message || 'Failed to scan large files' });
  }
});

// ---- POST /api/delete-file ----
router.post('/delete-file', async (req, res) => {
  const { deviceId, filePath } = req.body;
  if (!deviceId || !filePath) {
    return res.status(400).json({ error: 'deviceId and filePath required' });
  }

  try {
    const command = `rm -f "${filePath}"`;
    const args = ['shell', command];
    if (deviceId) args.unshift('-s', deviceId);
    await execFileAsync('adb', args, { timeout: 10000 });
    res.json({ ok: true, message: 'File deleted' });
  } catch (err: any) {
    console.error('Delete file error:', err);
    res.status(500).json({ error: err.message || 'Delete failed' });
  }
});

export default router;