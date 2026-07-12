// js/aiConclusion_sb.js
import { getSupabaseClient } from './supabase.js';
import { getCurrentUserId, getCurrentDeviceInfo, getCurrentDeviceId } from './sb-utils.js';

/**
 * Save (upsert) AI conclusion results to Supabase.
 * @param {Object} conclusionData - Contains:
 *   - selectedReports: string[] (report IDs used)
 *   - userInput: string (user's symptom description)
 *   - conclusionText: string (human-readable summary)
 *   - confidence: number (0-1)
 *   - actions: string[] (recommended actions)
 *   - nextStep: string
 *   - details: string (technical details, JSON string)
 *   - lang: string (language code)
 * @param {string} deviceId - Optional; if not provided, uses current device.
 * @returns {Promise<Object|null>} The inserted/updated record.
 */
export async function saveAIConclusion(conclusionData, deviceId) {
    const userId = getCurrentUserId();
    if (!userId) {
        console.warn('No user logged in – AI conclusion not saved.');
        return null;
    }

    const finalDeviceId = deviceId || getCurrentDeviceId();
    if (!finalDeviceId) {
        console.warn('No device connected – AI conclusion not saved.');
        return null;
    }

    const deviceInfo = getCurrentDeviceInfo();

    const record = {
        user_id: userId,
        device_id: finalDeviceId,
        device_model: deviceInfo.model || null,
        device_brand: deviceInfo.brand || null,
        android_version: deviceInfo.android || null,
        selected_reports: conclusionData.selectedReports || [],
        user_input: conclusionData.userInput || null,
        conclusion_text: conclusionData.conclusionText || '',
        confidence: conclusionData.confidence !== undefined ? conclusionData.confidence : null,
        actions: conclusionData.actions || [],
        next_step: conclusionData.nextStep || null,
        details: conclusionData.details || null,
        lang: conclusionData.lang || 'en',
        updated_at: new Date().toISOString(),
    };

    const supabase = await getSupabaseClient();

    // ---- Attempt 1: Upsert (requires unique constraint) ----
    try {
        const { data, error } = await supabase
            .from('ai_conclusion_results')
            .upsert(record, { onConflict: 'user_id, device_id' })
            .select();

        if (error) throw error;
        console.log('✅ AI conclusion saved to Supabase (upsert)');
        return data?.[0] || null;
    } catch (upsertErr) {
        // ---- Attempt 2: Delete + Insert fallback ----
        console.warn('Upsert failed, falling back to delete+insert:', upsertErr.message);

        const { error: deleteError } = await supabase
            .from('ai_conclusion_results')
            .delete()
            .eq('user_id', userId)
            .eq('device_id', finalDeviceId);

        if (deleteError) {
            console.error('Delete failed:', deleteError);
            throw deleteError;
        }

        const { data, error: insertError } = await supabase
            .from('ai_conclusion_results')
            .insert(record)
            .select();

        if (insertError) {
            console.error('Insert failed:', insertError);
            throw insertError;
        }

        console.log('✅ AI conclusion saved to Supabase (delete+insert)');
        return data?.[0] || null;
    }
}

/**
 * Fetch the latest AI conclusion for the given user and device.
 * @param {string} userId - Optional; if not provided, uses current user.
 * @param {string} deviceId - Optional; if not provided, uses current device.
 * @returns {Promise<Object|null>} The latest conclusion record, or null.
 */
export async function fetchLatestAIConclusion(userId, deviceId) {
    const finalUserId = userId || getCurrentUserId();
    const finalDeviceId = deviceId || getCurrentDeviceId();

    if (!finalUserId || !finalDeviceId) {
        console.warn('Missing userId or deviceId for AI conclusion fetch.');
        return null;
    }

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('ai_conclusion_results')
        .select('*')
        .eq('user_id', finalUserId)
        .eq('device_id', finalDeviceId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.warn('Failed to fetch AI conclusion from Supabase:', error);
        return null;
    }
    return data || null;
}

// ---- Re‑export the combined scan loader from sb-loader.js ----
// This allows aiConclusion.js to import fetchAllScanResultsFromSupabase
// from the same file, as it does currently.
export { fetchAllScanResultsFromSupabase } from './sb-loader.js';