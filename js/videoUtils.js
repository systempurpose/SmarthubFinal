// js/videoUtils.js
import { getSupabaseClient } from './supabase.js';

/**
 * Get the public URL for a video stored in Supabase Storage.
 * Handles both storage paths and full URLs.
 */
export async function getPublicVideoUrl(pathOrUrl) {
    if (!pathOrUrl) return null;
    
    // If it's already a full URL, return as is
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
        return pathOrUrl;
    }
    
    // If it's a storage path (e.g., "videos/user-xxx/file.mp4")
    try {
        const supabase = await getSupabaseClient();
        const { data } = supabase.storage.from('videos').getPublicUrl(pathOrUrl);
        return data.publicUrl;
    } catch (err) {
        console.warn('[videoUtils] Failed to get public URL:', err);
        return pathOrUrl; // fallback
    }
}

/**
 * Extract storage path from a public URL.
 */
export function extractStoragePath(publicUrl) {
    if (!publicUrl) return null;
    const match = publicUrl.match(/\/videos\/(videos\/user-[^\/]+\/[^?]+)/);
    return match ? match[1] : null;
}

/**
 * Check if a URL is a valid video URL.
 */
export function isValidVideoUrl(url) {
    if (!url) return false;
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('videos/');
}