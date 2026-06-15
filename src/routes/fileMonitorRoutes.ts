import { Router } from 'express';
import { adb } from '../adb';

const router = Router();

// Get recently modified files (last N minutes) with suspicious extensions
router.get('/recent-files', async (req, res) => {
  const deviceId = req.query.deviceId as string;
  const minutes = parseInt(req.query.minutes as string) || 5;
  if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });
  try {
    const cmd = `find /sdcard /data/data -type f -mmin -${minutes} 2>/dev/null | head -200`;
    const output = await adb(`-s ${deviceId} shell ${cmd}`);
    const files = output.split('\n').filter(l => l.trim() && !l.includes('Permission denied'));
    const suspiciousExts = ['.apk', '.dex', '.so', '.jar', '.sh', '.bin', '.elf', '.tmp', '.dat', '.odex'];
    const suspicious = files.filter(f => suspiciousExts.some(ext => f.toLowerCase().endsWith(ext)));
    res.json({ allFiles: files.slice(0, 100), suspicious });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;