import { Router } from 'express';
import { adb } from '../adb';

const router = Router();

// Helper: run ADB command and return trimmed output
async function adbShell(deviceId: string, cmd: string): Promise<string> {
  const out = await adb(`-s ${deviceId} shell ${cmd}`);
  return out.trim();
}

// Check dmesg for kernel anomalies
async function checkDmesg(deviceId: string): Promise<string[]> {
  const dmesg = await adbShell(deviceId, 'dmesg | grep -iE "insmod|module|Oops|Bug|segfault|kernel panic|tainted" | tail -30');
  const lines = dmesg.split('\n').filter(l => l.trim());
  return lines.slice(0, 20);
}

// List loaded kernel modules and flag unknown ones
async function checkModules(deviceId: string): Promise<{ module: string; suspicious: boolean }[]> {
  const modules = await adbShell(deviceId, 'cat /proc/modules | awk \'{print $1}\'');
  if (!modules) return [];
  const knownModules = new Set([
    'wlan', 'bcmdhd', 'wifi', 'bluetooth', 'snd_soc', 'usb_f_hid', 'fuse',
    'overlay', 'xt_qtaguid', 'binder', 'ashmem', 'ion', 'v4l2', 'videobuf2'
  ]);
  const list = modules.split('\n').filter(m => m.trim());
  return list.map(mod => ({
    module: mod,
    suspicious: !knownModules.has(mod) && !mod.startsWith('qcom_') && !mod.startsWith('msm_')
  }));
}

// Compare running processes with /proc entries to detect hidden processes
async function checkHiddenProcesses(deviceId: string): Promise<string[]> {
  const psOutput = await adbShell(deviceId, 'ps -A -o PID,NAME | tail -n +2');
  const psPids = new Set<string>();
  for (const line of psOutput.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2) psPids.add(parts[0]);
  }
  const procPids = await adbShell(deviceId, 'ls /proc | grep -E "^[0-9]+$"');
  const procPidsSet = new Set(procPids.split('\n').filter(p => p.trim()));
  const hidden: string[] = [];
  for (const pid of procPidsSet) {
    if (!psPids.has(pid)) hidden.push(pid);
  }
  return hidden;
}

router.get('/rootkit-scan', async (req, res) => {
  const deviceId = req.query.deviceId as string;
  if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });
  try {
    const [dmesgAnomalies, modules, hiddenPids] = await Promise.all([
      checkDmesg(deviceId),
      checkModules(deviceId),
      checkHiddenProcesses(deviceId)
    ]);
    res.json({
      ok: true,
      dmesgAnomalies,
      suspiciousModules: modules.filter(m => m.suspicious).map(m => m.module),
      allModules: modules,
      hiddenProcesses: hiddenPids,
      rootkitIndicators: (dmesgAnomalies.length > 0 || modules.some(m => m.suspicious) || hiddenPids.length > 0)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;