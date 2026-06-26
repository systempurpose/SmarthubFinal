import { Express, Request, Response } from 'express';
import { adb } from '../adb';

export function registerConnectivityFixRoutes(app: Express) {
    // ==================== DIAGNOSTIC ENDPOINTS ====================
    app.get('/connectivity/diagnose/wifi/:deviceId', async (req: Request, res: Response) => {
        const deviceId = req.params.deviceId;
        try {
            // Check if WiFi is enabled
            const wifiOn = await adb('-s', deviceId, 'shell', 'settings', 'get', 'global', 'wifi_on');
            if (wifiOn.trim() !== '1') {
                return res.json({ ok: false, error: 'WiFi is disabled' });
            }
            // Ping google.com (quick connectivity test)
            const ping = await adb('-s', deviceId, 'shell', 'ping', '-c', '1', '-W', '2', 'google.com');
            if (ping.includes('1 packets transmitted, 1 received')) {
                res.json({ ok: true, message: 'WiFi working (ping to google.com succeeded)' });
            } else {
                res.json({ ok: false, error: 'Ping to google.com failed – no internet connectivity' });
            }
        } catch (err: any) {
            res.json({ ok: false, error: err.message || 'WiFi diagnostic failed' });
        }
    });

    app.get('/connectivity/diagnose/bluetooth/:deviceId', async (req: Request, res: Response) => {
        const deviceId = req.params.deviceId;
        try {
            // Check if Bluetooth is enabled
            const btOn = await adb('-s', deviceId, 'shell', 'settings', 'get', 'global', 'bluetooth_on');
            if (btOn.trim() !== '1') {
                return res.json({ ok: false, error: 'Bluetooth is disabled' });
            }
            // Check if there are paired devices
            const btDump = await adb('-s', deviceId, 'shell', 'dumpsys', 'bluetooth_manager');
            const bondCount = (btDump.match(/Bonded devices:/g) || []).length;
            if (bondCount > 0) {
                res.json({ ok: true, message: 'Bluetooth is on and has paired devices.' });
            } else {
                res.json({ ok: false, error: 'Bluetooth is on but no paired devices found' });
            }
        } catch (err: any) {
            res.json({ ok: false, error: err.message || 'Bluetooth diagnostic failed' });
        }
    });

    app.get('/connectivity/diagnose/mobile/:deviceId', async (req: Request, res: Response) => {
        const deviceId = req.params.deviceId;
        try {
            // Check if mobile data is enabled
            const dataOn = await adb('-s', deviceId, 'shell', 'settings', 'get', 'global', 'mobile_data');
            if (dataOn.trim() !== '1') {
                return res.json({ ok: false, error: 'Mobile data is disabled' });
            }
            // Check for mobile IP address
            const ip = await adb('-s', deviceId, 'shell', 'ip', 'addr', 'show', 'rmnet0');
            if (!ip.includes('inet ')) {
                return res.json({ ok: false, error: 'No mobile data IP address – not connected' });
            }
            // Ping facebook.com (or any reachable host)
            const ping = await adb('-s', deviceId, 'shell', 'ping', '-c', '1', '-W', '2', 'facebook.com');
            if (ping.includes('1 packets transmitted, 1 received')) {
                res.json({ ok: true, message: 'Mobile data working (ping to facebook.com succeeded)' });
            } else {
                res.json({ ok: false, error: 'Ping to facebook.com failed – no internet connectivity' });
            }
        } catch (err: any) {
            res.json({ ok: false, error: err.message || 'Mobile data diagnostic failed' });
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
                    await adb('-s', deviceId, 'shell', 'svc', 'wifi', 'disable');
                    await new Promise(r => setTimeout(r, 1000));
                    await adb('-s', deviceId, 'shell', 'svc', 'wifi', 'enable');
                    result = 'WiFi reset completed.';
                    break;
                case 'wifi_scan':
                    await adb('-s', deviceId, 'shell', 'cmd', 'wifi', 'start-scan');
                    result = 'WiFi scan triggered.';
                    break;

                // ---- Bluetooth ----
                case 'bluetooth_reset':
                    await adb('-s', deviceId, 'shell', 'svc', 'bluetooth', 'disable');
                    await new Promise(r => setTimeout(r, 1000));
                    await adb('-s', deviceId, 'shell', 'svc', 'bluetooth', 'enable');
                    result = 'Bluetooth reset completed.';
                    break;
                case 'bluetooth_force_stop':
                    await adb('-s', deviceId, 'shell', 'am', 'force-stop', 'com.android.bluetooth');
                    await new Promise(r => setTimeout(r, 500));
                    await adb('-s', deviceId, 'shell', 'svc', 'bluetooth', 'enable');
                    result = 'Bluetooth force stop and restart completed.';
                    break;
                case 'bluetooth_clear_cache':
                    await adb('-s', deviceId, 'shell', 'pm', 'clear', 'com.android.bluetooth');
                    result = 'Bluetooth cache cleared.';
                    break;

                // ---- Mobile Data ----
                case 'mobile_data_reset':
                    let current = await adb('-s', deviceId, 'shell', 'settings', 'get', 'global', 'mobile_data1');
                    if (!current?.trim()) current = await adb('-s', deviceId, 'shell', 'settings', 'get', 'global', 'mobile_data');
                    const isEnabled = current?.trim() === '1';
                    if (isEnabled) {
                        await adb('-s', deviceId, 'shell', 'settings', 'put', 'global', 'mobile_data1', '0');
                        await new Promise(r => setTimeout(r, 1000));
                        await adb('-s', deviceId, 'shell', 'settings', 'put', 'global', 'mobile_data1', '1');
                    } else {
                        await adb('-s', deviceId, 'shell', 'settings', 'put', 'global', 'mobile_data1', '1');
                    }
                    result = 'Mobile data reset completed.';
                    break;

                // ---- Force LTE (launch hidden radio settings) ----
                case 'set_lte':
                    // Try to set preferred network via settings (may not stick, but attempt)
                    try {
                        await adb('-s', deviceId, 'shell', 'settings', 'put', 'global', 'preferred_network_mode', '9');
                    } catch {}
                    // Launch the hidden Radio Info screen where user can manually select LTE only
                    await adb('-s', deviceId, 'shell', 'am', 'start', '-a', 'android.intent.action.MAIN', '-n', 'com.android.settings/.RadioInfo');
                    result = 'Opened Radio Info settings. Please select "LTE only" from the dropdown.';
                    break;

                // ---- Airplane Mode (works via ADB) ----
                case 'airplane_mode_reset':
                    await adb('-s', deviceId, 'shell', 'settings', 'put', 'global', 'airplane_mode_on', '1');
                    await adb('-s', deviceId, 'shell', 'am', 'broadcast', '-a', 'android.intent.action.AIRPLANE_MODE');
                    await new Promise(r => setTimeout(r, 1500));
                    await adb('-s', deviceId, 'shell', 'settings', 'put', 'global', 'airplane_mode_on', '0');
                    await adb('-s', deviceId, 'shell', 'am', 'broadcast', '-a', 'android.intent.action.AIRPLANE_MODE');
                    result = 'Airplane mode toggled (all radios reset).';
                    break;

                // ---- Full Network Reset (launch system reset settings) ----
                case 'reset_network_full':
                    // Launch the system Reset Settings activity where user can confirm network reset
                    await adb('-s', deviceId, 'shell', 'am', 'start', '-a', 'android.settings.RESET_SETTINGS');
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