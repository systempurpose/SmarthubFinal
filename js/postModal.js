// js/postModal.js
import { getSupabaseClient } from './supabase.js';
import {
    fetchPostById,
    fetchComments,
    toggleLike,
    addComment,
    deletePost,
    savePost,
    unsavePost,
    isPostSaved,
    fetchReactionsSummary,
    addReply,
    fetchCommentsWithReplies,
    getCommentCount,
    toggleCommentReaction,
    fetchCommentReactions
} from './home-sb.js';
import { renderVideoPlayer } from './videoPlayer.js';
import { openReactionModal } from './reactionModal.js';

let modalPostId = null;
let loadToken = 0;
let mediaItems = [];
let mediaIndex = 0;
const EMOJIS = ['❤️', '😊', '😂', '😮', '😢', '😡'];

// ============================================================
// Custom notification & confirmation modals (local)
// ============================================================

function showNotificationModal(message, tone = 'info', duration = 2500) {
    const existing = document.querySelector('.post-modal-notification');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'post-modal-notification';
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
    overlay.className = 'post-modal-confirm';
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
    if (document.getElementById('postModalStyles')) return;
    const style = document.createElement('style');
    style.id = 'postModalStyles';
    style.textContent = `
        @keyframes notifFadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
        @keyframes notifFadeOut { to { opacity: 0; transform: scale(0.98); } }
        @keyframes confirmFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .post-modal-confirm button#confirmYes:hover { background: #0b7f74; }
        .post-modal-confirm button#confirmNo:hover { background: #e2e8f0; }
        .post-modal-notification .notif-close:hover { opacity: 1 !important; }

        @keyframes bookmarkPop {
            0% { transform: scale(1); }
            50% { transform: scale(1.3); }
            100% { transform: scale(1); }
        }
        .save-btn.saved i.fa-bookmark {
            animation: bookmarkPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        /* ---- Comment styles with reactions and replies ---- */
        .pv-comment-wrapper {
            padding: 10px 0;
            border-bottom: 1px solid #f1f5f9;
        }
        .pv-comment-wrapper:last-child { border-bottom: none; }
        .pv-comment-wrapper.pv-reply {
            padding-left: 40px;
            border-bottom: none;
            border-left: 2px solid #e2e8f0;
            margin-left: 12px;
        }
        .pv-comment {
            display: flex; gap: 10px;
        }
        .pv-comment-avatar {
            width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; overflow: hidden;
            display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 12.5px;
            background: linear-gradient(135deg, #64748b 0%, #94a3b8 100%);
        }
        .pv-comment-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .pv-comment-body { flex: 1; min-width: 0; }
        .pv-comment-top {
            display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
        }
        .pv-comment-name { font-weight: 700; font-size: 13.5px; color: #0f172a; }
        .pv-comment-username { color: #94a3b8; font-size: 12px; }
        .pv-comment-time { color: #cbd5e1; font-size: 11px; }
        .pv-comment-text { font-size: 13.5px; color: #334155; margin-top: 2px; line-height: 1.5; }

        .pv-comment-actions {
            display: flex; align-items: center; gap: 8px; margin-top: 4px; flex-wrap: wrap;
        }
        .pv-comment-reactions {
            display: flex; gap: 3px; align-items: center; flex-wrap: wrap;
        }
        .pv-comment-reaction-btn {
            background: none; border: 1px solid #e2e8f0; border-radius: 14px;
            padding: 1px 8px; font-size: 12px; cursor: pointer;
            display: flex; align-items: center; gap: 2px;
            transition: background 0.15s ease, border-color 0.15s ease;
            color: #64748b;
        }
        .pv-comment-reaction-btn:hover {
            background: #f1f5f9;
            border-color: #cbd5e1;
        }
        .pv-comment-reaction-btn.active {
            background: #ccfbf1;
            border-color: #0d9488;
            color: #0d9488;
        }
        .pv-comment-reaction-btn .count {
            font-size: 10px;
            font-weight: 600;
            color: #94a3b8;
        }
        .pv-comment-reaction-btn.active .count {
            color: #0d9488;
        }

        .pv-comment-reply-btn {
            background: none; border: none; color: #64748b;
            font-size: 12px; font-weight: 600; cursor: pointer;
            padding: 2px 6px; border-radius: 4px;
            transition: background 0.15s ease, color 0.15s ease;
        }
        .pv-comment-reply-btn:hover {
            background: #f1f5f9;
            color: #0d9488;
        }

        .pv-reply-input-container {
            margin-top: 6px; display: flex; gap: 6px; align-items: center;
        }
        .pv-reply-input {
            flex: 1; padding: 6px 12px; border: 1px solid #e2e8f0; border-radius: 16px;
            font-size: 13px; outline: none; transition: border-color 0.15s;
            background: #fafbfc;
        }
        .pv-reply-input:focus { border-color: #0d9488; background: #fff; }
        .pv-reply-submit {
            background: #0d9488; color: #fff; border: none; border-radius: 16px;
            padding: 6px 14px; font-size: 12px; font-weight: 600; cursor: pointer;
            transition: background 0.15s ease, transform 0.12s ease;
        }
        .pv-reply-submit:hover:not(:disabled) { background: #0f766e; }
        .pv-reply-submit:active:not(:disabled) { transform: scale(0.94); }
        .pv-reply-submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .pv-reply-cancel {
            background: none; border: none; color: #94a3b8; font-size: 12px;
            cursor: pointer; padding: 4px 6px;
        }
        .pv-reply-cancel:hover { color: #64748b; }

        .pv-emoji-picker {
            position: absolute; bottom: calc(100% + 10px); left: 0;
            background: #fff; border-radius: 24px; padding: 8px 10px;
            box-shadow: 0 14px 34px rgba(15, 23, 42, 0.18), 0 2px 8px rgba(15, 23, 42, 0.08);
            display: flex; gap: 2px; align-items: center;
            z-index: 20; opacity: 0; pointer-events: none;
            transform-origin: bottom left;
            transform: translateY(10px) scale(0.85);
            transition: opacity 0.18s cubic-bezier(0.2,0.7,0.3,1), transform 0.22s cubic-bezier(0.34,1.56,0.64,1);
        }
        .pv-emoji-picker.visible { opacity: 1; pointer-events: auto; transform: translateY(0) scale(1); }
        .pv-emoji-btn {
            font-size: 22px; line-height: 1; cursor: pointer; padding: 6px 7px; border-radius: 12px;
            display: inline-flex; align-items: center; justify-content: center;
            transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.15s ease;
        }
        .pv-emoji-btn:hover { background: #f1f5f9; transform: scale(1.4) translateY(-5px); }

        .post-modal-comment-emoji-picker {
            display: inline-flex; gap: 2px; padding: 4px 6px;
            background: #fff; border-radius: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.12);
            transform: none; opacity: 1; pointer-events: auto;
            position: relative;
        }
        .post-modal-comment-emoji-picker .pv-emoji-btn {
            font-size: 18px;
        }

        .pv-empty {
            color: #94a3b8; text-align: center; padding: 36px 12px; font-size: 13.5px;
        }
        .pv-empty i { font-size: 26px; color: #cbd5e1; }
    `;
    document.head.appendChild(style);
}
ensureModalStyles();

