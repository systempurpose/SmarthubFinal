import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const router = Router();

// Helper to parse size strings for other categories
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

// Helper to run du -sb on a directory in parallel with concurrency limit
async function getAppSizes(deviceId: string, packages: string[], concurrency = 10): Promise<Map<string, number>> {
    const results = new Map<string, number>();
    const batchSize = concurrency;
    for (let i = 0; i < packages.length; i += batchSize) {
        const batch = packages.slice(i, i + batchSize);
        const promises = batch.map(async (pkg) => {
            try {
                // Get APK path
                const pathCmd = `pm path ${pkg}`;
                const pathArgs = ['shell', pathCmd];
                if (deviceId) pathArgs.unshift('-s', deviceId);
                const { stdout: pathOut } = await execFileAsync('adb', pathArgs, { timeout: 5000 });
                const apkLine = pathOut.split(/\r?\n/).find(line => line.startsWith('package:'));
                if (!apkLine) return null;
                const apkPath = apkLine.replace('package:', '').trim();
                if (!apkPath) return null;
                const dir = apkPath.substring(0, apkPath.lastIndexOf('/'));

                // Get size in bytes
                const sizeCmd = `du -sb ${dir} 2>/dev/null | awk '{print $1}'`;
                const sizeArgs = ['shell', sizeCmd];
                if (deviceId) sizeArgs.unshift('-s', deviceId);
                const { stdout: sizeOut } = await execFileAsync('adb', sizeArgs, { timeout: 5000 });
                const bytes = parseInt(sizeOut.trim());
                if (!isNaN(bytes) && bytes > 0) {
                    return { pkg, bytes };
                }
            } catch (err) {
                // Skip this package
            }
            return null;
        });
        const batchResults = await Promise.all(promises);
        for (const result of batchResults) {
            if (result) {
                results.set(result.pkg, result.bytes);
            }
        }
    }
    return results;
}

router.get('/storage-category-details', async (req, res) => {
    const deviceId = req.query.deviceId as string;
    const category = req.query.category as string;

    if (!deviceId || !category) {
        return res.status(400).json({ error: 'deviceId and category required' });
    }

    console.log(`[storage-category-details] START: deviceId=${deviceId}, category=${category}`);

    try {
        let items: any[] = [];

        if (category === 'apps') {
            console.log('[storage-category-details] Scanning apps...');
            
            // Get list of 3rd-party packages
            const listCmd = 'pm list packages -3';
            const args = ['shell', listCmd];
            if (deviceId) args.unshift('-s', deviceId);
            const { stdout } = await execFileAsync('adb', args, { timeout: 15000, maxBuffer: 5 * 1024 * 1024 });
            const packages = stdout
                .split(/\r?\n/)
                .filter(line => line.startsWith('package:'))
                .map(line => line.replace('package:', '').trim());

            console.log(`[storage-category-details] Found ${packages.length} packages`);

            // Get sizes in parallel with concurrency
            const sizeMap = await getAppSizes(deviceId, packages, 15);
            console.log(`[storage-category-details] Retrieved sizes for ${sizeMap.size} apps`);

            // Filter and build items
            for (const [pkg, bytes] of sizeMap) {
                if (bytes >= 1024 * 1024 * 1024) {
                    items.push({
                        name: pkg,
                        packageName: pkg,
                        size: (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB',
                        bytes: bytes
                    });
                }
            }

            console.log(`[storage-category-details] Found ${items.length} apps ≥1GB`);

        } else if (category === 'media') {
            console.log('[storage-category-details] Scanning media files...');
            const cmd = `find /sdcard -type f \\( -iname "*.mp4" -o -iname "*.mkv" -o -iname "*.avi" -o -iname "*.mov" -o -iname "*.jpg" -o -iname "*.png" -o -iname "*.gif" -o -iname "*.mp3" -o -iname "*.wav" -o -iname "*.flac" \\) -size +1G -exec ls -lh {} \\; 2>/dev/null | awk '{print $5, $9}'`;
            const args = ['shell', cmd];
            if (deviceId) args.unshift('-s', deviceId);
            const { stdout } = await execFileAsync('adb', args, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
            const lines = stdout.split(/\r?\n/).filter(line => line.trim() !== '');
            console.log(`[storage-category-details] Found ${lines.length} media files >1GB`);
            for (const line of lines) {
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

        } else if (category === 'system') {
            items = [{ name: 'System data (not individually listed)', size: 'N/A', bytes: 0 }];

        } else if (category === 'other') {
            console.log('[storage-category-details] Scanning other files...');
            const cmd = `find /sdcard -type f -size +1G ! \\( -iname "*.mp4" -o -iname "*.mkv" -o -iname "*.avi" -o -iname "*.mov" -o -iname "*.jpg" -o -iname "*.png" -o -iname "*.gif" -o -iname "*.mp3" -o -iname "*.wav" -o -iname "*.flac" \\) -exec ls -lh {} \\; 2>/dev/null | awk '{print $5, $9}'`;
            const args = ['shell', cmd];
            if (deviceId) args.unshift('-s', deviceId);
            const { stdout } = await execFileAsync('adb', args, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
            const lines = stdout.split(/\r?\n/).filter(line => line.trim() !== '');
            console.log(`[storage-category-details] Found ${lines.length} other files >1GB`);
            for (const line of lines) {
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
        }

        items.sort((a, b) => b.bytes - a.bytes);
        console.log(`[storage-category-details] FINAL: Returning ${items.length} items for ${category}`);
        res.json({ items, count: items.length });

    } catch (err: any) {
        console.error('[storage-category-details] FATAL ERROR:', err);
        console.error('[storage-category-details] Stack:', err.stack);
        res.status(500).json({ error: err.message || 'Failed to fetch category details' });
    }
});

export default router;