import { Router } from 'express';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);
const router = Router();

async function adbShell(command: string): Promise<string> {
    const { stdout } = await execPromise(`adb shell ${command}`);
    return stdout;
}

router.get('/battery', async (req, res) => {
    try {
        const output = await adbShell('dumpsys battery');
        const levelMatch = output.match(/level: (\d+)/);
        const healthMatch = output.match(/health: (\d+)/);
        const healthMap: Record<string, string> = {
            '2': 'good', '3': 'overheat', '4': 'dead',
            '5': 'over voltage', '6': 'failure', '7': 'cold'
        };
        res.json({
            level: levelMatch ? parseInt(levelMatch[1]) : null,
            health: healthMap[healthMatch?.[1] || ''] || 'unknown',
            raw: output.trim()
        });
    } catch (err: any) {
        res.status(500).json({ error: 'ADB failed', details: err.message });
    }
});

router.get('/storage', async (req, res) => {
    try {
        // Use df -h for human-readable, but we want consistent parsing
        const output = await adbShell('df /data');
        const lines = output.split('\n');
        // Find the line containing "/data"
        const dataLine = lines.find(l => l.includes('/data'));
        if (dataLine) {
            // Example: /data              58.3G    45.2G    13.1G  78% /data
            const parts = dataLine.trim().split(/\s+/);
            // Typically: filesystem, size, used, available, use%, mounted
            if (parts.length >= 4) {
                const total = parts[1];
                const used = parts[2];
                const free = parts[3];
                res.json({ total, used, free, raw: dataLine });
            } else {
                res.json({ error: 'Unexpected df output', raw: output });
            }
        } else {
            res.json({ error: 'Could not find /data partition', raw: output });
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/ram', async (req, res) => {
    try {
        const output = await adbShell('dumpsys meminfo');
        // Look for "Total RAM" and "Free RAM"
        const totalMatch = output.match(/Total RAM:\s*([\d,]+)\s*kB/i);
        const freeMatch = output.match(/Free RAM:\s*([\d,]+)\s*kB/i);
        const total = totalMatch ? parseInt(totalMatch[1].replace(/,/g, '')) : null;
        const free = freeMatch ? parseInt(freeMatch[1].replace(/,/g, '')) : null;
        const used = total && free ? total - free : null;
        res.json({
            total: total ? `${(total / 1024 / 1024).toFixed(1)} GB` : null,
            free: free ? `${(free / 1024 / 1024).toFixed(1)} GB` : null,
            used: used ? `${(used / 1024 / 1024).toFixed(1)} GB` : null,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/sensors', async (req, res) => {
    try {
        const output = await adbShell('dumpsys sensorservice');
        const sensorMatches = output.match(/0x[0-9a-f]+:[^\n]+/g) || [];
        res.json({ sensors: sensorMatches.slice(0, 20), raw: output.substring(0, 2000) });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;