// js/videoPlayer.js
import { getPublicVideoUrl } from './videoUtils.js';
import { decryptBlob, getPassphrase } from './supabase.js';
import { decompressIfGzipped } from './videoCompression.js';

// ---- Thumbnail cache ----
const thumbnailCache = new Map();

async function generateVideoThumbnail(videoUrl, time = 0.1, retries = 2) {
    const cacheKey = videoUrl;
    if (thumbnailCache.has(cacheKey)) {
        return thumbnailCache.get(cacheKey);
    }

    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;

        const source = document.createElement('source');
        source.src = videoUrl;
        video.appendChild(source);

        let settled = false;

        const cleanup = () => {
            clearTimeout(watchdog);
            video.remove();
            source.remove();
        };

        const settleResolve = (val) => {
            if (settled) return;
            settled = true;
            resolve(val);
            cleanup();
        };

        const retry = (reason) => {
            if (settled) return;
            settled = true;
            if (retries > 0) {
                console.warn('[Thumbnail] Retrying...', retries, reason);
                generateVideoThumbnail(videoUrl, time, retries - 1)
                    .then(resolve)
                    .catch(reject);
            } else {
                reject(reason instanceof Error ? reason : new Error(String(reason)));
            }
            cleanup();
        };

        const onLoaded = () => {
            const dur = video.duration;
            const safeDur = (isFinite(dur) && dur > 0) ? dur : 1;
            const seekTime = Math.min(time, safeDur * 0.1);
            if (Math.abs(video.currentTime - seekTime) < 0.001) {
                video.currentTime = seekTime + 0.001;
            } else {
                video.currentTime = seekTime;
            }
        };

        const onSeeked = () => {
            if (video.videoWidth === 0) {
                retry(new Error('Video dimensions zero'));
                return;
            }

            const draw = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const ratio = video.videoWidth / video.videoHeight;
                    const maxWidth = 640;
                    const width = Math.min(maxWidth, video.videoWidth);
                    const height = width / ratio;
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0, width, height);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    thumbnailCache.set(cacheKey, dataUrl);
                    settleResolve(dataUrl);
                } catch (drawErr) {
                    retry(drawErr);
                }
            };

            if (video.requestVideoFrameCallback) {
                video.requestVideoFrameCallback(() => draw());
            } else {
                requestAnimationFrame(() => requestAnimationFrame(draw));
            }
        };

        const onError = (err) => retry(err);

        video.addEventListener('loadedmetadata', onLoaded);
        video.addEventListener('seeked', onSeeked);
        video.addEventListener('error', onError);

        const watchdog = setTimeout(() => {
            retry(new Error('Thumbnail generation timed out'));
        }, 6000);

        video.style.cssText = 'position:absolute; width:1px; height:1px; opacity:0; pointer-events:none; top:-9999px; left:-9999px;';
        document.body.appendChild(video);

        video.load();
    });
}

/**
 * Fetches, decrypts, and (if needed) decompresses a video from its public URL.
 * Works for both Supabase Storage and Google Drive URLs.
 */
