// js/user_profile_sb.js
import { getSupabaseClient } from './supabase.js';
import {
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
 */
async function encryptValue(value) {
    if (value === null || value === undefined) return null;
    return await encryptCompressedData(value);
}

/**
 * Decrypt a value; fallback to raw value if decryption fails.
 */
async function decryptValue(value) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return value;
    try {
        return await decryptAndDecompress(value);
    } catch {
        return value;
    }
}

/**
 * Save user profile – uses `id` (userId) for RLS compliance.
 */
export async function saveUserProfile(profileData, userId) {
    if (!userId) {
        console.warn('No userId provided – cannot save profile.');
        return null;
    }

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

    // 1. Check if row exists for this userId
    const { data: existingRow, error: findError } = await supabase
        .from('user_account')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

    if (findError) {
        console.error('Error checking existence:', findError);
        throw new Error(`Lookup failed: ${findError.message}`);
    }

    const encryptedName = await encryptValue(profileData.name);
    const encryptedAvatar = await encryptValue(profileData.avatar_url);
    const confirmed = profileData.confirmed !== undefined ? profileData.confirmed : false;

    const record = {
        name: encryptedName,
        avatar_url: encryptedAvatar,
        confirmed: confirmed,
        updated_at: new Date().toISOString(),
    };

    let result = null;

    if (existingRow) {
        // Row exists – update using `id`
        const { data, error } = await supabase
            .from('user_account')
            .update(record)
            .eq('id', userId)
            .select('*');

        if (error) {
            console.error('Update failed:', error);
            throw new Error(`Update failed: ${error.message}`);
        }
        result = data?.[0] || null;
        console.log('✅ Profile updated');
    } else {
        // Row missing – insert using the provided `userId`
        const insertRecord = {
            id: userId,
            email: email,
            email_hash: emailHash,
            password: emailHash, // placeholder; not used for Auth
            ...record,
            created_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
            .from('user_account')
            .insert(insertRecord)
            .select('*');

        if (error) {
            console.error('Insert failed:', error);
            throw new Error(`Insert failed: ${error.message}`);
        }
        result = data?.[0] || null;
        console.log('✅ Profile inserted');
    }

    if (!result) {
        throw new Error('No rows affected – profile not saved.');
    }

    return result;
}

/**
 * Fetch user profile – uses `id` from localStorage (or Auth session).
 */
export async function fetchUserProfile() {
    // Get userId from localStorage
    let userId = null;
    const stored = localStorage.getItem('smarthub.user');
    if (stored) {
        try {
            const user = JSON.parse(stored);
            userId = user.id;
        } catch {}
    }
    if (!userId) {
        console.warn('No user ID found – cannot fetch profile.');
        return null;
    }

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('user_account')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

    if (error) {
        console.error('Failed to fetch user profile:', error.message);
        return null;
    }

    if (!data) {
        console.warn('⚠️ No user_account row for id:', userId);
        return null;
    }

    // Decrypt name and avatar_url
    const decryptedName = await decryptValue(data.name);
    const decryptedAvatar = await decryptValue(data.avatar_url);

    // Get plain email from localStorage for display
    let plainEmail = null;
    if (stored) {
        try {
            const user = JSON.parse(stored);
            plainEmail = user.email;
        } catch {}
    }

    return {
        ...data,
        name: decryptedName,
        avatar_url: decryptedAvatar,
        plainEmail: plainEmail || data.email,
    };
}

/**
 * Update avatar only – uses `id`.
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

    const encryptedAvatar = await encryptValue(avatarUrl);

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('user_account')
        .update({
            avatar_url: encryptedAvatar,
            updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select('*');

    if (error) {
        console.error('Failed to update avatar:', error);
        throw error;
    }
    if (data && data.length > 0) {
        data[0].avatar_url = await decryptValue(data[0].avatar_url);
    }
    return data?.[0] || null;
}

/**
 * Update confirmation status – uses `id`.
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