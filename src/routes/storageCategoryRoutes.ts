import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const router = Router();

const MIN_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB
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
                // ... (your existing apps logic – unchanged, works fine)
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

                            const fastCmd = `du -sk ${dir} 2>/dev/null | awk '{print $1}'`;
                            const fastArgs = ['shell', fastCmd];
                            if (deviceId) fastArgs.unshift('-s', deviceId);
                            const { stdout: fastOut } = await execFileAsync('adb', fastArgs, { timeout: 5000 });
                            const sizeKB = parseInt(fastOut.trim());
                            if (isNaN(sizeKB) || sizeKB < MIN_SIZE_BYTES / 1024) return null;

                            const sizeCmd = `du -sb ${dir} 2>/dev/null | awk '{print $1}'`;
                            const sizeArgs = ['shell', sizeCmd];
                            if (deviceId) sizeArgs.unshift('-s', deviceId);
                            const { stdout: sizeOut } = await execFileAsync('adb', sizeArgs, { timeout: 5000 });
                            let bytes = parseInt(sizeOut.trim());
                            if (isNaN(bytes)) bytes = 0;

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
                        } catch { /* skip */ }
                        return null;
                    });

                    const batchResults = await Promise.all(batchPromises);
                    for (const result of batchResults) if (result) items.push(result);
                }
                console.log(`[storage] Apps complete, found ${items.length} items`);
                break;
            }

            case 'media': {
                console.log('[storage] Media scan started...');
                // Use the EXACT command that worked in the manual test
                // Manual: adb shell "find /storage/emulated/0 -type f \( -iname '*.mp4' -o -iname '*.mkv' -o -iname '*.avi' -o -iname '*.mov' -o -iname '*.jpg' -o -iname '*.png' -o -iname '*.gif' -o -iname '*.mp3' -o -iname '*.wav' -o -iname '*.flac' \) -size +500M -exec du -b {} \; 2>/dev/null"
                const root = '/storage/emulated/0';
                const cmd = `find ${root} -type f \\( -iname '*.mp4' -o -iname '*.mkv' -o -iname '*.avi' -o -iname '*.mov' -o -iname '*.jpg' -o -iname '*.png' -o -iname '*.gif' -o -iname '*.mp3' -o -iname '*.wav' -o -iname '*.flac' \\) -size +500M -exec du -b {} \\; 2>/dev/null`;
                const args = ['shell', cmd];
                if (deviceId) args.unshift('-s', deviceId);
                console.log(`[storage] Executing: adb ${args.join(' ')}`);
                const { stdout, stderr } = await execFileAsync('adb', args, { timeout: 120000, maxBuffer: 100 * 1024 * 1024 });
                console.log(`[storage] Media stdout length: ${stdout.length}`);
                console.log(`[storage] Media stderr length: ${stderr.length}`);
                if (stdout.length > 0) {
                    console.log(`[storage] Media stdout first 500 chars:\n${stdout.substring(0, 500)}`);
                }
                if (stderr.length > 0) {
                    console.log(`[storage] Media stderr first 500 chars:\n${stderr.substring(0, 500)}`);
                }
                const lines = stdout.split(/\r?\n/).filter(line => line.trim() !== '');
                console.log(`[storage] Media lines count: ${lines.length}`);
                if (lines.length > 0) {
                    console.log('[storage] Media first 3 lines:', lines.slice(0, 3));
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!/^\d+/.test(trimmed)) continue; // skip non-numeric lines
                        const parts = trimmed.split(/\s+/);
                        if (parts.length < 2) continue;
                        const bytes = parseInt(parts[0], 10);
                        if (isNaN(bytes)) continue;
                        const path = parts.slice(1).join(' ');
                        if (bytes >= MIN_SIZE_BYTES) {
                            items.push({
                                name: path.split('/').pop() || path,
                                path: path,
                                size: (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB',
                                bytes: bytes
                            });
                        }
                    }
                }
                // If no items found, try /sdcard as fallback
                if (items.length === 0) {
                    console.log('[storage] Media: trying /sdcard fallback');
                    const fallbackRoot = '/sdcard';
                    const fallbackCmd = `find ${fallbackRoot} -type f \\( -iname '*.mp4' -o -iname '*.mkv' -o -iname '*.avi' -o -iname '*.mov' -o -iname '*.jpg' -o -iname '*.png' -o -iname '*.gif' -o -iname '*.mp3' -o -iname '*.wav' -o -iname '*.flac' \\) -size +500M -exec du -b {} \\; 2>/dev/null`;
                    const fallbackArgs = ['shell', fallbackCmd];
                    if (deviceId) fallbackArgs.unshift('-s', deviceId);
                    const { stdout: fallbackOut } = await execFileAsync('adb', fallbackArgs, { timeout: 120000, maxBuffer: 100 * 1024 * 1024 });
                    const fallbackLines = fallbackOut.split(/\r?\n/).filter(line => line.trim() !== '');
                    for (const line of fallbackLines) {
                        const trimmed = line.trim();
                        if (!/^\d+/.test(trimmed)) continue;
                        const parts = trimmed.split(/\s+/);
                        if (parts.length < 2) continue;
                        const bytes = parseInt(parts[0], 10);
                        if (isNaN(bytes)) continue;
                        const path = parts.slice(1).join(' ');
                        if (bytes >= MIN_SIZE_BYTES) {
                            items.push({
                                name: path.split('/').pop() || path,
                                path: path,
                                size: (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB',
                                bytes: bytes
                            });
                        }
                    }
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
                const cmd = `find ${root} -type f -size +500M ! \\( -iname '*.mp4' -o -iname '*.mkv' -o -iname '*.avi' -o -iname '*.mov' -o -iname '*.jpg' -o -iname '*.png' -o -iname '*.gif' -o -iname '*.mp3' -o -iname '*.wav' -o -iname '*.flac' \\) -exec du -b {} \\; 2>/dev/null`;
                const args = ['shell', cmd];
                if (deviceId) args.unshift('-s', deviceId);
                console.log(`[storage] Executing: adb ${args.join(' ')}`);
                const { stdout, stderr } = await execFileAsync('adb', args, { timeout: 120000, maxBuffer: 100 * 1024 * 1024 });
                console.log(`[storage] Other stdout length: ${stdout.length}`);
                console.log(`[storage] Other stderr length: ${stderr.length}`);
                if (stdout.length > 0) {
                    console.log(`[storage] Other stdout first 500 chars:\n${stdout.substring(0, 500)}`);
                }
                if (stderr.length > 0) {
                    console.log(`[storage] Other stderr first 500 chars:\n${stderr.substring(0, 500)}`);
                }
                const lines = stdout.split(/\r?\n/).filter(line => line.trim() !== '');
                console.log(`[storage] Other lines count: ${lines.length}`);
                if (lines.length > 0) {
                    console.log('[storage] Other first 3 lines:', lines.slice(0, 3));
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!/^\d+/.test(trimmed)) continue;
                        const parts = trimmed.split(/\s+/);
                        if (parts.length < 2) continue;
                        const bytes = parseInt(parts[0], 10);
                        if (isNaN(bytes)) continue;
                        const path = parts.slice(1).join(' ');
                        if (bytes >= MIN_SIZE_BYTES) {
                            items.push({
                                name: path.split('/').pop() || path,
                                path: path,
                                size: (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB',
                                bytes: bytes
                            });
                        }
                    }
                }
                if (items.length === 0) {
                    console.log('[storage] Other: trying /sdcard fallback');
                    const fallbackRoot = '/sdcard';
                    const fallbackCmd = `find ${fallbackRoot} -type f -size +500M ! \\( -iname '*.mp4' -o -iname '*.mkv' -o -iname '*.avi' -o -iname '*.mov' -o -iname '*.jpg' -o -iname '*.png' -o -iname '*.gif' -o -iname '*.mp3' -o -iname '*.wav' -o -iname '*.flac' \\) -exec du -b {} \\; 2>/dev/null`;
                    const fallbackArgs = ['shell', fallbackCmd];
                    if (deviceId) fallbackArgs.unshift('-s', deviceId);
                    const { stdout: fallbackOut } = await execFileAsync('adb', fallbackArgs, { timeout: 120000, maxBuffer: 100 * 1024 * 1024 });
                    const fallbackLines = fallbackOut.split(/\r?\n/).filter(line => line.trim() !== '');
                    for (const line of fallbackLines) {
                        const trimmed = line.trim();
                        if (!/^\d+/.test(trimmed)) continue;
                        const parts = trimmed.split(/\s+/);
                        if (parts.length < 2) continue;
                        const bytes = parseInt(parts[0], 10);
                        if (isNaN(bytes)) continue;
                        const path = parts.slice(1).join(' ');
                        if (bytes >= MIN_SIZE_BYTES) {
                            items.push({
                                name: path.split('/').pop() || path,
                                path: path,
                                size: (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB',
                                bytes: bytes
                            });
                        }
                    }
                }
                break;
            }

            default:
                return res.status(400).json({ error: `Unknown category: ${category}` });
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