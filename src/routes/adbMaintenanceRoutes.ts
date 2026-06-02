import type { Express, Request, Response } from 'express';
import { restartAdbServer } from '../adb';

export function registerAdbMaintenanceRoutes(app: Express): void {
  app.post('/adb/restart-server', async (_req: Request, res: Response) => {
    try {
      const result = await restartAdbServer();
      res.json({
        ok: true,
        message: 'ADB server restart requested.',
        result,
      });
    } catch (e: any) {
      res.status(500).json({
        ok: false,
        error: e?.message || 'Failed to restart ADB server.',
      });
    }
  });
}