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