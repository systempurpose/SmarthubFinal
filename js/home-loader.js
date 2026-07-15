// js/home-loader.js
import { fetchPosts, toggleLike, subscribeToPosts, deletePost, savePost, unsavePost, isPostSaved, fetchReactionsSummary } from './home-sb.js';
import { getSupabaseClient } from './supabase.js';
import { renderVideoThumbnail } from './videoPlayer.js';
import { openPostView } from './postView.js';
import { openReactionModal } from './reactionModal.js';

let currentOffset = 0;
const PAGE_SIZE = 20;
let allPosts = [];
let isLoading = false;

const EMOJIS = ['❤️', '😊', '😂', '😮', '😢', '😡'];

// ---- Custom notification modal ----
function showNotificationModal(message, tone = 'info', duration = 2500) {
    const existing = document.querySelector('.notification-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'notification-modal-overlay';
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

// ---- Custom confirmation modal ----
function showConfirmModal(message, onConfirm, onCancel) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
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
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { cleanup(); if (onCancel) onCancel(); } });

    const escHandler = (e) => {
        if (e.key === 'Escape') { cleanup(); if (onCancel) onCancel(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
}

// ---- Ensure modal styles and animations once ----
function ensureStyles() {
    if (document.getElementById('homeLoaderStyles')) return;
    const style = document.createElement('style');
    style.id = 'homeLoaderStyles';
    style.textContent = `
        @keyframes notifFadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
        @keyframes notifFadeOut { to { opacity: 0; transform: scale(0.98); } }
        @keyframes confirmFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .confirm-overlay button#confirmYes:hover { background: #0b7f74; }
        .confirm-overlay button#confirmNo:hover { background: #e2e8f0; }
        .notification-modal-overlay .notif-close:hover { opacity: 1 !important; }

        @keyframes homeSpin {
            to { transform: rotate(360deg); }
        }
        .home-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid #e2e8f0;
            border-top-color: #0d9488;
            border-radius: 50%;
            animation: homeSpin 0.7s linear infinite;
        }
        .feed-loading {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 60px 0;
        }
        .feed-loading-more {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 8px;
            padding: 20px 0;
            color: #94a3b8;
            font-size: 14px;
        }

        /* ---- Animation enhancements ---- */
        .post-card {
            transition: transform 0.2s cubic-bezier(0.2, 0.7, 0.3, 1), background 0.15s ease, box-shadow 0.15s ease;
        }
        .post-card:hover {
            background: #fafbfc;
            transform: translateY(-1px);
        }

        .post-actions button {
            transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
        }
        .post-actions button:active {
            transform: scale(0.92);
        }
        .post-actions button .fa-heart,
        .post-actions button .fa-bookmark,
        .post-actions button .fa-bookmark-o,
        .post-actions button .fa-comment {
            transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .post-actions button:hover .fa-heart { transform: scale(1.1); }
        .post-actions button:hover .fa-bookmark { transform: scale(1.1); }
        .post-actions button:hover .fa-bookmark-o { transform: scale(1.1); }
        .post-actions button:hover .fa-comment { transform: scale(1.1); }

        .like-btn.liked .fa-heart {
            animation: heartPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes heartPop {
            0% { transform: scale(1); }
            50% { transform: scale(1.5); }
            100% { transform: scale(1); }
        }

        .save-btn.saved .fa-bookmark {
            animation: bookmarkPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes bookmarkPop {
            0% { transform: scale(1); }
            50% { transform: scale(1.3); }
            100% { transform: scale(1); }
        }

        .reaction-summary {
            transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
        }
        .reaction-summary:hover {
            transform: scale(1.02);
        }

        .delete-post-btn {
            transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
        }
        .delete-post-btn:active {
            transform: scale(0.85);
        }

        .composer-submit {
            transition: background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
        }
        .composer-submit:active:not(:disabled) {
            transform: scale(0.95);
        }

        .composer-tools button {
            transition: background 0.15s ease, transform 0.15s ease, color 0.15s ease;
        }
        .composer-tools button:active {
            transform: scale(0.85);
        }

        .feed-tab {
            transition: color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease, transform 0.15s ease;
        }
        .feed-tab:active {
            transform: scale(0.95);
        }

        /* Skeleton shimmer enhancement */
        .skeleton-line {
            animation: shimmer 1.4s ease infinite;
        }
        @keyframes shimmer {
            0% { background-position: 100% 50%; }
            100% { background-position: 0 50%; }
        }
    `;
    document.head.appendChild(style);
}
ensureStyles();

// ---- Loading spinner HTML ----
function renderLoadingSpinner() {
    return `<div class="feed-loading"><div class="home-spinner"></div></div>`;
}

// ---- Emoji reaction picker ----
function createEmojiPicker(onSelect) {
    const picker = document.createElement('div');
    picker.className = 'emoji-picker';
    picker.style.cssText = `
        position:absolute; bottom:calc(100% + 10px); left:0;
        background:white; border-radius:24px; padding:8px 10px;
        box-shadow:0 14px 34px rgba(15,23,42,0.18), 0 2px 8px rgba(15,23,42,0.08);
        display:flex; gap:2px; align-items:center;
        z-index:100; opacity:0; pointer-events:none;
        transform-origin: bottom left;
        transform:translateY(10px) scale(0.85);
        transition:opacity 0.18s cubic-bezier(0.2,0.7,0.3,1), transform 0.22s cubic-bezier(0.34,1.56,0.64,1);
        will-change:transform,opacity;
    `;
    EMOJIS.forEach((emoji) => {
        const btn = document.createElement('span');
        btn.textContent = emoji;
        btn.style.cssText = `
            font-size:22px; line-height:1; cursor:pointer; padding:6px 7px; border-radius:12px;
            display:inline-flex; align-items:center; justify-content:center;
            transition:transform 0.18s cubic-bezier(0.34,1.56,0.64,1), background 0.15s ease;
            transform: scale(1) translateY(0);
        `;
        btn.onmouseenter = () => {
            btn.style.background = '#f1f5f9';
            btn.style.transform = 'scale(1.4) translateY(-5px)';
        };
        btn.onmouseleave = () => {
            btn.style.background = 'transparent';
            btn.style.transform = 'scale(1) translateY(0)';
        };
        btn.onclick = (e) => { e.stopPropagation(); onSelect(emoji); };
        picker.appendChild(btn);
    });
    return picker;
}

function keepPickerOnScreen(picker, wrapper) {
    requestAnimationFrame(() => {
        const rect = picker.getBoundingClientRect();
        if (rect.right > window.innerWidth - 8) {
            picker.style.left = 'auto';
            picker.style.right = '0';
            picker.style.transformOrigin = 'bottom right';
        }
    });
}

export async function loadHomeFeed(containerId = 'homeContent', append = false) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn('[loadHomeFeed] Container not found:', containerId);
        return;
    }
    if (isLoading) return;
    isLoading = true;

    // ---- ✅ Reset offset when loading fresh (not appending) ----
    if (!append) {
        currentOffset = 0;
    }

    if (!append) {
        container.innerHTML = renderLoadingSpinner();
    } else {
        const loadingMore = document.createElement('div');
        loadingMore.id = 'feed-loading-more';
        loadingMore.className = 'feed-loading-more';
        loadingMore.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading more…';
        container.appendChild(loadingMore);
    }

    try {
        const posts = await fetchPosts(PAGE_SIZE, currentOffset);

        if (append) {
            const loadingMore = document.getElementById('feed-loading-more');
            if (loadingMore) loadingMore.remove();
        }

        if (!append) {
            allPosts = posts;
            container.innerHTML = '';
        } else {
            allPosts = allPosts.concat(posts);
        }
        currentOffset += posts.length;
        const currentUser = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
        const currentUserId = currentUser?.id || null;

        let summaryMap = {};
        if (posts.length) {
            const postIds = posts.map(p => p.id);
            const supabase = await getSupabaseClient();
            const { data: likes } = await supabase
                .from('likes')
                .select('post_id, reaction')
                .in('post_id', postIds);
            if (likes) {
                const grouped = {};
                likes.forEach(l => {
                    if (!grouped[l.post_id]) grouped[l.post_id] = {};
                    const r = l.reaction || '❤️';
                    grouped[l.post_id][r] = (grouped[l.post_id][r] || 0) + 1;
                });
                summaryMap = grouped;
            }
        }

        await renderPosts(container, posts, append, currentUserId, summaryMap);
    } catch (err) {
        if (append) {
            const loadingMore = document.getElementById('feed-loading-more');
            if (loadingMore) loadingMore.remove();
        }
        console.error('[loadHomeFeed] Error:', err);
        container.innerHTML = `<div class="error">❌ Failed to load feed: ${err.message}</div>`;
    } finally {
        isLoading = false;
    }
}

