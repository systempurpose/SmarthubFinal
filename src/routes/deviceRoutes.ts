import type { Express, Request, Response } from 'express';
import { deviceProps, listDevices } from '../adb';
import { parseGetpropOutput } from '../utils';

export function registerDeviceRoutes(app: Express): void {
  app.get('/device', async (_req: Request, res: Response) => {
    let devices = [] as Awaited<ReturnType<typeof listDevices>>;
    let error: string | undefined;
    
    app.get('/api/devices', async (req, res) => {
    try {
        const devices = await listDevices();
        res.json({ devices });
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
    try {
      devices = await listDevices();
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('Failed to list devices via adb:', e);
      error = e?.message || 'Failed to run "adb devices -l"';
    }

    await Promise.all(
      devices.map(async d => {
        if (d.model) return;
        try {
          const propsDump = await deviceProps(d.id);
          const props = parseGetpropOutput(propsDump);

          const model = (props['ro.product.model'] || props['ro.product.system.model'] || props['ro.product.vendor.model'] || '').trim();
          const brand = (props['ro.product.brand'] || props['ro.product.system.brand'] || props['ro.product.vendor.brand'] || '').trim();
          const manufacturer = (props['ro.product.manufacturer'] || props['ro.product.system.manufacturer'] || props['ro.product.vendor.manufacturer'] || '').trim();

          const labelParts = [brand || manufacturer, model].filter(Boolean) as string[];
          const label = labelParts.join(' ');

          if (label) {
            d.model = label;
          } else if (model) {
            d.model = model;
          }
        } catch {
          // ignore
        }
      }),
    );

    res.json({ devices, error });
  });
}
