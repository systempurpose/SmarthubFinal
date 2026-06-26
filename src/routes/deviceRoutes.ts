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

      // ---- NEW FIELDS ----

      // 5. Battery capacity (mAh)
      let batteryCapacity: number | undefined;
      try {
        const stats = await adb('-s', deviceId, 'shell', 'dumpsys', 'batterystats');
        const match = stats.match(/Estimated battery capacity:\s*(\d+)\s*mAh/i);
        if (match) {
          batteryCapacity = parseInt(match[1], 10);
        } else {
          const capPaths = [
            '/sys/class/power_supply/battery/charge_full_design',
            '/sys/class/power_supply/battery/charge_full',
            '/sys/class/power_supply/bms/charge_full_design',
          ];
          for (const p of capPaths) {
            try {
              const out = await adb('-s', deviceId, 'shell', 'cat', p);
              const val = parseInt(out.trim(), 10);
              if (!isNaN(val) && val > 0) {
                // Usually in µAh, convert to mAh if > 5000
                batteryCapacity = val > 5000 ? Math.round(val / 1000) : val;
                break;
              }
            } catch {}
          }
        }
        if (batteryCapacity && (batteryCapacity > 20000 || batteryCapacity < 200)) {
          batteryCapacity = undefined;
        }
      } catch {}

      // 6. Battery health
      let batteryHealth: string | undefined;
      try {
        const batteryDump = await adb('-s', deviceId, 'shell', 'dumpsys', 'battery');
        const match = batteryDump.match(/health:\s*(\d+)/i);
        if (match) {
          const healthCode = parseInt(match[1], 10);
          const healthMap: Record<number, string> = {
            1: 'Unknown', 2: 'Good', 3: 'Overheat',
            4: 'Dead', 5: 'Over-voltage', 6: 'Failure', 7: 'Cold',
          };
          batteryHealth = healthMap[healthCode] || 'Unknown';
        }
      } catch {}

      // 7. Display refresh rate
      let refreshRate: string | undefined;
      try {
        const displayDump = await adb('-s', deviceId, 'shell', 'dumpsys', 'display');
        const match = displayDump.match(/refreshRate\s*=\s*([\d.]+)/i);
        if (match) {
          refreshRate = parseFloat(match[1]).toFixed(1) + ' Hz';
        } else {
          const sfDump = await adb('-s', deviceId, 'shell', 'dumpsys', 'surfaceflinger');
          const sfMatch = sfDump.match(/refreshRate:\s*([\d.]+)/i);
          if (sfMatch) {
            refreshRate = parseFloat(sfMatch[1]).toFixed(1) + ' Hz';
          }
        }
      } catch {}

      // 8. Camera resolutions (filtered)
      let cameraResolutions: string[] = [];
      try {
        const camDump = await adb('-s', deviceId, 'shell', 'dumpsys', 'media.camera');
        const lines = camDump.split(/\r?\n/);
        for (const line of lines) {
          const match = line.match(/(\d+)\s*x\s*(\d+)/i);
          if (match) {
            const w = parseInt(match[1], 10);
            const h = parseInt(match[2], 10);
            // Filter out garbage: width/height > 0 and < 10000, and not containing 0x
            if (w > 0 && h > 0 && w < 10000 && h < 10000 && !line.includes('0x')) {
              const res = `${w} x ${h}`;
              if (!cameraResolutions.includes(res)) {
                cameraResolutions.push(res);
              }
            }
          }
        }
        if (cameraResolutions.length === 0) {
          const camDump2 = await adb('-s', deviceId, 'shell', 'dumpsys', 'camera');
          const lines2 = camDump2.split(/\r?\n/);
          for (const line of lines2) {
            const match = line.match(/(\d+)\s*x\s*(\d+)/i);
            if (match) {
              const w = parseInt(match[1], 10);
              const h = parseInt(match[2], 10);
              if (w > 0 && h > 0 && w < 10000 && h < 10000 && !line.includes('0x')) {
                const res = `${w} x ${h}`;
                if (!cameraResolutions.includes(res)) {
                  cameraResolutions.push(res);
                }
              }
            }
          }
        }
        // Deduplicate and limit to first 5
        cameraResolutions = [...new Set(cameraResolutions)].slice(0, 5);
      } catch {}

      // 9. Wi-Fi MAC address
      let wifiMac: string | undefined;
      try {
        const mac = await adb('-s', deviceId, 'shell', 'cat', '/sys/class/net/wlan0/address');
        if (mac && mac.trim() && !mac.includes('No such')) wifiMac = mac.trim();
      } catch {}
      if (!wifiMac) {
        try {
          const mac = await adb('-s', deviceId, 'shell', 'settings', 'get', 'global', 'wifi_mac');
          if (mac && mac.trim()) wifiMac = mac.trim();
        } catch {}
      }

      // 10. Bluetooth MAC address
      let btMac: string | undefined;
      try {
        const btDump = await adb('-s', deviceId, 'shell', 'dumpsys', 'bluetooth');
        const macMatch = btDump.match(/address:\s*([0-9A-Fa-f:]{17})/i);
        if (macMatch) {
          btMac = macMatch[1];
        } else {
          const mac = await adb('-s', deviceId, 'shell', 'settings', 'get', 'global', 'bluetooth_address');
          if (mac && mac.trim() && mac.trim() !== 'null') btMac = mac.trim();
        }
      } catch {}

      // 11. Paired Bluetooth devices
      let pairedDevices: string[] = [];
      try {
        const btDump = await adb('-s', deviceId, 'shell', 'dumpsys', 'bluetooth');
        const lines = btDump.split(/\r?\n/);
        let inBonded = false;
        for (const line of lines) {
          if (line.includes('Bonded devices:')) {
            inBonded = true;
          } else if (inBonded && line.trim().startsWith('Device:')) {
            const nameMatch = line.match(/Device:\s*([^)]+?)\s*\(/i);
            if (nameMatch) {
              pairedDevices.push(nameMatch[1].trim());
            }
          } else if (inBonded && line.trim() === '') {
            inBonded = false;
          }
        }
        if (pairedDevices.length === 0) {
          const bondMatches = btDump.match(/Bonded[^:]*:\s*([^\n]+)/gi);
          if (bondMatches) {
            for (const m of bondMatches) {
              const names = m.match(/([a-zA-Z0-9_\s-]+)/g);
              if (names) {
                for (const n of names) {
                  if (n.trim().length > 0) pairedDevices.push(n.trim());
                }
              }
            }
          }
        }
      } catch {}

      // 5. Combine everything into one response
      res.json({
        ...props,
        bluetoothOn,
        mobileDataToggle,
        mobileDataConnected,
        batteryCapacity,
        batteryHealth,
        refreshRate,
        cameraResolutions,
        wifiMac,
        btMac,
        pairedDevices,
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