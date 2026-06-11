// src/appBehavior.ts
import { execAdb } from './adb';

export interface AppBehavior {
  packageName: string;
  installTime: string;
  updateTime: string;
  lastUsed: string;
  totalForegroundTime: string;
  permissionAccesses: { permission: string; lastAccessTime: string }[];
}

// Parse human-readable date (e.g., "2024-12-05 23:43:07") or timestamp
function parseDateString(dateStr: string): string {
  if (!dateStr || dateStr === '0' || dateStr === 'null') return 'Unknown';
  // If it's a number, treat as timestamp
  if (/^\d+$/.test(dateStr)) {
    let ms = parseInt(dateStr);
    if (ms < 10000000000) ms *= 1000;
    if (ms > 0) return new Date(ms).toLocaleString();
  }
  // If it's already a readable date, return as is
  if (dateStr.match(/\d{4}-\d{2}-\d{2}/)) return dateStr;
  return 'Unknown';
}

async function getPackageInfo(deviceId: string, packageName: string): Promise<{ installTime: string; updateTime: string }> {
  try {
    const output = await execAdb(deviceId, `shell dumpsys package ${packageName}`);
    // Match lines like "firstInstallTime=2024-12-05 23:43:07"
    const installMatch = output.match(/firstInstallTime[=:]\s*([^\s]+(?:\s+[^\s]+)?)/i);
    const updateMatch = output.match(/lastUpdateTime[=:]\s*([^\s]+(?:\s+[^\s]+)?)/i);
    return {
      installTime: installMatch ? parseDateString(installMatch[1]) : 'Unknown',
      updateTime: updateMatch ? parseDateString(updateMatch[1]) : 'Unknown'
    };
  } catch (err) {
    return { installTime: 'Unknown', updateTime: 'Unknown' };
  }
}

async function getUsageStats(deviceId: string, packageName: string): Promise<{ lastUsed: string; totalTime: string }> {
  // Many devices don't expose usage stats, so we silently return "Not available"
  return { lastUsed: 'Not available (device does not provide usage stats)', totalTime: 'Not available' };
}

async function getPermissionAccessHistory(deviceId: string, packageName: string): Promise<{ permission: string; lastAccessTime: string }[]> {
  try {
    const output = await execAdb(deviceId, `shell appops get ${packageName}`);
    const accesses: { permission: string; lastAccessTime: string }[] = [];
    const lines = output.split('\n');
    for (const line of lines) {
      // Lines format: "COARSE_LOCATION: ignore" (no timestamp)
      const match = line.match(/^(\w+):\s+(\w+)/);
      if (match && match[2] !== 'ignore') {
        // Only record if mode is not 'ignore' (meaning it was allowed or denied)
        accesses.push({
          permission: match[1],
          lastAccessTime: 'No timestamp recorded (mode: ' + match[2] + ')'
        });
      } else if (match && match[2] === 'ignore') {
        // We can still show that the app never requested it
        accesses.push({
          permission: match[1],
          lastAccessTime: 'Never requested (ignore)'
        });
      }
    }
    // If no interesting entries, return empty array
    return accesses;
  } catch (err) {
    return [];
  }
}

export async function getAppBehavior(deviceId: string, packageName: string): Promise<AppBehavior> {
  const [pkgInfo, usage, permAccesses] = await Promise.all([
    getPackageInfo(deviceId, packageName),
    getUsageStats(deviceId, packageName),
    getPermissionAccessHistory(deviceId, packageName)
  ]);
  
  return {
    packageName,
    installTime: pkgInfo.installTime,
    updateTime: pkgInfo.updateTime,
    lastUsed: usage.lastUsed,
    totalForegroundTime: usage.totalTime,
    permissionAccesses: permAccesses
  };
}