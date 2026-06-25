import { Router } from 'express';
import { execFile, exec } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const router = Router();

const MIN_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB
const BATCH_SIZE = 5;
const MEDIA_EXTENSIONS = ['mp4', 'mkv', 'avi', 'mov', 'jpg', 'png', 'gif', 'mp3', 'wav', 'flac'];

function buildExtensionClause(include = true) {
    const patterns = MEDIA_EXTENSIONS.map(ext => `-iname '*.${ext}'`).join(' -o ');
    return include ? `\( ${patterns} \)` : `-not \( ${patterns} \)`;
}

function parseFindOutput(output: string) {
    if (!output) return [] as string[];
    if (output.includes('\0')) {
        return output.split('\0').filter(line => line.trim() !== '');
    }
    return output.split(/\r?\n/).filter(line => line.trim() !== '');
}

function parseSizePathLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return null;
    const firstSpace = trimmed.indexOf(' ');
    if (firstSpace === -1) return null;
    const sizePart = trimmed.substring(0, firstSpace);
    const path = trimmed.substring(firstSpace + 1).trim();
    const bytes = parseInt(sizePart, 10);
    if (isNaN(bytes) || !path) return null;
    return { bytes, path };
}

async function runAdbShell(deviceId: string, command: string, timeoutMs = 120000, maxBuffer = 100 * 1024 * 1024) {
    const args = ['shell', command];
    if (deviceId) args.unshift('-s', deviceId);
    return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        execFile('adb', args, { timeout: timeoutMs, maxBuffer }, (error, stdout, stderr) => {
            if (error && !stdout && !stderr) {
                reject(error);
            } else {
                resolve({ stdout: stdout?.toString() || '', stderr: stderr?.toString() || '' });
            }
        });
    });
}

async function scanFilesWithFind(deviceId: string, root: string, includeMedia: boolean) {
    const extensionClause = buildExtensionClause(includeMedia);
    const findCommand = `find ${root} -type f ${extensionClause} -size +500M -printf '%s %p\\0' 2>/dev/null || (find ${root} -type f ${extensionClause} -size +500M -exec ls -l {} \; 2>/dev/null | awk '{size=$5; path=$9; for(i=10;i<=NF;i++) path=path" " $i; print size" "path}')`;

    const { stdout, stderr } = await runAdbShell(deviceId, findCommand);
    const lines = parseFindOutput(stdout);
    const items: Array<{ name: string; path: string; size: string; bytes: number }> = [];
    const seenPaths = new Set<string>();

    for (const line of lines) {
        const parsed = parseSizePathLine(line);
        if (!parsed) continue;
        if (parsed.bytes < MIN_SIZE_BYTES) continue;
        const name = parsed.path.split('/').pop() || parsed.path;
        if (seenPaths.has(parsed.path)) continue;
        seenPaths.add(parsed.path);
        items.push({
            name,
            path: parsed.path,
            size: (parsed.bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB',
            bytes: parsed.bytes
        });
    }

    if (stderr && stderr.trim().length > 0) {
        console.log(`[storage] scanFilesWithFind stderr for root=${root} includeMedia=${includeMedia}: ${stderr.substring(0, 1000)}`);
    }

    return items;
}

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
                // ... (keep your existing apps logic – unchanged)
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
                const primaryMedia = await scanFilesWithFind(deviceId, '/storage/emulated/0', true).catch(err => {
                    console.error('[storage] Media primary scan error:', err);
                    return [] as any[];
                });
                items.push(...primaryMedia);

                if (items.length === 0) {
                    console.log('[storage] Media: No items found from primary root. Trying /sdcard fallback...');
                    const fallbackMedia = await scanFilesWithFind(deviceId, '/sdcard', true).catch(err => {
                        console.error('[storage] Media fallback scan error:', err);
                        return [] as any[];
                    });
                    items.push(...fallbackMedia);
                }

                console.log(`[storage] Media complete, found ${items.length} items`);
                break;
            }

            case 'system': {
                items = [{ name: 'System data (not individually listed)', size: 'N/A', bytes: 0 }];
                break;
            }

            case 'other': {
                console.log('[storage] Other scan started...');
                const primaryOther = await scanFilesWithFind(deviceId, '/storage/emulated/0', false).catch(err => {
                    console.error('[storage] Other primary scan error:', err);
                    return [] as any[];
                });
                items.push(...primaryOther);

                if (items.length === 0) {
                    console.log('[storage] Other: No items found from primary root. Trying /sdcard fallback...');
                    const fallbackOther = await scanFilesWithFind(deviceId, '/sdcard', false).catch(err => {
                        console.error('[storage] Other fallback scan error:', err);
                        return [] as any[];
                    });
                    items.push(...fallbackOther);
                }

                console.log(`[storage] Other complete, found ${items.length} items`);
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
