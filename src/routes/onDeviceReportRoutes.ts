import type { Express, Request, Response } from 'express';
import { loadOnDeviceReport } from '../onDeviceReport';

export function registerOnDeviceReportRoutes(app: Express): void {
  app.get('/on-device-report/:id', async (req: Request, res: Response) => {
    const id = req.params.id;
    try {
      const loaded = await loadOnDeviceReport(id);
      if (!loaded) {
        return res.json({ ok: false, error: 'No on-device report found for this device.' });
      }
      return res.json({ ok: true, sourcePath: loaded.path, report: loaded.json });
    } catch (e: any) {
      const msg = e?.message || 'Failed to load on-device report via ADB.';
      return res.status(500).json({ ok: false, error: msg });
    }
  });
}
