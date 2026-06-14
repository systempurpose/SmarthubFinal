import { Router } from 'express';
import { adb } from '../adb';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

const router = Router();

router.post('/strace/start', async (req, res) => {
  const { deviceId, packageName, durationMs = 30000 } = req.body;
  if (!deviceId || !packageName) {
    return res.status(400).json({ error: 'Missing deviceId or packageName' });
  }
  
  try {
    // Find PID of the app
    const pidOut = await adb(`-s ${deviceId} shell pidof ${packageName}`);
    const pid = pidOut.trim();
    if (!pid) {
      return res.status(404).json({ error: 'App not running' });
    }
    
    // Start strace in background, output to file
    const traceFile = `/data/local/tmp/strace_${pid}.log`;
    const cmd = `strace -f -e trace=open,read,write,connect,execve,mmap -p ${pid} -o ${traceFile} &`;
    await adb(`-s ${deviceId} shell ${cmd}`);
    
    // Stop after duration
    setTimeout(async () => {
      await adb(`-s ${deviceId} shell pkill -f "strace.*${pid}"`);
    }, durationMs);
    
    res.json({ ok: true, pid, traceFile, message: `Tracing started for ${durationMs}ms` });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/strace/results', async (req, res) => {
  const { deviceId, traceFile } = req.query;
  if (!deviceId || !traceFile) {
    return res.status(400).json({ error: 'Missing deviceId or traceFile' });
  }
  try {
    const output = await adb(`-s ${deviceId} shell cat ${traceFile}`);
    // Parse suspicious patterns
    const lines = output.split('\n');
    const suspicious = [];
    for (const line of lines) {
      if (line.includes('connect(') && !line.includes('127.0.0.1')) {
        const match = line.match(/connect\(.*,\s*\{sa_family=AF_INET,\s*sin_port=htons\((\d+)\),\s*sin_addr=inet_addr\("([^"]+)"\)/);
        if (match) suspicious.push({ type: 'network', ip: match[2], port: match[1] });
      }
      if (line.includes('open(') && (line.includes('/data/') || line.includes('/sdcard/'))) {
        suspicious.push({ type: 'file_access', detail: line.trim() });
      }
      if (line.includes('execve(')) {
        suspicious.push({ type: 'exec', detail: line.trim() });
      }
    }
    // Clean up
    await adb(`-s ${deviceId} shell rm -f ${traceFile}`);
    res.json({ suspicious });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;