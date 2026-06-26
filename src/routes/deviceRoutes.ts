import type { Express, Request, Response } from 'express';
import { deviceProps, listDevices, adb } from '../adb';
import { parseGetpropOutput } from '../utils';

export function registerDeviceRoutes(app: Express): void {
  // GET /api/devices – list all connected devices
  app.get('/api/devices', async (req: Request, res: Response) => {
    try {
      const devices = await listDevices();
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
            // ignore
          }
        })
      );
      res.json({ devices });
    } catch (err) {
      console.error('[api/devices] error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/device/info/:id
  app.get('/api/device/info/:id', async (req: Request, res: Response) => {
    const deviceId = req.params.id;
    if (!deviceId) {
      return res.status(400).json({ error: 'Missing device ID' });
    }

    try {
      const propsDump = await deviceProps(deviceId);
      const props = parseGetpropOutput(propsDump);

      // ---- Bluetooth state ----
      let bluetoothOn: boolean | undefined;
      try {
        const btRaw = await adb('-s', deviceId, 'shell', 'settings', 'get', 'global', 'bluetooth_on');
        bluetoothOn = btRaw?.trim() === '1';
      } catch {}

      // ---- Mobile data toggle ----
      let mobileDataToggle: boolean | undefined;
      try {
        let dataRaw = await adb('-s', deviceId, 'shell', 'settings', 'get', 'global', 'mobile_data1');
        if (!dataRaw?.trim()) {
          dataRaw = await adb('-s', deviceId, 'shell', 'settings', 'get', 'global', 'mobile_data');
        }
        mobileDataToggle = dataRaw?.trim() === '1';
      } catch {}

      // ---- Mobile data connection ----
      let mobileDataConnected: boolean | undefined;
      try {
        const telephony = await adb('-s', deviceId, 'shell', 'dumpsys', 'telephony.registry');
        const match = telephony.match(/mDataConnectionState=(\d+)/);
        if (match) {
          const state = parseInt(match[1], 10);
          mobileDataConnected = state === 2;
        }
      } catch {}

      // ==================== BATTERY FIELDS ====================

      let batteryCapacity: number | undefined;
      try {
        const capPaths = [
          '/sys/class/power_supply/battery/charge_full',
          '/sys/class/power_supply/battery/charge_full_design',
          '/sys/class/power_supply/bms/charge_full_design',
          '/sys/class/power_supply/bms/charge_full',
        ];
        for (const p of capPaths) {
          try {
            const out = await adb('-s', deviceId, 'shell', 'cat', p);
            const val = parseInt(out.trim(), 10);
            if (!isNaN(val) && val > 0) {
              batteryCapacity = val > 5000 ? Math.round(val / 1000) : val;
              break;
            }
          } catch {}
        }
        if (!batteryCapacity) {
          const stats = await adb('-s', deviceId, 'shell', 'dumpsys', 'batterystats');
          const match = stats.match(/Estimated battery capacity:\s*(\d+)\s*mAh/i);
          if (match) {
            batteryCapacity = parseInt(match[1], 10);
          }
        }
        if (batteryCapacity && (batteryCapacity < 1000 || batteryCapacity > 20000)) {
          batteryCapacity = undefined;
        }
      } catch {}

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

      let maxChargingCurrent: number | undefined;
      try {
        const batteryDump = await adb('-s', deviceId, 'shell', 'dumpsys', 'battery');
        const match = batteryDump.match(/Max charging current:\s*(\d+)/i);
        if (match) {
          maxChargingCurrent = Math.round(parseInt(match[1], 10) / 1000);
        }
      } catch {}

      let maxChargingVoltage: number | undefined;
      try {
        const batteryDump = await adb('-s', deviceId, 'shell', 'dumpsys', 'battery');
        const match = batteryDump.match(/Max charging voltage:\s*(\d+)/i);
        if (match) {
          maxChargingVoltage = Math.round(parseInt(match[1], 10) / 1000);
        }
      } catch {}

      let batteryVoltage: number | undefined;
      try {
        const batteryDump = await adb('-s', deviceId, 'shell', 'dumpsys', 'battery');
        const match = batteryDump.match(/voltage:\s*(\d+)/i);
        if (match) {
          batteryVoltage = Math.round(parseInt(match[1], 10) / 1000);
        }
      } catch {}

      let batteryTemperature: number | undefined;
      try {
        const batteryDump = await adb('-s', deviceId, 'shell', 'dumpsys', 'battery');
        const match = batteryDump.match(/temperature:\s*(\d+)/i);
        if (match) {
          batteryTemperature = Math.round(parseInt(match[1], 10) / 10);
        }
      } catch {}

      // ---- Display refresh rate ----
      let refreshRate: string | undefined;
      try {
        const displayDump = await adb('-s', deviceId, 'shell', 'dumpsys', 'display');
        let match = displayDump.match(/refreshRate\s*=\s*([\d.]+)/i);
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

      // ---- Camera resolutions ----
      let cameraResolutions: string[] = [];
      try {
        const sources = [
          await adb('-s', deviceId, 'shell', 'dumpsys', 'media.camera').catch(() => ''),
          await adb('-s', deviceId, 'shell', 'dumpsys', 'camera').catch(() => ''),
        ];
        const allMatches: string[] = [];
        for (const dump of sources) {
          const lines = dump.split(/\r?\n/);
          for (const line of lines) {
            const match = line.match(/(\d+)\s*[xX]\s*(\d+)/);
            if (match) {
              const w = parseInt(match[1], 10);
              const h = parseInt(match[2], 10);
              if (w > 200 && h > 200 && w < 10000 && h < 10000) {
                const res = `${w} x ${h}`;
                if (!allMatches.includes(res)) {
                  allMatches.push(res);
                }
              }
            }
          }
        }
        cameraResolutions = allMatches.slice(0, 5);
      } catch {}

      // ---- Wi-Fi MAC ----
      let wifiMac: string | undefined;
      try {
        let mac = await adb('-s', deviceId, 'shell', 'cat', '/sys/class/net/wlan0/address');
        if (mac && mac.trim() && !mac.includes('No such')) wifiMac = mac.trim();
      } catch {}
      if (!wifiMac) {
        try {
          const mac = await adb('-s', deviceId, 'shell', 'settings', 'get', 'global', 'wifi_mac');
          if (mac && mac.trim() && mac.trim() !== 'null') wifiMac = mac.trim();
        } catch {}
      }

      // ---- Bluetooth MAC ----
      let btMac: string | undefined;
      try {
        let mac = await adb('-s', deviceId, 'shell', 'settings', 'get', 'secure', 'bluetooth_address');
        if (mac && mac.trim() && mac.trim() !== 'null' && mac.trim() !== '') {
          btMac = mac.trim();
        } else {
          mac = await adb('-s', deviceId, 'shell', 'settings', 'get', 'global', 'bluetooth_address');
          if (mac && mac.trim() && mac.trim() !== 'null' && mac.trim() !== '') {
            btMac = mac.trim();
          } else {
            const btDump = await adb('-s', deviceId, 'shell', 'dumpsys', 'bluetooth_manager');
            const match = btDump.match(/[Aa]ddress:\s*([0-9A-Fa-f:]{17})/i);
            if (match) btMac = match[1];
          }
        }
      } catch {}

      // ---- Paired Bluetooth devices ----
      let pairedDevices: { name: string; mac: string }[] = [];
      try {
        const btDump = await adb('-s', deviceId, 'shell', 'dumpsys', 'bluetooth_manager');
        const lines = btDump.split(/\r?\n/);
        let inBonded = false;
        for (const line of lines) {
          if (line.trim().startsWith('Bonded devices:')) {
            inBonded = true;
            continue;
          }
          if (inBonded && line.trim() === '') {
            inBonded = false;
            continue;
          }
          if (inBonded) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const parts = trimmed.split(/\s+/);
            if (parts.length >= 3) {
              const mac = parts[0];
              const name = parts.slice(2).join(' ');
              if (mac.match(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/)) {
                pairedDevices.push({ mac, name: name || 'Unknown' });
              }
            }
          }
        }
        const seen = new Set();
        pairedDevices = pairedDevices.filter(d => {
          if (seen.has(d.mac)) return false;
          seen.add(d.mac);
          return true;
        });
      } catch {}

      // ==================== NEW FIELDS ====================

      // ---- DRM / Widevine ----
      let widevineLevel: string | undefined;
      let drmSchemes: string[] = [];
      try {
        const extractor = await adb('-s', deviceId, 'shell', 'dumpsys', 'media.extractor');
        const wvMatch = extractor.match(/Widevine security level:\s*([A-Z0-9]+)/i);
        if (wvMatch) widevineLevel = wvMatch[1];
        const drm = await adb('-s', deviceId, 'shell', 'dumpsys', 'media.drm');
        const schemes = drm.match(/supported\s*schemes:\s*([^\n]+)/i);
        if (schemes) {
          drmSchemes = schemes[1].split(/\s*,\s*/).filter(s => s.trim());
        }
      } catch {}

      // ---- Storage details ----
      let storageTotal: string | undefined;
      let storageUsed: string | undefined;
      let storageFree: string | undefined;
      let storageType: string | undefined;
      try {
        // Use df -h /data and parse the first data line
        const df = await adb('-s', deviceId, 'shell', 'df', '-h', '/data');
        const lines = df.split(/\r?\n/);
        let found = false;
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('Filesystem')) continue;
          if (!trimmed) continue;
          const parts = trimmed.split(/\s+/);
          if (parts.length >= 6) {
            // Accept any mount that is under /data or /storage
            const mount = parts[parts.length - 1];
            if (mount.startsWith('/data') || mount.startsWith('/storage') || mount === '/') {
              storageTotal = parts[1];
              storageUsed = parts[2];
              storageFree = parts[3];
              found = true;
              break;
            }
          }
        }
        // Fallback: take the first non-header line
        if (!found) {
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('Filesystem')) continue;
            if (!trimmed) continue;
            const parts = trimmed.split(/\s+/);
            if (parts.length >= 6) {
              storageTotal = parts[1];
              storageUsed = parts[2];
              storageFree = parts[3];
              break;
            }
          }
        }
        // Storage hardware type
        const props2 = parseGetpropOutput(await deviceProps(deviceId));
        if (props2['ro.boot.emmc']) storageType = 'eMMC';
        else if (props2['ro.boot.ufs']) storageType = 'UFS';
        else if (props2['ro.boot.bootdevice']?.toLowerCase().includes('ufs')) storageType = 'UFS';
        else if (props2['ro.boot.bootdevice']?.toLowerCase().includes('mmc')) storageType = 'eMMC';
        else storageType = 'Unknown';
      } catch {}

      // ---- GNSS support ----
      let gnssProviders: string[] = [];
      try {
        const location = await adb('-s', deviceId, 'shell', 'dumpsys', 'location');
        const gnssMatch = location.match(/GNSS hardware:\s*([^\n]+)/i);
        if (gnssMatch) {
          const text = gnssMatch[1].toLowerCase();
          if (text.includes('gps')) gnssProviders.push('GPS');
          if (text.includes('glonass')) gnssProviders.push('GLONASS');
          if (text.includes('galileo')) gnssProviders.push('Galileo');
          if (text.includes('beidou')) gnssProviders.push('BeiDou');
          if (text.includes('qzss')) gnssProviders.push('QZSS');
        }
        if (gnssProviders.length === 0) {
          const providers = location.match(/mProviders:\s*([^\n]+)/i);
          if (providers) {
            const list = providers[1].toLowerCase();
            if (list.includes('gps')) gnssProviders.push('GPS');
            if (list.includes('glonass')) gnssProviders.push('GLONASS');
            if (list.includes('galileo')) gnssProviders.push('Galileo');
            if (list.includes('beidou')) gnssProviders.push('BeiDou');
          }
        }
        if (gnssProviders.length === 0) {
          gnssProviders.push('GPS');
        }
      } catch {}

      // ---- Sensors (extra) ----
      let hasGyro = false;
      let hasMagnetometer = false;
      let hasBarometer = false;
      try {
        const sensorDump = await adb('-s', deviceId, 'shell', 'dumpsys', 'sensorservice');
        const lines = sensorDump.split(/\r?\n/);
        for (const line of lines) {
          const lower = line.toLowerCase();
          if (lower.includes('gyroscope')) hasGyro = true;
          if (lower.includes('magnetometer') || lower.includes('compass')) hasMagnetometer = true;
          if (lower.includes('barometer') || lower.includes('pressure')) hasBarometer = true;
        }
      } catch {}

      // ---- USB OTG ----
      let usbOtgSupported = false;
      try {
        // Check package manager feature
        const features = await adb('-s', deviceId, 'shell', 'pm', 'list', 'features');
        if (features.includes('android.hardware.usb.host')) {
          usbOtgSupported = true;
        } else {
          const usbDump = await adb('-s', deviceId, 'shell', 'dumpsys', 'usb');
          if (usbDump.toLowerCase().includes('host mode')) usbOtgSupported = true;
        }
      } catch {}

      // ---- Network identifiers ----
      let localIp: string | undefined;
      let gateway: string | undefined;
      let dnsServers: string[] = [];
      try {
        // IP from wlan0
        const ipAddr = await adb('-s', deviceId, 'shell', 'ip', 'addr', 'show', 'wlan0');
        const ipMatch = ipAddr.match(/inet\s+([\d.]+)\/\d+/);
        if (ipMatch) localIp = ipMatch[1];
        if (!localIp) {
          // Try rmnet0 (mobile data)
          const ipMobile = await adb('-s', deviceId, 'shell', 'ip', 'addr', 'show', 'rmnet0');
          const m = ipMobile.match(/inet\s+([\d.]+)\/\d+/);
          if (m) localIp = m[1];
        }
        // Gateway from route table
        const route = await adb('-s', deviceId, 'shell', 'ip', 'route', 'show', 'dev', 'wlan0');
        const gwMatch = route.match(/via\s+([\d.]+)/);
        if (gwMatch) gateway = gwMatch[1];
        if (!gateway) {
          const defaultRoute = await adb('-s', deviceId, 'shell', 'ip', 'route', 'show', 'default');
          const m = defaultRoute.match(/via\s+([\d.]+)/);
          if (m) gateway = m[1];
        }
        // DNS: check private DNS settings
        const dnsMode = await adb('-s', deviceId, 'shell', 'settings', 'get', 'global', 'private_dns_mode');
        const dnsSpec = await adb('-s', deviceId, 'shell', 'settings', 'get', 'global', 'private_dns_specifier');
        if (dnsMode && dnsMode.trim() !== 'off' && dnsSpec && dnsSpec.trim()) {
          dnsServers.push(dnsSpec.trim());
        } else {
          // No private DNS – we can say "Automatic (Gateway)" or use public defaults
          dnsServers.push('Automatic (Gateway)');
        }
      } catch {}

      // ---- Final JSON response ----
      res.json({
        ...props,
        bluetoothOn,
        mobileDataToggle,
        mobileDataConnected,
        batteryCapacity,
        batteryHealth,
        maxChargingCurrent,
        maxChargingVoltage,
        batteryVoltage,
        batteryTemperature,
        refreshRate,
        cameraResolutions,
        wifiMac,
        btMac,
        pairedDevices,
        widevineLevel,
        drmSchemes,
        storageTotal,
        storageUsed,
        storageFree,
        storageType,
        gnssProviders,
        hasGyro,
        hasMagnetometer,
        hasBarometer,
        usbOtgSupported,
        localIp,
        gateway,
        dnsServers,
      });
    } catch (err) {
      console.error('[api/device/info] error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // ---- POST /api/forget-bluetooth-device ----
  app.post('/api/forget-bluetooth-device', async (req: Request, res: Response) => {
    const { deviceId, mac } = req.body;
    if (!deviceId || !mac) {
      return res.status(400).json({ error: 'Missing deviceId or MAC address' });
    }
    try {
      let output = '';
      try {
        output = await adb('-s', deviceId, 'shell', 'service', 'call', 'bluetooth_manager', '14', 'i32', '1', 's16', mac);
      } catch {}
      if (output.includes('Error') || output.includes('not found')) {
        try {
          output = await adb('-s', deviceId, 'shell', 'bluetoothctl', 'remove', mac);
        } catch {}
      }
      if (output.includes('Error') || !output) {
        try {
          output = await adb('-s', deviceId, 'shell', 'am', 'broadcast', '-a', 'android.bluetooth.device.action.ACTION_UNPAIR', '--ez', 'android.bluetooth.device.extra.DEVICE', mac);
        } catch {}
      }
      if (!output || output.includes('Error') || output.includes('not found')) {
        return res.status(500).json({ error: 'Failed to unpair device. Command not supported on this device.' });
      }
      res.json({ ok: true, message: `Device ${mac} unpaired successfully` });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to unpair device' });
    }
  });

  // Legacy /device endpoint
  app.get('/device', async (req: Request, res: Response) => {
    try {
      const devices = await listDevices();
      res.json({ devices });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
}