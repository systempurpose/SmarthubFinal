// js/connection_sb.js
import { getSupabaseClient } from './supabase.js';
import { getCurrentUserId, getCurrentDeviceInfo, getCurrentDeviceId, encryptCompressedData, decryptAndDecompress } from './sb-utils.js';

export async function saveConnectionTestResults(results, deviceId) {
    const userId = getCurrentUserId();
    if (!userId) {
        console.warn('No user logged in – connection test results not saved to Supabase.');
        return null;
    }

    const finalDeviceId = deviceId || getCurrentDeviceId();
    if (!finalDeviceId) {
        console.warn('No device connected – connection test results not saved.');
        return null;
    }

    const deviceInfo = getCurrentDeviceInfo();

    const payload = {
        results: results.results || {},
        scanTime: results.scanTime || new Date().toISOString(),
    };

    const encrypted = await encryptCompressedData(payload);

    const supabase = await getSupabaseClient();

    const record = {
        user_id: userId,
        device_id: finalDeviceId,
        device_model: deviceInfo.model,
        device_brand: deviceInfo.brand,
        android_version: deviceInfo.android,
        results: encrypted,
        summary: Object.values(results.results).filter(r => r.passed).length + '/' + Object.keys(results.results).length + ' passed',
        scan_time: payload.scanTime,
    };

    // ---- Attempt 1: Upsert (requires unique constraint) ----
    try {
        const { data, error } = await supabase
            .from('connection_test_results')
            .upsert(record, { onConflict: 'user_id, device_id' })
            .select();

        if (error) throw error;
        console.log('✅ Connection test results saved to Supabase (upsert)');
        return data;
    } catch (upsertErr) {
        // ---- Attempt 2: Delete + Insert fallback ----
        console.warn('Upsert failed, falling back to delete+insert:', upsertErr.message);

        const { error: deleteError } = await supabase
            .from('connection_test_results')
            .delete()
            .eq('user_id', userId)
            .eq('device_id', finalDeviceId);

        if (deleteError) {
            console.error('Delete failed:', deleteError);
            throw deleteError;
        }

        const { data, error: insertError } = await supabase
            .from('connection_test_results')
            .insert(record)
            .select();

        if (insertError) {
            console.error('Insert failed:', insertError);
            throw insertError;
        }

        console.log('✅ Connection test results saved to Supabase (delete+insert)');
        return data;
    }
}

export async function fetchLatestConnectionTestResults(userId, deviceId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('connection_test_results')
        .select('results, scan_time, summary')
        .eq('user_id', userId)
        .eq('device_id', deviceId)
        .order('scan_time', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.warn('Failed to fetch connection test results from Supabase:', error);
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