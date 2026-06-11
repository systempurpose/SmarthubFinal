import { Router } from 'express';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);
const router = Router();

async function getDeviceId(req: any): Promise<string> {
    const deviceId = req.query.deviceId as string;
    if (deviceId) return deviceId;
    const { stdout } = await execPromise('adb devices');
    const lines = stdout.split('\n').filter(l => l.includes('\tdevice'));
    if (lines.length === 0) throw new Error('No Android device connected');
    return lines[0].split('\t')[0];
}

async function adbShellOnDevice(deviceId: string, command: string): Promise<string> {
    const { stdout } = await execPromise(`adb -s ${deviceId} shell ${command}`);
    return stdout;
}

function parseSizeToHuman(sizeStr: string): string {
    // Already has unit? e.g., "58.3G"
    const unitMatch = sizeStr.match(/^([\d.]+)\s*([GMK]B?)$/i);
    if (unitMatch) {
        let num = parseFloat(unitMatch[1]);
        let unit = unitMatch[2].toUpperCase();
        if (unit === 'G' || unit === 'GB') return `${num.toFixed(1)} GB`;
        if (unit === 'M' || unit === 'MB') return `${num.toFixed(1)} MB`;
        if (unit === 'K' || unit === 'KB') return `${(num / 1024).toFixed(1)} GB`;
        return sizeStr;
    }
    // Numeric value (bytes)
    const bytes = parseFloat(sizeStr.replace(/,/g, ''));
    if (!isNaN(bytes)) {
        const gb = bytes / (1024 * 1024 * 1024);
        if (gb >= 1) return `${gb.toFixed(1)} GB`;
        const mb = bytes / (1024 * 1024);
        if (mb >= 1) return `${mb.toFixed(1)} MB`;
        const kb = bytes / 1024;
        if (kb >= 1) return `${kb.toFixed(1)} KB`;
        return `${bytes} B`;
    }
    return sizeStr;
}

