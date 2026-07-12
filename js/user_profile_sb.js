// js/user_profile_sb.js
import { getSupabaseClient } from './supabase.js';
import {
    getCurrentUserId,
    encryptCompressedData,
    decryptAndDecompress,
} from './sb-utils.js';

/**
 * Compute SHA-256 hash of an email (normalized, lowercase)
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
 * Encrypt a value using compress + encrypt.
 * Returns null if value is null/undefined.
 */
async function encryptValue(value) {
    if (value === null || value === undefined) return null;
    return await encryptCompressedData(value);
}

/**
 * Decrypt a value using decrypt + decompress.
 * If decryption fails, returns the raw value (for backward compatibility).
 */
async function decryptValue(value) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return value;
    try {
        return await decryptAndDecompress(value);
    } catch {
        // Fallback to plaintext (for existing data)
        return value;
    }
}

/**
 * Save user profile – upsert by email_hash.
 * Encrypts `name` and `avatar_url` before storing.
 */
export async function saveUserProfile(profileData, userId) {
    // Get email from localStorage
    let email = null;
    const stored = localStorage.getItem('smarthub.user');
    if (stored) {
        try {
            const user = JSON.parse(stored);
            email = user.email;
        } catch {}
    }
    if (!email) {
        console.warn('No email found – cannot save profile.');
        return null;
    }

    const emailHash = await hashEmail(email);
    const supabase = await getSupabaseClient();

    // Encrypt sensitive fields
    const encryptedName = await encryptValue(profileData.name);
    const encryptedAvatar = await encryptValue(profileData.avatar_url);
    const confirmed = profileData.confirmed !== undefined ? profileData.confirmed : false;

    const record = {
        name: encryptedName,
        avatar_url: encryptedAvatar,
        confirmed: confirmed,
        updated_at: new Date().toISOString(),
    };

    // 1. Try upsert (requires unique constraint on email_hash)
    let { data, error } = await supabase
        .from('user_account')
        .upsert(
            {
                id: userId,
                email: email,
                email_hash: emailHash,
                password: emailHash, // placeholder
                ...record,
            },
            { onConflict: 'email_hash' }
        )
        .select('*');

    if (error) {
        // If upsert fails (e.g., constraint conflict), try update
        console.warn('Upsert failed, falling back to update:', error.message);
        const { data: updateData, error: updateError } = await supabase
            .from('user_account')
            .update(record)
            .eq('email_hash', emailHash)
            .select('*');
        if (updateError) {
            console.error('Update failed:', updateError);
            throw new Error(`Update failed: ${updateError.message}`);
        }
        data = updateData;
    }

    if (!data || data.length === 0) {
        console.error('❌ No rows affected for email_hash:', emailHash);
        throw new Error('Failed to save profile – no rows affected.');
    }

    console.log('✅ User profile saved to Supabase');
    return data[0];
}

/**
 * Fetch user profile – decrypts `name` and `avatar_url`.
 */
export async function fetchUserProfile() {
    let email = null;
    const stored = localStorage.getItem('smarthub.user');
    if (stored) {
        try {
            const user = JSON.parse(stored);
            email = user.email;
        } catch {}
    }
    if (!email) {
        console.warn('No email found – cannot fetch profile.');
        return null;
    }

    const emailHash = await hashEmail(email);

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('user_account')
        .select('*')
        .eq('email_hash', emailHash)
        .maybeSingle();

    if (error) {
        console.error('Failed to fetch user profile:', error.message);
        return null;
    }

    if (!data) {
        console.warn('⚠️ No user_account row for email_hash:', emailHash);
        return null;
    }

    // Decrypt name and avatar_url
    const decryptedName = await decryptValue(data.name);
    const decryptedAvatar = await decryptValue(data.avatar_url);

    return {
        ...data,
        name: decryptedName,
        avatar_url: decryptedAvatar,
        plainEmail: email, // for display
    };
}

/**
 * Update only the avatar URL – encrypts and saves.
 */
export async function updateUserAvatar(avatarUrl) {
    let email = null;
    const stored = localStorage.getItem('smarthub.user');
    if (stored) {
        try {
            const user = JSON.parse(stored);
            email = user.email;
        } catch {}
    }
    if (!email) return null;

    const emailHash = await hashEmail(email);
    const encryptedAvatar = await encryptValue(avatarUrl);

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('user_account')
        .update({
            avatar_url: encryptedAvatar,
            updated_at: new Date().toISOString(),
        })
        .eq('email_hash', emailHash)
        .select('*');

    if (error) {
        console.error('Failed to update avatar:', error);
        throw error;
    }
    // Decrypt the returned avatar for the caller
    if (data && data.length > 0) {
        data[0].avatar_url = await decryptValue(data[0].avatar_url);
    }
    return data?.[0] || null;
}

/**
 * Update confirmation status – plain boolean, no encryption needed.
 */
export async function updateUserConfirmed(confirmed) {
    let email = null;
    const stored = localStorage.getItem('smarthub.user');
    if (stored) {
        try {
            const user = JSON.parse(stored);
            email = user.email;
        } catch {}
    }
    if (!email) return null;

    const emailHash = await hashEmail(email);

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('user_account')
        .update({
            confirmed: confirmed,
            updated_at: new Date().toISOString(),
        })
        .eq('email_hash', emailHash)
        .select('*');

    if (error) {
        console.error('Failed to update confirmation:', error);
        throw error;
    }
    return data?.[0] || null;
}