// ============================================================
// profile-sb.js – Profile management (social_profiles)
// ============================================================

import { getSupabaseClient } from './supabase.js';
import { sha256 } from './auth.js';

// ---- Compress image before upload ----
function compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.7) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', quality);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ---- Upload image to Supabase Storage ----
export async function uploadProfileImage(file, folder = 'avatars') {
    const supabase = await getSupabaseClient();
    const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!user) throw new Error('Not logged in');

    const compressed = await compressImage(file);
    const ext = file.name.split('.').pop();
    const fileName = `${user.id}_${Date.now()}.${ext}`;
    const path = `${folder}/${fileName}`;

    const { data, error } = await supabase.storage
        .from('profiles')
        .upload(path, compressed, {
            cacheControl: '3600',
            upsert: true,
        });
    if (error) throw error;

    const { data: urlData } = supabase.storage.from('profiles').getPublicUrl(path);
    return urlData.publicUrl;
}

// ---- Update profile (bio, avatar, cover) ----
export async function updateProfile(updates) {
    const supabase = await getSupabaseClient();
    const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!user) throw new Error('Not logged in');

    const payload = {
        updated_at: new Date().toISOString(),
        ...updates
    };

    // UPDATED: use social_profiles table
    const { data, error } = await supabase
        .from('social_profiles')
        .update(payload)
        .eq('user_id', user.id)
        .select();
    if (error) throw error;

    const updatedUser = { ...user, ...payload };
    localStorage.setItem('smarthub.user', JSON.stringify(updatedUser));
    return updatedUser;
}

// ---- Fetch user profile ----
export async function fetchProfile(userId) {
    const supabase = await getSupabaseClient();
    // UPDATED: use social_profiles table
    const { data, error } = await supabase
        .from('social_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
    if (error) throw error;
    return data;
}