// ---- Emoji reaction picker ----
function createEmojiPicker(onSelect) {
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
        picker = createEmojiPicker((emoji) => {
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

// ---- Spinner and modal styles ----
function ensureSpinnerStyles() {
    if (document.getElementById('postModalSpinnerStyles')) return;
    const style = document.createElement('style');
    style.id = 'postModalSpinnerStyles';
    style.textContent = `
        @keyframes postModalSpin { to { transform: rotate(360deg); } }
        @keyframes postModalFadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes postModalShimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }

        #postModalLoading {
            position:absolute; inset:0; background:rgba(255,255,255,0.9);
            backdrop-filter:blur(2px); display:flex; align-items:center; justify-content:center;
            z-index:5; opacity:0; pointer-events:none; transition:opacity 0.18s ease;
        }
        #postModalLoading.visible { opacity:1; pointer-events:auto; }

        .post-modal-skeleton {
            display: flex; flex-direction: row; width: 100%; gap: 20px;
        }
        .post-modal-skeleton-left {
            flex: 2; display: flex; flex-direction: column; gap: 10px;
        }
        .post-modal-skeleton-right {
            flex: 1; display: flex; flex-direction: column; gap: 10px;
            border-left: 1px solid #e2e8f0; padding-left: 20px;
        }
        .post-modal-skel-line {
            height: 12px; border-radius: 6px;
            background: linear-gradient(90deg, #eef1f4 25%, #e4e8ec 37%, #eef1f4 63%);
            background-size: 400% 100%;
            animation: postModalShimmer 1.4s ease infinite;
        }
        .post-modal-skel-avatar {
            width: 40px; height: 40px; border-radius: 50%;
            background: linear-gradient(90deg, #eef1f4 25%, #e4e8ec 37%, #eef1f4 63%);
            background-size: 400% 100%;
            animation: postModalShimmer 1.4s ease infinite;
            flex-shrink: 0;
        }
        .post-modal-skel-media {
            aspect-ratio: 16/9;
            border-radius: 12px;
            background: linear-gradient(90deg, #eef1f4 25%, #e4e8ec 37%, #eef1f4 63%);
            background-size: 400% 100%;
            animation: postModalShimmer 1.4s ease infinite;
            margin-top: 6px;
        }
        .post-modal-skel-actions {
            display: flex; gap: 12px; margin-top: 6px;
        }
        .post-modal-skel-btn {
            width: 40px; height: 16px; border-radius: 12px;
            background: linear-gradient(90deg, #eef1f4 25%, #e4e8ec 37%, #eef1f4 63%);
            background-size: 400% 100%;
            animation: postModalShimmer 1.4s ease infinite;
        }

        #postModalBody.content-loaded { animation:postModalFadeIn 0.25s ease; }
        .reaction-summary {
            display: flex; align-items: center; gap: 6px;
            padding: 2px 8px; background: #f8fafc;
            border-radius: 20px; cursor: pointer;
            font-size: 12.5px; font-weight: 600; color: #64748b;
            transition: background 0.15s ease, color 0.15s ease;
            margin-bottom: 6px; width: fit-content;
        }
        .reaction-summary:hover { background: #ccfbf1; color: #0d9488; }
        .reaction-chip { display: flex; align-items: center; gap: 2px; }
        .reaction-total { color: #94a3b8; margin-left: 4px; }

        .media-gallery {
            position: relative;
            border-radius: 12px;
            overflow: hidden;
            background: #000;
            min-height: 120px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .media-gallery img,
        .media-gallery video {
            max-width: 100%;
            max-height: 60vh;
            object-fit: contain;
            display: block;
        }
        .media-gallery .nav-btn {
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
        .media-gallery .nav-btn:hover { background: rgba(0,0,0,0.8); }
        .media-gallery .nav-btn.prev { left: 8px; }
        .media-gallery .nav-btn.next { right: 8px; }
        .media-gallery .media-counter {
            position: absolute;
            bottom: 8px;
            right: 8px;
            background: rgba(0,0,0,0.6);
            color: #fff;
            font-size: 12px;
            padding: 2px 10px;
            border-radius: 12px;
        }
        .media-gallery .media-badge {
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
    `;
    document.head.appendChild(style);
}

function ensureModal() {
    let modal = document.getElementById('postModal');
    if (!modal) {
        ensureSpinnerStyles();
        modal = document.createElement('div');
        modal.id = 'postModal';
        modal.className = 'modal';
        modal.style.cssText = 'display:none;z-index:999999;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);';
        modal.innerHTML = `
            <div class="modal-content" style="position:relative;max-width:1000px;width:95%;max-height:90vh;background:white;border-radius:20px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(0,0,0,0.4);">
                <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #e1e8ed;">
                    <h3 style="margin:0;font-size:18px;">Post</h3>
                    <button id="closePostModal" style="background:none;border:none;font-size:28px;cursor:pointer;color:#999;">&times;</button>
                </div>
                <div id="postModalBody" style="position:relative;flex:1;overflow-y:auto;display:flex;flex-direction:row;padding:16px 20px;min-height:240px;">
                    <div id="postModalLoading">
                        <div class="post-modal-skeleton">
                            <div class="post-modal-skeleton-left">
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <div class="post-modal-skel-avatar"></div>
                                    <div style="flex:1;">
                                        <div class="post-modal-skel-line" style="width:45%; height:14px;"></div>
                                        <div class="post-modal-skel-line" style="width:25%; height:10px; margin-top:6px;"></div>
                                    </div>
                                </div>
                                <div class="post-modal-skel-line" style="width:100%; height:16px;"></div>
                                <div class="post-modal-skel-line" style="width:90%; height:16px;"></div>
                                <div class="post-modal-skel-line" style="width:80%; height:16px;"></div>
                                <div class="post-modal-skel-media"></div>
                            </div>
                            <div class="post-modal-skeleton-right">
                                <div class="post-modal-skel-line" style="width:60%; height:14px;"></div>
                                <div class="post-modal-skel-line" style="width:100%; height:12px;"></div>
                                <div class="post-modal-skel-line" style="width:90%; height:12px;"></div>
                                <div class="post-modal-skel-line" style="width:80%; height:12px;"></div>
                                <div style="flex:1;"></div>
                                <div class="post-modal-skel-actions">
                                    <div class="post-modal-skel-btn"></div>
                                    <div class="post-modal-skel-btn"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div id="modalLeft" style="flex:2;padding-right:20px;min-width:0;display:flex;flex-direction:column;"></div>
                    <div id="modalRight" style="flex:1;display:flex;flex-direction:column;border-left:1px solid #e1e8ed;padding-left:20px;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const closeBtn = modal.querySelector('#closePostModal');
        closeBtn.addEventListener('click', () => {
            stopVideoInModal(modal);
            modal.style.display = 'none';
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                stopVideoInModal(modal);
                modal.style.display = 'none';
            }
        });

        const commentInput = modal.querySelector('#commentInput');
        const commentBtn = modal.querySelector('#postCommentBtn');
        commentBtn.addEventListener('click', async () => {
            const text = commentInput.value.trim();
            if (!text || !modalPostId) return;
            try {
                await addComment(modalPostId, text);
                commentInput.value = '';
                showNotificationModal('Comment added!', 'success');
                await refreshModal(modalPostId, { showLoading: false });
            } catch (err) {
                showNotificationModal('Failed to add comment: ' + err.message, 'error');
            }
        });
        commentInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') commentBtn.click();
        });
    }
    return modal;
}

function stopVideoInModal(modal) {
    const video = modal.querySelector('video');
    if (video) {
        video.pause();
        video.currentTime = 0;
    }
}

function setModalLoading(isLoading) {
    const overlay = document.getElementById('postModalLoading');
    const body = document.getElementById('postModalBody');
    if (!overlay) return;
    overlay.classList.toggle('visible', isLoading);
    if (!isLoading && body) {
        body.classList.remove('content-loaded');
        void body.offsetWidth;
        body.classList.add('content-loaded');
    }
}

// ---- Helper: update reaction summary inside modal ----
async function updateModalSummary(postId) {
    const summaryDiv = document.getElementById('modalSummary');
    if (!summaryDiv) return;
    try {
        const summary = await fetchReactionsSummary(postId);
        const totalReactions = Object.values(summary).reduce((a, b) => a + b, 0);
        if (totalReactions === 0) {
            summaryDiv.innerHTML = '';
            return;
        }
        summaryDiv.innerHTML = `
            <div class="reaction-summary" data-post-id="${postId}">
                ${Object.entries(summary).map(([emoji, count]) =>
                    `<span class="reaction-chip">${emoji} ${count}</span>`
                ).join('')}
                <span class="reaction-total">${totalReactions}</span>
            </div>
        `;
        const chip = summaryDiv.querySelector('.reaction-summary');
        if (chip) {
            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                openReactionModal(postId);
            });
        }
    } catch (err) {
        console.warn('[postModal] Failed to update summary:', err);
        summaryDiv.innerHTML = '';
    }
}

// ---- Like toggle with reaction summary update ----
async function toggleLikeAction(postId, btn) {
    try {
        const result = await toggleLike(postId);
        const countSpan = btn.querySelector('.like-count');
        const current = parseInt(countSpan.textContent);
        countSpan.textContent = result.action === 'liked' ? current + 1 : current - 1;
        btn.classList.toggle('liked', result.action === 'liked');
        btn.style.transform = 'scale(1.3)';
        setTimeout(() => btn.style.transform = 'scale(1)', 200);
        await updateModalSummary(postId);
    } catch (err) {
        showNotificationModal('Failed to like: ' + err.message, 'error');
    }
}

// ---- Render media gallery with navigation ----
function renderMediaGallery(mediaDiv, items, index) {
    if (!items || !items.length) {
        mediaDiv.innerHTML = '';
        return;
    }
    const item = items[index];
    const isVideo = item.type === 'video';
    const total = items.length;

    let html = `<div class="media-gallery" data-index="${index}">`;
    if (isVideo) {
        html += `<div id="galleryVideoContainer" data-video-url="${escapeHtml(item.url)}" style="width:100%;"></div>`;
    } else {
        html += `<img src="${escapeHtml(item.url)}" alt="Media">`;
    }
    if (total > 1) {
        html += `
            <button class="nav-btn prev" data-dir="-1">&lsaquo;</button>
            <button class="nav-btn next" data-dir="1">&rsaquo;</button>
            <span class="media-counter">${index+1} / ${total}</span>
        `;
    }
    html += `<span class="media-badge"><i class="fas ${isVideo ? 'fa-video' : 'fa-image'}"></i> ${isVideo ? 'Video' : 'Image'}</span>`;
    html += '</div>';
    mediaDiv.innerHTML = html;

    if (isVideo) {
        const vidContainer = document.getElementById('galleryVideoContainer');
        if (vidContainer) {
            const videoUrl = vidContainer.dataset.videoUrl;
            if (videoUrl) {
                renderVideoPlayer(vidContainer, videoUrl, { controls: true, autoplay: true }).catch(err => {
                    console.warn('Failed to render video player:', err);
                    vidContainer.innerHTML = `<div style="color:#dc2626;padding:16px;text-align:center;">Video playback not available</div>`;
                });
            }
        }
    }

    const navBtns = mediaDiv.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const dir = parseInt(btn.dataset.dir);
            let newIndex = index + dir;
            if (newIndex < 0) newIndex = items.length - 1;
            if (newIndex >= items.length) newIndex = 0;
            mediaIndex = newIndex;
            const video = mediaDiv.querySelector('video');
            if (video) { video.pause(); video.currentTime = 0; }
            renderMediaGallery(mediaDiv, items, newIndex);
        });
    });
}

// ---- Render comments with reactions and replies ----
function renderCommentsWithReplies(commentsData, postId, currentUser) {
    if (!commentsData || commentsData.length === 0) {
        return `<div class="pv-empty"><i class="fas fa-comment-slash"></i> No comments yet. Be the first!</div>`;
    }

    const renderCommentTree = (comments, isReply = false) => {
        let html = '';
        for (const c of comments) {
            const cUser = c.profiles || {};
            const cAvatar = cUser.avatar_url || '';
            const cName = cUser.display_name || 'User';
            const cUsername = cUser.username || '';
            const cTime = new Date(c.created_at).toLocaleDateString();
            const cContent = c.decryptedContent || '';

            const reactionCounts = c.reactionCounts || {};
            const userReaction = c.userReaction || null;
            let reactionsHtml = '';
            const reactionTypes = Object.keys(reactionCounts);
            if (reactionTypes.length) {
                reactionsHtml = reactionTypes.map(emoji => {
                    const count = reactionCounts[emoji];
                    const isActive = userReaction === emoji;
                    return `<button class="pv-comment-reaction-btn ${isActive ? 'active' : ''}" data-comment-id="${c.id}" data-reaction="${emoji}">
                        ${emoji} <span class="count">${count}</span>
                    </button>`;
                }).join('');
            }
            // Always show the "add reaction" button (➕)
            reactionsHtml += `<button class="pv-comment-reaction-btn add-reaction" data-comment-id="${c.id}" title="Add reaction">➕</button>`;

            const replyCount = c.replies ? c.replies.length : 0;
            const hasReplies = replyCount > 0;

            html += `
                <div class="pv-comment-wrapper ${isReply ? 'pv-reply' : ''}" data-comment-id="${c.id}">
                    <div class="pv-comment">
                        <div class="pv-comment-avatar">
                            ${cAvatar ? `<img src="${cAvatar}" alt="">` : (cName[0] || 'U').toUpperCase()}
                        </div>
                        <div class="pv-comment-body">
                            <div class="pv-comment-top">
                                <span class="pv-comment-name">${escapeHtml(cName)}</span>
                                <span class="pv-comment-username">@${escapeHtml(cUsername)}</span>
                                <span class="pv-comment-time">${cTime}</span>
                            </div>
                            <div class="pv-comment-text">${escapeHtml(cContent)}</div>
                            <div class="pv-comment-actions">
                                <div class="pv-comment-reactions">${reactionsHtml}</div>
                                <button class="pv-comment-reply-btn" data-comment-id="${c.id}">Reply${hasReplies ? ` (${replyCount})` : ''}</button>
                            </div>
                            <div class="pv-reply-container" data-comment-id="${c.id}"></div>
                        </div>
                    </div>
                    ${hasReplies ? renderCommentTree(c.replies, true) : ''}
                </div>
            `;
        }
        return html;
    };

    return renderCommentTree(commentsData);
}

// ---- Handle comment reaction ----
async function handleCommentReaction(commentId, reaction, btn) {
    try {
        const result = await toggleCommentReaction(commentId, reaction);
        const wrapper = btn.closest('.pv-comment-wrapper');
        if (!wrapper) return;

        const reactions = await fetchCommentReactions(commentId);
        const counts = reactions.reduce((acc, r) => {
            acc[r.reaction] = (acc[r.reaction] || 0) + 1;
            return acc;
        }, {});
        const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
        const userReaction = reactions.find(r => r.user_id === user?.id)?.reaction || null;

        const reactionContainer = wrapper.querySelector('.pv-comment-reactions');
        if (!reactionContainer) return;

        let html = '';
        const reactionTypes = Object.keys(counts);
        if (reactionTypes.length) {
            html = reactionTypes.map(emoji => {
                const count = counts[emoji];
                const isActive = userReaction === emoji;
                return `<button class="pv-comment-reaction-btn ${isActive ? 'active' : ''}" data-comment-id="${commentId}" data-reaction="${emoji}">
                    ${emoji} <span class="count">${count}</span>
                </button>`;
            }).join('');
        }
        html += `<button class="pv-comment-reaction-btn add-reaction" data-comment-id="${commentId}" title="Add reaction">➕</button>`;
        reactionContainer.innerHTML = html;

        // Re-bind events
        reactionContainer.querySelectorAll('.pv-comment-reaction-btn').forEach(b => {
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                const cId = b.dataset.commentId;
                const rxn = b.dataset.reaction;
                if (b.classList.contains('add-reaction')) {
                    const parent = b.closest('.pv-comment-wrapper');
                    if (parent) {
                        const existingPicker = b.parentElement.querySelector('.post-modal-comment-emoji-picker');
                        if (existingPicker) { existingPicker.remove(); return; }
                        const picker = document.createElement('div');
                        picker.className = 'post-modal-comment-emoji-picker';
                        EMOJIS.forEach(emoji => {
                            const span = document.createElement('span');
                            span.className = 'pv-emoji-btn';
                            span.textContent = emoji;
                            span.onclick = async (e) => {
                                e.stopPropagation();
                                await handleCommentReaction(cId, emoji, b);
                                picker.remove();
                            };
                            picker.appendChild(span);
                        });
                        b.parentElement.appendChild(picker);
                        setTimeout(() => {
                            document.addEventListener('click', function closePicker(e) {
                                if (!picker.contains(e.target) && !b.contains(e.target)) {
                                    picker.remove();
                                    document.removeEventListener('click', closePicker);
                                }
                            });
                        }, 10);
                    }
                    return;
                }
                if (rxn) {
                    handleCommentReaction(cId, rxn, b);
                }
            });
        });

    } catch (err) {
        showNotificationModal('Failed to react: ' + err.message, 'error');
    }
}

// ---- Attach comment events ----
function attachCommentEvents(container, postId, currentUser) {
    if (!container) return;

    // Reaction buttons
    container.querySelectorAll('.pv-comment-reaction-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const commentId = btn.dataset.commentId;
            const reaction = btn.dataset.reaction;

            if (btn.classList.contains('add-reaction')) {
                const existingPicker = btn.parentElement.querySelector('.post-modal-comment-emoji-picker');
                if (existingPicker) { existingPicker.remove(); return; }
                const picker = document.createElement('div');
                picker.className = 'post-modal-comment-emoji-picker';
                EMOJIS.forEach(emoji => {
                    const span = document.createElement('span');
                    span.className = 'pv-emoji-btn';
                    span.textContent = emoji;
                    span.onclick = async (e) => {
                        e.stopPropagation();
                        await handleCommentReaction(commentId, emoji, btn);
                        picker.remove();
                    };
                    picker.appendChild(span);
                });
                btn.parentElement.appendChild(picker);
                setTimeout(() => {
                    document.addEventListener('click', function closePicker(e) {
                        if (!picker.contains(e.target) && !btn.contains(e.target)) {
                            picker.remove();
                            document.removeEventListener('click', closePicker);
                        }
                    });
                }, 10);
                return;
            }

            if (reaction) {
                await handleCommentReaction(commentId, reaction, btn);
            }
        });
    });

    // Reply buttons
    container.querySelectorAll('.pv-comment-reply-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const commentId = btn.dataset.commentId;
            const body = btn.closest('.pv-comment-body');
            const container = body?.querySelector('.pv-reply-container');
            if (!container) return;

            const existing = container.querySelector('.pv-reply-input-container');
            if (existing) { existing.remove(); return; }

            const replyDiv = document.createElement('div');
            replyDiv.className = 'pv-reply-input-container';
            replyDiv.innerHTML = `
                <input type="text" class="pv-reply-input" placeholder="Write a reply..." maxlength="500">
                <button class="pv-reply-submit">Reply</button>
                <button class="pv-reply-cancel">Cancel</button>
            `;
            container.appendChild(replyDiv);

            const input = replyDiv.querySelector('.pv-reply-input');
            const submitBtn = replyDiv.querySelector('.pv-reply-submit');
            const cancelBtn = replyDiv.querySelector('.pv-reply-cancel');

            input.focus();

            const submitReply = async () => {
                const text = input.value.trim();
                if (!text) return;
                submitBtn.disabled = true;
                try {
                    await addReply(commentId, text);
                    const freshComments = await fetchCommentsWithReplies(modalPostId);
                    const container = document.querySelector('#commentsContainer');
                    if (container) {
                        container.innerHTML = renderCommentsWithReplies(freshComments, modalPostId, currentUser);
                        const badge = document.querySelector('#commentCountBadge');
                        if (badge) badge.textContent = `(${freshComments.length})`;
                        attachCommentEvents(container, modalPostId, currentUser);
                    }
                    showNotificationModal('Reply added!', 'success');
                } catch (err) {
                    showNotificationModal('Failed to reply: ' + err.message, 'error');
                } finally {
                    submitBtn.disabled = false;
                }
            };

            submitBtn.addEventListener('click', submitReply);
            cancelBtn.addEventListener('click', () => replyDiv.remove());
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') submitReply();
                if (e.key === 'Escape') replyDiv.remove();
            });
        });
    });
}

export async function openPostModal(postId, focusComment = false) {
    modalPostId = postId;
    const modal = ensureModal();
    modal.style.display = 'flex';
    setModalLoading(true);
    await refreshModal(postId, { showLoading: true });
    if (focusComment) {
        const input = document.getElementById('commentInput');
        setTimeout(() => input.focus(), 300);
    }
}

async function refreshModal(postId, { showLoading = false } = {}) {
    const body = document.getElementById('postModalBody');
    const userInfoDiv = document.getElementById('modalUserInfo');
    const textDiv = document.getElementById('modalText');
    const mediaDiv = document.getElementById('modalMedia');
    const commentsDiv = document.getElementById('modalComments');
    const summaryDiv = document.getElementById('modalSummary');
    const likeWrapper = body.querySelector('.like-wrapper');
    const likeBtn = body.querySelector('.like-btn');
    const saveBtn = body.querySelector('.save-btn');

    if (!body) return;

    const myToken = ++loadToken;
    if (showLoading) setModalLoading(true);

    try {
        // Use fetchCommentsWithReplies for nested replies
        const [post, comments, summary] = await Promise.all([
            fetchPostById(postId),
            fetchCommentsWithReplies(postId).catch(() => []),
            fetchReactionsSummary(postId).catch(() => ({}))
        ]);
        if (myToken !== loadToken) return;
        if (!post) {
            body.innerHTML = '<div style="padding:20px;color:red;">Post not found.</div>';
            setModalLoading(false);
            return;
        }

        const currentUser = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
        const isOwner = currentUser && post.user_id === currentUser.id;
        const saved = await isPostSaved(postId);

        let mediaArr = [];
        if (post.media && Array.isArray(post.media) && post.media.length) {
            mediaArr = post.media;
        } else if (post.media_url) {
            mediaArr = [{ url: post.media_url, type: post.media_type || 'image' }];
        }
        mediaItems = mediaArr;
        mediaIndex = 0;

        // User info
        userInfoDiv.innerHTML = `
            <div class="post-avatar" style="width:36px;height:36px;border-radius:50%;background:#c4c9d4;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;flex-shrink:0;">
                ${post.profiles?.avatar_url ? `<img src="${post.profiles.avatar_url}" style="width:100%;height:100%;border-radius:50%;">` : (post.profiles?.display_name?.[0] || 'U').toUpperCase()}
            </div>
            <div>
                <span style="font-weight:600;">${escapeHtml(post.profiles?.display_name || 'User')}</span>
                <span style="color:#999;font-size:13px;margin-left:8px;">${new Date(post.created_at).toLocaleString()}</span>
            </div>
            ${isOwner ? `<button class="delete-post-btn" data-id="${post.id}" style="margin-left:auto;background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px;"><i class="fas fa-trash"></i></button>` : ''}
        `;

        // Text
        textDiv.innerHTML = `<p style="margin:0;">${escapeHtml(post.decryptedContent || '')}</p>`;

        // Media
        if (mediaArr.length) {
            renderMediaGallery(mediaDiv, mediaArr, 0);
        } else {
            mediaDiv.innerHTML = '';
        }

        // Comments with replies – render using the new renderer
        const commentCount = comments.length;
        commentsDiv.innerHTML = renderCommentsWithReplies(comments, postId, currentUser);
        // Attach event listeners for reactions & replies
        attachCommentEvents(commentsDiv, postId, currentUser);

        // Update comment count badge
        let badge = document.querySelector('#commentCountBadge');
        if (!badge) {
            badge = document.createElement('span');
            badge.id = 'commentCountBadge';
            badge.style.marginLeft = '6px';
            badge.style.fontWeight = '400';
            badge.style.fontSize = '13px';
            badge.style.color = '#94a3b8';
            const head = document.querySelector('.modal-header h3');
            if (head) head.appendChild(badge);
        }
        badge.textContent = `(${commentCount})`;

        // Reaction summary
        const totalReactions = Object.values(summary).reduce((a, b) => a + b, 0);
        if (totalReactions > 0) {
            summaryDiv.innerHTML = `
                <div class="reaction-summary" data-post-id="${post.id}">
                    ${Object.entries(summary).map(([emoji, count]) =>
                        `<span class="reaction-chip">${emoji} ${count}</span>`
                    ).join('')}
                    <span class="reaction-total">${totalReactions}</span>
                </div>
            `;
            const chip = summaryDiv.querySelector('.reaction-summary');
            if (chip) {
                chip.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openReactionModal(post.id);
                });
            }
        } else {
            summaryDiv.innerHTML = '';
        }

        // Like button
        likeBtn.dataset.id = post.id;
        likeBtn.querySelector('.like-count').textContent = post.likes_count || 0;
        likeBtn.querySelector('i').className = `fas ${post.userReaction ? 'fa-heart liked' : 'fa-heart'}`;
        likeBtn.classList.toggle('liked', !!post.userReaction);

        // Emoji picker
        if (likeWrapper._cleanup) likeWrapper._cleanup();
        let picker = null;
        let timeout = null;
        const newShowPicker = () => {
            if (picker) return;
            picker = createEmojiPicker((emoji) => {
                toggleLikeAction(post.id, likeBtn);
                picker.remove();
                picker = null;
            });
            likeWrapper.appendChild(picker);
            keepPickerOnScreen(picker);
            requestAnimationFrame(() => {
                picker.style.opacity = '1';
                picker.style.pointerEvents = 'auto';
                picker.style.transform = 'translateY(0) scale(1)';
            });
            clearTimeout(timeout);
        };
        const newHidePicker = () => {
            if (!picker) return;
            timeout = setTimeout(() => {
                picker.style.opacity = '0';
                picker.style.pointerEvents = 'none';
                picker.style.transform = 'translateY(10px) scale(0.85)';
                setTimeout(() => {
                    if (picker && picker.parentNode) picker.remove();
                    picker = null;
                }, 220);
            }, 2000);
        };
        likeWrapper._cleanup = () => {
            likeWrapper.removeEventListener('mouseenter', newShowPicker);
            likeWrapper.removeEventListener('mouseleave', newHidePicker);
        };
        likeWrapper.addEventListener('mouseenter', newShowPicker);
        likeWrapper.addEventListener('mouseleave', newHidePicker);

        likeBtn.onclick = (e) => {
            e.stopPropagation();
            toggleLikeAction(post.id, likeBtn);
        };

        // Save button
        saveBtn.dataset.id = post.id;
        const saveIcon = saveBtn.querySelector('i');
        const saveText = saveBtn.querySelector('span');
        saveIcon.className = saved ? 'fas fa-bookmark' : 'far fa-bookmark';
        saveText.textContent = saved ? 'Unsave' : 'Save';
        saveBtn.classList.toggle('saved', saved);
        saveBtn.style.color = saved ? '#0d9488' : '#555';

        saveBtn.onclick = async (e) => {
            e.stopPropagation();
            const pId = saveBtn.dataset.id;
            try {
                const savedNow = await isPostSaved(pId);
                if (savedNow) {
                    await unsavePost(pId);
                    saveIcon.className = 'far fa-bookmark';
                    saveText.textContent = 'Save';
                    saveBtn.classList.remove('saved');
                    saveBtn.style.color = '#555';
                    showNotificationModal('Post unsaved', 'info');
                } else {
                    await savePost(pId);
                    saveIcon.className = 'fas fa-bookmark';
                    saveText.textContent = 'Unsave';
                    saveBtn.classList.add('saved');
                    saveBtn.style.color = '#0d9488';
                    showNotificationModal('Post saved!', 'success');
                    saveIcon.style.animation = 'none';
                    void saveIcon.offsetHeight;
                    saveIcon.style.animation = 'bookmarkPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
                    setTimeout(() => { saveIcon.style.animation = ''; }, 350);
                }
            } catch (err) {
                showNotificationModal('Failed: ' + err.message, 'error');
            }
        };

        // Delete button
        const deleteBtn = userInfoDiv.querySelector('.delete-post-btn');
        if (deleteBtn) {
            deleteBtn.onclick = async (e) => {
                e.stopPropagation();
                const pId = deleteBtn.dataset.id;
                showConfirmModal('Delete this post?', async () => {
                    try {
                        await deletePost(pId);
                        showNotificationModal('Post deleted', 'success');
                        document.getElementById('postModal').style.display = 'none';
                    } catch (err) {
                        showNotificationModal('Failed to delete: ' + err.message, 'error');
                    }
                });
            };
        }

        setModalLoading(false);
    } catch (err) {
        if (myToken !== loadToken) return;
        body.innerHTML = `<div style="padding:20px;color:red;">Failed to load post: ${err.message}</div>`;
        setModalLoading(false);
        console.error('Modal refresh error:', err);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}