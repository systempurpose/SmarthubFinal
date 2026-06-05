import type { Express, Request, Response } from 'express';
import { detectBsodOsCorruptionWindowsUsb } from '../bsod/osCorruptionWindows/detect';

export function registerBsodRoutes(app: Express) {
  app.post('/api/bsod/diagnose', async (req: Request, res: Response) => {
    const { adbDeviceId, fastbootDeviceId } = req.body;

    try {
      // Call your existing detection function
      const osCorruptionReport = await detectBsodOsCorruptionWindowsUsb({
        adbDeviceId: adbDeviceId as string,
        fastbootDeviceId: fastbootDeviceId as string,
        timeoutMs: 20000,
      });

      // Determine the final cause based on the report
      let cause = "Not a BSOD";
      let confidence = osCorruptionReport.confidence;
      let score = osCorruptionReport.score0to100;
      let detail = osCorruptionReport.summary;

      if (score && score >= 60) {
        cause = "OS corruption or crash loop detected";
      } else if (score && score >= 40) {
        cause = "Likely OS instability, possibly from 3rd party apps";
      } else if (osCorruptionReport.skipped) {
        cause = "Skipped (no ADB/fastboot device)";
      }

      res.json({
        ok: true,
        diagnosis: {
          cause,
          confidence,
          score,
          detail,
          signals: osCorruptionReport.signals,
        }
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });
}