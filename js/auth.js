// ============================================================
// auth.js – Registration & Login (UUID primary key)
// Table: user_account (id = uuid, email_hash = text)
// ============================================================

import { getSupabaseClient } from './supabase.js';

export async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getPassphrase() {
    try {
        const stored = localStorage.getItem('smarthub.encryption.passphrase');
        if (stored) return stored;
    } catch { /* ignore */ }
    return 'SmartHub2026!SecureKey';
}

/**
 * Register a new user.
 * Generates a random UUID for the primary key.
 */
export async function register(email, password, confirmed = false) {
    const supabase = await getSupabaseClient();
    const passphrase = getPassphrase();
    const { encryptSecret } = await import('./supabase.js');

    const encryptedEmail = await encryptSecret(email, passphrase);
    const encryptedPassword = await encryptSecret(password, passphrase);
    const emailHash = await sha256(email);
    const userId = crypto.randomUUID();   // <-- generate a UUID

    const { data, error } = await supabase
        .from('user_account')
        .insert([{
            id: userId,
            email: encryptedEmail,
            email_hash: emailHash,
            password: encryptedPassword,
            confirmed,
        }])
        .select();

    if (error) {
        throw new Error(`Registration failed: ${error.message}`);
    }
    return data;
}

export async function login(email, password) {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password;

    if (!normalizedEmail || !normalizedPassword) {
        throw new Error('Please enter both email and password.');
    }

    const supabase = await getSupabaseClient();
    const emailHash = await sha256(normalizedEmail);

    // Query by email_hash (fast, indexed)
    const { data, error } = await supabase
        .from('user_account')
        .select('id, email, confirmed, name, avatar_url, created_at')
        .eq('email_hash', emailHash)
        .maybeSingle();

    if (error || !data) {
        throw new Error('Invalid email or password.');
    }

    const { decryptSecret } = await import('./supabase.js');
    const passphrase = getPassphrase();

    let decryptedEmail = normalizedEmail;
    let decryptedPassword = normalizedPassword;

    try {
        decryptedEmail = await decryptSecret(data.email, passphrase);
    } catch (err) {
        console.warn('⚠️ [login] Could not decrypt stored email, using submitted value.', err);
    }

    try {
        decryptedPassword = await decryptSecret(data.password, passphrase);
    } catch (err) {
        console.warn('⚠️ [login] Could not decrypt stored password, using submitted value.', err);
    }

    if (decryptedPassword !== normalizedPassword) {
        throw new Error('Invalid email or password.');
    }

    return {
        id: data.id,               // this is the UUID
        email: decryptedEmail,
        confirmed: data.confirmed ?? false,
        name: data.name || null,
        avatar_url: data.avatar_url || null,
        created_at: data.created_at,
    };
}

export async function userExists(email) {
    const supabase = await getSupabaseClient();
    const emailHash = await sha256(email);

    const { data, error } = await supabase
        .from('user_account')
        .select('id')
        .eq('email_hash', emailHash)
        .maybeSingle();

    if (error) throw new Error(`Error checking user: ${error.message}`);
    return !!data;
}