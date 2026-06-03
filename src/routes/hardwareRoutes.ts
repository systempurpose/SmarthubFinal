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
        const output = await adbShell('df /data');
        const lines = output.split('\n');
        const dataLine = lines.find(l => l.includes('/data'));
        if (dataLine) {
            // Split on whitespace, but some versions have multiple spaces
            const parts = dataLine.trim().split(/\s+/);
            // Expected: /data, size, used, avail, use%, mount
            if (parts.length >= 4) {
                let total = parts[1];
                let used = parts[2];
                let free = parts[3];
                // If values are in bytes (no unit), convert to GB
                if (/^\d+$/.test(total)) {
                    const toGB = (val: string) => `${(parseInt(val) / 1024 / 1024 / 1024).toFixed(1)} GB`;
                    total = toGB(total);
                    used = toGB(used);
                    free = toGB(free);
                }
                res.json({ total, used, free, raw: dataLine });
            } else {
                res.json({ total: '?', used: '?', free: '?', raw: output });
            }
        } else {
            res.json({ total: '?', used: '?', free: '?', raw: output });
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/ram', async (req, res) => {
    try {
        const output = await adbShell('dumpsys meminfo');
        const totalMatch = output.match(/Total RAM:\s*([\d,]+)\s*kB/i);
        const freeMatch = output.match(/Free RAM:\s*([\d,]+)\s*kB/i);
        if (totalMatch && freeMatch) {
            const totalKB = parseInt(totalMatch[1].replace(/,/g, ''));
            const freeKB = parseInt(freeMatch[1].replace(/,/g, ''));
            const usedKB = totalKB - freeKB;
            const toGB = (kb: number) => `${(kb / 1024 / 1024).toFixed(1)} GB`;
            res.json({ total: toGB(totalKB), used: toGB(usedKB), free: toGB(freeKB) });
        } else {
            res.json({ total: '?', used: '?', free: '?', raw: output.substring(0, 500) });
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});


export default router;