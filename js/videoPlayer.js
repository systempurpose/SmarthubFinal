// js/videoPlayer.js
import { getPublicVideoUrl } from './videoUtils.js';

/**
 * Render a video player with loading state and error handling.
 * @param {string|HTMLElement} container - DOM element or selector.
 * @param {string} videoUrl - Storage path or public URL.
 * @param {Object} options - { autoplay, controls, className, poster }
 * @returns {Promise<HTMLElement>} The video element.
 */
export async function renderVideoPlayer(container, videoUrl, options = {}) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) throw new Error('Container not found');

    const publicUrl = await getPublicVideoUrl(videoUrl);
    if (!publicUrl) {
        el.innerHTML = `<div style="color:#999;padding:20px;text-align:center;">Video not available</div>`;
        return null;
    }

    const controls = options.controls !== false;
    const autoplay = options.autoplay || false;
    const poster = options.poster || '';
    const className = options.className || 'video-player';

    // Create video element
    const video = document.createElement('video');
    video.className = className;
    video.controls = controls;
    video.autoplay = autoplay;
    video.poster = poster;
    video.style.maxWidth = '100%';
    video.style.borderRadius = '12px';
    video.style.maxHeight = '400px';
    video.style.background = '#000';

    // Create source
    const source = document.createElement('source');
    source.src = publicUrl;
    source.type = 'video/mp4';
    video.appendChild(source);

    // Loading indicator
    const loading = document.createElement('div');
    loading.className = 'video-loading';
    loading.textContent = 'Loading video...';
    loading.style.textAlign = 'center';
    loading.style.padding = '20px';
    loading.style.color = '#999';

    el.innerHTML = '';
    el.appendChild(loading);
    el.appendChild(video);

    // Events
    video.addEventListener('loadeddata', () => {
        loading.style.display = 'none';
    });
    video.addEventListener('error', () => {
        loading.textContent = '❌ Failed to load video';
        loading.style.color = '#dc2626';
    });

    return video;
}