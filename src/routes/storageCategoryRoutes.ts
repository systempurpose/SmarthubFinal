import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const router = Router();

const MIN_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

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

// BATCH_SIZE: number of apps to process in parallel
const BATCH_SIZE = 5;

router.get('/storage-category-details', async (req, res) => {
    const deviceId = req.query.deviceId as string;
    const category = req.query.category as string;

    if (!deviceId || !category) {
        return res.status(400).json({ error: 'deviceId and category required' });
    }

    console.log(`[storage] START: deviceId=${deviceId}, category=${category}`);

    try {
        let items: any[] = [];

        switch (category) {
            case 'apps': {
                console.log('[storage] Apps scan started...');
                const listCmd = 'pm list packages -3';
                const args = ['shell', listCmd];
                if (deviceId) args.unshift('-s', deviceId);
                const { stdout } = await execFileAsync('adb', args, { timeout: 15000, maxBuffer: 5 * 1024 * 1024 });
                const packages = stdout
                    .split(/\r?\n/)
                    .filter(line => line.startsWith('package:'))
                    .map(line => line.replace('package:', '').trim());

                console.log(`[storage] Found ${packages.length} packages`);

                for (let i = 0; i < packages.length; i += BATCH_SIZE) {
                    const batch = packages.slice(i, i + BATCH_SIZE);
                    const batchPromises = batch.map(async (pkg) => {
                        if (!pkg) return null;
                        try {
                            const pathCmd = `pm path ${pkg}`;
                            const pathArgs = ['shell', pathCmd];
                            if (deviceId) pathArgs.unshift('-s', deviceId);
                            const { stdout: pathOut } = await execFileAsync('adb', pathArgs, { timeout: 5000 });
                            const apkLine = pathOut.split(/\r?\n/).find(line => line.startsWith('package:'));
                            if (!apkLine) return null;
                            const apkPath = apkLine.replace('package:', '').trim();
                            if (!apkPath) return null;
                            const dir = apkPath.substring(0, apkPath.lastIndexOf('/'));

                            // Fast pre‑check with du -sk (kilobytes)
                            const fastCmd = `du -sk ${dir} 2>/dev/null | awk '{print $1}'`;
                            const fastArgs = ['shell', fastCmd];
                            if (deviceId) fastArgs.unshift('-s', deviceId);
                            const { stdout: fastOut } = await execFileAsync('adb', fastArgs, { timeout: 5000 });
                            const sizeKB = parseInt(fastOut.trim());
                            if (isNaN(sizeKB) || sizeKB < MIN_SIZE_BYTES / 1024) {
                                return null;
                            }

                            // Detailed size (bytes)
                            const sizeCmd = `du -sb ${dir} 2>/dev/null | awk '{print $1}'`;
                            const sizeArgs = ['shell', sizeCmd];
                            if (deviceId) sizeArgs.unshift('-s', deviceId);
                            const { stdout: sizeOut } = await execFileAsync('adb', sizeArgs, { timeout: 5000 });
                            let bytes = parseInt(sizeOut.trim());
                            if (isNaN(bytes)) bytes = 0;

                            // OBB folder
                            const obbPath = `/sdcard/Android/obb/${pkg}`;
                            const obbCmd = `du -sb ${obbPath} 2>/dev/null | awk '{print $1}'`;
                            const obbArgs = ['shell', obbCmd];
                            if (deviceId) obbArgs.unshift('-s', deviceId);
                            try {
                                const { stdout: obbOut } = await execFileAsync('adb', obbArgs, { timeout: 5000 });
                                const obbBytes = parseInt(obbOut.trim());
                                if (!isNaN(obbBytes) && obbBytes > 0) bytes += obbBytes;
                            } catch {}

                            if (bytes >= MIN_SIZE_BYTES) {
                                return {
                                    name: pkg,
                                    packageName: pkg,
                                    size: (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB',
                                    bytes: bytes
                                };
                            }
                        } catch {
                            // skip on error
                        }
                        return null;
                    });

                    const batchResults = await Promise.all(batchPromises);
                    for (const result of batchResults) {
                        if (result) items.push(result);
                    }

                    if ((i + BATCH_SIZE) % (BATCH_SIZE * 10) === 0 || i + BATCH_SIZE >= packages.length) {
                        console.log(`[storage] Processed ${Math.min(i + BATCH_SIZE, packages.length)}/${packages.length} apps`);
                    }
                }
                console.log(`[storage] Apps scan complete, found ${items.length} items`);
                break;
            }

            case 'media': {
                console.log('[storage] Media scan started...');
                const root = '/storage/emulated/0';
                try {
                    const cmd =
                        `find ${root} -type f \\( -iname "*.mp4" -o -iname "*.mkv" -o -iname "*.avi" -o -iname "*.mov" -o -iname "*.jpg" -o -iname "*.png" -o -iname "*.gif" -o -iname "*.mp3" -o -iname "*.wav" -o -iname "*.flac" \\) -size +500M -exec du -b {} \\; 2>/dev/null`;
                    const args = ['shell', cmd];
                    if (deviceId) args.unshift('-s', deviceId);
                    const { stdout } = await execFileAsync('adb', args, { timeout: 30000, maxBuffer: 20 * 1024 * 1024 });
                    console.log(`[storage] Media raw output length: ${stdout.length} chars`);
                    const lines = stdout.split(/\r?\n/).filter(line => line.trim() !== '');
                    for (const line of lines) {
                        // Parse using regex: any whitespace between bytes and path
                        const match = line.trim().match(/^(\d+)\s+(.*)/);
                        if (!match) continue;
                        const bytes = parseInt(match[1], 10);
                        const path = match[2].trim();
                        if (bytes >= MIN_SIZE_BYTES) {
                            items.push({
                                name: path.split('/').pop() || path,
                                path: path,
                                size: (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB',
                                bytes: bytes
                            });
                        }
                    }
                    console.log(`[storage] Media found ${items.length} items`);
                } catch (e: any) {
                    console.error('[storage] Media scan error:', e.message);
                }
                break;
            }

            case 'system': {
                items = [{ name: 'System data (not individually listed)', size: 'N/A', bytes: 0 }];
                break;
            }

            case 'other': {
                console.log('[storage] Other scan started...');
                const root = '/storage/emulated/0';
                try {
                    const cmd =
                        `find ${root} -type f -size +500M ! \\( -iname "*.mp4" -o -iname "*.mkv" -o -iname "*.avi" -o -iname "*.mov" -o -iname "*.jpg" -o -iname "*.png" -o -iname "*.gif" -o -iname "*.mp3" -o -iname "*.wav" -o -iname "*.flac" \\) -exec du -b {} \\; 2>/dev/null`;
                    const args = ['shell', cmd];
                    if (deviceId) args.unshift('-s', deviceId);
                    const { stdout } = await execFileAsync('adb', args, { timeout: 30000, maxBuffer: 20 * 1024 * 1024 });
                    console.log(`[storage] Other raw output length: ${stdout.length} chars`);
                    const lines = stdout.split(/\r?\n/).filter(line => line.trim() !== '');
                    for (const line of lines) {
                        const match = line.trim().match(/^(\d+)\s+(.*)/);
                        if (!match) continue;
                        const bytes = parseInt(match[1], 10);
                        const path = match[2].trim();
                        if (bytes >= MIN_SIZE_BYTES) {
                            items.push({
                                name: path.split('/').pop() || path,
                                path: path,
                                size: (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB',
                                bytes: bytes
                            });
                        }
                    }
                    console.log(`[storage] Other found ${items.length} items`);
                } catch (e: any) {
                    console.error('[storage] Other scan error:', e.message);
                }
                break;
            }

            default: {
                return res.status(400).json({ error: `Unknown category: ${category}` });
            }
        }

        items.sort((a, b) => b.bytes - a.bytes);
        console.log(`[storage] Returning ${items.length} items for ${category}`);
        res.json({ items, count: items.length });
    } catch (err: any) {
        console.error('[storage] Fatal error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch category details' });
    }
});

export default router;