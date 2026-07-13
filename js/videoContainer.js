// js/videoContainer.js
import { getPublicVideoUrl } from './videoUtils.js';
import { renderVideoPlayer } from './videoPlayer.js';

/**
 * Render a video feed container.
 * @param {string|HTMLElement} container - DOM element or selector.
 * @param {Array} videos - Array of video objects { id, title, url, thumbnail, createdAt, user }
 * @param {Object} options - { limit, showUser, showDate }
 */
export async function renderVideoContainer(container, videos, options = {}) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;

    const limit = options.limit || 20;
    const showUser = options.showUser !== false;
    const showDate = options.showDate !== false;

    if (!videos || videos.length === 0) {
        el.innerHTML = `
            <div style="text-align:center;padding:40px;color:#999;">
                <i class="fas fa-video" style="font-size:36px;display:block;margin-bottom:12px;"></i>
                No videos uploaded yet. Share a repair tip video!
            </div>
        `;
        return;
    }

    const list = videos.slice(0, limit);
    let html = `<div class="video-grid" style="display:flex;flex-direction:column;gap:16px;">`;

    for (const video of list) {
        const publicUrl = await getPublicVideoUrl(video.url || video.storagePath);
        const title = video.title || video.originalName || 'Video';
        const user = video.user || 'User';
        const date = video.createdAt ? new Date(video.createdAt).toLocaleDateString() : '';

        html += `
            <div class="video-card" style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
                <div class="video-player-wrapper" data-video-id="${video.id}" style="background:#000;position:relative;">
                    <div class="video-placeholder" style="padding:40px;text-align:center;color:#999;">
                        <i class="fas fa-spinner fa-spin"></i> Loading...
                    </div>
                </div>
                <div style="padding:12px 16px;">
                    <div style="font-weight:600;font-size:15px;">${escapeHtml(title)}</div>
                    ${showUser ? `<div style="font-size:13px;color:#64748b;">${escapeHtml(user)}</div>` : ''}
                    ${showDate && date ? `<div style="font-size:12px;color:#94a3b8;">${date}</div>` : ''}
                </div>
            </div>
        `;
    }

    html += `</div>`;
    el.innerHTML = html;

    // After rendering, initialize each video player
    const wrappers = el.querySelectorAll('.video-player-wrapper');
    for (const wrapper of wrappers) {
        const videoId = wrapper.dataset.videoId;
        const video = list.find(v => v.id === videoId);
        if (video) {
            const publicUrl = await getPublicVideoUrl(video.url || video.storagePath);
            if (publicUrl) {
                // Replace placeholder with video player
                const playerContainer = wrapper;
                await renderVideoPlayer(playerContainer, publicUrl, { controls: true });
            }
        }
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}