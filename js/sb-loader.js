// js/sb-loader.js
import { getSupabaseClient } from './supabase.js';
import { getCurrentUserId, getCurrentDeviceId, decryptAndDecompress } from './sb-utils.js';

// ---- User Profile ----
export async function fetchUserProfile(userId) {
    // If userId not provided, get current user
    const finalUserId = userId || getCurrentUserId();
    if (!finalUserId) {
        console.warn('No user ID provided for profile fetch.');
        return null;
    }

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('user_account')
        .select('id, email, name, avatar_url, confirmed, created_at, updated_at')
        .eq('id', finalUserId)
        .single();

    if (error) {
        console.warn('Failed to fetch user profile from Supabase:', error);
        return null;
    }
    return data;
}

// ---- App Scan ----
export async function fetchLatestAppScan(userId, deviceId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('app_scan_results')
        .select('results, scan_time, summary')
        .eq('user_id', userId)
        .eq('device_id', deviceId)
        .order('scan_time', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.warn('Failed to fetch app scan from Supabase:', error);
        return null;
    }
    if (!data) return null;

    const decrypted = await decryptAndDecompress(data.results);
    return {
        ...decrypted,
        scanTime: data.scan_time ? new Date(data.scan_time).toLocaleString() : null,
        summary: data.summary,
        _source: 'supabase'
    };
}

// ---- Storage Scan ----
export async function fetchLatestStorageScan(userId, deviceId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('storage_scan_results')
        .select('results, scan_time, summary')
        .eq('user_id', userId)
        .eq('device_id', deviceId)
        .order('scan_time', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.warn('Failed to fetch storage scan from Supabase:', error);
        return null;
    }
    if (!data) return null;

    const decrypted = await decryptAndDecompress(data.results);
    return {
        ...decrypted,
        scanTime: data.scan_time ? new Date(data.scan_time).toLocaleString() : null,
        summary: data.summary,
        _source: 'supabase'
    };
}

// ---- Hardware ----
export async function fetchLatestHardwareScan(userId, deviceId) {
    const { fetchLatestHardwareTestResults } = await import('./hardware_sb.js');
    return fetchLatestHardwareTestResults(userId, deviceId);
}

// ---- Connection ----
export async function fetchLatestConnectionScan(userId, deviceId) {
    const { fetchLatestConnectionTestResults } = await import('./connection_sb.js');
    return fetchLatestConnectionTestResults(userId, deviceId);
}

// ---- Advanced ----
export async function fetchLatestAdvancedScan(userId, deviceId) {
    const { fetchLatestAdvancedDiagnosticResults } = await import('./advanceDiagnostic_sb.js');
    return fetchLatestAdvancedDiagnosticResults(userId, deviceId);
}

// ---- Repair ----
export async function fetchLatestRepairScan(userId, deviceId) {
    const { fetchLatestRepairScan } = await import('./repairs_sb.js');
    return fetchLatestRepairScan(userId, deviceId);
}

export async function fetchRepairHistory(userId, deviceId, limit = 20) {
    const { fetchRepairHistory } = await import('./repairs_sb.js');
    return fetchRepairHistory(userId, deviceId, limit);
}

// ---- AI Conclusion ----
export async function fetchLatestAIConclusion(userId, deviceId) {
    const { fetchLatestAIConclusion } = await import('./aiConclusion_sb.js');
    return fetchLatestAIConclusion(userId, deviceId);
}

// ---- Combined loader for all scans (used by AI Conclusion) ----
export async function fetchAllScanResultsFromSupabase() {
    const userId = getCurrentUserId();
    const deviceId = getCurrentDeviceId() || window.currentDeviceId;
    if (!userId || !deviceId) return null;

    const results = {};
    try {
        results.app = await fetchLatestAppScan(userId, deviceId);
        results.storage = await fetchLatestStorageScan(userId, deviceId);
        results.hardware = await fetchLatestHardwareScan(userId, deviceId);
        results.connection = await fetchLatestConnectionScan(userId, deviceId);
        results.advanced = await fetchLatestAdvancedScan(userId, deviceId);
        results.repair = await fetchLatestRepairScan(userId, deviceId);
        results.ai = await fetchLatestAIConclusion(userId, deviceId);
        // Include user profile if needed
        results.profile = await fetchUserProfile(userId);
    } catch (e) {
        console.warn('[fetchAllScanResultsFromSupabase] Error:', e);
    }
    return results;
}