import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

export const dataRoot = (() => {
  const appData = process.env.APPDATA || process.env.LOCALAPPDATA;
  if (appData) return path.join(appData, 'SmartHubDiagnostics');
  return path.join(process.cwd(), '.smarthub-data');
})();

// When installed via the Windows setup, SMARTHUB_HOME points to the
// application root (e.g. C:\Program Files\SmartHubDiagnostics).
//
// NOTE: Many developer machines have SMARTHUB_HOME set globally for the
// installed build. When running the dev server from a source checkout, we
// must prefer the current workspace root; otherwise the backend will
// accidentally run the *installed* AI scripts and assets.
function looksLikeSourceCheckout(dir: string): boolean {
  try {
    return (
      fsSync.existsSync(path.join(dir, 'package.json')) &&
      fsSync.existsSync(path.join(dir, 'src', 'server.ts'))
    );
  } catch {
    return false;
  }
}

const cwd = process.cwd();
export const appInstallRoot = looksLikeSourceCheckout(cwd) ? cwd : (process.env.SMARTHUB_HOME || cwd);

export const historyPath = path.join(dataRoot, 'history.json');

// Optional Online Assist (cloud/free API) configuration. Stored per-machine.
// WARNING: This file can contain an API key. Prefer environment variables when possible.
export const onlineAiConfigPath = path.join(dataRoot, 'online-ai-config.json');

// SmartLink Host configuration lives alongside other app data.
export const smartLinkConfigPath = path.join(dataRoot, 'smartlink-config.json');

// Store screen-test screenshots inside the published Windows app folder so
// they travel with the desktop application.
export const screenTestsRoot = path.join(appInstallRoot, 'screenshot');

// Legacy APK cache directory used by older builds. We no longer write
// APKs here, but keep the path so we can clean up any existing
// left-over files on startup.
export const apkCacheDir = path.join(dataRoot, 'apk-cache');

export function ensureServerDataDirs(): void {
  // Ensure base data folders exist (best-effort; ignore errors)
  fs.mkdir(dataRoot, { recursive: true }).catch(() => {
    // eslint-disable-next-line no-console
    console.error('Failed to ensure dataRoot directory');
  });
  fs.mkdir(screenTestsRoot, { recursive: true }).catch(() => {
    // eslint-disable-next-line no-console
    console.error('Failed to ensure screenTestsRoot directory');
  });

  // Best-effort removal of the legacy APK cache directory on startup so
  // it no longer consumes disk space on the host machine.
  fs.rm(apkCacheDir, { recursive: true, force: true }).catch(() => {
    // eslint-disable-next-line no-console
    console.error('Failed to remove legacy apk-cache directory');
  });
}
