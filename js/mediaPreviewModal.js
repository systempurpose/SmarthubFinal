// js/mediaPreviewModal.js
import { renderVideoPlayer } from './videoPlayer.js';

/**
 * Open a modal to preview media items (images/videos) before posting.
 * @param {Array} mediaItems - Array of { url, type } objects.
 * @param {number} initialIndex - Index of the item to show first.
 */
export function openMediaPreview(mediaItems, initialIndex = 0) {
    if (!mediaItems || !mediaItems.length) return;

    // Remove any existing preview modal
    const existing = document.querySelector('.media-preview-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'media-preview-modal-overlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 999999;
        background: rgba(0, 0, 0, 0.9);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        animation: mpFadeIn 0.2s ease;
    `;

    const modal = document.createElement('div');
    modal.className = 'media-preview-modal';
    modal.style.cssText = `
        position: relative;
        max-width: 90vw;
        max-height: 90vh;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    `;

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'media-preview-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = `
        position: absolute;
        top: 16px;
        right: 20px;
        background: rgba(255,255,255,0.15);
        border: none;
        color: #fff;
        font-size: 32px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        cursor: pointer;
        z-index: 10;
        transition: background 0.2s, transform 0.2s;
    `;
    closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.background = 'rgba(255,255,255,0.3)';
    });
    closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.background = 'rgba(255,255,255,0.15)';
    });
    closeBtn.addEventListener('click', closeModal);

    // Content container
    const content = document.createElement('div');
    content.className = 'media-preview-content';
    content.style.cssText = `
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
    `;

    // Navigation buttons (if more than 1 item)
    let currentIndex = initialIndex;

    function renderItem(index) {
        content.innerHTML = '';
        const item = mediaItems[index];
        const isVideo = item.type === 'video';

        if (isVideo) {
            const container = document.createElement('div');
            container.className = 'media-preview-video-wrapper';
            container.style.cssText = `
                width: 100%;
                max-width: 80vw;
                max-height: 80vh;
                aspect-ratio: 16 / 9;
                background: #000;
                border-radius: 8px;
                overflow: hidden;
            `;
            renderVideoPlayer(container, item.url, { controls: true, autoplay: true })
                .catch(() => {
                    container.innerHTML = `<div style="color:#fff;padding:20px;text-align:center;">Video playback not available</div>`;
                });
            content.appendChild(container);
        } else {
            const img = document.createElement('img');
            img.src = item.url;
            img.alt = 'Media preview';
            img.style.cssText = `
                max-width: 90vw;
                max-height: 80vh;
                object-fit: contain;
                border-radius: 8px;
                box-shadow: 0 4px 40px rgba(0,0,0,0.5);
            `;
            content.appendChild(img);
        }

        // Counter
        const counter = document.createElement('div');
        counter.className = 'media-preview-counter';
        counter.textContent = `${index + 1} / ${mediaItems.length}`;
        counter.style.cssText = `
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.6);
            color: #fff;
            padding: 6px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            pointer-events: none;
        `;
        content.appendChild(counter);
    }

    function navigate(direction) {
        const newIndex = (currentIndex + direction + mediaItems.length) % mediaItems.length;
        currentIndex = newIndex;
        renderItem(currentIndex);
        updateNavButtons();
    }

    function updateNavButtons() {
        const prevBtn = content.querySelector('.media-preview-prev');
        const nextBtn = content.querySelector('.media-preview-next');
        if (prevBtn) prevBtn.style.display = mediaItems.length > 1 ? 'flex' : 'none';
        if (nextBtn) nextBtn.style.display = mediaItems.length > 1 ? 'flex' : 'none';
    }

    // Navigation buttons (built inside content)
    function addNavButtons() {
        const prevBtn = document.createElement('button');
        prevBtn.className = 'media-preview-prev';
        prevBtn.innerHTML = '&#10094;';
        prevBtn.style.cssText = `
            position: absolute;
            left: 16px;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(255,255,255,0.15);
            border: none;
            color: #fff;
            font-size: 28px;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            cursor: pointer;
            display: ${mediaItems.length > 1 ? 'flex' : 'none'};
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
            z-index: 5;
        `;
        prevBtn.addEventListener('mouseenter', () => {
            prevBtn.style.background = 'rgba(255,255,255,0.3)';
        });
        prevBtn.addEventListener('mouseleave', () => {
            prevBtn.style.background = 'rgba(255,255,255,0.15)';
        });
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigate(-1);
        });

        const nextBtn = document.createElement('button');
        nextBtn.className = 'media-preview-next';
        nextBtn.innerHTML = '&#10095;';
        nextBtn.style.cssText = `
            position: absolute;
            right: 16px;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(255,255,255,0.15);
            border: none;
            color: #fff;
            font-size: 28px;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            cursor: pointer;
            display: ${mediaItems.length > 1 ? 'flex' : 'none'};
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
            z-index: 5;
        `;
        nextBtn.addEventListener('mouseenter', () => {
            nextBtn.style.background = 'rgba(255,255,255,0.3)';
        });
        nextBtn.addEventListener('mouseleave', () => {
            nextBtn.style.background = 'rgba(255,255,255,0.15)';
        });
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigate(1);
        });

        content.appendChild(prevBtn);
        content.appendChild(nextBtn);
    }

    modal.appendChild(closeBtn);
    modal.appendChild(content);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Add navigation buttons after content is built
    addNavButtons();
    renderItem(currentIndex);

    // Keyboard navigation
    function handleKeydown(e) {
        if (e.key === 'Escape') closeModal();
        if (e.key === 'ArrowLeft') navigate(-1);
        if (e.key === 'ArrowRight') navigate(1);
    }
    document.addEventListener('keydown', handleKeydown);

    function closeModal() {
        document.removeEventListener('keydown', handleKeydown);
        // Clean up video players if any
        const video = content.querySelector('video');
        if (video) {
            video.pause();
            video.src = '';
            video.load();
        }
        overlay.style.animation = 'mpFadeOut 0.2s ease forwards';
        setTimeout(() => overlay.remove(), 250);
    }

    // Click on overlay background closes modal
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });
}

// Inject animation keyframes once
function ensureStyles() {
    if (document.getElementById('mediaPreviewStyles')) return;
    const style = document.createElement('style');
    style.id = 'mediaPreviewStyles';
    style.textContent = `
        @keyframes mpFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes mpFadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
        .media-preview-modal-overlay .media-preview-prev:hover,
        .media-preview-modal-overlay .media-preview-next:hover {
            background: rgba(255,255,255,0.3) !important;
        }
    `;
    document.head.appendChild(style);
}
ensureStyles();