// ============================================================
// supabase.js – Encrypted Supabase client with fallback
// ============================================================

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

// ---- ✅ FIXED: allow both encrypt and decrypt ----
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
        ['encrypt', 'decrypt']
    );
}

// ---- Decrypt ----
async function decryptSecret(encryptedData, passphrase) {
    if (encryptedData == null) {
        throw new Error('Stored credential is missing.');
    }

    if (typeof encryptedData !== 'string') {
        return String(encryptedData);
    }

    const value = encryptedData.trim();
    if (!value) {
        throw new Error('Stored credential is empty.');
    }

    try {
        const saltHex = getSaltHex();
        const salt = hexToUint8(saltHex);
        const parts = value.split(':');
        if (parts.length !== 2) {
            console.warn('[decryptSecret] Treating stored value as plain text because it is not in encrypted format.');
            return value;
        }

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
    } catch (err) {
        console.warn('[decryptSecret] Unable to decrypt stored value; falling back to plaintext.', err);
        return value;
    }
}

// ---- Encrypt ----
async function encryptSecret(plaintext, passphrase) {
    const saltHex = getSaltHex();
    const salt = hexToUint8(saltHex);
    const enc = new TextEncoder();
    const data = enc.encode(plaintext);

    const key = await deriveKey(passphrase, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        data
    );

    const ivBase64 = base64Encode(iv);
    const ctBase64 = base64Encode(new Uint8Array(ciphertext));
    return `${ivBase64}:${ctBase64}`;
}

// ---- Blob encryption/decryption helpers ----

/**
 * Encrypt a blob (video file) using AES‑GCM.
 * Returns an encrypted blob.
 */
async function encryptBlob(blob, passphrase) {
    // Read blob as ArrayBuffer
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    // Convert to base64 string (so encryptSecret can handle it)
    const base64 = btoa(String.fromCharCode(...uint8Array));
    // Encrypt the string
    const encryptedBase64 = await encryptSecret(base64, passphrase);
    // Convert back to blob
    return new Blob([encryptedBase64], { type: 'application/octet-stream' });
}

/**
 * Decrypt a blob (video file) using AES‑GCM.
 * Returns a decrypted blob ready for playback.
 */
async function decryptBlob(blob, passphrase) {
    const text = await blob.text();
    // Decrypt the string
    const decryptedBase64 = await decryptSecret(text, passphrase);
    // Convert base64 to binary
    const binaryString = atob(decryptedBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: 'video/mp4' });
}

// ---- Lazy-load Supabase client ----
let supabaseClient = null;
let supabaseError = null;

async function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;
    if (supabaseError) throw supabaseError;

    let url, anonKey;

    try {
        const keys = await import('./encrypted-keys.js');
        const encryptedUrl = keys.ENCRYPTED_SUPABASE_URL;
        const encryptedAnon = keys.ENCRYPTED_SUPABASE_ANON_KEY;

        if (!encryptedUrl || encryptedUrl === 'your_encrypted_url_here') {
            throw new Error('encrypted-keys.js contains placeholder values.');
        }
        if (!encryptedAnon || encryptedAnon === 'your_encrypted_anon_key_here') {
            throw new Error('encrypted-keys.js contains placeholder values.');
        }

        const passphrase = getPassphrase();
        url = await decryptSecret(encryptedUrl, passphrase);
        anonKey = await decryptSecret(encryptedAnon, passphrase);
    } catch (err) {
        console.warn('Failed to decrypt from encrypted-keys.js, trying localStorage:', err.message);

        try {
            const storedUrl = localStorage.getItem('smarthub.supabase.url');
            const storedAnon = localStorage.getItem('smarthub.supabase.anonKey');
            if (storedUrl && storedAnon) {
                url = storedUrl;
                anonKey = storedAnon;
                console.log('Using Supabase credentials from localStorage.');
            } else {
                throw new Error('No Supabase credentials found in localStorage.');
            }
        } catch (e) {
            const msg = 'Supabase is not configured. Please set up encrypted-keys.js or localStorage.';
            supabaseError = new Error(msg);
            throw supabaseError;
        }
    }

    // ---- Sanitize URL ----
    try {
        const urlObj = new URL(url);
        url = urlObj.origin;
        console.log('✅ Sanitized Supabase URL:', url);
    } catch (e) {
        const msg = 'Invalid Supabase URL format.';
        supabaseError = new Error(msg);
        throw supabaseError;
    }

    if (!url || !url.startsWith('https://') || !url.includes('supabase.co')) {
        const msg = 'Invalid Supabase URL. Please check your encrypted keys.';
        supabaseError = new Error(msg);
        throw supabaseError;
    }
    if (!anonKey || anonKey.length < 20) {
        const msg = 'Invalid Supabase anon key.';
        supabaseError = new Error(msg);
        throw supabaseError;
    }

    try {
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        supabaseClient = createClient(url, anonKey);
        console.log('✅ Supabase client initialized with base URL:', url);
        return supabaseClient;
    } catch (err) {
        supabaseError = new Error(`Failed to create Supabase client: ${err.message}`);
        throw supabaseError;
    }
}

// ---- ✅ EXPORT ----
export {
    getSupabaseClient,
    decryptSecret,
    encryptSecret,
    getPassphrase,
    getSaltHex,
    encryptBlob,
    decryptBlob
};