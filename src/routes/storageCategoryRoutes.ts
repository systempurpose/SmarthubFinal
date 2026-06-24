import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const router = Router();

// Helper to parse size strings
function parseSizeToBytes(sizeStr: string): number {
    const match = sizeStr.match(/^([\d.]+)\s*([GMK]?)/i);
    if (!match) return 0;
    let val = parseFloat(match[1]);
    const unit = (match[2] || '').toUpperCase();
    if (unit === 'G') return val * 1024 * 1024 * 1024;
    if (unit === 'M') return val * 1024 * 1024;
    if (unit === 'K') return val * 1024;
    return val;
}

router.get('/storage-category-details', async (req, res) => {
    const deviceId = req.query.deviceId as string;
    const category = req.query.category as string; // 'apps', 'media', 'system', 'other'

    if (!deviceId || !category) {
        return res.status(400).json({ error: 'deviceId and category required' });
    }

    try {
        let items: any[] = [];

        switch (category) {
            case 'apps':
                // Get all installed apps with their sizes
                const appsCommand = 'pm list packages -3 --show-versioncode';
                const args = ['shell', appsCommand];
                if (deviceId) args.unshift('-s', deviceId);
                const { stdout: appsOutput } = await execFileAsync('adb', args, { timeout: 15000, maxBuffer: 5 * 1024 * 1024 });
                const packages = appsOutput.split(/\r?\n/).filter(line => line.startsWith('package:'));
                
                // For each package, get its size
                for (const pkgLine of packages) {
                    const packageName = pkgLine.replace('package:', '').trim();
                    if (!packageName) continue;
                    try {
                        const sizeArgs = ['shell', `du -s /data/app/${packageName}* 2>/dev/null | awk '{print $1}'`];
                        if (deviceId) sizeArgs.unshift('-s', deviceId);
                        const { stdout: sizeOutput } = await execFileAsync('adb', sizeArgs, { timeout: 5000 });
                        const sizeKB = parseInt(sizeOutput.trim());
                        if (!isNaN(sizeKB) && sizeKB > 0) {
                            const bytes = sizeKB * 1024;
                            if (bytes >= 1024 * 1024 * 1024) { // >= 1GB
                                items.push({
                                    name: packageName,
                                    packageName: packageName,
                                    size: (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB',
                                    bytes: bytes
                                });
                            }
                        }
                    } catch (e) {
                        // Skip if we can't get size
                    }
                }
                break;

            case 'media':
                // Find media files > 1GB in /sdcard
                const mediaCommand = `find /sdcard -type f \\( -iname "*.mp4" -o -iname "*.mkv" -o -iname "*.avi" -o -iname "*.mov" -o -iname "*.jpg" -o -iname "*.png" -o -iname "*.gif" -o -iname "*.mp3" -o -iname "*.wav" -o -iname "*.flac" \\) -size +1G -exec ls -lh {} \\; 2>/dev/null | awk '{print $5, $9}'`;
                const mediaArgs = ['shell', mediaCommand];
                if (deviceId) mediaArgs.unshift('-s', deviceId);
                const { stdout: mediaOutput } = await execFileAsync('adb', mediaArgs, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
                const mediaLines = mediaOutput.split(/\r?\n/).filter(line => line.trim() !== '');
                for (const line of mediaLines) {
                    const parts = line.trim().split(/\s+/);
                    const sizeStr = parts[0];
                    const path = parts.slice(1).join(' ');
                    const bytes = parseSizeToBytes(sizeStr);
                    if (bytes > 0) {
                        items.push({
                            name: path.split('/').pop() || path,
                            path: path,
                            size: sizeStr,
                            bytes: bytes
                        });
                    }
                }
                break;

            case 'system':
                // System files are harder to list; we can show system apps or system partition usage
                // For now, return a placeholder or use the same as 'other'
                items = [{ name: 'System data (not individually listed)', size: 'N/A', bytes: 0 }];
                break;

            case 'other':
                // Other files: find all files > 1GB not in media categories
                const otherCommand = `find /sdcard -type f -size +1G ! \\( -iname "*.mp4" -o -iname "*.mkv" -o -iname "*.avi" -o -iname "*.mov" -o -iname "*.jpg" -o -iname "*.png" -o -iname "*.gif" -o -iname "*.mp3" -o -iname "*.wav" -o -iname "*.flac" \\) -exec ls -lh {} \\; 2>/dev/null | awk '{print $5, $9}'`;
                const otherArgs = ['shell', otherCommand];
                if (deviceId) otherArgs.unshift('-s', deviceId);
                const { stdout: otherOutput } = await execFileAsync('adb', otherArgs, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
                const otherLines = otherOutput.split(/\r?\n/).filter(line => line.trim() !== '');
                for (const line of otherLines) {
                    const parts = line.trim().split(/\s+/);
                    const sizeStr = parts[0];
                    const path = parts.slice(1).join(' ');
                    const bytes = parseSizeToBytes(sizeStr);
                    if (bytes > 0) {
                        items.push({
                            name: path.split('/').pop() || path,
                            path: path,
                            size: sizeStr,
                            bytes: bytes
                        });
                    }
                }
                break;
        }

        // Sort by size descending
        items.sort((a, b) => b.bytes - a.bytes);
        res.json({ items, count: items.length });
    } catch (err: any) {
        console.error('Storage category details error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch category details' });
    }
});

export default router;