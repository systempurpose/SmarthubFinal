// js/settings-sb.js – Sync user settings with Supabase (encrypted + compressed)

import { getSupabaseClient } from './supabase.js';
import { getCurrentUserId, encryptCompressedData, decryptAndDecompress } from './sb-utils.js';

/**
 * Save user settings to Supabase (encrypted + compressed)
 * @param {string} userId - Supabase user ID
 * @param {object} settings - Settings object (language, themeColor, bgColor, cardColor, textColor)
 * @returns {Promise<boolean>} true if saved successfully
 */
export async function saveUserSettings(userId, settings) {
    if (!userId) {
        console.warn('No user ID provided – settings not saved to Supabase.');
        return false;
    }

    try {
        const supabase = await getSupabaseClient();

        // Compress + encrypt the settings object
        const encrypted = await encryptCompressedData(settings);

        // Upsert: insert if not exists, update if exists
        const { data, error } = await supabase
            .from('user_settings')
            .upsert({
                user_id: userId,
                settings: encrypted,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' })
            .select();

        if (error) {
            console.error('Failed to save settings to Supabase:', error);
            return false;
        }

        console.log('✅ User settings saved to Supabase');
        return true;
    } catch (err) {
        console.error('Error saving settings to Supabase:', err);
        return false;
    }
}

/**
 * Load user settings from Supabase (decrypted + decompressed)
 * @param {string} userId - Supabase user ID
 * @returns {Promise<object|null>} Settings object or null if not found
 */
export async function loadUserSettings(userId) {
    if (!userId) {
        console.warn('No user ID provided – cannot load settings from Supabase.');
        return null;
    }

    try {
        const supabase = await getSupabaseClient();

        const { data, error } = await supabase
            .from('user_settings')
            .select('settings')
            .eq('user_id', userId)
            .maybeSingle();

        if (error) {
            console.error('Failed to load settings from Supabase:', error);
            return null;
        }

        if (!data) {
            console.log('No settings found for user in Supabase.');
            return null;
        }

        // Decrypt + decompress
        const settings = await decryptAndDecompress(data.settings);
        console.log('✅ User settings loaded from Supabase');
        return settings;
    } catch (err) {
        console.error('Error loading settings from Supabase:', err);
        return null;
    }
}

/**
 * Load settings – first from Supabase, fallback to localStorage
 * @param {string} userId - optional, if not provided tries getCurrentUserId()
 * @returns {Promise<object>} Settings object with defaults
 */
export async function loadSettingsWithFallback(userId) {
    const uid = userId || getCurrentUserId();
    let settings = null;

    if (uid) {
        settings = await loadUserSettings(uid);
    }

    // If not found in Supabase (or user not logged in), fallback to localStorage
    if (!settings) {
        try {
            const stored = localStorage.getItem('smartHubSettings');
            if (stored) {
                settings = JSON.parse(stored);
                console.log('📂 Settings loaded from localStorage fallback');
            }
        } catch (e) {
            console.warn('Failed to parse localStorage settings:', e);
        }
    }

    // Defaults if nothing else
    if (!settings || typeof settings !== 'object') {
        settings = {
            language: 'en',
            themeColor: '#0d6efd',
            bgColor: '#ffffff',
            cardColor: '#ffffff',
            textColor: '#1f2937',
        };
    }

    // Ensure all keys exist
    const defaults = {
        language: 'en',
        themeColor: '#0d6efd',
        bgColor: '#ffffff',
        cardColor: '#ffffff',
        textColor: '#1f2937',
    };
    return { ...defaults, ...settings };
}