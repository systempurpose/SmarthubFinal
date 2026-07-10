// js/app_scan_sb.js
import { getSupabaseClient } from './supabase.js';
import { getCurrentUserId, getCurrentDeviceInfo, getCurrentDeviceId, encryptCompressedData } from './sb-utils.js';

export async function saveAppScanToSupabase(results, deviceId) {
    const userId = getCurrentUserId();
    if (!userId) {
        console.warn('No user logged in – app scan not saved.');
        return null;
    }

    const finalDeviceId = deviceId || getCurrentDeviceId();
    if (!finalDeviceId) {
        console.warn('No device connected – app scan not saved.');
        return null;
    }

    const deviceInfo = getCurrentDeviceInfo();

    const payload = {
        suspiciousApps: results.suspiciousApps || [],
        summary: {
            totalApps: results.totalApps || 0,
            suspiciousCount: results.suspiciousApps ? results.suspiciousApps.length : 0,
            riskCounts: {
                critical: results.suspiciousApps ? results.suspiciousApps.filter(a => a.riskScore >= 80).length : 0,
                high: results.suspiciousApps ? results.suspiciousApps.filter(a => a.riskScore >= 60 && a.riskScore < 80).length : 0,
                medium: results.suspiciousApps ? results.suspiciousApps.filter(a => a.riskScore >= 35 && a.riskScore < 60).length : 0,
                low: results.suspiciousApps ? results.suspiciousApps.filter(a => a.riskScore < 35).length : 0,
            },
        },
        scanTime: results.scanTime || new Date().toISOString(),
    };

    const encrypted = await encryptCompressedData(payload);

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('app_scan_results')
        .upsert({
            user_id: userId,
            device_id: finalDeviceId,
            device_model: deviceInfo.model,
            device_brand: deviceInfo.brand,
            android_version: deviceInfo.android,
            results: encrypted,
            summary: `Suspicious: ${payload.summary.suspiciousCount} / ${payload.summary.totalApps} apps`,
            scan_time: new Date().toISOString(),
        }, { onConflict: 'user_id, device_id' })   // 👈 FIXED: use column names
        .select();

    if (error) {
        console.error('Failed to save app scan to Supabase:', error);
        throw error;
    }
    console.log('✅ App scan saved to Supabase (upserted)');
    return data;
}