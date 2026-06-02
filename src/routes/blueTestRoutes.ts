import type { Express, Request, Response } from 'express';
import { adb, battery, memoryInfo, sensors } from '../adb';
import { pickPrimaryDeviceId } from '../serverContext';

function sanitizeDeviceId(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 128) return undefined;
  // Reject whitespace/control characters.
  if (/\s/.test(trimmed)) return undefined;
  return trimmed;
}

async function resolveTargetDeviceId(req: Request): Promise<string | undefined> {
  const q = sanitizeDeviceId((req.query as any)?.id);
  const b = sanitizeDeviceId((req.body as any)?.id) || sanitizeDeviceId((req.body as any)?.deviceId);
  return q || b || (await pickPrimaryDeviceId()) || undefined;
}

async function setMediaVolumeToMax(deviceId: string): Promise<{ max: number; current?: number } | null> {
  // Try to discover the max from `--get` output: "volume is X in range [0..Y]".
  // Then set it via `--set Y`.
  try {
    const getOut = await adb('-s', deviceId, 'shell', 'cmd', 'media_session', 'volume', '--stream', '3', '--get');
    const current = Number(getOut.match(/volume is\s+(\d+)/i)?.[1]);
    const max = Number(getOut.match(/range\s*\[\s*0\s*\.\.\s*(\d+)\s*\]/i)?.[1]);
    const maxIndex = Number.isFinite(max) ? max : 15;
    await adb(
      '-s',
      deviceId,
      'shell',
      'cmd',
      'media_session',
      'volume',
      '--show',
      '--stream',
      '3',
      '--set',
      String(maxIndex),
    );
    return { max: maxIndex, current: Number.isFinite(current) ? current : undefined };
  } catch {
    return null;
  }
}

async function tryVibrateViaCmd(deviceId: string): Promise<boolean> {
  // Uses vibrator_manager when available (Android 12+ typically).
  try {
    await adb(
      '-s',
      deviceId,
      'shell',
      'cmd',
      'vibrator_manager',
      'synced',
      '-f',
      '-B',
      'oneshot',
      '-a',
      '250',
      '180',
    );
    return true;
  } catch {
    return false;
  }
}

