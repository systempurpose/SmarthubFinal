import { Router } from 'express';
import { exec, execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const router = Router();
const FRIDA_SCRIPTS_DIR = path.join(process.cwd(), 'frida-scripts');

// Helper: generate random port between 30000 and 65535
function randomPort(): number {
  return Math.floor(Math.random() * (65535 - 30000 + 1) + 30000);
}

// Helper: generate random benign-looking server name
function randomServerName(): string {
  const names = ['netd', 'systemd', 'supl', 'keystore', 'installd', 'logd', 'vold', 'rild'];
  const suffix = crypto.randomBytes(2).toString('hex');
  return `${names[Math.floor(Math.random() * names.length)]}_${suffix}`;
}

// Helper: deploy Frida server to device with random name and port
async function deployStealthFrida(deviceId: string): Promise<{ port: number; serverName: string; devicePath: string }> {
  const port = randomPort();
  const serverName = randomServerName();
  const localFridaServer = path.join(process.cwd(), '.venv', 'Scripts', 'frida-server.exe');
  const devicePath = `/data/local/tmp/${serverName}`;
  
  // Push frida-server to device with renamed binary
  await execAsync(`adb -s ${deviceId} push "${localFridaServer}" ${devicePath}`);
  await execAsync(`adb -s ${deviceId} shell chmod 755 ${devicePath}`);
  // Run the server in background on the random port
  exec(`adb -s ${deviceId} shell "nohup ${devicePath} -l 0.0.0.0:${port} &"`, (err) => {
    if (err) console.error('Frida server start failed:', err);
  });
  // Wait a moment for server to start
  await new Promise(r => setTimeout(r, 2000));
  return { port, serverName, devicePath };
}

// Helper: kill Frida server on device by process name
async function killFridaServer(deviceId: string, serverPath: string) {
  try {
    await execAsync(`adb -s ${deviceId} shell "pkill -f ${path.basename(serverPath)}"`);
  } catch (e) {}
  try {
    await execAsync(`adb -s ${deviceId} shell rm -f ${serverPath}`);
  } catch (e) {}
}

// Helper: run adb command
async function execAsync(cmd: string): Promise<string> {
  const { exec } = require('child_process');
  const util = require('util');
  const execPromise = util.promisify(exec);
  const { stdout } = await execPromise(cmd);
  return stdout;
}

// The main scan endpoint – now with stealth flag
router.post('/frida/scan', async (req, res) => {
  const { deviceId, packageName, scriptName = 'api_monitor.js', timeoutMs = 30000, stealth = true } = req.body;
  if (!deviceId || !packageName) {
    return res.status(400).json({ error: 'Missing deviceId or packageName' });
  }
  
  const scriptPath = path.join(FRIDA_SCRIPTS_DIR, scriptName);
  try {
    await fs.access(scriptPath);
  } catch {
    return res.status(404).json({ error: `Script ${scriptName} not found` });
  }
  
  let serverPort = 27042;
  let serverPath = '';
  let cleanupRequired = false;
  
  try {
    // Deploy stealth server if requested
    if (stealth) {
      const stealthServer = await deployStealthFrida(deviceId);
      serverPort = stealthServer.port;
      serverPath = stealthServer.devicePath;
      cleanupRequired = true;
    }
    
    // Build command – use the deployed server on the random port
    const fridaCmd = stealth
      ? `frida -H 127.0.0.1:${serverPort} -f ${packageName} -l "${scriptPath}" --no-pause -t ${timeoutMs}`
      : `frida -D ${deviceId} -f ${packageName} -l "${scriptPath}" --no-pause -t ${timeoutMs}`;
    
    // Run Frida
    const output = await execAsync(fridaCmd);
    const lines = output.split('\n');
    const events = [];
    for (const line of lines) {
      if (line.trim().startsWith('{')) {
        try { events.push(JSON.parse(line)); } catch (e) {}
      }
    }
    res.json({ ok: true, events, raw: output });
  } catch (err: any) {
    console.error('Frida scan error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    // Cleanup stealth server
    if (cleanupRequired && serverPath) {
      await killFridaServer(deviceId, serverPath);
    }
  }
});

export default router;