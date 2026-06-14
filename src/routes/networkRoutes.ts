import { Router } from 'express';
import { connectivityInfo, adb } from '../adb';

const router = Router();

router.get('/status/:id', async (req, res) => {
  try {
    const deviceId = req.params.id;
    const netInfo = await connectivityInfo(deviceId);
    res.json(netInfo);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// New endpoint: capture active network connections (external IPs)
// New endpoint: capture active network connections (external IPs)
router.get('/capture-connections', async (req, res) => {
  const deviceId = req.query.deviceId as string;
  if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });
  try {
    // Use netstat to list TCP/UDP connections
    const output = await adb(`-s ${deviceId} shell netstat -n | grep -E 'tcp|udp'`);
    const lines = output.split('\n').filter(l => l.trim());
    const connections = [];
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        const local = parts[3];
        const remote = parts[4];
        const state = parts[5] || '';
        connections.push({ local, remote, state });
      }
    }
    // Filter to external IPs (not localhost, not private ranges)
    const external = connections.filter(c => {
      const remoteIp = c.remote.split(':')[0];
      if (!remoteIp) return false;
      return !remoteIp.startsWith('127.') &&
             !remoteIp.startsWith('192.168.') &&
             !remoteIp.startsWith('10.') &&
             !remoteIp.startsWith('172.16.') &&
             !remoteIp.startsWith('172.17.') &&
             !remoteIp.startsWith('172.18.') &&
             !remoteIp.startsWith('172.19.') &&
             !remoteIp.startsWith('172.20.') &&
             !remoteIp.startsWith('172.21.') &&
             !remoteIp.startsWith('172.22.') &&
             !remoteIp.startsWith('172.23.') &&
             !remoteIp.startsWith('172.24.') &&
             !remoteIp.startsWith('172.25.') &&
             !remoteIp.startsWith('172.26.') &&
             !remoteIp.startsWith('172.27.') &&
             !remoteIp.startsWith('172.28.') &&
             !remoteIp.startsWith('172.29.') &&
             !remoteIp.startsWith('172.30.') &&
             !remoteIp.startsWith('172.31.');
    });
    res.json({ connections: external.slice(0, 50) });
  } catch (err) {
    console.error('[network capture] error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
export default router;