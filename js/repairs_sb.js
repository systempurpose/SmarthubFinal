// js/repairs_sb.js
import { getSupabaseClient } from './supabase.js';
import {
    getCurrentUserId,
    getCurrentDeviceInfo,
    getCurrentDeviceId,
    encryptCompressedData,
    decryptAndDecompress
} from './sb-utils.js';

/**
 * Save a repair result – keeps only the latest per (user_id, device_id, action_type).
 * Deletes any existing row for the same action, then inserts the new one.
 */
export async function saveRepairResult(resultData, deviceId) {
    const userId = getCurrentUserId();
    if (!userId) {
        console.warn('[Repairs] No user logged in – not saving to Supabase.');
        return null;
    }

    const finalDeviceId = deviceId || getCurrentDeviceId();
    if (!finalDeviceId) {
        console.warn('[Repairs] No device connected – not saving.');
        return null;
    }

    const deviceInfo = getCurrentDeviceInfo();

    const payload = {
        actionType: resultData.actionType || 'unknown',
        status: resultData.status || 'unknown',
        details: resultData.details || {},
        summary: resultData.summary || '',
        createdAt: resultData.createdAt || new Date().toISOString()
    };

    const supabase = await getSupabaseClient();

    // ---- For retrieve_email: skip if no emails ----
    if (payload.actionType === 'retrieve_email') {
        const emails = payload.details.emails;
        if (!emails || !Array.isArray(emails) || emails.length === 0) {
            console.log('[Repairs] No emails found – skipping save.');
            return null;
        }
    }

    // ---- Delete existing row for this (user_id, device_id, action_type) ----
    const { error: deleteError } = await supabase
        .from('repair_results')
        .delete()
        .eq('user_id', userId)
        .eq('device_id', finalDeviceId)
        .eq('action_type', payload.actionType);

    if (deleteError) {
        console.error('[Repairs] Failed to delete existing entry:', deleteError);
        // Continue to insert anyway (maybe no existing row)
    }

    // ---- Insert the new row ----
    const encrypted = await encryptCompressedData(payload);
    const record = {
        user_id: userId,
        device_id: finalDeviceId,
        device_model: deviceInfo.model || 'Unknown',
        device_brand: deviceInfo.brand || 'Unknown',
        android_version: deviceInfo.android || 'Unknown',
        action_type: payload.actionType,
        status: payload.status,
        details: encrypted,
        summary: payload.summary,
        created_at: payload.createdAt
    };

    const { data, error } = await supabase
        .from('repair_results')
        .insert(record)
        .select();

    if (error) {
        console.error('[Repairs] Insert failed:', error);
        throw error;
    }

    console.log(`✅ ${payload.actionType} result saved (overwrote previous)`);
    return data;
}

/**
 * Fetch the latest repair result for a given user and device (any action).
 */
export async function fetchLatestRepairScan(userId, deviceId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('repair_results')
        .select('details, created_at, action_type, status, summary')
        .eq('user_id', userId)
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.warn('[Repairs] Failed to fetch latest repair:', error);
        return null;
    }
    if (!data) return null;

    const decrypted = await decryptAndDecompress(data.details);
    return {
        actionType: data.action_type,
        status: data.status,
        summary: data.summary,
        details: decrypted,
        createdAt: data.created_at ? new Date(data.created_at).toLocaleString() : null,
        _source: 'supabase'
    };
}

/**
 * Fetch repair history – now each action type has only one row (the latest).
 */
export async function fetchRepairHistory(userId, deviceId, limit = 50) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('repair_results')
        .select('details, created_at, action_type, status, summary')
        .eq('user_id', userId)
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.warn('[Repairs] Failed to fetch repair history:', error);
        return [];
    }

    const history = [];
    for (const row of data) {
        try {
            const decrypted = await decryptAndDecompress(row.details);
            history.push({
                actionType: row.action_type,
                status: row.status,
                summary: row.summary,
                details: decrypted,      // decrypted is the full payload
                createdAt: row.created_at ? new Date(row.created_at).toLocaleString() : null
            });
        } catch (e) {
            console.warn('[Repairs] Failed to decrypt a repair record:', e);
        }
    }
    return history;
}