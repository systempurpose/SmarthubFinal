// js/storage_analysis_sb.js
import { getSupabaseClient } from './supabase.js';
import { getCurrentUserId, getCurrentDeviceInfo, encryptCompressedData } from './sb-utils.js';

export async function saveStorageAnalysisToSupabase(results, deviceId) {
    const userId = getCurrentUserId();
    if (!userId) {
        console.warn('No user logged in – storage analysis not saved.');
        return null;
    }

    const finalDeviceId = deviceId || getCurrentDeviceId();
    if (!finalDeviceId) {
        console.warn('No device connected – storage analysis not saved.');
        return null;
    }

    const deviceInfo = getCurrentDeviceInfo();

    const payload = {
        files: results.files || [],
        summary: {
            totalFiles: results.files ? results.files.length : 0,
            totalSize: results.files ? results.files.reduce((s, f) => s + (f.bytes || 0), 0) : 0,
            categories: results.categories || {},
            storageUsed: results.storageUsed || null,
            storageTotal: results.storageTotal || null,
            percentUsed: results.percentUsed || null,
        },
        scanTime: results.scanTime || new Date().toISOString(),
    };

    const encrypted = await encryptCompressedData(payload);

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('storage_scan_results')
        .insert({
            user_id: userId,
            device_id: finalDeviceId,
            device_model: deviceInfo.model,
            device_brand: deviceInfo.brand,
            android_version: deviceInfo.android,
            results: encrypted,
            summary: `Files: ${payload.summary.totalFiles}, Size: ${(payload.summary.totalSize / (1024*1024*1024)).toFixed(2)} GB`,
            scan_time: new Date().toISOString(),
        });

    if (error) {
        console.error('Failed to save storage analysis to Supabase:', error);
        throw error;
    }
    console.log('✅ Storage analysis saved to Supabase');
    return data;
}