// js/supabase.js
// ============================================================
// This module imports encrypted keys from a local file that is NOT committed.
// ============================================================

import { ENCRYPTED_SUPABASE_URL, ENCRYPTED_SUPABASE_ANON_KEY } from './encrypted-keys.js';

// ---- Default passphrase and salt (can be overridden via localStorage) ----
const DEFAULT_PASSPHRASE = 'SmartHub2026!SecureKey';
const DEFAULT_SALT_HEX = 'a1b2c3d4e5f67890a1b2c3d4e5f67890';

function getPassphrase() {
    try {
        const stored = localStorage.getItem('smarthub.encryption.passphrase');
        if (stored) return stored;
    } catch { /* ignore */ }
    return DEFAULT_PASSPHRASE;
}

function getSaltHex() {
    try {
        const stored = localStorage.getItem('smarthub.encryption.salt');
        if (stored) return stored;
    } catch { /* ignore */ }
    return DEFAULT_SALT_HEX;
}

// ---- Helper: hex to Uint8Array ----
function hexToUint8(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}

function base64Encode(uint8) {
    return btoa(String.fromCharCode(...uint8));
}

function base64Decode(str) {
    return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

// ---- Derive AES key ----
async function deriveKey(passphrase, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(passphrase),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
    );
}

// ---- Decrypt a single encrypted string ----
async function decryptSecret(encryptedData, passphrase) {
    const saltHex = getSaltHex();
    const salt = hexToUint8(saltHex);
    const parts = encryptedData.split(':');
    if (parts.length !== 2) throw new Error('Invalid encrypted data format.');
    const ivBase64 = parts[0];
    const ciphertextBase64 = parts[1];

    const iv = base64Decode(ivBase64);
    const ciphertext = base64Decode(ciphertextBase64);

    const key = await deriveKey(passphrase, salt);
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        ciphertext
    );
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
}

// ---- Lazy-load Supabase client ----
let supabaseClient = null;

async function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;

    try {
        const passphrase = getPassphrase();
        // Decrypt using the imported encrypted constants
        const url = await decryptSecret(ENCRYPTED_SUPABASE_URL, passphrase);
        const anonKey = await decryptSecret(ENCRYPTED_SUPABASE_ANON_KEY, passphrase);

        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        supabaseClient = createClient(url, anonKey);
        console.log('✅ Supabase client initialized (encrypted keys from local file)');
        return supabaseClient;
    } catch (err) {
        console.error('❌ Failed to decrypt Supabase keys:', err);
        throw new Error('Could not initialize Supabase client.');
    }
}

// ---- Export ----
export { getSupabaseClient, decryptSecret, getPassphrase, getSaltHex };