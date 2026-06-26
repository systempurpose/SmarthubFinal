import { Express, Request, Response } from 'express';
import { adb } from '../adb';

export function registerConnectivityFixRoutes(app: Express) {
    // ==================== AUTOMATIC DIAGNOSTIC ENDPOINTS ====================

    // ---- WiFi Diagnostic ----
    app.get('/connectivity/diagnose/wifi/:deviceId', async (req: Request, res: Response) => {
        const deviceId = req.params.deviceId;
        try {
            // 1. Check if WiFi is enabled
            const wifiOn = await adb('-s', deviceId, 'shell', 'settings get global wifi_on');
            if (wifiOn.trim() !== '1') {
                return res.json({ ok: false, error: 'WiFi is disabled' });
            }

            // 2. Get WiFi interface (usually wlan0)
            const iface = 'wlan0';
            // 3. Get IP address of the interface
            const ipAddr = await adb('-s', deviceId, 'shell', `ip -f inet addr show ${iface}`);
            const ipMatch = ipAddr.match(/inet\s+([\d.]+)/);
            if (!ipMatch) {
                return res.json({ ok: false, error: 'No IP address on WiFi interface' });
            }
            const ip = ipMatch[1];

            // 4. Ping google.com via that interface
            const ping = await adb('-s', deviceId, 'shell', `ping -c 4 -W 2 -I ${ip} google.com`);
            const received = (ping.match(/received/g) || []).length;
            if (received > 0) {
                // Extract ping times
                const avgMatch = ping.match(/avg\s+([\d.]+)/);
                const avg = avgMatch ? avgMatch[1] : '?';
                res.json({ ok: true, message: `WiFi working (ping avg ${avg} ms)` });
            } else {
                res.json({ ok: false, error: 'Ping to google.com failed – no internet connectivity' });
            }
        } catch (err: any) {
            res.json({ ok: false, error: err.message || 'WiFi diagnostic failed' });
        }
    });

    // ---- Bluetooth Diagnostic ----
    app.get('/connectivity/diagnose/bluetooth/:deviceId', async (req: Request, res: Response) => {
        const deviceId = req.params.deviceId;
        try {
            // 1. Check if Bluetooth is enabled
            const btOn = await adb('-s', deviceId, 'shell', 'settings get global bluetooth_on');
            if (btOn.trim() !== '1') {
                return res.json({ ok: false, error: 'Bluetooth is disabled' });
            }

            // 2. Get dumpsys bluetooth_manager
            const btDump = await adb('-s', deviceId, 'shell', 'dumpsys bluetooth_manager');

            // 3. Count paired devices (from shim::acl lines or Bonded devices)
            let pairedCount = 0;
            const shimMatches = btDump.match(/shim::acl\s+([0-9a-f:]+)\[PUBLIC_DEVICE_ADDRESS\]/gi);
            if (shimMatches) {
                pairedCount = shimMatches.length;
            } else {
                // Fallback: count Bonded devices
                const bondMatches = btDump.match(/Bonded devices:/g);
                if (bondMatches) pairedCount = bondMatches.length;
            }

            // 4. Check connection state
            const connStateMatch = btDump.match(/ConnectionState:\s*(\w+)/i);
            let connectionState = 'Unknown';
            if (connStateMatch) {
                connectionState = connStateMatch[1].replace('STATE_', '').toUpperCase();
            }

            // 5. Check if OPP (Object Push Profile) is supported
            const oppSupported = btDump.includes('Profile: BluetoothOppService');

            // 6. Get MAC address (optional)
            const macMatch = btDump.match(/[Aa]ddress:\s*([0-9A-Fa-f:]{17})/);
            const mac = macMatch ? macMatch[1] : 'Unknown';

            res.json({
                ok: true,
                message: `Bluetooth is on`,
                pairedCount,
                connectionState,
                oppSupported,
                mac
            });
        } catch (err: any) {
            res.json({ ok: false, error: err.message || 'Bluetooth diagnostic failed' });
        }
    });

    // ---- Mobile Data Diagnostic ----
    app.get('/connectivity/diagnose/mobile/:deviceId', async (req: Request, res: Response) => {
        const deviceId = req.params.deviceId;
        try {
            // 1. Check if mobile data is enabled
            const dataOn = await adb('-s', deviceId, 'shell', 'settings get global mobile_data');
            if (dataOn.trim() !== '1') {
                return res.json({ ok: false, error: 'Mobile data is disabled' });
            }

            // 2. Check connectivity dump for validation
            const connDump = await adb('-s', deviceId, 'shell', 'dumpsys connectivity');
            const validated = connDump.includes('CAP_VALIDATED');
            if (!validated) {
                return res.json({ ok: false, error: 'Mobile data network not validated (no internet)' });
            }

            // 3. Get mobile interface (e.g., rmnet0) and IP
            // Find interface from dumpsys connectivity: `InterfaceName: seth_lte0` etc.
            const ifaceMatch = connDump.match(/InterfaceName:\s*(\S+)/);
            const iface = ifaceMatch ? ifaceMatch[1] : 'rmnet0';
            const ipAddr = await adb('-s', deviceId, 'shell', `ip -f inet addr show ${iface}`);
            const ipMatch = ipAddr.match(/inet\s+([\d.]+)/);
            if (!ipMatch) {
                return res.json({ ok: false, error: 'No IP address on mobile interface' });
            }
            const ip = ipMatch[1];

            // 4. Ping facebook.com via that interface
            const ping = await adb('-s', deviceId, 'shell', `ping -c 4 -W 2 -I ${ip} facebook.com`);
            const received = (ping.match(/received/g) || []).length;
            if (received > 0) {
                const avgMatch = ping.match(/avg\s+([\d.]+)/);
                const avg = avgMatch ? avgMatch[1] : '?';
                res.json({ ok: true, message: `Mobile data working (ping avg ${avg} ms)` });
            } else {
                res.json({ ok: false, error: 'Ping to facebook.com failed – no internet connectivity' });
            }
        } catch (err: any) {
            res.json({ ok: false, error: err.message || 'Mobile data diagnostic failed' });
        }
    });

    // ==================== FIX ENDPOINTS (unchanged) ====================
    app.post('/android-connectivity/fix/:deviceId', async (req: Request, res: Response) => {
        // ... (keep the same as before) ...
    });
}