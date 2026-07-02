import express from 'express';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const router = express.Router();

let credentials: any = null;
try {
    const keyPath = path.join(__dirname, '../jsonkey/earnest-monitor-500903-u4-11a109fae258.json');
    if (fs.existsSync(keyPath)) {
        credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        console.log('✅ Service account key loaded.');
    } else {
        console.warn('⚠️ Key file not found at:', keyPath);
    }
} catch (e) {
    console.warn('⚠️ Failed to load service account key:', e);
}


router.post('/verify-integrity', async (req, res) => {
    const { integrityToken, packageName } = req.body;

    if (!integrityToken || !packageName) {
        return res.status(400).json({ error: 'Missing token or package name' });
    }

    if (!credentials) {
        return res.status(503).json({ error: 'Service account not configured' });
    }

    try {
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/playintegrity']
        });
        google.options({ auth });

        const playintegrity = google.playintegrity('v1');
        const response = await playintegrity.v1.decodeIntegrityToken({
            packageName,
            requestBody: { integrityToken }
        });

        const payload = response.data?.tokenPayloadExternal;
        if (!payload) {
            return res.status(400).json({ error: 'Invalid token – payload missing' });
        }

        const appVerdict = payload.appIntegrity?.appRecognitionVerdict ?? 'UNKNOWN';
        const deviceVerdict = payload.deviceIntegrity?.deviceRecognitionVerdict ?? [];
        const licenseVerdict = payload.accountDetails?.appLicensingVerdict ?? 'UNKNOWN';

        res.json({
            verified: appVerdict === 'PLAY_RECOGNIZED' &&
                      Array.isArray(deviceVerdict) &&
                      deviceVerdict.includes('MEETS_DEVICE_INTEGRITY') &&
                      licenseVerdict === 'LICENSED',
            appIntegrity: appVerdict,
            deviceIntegrity: deviceVerdict,
            licensing: licenseVerdict,
            packageName: payload.requestDetails?.requestPackageName ?? packageName,
            timestamp: payload.requestDetails?.timestampMillis ?? null
        });

    } catch (error: any) {
        console.error('Integrity error:', error);
        res.status(500).json({ error: error.message || 'Verification failed' });
    }
});

export default router;