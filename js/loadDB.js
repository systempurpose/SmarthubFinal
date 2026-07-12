// js/loadDB.js
async function loadSavedScanResults() {
    try {
        const { getCurrentUserId, getCurrentDeviceId } = await import('./sb-utils.js');
        const { 
            fetchLatestAppScan, 
            fetchLatestStorageScan, 
            fetchLatestHardwareScan,
            fetchLatestAdvancedScan,
            fetchLatestConnectionScan,
            fetchLatestRepairScan,
            fetchUserProfile  // ADD THIS
        } = await import('./sb-loader.js');

        const userId = getCurrentUserId();
        const deviceId = getCurrentDeviceId() || window.currentDeviceId;

        // ---- Load User Profile (NEW) ----
        if (userId) {
            try {
                const profile = await fetchUserProfile(userId);
                if (profile) {
                    // Update sidebar with name/avatar
                    if (typeof window.updateSidebarUser === 'function') {
                        window.updateSidebarUser(profile);
                    }
                    // Render a profile summary card on dashboard (optional)
                    if (typeof renderProfileSummary === 'function') {
                        renderProfileSummary(profile);
                    }
                }
            } catch (e) {
                console.warn('[loadSavedScanResults] Failed to fetch user profile:', e);
            }
        }

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

// ---- Optional: Render a profile summary card on the dashboard ----
function renderProfileSummary(profile) {
    const container = document.getElementById('profileSummary');
    if (!container) return;
    if (!profile) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';
    const name = profile.name || profile.email || 'User';
    const avatar = profile.avatar_url || '';
    const confirmed = profile.confirmed || false;
    container.innerHTML = `
        <div class="card" style="border-left: 4px solid ${confirmed ? '#16a34a' : '#f59e0b'}; margin-bottom: 16px;">
            <div class="card-title" style="display:flex; align-items:center; gap:12px;">
                <div style="width:40px; height:40px; border-radius:50%; overflow:hidden; background:#e2e8f0; display:flex; align-items:center; justify-content:center;">
                    ${avatar ? `<img src="${avatar}" style="width:100%; height:100%; object-fit:cover;">` : `<span style="font-size:20px; font-weight:600; color:#64748b;">${name.charAt(0).toUpperCase()}</span>`}
                </div>
                <span><strong>${name}</strong> ${confirmed ? '✅' : '⚠️'}</span>
                <span style="font-size:12px; color:#6b7280; margin-left:auto;">
                    ${confirmed ? 'Email confirmed' : 'Email not confirmed'}
                </span>
            </div>
        </div>
    `;
}