import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const router = Router();

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
    const category = req.query.category as string;

    if (!deviceId || !category) {
        return res.status(400).json({ error: 'deviceId and category required' });
    }

    console.log(`[storage-category-details] deviceId: ${deviceId}, category: ${category}`);

    try {
        let items: any[] = [];

        switch (category) {
            case 'apps': {
                const listCmd = 'pm list packages -3';
                const args = ['shell', listCmd];
                if (deviceId) args.unshift('-s', deviceId);
                const { stdout } = await execFileAsync('adb', args, { timeout: 15000, maxBuffer: 5 * 1024 * 1024 });
                const packages = stdout
                    .split(/\r?\n/)
                    .filter(line => line.startsWith('package:'))
                    .map(line => line.replace('package:', '').trim());

                console.log(`[apps] Found ${packages.length} packages`);

                for (const pkg of packages) {
                    if (!pkg) continue;
                    try {
                        // Get APK path
                        const pathCmd = `pm path ${pkg}`;
                        const pathArgs = ['shell', pathCmd];
                        if (deviceId) pathArgs.unshift('-s', deviceId);
                        const { stdout: pathOut } = await execFileAsync('adb', pathArgs, { timeout: 5000 });
                        const apkLine = pathOut.split(/\r?\n/).find(line => line.startsWith('package:'));
                        if (!apkLine) continue;
                        const apkPath = apkLine.replace('package:', '').trim();
                        if (!apkPath) continue;

                        const dir = apkPath.substring(0, apkPath.lastIndexOf('/'));

                        // Get directory size (bytes)
                        const sizeCmd = `du -sb ${dir} 2>/dev/null | awk '{print $1}'`;
                        const sizeArgs = ['shell', sizeCmd];
                        if (deviceId) sizeArgs.unshift('-s', deviceId);
                        const { stdout: sizeOut } = await execFileAsync('adb', sizeArgs, { timeout: 5000 });
                        let bytes = parseInt(sizeOut.trim());
                        if (isNaN(bytes)) bytes = 0;

                        // Check OBB folder
                        const obbPath = `/sdcard/Android/obb/${pkg}`;
                        const obbCmd = `du -sb ${obbPath} 2>/dev/null | awk '{print $1}'`;
                        const obbArgs = ['shell', obbCmd];
                        if (deviceId) obbArgs.unshift('-s', deviceId);
                        try {
                            const { stdout: obbOut } = await execFileAsync('adb', obbArgs, { timeout: 5000 });
                            const obbBytes = parseInt(obbOut.trim());
                            if (!isNaN(obbBytes) && obbBytes > 0) bytes += obbBytes;
                        } catch (e: any) {
                            // OBB folder may not exist; ignore
                            console.log(`[apps] OBB check for ${pkg}: ${e.message}`);
                        }

                        if (bytes >= 1024 * 1024 * 1024) {
                            items.push({
                                name: pkg,
                                packageName: pkg,
                                size: (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB',
                                bytes: bytes
                            });
                        }
                    } catch (err: any) {
                        console.log(`[apps] Skipping ${pkg}: ${err.message}`);
                    }
                }
                break;
            }

            case 'media': {
                const cmd = `find /sdcard -type f \\( -iname "*.mp4" -o -iname "*.mkv" -o -iname "*.avi" -o -iname "*.mov" -o -iname "*.jpg" -o -iname "*.png" -o -iname "*.gif" -o -iname "*.mp3" -o -iname "*.wav" -o -iname "*.flac" \\) -size +1G -exec ls -lh {} \\; 2>/dev/null | awk '{print $5, $9}'`;
                const args = ['shell', cmd];
                if (deviceId) args.unshift('-s', deviceId);
                const { stdout } = await execFileAsync('adb', args, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
                const lines = stdout.split(/\r?\n/).filter(line => line.trim() !== '');
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
                break;
            }

            case 'system': {
                items = [{ name: 'System data (not individually listed)', size: 'N/A', bytes: 0 }];
                break;
            }

            case 'other': {
                const cmd = `find /sdcard -type f -size +1G ! \\( -iname "*.mp4" -o -iname "*.mkv" -o -iname "*.avi" -o -iname "*.mov" -o -iname "*.jpg" -o -iname "*.png" -o -iname "*.gif" -o -iname "*.mp3" -o -iname "*.wav" -o -iname "*.flac" \\) -exec ls -lh {} \\; 2>/dev/null | awk '{print $5, $9}'`;
                const args = ['shell', cmd];
                if (deviceId) args.unshift('-s', deviceId);
                const { stdout } = await execFileAsync('adb', args, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
                const lines = stdout.split(/\r?\n/).filter(line => line.trim() !== '');
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
                break;
            }
        }

        items.sort((a, b) => b.bytes - a.bytes);
        console.log(`[storage-category-details] Returning ${items.length} items for ${category}`);
        res.json({ items, count: items.length });
    } catch (err: any) {
        console.error('Storage category details error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch category details' });
    }
});

export default router;