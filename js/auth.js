// ============================================================
// auth.js – Registration & Login with Encrypted Email + Password
// Table: user_account
// ============================================================

import { getSupabaseClient } from './supabase.js';

async function sha256(message) {
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

export async function register(email, password) {
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

    const { data, error } = await supabase
        .from('user_account')   // ✅ NEW TABLE NAME
        .insert([{
            email: encryptedEmail,
            email_hash: emailHash,
            password: encryptedPassword,
        }]);

    console.log('📥 [register] Supabase response:', { data, error });

    if (error) {
        console.error('❌ [register] Supabase error:', error);
        throw new Error(`Registration failed: ${error.message}`);
    }

    console.log('✅ [register] Insert successful, data:', data);
    return data;
}

export async function login(email, password) {
    console.log('🔐 [login] Started with email:', email);

    let supabase;
    try {
        supabase = await getSupabaseClient();
    } catch (err) {
        console.error('❌ [login] Failed to get Supabase client:', err);
        throw new Error(`Supabase not available: ${err.message}`);
    }

    const emailHash = await sha256(email);

    const { data, error } = await supabase
        .from('user_account')   // ✅ NEW TABLE NAME
        .select('*')
        .eq('email_hash', emailHash)
        .single();

    if (error || !data) {
        console.warn('❌ [login] User not found or error:', error);
        throw new Error('Invalid email or password.');
    }

    const { decryptSecret } = await import('./supabase.js');
    const passphrase = getPassphrase();

    const decryptedEmail = await decryptSecret(data.email, passphrase);
    const decryptedPassword = await decryptSecret(data.password, passphrase);

    if (decryptedPassword !== password) {
        console.warn('❌ [login] Password mismatch');
        throw new Error('Invalid email or password.');
    }

    return {
        id: data.id,
        email: decryptedEmail,
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

    const { data, error } = await supabase
        .from('user_account')   // ✅ NEW TABLE NAME
        .select('id')
        .eq('email_hash', emailHash)
        .maybeSingle();

    if (error) throw new Error(`Error checking user: ${error.message}`);
    return !!data;
}