async function fetchDecryptedVideoBlob(publicUrl) {
    const response = await fetch(publicUrl);
    if (!response.ok) throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
    const encryptedBlob = await response.blob();
    const passphrase = getPassphrase();
    const decryptedBlob = await decryptBlob(encryptedBlob, passphrase);
    return decompressIfGzipped(decryptedBlob);
}

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
        aspect-ratio: 16 / 9;
        user-select: none;
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
        z-index: 5;
    `;
    wrapper.appendChild(loading);

    try {
        const decryptedBlob = await fetchDecryptedVideoBlob(publicUrl);
        const blobUrl = URL.createObjectURL(decryptedBlob);

        const video = document.createElement('video');
        video.className = options.className || 'video-player';
        video.controls = false;
        video.autoplay = options.autoplay || false;
        video.preload = 'metadata';
        video.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: contain;
            background: #000;
            cursor: pointer;
            display: block;
        `;

        const source = document.createElement('source');
        source.src = blobUrl;
        source.type = 'video/mp4';
        video.appendChild(source);
        video.load();

        if (options.poster) {
            video.poster = options.poster;
        } else {
            generateVideoThumbnail(blobUrl)
                .then((dataUrl) => { video.poster = dataUrl; })
                .catch((err) => console.warn('[renderVideoPlayer] Poster generation failed:', err));
        }

        // ---- Overlay ----
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
            z-index: 2;
        `;
        const playIcon = document.createElement('i');
        playIcon.className = 'fas fa-play';
        playIcon.style.cssText = `
            font-size: 64px;
            color: rgba(255,255,255,0.8);
            text-shadow: 0 0 20px rgba(0,0,0,0.5);
            transition: opacity 0.3s ease, transform 0.3s ease;
            opacity: 0;
            transform: scale(0.8);
        `;
        overlay.appendChild(playIcon);
        wrapper.appendChild(overlay);

        const clickOverlay = document.createElement('div');
        clickOverlay.style.cssText = `
            position: absolute;
            inset: 0;
            cursor: pointer;
            z-index: 3;
            background: transparent;
        `;
        wrapper.appendChild(clickOverlay);

        // ---- Control bar ----
        const controlBar = document.createElement('div');
        controlBar.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: linear-gradient(transparent, rgba(0,0,0,0.7));
            color: white;
            z-index: 4;
            transition: opacity 0.3s ease;
            opacity: 0;
        `;
        wrapper.appendChild(controlBar);

        const progressContainer = document.createElement('div');
        progressContainer.style.cssText = `
            flex: 1;
            height: 4px;
            background: rgba(255,255,255,0.3);
            border-radius: 2px;
            position: relative;
            cursor: pointer;
            transition: height 0.2s;
        `;
        progressContainer.addEventListener('mouseenter', () => {
            progressContainer.style.height = '6px';
            progressContainer.style.background = 'rgba(255,255,255,0.5)';
        });
        progressContainer.addEventListener('mouseleave', () => {
            progressContainer.style.height = '4px';
            progressContainer.style.background = 'rgba(255,255,255,0.3)';
        });
        controlBar.appendChild(progressContainer);

        const progressFill = document.createElement('div');
        progressFill.style.cssText = `
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #0d9488, #14b8a6);
            border-radius: 2px;
            position: relative;
            transition: width 0.1s linear;
        `;
        progressContainer.appendChild(progressFill);

        const timeDisplay = document.createElement('span');
        timeDisplay.textContent = '0:00 / 0:00';
        timeDisplay.style.cssText = `
            font-size: 13px;
            color: rgba(255,255,255,0.9);
            min-width: 70px;
            text-align: center;
            font-variant-numeric: tabular-nums;
        `;
        controlBar.appendChild(timeDisplay);

        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        fullscreenBtn.style.cssText = `
            background: none;
            border: none;
            color: white;
            font-size: 18px;
            cursor: pointer;
            padding: 4px 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.9;
            transition: opacity 0.2s;
        `;
        fullscreenBtn.addEventListener('mouseenter', () => fullscreenBtn.style.opacity = '1');
        fullscreenBtn.addEventListener('mouseleave', () => fullscreenBtn.style.opacity = '0.9');
        controlBar.appendChild(fullscreenBtn);

        video.addEventListener('loadeddata', () => {
            loading.style.display = 'none';
            updateTimeDisplay();
        });
        video.addEventListener('error', () => {
            loading.textContent = '❌ Failed to load video';
            loading.style.color = '#dc2626';
        });

        function togglePlay() {
            if (video.paused) video.play();
            else video.pause();
        }

        function updatePlayIcon() {
            if (video.paused) {
                playIcon.className = 'fas fa-play';
                playIcon.style.opacity = '0.9';
                playIcon.style.transform = 'scale(1)';
            } else {
                playIcon.className = 'fas fa-pause';
                playIcon.style.opacity = '0';
                playIcon.style.transform = 'scale(0.8)';
            }
        }
        video.addEventListener('play', updatePlayIcon);
        video.addEventListener('pause', updatePlayIcon);
        updatePlayIcon();

        clickOverlay.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePlay();
        });

        clickOverlay.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (video.requestFullscreen) video.requestFullscreen();
            else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
        });

        progressContainer.addEventListener('click', (e) => {
            if (!video.duration) return;
            const rect = progressContainer.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            video.currentTime = percent * video.duration;
        });

        function updateProgress() {
            if (!video.duration) return;
            const percent = (video.currentTime / video.duration) * 100;
            progressFill.style.width = percent + '%';
            updateTimeDisplay();
        }

        function updateTimeDisplay() {
            const current = formatTime(video.currentTime);
            const total = formatTime(video.duration);
            timeDisplay.textContent = current + ' / ' + total;
        }
        video.addEventListener('timeupdate', updateProgress);

        fullscreenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (video.requestFullscreen) video.requestFullscreen();
            else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
        });

        let hideTimeout = null;
        wrapper.addEventListener('mouseenter', () => {
            controlBar.style.opacity = '1';
            clearTimeout(hideTimeout);
        });
        wrapper.addEventListener('mouseleave', () => {
            hideTimeout = setTimeout(() => {
                controlBar.style.opacity = '0';
            }, 2000);
        });

        video.addEventListener('play', () => {
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
                controlBar.style.opacity = '0';
            }, 2000);
        });
        video.addEventListener('pause', () => {
            controlBar.style.opacity = '1';
            clearTimeout(hideTimeout);
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

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' + s : s);
}

export async function renderVideoThumbnail(container, videoUrl) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;

    el.innerHTML = '';

    const publicUrl = await getPublicVideoUrl(videoUrl);
    if (!publicUrl) {
        el.innerHTML = `<div style="color:#999;padding:16px;text-align:center;font-size:14px;background:#111;border-radius:12px;">Video not available</div>`;
        return;
    }

    const loading = document.createElement('div');
    loading.textContent = 'Loading thumbnail...';
    loading.style.cssText = `
        text-align: center;
        padding: 16px;
        color: #999;
        background: #111;
        border-radius: 12px;
        min-height: 80px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
    `;
    el.appendChild(loading);

    try {
        const decryptedBlob = await fetchDecryptedVideoBlob(publicUrl);
        const blobUrl = URL.createObjectURL(decryptedBlob);

        let thumbnailDataUrl;
        try {
            thumbnailDataUrl = await generateVideoThumbnail(blobUrl);
        } catch (err) {
            console.warn('[renderVideoThumbnail] Thumbnail generation failed:', err);
            thumbnailDataUrl = null;
        }
        URL.revokeObjectURL(blobUrl);

        el.innerHTML = '';

        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: relative;
            background: #111;
            border-radius: 12px;
            overflow: hidden;
            cursor: pointer;
            width: 100%;
            max-height: 250px;
            display: flex;
            justify-content: center;
            align-items: center;
        `;
        wrapper.dataset.videoUrl = videoUrl;

        if (thumbnailDataUrl) {
            const img = document.createElement('img');
            img.src = thumbnailDataUrl;
            img.style.cssText = `
                display: block;
                max-width: 100%;
                max-height: 100%;
                width: auto;
                height: auto;
                object-fit: contain;
            `;
            wrapper.appendChild(img);
        } else {
            const fallback = document.createElement('div');
            fallback.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                height: 100%;
                min-height: 80px;
                color: #fff;
                font-size: 14px;
                background: #1a1a1a;
            `;
            fallback.innerHTML = '<i class="fas fa-play-circle" style="font-size:32px;color:rgba(255,255,255,0.3);"></i>';
            wrapper.appendChild(fallback);
        }

        const icon = document.createElement('i');
        icon.className = 'fas fa-play-circle';
        icon.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 36px;
            color: rgba(255,255,255,0.9);
            text-shadow: 0 0 16px rgba(0,0,0,0.6);
            transition: transform 0.2s ease;
            pointer-events: none;
        `;
        wrapper.appendChild(icon);

        wrapper.addEventListener('mouseenter', () => {
            icon.style.transform = 'translate(-50%, -50%) scale(1.1)';
        });
        wrapper.addEventListener('mouseleave', () => {
            icon.style.transform = 'translate(-50%, -50%) scale(1)';
        });

        el.appendChild(wrapper);
    } catch (err) {
        console.warn('[renderVideoThumbnail] Error:', err);
        el.innerHTML = `
            <div style="background:#111;border-radius:12px;padding:16px;text-align:center;color:#999;min-height:80px;display:flex;align-items:center;justify-content:center;font-size:14px;">
                <i class="fas fa-video" style="font-size:18px;margin-right:8px;"></i> Video
            </div>
        `;
    }
}