import { Router } from 'express';
import { execFile, exec } from 'node:child_process';
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
                const root = '/storage/emulated/0';
                // Exact command that works manually – with single quotes around patterns
                const cmd = `find ${root} -type f \\( -iname '*.mp4' -o -iname '*.mkv' -o -iname '*.avi' -o -iname '*.mov' -o -iname '*.jpg' -o -iname '*.png' -o -iname '*.gif' -o -iname '*.mp3' -o -iname '*.wav' -o -iname '*.flac' \\) -size +500M -exec du -b {} \\; 2>/dev/null`;
                // Use exec to preserve quoting
                const fullCmd = `adb -s ${deviceId} shell "${cmd}"`;
                console.log(`[storage] Executing full: ${fullCmd}`);
                try {
                    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
                        exec(fullCmd, { timeout: 120000, maxBuffer: 100 * 1024 * 1024 }, (error, stdout, stderr) => {
                            if (error) reject(error);
                            else resolve({ stdout, stderr });
                        });
                    });
                    console.log(`[storage] Media stdout length: ${stdout.length}`);
                    if (stderr) console.log(`[storage] Media stderr: ${stderr}`);
                    const lines = stdout.split(/\r?\n/).filter(line => line.trim() !== '');
                    console.log(`[storage] Media lines count: ${lines.length}`);
                    if (lines.length > 0) {
                        console.log('[storage] Media first 3 lines:', lines.slice(0, 3));
                        for (const line of lines) {
                            const trimmed = line.trim();
                            // Skip permission denied or other error messages
                            if (trimmed.includes('Permission denied') || trimmed.includes('No such file')) continue;
                            // Skip lines that don't start with a number
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
                } catch (err: any) {
                    console.error('[storage] Media exec error:', err.message);
                    // Fallback to /sdcard
                    console.log('[storage] Media: trying /sdcard fallback');
                    const fallbackRoot = '/sdcard';
                    const fallbackCmd = `find ${fallbackRoot} -type f \\( -iname '*.mp4' -o -iname '*.mkv' -o -iname '*.avi' -o -iname '*.mov' -o -iname '*.jpg' -o -iname '*.png' -o -iname '*.gif' -o -iname '*.mp3' -o -iname '*.wav' -o -iname '*.flac' \\) -size +500M -exec du -b {} \\; 2>/dev/null`;
                    const fallbackFullCmd = `adb -s ${deviceId} shell "${fallbackCmd}"`;
                    try {
                        const { stdout } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
                            exec(fallbackFullCmd, { timeout: 120000, maxBuffer: 100 * 1024 * 1024 }, (error, stdout, stderr) => {
                                if (error) reject(error);
                                else resolve({ stdout, stderr });
                            });
                        });
                        const lines = stdout.split(/\r?\n/).filter(line => line.trim() !== '');
                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (trimmed.includes('Permission denied') || trimmed.includes('No such file')) continue;
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
                    } catch (fallbackErr) {
                        console.error('[storage] Media fallback error:', fallbackErr);
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
                const fullCmd = `adb -s ${deviceId} shell "${cmd}"`;
                console.log(`[storage] Executing full: ${fullCmd}`);
                try {
                    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
                        exec(fullCmd, { timeout: 120000, maxBuffer: 100 * 1024 * 1024 }, (error, stdout, stderr) => {
                            if (error) reject(error);
                            else resolve({ stdout, stderr });
                        });
                    });
                    console.log(`[storage] Other stdout length: ${stdout.length}`);
                    if (stderr) console.log(`[storage] Other stderr: ${stderr}`);
                    const lines = stdout.split(/\r?\n/).filter(line => line.trim() !== '');
                    console.log(`[storage] Other lines count: ${lines.length}`);
                    if (lines.length > 0) {
                        console.log('[storage] Other first 3 lines:', lines.slice(0, 3));
                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (trimmed.includes('Permission denied') || trimmed.includes('No such file')) continue;
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
                } catch (err: any) {
                    console.error('[storage] Other exec error:', err.message);
                    console.log('[storage] Other: trying /sdcard fallback');
                    const fallbackRoot = '/sdcard';
                    const fallbackCmd = `find ${fallbackRoot} -type f -size +500M ! \\( -iname '*.mp4' -o -iname '*.mkv' -o -iname '*.avi' -o -iname '*.mov' -o -iname '*.jpg' -o -iname '*.png' -o -iname '*.gif' -o -iname '*.mp3' -o -iname '*.wav' -o -iname '*.flac' \\) -exec du -b {} \\; 2>/dev/null`;
                    const fallbackFullCmd = `adb -s ${deviceId} shell "${fallbackCmd}"`;
                    try {
                        const { stdout } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
                            exec(fallbackFullCmd, { timeout: 120000, maxBuffer: 100 * 1024 * 1024 }, (error, stdout, stderr) => {
                                if (error) reject(error);
                                else resolve({ stdout, stderr });
                            });
                        });
                        const lines = stdout.split(/\r?\n/).filter(line => line.trim() !== '');
                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (trimmed.includes('Permission denied') || trimmed.includes('No such file')) continue;
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
                    } catch (fallbackErr) {
                        console.error('[storage] Other fallback error:', fallbackErr);
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