export function registerBlueTestRoutes(app: Express): void {
  // Simple interactive tests for blue/blank-screen triage. These require at
  // least one device visible to ADB (USB debugging + trust prompt enabled).

  app.post('/blue-test/volume-max', async (req: Request, res: Response) => {
    const id = await resolveTargetDeviceId(req);
    if (!id) {
      return res.status(400).json({
        ok: false,
        error: 'No phone is visible to ADB. This test requires USB debugging to be ON and trusted.',
      });
    }

    const result = await setMediaVolumeToMax(id);
    if (!result) {
      return res.status(500).json({
        ok: false,
        error: 'Could not control media volume via ADB on this device.',
      });
    }

    const before = typeof result.current === 'number' ? ` (was ${result.current}/${result.max})` : '';
    return res.json({
      ok: true,
      message: `Media volume set to maximum${before}.`,
      volume: { stream: 'STREAM_MUSIC', max: result.max, previous: result.current },
    });
  });

  app.post('/blue-test/flash', async (req: Request, res: Response) => {
    const id = await resolveTargetDeviceId(req);
    if (!id) {
      return res.status(400).json({
        ok: false,
        error: 'No phone is visible to ADB. This test requires USB debugging to be ON and trusted.',
      });
    }

    try {
      await adb(
        '-s',
        id,
        'shell',
        'am',
        'start',
        '-n',
        'com.smarthub.diagnostics/.TestRunnerActivity',
        '--es',
        'test',
        'flash',
      );
      return res.json({
        ok: true,
        message: 'Flashlight test started via SmartHub mobile app. Ask if the LED turned on briefly.',
      });
    } catch (e: any) {
      const raw = `${e?.message || ''}`;
      if (
        raw.includes("Can't find service: torch") ||
        raw.includes('cmd: No service specified; use -l to list all running services')
      ) {
        return res.json({
          ok: true,
          message:
            'Flashlight test could not be triggered via the mobile app. Ask the user to turn the flashlight on/off manually and report whether it works.',
        });
      }

      const msg = e?.message || 'Failed to start flashlight test via ADB.';
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post('/blue-test/vibrate', async (req: Request, res: Response) => {
    const id = await resolveTargetDeviceId(req);
    if (!id) {
      return res.status(400).json({
        ok: false,
        error: 'No phone is visible to ADB. This test requires USB debugging to be ON and trusted.',
      });
    }

    // Prefer an ADB-only vibration so this works even if the mobile test app
    // is not installed or not responding.
    if (await tryVibrateViaCmd(id)) {
      return res.json({
        ok: true,
        message: 'Triggered vibration via ADB (vibrator_manager). Ask if it was felt.',
      });
    }

    try {
      await adb(
        '-s',
        id,
        'shell',
        'am',
        'start',
        '-n',
        'com.smarthub.diagnostics/.TestRunnerActivity',
        '--es',
        'test',
        'vibrate',
      );
      return res.json({
        ok: true,
        message: 'Vibration test started via SmartHub mobile app. Ask if the customer felt it.',
      });
    } catch (e: any) {
      const raw = `${e?.message || ''}`;
      if (raw.includes("Can't find service: vibrator")) {
        return res.json({
          ok: true,
          message:
            'Vibration test could not be triggered via the mobile app. Ask the user to press the power or volume keys and confirm whether the phone vibrates.',
        });
      }

      const msg = e?.message || 'Failed to start vibration test via ADB.';
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post('/blue-test/sound', async (req: Request, res: Response) => {
    const id = await resolveTargetDeviceId(req);
    if (!id) {
      return res.status(400).json({
        ok: false,
        error: 'No phone is visible to ADB. This test requires USB debugging to be ON and trusted.',
      });
    }

    try {
      // Ensure media volume is high enough before attempting speaker test.
      await setMediaVolumeToMax(id);

      await adb(
        '-s',
        id,
        'shell',
        'am',
        'start',
        '-n',
        'com.smarthub.diagnostics/.TestRunnerActivity',
        '--es',
        'test',
        'sound',
      );
      return res.json({
        ok: true,
        message: 'Speaker test started via SmartHub mobile app. Ask if a clear tone was heard.',
      });
    } catch (e: any) {
      const raw = `${e?.message || ''}`;
      if (/Activity class .* does not exist|Error: Activity not started|does not exist\./i.test(raw)) {
        return res.json({
          ok: true,
          message:
            'Media volume was set to maximum, but the SmartHub sound test screen could not be opened. Ask the user to play any audio (ringtone, YouTube, music) to confirm the speaker works.',
        });
      }

      const msg = e?.message || 'Failed to start speaker test via ADB.';
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post('/blue-test/touch', async (req: Request, res: Response) => {
    const id = await resolveTargetDeviceId(req);
    if (!id) {
      return res.status(400).json({
        ok: false,
        error: 'No phone is visible to ADB. This test requires USB debugging to be ON and trusted.',
      });
    }

    try {
      await adb(
        '-s',
        id,
        'shell',
        'am',
        'start',
        '-n',
        'com.smarthub.diagnostics/.TestRunnerActivity',
        '--es',
        'test',
        'touch',
      );
      return res.json({
        ok: true,
        message:
          'Touch-screen test started via SmartHub mobile app. Ask the user to drag and tap across the whole screen and report any dead areas.',
      });
    } catch (e: any) {
      const msg = e?.message || 'Failed to start touch-screen test via ADB.';
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post('/blue-test/wake', async (req: Request, res: Response) => {
    const id = await resolveTargetDeviceId(req);
    if (!id) {
      return res.status(400).json({
        ok: false,
        error: 'No phone is visible to ADB. This test requires USB debugging to be ON and trusted.',
      });
    }

    try {
      await adb('-s', id, 'shell', 'input', 'keyevent', '26');
      return res.json({
        ok: true,
        message: 'Sent a power-key press to wake or toggle the screen. Check if the display or backlight reacted.',
      });
    } catch (e: any) {
      const msg = e?.message || 'Failed to send power key via ADB.';
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post('/test/sensors', async (req: Request, res: Response) => {
    const id = await resolveTargetDeviceId(req);
    if (!id) {
      return res.status(400).json({
        ok: false,
        error: 'No phone is visible to ADB. This test requires USB debugging to be ON and trusted.',
      });
    }

    try {
      const dump = await sensors(id);
      const hasAccelerometer = /accelerometer/i.test(dump);
      const hasProximity = /proximity/i.test(dump);
      const hasLight = /light sensor|als sensor|ambient light/i.test(dump);
      const hasGyro = /gyroscope|gyro/i.test(dump);

      const summaryParts: string[] = [];
      if (hasAccelerometer) summaryParts.push('accelerometer');
      if (hasProximity) summaryParts.push('proximity');
      if (hasLight) summaryParts.push('light');
      if (hasGyro) summaryParts.push('gyroscope');

      const message = summaryParts.length
        ? `Reported sensors: ${summaryParts.join(', ')}. Move and tilt the phone near the ear and bright light to confirm they react as expected.`
        : 'No standard motion/proximity/light sensors were reported in dumpsys. This may be a basic device or the sensor service is failing.';

      return res.json({
        ok: true,
        sensors: {
          hasAccelerometer,
          hasProximity,
          hasLight,
          hasGyro,
        },
        message,
      });
    } catch (e: any) {
      const msg = e?.message || 'Failed to query sensors via ADB.';
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post('/test/health', async (req: Request, res: Response) => {
    const id = await resolveTargetDeviceId(req);
    if (!id) {
      return res.status(400).json({
        ok: false,
        error: 'No phone is visible to ADB. This test requires USB debugging to be ON and trusted.',
      });
    }

    try {
      const [batDump, memDump] = await Promise.all([battery(id), memoryInfo(id)]);

      const levelMatch = batDump.match(/level:\s*(\d+)/i);
      const tempMatch = batDump.match(/temperature:\s*(\d+)/i);
      const healthMatch = batDump.match(/health:\s*([^\r\n]+)/i);
      const voltageMatch = batDump.match(/voltage:\s*(\d+)/i);

      const level = levelMatch ? Number(levelMatch[1]) : undefined;
      const tempRaw = tempMatch ? Number(tempMatch[1]) : undefined;
      const tempC = typeof tempRaw === 'number' && !Number.isNaN(tempRaw) ? tempRaw / 10 : undefined;
      const normalizeBatteryHealth = (raw?: string): string | undefined => {
        if (!raw) return undefined;
        const token = raw.trim().split(/\s+/)[0];
        if (!token) return undefined;
        const asNum = Number(token);
        if (!Number.isNaN(asNum) && Number.isFinite(asNum)) {
          switch (asNum) {
            case 1:
              return 'Unknown';
            case 2:
              return 'Good';
            case 3:
              return 'Overheat';
            case 4:
              return 'Dead';
            case 5:
              return 'Over-voltage';
            case 6:
              return 'Failure';
            case 7:
              return 'Cold';
            default:
              return 'Unknown';
          }
        }
        return token;
      };

      const health = normalizeBatteryHealth(healthMatch?.[1]);
      const voltageMv = voltageMatch ? Number(voltageMatch[1]) : undefined;

      const memTotalMatch = memDump.match(/MemTotal:\s*(\d+)\s*kB/i);
      const memAvailMatch = memDump.match(/MemAvailable:\s*(\d+)\s*kB/i);
      const memFreeMatch = memDump.match(/MemFree:\s*(\d+)\s*kB/i);

      const totalKb = memTotalMatch ? Number(memTotalMatch[1]) : undefined;
      const availKb = memAvailMatch ? Number(memAvailMatch[1]) : memFreeMatch ? Number(memFreeMatch[1]) : undefined;

      const totalGb = totalKb ? Math.round((totalKb / (1024 * 1024)) * 10) / 10 : undefined;
      const availGb = availKb ? Math.round((availKb / (1024 * 1024)) * 10) / 10 : undefined;

      const batteryInfo: any = {};
      if (typeof level === 'number' && !Number.isNaN(level)) batteryInfo.levelPercent = level;
      if (typeof tempC === 'number' && !Number.isNaN(tempC)) batteryInfo.temperatureC = tempC;
      if (health) batteryInfo.health = health;
      if (typeof voltageMv === 'number' && !Number.isNaN(voltageMv)) batteryInfo.voltageMv = voltageMv;

      const memoryInfoSummary: any = {};
      if (typeof totalGb === 'number' && !Number.isNaN(totalGb)) memoryInfoSummary.totalGb = totalGb;
      if (typeof availGb === 'number' && !Number.isNaN(availGb)) memoryInfoSummary.freeGbApprox = availGb;

      let message = 'Battery and memory snapshot collected.';
      const extraParts: string[] = [];
      if (batteryInfo.levelPercent !== undefined) extraParts.push(`battery ${batteryInfo.levelPercent}%`);
      if (batteryInfo.temperatureC !== undefined) extraParts.push(`temp ${batteryInfo.temperatureC.toFixed(1)}°C`);
      if (batteryInfo.health) extraParts.push(`health ${batteryInfo.health}`);
      if (memoryInfoSummary.totalGb !== undefined) extraParts.push(`RAM ~${memoryInfoSummary.totalGb} GB total`);
      if (memoryInfoSummary.freeGbApprox !== undefined) extraParts.push(`~${memoryInfoSummary.freeGbApprox} GB free`);

      if (extraParts.length) {
        message = 'Battery & memory: ' + extraParts.join(', ') + '.';
      }

      return res.json({ ok: true, battery: batteryInfo, memory: memoryInfoSummary, message });
    } catch (e: any) {
      const msg = e?.message || 'Failed to collect battery/memory info via ADB.';
      return res.status(500).json({ ok: false, error: msg });
    }
  });
}
