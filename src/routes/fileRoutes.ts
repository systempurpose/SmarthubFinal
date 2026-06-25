import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const router = Router();

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
