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
            const parts = dataLine.trim().split(/\s+/);
            res.json({ total: parts[1], used: parts[2], free: parts[3], blockSize: parts[0] });
        } else {
            res.json({ error: 'Cannot parse storage info', raw: output });
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/ram', async (req, res) => {
    try {
        const output = await adbShell('dumpsys meminfo');
        const totalMatch = output.match(/Total RAM: (\d+) kB/);
        const freeMatch = output.match(/Free RAM: (\d+) kB/);
        res.json({
            total: totalMatch ? parseInt(totalMatch[1]) : null,
            free: freeMatch ? parseInt(freeMatch[1]) : null,
            used: totalMatch && freeMatch ? parseInt(totalMatch[1]) - parseInt(freeMatch[1]) : null
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