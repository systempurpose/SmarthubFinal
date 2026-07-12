import { Router } from 'express';
import { adb } from '../adb';

const router = Router();

// ---- Translation mapping (simple) ----
const translations: Record<string, Record<string, string>> = {
  'en': {
    'rootkit.detected': 'Potential kernel or process anomalies were detected.',
    'rootkit.clean': 'No obvious kernel or process anomalies were detected.',
    'rootkit.unavailable': 'Unable to run rootkit scan: {message}',
  },
  'fil': {
    'rootkit.detected': 'Natukoy ang posibleng kernel o process anomalies.',
    'rootkit.clean': 'Walang natukoy na kernel o process anomalies.',
    'rootkit.unavailable': 'Hindi maisagawa ang rootkit scan: {message}',
  }
};

function getTranslation(lang: string, key: string, fallback?: string): string {
  const langMap = translations[lang] || translations['en'];
  return langMap[key] || fallback || key;
}

// ---- Helper: ADB shell with trimmed output ----
async function adbShell(deviceId: string, cmd: string): Promise<string> {
  try {
    const out = await adb('-s', deviceId, 'shell', cmd);
    return String(out || '').trim();
  } catch (err: any) {
    console.warn(`[rootkit-scan] ADB shell command failed: ${cmd}`, err?.message || err);
    return '';
  }
}

// ---- Check device availability ----
async function checkDeviceAvailability(deviceId: string): Promise<{ connected: boolean; message: string }> {
  try {
    const out = await adb('devices');
    const lines = out
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    if (lines[0]?.toLowerCase().includes('list of devices')) {
      lines.shift();
    }

    const match = lines.find(line => line.split(/\s+/)[0] === deviceId);
    if (!match) {
      return { connected: false, message: 'Device is not currently detected by ADB.' };
    }

    const state = match.split(/\s+/)[1] || '';
    if (!state || state.toLowerCase() !== 'device') {
      return { connected: false, message: `Device state is "${state || 'unknown'}".` };
    }

    return { connected: true, message: '' };
  } catch (err: any) {
    return { connected: false, message: err?.message || 'ADB is not available.' };
  }
}

// ---- Check dmesg for kernel anomalies ----
async function checkDmesg(deviceId: string): Promise<string[]> {
  const dmesg = await adbShell(deviceId, 'dmesg | grep -iE "insmod|module|Oops|Bug|segfault|kernel panic|tainted" | tail -30');
  const lines = dmesg.split('\n').filter(l => l.trim());
  return lines.slice(0, 20);
}

// ---- List loaded kernel modules and flag unknown ones ----
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

// ---- Compare running processes with /proc entries to detect hidden processes ----
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

// ---- Main route ----
router.get('/rootkit-scan', async (req, res) => {
  const deviceId = req.query.deviceId as string;
  const lang = (req.query.lang as string) || 'en'; // default to English

  if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

  try {
    const availability = await checkDeviceAvailability(deviceId);
    if (!availability.connected) {
      const message = getTranslation(lang, 'rootkit.unavailable', 'Unable to run rootkit scan: {message}')
        .replace('{message}', availability.message);
      return res.json({
        ok: false,
        dmesgAnomalies: [],
        suspiciousModules: [],
        allModules: [],
        hiddenProcesses: [],
        rootkitIndicators: false,
        summary: message,
        summaryKey: 'rootkit.unavailable',
        error: availability.message,
        unavailable: true,
        lang
      });
    }

    const [dmesgAnomalies, modules, hiddenPids] = await Promise.all([
      checkDmesg(deviceId),
      checkModules(deviceId),
      checkHiddenProcesses(deviceId)
    ]);

    const hasIndicators = dmesgAnomalies.length > 0 || modules.some(m => m.suspicious) || hiddenPids.length > 0;
    const summaryKey = hasIndicators ? 'rootkit.detected' : 'rootkit.clean';
    const summary = getTranslation(lang, summaryKey);

    res.json({
      ok: true,
      dmesgAnomalies,
      suspiciousModules: modules.filter(m => m.suspicious).map(m => m.module),
      allModules: modules,
      hiddenProcesses: hiddenPids,
      rootkitIndicators: hasIndicators,
      summary: summary,
      summaryKey: summaryKey,
      lang
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;