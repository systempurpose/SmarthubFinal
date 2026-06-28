import { Express, Request, Response } from 'express';
import { adb } from '../adb';

export function registerConnectivityFixRoutes(app: Express) {
    // ==================== DIAGNOSTIC ENDPOINTS ====================

    // ---- WiFi ----
app.get('/connectivity/diagnose/wifi/:deviceId', async (req: Request, res: Response) => {
    const deviceId = req.params.deviceId;
    try {
        await adb('-s', deviceId, 'shell', 'svc', 'wifi', 'enable');
        const ip = await waitForInterface(deviceId, 'wlan0', 15000);
        if (!ip) {
            return res.json({ ok: false, error: 'WiFi enabled but no IP assigned after 15s' });
        }
        // Ping with separate arguments
        const ping = await adb('-s', deviceId, 'shell', 'ping', '-c', '4', '-W', '2', '-I', ip, 'google.com');
        const received = (ping.match(/received/g) || []).length;
        if (received > 0) {
            let avg = '?';
            let match = ping.match(/avg\s+([\d.]+)/);
            if (!match) match = ping.match(/rtt\s+min\/avg\/max\/mdev\s*=\s*[^\/]+\/\s*([\d.]+)/);
            if (!match) match = ping.match(/round-trip\s+min\/avg\/max\s*=\s*[^\/]+\/\s*([\d.]+)/);
            if (match) avg = match[1];
            res.json({ ok: true, message: `WiFi working (IP: ${ip}, ping avg ${avg} ms)` });
        } else {
            res.json({ ok: false, error: 'Ping to google.com failed – no internet connectivity' });
        }
    } catch (err: any) {
        res.json({ ok: false, error: err.message || 'WiFi diagnostic failed' });
    }
});
    // Helper: wait for an interface to get an IP address
    async function waitForInterface(deviceId: string, iface: string, timeoutMs: number = 15000): Promise<string | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const out = await adb('-s', deviceId, 'shell', 'ip', '-f', 'inet', 'addr', 'show', iface);
            const match = out.match(/inet\s+([\d.]+)/);
            if (match) return match[1];
        } catch {}
        await new Promise(r => setTimeout(r, 500));
    }
    return null;
}
    // ---- Bluetooth (file transfer automated) ----
    app.get('/connectivity/diagnose/bluetooth/:deviceId', async (req: Request, res: Response) => {
    const deviceId = req.params.deviceId;
    try {
        // Ensure Bluetooth is on
        try {
            await adb('-s', deviceId, 'shell', 'svc bluetooth enable');
        } catch {
            await adb('-s', deviceId, 'shell', 'settings put global bluetooth_on 1');
        }
        await new Promise(r => setTimeout(r, 1000));

        const btDump = await adb('-s', deviceId, 'shell', 'dumpsys bluetooth_manager');
        const btOn = await adb('-s', deviceId, 'shell', 'settings get global bluetooth_on');
        if (btOn.trim() !== '1') {
            return res.json({ ok: false, error: 'Bluetooth could not be enabled' });
        }
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

    // ---- Mobile Data (with signal strength) ----
 app.get('/connectivity/diagnose/mobile/:deviceId', async (req: Request, res: Response) => {
    const deviceId = req.params.deviceId;
    let wifiWasOn = false;
    try {
        const wifiState = await adb('-s', deviceId, 'shell', 'settings', 'get', 'global', 'wifi_on');
        if (wifiState.trim() === '1') {
            wifiWasOn = true;
            await adb('-s', deviceId, 'shell', 'svc', 'wifi', 'disable');
            await new Promise(r => setTimeout(r, 1000));
        }
        await adb('-s', deviceId, 'shell', 'svc', 'data', 'enable');
        const connDump = await adb('-s', deviceId, 'shell', 'dumpsys', 'connectivity');
        const ifaceMatch = connDump.match(/InterfaceName:\s*(\S+)/);
        const iface = ifaceMatch ? ifaceMatch[1] : 'rmnet0';
        const ip = await waitForInterface(deviceId, iface, 20000);
        if (!ip) {
            return res.json({ ok: false, error: 'Mobile data enabled but no IP assigned after 20s' });
        }
        // Ping with separate arguments (no -I, use default route)
        const ping = await adb('-s', deviceId, 'shell', 'ping', '-c', '4', '-W', '2', 'facebook.com');
        const received = (ping.match(/received/g) || []).length;
        let signalStrength = 'Unknown';
        try {
            const telephony = await adb('-s', deviceId, 'shell', 'dumpsys', 'telephony.registry');
            const signalMatch = telephony.match(/mSignalStrength:\s*\{([^}]+)\}/);
            if (signalMatch) {
                const parts = signalMatch[1].split(',');
                for (const p of parts) {
                    const trimmed = p.trim();
                    if (trimmed.includes('lte') || trimmed.includes('gsm') || trimmed.includes('wcdma')) {
                        signalStrength = trimmed;
                        break;
                    }
                }
            }
            if (signalStrength === 'Unknown') {
                const dbMatch = telephony.match(/mSignalStrengthDb=(-?\d+)/i);
                if (dbMatch) signalStrength = dbMatch[1] + ' dBm';
            }
        } catch {}
        if (received > 0) {
            let avg = '?';
            let match = ping.match(/avg\s+([\d.]+)/);
            if (!match) match = ping.match(/rtt\s+min\/avg\/max\/mdev\s*=\s*[^\/]+\/\s*([\d.]+)/);
            if (!match) match = ping.match(/round-trip\s+min\/avg\/max\s*=\s*[^\/]+\/\s*([\d.]+)/);
            if (match) avg = match[1];
            res.json({ ok: true, message: `Mobile data working (IP: ${ip}, ping avg ${avg} ms)`, signalStrength });
        } else {
            res.json({ ok: false, error: 'Ping to facebook.com failed – no internet connectivity', signalStrength });
        }
    } catch (err: any) {
        res.json({ ok: false, error: err.message || 'Mobile data diagnostic failed' });
    } finally {
        if (wifiWasOn) {
            try { await adb('-s', deviceId, 'shell', 'svc', 'wifi', 'enable'); } catch {}
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
                case 'set_lte':
                    try { await adb('-s', deviceId, 'shell', 'settings put global preferred_network_mode 9'); } catch {}
                    await adb('-s', deviceId, 'shell', 'am start -a android.intent.action.MAIN -n com.android.settings/.RadioInfo');
                    result = 'Opened Radio Info settings. Please select "LTE only" from the dropdown.';
                    break;
                case 'airplane_mode_reset':
                    await adb('-s', deviceId, 'shell', 'settings put global airplane_mode_on 1');
                    await adb('-s', deviceId, 'shell', 'am broadcast -a android.intent.action.AIRPLANE_MODE');
                    await new Promise(r => setTimeout(r, 1500));
                    await adb('-s', deviceId, 'shell', 'settings put global airplane_mode_on 0');
                    await adb('-s', deviceId, 'shell', 'am broadcast -a android.intent.action.AIRPLANE_MODE');
                    result = 'Airplane mode toggled (all radios reset).';
                    break;
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