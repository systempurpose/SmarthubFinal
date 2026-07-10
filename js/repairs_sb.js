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
 * Save a repair result – merges into a single row per (user_id, device_id).
 * If a row exists, it decrypts, merges the new action, and updates.
 * If not, it creates a new row.
 */
export async function saveRepairResult(resultData, deviceId) {
    const userId = getCurrentUserId();
    if (!userId) {
        console.warn('[Repairs] No user logged in – not saving.');
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

    // ---- Check for existing row ----
    const { data: existing, error: fetchError } = await supabase
        .from('repair_results')
        .select('details, summary, created_at')
        .eq('user_id', userId)
        .eq('device_id', finalDeviceId)
        .maybeSingle();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 means no rows found
        console.error('[Repairs] Fetch error:', fetchError);
        throw fetchError;
    }

    let combinedDetails = {};
    let allSummaries = [];
    let latestTimestamp = payload.createdAt;

    if (existing) {
        try {
            const decrypted = await decryptAndDecompress(existing.details);
            combinedDetails = decrypted.actions || {};
            // Add any existing summary to the list
            if (existing.summary) allSummaries.push(existing.summary);
            // Keep the latest timestamp from existing
            if (existing.created_at && new Date(existing.created_at) > new Date(latestTimestamp)) {
                latestTimestamp = existing.created_at;
            }
        } catch (e) {
            console.warn('[Repairs] Could not decrypt existing details, starting fresh.', e);
        }
    }

    // ---- Merge new action ----
    combinedDetails[payload.actionType] = {
        status: payload.status,
        summary: payload.summary,
        createdAt: payload.createdAt,
        details: payload.details
    };

    // Update latest timestamp if new action is newer
    if (new Date(payload.createdAt) > new Date(latestTimestamp)) {
        latestTimestamp = payload.createdAt;
    }

    // Build combined summary (list of action summaries)
    const summaryParts = Object.entries(combinedDetails).map(([action, data]) =>
        `${action}: ${data.status} (${data.summary})`
    );
    const combinedSummary = summaryParts.join('; ');

    const combinedPayload = {
        actions: combinedDetails,
        lastUpdated: latestTimestamp
    };

    const encrypted = await encryptCompressedData(combinedPayload);

    const record = {
        user_id: userId,
        device_id: finalDeviceId,
        device_model: deviceInfo.model || 'Unknown',
        device_brand: deviceInfo.brand || 'Unknown',
        android_version: deviceInfo.android || 'Unknown',
        action_type: 'combined',               // Indicates combined record
        status: 'combined',                    // Overall status (you can compute later)
        details: encrypted,
        summary: combinedSummary,
        created_at: latestTimestamp
    };

    // ---- Upsert (if exists, update; else insert) ----
    const { data, error } = await supabase
        .from('repair_results')
        .upsert(record, { onConflict: 'user_id, device_id' })
        .select();

    if (error) {
        console.error('[Repairs] Upsert failed:', error);
        // Fallback: delete + insert if upsert fails (e.g., no unique constraint)
        const { error: delError } = await supabase
            .from('repair_results')
            .delete()
            .eq('user_id', userId)
            .eq('device_id', finalDeviceId);
        if (delError) throw delError;
        const { data: insData, error: insError } = await supabase
            .from('repair_results')
            .insert(record)
            .select();
        if (insError) throw insError;
        console.log('✅ Inserted combined repair (delete+insert fallback)');
        return insData;
    }

    console.log('✅ Combined repair saved (upsert)');
    return data;
}

/**
 * Fetch the latest combined repair for a given user and device.
 */
export async function fetchLatestRepairScan(userId, deviceId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('repair_results')
        .select('details, created_at, summary')
        .eq('user_id', userId)
        .eq('device_id', deviceId)
        .maybeSingle();

    if (error || !data) return null;

    const decrypted = await decryptAndDecompress(data.details);
    return {
        actionType: 'combined',
        status: 'combined',
        summary: data.summary,
        details: decrypted,
        createdAt: data.created_at ? new Date(data.created_at).toLocaleString() : null,
        _source: 'supabase'
    };
}

/**
 * Fetch repair history – returns an array of individual actions
 * extracted from the combined row.
 */
export async function fetchRepairHistory(userId, deviceId, limit = 50) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('repair_results')
        .select('details, created_at, summary')
        .eq('user_id', userId)
        .eq('device_id', deviceId)
        .maybeSingle();

    if (error || !data) return [];

    const decrypted = await decryptAndDecompress(data.details);
    const actions = decrypted.actions || {};
    // Convert to array, most recent first
    const entries = Object.entries(actions).map(([actionType, actionData]) => ({
        actionType,
        status: actionData.status,
        summary: actionData.summary,
        details: actionData.details,
        createdAt: actionData.createdAt ? new Date(actionData.createdAt).toLocaleString() : null
    }));
    // Sort by createdAt descending
    entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return entries.slice(0, limit);
}