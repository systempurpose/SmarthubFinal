// ============================================================
// auth.js – Registration & Login with Encrypted Email + Password
// Table: user_account
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
 * @param {string} email - Plain email.
 * @param {string} password - Plain password.
 * @param {boolean} confirmed - Whether the account is confirmed (default false).
 * @returns {Promise<Array>} The inserted user data.
 */
export async function register(email, password, confirmed = false) {
    console.log('🔐 [register] Started with email:', email);

    let supabase;
    try {
        supabase = await getSupabaseClient();
    } catch (err) {
        console.error('❌ [register] Failed to get Supabase client:', err);
        throw new Error(`Supabase not available: ${err.message}`);
    }

    const passphrase = getPassphrase();
    const { encryptSecret } = await import('./supabase.js');

    const encryptedEmail = await encryptSecret(email, passphrase);
    const encryptedPassword = await encryptSecret(password, passphrase);
    const emailHash = await sha256(email);

    console.log('📤 [register] emailHash:', emailHash);
    console.log('📤 [register] encryptedEmail length:', encryptedEmail.length);

    const { data, error } = await supabase
        .from('user_account')
        .insert([{
            email: encryptedEmail,
            email_hash: emailHash,
            password: encryptedPassword,
            confirmed: confirmed,   // <-- use the parameter
        }])
        .select();

    console.log('📥 [register] Supabase response:', { data, error });

    if (error) {
        console.error('❌ [register] Supabase error DETAILS:', error);
        throw new Error(`Registration failed: ${error.message} (${error.details || ''})`);
    }

    console.log('✅ [register] Insert successful, data:', data);
    return data;
}

export async function login(email, password) {
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedPassword = typeof password === 'string' ? password : '';

    console.log('🔐 [login] Started with email:', normalizedEmail);

    if (!normalizedEmail || !normalizedPassword) {
        throw new Error('Please enter both email and password.');
    }

    let supabase;
    try {
        supabase = await getSupabaseClient();
    } catch (err) {
        console.error('❌ [login] Failed to get Supabase client:', err);
        throw new Error(`Supabase not available: ${err.message}`);
    }

    const emailHash = await sha256(normalizedEmail);
    console.log('🔍 [login] emailHash:', emailHash);

    const { data, error } = await supabase
        .from('user_account')
        .select('id, email, confirmed, name, avatar_url, created_at')
        .eq('email_hash', emailHash)
        .maybeSingle();

    if (error) {
        console.error('❌ [login] Supabase error:', error);
        throw new Error(`Database error: ${error.message}`);
    }

    if (!data) {
        console.warn('❌ [login] No user found with email_hash:', emailHash);
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

    if (String(decryptedPassword) !== normalizedPassword) {
        console.warn('❌ [login] Password mismatch');
        throw new Error('Invalid email or password.');
    }

    return {
        id: data.id,
        email: String(decryptedEmail || normalizedEmail),
        confirmed: data.confirmed ?? false,
        name: data.name || null,
        avatar_url: data.avatar_url || null,
        created_at: data.created_at,
    };
}

export async function userExists(email) {
    console.log('🔍 [userExists] Checking email:', email);

    let supabase;
    try {
        supabase = await getSupabaseClient();
    } catch (err) {
        console.error('❌ [userExists] Failed to get Supabase client:', err);
        throw new Error(`Supabase not available: ${err.message}`);
    }

    const emailHash = await sha256(email);
    console.log('🔍 [userExists] emailHash:', emailHash);

    const { data, error } = await supabase
        .from('user_account')
        .select('id')
        .eq('email_hash', emailHash)
        .maybeSingle();

    if (error) throw new Error(`Error checking user: ${error.message}`);
    return !!data;
}