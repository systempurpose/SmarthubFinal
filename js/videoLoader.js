// js/videoLoader.js
import { getVideos } from './video_sb.js';
import { getSupabaseClient, decryptBlob, getPassphrase } from './supabase.js';

/**
 * Load videos from Supabase and render them in a container.
 * @param {string} containerId - ID of the container element (default: 'videoFeed').
 */
export async function loadVideoFeed(containerId = 'videoFeed') {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
        const videos = await getVideos(20);
        if (!videos || videos.length === 0) {
            container.innerHTML = `<p style="color: #6B7280; text-align: center;">No videos uploaded yet. Share a repair tip video!</p>`;
            return;
        }

        const supabase = await getSupabaseClient();
        const passphrase = getPassphrase();
        let html = '';
        for (const video of videos) {
            // Get the file from storage
            const { data: fileData, error: downloadError } = await supabase.storage
                .from('videos')
                .download(video.storage_path);
            if (downloadError) {
                console.warn('Failed to download video:', downloadError);
                continue;
            }

            let videoUrl;
            if (video.encrypted) {
                // Decrypt the blob
                const decryptedBlob = await decryptBlob(fileData, passphrase);
                videoUrl = URL.createObjectURL(decryptedBlob);
            } else {
                // If not encrypted, use directly (fallback for old videos)
                videoUrl = URL.createObjectURL(fileData);
            }

            html += `
                <div class="video-card" style="
                    background: white;
                    border-radius: 16px;
                    padding: 16px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
                    border: 1px solid #f1f3f5;
                    margin-bottom: 16px;
                ">
                    <video controls style="width:100%; border-radius:12px; max-height:400px;">
                        <source src="${videoUrl}" type="video/mp4">
                        Your browser does not support the video tag.
                    </video>
                    <div style="display:flex; justify-content:space-between; margin-top:10px;">
                        <span style="font-weight:600; color:#1e293b;">${video.original_name}</span>
                        <span style="font-size:12px; color:#6B7280;">${new Date(video.uploaded_at).toLocaleDateString()}</span>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    } catch (err) {
        console.error('Error loading video feed:', err);
        container.innerHTML = `<p style="color: #dc2626;">Failed to load videos: ${err.message}</p>`;
    }
}