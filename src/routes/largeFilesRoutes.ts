import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const router = Router();

const MIN_DEFAULT_SIZE_GB = 0.5;
const DEFAULT_TIMEOUT_MS = 120000;
const MAX_BUFFER = 100 * 1024 * 1024;
const APP_BATCH_SIZE = 5;

type LargeFileItem = {
  path: string;
  size: string;
  bytes: number;
  type?: 'file' | 'app';
  packageName?: string;
};

async function runAdbShell(deviceId: string, command: string, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const args = ['shell', command];
  if (deviceId) args.unshift('-s', deviceId);
  const { stdout } = await execFileAsync('adb', args, { timeout: timeoutMs, maxBuffer: MAX_BUFFER });
  return stdout?.toString() || '';
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
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

async function scanStorageRoots(deviceId: string, roots: string[], minSizeMb: number, minSizeBytes: number): Promise<Array<LargeFileItem>> {
  const files: Array<LargeFileItem> = [];
  const seenPaths = new Set<string>();

  for (const root of roots) {
    const command = `find ${root} -type f -size +${minSizeMb}M -printf '%s %p\\0' 2>/dev/null || (find ${root} -type f -size +${minSizeMb}M -exec ls -l {} \\; 2>/dev/null | awk '{size=$5; path=$9; for(i=10;i<=NF;i++) path=path" " $i; print size " " path}')`;
    const stdout = await runAdbShell(deviceId, command);
    if (!stdout) continue;

    const entries = stdout.includes('\0') ? stdout.split('\0') : stdout.split(/\r?\n/);
    for (const entry of entries) {
      const parsed = parseSizePathLine(entry);
      if (!parsed) continue;
      if (parsed.bytes < minSizeBytes) continue;
      if (seenPaths.has(parsed.path)) continue;
      seenPaths.add(parsed.path);
      files.push({ path: parsed.path, size: formatBytes(parsed.bytes), bytes: parsed.bytes, type: 'file' });
    }
  }

  return files;
}

async function scanAppStorage(deviceId: string, minSizeBytes: number): Promise<Array<LargeFileItem>> {
  const files: Array<LargeFileItem> = [];
  const seenPaths = new Set<string>();

  try {
    const listOut = await runAdbShell(deviceId, 'pm list packages -3');
    const packages = listOut
      .split(/\r?\n/)
      .map((line) => line.replace(/^package:/, '').trim())
      .filter(Boolean);

    for (let i = 0; i < packages.length; i += APP_BATCH_SIZE) {
      const batch = packages.slice(i, i + APP_BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(async (pkg): Promise<LargeFileItem | null> => {
        try {
          const pkgPathOut = await runAdbShell(deviceId, `pm path ${pkg}`);
          const apkLine = pkgPathOut.split(/\r?\n/).find((line) => line.startsWith('package:'));
          if (!apkLine) return null;
          const apkPath = apkLine.replace(/^package:/, '').trim();
          if (!apkPath) return null;

          const apkDir = apkPath.substring(0, apkPath.lastIndexOf('/'));
          const dirs = [
            apkDir,
            `/sdcard/Android/data/${pkg}`,
            `/storage/emulated/0/Android/data/${pkg}`,
            `/sdcard/Android/obb/${pkg}`,
            `/storage/emulated/0/Android/obb/${pkg}`,
          ];

          let totalBytes = 0;
          for (const dir of dirs) {
            const out = await runAdbShell(deviceId, `du -sb ${dir} 2>/dev/null | awk '{print $1}'`, 10000).catch(() => '');
            const bytes = parseInt(out.trim(), 10);
            if (!isNaN(bytes) && bytes > 0) totalBytes += bytes;
          }

          if (totalBytes >= minSizeBytes) {
            const path = `package:${pkg}`;
            if (seenPaths.has(path)) return null;
            seenPaths.add(path);
            return { path, packageName: pkg, size: formatBytes(totalBytes), bytes: totalBytes, type: 'app' } as LargeFileItem;
          }
        } catch {
          return null;
        }
        return null;
      }));

      for (const item of batchResults) {
        if (item) files.push(item);
      }
    }
  } catch (error) {
    console.error('scanAppStorage failed:', error);
  }

  return files;
}

router.get('/large-files', async (req, res) => {
  const deviceId = req.query.deviceId as string;
  const minSizeGb = parseFloat(String(req.query.minSize));
  const minSize = !isNaN(minSizeGb) && minSizeGb > 0 ? minSizeGb : MIN_DEFAULT_SIZE_GB;
  const minSizeMb = Math.ceil(minSize * 1024);
  const minSizeBytes = Math.ceil(minSize * 1024 * 1024);

  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId required' });
  }

  try {
    const storageFiles = await scanStorageRoots(deviceId, ['/storage/emulated/0', '/sdcard'], minSizeMb, minSizeBytes);
    const appFiles = await scanAppStorage(deviceId, minSizeBytes);
    const allFiles = [...storageFiles, ...appFiles];
    allFiles.sort((a, b) => b.bytes - a.bytes);
    return res.json({ files: allFiles, count: allFiles.length });
  } catch (err: any) {
    console.error('Large files scan error:', err);
    // Never throw 500 – return empty array with error message
    return res.json({ files: [], count: 0, error: err.message || 'Failed to scan large files' });
  }
});

export default router;