router.get('/battery', async (req, res) => {
    try {
        const deviceId = await getDeviceId(req);
        const output = await adbShellOnDevice(deviceId, 'dumpsys battery');
        const levelMatch = output.match(/level: (\d+)/);
        const healthMatch = output.match(/health: (\d+)/);
        const healthMap: Record<string, string> = { '2': 'good', '3': 'overheat', '4': 'dead', '5': 'over voltage', '6': 'failure', '7': 'cold' };
        res.json({
            level: levelMatch ? parseInt(levelMatch[1]) : null,
            health: healthMap[healthMatch?.[1] || ''] || 'unknown',
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/sensors', async (req, res) => {
    try {
        const deviceId = await getDeviceId(req);
        const output = await adbShellOnDevice(deviceId, 'dumpsys sensorservice');
        // Extract sensor list (human-readable names)
        const lines = output.split('\n');
        const sensorList = [];
        let inSensorList = false;
        for (const line of lines) {
            if (line.includes('Sensor List:')) {
                inSensorList = true;
                continue;
            }
            if (inSensorList) {
                // Stop at empty line or Fusion States
                if (line.trim() === '' || line.includes('Fusion States')) break;
                // Match lines like: "0x00000001) sc7a20e                   | Silan           | ver: 1 | type: android.sensor.accelerometer(1)"
                const match = line.match(/^\s*0x[0-9a-f]+\)\s+(\S+)\s+\|\s+([^|]+)\|\s+ver:\s+\d+\s+\|\s+type:\s+(.+)/i);
                if (match) {
                    sensorList.push({
                        name: match[1].trim(),
                        vendor: match[2].trim(),
                        type: match[3].trim()
                    });
                }
            }
        }
        res.json({ sensors: sensorList.slice(0, 30), raw: output.substring(0, 2000) });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/storage', async (req, res) => {
    try {
        const deviceId = await getDeviceId(req);
        // Get all mounts with human-readable sizes
        const output = await adbShellOnDevice(deviceId, 'df -h');
        const lines = output.split('\n');
        
        let bestLine = '';
        let bestSize = 0;
        let fallbackLine = '';
        let fallbackSize = 0;
        
        for (const line of lines) {
            // Skip header line
            if (line.trim().startsWith('Filesystem')) continue;
            const parts = line.trim().split(/\s+/);
            if (parts.length < 6) continue; // need at least: fs, size, used, avail, use%, mount
            const sizeRaw = parts[1];
            const mount = parts[parts.length - 1];
            
            // Skip system, root, tmpfs, etc.
            if (mount === '/' || mount === '/system' || mount === '/vendor' || mount === '/cache' ||
                mount.startsWith('/dev/') || mount.startsWith('/sys/') || mount.startsWith('/proc/')) {
                continue;
            }
            
            // Parse size to bytes for comparison
            let sizeBytes = 0;
            const numMatch = sizeRaw.match(/^([\d.]+)/);
            if (numMatch) {
                const num = parseFloat(numMatch[1]);
                if (sizeRaw.includes('G')) sizeBytes = num * 1024 * 1024 * 1024;
                else if (sizeRaw.includes('M')) sizeBytes = num * 1024 * 1024;
                else if (sizeRaw.includes('K')) sizeBytes = num * 1024;
                else sizeBytes = num;
            }
            
            // Prefer typical user storage mounts
            if (mount === '/data' || mount === '/storage/emulated' || mount === '/storage/emulated/0' ||
                mount === '/sdcard' || mount === '/mnt/sdcard' || mount.includes('emulated')) {
                if (sizeBytes > bestSize) {
                    bestSize = sizeBytes;
                    bestLine = line;
                }
            } else {
                // Keep fallback (largest among non-system)
                if (sizeBytes > fallbackSize) {
                    fallbackSize = sizeBytes;
                    fallbackLine = line;
                }
            }
        }
        
        const selectedLine = bestLine || fallbackLine;
        if (!selectedLine) {
            console.error('[storage] No suitable partition found. Raw output:\n', output);
            res.json({ total: '?', used: '?', free: '?', raw: output });
            return;
        }
        
        const parts = selectedLine.trim().split(/\s+/);
        if (parts.length < 4) {
            res.json({ total: '?', used: '?', free: '?', raw: output });
            return;
        }
        
        const total = parseSizeToHuman(parts[1]);
        const used = parseSizeToHuman(parts[2]);
        const free = parseSizeToHuman(parts[3]);
        
        console.log(`[storage] Selected: ${selectedLine}`);
        console.log(`[storage] Parsed: total=${total}, used=${used}, free=${free}`);
        res.json({ total, used, free, raw: selectedLine });
    } catch (err: any) {
        console.error('[storage] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/ram', async (req, res) => {
    try {
        const deviceId = await getDeviceId(req);
        // Use /proc/meminfo for MemAvailable (accurate free memory)
        const meminfo = await adbShellOnDevice(deviceId, 'cat /proc/meminfo');
        const memTotalMatch = meminfo.match(/MemTotal:\s*(\d+)\s*kB/i);
        const memAvailableMatch = meminfo.match(/MemAvailable:\s*(\d+)\s*kB/i);
        
        if (memTotalMatch && memAvailableMatch) {
            const totalKB = parseInt(memTotalMatch[1]);
            const availableKB = parseInt(memAvailableMatch[1]);
            const usedKB = totalKB - availableKB;
            
            const toHuman = (kb: number) => {
                const mb = kb / 1024;
                const gb = mb / 1024;
                if (gb >= 1) return `${gb.toFixed(1)} GB`;
                if (mb >= 1) return `${Math.round(mb)} MB`;
                return `${kb} KB`;
            };
            
            res.json({
                total: toHuman(totalKB),
                used: toHuman(usedKB),
                free: toHuman(availableKB)
            });
        } else {
            // Fallback to dumpsys meminfo (less accurate but works)
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
                    return `${(kb / 1024).toFixed(0)} MB`;
                };
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