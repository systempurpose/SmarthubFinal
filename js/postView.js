// js/postView.js
import { getSupabaseClient } from './supabase.js';
import { toggleLike, addComment, deletePost, fetchPostById, fetchComments, savePost, unsavePost, isPostSaved, fetchReactionsSummary } from './home-sb.js';
import { renderVideoPlayer } from './videoPlayer.js';
import { openReactionModal } from './reactionModal.js';
import { updateReactionSummary, updateFeedLikeButton } from './home-loader.js';
import { updateProfileSummary, updateProfileLikeButton } from './profile.js';

const EMOJIS = ['❤️', '😊', '😂', '😮', '😢', '😡'];

// ============================================================
// Custom notification & confirmation modals (local)
// ============================================================

function showNotificationModal(message, tone = 'info', duration = 2500) {
    const existing = document.querySelector('.pv-notification');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'pv-notification';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 999999;
        pointer-events: none;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        animation: notifFadeIn 0.2s ease;
    `;
    const colors = {
        success: { bg: '#d1fae5', border: '#34d399', text: '#065f46', icon: 'fa-check-circle' },
        error: { bg: '#fce8ee', border: '#f87171', text: '#991b1b', icon: 'fa-circle-exclamation' },
        info: { bg: '#e0f2fe', border: '#60a5fa', text: '#1e40af', icon: 'fa-info-circle' },
    };
    const c = colors[tone] || colors.info;

    overlay.innerHTML = `
        <div style="
            background: #fff;
            border-radius: 12px;
            max-width: 420px;
            width: 100%;
            padding: 16px 20px;
            box-shadow: 0 20px 48px rgba(15, 23, 42, 0.2);
            display: flex;
            align-items: center;
            gap: 12px;
            border-left: 4px solid ${c.border};
            pointer-events: auto;
            background: ${c.bg};
        ">
            <i class="fas ${c.icon}" style="color: ${c.border}; font-size: 20px; flex-shrink: 0;"></i>
            <span style="color: ${c.text}; font-size: 14px; font-weight: 500; line-height: 1.4; flex:1;">
                ${escapeHtml(message)}
            </span>
            <button class="notif-close" style="
                background: none; border: none; color: ${c.text};
                cursor: pointer; font-size: 18px; padding: 0 4px; opacity:0.6;
                transition: opacity 0.15s;
            " aria-label="Close">&times;</button>
        </div>
    `;
    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector('.notif-close');
    const close = () => {
        overlay.style.animation = 'notifFadeOut 0.2s ease forwards';
        setTimeout(() => overlay.remove(), 250);
    };
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });
    const timer = setTimeout(close, duration);
    const escHandler = (e) => {
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    overlay._close = close;
    overlay._timer = timer;
}

function showConfirmModal(message, onConfirm, onCancel) {
    const overlay = document.createElement('div');
    overlay.className = 'pv-confirm';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 999998;
        background: rgba(15, 23, 42, 0.55);
        backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
        animation: confirmFadeIn 0.15s ease;
    `;
    overlay.innerHTML = `
        <div style="
            background: #fff;
            border-radius: 16px;
            max-width: 400px;
            width: 100%;
            padding: 24px 28px;
            box-shadow: 0 24px 64px rgba(15, 23, 42, 0.35);
            text-align: center;
        ">
            <p style="margin: 0 0 20px; font-size: 15px; color: #1e293b; line-height: 1.5;">
                ${escapeHtml(message)}
            </p>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button id="confirmYes" style="
                    background: #0d9488; color: #fff; border: none;
                    padding: 8px 28px; border-radius: 8px; font-weight: 700;
                    cursor: pointer; transition: background 0.15s;
                ">Yes</button>
                <button id="confirmNo" style="
                    background: #f1f5f9; color: #0f172a; border: none;
                    padding: 8px 28px; border-radius: 8px; font-weight: 700;
                    cursor: pointer; transition: background 0.15s;
                ">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const yesBtn = overlay.querySelector('#confirmYes');
    const noBtn = overlay.querySelector('#confirmNo');
    const cleanup = () => overlay.remove();
    yesBtn.addEventListener('click', () => { cleanup(); if (onConfirm) onConfirm(); });
    noBtn.addEventListener('click', () => { cleanup(); if (onCancel) onCancel(); });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { cleanup(); if (onCancel) onCancel(); }
    });
    const escHandler = (e) => {
        if (e.key === 'Escape') { cleanup(); if (onCancel) onCancel(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
}

function ensureModalStyles() {
    if (document.getElementById('pvModalStyles')) return;
    const style = document.createElement('style');
    style.id = 'pvModalStyles';
    style.textContent = `
        @keyframes notifFadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
        @keyframes notifFadeOut { to { opacity: 0; transform: scale(0.98); } }
        @keyframes confirmFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .pv-confirm button#confirmYes:hover { background: #0b7f74; }
        .pv-confirm button#confirmNo:hover { background: #e2e8f0; }
        .pv-notification .notif-close:hover { opacity: 1 !important; }
    `;
    document.head.appendChild(style);
}
ensureModalStyles();

// ---- Inject post view styles ----
function ensureStyles() {
    if (document.getElementById('pv-styles')) return;
    const style = document.createElement('style');
    style.id = 'pv-styles';
    style.textContent = `
        .pv-overlay {
            position: fixed; inset: 0; z-index: 100000;
            background: rgba(15, 23, 42, 0.55);
            backdrop-filter: blur(6px);
            display: flex; align-items: center; justify-content: center;
            padding: 20px;
            animation: pv-fade-in 0.15s ease;
        }
        @keyframes pv-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pv-fade-out { to { opacity: 0; } }
        @keyframes pv-pop-in { from { opacity: 0; transform: scale(0.97) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes pv-pop-out { to { opacity: 0; transform: scale(0.97) translateY(6px); } }
        @keyframes pv-spin { to { transform: rotate(360deg); } }
        @keyframes pv-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
        @keyframes pv-content-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

        .pv-overlay.pv-closing { animation: pv-fade-out 0.15s ease forwards; }
        .pv-overlay.pv-closing .pv-card { animation: pv-pop-out 0.15s ease forwards; }

        .pv-card {
            background: #fff; border-radius: 20px; overflow: hidden;
            width: 100%; max-width: 980px; max-height: 90vh;
            display: flex; flex-direction: column;
            box-shadow: 0 24px 64px rgba(15, 23, 42, 0.35);
            animation: pv-pop-in 0.18s ease;
        }

        .pv-header {
            flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
            gap: 12px; padding: 16px 20px; border-bottom: 1px solid #e2e8f0; background: #fafbfc;
        }
        .pv-user { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .pv-avatar {
            width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; overflow: hidden;
            display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700;
            background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%);
        }
        .pv-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .pv-name { font-weight: 700; font-size: 14.5px; color: #0f172a; line-height: 1.3; }
        .pv-meta { font-size: 12.5px; color: #64748b; line-height: 1.3; }
        .pv-header-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
        .pv-icon-btn {
            background: none; border: none; cursor: pointer; color: #64748b;
            width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
            font-size: 15px; transition: background 0.15s ease, color 0.15s ease, transform 0.12s ease;
        }
        .pv-icon-btn:hover { background: #f1f5f9; color: #0f172a; }
        .pv-icon-btn:active { transform: scale(0.9); }
        .pv-icon-btn.pv-danger:hover { background: #fce8ee; color: #dc2626; }
        .pv-close-btn { font-size: 22px; }

        .pv-body { flex: 1; overflow: hidden; display: flex; }
        .pv-left { flex: 1.6; min-width: 0; overflow-y: auto; padding: 20px 20px 24px; scrollbar-width: none; -ms-overflow-style: none; }
        .pv-left::-webkit-scrollbar { display: none; }
        .pv-right {
            flex: 1; min-width: 260px; max-width: 340px; display: flex; flex-direction: column;
            border-left: 1px solid #e2e8f0; background: #fdfdfd;
        }
        .pv-content-in { animation: pv-content-in 0.22s ease; }

        .pv-loading-body { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 320px; }
        .pv-spinner {
            width: 40px; height: 40px; border-radius: 50%;
            border: 3px solid #e2e8f0; border-top-color: #0d9488;
            animation: pv-spin 0.7s linear infinite;
        }
        .pv-skel-avatar {
            width: 40px; height: 40px; border-radius: 50%;
            background: linear-gradient(90deg, #eef1f4 25%, #e4e8ec 37%, #eef1f4 63%);
            background-size: 400% 100%; animation: pv-shimmer 1.4s ease infinite;
        }
        .pv-skel-line {
            border-radius: 6px;
            background: linear-gradient(90deg, #eef1f4 25%, #e4e8ec 37%, #eef1f4 63%);
            background-size: 400% 100%; animation: pv-shimmer 1.4s ease infinite;
        }
        .pv-error-body {
            flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
            gap: 10px; padding: 40px 24px; color: #64748b; text-align: center; min-height: 280px;
        }
        .pv-error-body i { font-size: 28px; color: #dc2626; }
        .pv-error-body p { margin: 0; font-size: 14px; }

        .pv-post-text { font-size: 15.5px; line-height: 1.65; color: #1e293b; margin: 0 0 4px; white-space: pre-wrap; }

        /* ---- Media gallery ---- */
        .pv-media-gallery {
            position: relative;
            margin-top: 14px;
            border-radius: 14px;
            overflow: hidden;
            background: #000;
            min-height: 120px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .pv-media-gallery img,
        .pv-media-gallery video {
            max-width: 100%;
            max-height: 60vh;
            object-fit: contain;
            display: block;
            cursor: pointer;
        }
        .pv-media-gallery .pv-nav-btn {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(0,0,0,0.6);
            color: #fff;
            border: none;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.15s;
            z-index: 2;
        }
        .pv-media-gallery .pv-nav-btn:hover { background: rgba(0,0,0,0.8); }
        .pv-media-gallery .pv-nav-btn.prev { left: 8px; }
        .pv-media-gallery .pv-nav-btn.next { right: 8px; }
        .pv-media-gallery .pv-media-counter {
            position: absolute;
            bottom: 8px;
            right: 8px;
            background: rgba(0,0,0,0.6);
            color: #fff;
            font-size: 12px;
            padding: 2px 10px;
            border-radius: 12px;
        }
        .pv-media-gallery .pv-media-badge {
            position: absolute;
            top: 8px;
            left: 8px;
            background: rgba(0,0,0,0.6);
            color: #fff;
            font-size: 11px;
            padding: 2px 10px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .pv-media-gallery .pv-video-container {
            width: 100%;
        }

        .pv-comments-head {
            padding: 16px 18px 10px; font-size: 14.5px; font-weight: 700; color: #0f172a;
            display: flex; align-items: center; gap: 6px; flex-shrink: 0;
        }
        .pv-comments-list { flex: 1; overflow-y: auto; padding: 0 18px; scrollbar-width: none; -ms-overflow-style: none; }
        .pv-comments-list::-webkit-scrollbar { display: none; }
        .pv-comment {
            display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid #f1f5f9;
        }
        .pv-comment:last-child { border-bottom: none; }
        .pv-comment-avatar {
            width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; overflow: hidden;
            display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 12.5px;
            background: linear-gradient(135deg, #64748b 0%, #94a3b8 100%);
        }
        .pv-comment-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .pv-comment-name { font-weight: 700; font-size: 13.5px; color: #0f172a; }
        .pv-comment-username { color: #94a3b8; font-size: 12px; }
        .pv-comment-time { color: #cbd5e1; font-size: 11px; }
        .pv-comment-text { font-size: 13.5px; color: #334155; margin-top: 2px; line-height: 1.5; }
        .pv-empty {
            color: #94a3b8; text-align: center; padding: 36px 12px; font-size: 13.5px;
            display: flex; flex-direction: column; align-items: center; gap: 8px;
        }
        .pv-empty i { font-size: 26px; color: #cbd5e1; }

        /* ---- Reaction summary inside modal ---- */
        .pv-summary-wrapper {
            padding: 0 18px 6px;
        }
        .pv-summary-wrapper .reaction-summary {
            margin-left: 0;
        }

        .pv-actions { flex-shrink: 0; border-top: 1px solid #e2e8f0; padding: 12px 18px 16px; background: #fff; }
        .pv-action-row { display: flex; gap: 6px; margin-bottom: 10px; }
        .pv-action-btn {
            display: flex; align-items: center; gap: 6px; background: none; border: 1px solid transparent;
            font-size: 14px; color: #64748b; cursor: pointer; padding: 6px 12px; border-radius: 20px;
            font-weight: 600; transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.12s ease;
        }
        .pv-action-btn:hover { background: #ccfbf1; color: #0d9488; }
        .pv-action-btn:active { transform: scale(0.94); }
        .pv-action-btn.liked { color: #e0245e; }
        .pv-action-btn.liked:hover { background: #fce8ee; color: #e0245e; }
        .pv-action-btn .reaction-emoji { font-size: 18px; line-height: 1; margin-right: 2px; }
        .pv-action-btn.saved { color: #0d9488; }
        .pv-action-btn.saved i { color: #0d9488; }
        .pv-action-btn.saved:hover { background: #ccfbf1; color: #0d9488; }

        .pv-like-wrapper { position: relative; display: inline-block; }
        .pv-emoji-picker {
            position: absolute; bottom: calc(100% + 10px); left: 0;
            background: #fff; border-radius: 24px; padding: 8px 10px;
            box-shadow: 0 14px 34px rgba(15, 23, 42, 0.18), 0 2px 8px rgba(15, 23, 42, 0.08);
            display: flex; gap: 2px; align-items: center;
            z-index: 20; opacity: 0; pointer-events: none;
            transform-origin: bottom left;
            transform: translateY(10px) scale(0.85);
            transition: opacity 0.18s cubic-bezier(0.2, 0.7, 0.3, 1), transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .pv-emoji-picker.visible { opacity: 1; pointer-events: auto; transform: translateY(0) scale(1); }
        .pv-emoji-btn {
            font-size: 22px; line-height: 1; cursor: pointer; padding: 6px 7px; border-radius: 12px;
            display: inline-flex; align-items: center; justify-content: center;
            transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.15s ease;
        }
        .pv-emoji-btn:hover { background: #f1f5f9; transform: scale(1.4) translateY(-5px); }

        .pv-comment-form { display: flex; gap: 8px; }
        .pv-comment-input {
            flex: 1; padding: 9px 14px; border: 1px solid #e2e8f0; border-radius: 20px; font-size: 13.5px;
            outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .pv-comment-input:focus { border-color: #0d9488; box-shadow: 0 0 0 3px #ccfbf1; }
        .pv-comment-submit {
            background: #0d9488; color: #fff; border: none; border-radius: 20px; padding: 9px 18px;
            font-weight: 700; font-size: 13.5px; cursor: pointer; transition: background 0.15s ease, transform 0.12s ease;
            flex-shrink: 0;
        }
        .pv-comment-submit:hover:not(:disabled) { background: #0f766e; }
        .pv-comment-submit:active:not(:disabled) { transform: scale(0.96); }
        .pv-comment-submit:disabled { opacity: 0.5; cursor: not-allowed; }

        @media (max-width: 720px) {
            .pv-overlay { padding: 0; }
            .pv-card { max-width: 100%; max-height: 100vh; height: 100%; border-radius: 0; }
            .pv-body { flex-direction: column; }
            .pv-left { flex: none; max-height: 45vh; }
            .pv-right { max-width: none; border-left: none; border-top: 1px solid #e2e8f0; }
        }
    `;
    document.head.appendChild(style);
}

// ---- Fullscreen toggle helper ----
function toggleElementFullscreen(element) {
    if (!document.fullscreenElement) {
        if (element.requestFullscreen) {
            element.requestFullscreen().catch(err => {
                console.warn('Fullscreen request failed:', err);
            });
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(err => {
                console.warn('Exit fullscreen failed:', err);
            });
        }
    }
}

// ---- Reaction picker ----
function createReactionPicker(onSelect) {
    const picker = document.createElement('div');
    picker.className = 'pv-emoji-picker';
    EMOJIS.forEach(emoji => {
        const btn = document.createElement('span');
        btn.className = 'pv-emoji-btn';
        btn.textContent = emoji;
        btn.onclick = (e) => { e.stopPropagation(); onSelect(emoji); };
        picker.appendChild(btn);
    });
    return picker;
}

function keepPickerOnScreen(picker) {
    requestAnimationFrame(() => {
        const rect = picker.getBoundingClientRect();
        if (rect.right > window.innerWidth - 8) {
            picker.style.left = 'auto';
            picker.style.right = '0';
            picker.style.transformOrigin = 'bottom right';
        }
    });
}

function attachReactionPicker(wrapper, btn, onReact) {
    let picker = null;
    let hideTimeout = null;

    const show = () => {
        if (picker) return;
        picker = createReactionPicker((emoji) => {
            onReact(emoji);
            hide(true);
        });
        wrapper.appendChild(picker);
        keepPickerOnScreen(picker);
        requestAnimationFrame(() => picker.classList.add('visible'));
        clearTimeout(hideTimeout);
    };
    const hide = (immediate = false) => {
        if (!picker) return;
        const remove = () => {
            picker.classList.remove('visible');
            setTimeout(() => {
                if (picker && picker.parentNode) picker.remove();
                picker = null;
            }, 220);
        };
        if (immediate) { remove(); return; }
        hideTimeout = setTimeout(remove, 2000);
    };

    wrapper.addEventListener('mouseenter', show);
    wrapper.addEventListener('mouseleave', () => hide(false));
}

// ---- Helper: live update reaction summary chip (creates if missing) ----
async function updatePostViewSummary(postId) {
    const rightColumn = document.querySelector('.pv-right');
    if (!rightColumn) return;
    let wrapper = rightColumn.querySelector('.pv-summary-wrapper');
    
    try {
        const summary = await fetchReactionsSummary(postId);
        const totalReactions = Object.values(summary).reduce((a, b) => a + b, 0);
        
        if (totalReactions === 0) {
            if (wrapper) wrapper.remove();
            return;
        }
        
        const summaryHtml = `
            <div class="reaction-summary" data-post-id="${postId}">
                ${Object.entries(summary).map(([emoji, count]) =>
                    `<span class="reaction-chip">${emoji} ${count}</span>`
                ).join('')}
                <span class="reaction-total">${totalReactions}</span>
            </div>
        `;
        
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'pv-summary-wrapper';
            const actions = rightColumn.querySelector('.pv-actions');
            if (actions) {
                rightColumn.insertBefore(wrapper, actions);
            } else {
                rightColumn.appendChild(wrapper);
            }
        }
        wrapper.innerHTML = summaryHtml;
        
        const chip = wrapper.querySelector('.reaction-summary');
        if (chip) {
            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                openReactionModal(postId);
            });
        }
    } catch (err) {
        console.warn('Failed to update summary:', err);
    }
}

// ---- Media gallery renderer with double-click fullscreen ----
function renderMediaGallery(container, items, currentIndex) {
    if (!items || !items.length) {
        container.innerHTML = '';
        return;
    }
    const item = items[currentIndex];
    const isVideo = item.type === 'video';
    const total = items.length;

    let html = `<div class="pv-media-gallery" data-index="${currentIndex}">`;
    if (isVideo) {
        html += `<div class="pv-video-container" data-video-url="${escapeHtml(item.url)}"></div>`;
    } else {
        html += `<img src="${escapeHtml(item.url)}" alt="Media" loading="lazy">`;
    }
    if (total > 1) {
        html += `
            <button class="pv-nav-btn prev" data-dir="-1">&lsaquo;</button>
            <button class="pv-nav-btn next" data-dir="1">&rsaquo;</button>
            <span class="pv-media-counter">${currentIndex+1} / ${total}</span>
        `;
    }
    html += `<span class="pv-media-badge"><i class="fas ${isVideo ? 'fa-video' : 'fa-image'}"></i> ${isVideo ? 'Video' : 'Image'}</span>`;
    html += '</div>';
    container.innerHTML = html;

    // ---- Attach double-click fullscreen for image or video ----
    if (isVideo) {
        const vidContainer = container.querySelector('.pv-video-container');
        if (vidContainer) {
            const videoUrl = vidContainer.dataset.videoUrl;
            if (videoUrl) {
                renderVideoPlayer(vidContainer, videoUrl, { controls: true, autoplay: true }).catch(err => {
                    console.warn('Failed to render video player:', err);
                    vidContainer.innerHTML = `<div style="color:#dc2626;padding:16px;text-align:center;">Video playback not available</div>`;
                });
                // Listen for double-click on the video container (which contains the player)
                vidContainer.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    const videoEl = vidContainer.querySelector('video');
                    if (videoEl) toggleElementFullscreen(videoEl);
                });
            }
        }
    } else {
        const img = container.querySelector('img');
        if (img) {
            img.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                toggleElementFullscreen(img);
            });
        }
    }

    // ---- Attach navigation events ----
    const navBtns = container.querySelectorAll('.pv-nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const dir = parseInt(btn.dataset.dir);
            let newIndex = currentIndex + dir;
            if (newIndex < 0) newIndex = items.length - 1;
            if (newIndex >= items.length) newIndex = 0;
            // Stop any playing video
            const video = container.querySelector('video');
            if (video) { video.pause(); video.currentTime = 0; }
            renderMediaGallery(container, items, newIndex);
        });
    });
}

// ---- Main export ----
export async function openPostView(postId) {
    ensureStyles();
    document.querySelectorAll('.pv-overlay').forEach(el => el.remove());

    const currentUser = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!currentUser) {
        showNotificationModal('Please log in to view this post.', 'error');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'pv-overlay';
    modal.innerHTML = `
        <div class="pv-card">
            <div class="pv-header">
                <div class="pv-user">
                    <div class="pv-skel-avatar"></div>
                    <div style="min-width:0;">
                        <div class="pv-skel-line" style="width:130px;height:12px;"></div>
                        <div class="pv-skel-line" style="width:90px;height:10px;margin-top:7px;"></div>
                    </div>
                </div>
                <div class="pv-header-actions">
                    <button class="pv-icon-btn pv-close-btn close-modal-btn" title="Close">&times;</button>
                </div>
            </div>
            <div class="pv-body">
                <div class="pv-loading-body"><div class="pv-spinner"></div></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    let closed = false;
    const closeModal = () => {
        if (closed) return;
        closed = true;
        modal.classList.add('pv-closing');
        setTimeout(() => {
            modal.remove();
            document.body.style.overflow = prevBodyOverflow;
        }, 150);
    };
    modal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    let post, comments = [], userLike = null, summary = {}, isSaved = false;
    try {
        const supabase = await getSupabaseClient();
        const [postResult, commentsResult, likeResult, summaryResult, savedResult] = await Promise.all([
            fetchPostById(postId),
            fetchComments(postId).catch(() => []),
            supabase.from('likes')
                .select('id, reaction')
                .eq('post_id', postId)
                .eq('user_id', currentUser.id)
                .maybeSingle(),
            fetchReactionsSummary(postId).catch(() => ({})),
            isPostSaved(postId).catch(() => false)
        ]);
        post = postResult;
        comments = commentsResult;
        userLike = likeResult?.data || null;
        summary = summaryResult || {};
        isSaved = savedResult;
    } catch (err) {
        console.error('Failed to fetch post:', err);
        if (closed) return;
        renderErrorState(modal, 'Something went wrong loading this post.');
        return;
    }

    if (closed) return;
    if (!post) {
        renderErrorState(modal, 'This post could not be found.');
        return;
    }

    renderPostContent(modal, post, comments, userLike, summary, isSaved, currentUser, closeModal);
}

function renderErrorState(modal, message) {
    const body = modal.querySelector('.pv-body');
    if (!body) return;
    body.innerHTML = `
        <div class="pv-error-body">
            <i class="fas fa-circle-exclamation"></i>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}

function renderPostContent(modal, post, comments, userLike, summary, isSaved, currentUser, closeModal) {
    const user = post.profiles || {};
    const displayName = user.display_name || 'User';
    const username = user.username || '';
    const avatarUrl = user.avatar_url || '';
    const decryptedContent = post.decryptedContent || '';
    const isOwner = currentUser && post.user_id === currentUser.id;

    const userLiked = !!userLike;
    const userReaction = userLike?.reaction || '❤️';

    // Build reaction summary HTML
    const totalReactions = Object.values(summary).reduce((a, b) => a + b, 0);
    const summaryHtml = totalReactions > 0
        ? `<div class="reaction-summary" data-post-id="${post.id}">
            ${Object.entries(summary).map(([emoji, count]) =>
                `<span class="reaction-chip">${emoji} ${count}</span>`
            ).join('')}
            <span class="reaction-total">${totalReactions}</span>
           </div>`
        : '';

    // ---- Build media array ----
    let mediaArr = [];
    if (post.media && Array.isArray(post.media) && post.media.length) {
        mediaArr = post.media;
    } else if (post.media_url) {
        mediaArr = [{ url: post.media_url, type: post.media_type || 'image' }];
    }

    // ---- Header ----
    modal.querySelector('.pv-user').innerHTML = `
        <div class="pv-avatar">
            ${avatarUrl ? `<img src="${avatarUrl}" alt="">` : (displayName[0] || 'U').toUpperCase()}
        </div>
        <div style="min-width:0;">
            <div class="pv-name">${escapeHtml(displayName)}</div>
            <div class="pv-meta">@${escapeHtml(username)} · ${new Date(post.created_at).toLocaleDateString()}</div>
        </div>
    `;
    if (isOwner) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'pv-icon-btn pv-danger delete-post-modal-btn';
        deleteBtn.title = 'Delete post';
        deleteBtn.dataset.id = post.id;
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        modal.querySelector('.pv-header-actions').prepend(deleteBtn);
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            showConfirmModal('Delete this post?', async () => {
                try {
                    await deletePost(post.id);
                    closeModal();
                    const activePage = document.querySelector('.bottom-nav-item.active')?.dataset.page;
                    if (activePage === 'home') {
                        if (typeof window.loadHomeFeed === 'function') {
                            window.loadHomeFeed('homeContent');
                        } else {
                            window.location.reload();
                        }
                    } else if (activePage === 'profile') {
                        if (typeof window.renderProfile === 'function') {
                            window.renderProfile();
                        }
                    }
                    showNotificationModal('Post deleted.', 'success');
                } catch (err) {
                    showNotificationModal('Failed to delete: ' + err.message, 'error');
                }
            });
        });
    }

    // ---- Body ----
    const body = modal.querySelector('.pv-body');
    body.innerHTML = `
        <div class="pv-left pv-content-in">
            <p class="pv-post-text">${escapeHtml(decryptedContent)}</p>
            <div id="pvMediaContainer" class="pv-media-placeholder"></div>
        </div>
        <div class="pv-right pv-content-in">
            <div class="pv-comments-head"><i class="fas fa-comment-dots"></i> Comments</div>
            <div class="pv-comments-list" id="commentsContainer">${renderCommentsHtml(comments)}</div>
            ${summaryHtml ? `<div class="pv-summary-wrapper">${summaryHtml}</div>` : ''}
            <div class="pv-actions">
                <div class="pv-action-row">
                    <div class="pv-like-wrapper">
                        <button id="likeBtn" class="pv-action-btn ${userLiked ? 'liked' : ''}" data-post-id="${post.id}">
                            <span class="reaction-emoji">${userLiked ? userReaction : '❤️'}</span>
                            <span id="likeCount">${post.likes_count || 0}</span>
                        </button>
                    </div>
                    <button id="saveBtn" class="pv-action-btn ${isSaved ? 'saved' : ''}" data-post-id="${post.id}">
                        <i class="fas ${isSaved ? 'fa-bookmark' : 'fa-bookmark-o'}"></i>
                        <span>${isSaved ? 'Saved' : 'Save'}</span>
                    </button>
                </div>
                <div class="pv-comment-form">
                    <input type="text" id="commentInput" class="pv-comment-input" placeholder="Write a comment...">
                    <button id="commentSubmitBtn" class="pv-comment-submit">Post</button>
                </div>
            </div>
        </div>
    `;

    // ---- Render media gallery ----
    const mediaContainer = document.getElementById('pvMediaContainer');
    if (mediaContainer) {
        if (mediaArr.length) {
            modal._mediaItems = mediaArr;
            modal._mediaIndex = 0;
            renderMediaGallery(mediaContainer, mediaArr, 0);
        } else {
            mediaContainer.innerHTML = '';
        }
    }

    // ---- Click on summary to open reaction modal ----
    const summaryEl = modal.querySelector('.reaction-summary');
    if (summaryEl) {
        summaryEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const postId = summaryEl.dataset.postId;
            openReactionModal(postId);
        });
    }

    // ---- Like button: toggle (like/unlike) ----
    const likeWrapper = modal.querySelector('.pv-like-wrapper');
    const likeBtn = modal.querySelector('#likeBtn');
    const likeCount = modal.querySelector('#likeCount');
    const emojiSpan = likeBtn.querySelector('.reaction-emoji');

    const updateLikeUI = (liked, reaction = '❤️') => {
        likeBtn.classList.toggle('liked', liked);
        emojiSpan.textContent = liked ? reaction : '❤️';
        const current = parseInt(likeCount.textContent) || 0;
        likeCount.textContent = liked ? current + 1 : Math.max(0, current - 1);
    };

    const toggleLikeAction = async () => {
        likeBtn.disabled = true;
        try {
            const result = await toggleLike(post.id);
            const isLiked = result.action === 'liked';
            const current = parseInt(likeCount.textContent) || 0;
            const newCount = isLiked ? current + 1 : Math.max(0, current - 1);
            updateLikeUI(isLiked);
            // ---- Live update ALL summaries and buttons ----
            await updatePostViewSummary(post.id);
            await updateReactionSummary(post.id);
            await updateProfileSummary(post.id);
            updateFeedLikeButton(post.id, isLiked, result.reaction || '❤️', newCount);
            updateProfileLikeButton(post.id, isLiked, result.reaction || '❤️', newCount);
        } catch (err) {
            showNotificationModal('Failed to like: ' + err.message, 'error');
        } finally {
            likeBtn.disabled = false;
        }
    };

    likeBtn.addEventListener('click', toggleLikeAction);

    // ---- Reaction picker: set/update reaction ----
    const setReaction = async (reaction) => {
        likeBtn.disabled = true;
        try {
            const result = await toggleLike(post.id, reaction);
            const isLiked = result.action === 'liked' || result.action === 'updated';
            const current = parseInt(likeCount.textContent) || 0;
            let newCount = current;
            if (result.action === 'liked') {
                newCount = current + 1;
            } else if (result.action === 'unliked') {
                newCount = Math.max(0, current - 1);
            }
            // If 'updated', count stays same
            likeCount.textContent = newCount;
            likeBtn.classList.toggle('liked', isLiked);
            emojiSpan.textContent = isLiked ? reaction : '❤️';
            // ---- Live update ALL summaries and buttons ----
            await updatePostViewSummary(post.id);
            await updateReactionSummary(post.id);
            await updateProfileSummary(post.id);
            updateFeedLikeButton(post.id, isLiked, reaction, newCount);
            updateProfileLikeButton(post.id, isLiked, reaction, newCount);
        } catch (err) {
            showNotificationModal('Failed to set reaction: ' + err.message, 'error');
        } finally {
            likeBtn.disabled = false;
        }
    };

    attachReactionPicker(likeWrapper, likeBtn, setReaction);

    // ---- Save button ----
    const saveBtn = modal.querySelector('#saveBtn');
    const saveIcon = saveBtn.querySelector('i');
    const saveText = saveBtn.querySelector('span');

    const toggleSave = async () => {
        saveBtn.disabled = true;
        try {
            if (isSaved) {
                await unsavePost(post.id);
                isSaved = false;
                saveIcon.className = 'fas fa-bookmark-o';
                saveText.textContent = 'Save';
                saveBtn.classList.remove('saved');
                showNotificationModal('Post unsaved', 'info');
            } else {
                await savePost(post.id);
                isSaved = true;
                saveIcon.className = 'fas fa-bookmark';
                saveText.textContent = 'Saved';
                saveBtn.classList.add('saved');
                showNotificationModal('Post saved!', 'success');
            }
        } catch (err) {
            showNotificationModal('Failed to save: ' + err.message, 'error');
        } finally {
            saveBtn.disabled = false;
        }
    };

    saveBtn.addEventListener('click', toggleSave);

    // ---- Comment submit ----
    const commentInput = modal.querySelector('#commentInput');
    const commentSubmit = modal.querySelector('#commentSubmitBtn');
    const submitComment = async () => {
        const text = commentInput.value.trim();
        if (!text) return;
        commentSubmit.disabled = true;
        try {
            await addComment(post.id, text);
            const freshComments = await fetchComments(post.id);
            modal.querySelector('#commentsContainer').innerHTML = renderCommentsHtml(freshComments);
            commentInput.value = '';
            showNotificationModal('Comment added!', 'success');
        } catch (err) {
            showNotificationModal('Failed to comment: ' + err.message, 'error');
        } finally {
            commentSubmit.disabled = false;
        }
    };
    commentSubmit.addEventListener('click', submitComment);
    commentInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitComment();
    });
}

// ---- Comments renderer ----
function renderCommentsHtml(commentsData) {
    if (!commentsData || commentsData.length === 0) {
        return `<div class="pv-empty"><i class="fas fa-comment-slash"></i>No comments yet. Be the first!</div>`;
    }
    return commentsData.map(c => {
        const cUser = c.profiles || {};
        const cAvatar = cUser.avatar_url || '';
        const cName = cUser.display_name || 'User';
        const cUsername = cUser.username || '';
        const cTime = new Date(c.created_at).toLocaleDateString();
        const cContent = c.decryptedContent || '';
        return `
            <div class="pv-comment">
                <div class="pv-comment-avatar">
                    ${cAvatar ? `<img src="${cAvatar}" alt="">` : (cName[0] || 'U').toUpperCase()}
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                        <span class="pv-comment-name">${escapeHtml(cName)}</span>
                        <span class="pv-comment-username">@${escapeHtml(cUsername)}</span>
                        <span class="pv-comment-time">${cTime}</span>
                    </div>
                    <div class="pv-comment-text">${escapeHtml(cContent)}</div>
                </div>
            </div>
        `;
    }).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}