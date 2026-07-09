// ============================================================
//  Supabase Integration Module
//  Stores/retrieves all diagnostic data to/from Supabase.
//  Offline-first: localStorage is primary, sync is optional.
// ============================================================

(function() {
    'use strict';

    // ---- Configuration ----
    const CONFIG_KEY = 'supabaseConfig';
    const defaultConfig = {
        url: '',
        anonKey: '',
        enabled: false
    };

    let supabaseClient = null;
    let isInitialized = false;
    let syncInProgress = false;

    // ---- Helper: get config from localStorage ----
    function getConfig() {
        try {
            const raw = localStorage.getItem(CONFIG_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                return { ...defaultConfig, ...parsed };
            }
        } catch (e) { /* ignore */ }
        return { ...defaultConfig };
    }

    // ---- Helper: save config to localStorage ----
    function saveConfig(config) {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    }

    // ---- Initialize Supabase client ----
    async function initSupabase() {
        const config = getConfig();
        if (!config.url || !config.anonKey) {
            console.warn('[Supabase] Missing URL or anon key – sync disabled.');
            supabaseClient = null;
            isInitialized = false;
            return false;
        }

        try {
            // Using the global supabase from CDN (assumes script loaded)
            if (typeof supabase === 'undefined') {
                console.warn('[Supabase] Supabase library not loaded. Include <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
                return false;
            }
            supabaseClient = supabase.createClient(config.url, config.anonKey);
            isInitialized = true;
            console.log('[Supabase] Client initialized.');
            return true;
        } catch (err) {
            console.error('[Supabase] Initialization error:', err);
            supabaseClient = null;
            isInitialized = false;
            return false;
        }
    }

    // ---- Ensure client is ready ----
    async function ensureClient() {
        if (supabaseClient && isInitialized) return true;
        return await initSupabase();
    }

    // ---- Helper: get current device ID for records ----
    function getCurrentDeviceId() {
        return window.currentDeviceId || 'unknown';
    }

    // ---- Helper: generate unique ID for records ----
    function generateId() {
        return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 6);
    }

    // ============================================================
    //  SYNC: Push ALL local data to Supabase
    // ============================================================
    async function syncAllData() {
        if (syncInProgress) {
            console.warn('[Supabase] Sync already in progress.');
            return { success: false, message: 'Sync already in progress.' };
        }

        const ready = await ensureClient();
        if (!ready) {
            return { success: false, message: 'Supabase not configured or client init failed.' };
        }

        syncInProgress = true;
        const results = {
            total: 0,
            succeeded: 0,
            failed: 0,
            errors: []
        };

        const deviceId = getCurrentDeviceId();

        try {
            // 1. Device info (from localStorage)
            const deviceInfo = localStorage.getItem('deviceInfoCache');
            if (deviceInfo) {
                const parsed = JSON.parse(deviceInfo);
                const { error } = await supabaseClient
                    .from('devices')
                    .upsert({
                        device_id: deviceId,
                        manufacturer: parsed.manufacturer || 'Unknown',
                        model: parsed.model || 'Unknown',
                        android_version: parsed.androidVersion || 'Unknown',
                        last_synced: new Date().toISOString(),
                        raw_data: parsed
                    }, { onConflict: 'device_id' });
                if (error) {
                    results.errors.push('Device info: ' + error.message);
                    results.failed++;
                } else {
                    results.succeeded++;
                }
                results.total++;
            }

            // 2. App Security Scan results
            const appData = localStorage.getItem('smartHubAppScanResults');
            if (appData) {
                const parsed = JSON.parse(appData);
                const { error } = await supabaseClient
                    .from('diagnostic_results')
                    .upsert({
                        device_id: deviceId,
                        result_type: 'app_scan',
                        data: parsed,
                        timestamp: parsed.timestamp || new Date().toISOString(),
                        id: generateId()
                    }, { onConflict: 'id' });
                if (error) {
                    results.errors.push('App scan: ' + error.message);
                    results.failed++;
                } else {
                    results.succeeded++;
                }
                results.total++;
            }

            // 3. Storage Analysis results
            const storageData = localStorage.getItem('smartHubStorageResults');
            if (storageData) {
                const parsed = JSON.parse(storageData);
                const { error } = await supabaseClient
                    .from('diagnostic_results')
                    .upsert({
                        device_id: deviceId,
                        result_type: 'storage_analysis',
                        data: parsed,
                        timestamp: parsed.timestamp || new Date().toISOString(),
                        id: generateId()
                    }, { onConflict: 'id' });
                if (error) {
                    results.errors.push('Storage analysis: ' + error.message);
                    results.failed++;
                } else {
                    results.succeeded++;
                }
                results.total++;
            }

            // 4. Hardware Test results
            const hwData = localStorage.getItem('hardwareTestResults');
            if (hwData) {
                const parsed = JSON.parse(hwData);
                const { error } = await supabaseClient
                    .from('diagnostic_results')
                    .upsert({
                        device_id: deviceId,
                        result_type: 'hardware_tests',
                        data: parsed,
                        timestamp: parsed.timestamp || new Date().toISOString(),
                        id: generateId()
                    }, { onConflict: 'id' });
                if (error) {
                    results.errors.push('Hardware tests: ' + error.message);
                    results.failed++;
                } else {
                    results.succeeded++;
                }
                results.total++;
            }

            // 5. Connection Troubleshoot results
            const connData = localStorage.getItem('connectionTestResults');
            if (connData) {
                const parsed = JSON.parse(connData);
                const { error } = await supabaseClient
                    .from('diagnostic_results')
                    .upsert({
                        device_id: deviceId,
                        result_type: 'connection_tests',
                        data: parsed,
                        timestamp: parsed.timestamp || new Date().toISOString(),
                        id: generateId()
                    }, { onConflict: 'id' });
                if (error) {
                    results.errors.push('Connection tests: ' + error.message);
                    results.failed++;
                } else {
                    results.succeeded++;
                }
                results.total++;
            }

            // 6. Advanced Diagnostic results
            const advData = localStorage.getItem('advancedDiagnosticResults');
            if (advData) {
                const parsed = JSON.parse(advData);
                const { error } = await supabaseClient
                    .from('diagnostic_results')
                    .upsert({
                        device_id: deviceId,
                        result_type: 'advanced_diagnostic',
                        data: parsed,
                        timestamp: parsed.timestamp || new Date().toISOString(),
                        id: generateId()
                    }, { onConflict: 'id' });
                if (error) {
                    results.errors.push('Advanced diagnostic: ' + error.message);
                    results.failed++;
                } else {
                    results.succeeded++;
                }
                results.total++;
            }

            // 7. AI Conclusions (if any)
            const aiData = localStorage.getItem('aiConclusionCache');
            if (aiData) {
                const parsed = JSON.parse(aiData);
                const { error } = await supabaseClient
                    .from('diagnostic_results')
                    .upsert({
                        device_id: deviceId,
                        result_type: 'ai_conclusion',
                        data: parsed,
                        timestamp: parsed.timestamp || new Date().toISOString(),
                        id: generateId()
                    }, { onConflict: 'id' });
                if (error) {
                    results.errors.push('AI conclusion: ' + error.message);
                    results.failed++;
                } else {
                    results.succeeded++;
                }
                results.total++;
            }

            // 8. Also pull remote data to update local (optional)
            // (We'll implement pull separately)
            // For now, just push.

            results.success = results.failed === 0;
            console.log('[Supabase] Sync completed:', results);

        } catch (err) {
            console.error('[Supabase] Sync error:', err);
            results.errors.push('General error: ' + err.message);
            results.failed++;
            results.success = false;
        } finally {
            syncInProgress = false;
        }

        return results;
    }

    // ---- Pull remote data and merge into localStorage ----
    async function pullData() {
        const ready = await ensureClient();
        if (!ready) return { success: false, message: 'Supabase not configured.' };

        const deviceId = getCurrentDeviceId();

        try {
            // Fetch all diagnostic results for this device
            const { data, error } = await supabaseClient
                .from('diagnostic_results')
                .select('*')
                .eq('device_id', deviceId)
                .order('timestamp', { ascending: false });

            if (error) throw error;

            let pulled = 0;
            for (const record of data) {
                const type = record.result_type;
                const dataObj = record.data;
                // Store in localStorage under the same keys as local saves
                let key = null;
                if (type === 'app_scan') key = 'smartHubAppScanResults';
                else if (type === 'storage_analysis') key = 'smartHubStorageResults';
                else if (type === 'hardware_tests') key = 'hardwareTestResults';
                else if (type === 'connection_tests') key = 'connectionTestResults';
                else if (type === 'advanced_diagnostic') key = 'advancedDiagnosticResults';
                else if (type === 'ai_conclusion') key = 'aiConclusionCache';
                if (key) {
                    localStorage.setItem(key, JSON.stringify(dataObj));
                    pulled++;
                }
            }

            return { success: true, pulled };
        } catch (err) {
            console.error('[Supabase] Pull error:', err);
            return { success: false, message: err.message };
        }
    }

    // ---- Public API ----
    const SupabaseManager = {
        init: initSupabase,
        syncAll: syncAllData,
        pull: pullData,
        getConfig,
        saveConfig,
        isEnabled: () => getConfig().enabled,
        isSyncing: () => syncInProgress,
        getClient: () => supabaseClient
    };

    // Expose globally
    window.SupabaseManager = SupabaseManager;

    // Auto-init on page load if config exists
    document.addEventListener('DOMContentLoaded', () => {
        const config = getConfig();
        if (config.url && config.anonKey) {
            initSupabase().then(ok => {
                if (ok) {
                    console.log('[Supabase] Auto-initialized.');
                }
            });
        }
    });

})();