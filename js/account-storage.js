// js/account-storage.js
import { encryptSecret, decryptSecret, getPassphrase } from './supabase.js';

const BACKEND_URL = window.BACKEND_URL || '';

// ---- Save account to AppData (encrypted) ----
export async function saveAccount(user) {
    try {
        const passphrase = getPassphrase();
        const json = JSON.stringify(user);
        const encrypted = await encryptSecret(json, passphrase);

        const resp = await fetch(`${BACKEND_URL}/api/account/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ encryptedData: encrypted })
        });

        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || `HTTP ${resp.status}`);
        }

        console.log('✅ Account saved to AppData');
        return true;
    } catch (err) {
        console.warn('Failed to save account to AppData:', err);
        return false;
    }
}

// ---- Load account from AppData (decrypted) ----
export async function loadAccount() {
    try {
        const resp = await fetch(`${BACKEND_URL}/api/account/load`);
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || `HTTP ${resp.status}`);
        }

        const data = await resp.json();
        if (!data.encryptedData) {
            console.log('No saved account found in AppData');
            return null;
        }

        const passphrase = getPassphrase();
        const decrypted = await decryptSecret(data.encryptedData, passphrase);
        const user = JSON.parse(decrypted);
        console.log('✅ Account loaded from AppData');
        return user;
    } catch (err) {
        console.warn('Failed to load account from AppData:', err);
        return null;
    }
}