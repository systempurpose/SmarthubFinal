import { Router } from 'express';
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const router = Router();
const FRIDA_SCRIPTS_DIR = path.join(process.cwd(), 'frida-scripts');
// Full path to frida.exe inside the project's virtual environment
const FRIDA_EXE = path.join(process.cwd(), '.venv', 'Scripts', 'frida.exe');

router.post('/frida/scan', async (req, res) => {
    const { deviceId, packageName, scriptName = 'api_monitor.js', timeoutMs = 30000 } = req.body;
    if (!deviceId || !packageName) {
        return res.status(400).json({ error: 'Missing deviceId or packageName' });
    }
    const scriptPath = path.join(FRIDA_SCRIPTS_DIR, scriptName);
    try {
        await fs.access(scriptPath);
    } catch {
        return res.status(404).json({ error: `Script ${scriptName} not found` });
    }

    // Command to run Frida on the target app (use -D for device serial)
    const command = `"${FRIDA_EXE}" -D ${deviceId} -f ${packageName} -l "${scriptPath}" --no-pause -t ${timeoutMs}`;
    
    exec(command, { timeout: timeoutMs + 5000 }, (error, stdout, stderr) => {
        // Parse output – Frida sends JSON messages via send().
        const lines = stdout.split('\n');
        const events = [];
        for (const line of lines) {
            if (line.trim().startsWith('{')) {
                try {
                    events.push(JSON.parse(line));
                } catch (e) {}
            }
        }
        res.json({ ok: true, events, raw: stdout, errors: stderr });
    });
});

export default router;