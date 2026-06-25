import { Express, Request, Response } from 'express';
import { adb } from '../adb';

export function registerConnectivityFixRoutes(app: Express) {
    app.post('/android-connectivity/fix/:deviceId', async (req: Request, res: Response) => {
        const { deviceId } = req.params;
        const { action } = req.body;
        if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });
        if (!action) return res.status(400).json({ error: 'Missing action' });

        try {
            let result = '';
            switch (action) {
                case 'wifi_reset':
                    await adb('-s', deviceId, 'shell', 'svc', 'wifi', 'disable');
                    await new Promise(r => setTimeout(r, 1000));
                    await adb('-s', deviceId, 'shell', 'svc', 'wifi', 'enable');
                    result = 'WiFi reset completed.';
                    break;
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
                case 'mobile_data_reset':
                    // Toggle mobile data off/on (handles dual‑SIM)
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
                default:
                    return res.status(400).json({ error: `Unknown action: ${action}` });
            }
            res.json({ ok: true, message: result });
        } catch (err: any) {
            res.status(500).json({ error: err.message || 'Fix failed' });
        }
    });
}