// js/videoPlayer.js
import { getPublicVideoUrl } from './videoUtils.js';
import { decryptBlob, getPassphrase } from './supabase.js';

export async function renderVideoPlayer(container, videoUrl, options = {}) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) throw new Error('Container not found');

    const publicUrl = await getPublicVideoUrl(videoUrl);
    if (!publicUrl) {
        el.innerHTML = `<div style="color:#999;padding:20px;text-align:center;">Video not available</div>`;
        return null;
    }

    el.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        position: relative;
        background: #000;
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        border-radius: 12px;
        overflow: hidden;
    `;
    el.appendChild(wrapper);

    const loading = document.createElement('div');
    loading.className = 'video-loading';
    loading.textContent = 'Loading video...';
    loading.style.cssText = `
        text-align: center;
        padding: 20px;
        color: #999;
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    wrapper.appendChild(loading);

    try {
        const response = await fetch(publicUrl);
        if (!response.ok) throw new Error('Failed to fetch video');
        const encryptedBlob = await response.blob();
        const passphrase = getPassphrase();
        const decryptedBlob = await decryptBlob(encryptedBlob, passphrase);
        const blobUrl = URL.createObjectURL(decryptedBlob);

        const video = document.createElement('video');
        video.className = options.className || 'video-player';
        video.controls = options.controls !== false;
        video.autoplay = options.autoplay || false;
        video.poster = options.poster || '';
        video.style.cssText = `
            max-width: 100%;
            max-height: 70vh;
            object-fit: contain;
            background: #000;
            cursor: pointer;
        `;

        const source = document.createElement('source');
        source.src = blobUrl;
        source.type = 'video/mp4';
        video.appendChild(source);

        // Click toggles play/pause
        video.addEventListener('click', (e) => {
            if (video.paused) {
                video.play();
            } else {
                video.pause();
            }
        });

        // Double-click to fullscreen
        video.addEventListener('dblclick', (e) => {
            if (video.requestFullscreen) {
                video.requestFullscreen();
            } else if (video.webkitRequestFullscreen) {
                video.webkitRequestFullscreen();
            }
        });

        video.addEventListener('loadeddata', () => {
            loading.style.display = 'none';
        });
        video.addEventListener('error', () => {
            loading.textContent = '❌ Failed to load video';
            loading.style.color = '#dc2626';
        });

        wrapper.appendChild(video);

        video.addEventListener('remove', () => URL.revokeObjectURL(blobUrl));
        window.addEventListener('beforeunload', () => URL.revokeObjectURL(blobUrl));

        return video;
    } catch (err) {
        console.error('[renderVideoPlayer] Error:', err);
        loading.textContent = '❌ Failed to load video: ' + err.message;
        loading.style.color = '#dc2626';
        return null;
    }
}

export function renderVideoThumbnail(container, videoUrl) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;

    el.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        position:relative; background:#000; border-radius:12px; overflow:hidden;
        aspect-ratio:16/9; display:flex; align-items:center; justify-content:center;
        cursor:pointer; min-height:100px;
    `;
    wrapper.dataset.videoUrl = videoUrl;

    const icon = document.createElement('i');
    icon.className = 'fas fa-play-circle';
    icon.style.cssText = `
        font-size:48px; color:rgba(255,255,255,0.8);
        transition:transform 0.2s ease;
    `;
    wrapper.appendChild(icon);

    wrapper.addEventListener('mouseenter', () => {
        icon.style.transform = 'scale(1.1)';
    });
    wrapper.addEventListener('mouseleave', () => {
        icon.style.transform = 'scale(1)';
    });

    el.appendChild(wrapper);
    return wrapper;
}