/**
 * App Behavior Tracking
 * Extracts historical behavior data for an app via ADB
 */

import { adb } from './adb';

export interface PermissionAccess {
  permission: string;
  lastAccessTime: string;
  accessCount?: number;
}

export interface AppBehavior {
  packageName: string;
  installTime: string;
  updateTime: string;
  lastUsed: string;
  totalForegroundTime: string;
  permissionAccesses: PermissionAccess[];
}

/**
 * Extract package installation and update times
 */
async function getPackageInfo(deviceId: string, packageName: string): Promise<{ installTime: string; updateTime: string }> {
  try {
    const output = await adb('-s', deviceId, 'shell', `dumpsys package ${packageName}`);
    const installMatch = output.match(/firstInstallTime=(.+?)\n/);
    const updateMatch = output.match(/lastUpdateTime=(.+?)\n/);

    return {
      installTime: installMatch ? installMatch[1].trim() : 'Unknown',
      updateTime: updateMatch ? updateMatch[1].trim() : 'Unknown'
    };
  } catch (err) {
    console.error(`Error getting package info for ${packageName}:`, err);
    return { installTime: 'Unknown', updateTime: 'Unknown' };
  }
}

/**
 * Extract usage statistics (last used time and total foreground time)
 */
async function getUsageStats(deviceId: string, packageName: string): Promise<{ lastUsed: string; totalTime: string }> {
  try {
    const output = await adb('-s', deviceId, 'shell', 'dumpsys usagestats');
    const lines = output.split('\n');
    let lastUsed = 'Never';
    let totalForegroundMs = 0;
    let inAppBlock = false;

    for (const line of lines) {
      if (line.includes(`pkg=${packageName}`)) {
        inAppBlock = true;
      }

      if (inAppBlock && line.includes('mLastTimeUsed=')) {
        const match = line.match(/mLastTimeUsed=(\d+)/);
        if (match) {
          const timestamp = parseInt(match[1]);
          lastUsed = new Date(timestamp).toLocaleString();
        }
      }

      if (inAppBlock && line.includes('mTotalTimeInForeground=')) {
        const match = line.match(/mTotalTimeInForeground=(\d+)/);
        if (match) {
          totalForegroundMs = parseInt(match[1]);
        }
      }

      if (inAppBlock && line.trim() === '}') {
        inAppBlock = false;
      }
    }

    const totalForegroundSec = Math.round(totalForegroundMs / 1000);
    const totalForegroundStr = totalForegroundSec > 0 ? `${totalForegroundSec} seconds (~${Math.round(totalForegroundSec / 60)} min)` : 'None';

    return { lastUsed, totalTime: totalForegroundStr };
  } catch (err) {
    console.error(`Error getting usage stats for ${packageName}:`, err);
    return { lastUsed: 'Unknown', totalTime: 'Unknown' };
  }
}

/**
 * Extract permission access history via appops
 */
async function getPermissionAccessHistory(deviceId: string, packageName: string): Promise<PermissionAccess[]> {
  try {
    const output = await adb('-s', deviceId, 'shell', `dumpsys appops ${packageName}`);
    const lines = output.split('\n');
    const accesses: PermissionAccess[] = [];
    const seenPerms = new Set<string>();

    for (const line of lines) {
      // Match permission access entries with timestamps
      // Format variations: "ACCESS_FINE_LOCATION: 0; 1: 2025-10-15 14:23:10"
      // or "READ_SMS: 0; 1: 1602750190000"
      const permMatch = line.match(/^\s+(\w+):/);
      if (permMatch && !seenPerms.has(permMatch[1])) {
        const perm = permMatch[1];
        seenPerms.add(perm);

        // Try to extract timestamp
        const tsMatch = line.match(/;\s+\d+:\s+(\d+)/);
        let lastAccessTime = 'Never';

        if (tsMatch) {
          const timestamp = parseInt(tsMatch[1]);
          // Check if it's a millisecond timestamp (13+ digits)
          if (timestamp > 10000000000) {
            lastAccessTime = new Date(timestamp).toLocaleString();
          } else {
            lastAccessTime = new Date(timestamp * 1000).toLocaleString();
          }
        }

        accesses.push({
          permission: perm,
          lastAccessTime: lastAccessTime
        });
      }
    }

    return accesses;
  } catch (err) {
    console.error(`Error getting permission access history for ${packageName}:`, err);
    return [];
  }
}

/**
 * Get complete app behavior profile
 */
export async function getAppBehavior(deviceId: string, packageName: string): Promise<AppBehavior> {
  const pkgInfo = await getPackageInfo(deviceId, packageName);
  const usage = await getUsageStats(deviceId, packageName);
  const permAccesses = await getPermissionAccessHistory(deviceId, packageName);

  return {
    packageName,
    installTime: pkgInfo.installTime,
    updateTime: pkgInfo.updateTime,
    lastUsed: usage.lastUsed,
    totalForegroundTime: usage.totalTime,
    permissionAccesses: permAccesses
  };
}
