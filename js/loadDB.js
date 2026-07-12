// js/loadDB.js (excerpt – full function)
async function loadSavedScanResults() {
    try {
        const { getCurrentUserId, getCurrentDeviceId } = await import('./sb-utils.js');
        const { 
            fetchLatestAppScan, 
            fetchLatestStorageScan, 
            fetchLatestHardwareScan,
            fetchLatestAdvancedScan,
            fetchLatestConnectionScan,
            fetchLatestRepairScan
        } = await import('./sb-loader.js');

        const userId = getCurrentUserId();
        const deviceId = getCurrentDeviceId() || window.currentDeviceId;

        // ---- App Scan ----
        let appResults = null;
        if (userId && deviceId) {
            try {
                appResults = await fetchLatestAppScan(userId, deviceId);
            } catch (e) { /* ignore */ }
        }
        if (!appResults) appResults = loadAppScanResults();
        if (appResults && typeof renderAppScanResults === 'function') renderAppScanResults(appResults);

        // ---- Storage Scan ----
        let storageResults = null;
        if (userId && deviceId) {
            try {
                storageResults = await fetchLatestStorageScan(userId, deviceId);
            } catch (e) { /* ignore */ }
        }
        if (!storageResults) storageResults = loadStorageResults();
        if (storageResults && typeof renderStorageResults === 'function') renderStorageResults(storageResults);

        // ---- Hardware Tests ----
        let hardwareResults = null;
        if (userId && deviceId) {
            try {
                hardwareResults = await fetchLatestHardwareScan(userId, deviceId);
            } catch (e) { /* ignore */ }
        }
        if (!hardwareResults) hardwareResults = loadHardwareResults();
        if (hardwareResults && typeof renderHardwareResults === 'function') renderHardwareResults(hardwareResults);

        // ---- Advanced Diagnostic ----
        let advancedResults = null;
        if (userId && deviceId) {
            try {
                advancedResults = await fetchLatestAdvancedScan(userId, deviceId);
            } catch (e) { /* ignore */ }
        }
        if (!advancedResults) advancedResults = loadAdvancedResults();
        if (advancedResults && typeof renderAdvancedResults === 'function') renderAdvancedResults(advancedResults);

        // ---- Connection Tests ----
        let connectionResults = null;
        if (userId && deviceId) {
            try {
                connectionResults = await fetchLatestConnectionScan(userId, deviceId);
            } catch (e) { /* ignore */ }
        }
        if (!connectionResults) connectionResults = loadConnectionResults();
        if (connectionResults && typeof renderConnectionResults === 'function') renderConnectionResults(connectionResults);

        // ---- Repair Results ----
        let repairResults = null;
        if (userId && deviceId) {
            try {
                repairResults = await fetchLatestRepairScan(userId, deviceId);
            } catch (e) { /* ignore */ }
        }
        if (!repairResults) repairResults = typeof loadRepairResults === 'function' ? loadRepairResults() : null;
        if (repairResults && typeof renderRepairResults === 'function') renderRepairResults(repairResults);

        // ---- AI Conclusion (Summary) ----
        let aiConclusion = null;
        if (userId && deviceId) {
            try {
                const { fetchLatestAIConclusion } = await import('./aiConclusion_sb.js');
                aiConclusion = await fetchLatestAIConclusion(userId, deviceId);
                if (aiConclusion) {
                    console.log('[loadSavedScanResults] AI conclusion loaded from Supabase');
                }
            } catch (e) {
                console.warn('[loadSavedScanResults] Supabase AI conclusion fetch failed:', e);
            }
        }
        if (aiConclusion && typeof renderAIConclusionSummary === 'function') {
            renderAIConclusionSummary(aiConclusion);
        } else {
            const container = document.getElementById('aiConclusionSummary');
            if (container) container.style.display = 'none';
        }

    } catch (err) {
        console.warn('[loadSavedScanResults] Failed to load from Supabase, using localStorage only:', err);
        // Fallback to localStorage for all modules (already handled above)
    }
}