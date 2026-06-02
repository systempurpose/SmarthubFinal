import type { Express, Request, Response } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { adb, adbWithLimits } from '../adb';
import { appInstallRoot, pickPrimaryDeviceId } from '../serverContext';

export function registerInstallRoutes(app: Express): void {
  // Install a local APK onto the primary ADB-visible device.
  app.post('/install-app', async (req: Request, res: Response) => {
    const id = await pickPrimaryDeviceId();
    if (!id) {
      return res.status(400).json({
        ok: false,
        error: 'No phone is visible to ADB. This action requires USB debugging to be ON and trusted.',
      });
    }

    const body = req.body || {};
    const bodyPath = typeof (body as any).apkPath === 'string' ? (body as any).apkPath.trim() : '';
    const candidatePaths: string[] = [];

    // 1. Explicit path from the request body.
    if (bodyPath) {
      candidatePaths.push(bodyPath);
      // If the path is relative, also try resolving it from the
      // SmartHub installation root so calls from the packaged Windows
      // app can use paths like "3rdpartyApp/app.apk".
      if (!path.isAbsolute(bodyPath)) {
        candidatePaths.push(path.join(appInstallRoot, bodyPath));
      }
    }

    // 2. Explicit override from environment.
    if (process.env.INSTALL_APK_PATH) candidatePaths.push(process.env.INSTALL_APK_PATH);

    // 3. Repository-root relative paths (development mode, when the server
    //    is running from the project root).
    candidatePaths.push(path.join(process.cwd(), '3rdpartyApp', 'app.apk'));
    candidatePaths.push(
      path.join(process.cwd(), 'android-app', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
    );

    // 4. Installed app layout: look relative to the SmartHub installation
    //    root, which is provided to the backend via SMARTHUB_HOME /
    //    SMART_HUB_HOME.
    const home = process.env.SMARTHUB_HOME || process.env.SMART_HUB_HOME || appInstallRoot;
    if (home) {
      candidatePaths.push(path.join(home, '3rdpartyApp', 'app.apk'));
    }

    // Pick the newest APK among candidates (prevents installing an old
    // packaged APK when a fresh debug build exists).
    const seen = new Set<string>();
    let apkPath: string | undefined;
    let apkMtime = -1;
    for (const raw of candidatePaths) {
      const p = raw.trim();
      if (!p) continue;
      if (seen.has(p)) continue;
      seen.add(p);
      try {
        const st = await fs.stat(p);
        if (!st.isFile()) continue;
        if (st.size <= 0) continue;
        if (st.mtimeMs > apkMtime) {
          apkMtime = st.mtimeMs;
          apkPath = p;
        }
      } catch {
        // try next candidate
      }
    }

    if (!apkPath) {
      return res.status(500).json({
        ok: false,
        error:
            'APK file not found. Build the Android app (debug APK) or place an APK at one of: body.apkPath, INSTALL_APK_PATH, 3rdpartyApp/app.apk, or android-app/app/build/outputs/apk/debug/app-debug.apk.',
      });
    }

    try {
      const out = await adbWithLimits(['-s', id, 'install', '-r', apkPath], {
        attempts: 5,
        timeoutMs: 180_000,
        maxBufferBytes: 8 * 1024 * 1024,
      });
      const installMessage = (out || '').trim() || 'App installation completed.';

      // Best-effort: automatically launch the diagnostics app on the phone
      // after a successful install so the technician sees it immediately.
      let launchOk = false;
      let launchMessage: string | undefined;

      // Prefer a direct am start on the main activity; fall back to monkey
      // if that fails. Only mark launchOk=true when the command succeeds.
      try {
        const launchOut = await adb(
          '-s',
          id,
          'shell',
          'am',
          'start',
          '-a',
          'android.intent.action.MAIN',
          '-c',
          'android.intent.category.LAUNCHER',
          '-n',
          'com.smarthub.diagnostics/.MainActivity',
        );
        launchOk = true;
        launchMessage = (launchOut || '').trim();
      } catch (primaryErr: any) {
        try {
          const monkeyOut = await adb(
            '-s',
            id,
            'shell',
            'monkey',
            '-p',
            'com.smarthub.diagnostics',
            '-c',
            'android.intent.category.LAUNCHER',
            '1',
          );
          launchOk = true;
          launchMessage = (monkeyOut || '').trim();
        } catch (launchErr: any) {
          launchOk = false;
          launchMessage =
            launchErr?.message || primaryErr?.message || 'Failed to auto-launch diagnostics app after install.';
        }
      }

      return res.json({ ok: true, deviceId: id, apkPath, message: installMessage, launchOk, launchMessage });
    } catch (e: any) {
      const msg = e?.message || 'Failed to install APK via ADB.';
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  // Install the Android SmartLink Agent APK onto the primary device.
  app.post('/install-smartlink-app', async (req: Request, res: Response) => {
    const id = await pickPrimaryDeviceId();
    if (!id) {
      return res.status(400).json({
        ok: false,
        error: 'No phone is visible to ADB. This action requires USB debugging to be ON and trusted.',
      });
    }

    const body = req.body || {};
    const bodyPath = typeof (body as any).apkPath === 'string' ? (body as any).apkPath.trim() : '';
    const candidatePaths: string[] = [];

    // 1. Explicit path from the request body (e.g. dev builds under
    //    android-smartlink/app/build/...).
    if (bodyPath) {
      candidatePaths.push(bodyPath);
      if (!path.isAbsolute(bodyPath)) {
        candidatePaths.push(path.join(appInstallRoot, bodyPath));
      }
    }

    // 2. Environment override specifically for SmartLink if provided.
    if (process.env.INSTALL_SMARTLINK_APK_PATH) {
      candidatePaths.push(process.env.INSTALL_SMARTLINK_APK_PATH);
    }

    // 3. Dev layout: SmartLink debug APK built from the android-smartlink
    //    project when running from the repo root.
    candidatePaths.push(
      path.join(process.cwd(), 'android-smartlink', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
    );

    // 4. Installed layout: SmartLink APK bundled under 3rdpartyApp.
    const homeSmartLink = process.env.SMARTHUB_HOME || process.env.SMART_HUB_HOME || appInstallRoot;
    candidatePaths.push(path.join(homeSmartLink, '3rdpartyApp', 'smartlink.apk'));
    candidatePaths.push(path.join(homeSmartLink, '3rdpartyApp', 'app-debug.apk'));

    let apkPath: string | undefined;
    for (const p of candidatePaths) {
      try {
        await fs.access(p);
        apkPath = p;
        break;
      } catch {
        // try next candidate
      }
    }

    if (!apkPath) {
      return res.status(500).json({
        ok: false,
        error:
          'SmartLink APK file not found. Place it as 3rdpartyApp/smartlink.apk (preferred) or 3rdpartyApp/app-debug.apk under the SmartHub installation folder, or provide body.apkPath / INSTALL_SMARTLINK_APK_PATH.',
      });
    }

    try {
      const out = await adbWithLimits(['-s', id, 'install', '-r', apkPath], {
        attempts: 5,
        timeoutMs: 180_000,
        maxBufferBytes: 8 * 1024 * 1024,
      });
      const message = (out || '').trim() || 'SmartLink app installation completed.';
      return res.json({ ok: true, deviceId: id, apkPath, message });
    } catch (e: any) {
      const msg = e?.message || 'Failed to install SmartLink APK via ADB.';
      return res.status(500).json({ ok: false, error: msg });
    }
  });
}
