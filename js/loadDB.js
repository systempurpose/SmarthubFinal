// ===== LOAD SAVED SCAN RESULTS (async, Supabase first) =====
async function loadSavedScanResults() {
    try {
        // Dynamically import Supabase helpers (since ui.js is not a module)
        const { getCurrentUserId, getCurrentDeviceId } = await import('./sb-utils.js');
        // 👇 NEW: import all loaders, including connection
        const { 
            fetchLatestAppScan, 
            fetchLatestStorageScan, 
            fetchLatestHardwareScan,
            fetchLatestAdvancedScan,
            fetchLatestConnectionScan   // 👈 NEW
        } = await import('./sb-loader.js');

        const userId = getCurrentUserId();
        const deviceId = getCurrentDeviceId() || window.currentDeviceId;

        // ---- App Scan ----
        let appResults = null;
        if (userId && deviceId) {
            try {
                appResults = await fetchLatestAppScan(userId, deviceId);
                console.log('[loadSavedScanResults] App scan loaded from Supabase');
            } catch (e) {
                console.warn('[loadSavedScanResults] Supabase app scan fetch failed:', e);
            }
        }
        if (!appResults) {
            appResults = loadAppScanResults(); // localStorage fallback
        }
        if (appResults) {
            renderAppScanResults(appResults);
        }

        // ---- Storage Scan ----
        let storageResults = null;
        if (userId && deviceId) {
            try {
                storageResults = await fetchLatestStorageScan(userId, deviceId);
                console.log('[loadSavedScanResults] Storage scan loaded from Supabase');
            } catch (e) {
                console.warn('[loadSavedScanResults] Supabase storage scan fetch failed:', e);
            }
        }
        if (!storageResults) {
            storageResults = loadStorageResults();
        }
        if (storageResults) {
            renderStorageResults(storageResults);
        }

        // ---- Hardware Tests ----
        let hardwareResults = null;
        if (userId && deviceId) {
            try {
                hardwareResults = await fetchLatestHardwareScan(userId, deviceId);
                console.log('[loadSavedScanResults] Hardware scan loaded from Supabase');
            } catch (e) {
                console.warn('[loadSavedScanResults] Supabase hardware scan fetch failed:', e);
            }
        }
        if (!hardwareResults) {
            hardwareResults = loadHardwareResults();
        }
        if (hardwareResults) {
            renderHardwareResults(hardwareResults);
        }

        // ---- Advanced Diagnostic ----
        let advancedResults = null;
        if (userId && deviceId) {
            try {
                advancedResults = await fetchLatestAdvancedScan(userId, deviceId);
                console.log('[loadSavedScanResults] Advanced scan loaded from Supabase');
            } catch (e) {
                console.warn('[loadSavedScanResults] Supabase advanced scan fetch failed:', e);
            }
        }
        if (!advancedResults) {
            advancedResults = loadAdvancedResults();
        }
        if (advancedResults) {
            renderAdvancedResults(advancedResults);
        }

        // ---- 👇 NEW: Connection Tests ----
        let connectionResults = null;
        if (userId && deviceId) {
            try {
                connectionResults = await fetchLatestConnectionScan(userId, deviceId);
                console.log('[loadSavedScanResults] Connection scan loaded from Supabase');
            } catch (e) {
                console.warn('[loadSavedScanResults] Supabase connection scan fetch failed:', e);
            }
        }
        if (!connectionResults) {
            connectionResults = loadConnectionResults();
        }
        if (connectionResults) {
            renderConnectionResults(connectionResults);
        }

    } catch (err) {
        console.warn('[loadSavedScanResults] Failed to load from Supabase, using localStorage only:', err);
        // Fallback: just load from localStorage
        const appResults = loadAppScanResults();
        if (appResults) renderAppScanResults(appResults);
        const storageResults = loadStorageResults();
        if (storageResults) renderStorageResults(storageResults);
        const hardwareResults = loadHardwareResults();
        if (hardwareResults) renderHardwareResults(hardwareResults);
        const advancedResults = loadAdvancedResults();
        if (advancedResults) renderAdvancedResults(advancedResults);
        const connectionResults = loadConnectionResults();
        if (connectionResults) renderConnectionResults(connectionResults);
    }
}

// ---- Expose globally so other modules can trigger a reload ----
window.loadSavedScanResults = loadSavedScanResults;