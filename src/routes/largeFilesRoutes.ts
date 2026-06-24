import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const router = Router();

router.get('/large-files', async (req, res) => {
  const deviceId = req.query.deviceId as string;
  const minSizeGB = parseFloat(req.query.minSize as string) || 1; // default 1GB

  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId required' });
  }

  try {
    // Use ADB to find files > minSizeGB in /sdcard
    // We'll use find with -size +${minSizeGB}G and print size and path
    const command = `find /sdcard -type f -size +${minSizeGB}G -exec ls -lh {} \\; 2>/dev/null | awk '{print $5, $9}'`;
    const args = ['shell', command];
    if (deviceId) args.unshift('-s', deviceId);

    const { stdout } = await execFileAsync('adb', args, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
    const lines = stdout.split(/\r?\n/).filter(line => line.trim() !== '');
    const files = lines.map(line => {
      // line format: "1.2G /sdcard/video.mp4" or "1.5G /sdcard/file.zip"
      const parts = line.trim().split(/\s+/);
      const sizeStr = parts[0];
      const path = parts.slice(1).join(' ');
      // Convert size to bytes for sorting
      const sizeBytes = parseSizeToBytes(sizeStr);
      return { path, size: sizeStr, bytes: sizeBytes };
    }).filter(f => f.bytes > 0);

    // Sort by size descending
    files.sort((a, b) => b.bytes - a.bytes);

    res.json({ files, count: files.length });
  } catch (err: any) {
    console.error('Large files scan error:', err);
    res.status(500).json({ error: err.message || 'Failed to scan large files' });
  }
});

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

export default router;