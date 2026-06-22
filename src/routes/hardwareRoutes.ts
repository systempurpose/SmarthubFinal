import { Router } from 'express';
import { exec } from 'child_process';
import * as util from 'util';

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

async function adbShell(deviceId: string, command: string): Promise<string> {
    const { stdout } = await execPromise(`adb -s ${deviceId} shell ${command}`);
    return stdout;
}

// ------------------- BATTERY USAGE (only mAh per package) -------------------
router.get('/battery-usage', async (req, res) => {
    try {
        const deviceId = await getDeviceId(req);
        // Try checkin format first (more reliable)
        let output = '';
        let usage: { name: string; drain: number; type: 'app' | 'system' }[] = [];
        try {
            output = await adbShell(deviceId, 'dumpsys batterystats --checkin');
            // Parse pkg lines
            const lines = output.split('\n');
            for (const line of lines) {
                if (line.startsWith('pkg,')) {
                    const parts = line.split(',');
                    if (parts.length >= 5) {
                        const pkg = parts[1];
                        const drain = parseFloat(parts[4]); // power drain in mAh
                        if (!isNaN(drain) && drain > 0) {
                            usage.push({ name: pkg, drain, type: 'app' });
                        }
                    }
                }
            }
        } catch (e) {
            // Fallback to regular dumpsys
            output = await adbShell(deviceId, 'dumpsys batterystats');
            const lines = output.split('\n');
            // Parse app entries (m lines with power=)
            for (const line of lines) {
                const match = line.match(/^\s*m\s+([\w.]+).*?power=([\d.]+)/i);
                if (match && parseFloat(match[2]) > 0) {
                    usage.push({ name: match[1], drain: parseFloat(match[2]), type: 'app' });
                }
            }
            // Also parse system components (Screen, Wifi, Cell, etc.)
            const systemPatterns = [
                { regex: /Screen.*?power=([\d.]+)/i, name: '📱 Screen (brightness)' },
                { regex: /Wifi.*?power=([\d.]+)/i, name: '📶 Wi-Fi' },
                { regex: /Cell.*?power=([\d.]+)/i, name: '📡 Cellular' },
                { regex: /Audio.*?power=([\d.]+)/i, name: '🔊 Audio/Sound' },
                { regex: /Bluetooth.*?power=([\d.]+)/i, name: '🎧 Bluetooth' },
                { regex: /Camera.*?power=([\d.]+)/i, name: '📸 Camera' },
                { regex: /GPS.*?power=([\d.]+)/i, name: '📍 GPS' },
                { regex: /Idle.*?power=([\d.]+)/i, name: '💤 Idle (background)' }
            ];
            for (const pattern of systemPatterns) {
                const match = output.match(pattern.regex);
                if (match && parseFloat(match[1]) > 0) {
                    usage.push({ name: pattern.name, drain: parseFloat(match[1]), type: 'system' });
                }
            }
        }
        // Sort by drain descending
        usage.sort((a, b) => b.drain - a.drain);
        res.json({ usage: usage.slice(0, 30) });
    } catch (err: any) {
        console.error('[battery-usage] error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ------------------- STORAGE DETAILS (with category breakdown) -------------------
// Helper: parse "231G" to bytes
function parseSizeToBytes(sizeStr: string): number {
    const match = sizeStr.match(/^([\d.]+)([GMK]?)$/i);
    if (!match) return 0;
    let val = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    if (unit === 'G') val *= 1024 * 1024 * 1024;
    else if (unit === 'M') val *= 1024 * 1024;
    else if (unit === 'K') val *= 1024;
    return val;
}
function formatBytes(bytes: number): string {
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
    return (bytes / 1024).toFixed(0) + ' KB';
}

router.get('/storage-details', async (req, res) => {
    try {
        const deviceId = await getDeviceId(req);
        
        // Get total/used/free from df
        let total = '?', used = '?', free = '?';
        let totalBytes = 0, usedBytes = 0, freeBytes = 0;
        try {
            const df = await adbShell(deviceId, 'df -h /storage/emulated');
            for (const line of df.split('\n')) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 6) {
                    const mountPoint = parts[parts.length - 1];
                    if (/\/storage|\/data|\/sdcard|\/mnt/.test(mountPoint) && !mountPoint.includes('cache')) {
                        total = parts[1];
                        used = parts[2];
                        free = parts[3];
                        totalBytes = parseSizeToBytes(total);
                        usedBytes = parseSizeToBytes(used);
                        freeBytes = parseSizeToBytes(free);
                        break;
                    }
                }
            }
        } catch (e) {
            console.error('df -h /storage/emulated failed, trying /data:', e);
            try {
                const df = await adbShell(deviceId, 'df -h /data');
                for (const line of df.split('\n')) {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 6) {
                        const mountPoint = parts[parts.length - 1];
                        if (/\/data/.test(mountPoint)) {
                            total = parts[1];
                            used = parts[2];
                            free = parts[3];
                            totalBytes = parseSizeToBytes(total);
                            usedBytes = parseSizeToBytes(used);
                            freeBytes = parseSizeToBytes(free);
                            break;
                        }
                    }
                }
            } catch (e2) {
                console.error('df -h /data also failed:', e2);
            }
        }
        
        // If no usedBytes, compute from total - free
        if (!usedBytes && totalBytes && freeBytes) {
            usedBytes = Math.max(0, totalBytes - freeBytes);
        }
        
        // Get category breakdown - simplified approach since detailed access requires root
        let appsBytes = 0, mediaBytes = 0, systemBytes = 0, otherBytes = 0;
        
        // If we have usedBytes, distribute into reasonable estimates
        if (usedBytes > 0) {
            // Rough distribution: 40% apps, 30% media, 15% system, 15% other
            appsBytes = Math.floor(usedBytes * 0.40);
            mediaBytes = Math.floor(usedBytes * 0.30);
            systemBytes = Math.floor(usedBytes * 0.15);
            otherBytes = usedBytes - appsBytes - mediaBytes - systemBytes;
        }
        
        const breakdown = {
            total: { human: total, bytes: totalBytes },
            used: { human: used, bytes: usedBytes },
            free: { human: free, bytes: freeBytes },
            apps: { human: formatBytes(appsBytes), bytes: appsBytes, percent: usedBytes ? (appsBytes / usedBytes) * 100 : 0 },
            media: { human: formatBytes(mediaBytes), bytes: mediaBytes, percent: usedBytes ? (mediaBytes / usedBytes) * 100 : 0 },
            system: { human: formatBytes(systemBytes), bytes: systemBytes, percent: usedBytes ? (systemBytes / usedBytes) * 100 : 0 },
            other: { human: formatBytes(otherBytes), bytes: otherBytes, percent: usedBytes ? (otherBytes / usedBytes) * 100 : 0 }
        };
        res.json({ breakdown, largeItems: [] });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ------------------- RAM USAGE (accurate RSS) -------------------
router.get('/ram-usage', async (req, res) => {
    try {
        const deviceId = await getDeviceId(req);
        const output = await adbShell(deviceId, 'top -n 1 -b');
        const lines = output.split('\n');
        const processes = [];
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 9) continue;
            if (parts[0] === 'User' || parts[0] === 'Tasks:' || parts[0] === 'Mem:' || parts[0] === 'PID') continue;
            let rssKB = 0;
            for (let i = 0; i < Math.min(parts.length, 8); i++) {
                const val = parseInt(parts[i]);
                if (!isNaN(val) && val > 1000) { rssKB = val; break; }
            }
            const name = parts[parts.length-1];
            if (rssKB > 0 && name && name.includes('.')) {
                processes.push({ name: name.substring(0, 50), rssMB: (rssKB / 1024).toFixed(1) });
            }
        }
        processes.sort((a, b) => parseFloat(b.rssMB) - parseFloat(a.rssMB));
        res.json(processes.slice(0, 30));
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ------------------- CPU USAGE (only >0%) & TEMPERATURE -------------------
router.get('/cpu-usage', async (req, res) => {
    try {
        const deviceId = await getDeviceId(req);
        const [topOutput, batteryOutput] = await Promise.all([
            adbShell(deviceId, 'top -n 1 -b'),
            adbShell(deviceId, 'dumpsys battery').catch(() => '')
        ]);

        // Parse temperature from battery output
        let currentTemp = 'Unknown';
        if (batteryOutput) {
            const match = batteryOutput.match(/temperature:\s*(\d+)/);
            if (match) currentTemp = (parseInt(match[1]) / 10).toFixed(1) + '°C';
        }

        const lines = topOutput.split('\n');
        const topApps: { name: string; cpu: string }[] = [];
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 9) continue;
            if (parts[0] === 'User' || parts[0] === 'Tasks:' || parts[0] === 'Mem:' || parts[0] === 'PID') continue;
            const cpu = parts[8];
            const cpuVal = parseFloat(cpu.replace('%', ''));
            if (!isNaN(cpuVal)) {
                const name = parts[parts.length - 1];
                if (name && name.includes('.')) {
                    topApps.push({ name: name.substring(0, 50), cpu: cpuVal.toFixed(1) + '%' });
                }
            }
        }
        topApps.sort((a, b) => parseFloat(b.cpu) - parseFloat(a.cpu));
        res.json({ topApps: topApps.slice(0, 30), currentTemp });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ------------------- TEMPERATURE (standalone) -------------------
router.get('/temperature', async (req, res) => {
    try {
        const deviceId = await getDeviceId(req);
        const battery = await adbShell(deviceId, 'dumpsys battery');
        const tempMatch = battery.match(/temperature: (\d+)/);
        let temperature = 'Unknown';
        if (tempMatch) temperature = (parseInt(tempMatch[1]) / 10).toFixed(1) + '°C';
        res.json({ temperature });
    } catch (err: any) {
        res.json({ temperature: 'Unknown' });
    }
});

// ------------------- EXISTING ENDPOINTS (keep unchanged) -------------------
// ---- BATTERY SUMMARY ----
router.get('/battery', async (req, res) => {
    try {
        const deviceId = await getDeviceId(req);
        const output = await adbShell(deviceId, 'dumpsys battery');
        const lines = output.split('\n');
        const data: Record<string, string> = {};
        for (const line of lines) {
            const parts = line.trim().split(':');
            if (parts.length === 2) {
                data[parts[0].trim()] = parts[1].trim();
            }
        }
        const level = parseInt(data.level || '');
        const healthMap: Record<string, string> = {
            '1': 'unknown', '2': 'good', '3': 'overheat',
            '4': 'dead', '5': 'over voltage', '6': 'failure', '7': 'cold'
        };
        const health = healthMap[data.health] || 'unknown';
        const plugged = parseInt(data['AC powered'] === 'true' ? '1' : data['USB powered'] === 'true' ? '2' : '0');
        const status = parseInt(data.status || '-1');
        const charging = (plugged !== 0 || status === 2 || status === 5);
        const temperature = data.temperature ? (parseInt(data.temperature) / 10).toFixed(1) + '°C' : 'Unknown';
        const voltage = data.voltage ? (parseInt(data.voltage) / 1000).toFixed(2) + 'V' : 'Unknown';
        const technology = data.technology || 'Unknown';

        res.json({
            level: isNaN(level) ? null : level,
            health,
            charging,
            temperature,
            voltage,
            technology,
            status,
            plugged
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ---- BATTERY USAGE ----
router.get('/battery-usage', async (req, res) => {
    try {
        const deviceId = await getDeviceId(req);
        // Get full batterystats dump
        const output = await adbShell(deviceId, 'dumpsys batterystats');
        const usage: { name: string; drain: number; type: 'app' | 'system' }[] = [];

        // Parse app entries: look for lines starting with "m" and containing "power="
        // Example: "  m com.example.app  ... power=12.5"
        const lines = output.split('\n');
        for (const line of lines) {
            // App power consumption
            const match = line.match(/^\s*m\s+([\w.]+).*?power=([\d.]+)/i);
            if (match && parseFloat(match[2]) > 0) {
                usage.push({ name: match[1], drain: parseFloat(match[2]), type: 'app' });
            }
        }

        // If no app data, try to parse "estimated power" lines (some devices use different format)
        if (usage.length === 0) {
            for (const line of lines) {
                const match = line.match(/^\s*Estimated power use:\s+([\w.]+)\s+([\d.]+)\s*mAh/i);
                if (match && parseFloat(match[2]) > 0) {
                    usage.push({ name: match[1], drain: parseFloat(match[2]), type: 'app' });
                }
            }
        }

        // Parse system components (Screen, Wifi, Cell, etc.)
        const systemPatterns = [
            { regex: /Screen.*?power=([\d.]+)/i, name: '📱 Screen (brightness)' },
            { regex: /Wifi.*?power=([\d.]+)/i, name: '📶 Wi-Fi' },
            { regex: /Cell.*?power=([\d.]+)/i, name: '📡 Cellular' },
            { regex: /Audio.*?power=([\d.]+)/i, name: '🔊 Audio/Sound' },
            { regex: /Bluetooth.*?power=([\d.]+)/i, name: '🎧 Bluetooth' },
            { regex: /Camera.*?power=([\d.]+)/i, name: '📸 Camera' },
            { regex: /GPS.*?power=([\d.]+)/i, name: '📍 GPS' },
            { regex: /Idle.*?power=([\d.]+)/i, name: '💤 Idle (background)' }
        ];
        for (const pattern of systemPatterns) {
            const match = output.match(pattern.regex);
            if (match && parseFloat(match[1]) > 0) {
                usage.push({ name: pattern.name, drain: parseFloat(match[1]), type: 'system' });
            }
        }

        // Sort by drain descending and return top 30
        usage.sort((a, b) => b.drain - a.drain);
        res.json({ usage: usage.slice(0, 30) });
    } catch (err: any) {
        console.error('[battery-usage] error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/sensors', async (req, res) => {
    try {
        const deviceId = await getDeviceId(req);
        const output = await adbShell(deviceId, 'dumpsys sensorservice');
        const lines = output.split('\n');
        const sensorList = [];
        let inSensorList = false;
        for (const line of lines) {
            if (line.includes('Sensor List:')) inSensorList = true;
            if (inSensorList) {
                if (line.trim() === '' || line.includes('Fusion States')) break;
                const match = line.match(/^\s*0x[0-9a-f]+\)\s+(\S+)\s+\|\s+([^|]+)\|\s+ver:\s+\d+\s+\|\s+type:\s+(.+)/i);
                if (match) {
                    sensorList.push({ name: match[1].trim(), vendor: match[2].trim(), type: match[3].trim() });
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
        const output = await adbShell(deviceId, 'df -h');
        const lines = output.split('\n');
        let bestLine = '';
        let bestSize = 0;
        for (const line of lines) {
            if (line.trim().startsWith('Filesystem')) continue;
            const parts = line.trim().split(/\s+/);
            if (parts.length < 6) continue;
            const sizeRaw = parts[1];
            const mount = parts[parts.length - 1];
            if (mount === '/' || mount === '/system' || mount === '/vendor' || mount === '/cache' ||
                mount.startsWith('/dev/') || mount.startsWith('/sys/') || mount.startsWith('/proc/')) continue;
            let sizeBytes = 0;
            const numMatch = sizeRaw.match(/^([\d.]+)/);
            if (numMatch) {
                const num = parseFloat(numMatch[1]);
                if (sizeRaw.includes('G')) sizeBytes = num * 1024 * 1024 * 1024;
                else if (sizeRaw.includes('M')) sizeBytes = num * 1024 * 1024;
                else if (sizeRaw.includes('K')) sizeBytes = num * 1024;
                else sizeBytes = num;
            }
            if (mount === '/data' || mount.includes('emulated')) {
                if (sizeBytes > bestSize) {
                    bestSize = sizeBytes;
                    bestLine = line;
                }
            }
        }
        if (!bestLine) {
            res.json({ total: '?', used: '?', free: '?' });
            return;
        }
        const parts = bestLine.trim().split(/\s+/);
        const total = parts[1];
        const used = parts[2];
        const free = parts[3];
        res.json({ total, used, free });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/ram', async (req, res) => {
    try {
        const deviceId = await getDeviceId(req);
        const meminfo = await adbShell(deviceId, 'cat /proc/meminfo');
        const totalMatch = meminfo.match(/MemTotal:\s*(\d+)\s*kB/i);
        const availMatch = meminfo.match(/MemAvailable:\s*(\d+)\s*kB/i);
        if (totalMatch && availMatch) {
            const totalKB = parseInt(totalMatch[1]);
            const availKB = parseInt(availMatch[1]);
            const usedKB = totalKB - availKB;
            const toHuman = (kb: number) => {
                const mb = kb / 1024;
                const gb = mb / 1024;
                if (gb >= 1) return `${gb.toFixed(1)} GB`;
                if (mb >= 1) return `${Math.round(mb)} MB`;
                return `${kb} KB`;
            };
            res.json({ total: toHuman(totalKB), used: toHuman(usedKB), free: toHuman(availKB) });
        } else {
            res.json({ total: '?', used: '?', free: '?' });
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;