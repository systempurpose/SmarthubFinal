// js/aiConclusion_sb.js
import { getCurrentUserId, getCurrentDeviceId } from './sb-utils.js';
import {
    fetchLatestAppScan,
    fetchLatestStorageScan,
    fetchLatestHardwareScan,
    fetchLatestConnectionScan,
    fetchLatestAdvancedScan
} from './sb-loader.js';

/**
 * Fetch all scan results from Supabase for the current user and device.
 * Returns an object: { app, storage, hardware, connection, advanced }
 * Each property is the decrypted result or null if not found.
 * If the user is not logged in or no device is connected, returns null.
 */
export async function fetchAllScanResultsFromSupabase() {
    const userId = getCurrentUserId();
    const deviceId = getCurrentDeviceId() || window.currentDeviceId;

    if (!userId || !deviceId) {
        console.warn('[AI] No user or device – cannot fetch from Supabase.');
        return null;
    }

    // Fetch each scan type individually with error isolation
    const results = {
        app: null,
        storage: null,
        hardware: null,
        connection: null,
        advanced: null
    };

    // Helper to fetch a single type and log errors
    async function safeFetch(fn, name) {
        try {
            const data = await fn(userId, deviceId);
            if (data) {
                console.log(`[AI] Loaded ${name} from Supabase`);
            }
            return data;
        } catch (err) {
            console.warn(`[AI] Failed to load ${name} from Supabase:`, err);
            return null;
        }
    }

    // Run all fetches in parallel
    const [app, storage, hardware, connection, advanced] = await Promise.all([
        safeFetch(fetchLatestAppScan, 'app'),
        safeFetch(fetchLatestStorageScan, 'storage'),
        safeFetch(fetchLatestHardwareScan, 'hardware'),
        safeFetch(fetchLatestConnectionScan, 'connection'),
        safeFetch(fetchLatestAdvancedScan, 'advanced')
    ]);

    return { app, storage, hardware, connection, advanced };
}

/**
 * Optional: Fetch repair history as well (if you want to include it in AI context).
 * Uncomment if needed – you'll need to import fetchLatestRepairScan from sb-loader.js.
 */
/*
import { fetchLatestRepairScan } from './sb-loader.js';

export async function fetchAllScanResultsWithRepairs() {
    const base = await fetchAllScanResultsFromSupabase();
    if (!base) return null;
    const repair = await safeFetch(fetchLatestRepairScan, 'repair');
    return { ...base, repair };
}
*/