async function renderPosts(container, posts, append, currentUserId, summaryMap) {
    if (!posts || posts.length === 0) {
        if (!append) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comment"></i>
                    <h3>No posts yet</h3>
                    <p>Be the first to share a repair tip!</p>
                </div>
            `;
        }
        return;
    }

    let html = '';
    for (const post of posts) {
        const user = post.profiles || {};
        const avatar = user.avatar_url || post.user_id?.[0] || '?';
        const displayName = user.display_name || 'User';
        const username = user.username ? `@${user.username}` : '';
        const time = new Date(post.created_at).toLocaleDateString();
        const likes = post.likes_count?.[0]?.count || 0;
        const comments = post.comments_count?.[0]?.count || 0;
        const isOwner = currentUserId && post.user_id === currentUserId;
        const saved = await isPostSaved(post.id);

        const summary = summaryMap[post.id] || {};
        const totalReactions = Object.values(summary).reduce((a, b) => a + b, 0);
        const summaryHtml = totalReactions > 0
            ? `<div class="reaction-summary" data-post-id="${post.id}">
                ${Object.entries(summary).map(([emoji, count]) =>
                    `<span class="reaction-chip">${emoji} ${count}</span>`
                ).join('')}
                <span class="reaction-total">${totalReactions}</span>
               </div>`
            : '';

        const userReaction = post.userReaction || null;
        const displayEmoji = userReaction || '❤️';
        const isLiked = !!userReaction;

        // ---- Build media array ----
        let mediaArr = [];
        if (post.media && Array.isArray(post.media) && post.media.length) {
            mediaArr = post.media;
        } else if (post.media_url) {
            mediaArr = [{ url: post.media_url, type: post.media_type || 'image' }];
        }

        let mediaHtml = '';
        if (mediaArr.length > 1) {
            const cols = Math.min(mediaArr.length, 3);
            mediaHtml = `
                <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;margin-top:8px;border-radius:12px;overflow:hidden;">
                    ${mediaArr.slice(0, 3).map((m) => {
                        const isVideo = m.type === 'video';
                        if (isVideo) {
                            return `<div class="video-thumbnail-container" data-video-url="${escapeHtml(m.url)}" style="aspect-ratio:1/1;"></div>`;
                        } else {
                            return `<img src="${escapeHtml(m.url)}" style="width:100%;aspect-ratio:1/1;object-fit:cover;background:#000;">`;
                        }
                    }).join('')}
                </div>
                ${mediaArr.length > 3 ? `<div style="font-size:12px;color:#94a3b8;margin-top:4px;">+${mediaArr.length - 3} more</div>` : ''}
            `;
        } else if (mediaArr.length === 1) {
            const m = mediaArr[0];
            if (m.type === 'video') {
                mediaHtml = `<div class="video-thumbnail-container" data-video-url="${escapeHtml(m.url)}" style="margin-top:8px;"></div>`;
            } else {
                mediaHtml = `<img src="${escapeHtml(m.url)}" alt="Media" style="max-width:100%;border-radius:12px;margin-top:8px;">`;
            }
        }

        html += `
            <div class="post-card" data-id="${post.id}">
                <div class="post-header">
                    <div class="post-avatar">
                        ${avatar.startsWith('http') ? `<img src="${avatar}" alt="${displayName}">` : displayName[0].toUpperCase()}
                    </div>
                    <span class="post-user">${escapeHtml(displayName)}</span>
                    ${username ? `<span class="post-username">${escapeHtml(username)}</span>` : ''}
                    <span class="post-time">${time}</span>
                    ${isOwner ? `<button class="delete-post-btn" data-id="${post.id}" style="margin-left:auto;background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px;" title="Delete post"><i class="fas fa-trash"></i></button>` : ''}
                </div>
                <div class="post-body clickable" data-id="${post.id}" style="cursor:pointer;">
                    <div class="post-content">
                        <p>${escapeHtml(post.decryptedContent || '')}</p>
                        ${mediaHtml}
                    </div>
                </div>
                ${summaryHtml}
                <div class="post-actions">
                    <div class="like-wrapper" style="position:relative;display:inline-block;">
                        <button class="like-btn ${isLiked ? 'liked' : ''}" data-id="${post.id}" style="background:none;border:none;display:flex;align-items:center;gap:4px;font-size:14px;color:${isLiked ? '#e0245e' : '#555'};cursor:pointer;transition:transform 0.2s;">
                            <span class="reaction-emoji">${displayEmoji}</span>
                            <span class="like-count">${likes}</span>
                        </button>
                    </div>
                    <button class="comment-btn" data-id="${post.id}" style="background:none;border:none;display:flex;align-items:center;gap:4px;font-size:14px;color:#555;cursor:pointer;">
                        <i class="fas fa-comment"></i> <span>${comments}</span>
                    </button>
                    <button class="save-btn ${saved ? 'saved' : ''}" data-id="${post.id}" style="background:none;border:none;display:flex;align-items:center;gap:4px;font-size:14px;color:${saved ? '#0d9488' : '#555'};cursor:pointer;transition:color 0.15s ease, transform 0.15s ease;">
                        <i class="${saved ? 'fas fa-bookmark' : 'far fa-bookmark'}"></i>
                    </button>
                </div>
            </div>
        `;
    }

    if (append) {
        container.insertAdjacentHTML('beforeend', html);
    } else {
        container.innerHTML = html;
    }

    // ---- Render video thumbnails ----
    const thumbContainers = container.querySelectorAll('.video-thumbnail-container');
    for (const el of thumbContainers) {
        const videoUrl = el.dataset.videoUrl;
        if (videoUrl) {
            renderVideoThumbnail(el, videoUrl);
        }
    }

    // ---- Reaction summary click -> open modal ----
    container.querySelectorAll('.reaction-summary').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const postId = el.dataset.postId;
            openReactionModal(postId);
        });
    });

    // ---- Like with emoji picker ----
    container.querySelectorAll('.like-wrapper').forEach(wrapper => {
        const btn = wrapper.querySelector('.like-btn');
        const postId = btn.dataset.id;
        let picker = null;
        let timeout = null;

        const showPicker = () => {
            if (picker) return;
            picker = createEmojiPicker((emoji) => {
                toggleLikeAction(postId, btn, emoji);
                picker.remove();
                picker = null;
            });
            wrapper.appendChild(picker);
            keepPickerOnScreen(picker, wrapper);
            requestAnimationFrame(() => {
                picker.style.opacity = '1';
                picker.style.pointerEvents = 'auto';
                picker.style.transform = 'translateY(0) scale(1)';
            });
            clearTimeout(timeout);
        };
        const hidePicker = () => {
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

        wrapper.addEventListener('mouseenter', showPicker);
        wrapper.addEventListener('mouseleave', hidePicker);
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLikeAction(postId, btn);
        });
    });

    // ---- Comment, Save, Delete ----
    container.querySelectorAll('.comment-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const postId = btn.dataset.id;
            openPostView(postId);
        });
    });

    container.querySelectorAll('.save-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const postId = btn.dataset.id;
            const icon = btn.querySelector('i');
            try {
                const saved = await isPostSaved(postId);
                if (saved) {
                    await unsavePost(postId);
                    icon.className = 'far fa-bookmark';
                    btn.classList.remove('saved');
                    btn.style.color = '#555';
                    showNotificationModal('Post unsaved', 'info');
                } else {
                    await savePost(postId);
                    icon.className = 'fas fa-bookmark';
                    btn.classList.add('saved');
                    btn.style.color = '#0d9488';
                    showNotificationModal('Post saved!', 'success');
                }
            } catch (err) {
                showNotificationModal('Failed: ' + err.message, 'error');
            }
        });
    });

    container.querySelectorAll('.delete-post-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const postId = btn.dataset.id;
            showConfirmModal('Delete this post?', async () => {
                try {
                    await deletePost(postId);
                    showNotificationModal('Post deleted', 'success');
                    currentOffset = 0;
                    await loadHomeFeed('homeContent', false);
                } catch (err) {
                    showNotificationModal('Failed to delete: ' + err.message, 'error');
                }
            });
        });
    });

    // ---- Click on post body to open modal ----
    container.querySelectorAll('.post-body.clickable').forEach(el => {
        el.addEventListener('click', () => {
            const postId = el.dataset.id;
            openPostView(postId);
        });
    });
}

// ============================================================
// 🆕 LIVE UPDATE: Reaction summary chip
// ============================================================
async function updateReactionSummary(postId) {
    const chip = document.querySelector(`.reaction-summary[data-post-id="${postId}"]`);
    if (!chip) return;
    try {
        const summary = await fetchReactionsSummary(postId);
        const totalReactions = Object.values(summary).reduce((a, b) => a + b, 0);

        if (totalReactions === 0) {
            chip.remove();
            return;
        }

        chip.innerHTML = `
            ${Object.entries(summary).map(([emoji, count]) =>
                `<span class="reaction-chip">${emoji} ${count}</span>`
            ).join('')}
            <span class="reaction-total">${totalReactions}</span>
        `;
    } catch (err) {
        console.warn('Failed to update reaction summary:', err);
    }
}

// ---- Update the like button on a home feed post ----
async function updateFeedLikeButton(postId, liked, reaction, count) {
    const btn = document.querySelector(`.home-container .post-card[data-id="${postId}"] .like-btn`);
    if (!btn) return;
    const countSpan = btn.querySelector('.like-count');
    const emojiSpan = btn.querySelector('.reaction-emoji') || document.createElement('span');
    if (!btn.querySelector('.reaction-emoji')) {
        emojiSpan.className = 'reaction-emoji';
        btn.prepend(emojiSpan);
    }
    if (count !== undefined) {
        countSpan.textContent = count;
    }
    emojiSpan.textContent = liked ? (reaction || '❤️') : '❤️';
    btn.classList.toggle('liked', liked);
    btn.style.color = liked ? '#e0245e' : '#555';
}

// ---- Toggle like with live summary update ----
async function toggleLikeAction(postId, btn, reaction) {
    try {
        const result = await toggleLike(postId, reaction);
        const countSpan = btn.querySelector('.like-count');
        const emojiSpan = btn.querySelector('.reaction-emoji') || document.createElement('span');
        if (!btn.querySelector('.reaction-emoji')) {
            emojiSpan.className = 'reaction-emoji';
            btn.prepend(emojiSpan);
        }
        const current = parseInt(countSpan.textContent) || 0;

        let newCount = current;
        let liked = false;
        if (result.action === 'liked') {
            newCount = current + 1;
            liked = true;
        } else if (result.action === 'unliked') {
            newCount = Math.max(0, current - 1);
            liked = false;
        } else if (result.action === 'updated') {
            liked = true;
        }
        countSpan.textContent = newCount;
        btn.classList.toggle('liked', liked);
        const emoji = liked ? (result.reaction || reaction || '❤️') : '❤️';
        emojiSpan.textContent = emoji;
        btn.style.color = liked ? '#e0245e' : '#555';
        btn.style.transform = 'scale(1.3)';
        setTimeout(() => btn.style.transform = 'scale(1)', 200);

        await updateReactionSummary(postId);
    } catch (err) {
        showNotificationModal('Failed to like: ' + err.message, 'error');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ---- Update the save button on a home feed post ----
async function updateFeedSaveButton(postId, saved) {
    const btn = document.querySelector(`.home-container .post-card[data-id="${postId}"] .save-btn`);
    if (!btn) return;
    const icon = btn.querySelector('i');
    if (saved) {
        icon.className = 'fas fa-bookmark';
        btn.classList.add('saved');
        btn.style.color = '#0d9488';
    } else {
        icon.className = 'far fa-bookmark';
        btn.classList.remove('saved');
        btn.style.color = '#555';
    }
}

// ---- Realtime ----
export async function initRealtimeFeed() {
    try {
        const supabase = await getSupabaseClient();
        if (!supabase || typeof supabase.channel !== 'function') {
            console.warn('Realtime not available');
            return null;
        }
        const subscription = supabase
            .channel('public:posts')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => {
                // Reload feed from the top (offset reset inside loadHomeFeed)
                loadHomeFeed('homeContent', false);
            })
            .subscribe();
        return subscription;
    } catch (err) {
        console.warn('Failed to init realtime:', err);
        return null;
    }
}

// ---- Attach to window for global access ----
window.loadHomeFeed = loadHomeFeed;
// ---- Export helpers (including modal functions for use in home.js) ----
export { updateReactionSummary, updateFeedLikeButton, updateFeedSaveButton, showNotificationModal, showConfirmModal };