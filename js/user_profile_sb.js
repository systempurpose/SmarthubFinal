// js/user_profile_sb.js
import { getSupabaseClient } from './supabase.js';

/**
 * Compute SHA-256 hash of an email
 */
async function hashEmail(email) {
    const normalized = email.trim().toLowerCase();
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Save user profile – plaintext (no encryption).
 */
export async function saveUserProfile(profileData, userId) {
    console.log('🔍 saveUserProfile called with:', { profileData, userId });

    if (!userId) {
        console.warn('❌ No userId provided.');
        return null;
    }

    let email = null;
    const stored = localStorage.getItem('smarthub.user');
    if (stored) {
        try {
            const user = JSON.parse(stored);
            email = user.email;
        } catch {}
    }
    if (!email) {
        console.warn('❌ No email found.');
        return null;
    }

    const emailHash = await hashEmail(email);
    const supabase = await getSupabaseClient();

    // Check if row exists
    const { data: existingRow, error: findError } = await supabase
        .from('user_account')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

    if (findError) {
        console.error('❌ Error checking existence:', findError);
        throw new Error(`Lookup failed: ${findError.message}`);
    }

    // Build record – ensure values are passed correctly
    const record = {
        name: profileData.name !== undefined ? profileData.name : null,
        avatar_url: profileData.avatar_url !== undefined ? profileData.avatar_url : null,
        confirmed: profileData.confirmed !== undefined ? profileData.confirmed : false,
        updated_at: new Date().toISOString(),
    };

    console.log('📤 Final update record:', record);

    let result = null;

    if (existingRow) {
        // UPDATE
        const { data, error } = await supabase
            .from('user_account')
            .update(record)
            .eq('id', userId)
            .select('*');

        if (error) {
            console.error('❌ Update failed:', error);
            throw new Error(`Update failed: ${error.message}`);
        }

        console.log('📡 Update response data:', data);

        if (!data || data.length === 0) {
            // If update returns no rows, fetch the row directly
            console.warn('⚠️ Update returned no rows – fetching row by id:', userId);
            const { data: fetched, error: fetchErr } = await supabase
                .from('user_account')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (fetchErr) {
                console.error('❌ Fetch after update failed:', fetchErr);
                throw new Error(`Fetch after update failed: ${fetchErr.message}`);
            }

            if (!fetched) {
                // Row missing – insert as fallback
                console.warn('⚠️ Row not found after update – inserting new row.');
                const insertRecord = {
                    id: userId,
                    email: email,
                    email_hash: emailHash,
                    password: emailHash,
                    name: record.name,
                    avatar_url: record.avatar_url,
                    confirmed: record.confirmed,
                    created_at: new Date().toISOString(),
                    updated_at: record.updated_at,
                };
                const { data: insertData, error: insertError } = await supabase
                    .from('user_account')
                    .insert(insertRecord)
                    .select('*');
                if (insertError) {
                    console.error('❌ Insert failed:', insertError);
                    throw new Error(`Insert failed: ${insertError.message}`);
                }
                result = insertData?.[0] || null;
            } else {
                result = fetched;
            }
        } else {
            result = data[0];
        }
        console.log('✅ Profile updated (or fetched)');
    } else {
        // INSERT
        const insertRecord = {
            id: userId,
            email: email,
            email_hash: emailHash,
            password: emailHash,
            name: record.name,
            avatar_url: record.avatar_url,
            confirmed: record.confirmed,
            created_at: new Date().toISOString(),
            updated_at: record.updated_at,
        };

        const { data, error } = await supabase
            .from('user_account')
            .insert(insertRecord)
            .select('*');

        if (error) {
            console.error('❌ Insert failed:', error);
            throw new Error(`Insert failed: ${error.message}`);
        }
        result = data?.[0] || null;
        console.log('✅ Profile inserted');
    }

    if (!result) {
        throw new Error('No rows affected – profile not saved.');
    }

    console.log('🎯 Final result:', result);
    return result;
}

/**
 * Fetch user profile – plaintext.
 */
export async function fetchUserProfile() {
    let userId = null;
    const stored = localStorage.getItem('smarthub.user');
    if (stored) {
        try {
            const user = JSON.parse(stored);
            userId = user.id;
        } catch {}
    }
    if (!userId) {
        console.warn('No user ID found.');
        return null;
    }

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('user_account')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

    if (error) {
        console.error('Failed to fetch profile:', error.message);
        return null;
    }

    if (!data) {
        console.warn('⚠️ No row found for id:', userId);
        return null;
    }

    let plainEmail = null;
    if (stored) {
        try {
            const user = JSON.parse(stored);
            plainEmail = user.email;
        } catch {}
    }

    return {
        ...data,
        plainEmail: plainEmail || data.email,
    };
}

/**
 * Update avatar only.
 */
export async function updateUserAvatar(avatarUrl) {
    let userId = null;
    const stored = localStorage.getItem('smarthub.user');
    if (stored) {
        try {
            const user = JSON.parse(stored);
            userId = user.id;
        } catch {}
    }
    if (!userId) return null;

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('user_account')
        .update({
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select('*');

    if (error) {
        console.error('Failed to update avatar:', error);
        throw error;
    }
    return data?.[0] || null;
}

/**
 * Update confirmation status.
 */
export async function updateUserConfirmed(confirmed) {
    let userId = null;
    const stored = localStorage.getItem('smarthub.user');
    if (stored) {
        try {
            const user = JSON.parse(stored);
            userId = user.id;
        } catch {}
    }
    if (!userId) return null;

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('user_account')
        .update({
            confirmed: confirmed,
            updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select('*');

    if (error) {
        console.error('Failed to update confirmation:', error);
        throw error;
    }
    return data?.[0] || null;
}