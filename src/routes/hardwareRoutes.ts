import { Router } from 'express';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);
const router = Router();

// Helper: get device ID from query, or fallback to first connected device
async function getDeviceId(req: any): Promise<string> {
    const deviceId = req.query.deviceId as string;
    if (deviceId) return deviceId;
    const { stdout } = await execPromise('adb devices');
    const lines = stdout.split('\n').filter(l => l.includes('\tdevice'));
    if (lines.length === 0) throw new Error('No Android device connected');
    return lines[0].split('\t')[0];
}

// Helper: run adb shell command on a specific device
async function adbShellOnDevice(deviceId: string, command: string): Promise<string> {
    const { stdout } = await execPromise(`adb -s ${deviceId} shell ${command}`);
    return stdout;
}

router.get('/battery', async (req, res) => {
    try {
        const deviceId = await getDeviceId(req);
        const output = await adbShellOnDevice(deviceId, 'dumpsys battery');
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
        const deviceId = await getDeviceId(req);
        const output = await adbShellOnDevice(deviceId, 'df /data');
        const lines = output.split('\n');
        const dataLine = lines.find(l => l.includes('/data'));
        if (!dataLine) {
            res.json({ total: '?', used: '?', free: '?', raw: output });
            return;
        }
        // Example: /data              58.3G    45.2G    13.1G  78% /data
        // Or: /data 12345678 8765432 3580246 80% /data
        const parts = dataLine.trim().split(/\s+/);
        if (parts.length < 4) {
            res.json({ total: '?', used: '?', free: '?', raw: output });
            return;
        }
        let total = parts[1];
        let used = parts[2];
        let free = parts[3];

        // If values are numeric (bytes), convert to human-readable
        if (/^\d+$/.test(total)) {
            const toHuman = (bytes: number) => {
                const gb = bytes / (1024 * 1024 * 1024);
                if (gb >= 1) return `${gb.toFixed(1)} GB`;
                const mb = bytes / (1024 * 1024);
                if (mb >= 1) return `${mb.toFixed(1)} MB`;
                return `${(bytes / 1024).toFixed(1)} KB`;
            };
            total = toHuman(parseInt(total));
            used = toHuman(parseInt(used));
            free = toHuman(parseInt(free));
        } else {
            // Already human-readable like "58.3G"
            total = total.toUpperCase();
            used = used.toUpperCase();
            free = free.toUpperCase();
        }
        res.json({ total, used, free, raw: dataLine });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/ram', async (req, res) => {
    try {
        const deviceId = await getDeviceId(req);
        const output = await adbShellOnDevice(deviceId, 'dumpsys meminfo');
        const totalMatch = output.match(/Total RAM:\s*([\d,]+)\s*kB/i);
        const freeMatch = output.match(/Free RAM:\s*([\d,]+)\s*kB/i);
        if (totalMatch && freeMatch) {
            const totalKB = parseInt(totalMatch[1].replace(/,/g, ''));
            const freeKB = parseInt(freeMatch[1].replace(/,/g, ''));
            const usedKB = totalKB - freeKB;
            const toHuman = (kb: number) => {
                const gb = kb / (1024 * 1024);
                if (gb >= 1) return `${gb.toFixed(1)} GB`;
                return `${(kb / 1024).toFixed(1)} MB`;
            };
            res.json({ total: toHuman(totalKB), used: toHuman(usedKB), free: toHuman(freeKB) });
        } else {
            // Fallback: try to read MemTotal from /proc/meminfo
            const meminfo = await adbShellOnDevice(deviceId, 'cat /proc/meminfo');
            const memTotalMatch = meminfo.match(/MemTotal:\s*(\d+)\s*kB/i);
            const memFreeMatch = meminfo.match(/MemFree:\s*(\d+)\s*kB/i);
            if (memTotalMatch && memFreeMatch) {
                const totalKB = parseInt(memTotalMatch[1]);
                const freeKB = parseInt(memFreeMatch[1]);
                const usedKB = totalKB - freeKB;
                const toHuman = (kb: number) => `${(kb / 1024).toFixed(0)} MB`;
                res.json({ total: toHuman(totalKB), used: toHuman(usedKB), free: toHuman(freeKB) });
            } else {
                res.json({ total: '?', used: '?', free: '?', raw: output.substring(0, 500) });
            }
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;