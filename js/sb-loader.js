// js/sb-loader.js
import { getSupabaseClient } from './supabase.js';
import { getCurrentUserId, getCurrentDeviceId, decryptAndDecompress } from './sb-utils.js';

/**
 * Fetch the latest app scan result for the given user and device.
 * Returns null if none found.
 */
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
// ---- Hardware Test Results ----
export async function fetchLatestHardwareScan(userId, deviceId) {
    const { fetchLatestHardwareTestResults } = await import('./hardware_sb.js');
    return fetchLatestHardwareTestResults(userId, deviceId);
}

export async function fetchLatestConnectionScan(userId, deviceId) {
    const { fetchLatestConnectionTestResults } = await import('./connection_sb.js');
    return fetchLatestConnectionTestResults(userId, deviceId);
}

export async function fetchLatestAdvancedScan(userId, deviceId) {
    const { fetchLatestAdvancedDiagnosticResults } = await import('./advanceDiagnostic_sb.js');
    return fetchLatestAdvancedDiagnosticResults(userId, deviceId);
}
// js/sb-loader.js (add these at the bottom or in the exports section)

// ---- Repair Results ----
export async function fetchLatestRepairScan(userId, deviceId) {
    const { fetchLatestRepairScan } = await import('./repairs_sb.js');
    return fetchLatestRepairScan(userId, deviceId);
}

export async function fetchRepairHistory(userId, deviceId, limit = 20) {
    const { fetchRepairHistory } = await import('./repairs_sb.js');
    return fetchRepairHistory(userId, deviceId, limit);
}
/**
 * Fetch the latest storage scan result for the given user and device.
 * Returns null if none found.
 */
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