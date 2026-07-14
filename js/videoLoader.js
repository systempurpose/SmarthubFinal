// js/videoLoader.js
import { getSupabaseClient } from './supabase.js';
import { renderVideoContainer } from './videoContainer.js';

export async function loadVideoFeed(containerId = 'videoFeed') {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
        const supabase = await getSupabaseClient();
        const { data: videos, error } = await supabase
            .from('videos')
            .select('*')
            .order('uploaded_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        const formatted = (videos || []).map(v => ({
            id: v.id,
            title: v.originalName || 'Video',
            url: v.storagePath,
            user: 'User', // you can join with user_account if needed
            createdAt: v.uploaded_at || v.created_at,
            thumbnail: null,
        }));

        await renderVideoContainer(container, formatted, { showUser: true, showDate: true });
    } catch (err) {
        container.innerHTML = `<div style="color:red;padding:20px;">Failed to load videos: ${err.message}</div>`;
    }
}