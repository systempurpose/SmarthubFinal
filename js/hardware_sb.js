// js/hardware_sb.js
import { getSupabaseClient } from './supabase.js';
import { getCurrentUserId, getCurrentDeviceInfo, getCurrentDeviceId, encryptCompressedData, decryptAndDecompress } from './sb-utils.js';

export async function saveHardwareTestResults(results, deviceId) {
    const userId = getCurrentUserId();
    if (!userId) {
        console.warn('No user logged in – hardware test results not saved to Supabase.');
        return null;
    }

    const finalDeviceId = deviceId || getCurrentDeviceId();
    if (!finalDeviceId) {
        console.warn('No device connected – hardware test results not saved.');
        return null;
    }

    const deviceInfo = getCurrentDeviceInfo();

    const payload = {
        results: results.results || {},
        summary: results.summary || null,
        scanTime: results.scanTime || new Date().toISOString(),
    };

    const encrypted = await encryptCompressedData(payload);

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('hardware_test_results')
        .upsert({
            user_id: userId,
            device_id: finalDeviceId,
            device_model: deviceInfo.model,
            device_brand: deviceInfo.brand,
            android_version: deviceInfo.android,
            results: encrypted,
            summary: payload.summary ? `${payload.summary.passed}/${payload.summary.total} passed` : null,
            scan_time: payload.scanTime,
        }, { onConflict: 'user_id, device_id' })   // 👈 FIXED: use column names
        .select();

    if (error) {
        console.error('Failed to save hardware test results to Supabase:', error);
        throw error;
    }
    console.log('✅ Hardware test results saved to Supabase (upserted)');
    return data;
}

export async function fetchLatestHardwareTestResults(userId, deviceId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('hardware_test_results')
        .select('results, scan_time, summary')
        .eq('user_id', userId)
        .eq('device_id', deviceId)
        .maybeSingle();

    if (error) {
        console.warn('Failed to fetch hardware test results from Supabase:', error);
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