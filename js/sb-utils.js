// js/sb-utils.js – Shared Supabase helpers

import { getSupabaseClient, encryptSecret, decryptSecret, getPassphrase } from './supabase.js';

// ---- Get current user ID from localStorage ----
export function getCurrentUserId() {
    try {
        const stored = localStorage.getItem('smarthub.user');
        if (stored) {
            const user = JSON.parse(stored);
            return user.id || null;
        }
    } catch (e) {
        console.warn('Failed to get user ID:', e);
    }
    return null;
}

// ---- Get current device info (model, brand, etc.) ----
export function getCurrentDeviceInfo() {
    const model = document.getElementById('device-model')?.textContent || 'Unknown';
    const brand = document.getElementById('device-brand')?.textContent || 'Unknown';
    const android = document.getElementById('device-android')?.textContent || 'Android --';
    return { model, brand, android };
}

// ---- Compress JSON to string (using LZString) ----
export function compressData(data) {
    const json = JSON.stringify(data);
    return LZString.compressToBase64(json);
}

// ---- Decompress base64 string to JSON ----
export function decompressData(compressed) {
    const json = LZString.decompressFromBase64(compressed);
    return json ? JSON.parse(json) : null;
}

// ---- Encrypt compressed data (same passphrase) ----
export async function encryptCompressedData(data) {
    const passphrase = getPassphrase();
    const compressed = compressData(data);
    return await encryptSecret(compressed, passphrase);
}

// ---- Decrypt and decompress ----
export async function decryptAndDecompress(encrypted) {
    const passphrase = getPassphrase();
    const compressed = await decryptSecret(encrypted, passphrase);
    return decompressData(compressed);
}

// ---- Get current device ID (ADB) – now falls back to window.currentDeviceId ----
export function getCurrentDeviceId() {
    // Try from window (set by ui.js)
    if (window.currentDeviceId) return window.currentDeviceId;
    // Try from the global variable (some pages set it)
    if (typeof currentDeviceId !== 'undefined' && currentDeviceId) return currentDeviceId;
    return null;
}