// js/videoUtils.js
import { getSupabaseClient } from './supabase.js';

export async function getPublicVideoUrl(pathOrUrl) {
    if (!pathOrUrl) return null;
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
        return pathOrUrl;
    }
    try {
        const supabase = await getSupabaseClient();
        const { data } = supabase.storage.from('videos').getPublicUrl(pathOrUrl);
        return data.publicUrl;
    } catch (err) {
        console.warn('[videoUtils] Failed to get public URL:', err);
        return pathOrUrl;
    }
}

export function extractStoragePath(publicUrl) {
    if (!publicUrl) return null;
    const match = publicUrl.match(/\/videos\/(videos\/user-[^\/]+\/[^?]+)/);
    return match ? match[1] : null;
}