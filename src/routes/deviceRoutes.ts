import type { Express, Request, Response } from 'express';
import { deviceProps, listDevices, adb } from '../adb';
import { parseGetpropOutput } from '../utils';

export function registerDeviceRoutes(app: Express): void {
  // GET /api/devices – list all connected devices
  app.get('/api/devices', async (req: Request, res: Response) => {
    try {
      const devices = await listDevices();
      // Enrich each device with a model name (if missing)
      await Promise.all(
        devices.map(async (d) => {
          if (d.model) return;
          try {
            const propsDump = await deviceProps(d.id);
            const props = parseGetpropOutput(propsDump);
            const model = (props['ro.product.model'] || props['ro.product.system.model'] || props['ro.product.vendor.model'] || '').trim();
            const brand = (props['ro.product.brand'] || props['ro.product.system.brand'] || props['ro.product.vendor.brand'] || '').trim();
            const manufacturer = (props['ro.product.manufacturer'] || props['ro.product.system.manufacturer'] || props['ro.product.vendor.manufacturer'] || '').trim();
            const labelParts = [brand || manufacturer, model].filter(Boolean);
            const label = labelParts.join(' ');
            if (label) d.model = label;
            else if (model) d.model = model;
          } catch {
            // ignore enrichment errors
          }
        })
      );
      res.json({ devices });
    } catch (err) {
      console.error('[api/devices] error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/device/info/:id – detailed device information including Bluetooth & mobile data
  app.get('/api/device/info/:id', async (req: Request, res: Response) => {
    const deviceId = req.params.id;
    if (!deviceId) {
      return res.status(400).json({ error: 'Missing device ID' });
    }

    try {
      // 1. Basic device properties (getprop)
      const propsDump = await deviceProps(deviceId);
      const props = parseGetpropOutput(propsDump);

      // 2. Bluetooth state
      let bluetoothOn: boolean | undefined;
      try {
        const btRaw = await adb('-s', deviceId, 'shell', 'settings', 'get', 'global', 'bluetooth_on');
        bluetoothOn = btRaw?.trim() === '1';
      } catch {
        // ignore
      }

      // 3. Mobile data toggle (user preference)
      let mobileDataToggle: boolean | undefined;
      try {
        // Android 10+ uses 'mobile_data1' for SIM slot 1; fallback to 'mobile_data'
        let dataRaw = await adb('-s', deviceId, 'shell', 'settings', 'get', 'global', 'mobile_data1');
        if (!dataRaw?.trim()) {
          dataRaw = await adb('-s', deviceId, 'shell', 'settings', 'get', 'global', 'mobile_data');
        }
        mobileDataToggle = dataRaw?.trim() === '1';
      } catch {
        // ignore
      }

      // 4. Mobile data actual connection state
      let mobileDataConnected: boolean | undefined;
      try {
        const telephony = await adb('-s', deviceId, 'shell', 'dumpsys', 'telephony.registry');
        const match = telephony.match(/mDataConnectionState=(\d+)/);
        if (match) {
          const state = parseInt(match[1], 10);
          mobileDataConnected = state === 2;
        }
      } catch {
        // ignore
      }

      // 5. Combine everything into one response
      res.json({
        ...props,                 // all getprop keys
        bluetoothOn,
        mobileDataToggle,
        mobileDataConnected,
      });
    } catch (err) {
      console.error('[api/device/info] error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // Legacy /device endpoint – kept for compatibility
  app.get('/device', async (req: Request, res: Response) => {
    try {
      const devices = await listDevices();
      res.json({ devices });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
}