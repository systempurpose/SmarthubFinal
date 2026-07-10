// ===== LOAD SAVED SCAN RESULTS (async, Supabase first) =====
async function loadSavedScanResults() {
    try {
        // Dynamically import Supabase helpers (since ui.js is not a module)
        const { getCurrentUserId, getCurrentDeviceId } = await import('./sb-utils.js');
        const { 
            fetchLatestAppScan, 
            fetchLatestStorageScan, 
            fetchLatestHardwareScan,
            fetchLatestAdvancedScan,
            fetchLatestConnectionScan,
            fetchLatestRepairScan   // 👈 NEW
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
        if (appResults && typeof renderAppScanResults === 'function') {
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
        if (storageResults && typeof renderStorageResults === 'function') {
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
        if (hardwareResults && typeof renderHardwareResults === 'function') {
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
        if (advancedResults && typeof renderAdvancedResults === 'function') {
            renderAdvancedResults(advancedResults);
        }

        // ---- Connection Tests ----
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
        if (connectionResults && typeof renderConnectionResults === 'function') {
            renderConnectionResults(connectionResults);
        }

        // ---- 🆕 Repair Results ----
        let repairResults = null;
        if (userId && deviceId) {
            try {
                repairResults = await fetchLatestRepairScan(userId, deviceId);
                console.log('[loadSavedScanResults] Repair scan loaded from Supabase');
            } catch (e) {
                console.warn('[loadSavedScanResults] Supabase repair scan fetch failed:', e);
            }
        }
        if (!repairResults) {
            repairResults = typeof loadRepairResults === 'function' ? loadRepairResults() : null;
        }
        if (repairResults && typeof renderRepairResults === 'function') {
            renderRepairResults(repairResults); // uses #repairResults container
        }

    } catch (err) {
        console.warn('[loadSavedScanResults] Failed to load from Supabase, using localStorage only:', err);
        // Fallback: just load from localStorage (with existence checks)
        try {
            const appResults = loadAppScanResults();
            if (appResults && typeof renderAppScanResults === 'function') renderAppScanResults(appResults);
        } catch (e) { /* ignore */ }

        try {
            const storageResults = loadStorageResults();
            if (storageResults && typeof renderStorageResults === 'function') renderStorageResults(storageResults);
        } catch (e) { /* ignore */ }

        try {
            const hardwareResults = loadHardwareResults();
            if (hardwareResults && typeof renderHardwareResults === 'function') renderHardwareResults(hardwareResults);
        } catch (e) { /* ignore */ }

        try {
            const advancedResults = loadAdvancedResults();
            if (advancedResults && typeof renderAdvancedResults === 'function') renderAdvancedResults(advancedResults);
        } catch (e) { /* ignore */ }

        try {
            const connectionResults = loadConnectionResults();
            if (connectionResults && typeof renderConnectionResults === 'function') renderConnectionResults(connectionResults);
        } catch (e) { /* ignore */ }

        try {
            const repairResults = typeof loadRepairResults === 'function' ? loadRepairResults() : null;
            if (repairResults && typeof renderRepairResults === 'function') renderRepairResults(repairResults);
        } catch (e) { /* ignore */ }
    }
}

// ---- Expose globally ----
window.loadSavedScanResults = loadSavedScanResults;

// 👇 IMPORTANT: Ensure these helpers are defined in ui.js (or loadDB.js):
/*
function renderAdvancedResults(results) { /* ... * / }
function renderConnectionResults(results) { /* ... * / }
function renderRepairResults(results, containerId = 'repairResults') { /* ... * / }
function loadRepairResults() { try { return JSON.parse(localStorage.getItem('smartHubRepairResults')); } catch { return null; } }
function saveRepairResults(results) { localStorage.setItem('smartHubRepairResults', JSON.stringify(results)); }
*/