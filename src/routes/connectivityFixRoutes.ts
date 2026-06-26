import { Express, Request, Response } from 'express';
import { adb } from '../adb';

export function registerConnectivityFixRoutes(app: Express) {
    // ==================== AUTOMATIC DIAGNOSTIC ENDPOINTS ====================

    // ---- WiFi Diagnostic ----
    app.get('/connectivity/diagnose/wifi/:deviceId', async (req: Request, res: Response) => {
        const deviceId = req.params.deviceId;
        try {
            const wifiOn = await adb('-s', deviceId, 'shell', 'settings get global wifi_on');
            if (wifiOn.trim() !== '1') {
                return res.json({ ok: false, error: 'WiFi is disabled' });
            }

            const iface = 'wlan0';
            const ipAddr = await adb('-s', deviceId, 'shell', `ip -f inet addr show ${iface}`);
            const ipMatch = ipAddr.match(/inet\s+([\d.]+)/);
            if (!ipMatch) {
                return res.json({ ok: false, error: 'No IP address on WiFi interface' });
            }
            const ip = ipMatch[1];

            const ping = await adb('-s', deviceId, 'shell', `ping -c 4 -W 2 -I ${ip} google.com`);
            const received = (ping.match(/received/g) || []).length;
            if (received > 0) {
                let avg = '?';
                let match = ping.match(/avg\s+([\d.]+)/);
                if (!match) match = ping.match(/rtt\s+min\/avg\/max\/mdev\s*=\s*[^\/]+\/\s*([\d.]+)/);
                if (!match) match = ping.match(/round-trip\s+min\/avg\/max\s*=\s*[^\/]+\/\s*([\d.]+)/);
                if (match) avg = match[1];
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
            const btOn = await adb('-s', deviceId, 'shell', 'settings get global bluetooth_on');
            if (btOn.trim() !== '1') {
                return res.json({ ok: false, error: 'Bluetooth is disabled' });
            }

            const btDump = await adb('-s', deviceId, 'shell', 'dumpsys bluetooth_manager');

            let pairedCount = 0;
            const shimMatches = btDump.match(/shim::acl\s+([0-9a-f:]+)\[PUBLIC_DEVICE_ADDRESS\]/gi);
            if (shimMatches) {
                pairedCount = shimMatches.length;
            } else {
                const bondMatches = btDump.match(/Bonded devices:/g);
                if (bondMatches) pairedCount = bondMatches.length;
            }

            const connStateMatch = btDump.match(/ConnectionState:\s*(\w+)/i);
            let connectionState = 'Unknown';
            if (connStateMatch) {
                connectionState = connStateMatch[1].replace('STATE_', '').toUpperCase();
            }

            const oppSupported = btDump.includes('Profile: BluetoothOppService');
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
        let wifiWasOn = false;
        try {
            // 1. Check if mobile data is enabled
            const dataOn = await adb('-s', deviceId, 'shell', 'settings get global mobile_data');
            if (dataOn.trim() !== '1') {
                return res.json({ ok: false, error: 'Mobile data is disabled' });
            }

            // 2. Remember WiFi state and temporarily disable WiFi
            const wifiState = await adb('-s', deviceId, 'shell', 'settings get global wifi_on');
            if (wifiState.trim() === '1') {
                wifiWasOn = true;
                await adb('-s', deviceId, 'shell', 'svc wifi disable');
                // Wait for switch
                await new Promise(r => setTimeout(r, 1000));
            }

            // 3. Ping facebook.com without -I (default route should be mobile)
            let pingResult = '';
            let success = false;
            try {
                pingResult = await adb('-s', deviceId, 'shell', 'ping -c 4 -W 2 facebook.com');
                const received = (pingResult.match(/received/g) || []).length;
                if (received > 0) success = true;
            } catch (pingErr: any) {
                pingResult = pingErr.message || '';
            }

            // 4. Return result
            if (success) {
                let avg = '?';
                let match = pingResult.match(/avg\s+([\d.]+)/);
                if (!match) match = pingResult.match(/rtt\s+min\/avg\/max\/mdev\s*=\s*[^\/]+\/\s*([\d.]+)/);
                if (!match) match = pingResult.match(/round-trip\s+min\/avg\/max\s*=\s*[^\/]+\/\s*([\d.]+)/);
                if (match) avg = match[1];
                res.json({ ok: true, message: `Mobile data working (ping avg ${avg} ms)` });
            } else {
                res.json({ ok: false, error: 'Ping to facebook.com failed – no internet connectivity' });
            }
        } catch (err: any) {
            res.json({ ok: false, error: err.message || 'Mobile data diagnostic failed' });
        } finally {
            // 5. Restore WiFi state
            if (wifiWasOn) {
                try {
                    await adb('-s', deviceId, 'shell', 'svc wifi enable');
                } catch {
                    // ignore restore errors
                }
            }
        }
    });

    // ==================== FIX ENDPOINTS ====================
    app.post('/android-connectivity/fix/:deviceId', async (req: Request, res: Response) => {
        const { deviceId } = req.params;
        const { action } = req.body;
        if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });
        if (!action) return res.status(400).json({ error: 'Missing action' });

        try {
            let result = '';
            switch (action) {
                // ---- WiFi ----
                case 'wifi_reset':
                    await adb('-s', deviceId, 'shell', 'svc wifi disable');
                    await new Promise(r => setTimeout(r, 1000));
                    await adb('-s', deviceId, 'shell', 'svc wifi enable');
                    result = 'WiFi reset completed.';
                    break;
                case 'wifi_scan':
                    await adb('-s', deviceId, 'shell', 'cmd wifi start-scan');
                    result = 'WiFi scan triggered.';
                    break;

                // ---- Bluetooth ----
                case 'bluetooth_reset':
                    await adb('-s', deviceId, 'shell', 'svc bluetooth disable');
                    await new Promise(r => setTimeout(r, 1000));
                    await adb('-s', deviceId, 'shell', 'svc bluetooth enable');
                    result = 'Bluetooth reset completed.';
                    break;
                case 'bluetooth_force_stop':
                    await adb('-s', deviceId, 'shell', 'am force-stop com.android.bluetooth');
                    await new Promise(r => setTimeout(r, 500));
                    await adb('-s', deviceId, 'shell', 'svc bluetooth enable');
                    result = 'Bluetooth force stop and restart completed.';
                    break;
                case 'bluetooth_clear_cache':
                    await adb('-s', deviceId, 'shell', 'pm clear com.android.bluetooth');
                    result = 'Bluetooth cache cleared.';
                    break;

                // ---- Mobile Data ----
                case 'mobile_data_reset':
                    let current = await adb('-s', deviceId, 'shell', 'settings get global mobile_data1');
                    if (!current?.trim()) current = await adb('-s', deviceId, 'shell', 'settings get global mobile_data');
                    const isEnabled = current?.trim() === '1';
                    if (isEnabled) {
                        await adb('-s', deviceId, 'shell', 'settings put global mobile_data1 0');
                        await new Promise(r => setTimeout(r, 1000));
                        await adb('-s', deviceId, 'shell', 'settings put global mobile_data1 1');
                    } else {
                        await adb('-s', deviceId, 'shell', 'settings put global mobile_data1 1');
                    }
                    result = 'Mobile data reset completed.';
                    break;

                // ---- Force LTE (launch hidden radio settings) ----
                case 'set_lte':
                    try {
                        await adb('-s', deviceId, 'shell', 'settings put global preferred_network_mode 9');
                    } catch {}
                    await adb('-s', deviceId, 'shell', 'am start -a android.intent.action.MAIN -n com.android.settings/.RadioInfo');
                    result = 'Opened Radio Info settings. Please select "LTE only" from the dropdown.';
                    break;

                // ---- Airplane Mode (works via ADB) ----
                case 'airplane_mode_reset':
                    await adb('-s', deviceId, 'shell', 'settings put global airplane_mode_on 1');
                    await adb('-s', deviceId, 'shell', 'am broadcast -a android.intent.action.AIRPLANE_MODE');
                    await new Promise(r => setTimeout(r, 1500));
                    await adb('-s', deviceId, 'shell', 'settings put global airplane_mode_on 0');
                    await adb('-s', deviceId, 'shell', 'am broadcast -a android.intent.action.AIRPLANE_MODE');
                    result = 'Airplane mode toggled (all radios reset).';
                    break;

                // ---- Full Network Reset (launch system reset settings) ----
                case 'reset_network_full':
                    await adb('-s', deviceId, 'shell', 'am start -a android.settings.RESET_SETTINGS');
                    result = 'Opened Reset Settings. Please confirm "Reset Wi-Fi, mobile & Bluetooth".';
                    break;

                default:
                    return res.status(400).json({ error: `Unknown action: ${action}` });
            }
            res.json({ ok: true, message: result });
        } catch (err: any) {
            res.status(500).json({ error: err.message || 'Fix failed' });
        }
    });
}