// js/home-loader.js
import { fetchPosts, toggleLike, subscribeToPosts, deletePost, savePost, unsavePost, isPostSaved, fetchReactionsSummary } from './home-sb.js';
import { getSupabaseClient } from './supabase.js';
import { renderVideoThumbnail } from './videoPlayer.js';
import { openPostView } from './postView.js';
import { openReactionModal } from './reactionModal.js';
import { burstLike, staggerFeedIn, bumpReactionChip, showToast } from './animations.js';

let currentOffset = 0;
const PAGE_SIZE = 20;
let allPosts = [];
let isLoading = false;

const EMOJIS = ['❤️', '😊', '😂', '😮', '😢', '😡'];

function showNotificationModal(message, tone = 'info', duration = 2500) {
    showToast(message, tone, duration);
}

function showConfirmModal(message, onConfirm, onCancel) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
        <div class="confirm-dialog">
            <p class="confirm-message">${escapeHtml(message)}</p>
            <div class="confirm-actions">
                <button id="confirmYes" class="confirm-yes">Yes</button>
                <button id="confirmNo" class="confirm-no">Cancel</button>
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

function ensureStyles() {
    if (document.getElementById('homeLoaderStyles')) return;
    const style = document.createElement('style');
    style.id = 'homeLoaderStyles';
    style.textContent = `
        @keyframes confirmFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .confirm-overlay {
            position: fixed; inset: 0; z-index: 999998;
            background: rgba(15, 23, 42, 0.55);
            backdrop-filter: blur(6px);
            display: flex; align-items: center; justify-content: center;
            padding: 20px;
            animation: confirmFadeIn 0.15s ease;
        }
        .confirm-dialog {
            background: var(--hc-surface, #fff);
            border-radius: var(--hc-radius-lg, 16px);
            max-width: 400px;
            width: 100%;
            padding: 24px 28px;
            box-shadow: var(--hc-shadow-lg, 0 24px 64px rgba(15,23,42,0.35));
            text-align: center;
        }
        .confirm-message {
            margin: 0 0 20px;
            font-size: 15px;
            color: var(--hc-ink, #1e293b);
            line-height: 1.5;
        }
        .confirm-actions {
            display: flex; gap: 10px; justify-content: center;
        }
        .confirm-yes, .confirm-no {
            border: none;
            padding: 8px 28px;
            border-radius: var(--hc-radius-sm, 8px);
            font-weight: 700;
            cursor: pointer;
            transition: background 0.15s ease, transform 0.1s ease;
        }
        .confirm-yes {
            background: var(--hc-accent, #0d9488);
            color: #fff;
        }
        .confirm-yes:hover { background: var(--hc-accent-hover, #0b7f74); }
        .confirm-no {
            background: var(--hc-canvas, #f1f5f9);
            color: var(--hc-ink, #0f172a);
        }
        .confirm-no:hover { background: var(--hc-border, #e2e8f0); }
        .confirm-yes:active, .confirm-no:active { transform: scale(0.96); }

        .emoji-picker {
            position: absolute;
            bottom: calc(100% + 10px);
            left: 0;
            background: var(--hc-surface, #fff);
            border-radius: 24px;
            padding: 8px 10px;
            box-shadow: var(--hc-shadow-lg, 0 14px 34px rgba(15,23,42,0.18));
            display: flex; gap: 2px; align-items: center;
            z-index: 100;
            opacity: 0;
            pointer-events: none;
            transform-origin: bottom left;
            transform: translateY(10px) scale(0.85);
            transition: opacity 0.18s var(--hc-ease, ease), transform 0.22s var(--hca-spring, ease);
            will-change: transform, opacity;
        }
        .emoji-picker span {
            font-size: 22px;
            line-height: 1;
            cursor: pointer;
            padding: 6px 7px;
            border-radius: 12px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.18s var(--hca-spring, ease), background 0.15s ease;
        }
        .emoji-picker span:hover {
            background: var(--hc-canvas, #f1f5f9);
            transform: scale(1.4) translateY(-5px);
        }

        .feed-loading-skeleton {
            display: flex;
            flex-direction: column;
            padding: 0;
        }
        .feed-loading-label {
            padding: 16px var(--hc-gutter, 20px) 4px;
            font-size: 13px;
            font-weight: 500;
            color: var(--hc-muted, #64748b);
        }
        .skeleton-post {
            padding: 16px var(--hc-gutter, 20px);
            border-bottom: 1px solid var(--hc-border, #e6eaf0);
        }
        .skeleton-post .skeleton-line {
            margin-bottom: 8px;
        }
        .skeleton-post .skeleton-line:last-child {
            margin-bottom: 0;
        }

        .feed-loading-more {
            display: flex; justify-content: center; align-items: center; gap: 8px;
            padding: 20px 0;
            color: var(--hc-faint, #94a3b8);
            font-size: 14px;
        }
        .feed-error {
            padding: 32px var(--hc-gutter, 20px);
            text-align: center;
            color: var(--hc-danger, #dc2626);
            font-size: 14px;
        }
        .emoji-picker span.emoji-hover {
            animation: emojiPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @keyframes emojiPop {
            0% { transform: scale(1) translateY(0) rotate(0deg); }
            40% { transform: scale(1.6) translateY(-12px) rotate(-8deg); }
            70% { transform: scale(1.2) translateY(-4px) rotate(4deg); }
            100% { transform: scale(1.4) translateY(-6px) rotate(0deg); }
        }
    `;
    document.head.appendChild(style);
}
ensureStyles();

function renderSkeletonFeed(count = 3) {
    return `
        <div class="feed-loading-skeleton">
            <div class="feed-loading-label">Loading your feed...</div>
            ${Array.from({ length: count }, () => `
                <div class="skeleton-post">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                        <div class="skeleton-line" style="width:38px; height:38px; border-radius:50%; flex-shrink:0; margin-bottom:0;"></div>
                        <div style="flex:1;">
                            <div class="skeleton-line" style="width:35%; height:12px; margin-bottom:4px;"></div>
                            <div class="skeleton-line" style="width:20%; height:10px;"></div>
                        </div>
                    </div>
                    <div class="skeleton-line" style="width:100%; height:14px; margin-bottom:6px;"></div>
                    <div class="skeleton-line" style="width:85%; height:14px; margin-bottom:12px;"></div>
                    <div class="skeleton-line" style="width:100%; aspect-ratio: 16/9; border-radius: var(--hc-radius-md, 14px); margin-bottom:12px;"></div>
                    <div style="display:flex; gap:16px;">
                        <div class="skeleton-line" style="width:40px; height:16px; border-radius:12px;"></div>
                        <div class="skeleton-line" style="width:40px; height:16px; border-radius:12px;"></div>
                        <div class="skeleton-line" style="width:40px; height:16px; border-radius:12px;"></div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function createEmojiPicker(onSelect) {
    const picker = document.createElement('div');
    picker.className = 'emoji-picker';
    picker.style.cssText = `
        position:absolute; bottom:calc(100% + 2px); left:0;
        background:white; border-radius:24px; padding:8px 10px;
        box-shadow:0 14px 34px rgba(15,23,42,0.18), 0 2px 8px rgba(15,23,42,0.08);
        display:flex; gap:2px; align-items:center;
        z-index:100; opacity:0; pointer-events:none;
        transform-origin: bottom left;
        transform:translateY(10px) scale(0.85);
        transition:opacity 0.18s cubic-bezier(0.2,0.7,0.3,1), transform 0.22s cubic-bezier(0.34,1.56,0.64,1);
        will-change:transform,opacity;
    `;
    EMOJIS.forEach(emoji => {
        const btn = document.createElement('span');
        btn.textContent = emoji;
        btn.style.cssText = `
            font-size:22px; line-height:1; cursor:pointer; padding:6px 7px; border-radius:12px;
            display:inline-flex; align-items:center; justify-content:center;
            transition: background 0.15s ease;
            transform: scale(1) translateY(0) rotate(0deg);
        `;
        btn.addEventListener('mouseenter', () => {
            btn.style.background = '#f1f5f9';
            btn.classList.add('emoji-hover');
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'transparent';
            btn.classList.remove('emoji-hover');
        });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            onSelect(emoji);
        });
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

// ---- loadHomeFeed with cancellation support ----
export async function loadHomeFeed(containerId = 'feedPosts', append = false, renderId = null) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn('[loadHomeFeed] Container not found:', containerId);
        return;
    }
    if (isLoading) return;
    isLoading = true;

    if (!append) {
        currentOffset = 0;
    }

    // Show skeleton only on initial load
    if (!append) {
        container.innerHTML = renderSkeletonFeed(3);
    } else {
        const loadingMore = document.createElement('div');
        loadingMore.id = 'feed-loading-more';
        loadingMore.className = 'feed-loading-more';
        loadingMore.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading more…';
        container.appendChild(loadingMore);
    }

    try {
        const posts = await fetchPosts(PAGE_SIZE, currentOffset);

        // ---- CANCELLATION CHECK ----
        if (renderId !== null && renderId !== window._hca_renderId) {
            console.log('[loadHomeFeed] Cancelled (renderId mismatch)');
            isLoading = false;
            return;
        }

        if (append) {
            const loadingMore = document.getElementById('feed-loading-more');
            if (loadingMore) loadingMore.remove();
        }

        if (!append) {
            allPosts = posts;
            // Do NOT clear container – renderPosts will replace skeleton
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

        // Check again before rendering
        if (renderId !== null && renderId !== window._hca_renderId) {
            console.log('[loadHomeFeed] Cancelled before render');
            isLoading = false;
            return;
        }

        await renderPosts(container, posts, append, currentUserId, summaryMap);
    } catch (err) {
        if (append) {
            const loadingMore = document.getElementById('feed-loading-more');
            if (loadingMore) loadingMore.remove();
        }
        console.error('[loadHomeFeed] Error:', err);
        container.innerHTML = `<div class="feed-error">Failed to load feed: ${escapeHtml(err.message)}</div>`;
    } finally {
        isLoading = false;
    }
}

function buildMediaHtml(mediaArr) {
    if (!mediaArr.length) return '';

    if (mediaArr.length > 1) {
        const cols = Math.min(mediaArr.length, 3);
        const cells = mediaArr.slice(0, 3).map((m) => {
            if (m.type === 'video') {
                return `<div class="video-thumbnail-container" data-video-url="${escapeHtml(m.url)}"></div>`;
            }
            return `<img src="${escapeHtml(m.url)}" alt="Media">`;
        }).join('');
        const overflow = mediaArr.length > 3
            ? `<div class="post-media-overflow">+${mediaArr.length - 3} more</div>`
            : '';
        return `<div class="post-media-grid" style="grid-template-columns:repeat(${cols},1fr);">${cells}</div>${overflow}`;
    }

    const m = mediaArr[0];
    if (m.type === 'video') {
        return `<div class="post-media-single"><div class="video-thumbnail-container" data-video-url="${escapeHtml(m.url)}"></div></div>`;
    }
    return `<div class="post-media-single"><img src="${escapeHtml(m.url)}" alt="Media"></div>`;
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

        let mediaArr = [];
        if (post.media && Array.isArray(post.media) && post.media.length) {
            mediaArr = post.media;
        } else if (post.media_url) {
            mediaArr = [{ url: post.media_url, type: post.media_type || 'image' }];
        }
        const mediaHtml = buildMediaHtml(mediaArr);

        html += `
            <div class="post-card" data-id="${post.id}">
                <div class="post-header">
                    <div class="post-avatar">
                        ${avatar.startsWith('http') ? `<img src="${avatar}" alt="${displayName}">` : displayName[0].toUpperCase()}
                    </div>
                    <span class="post-user">${escapeHtml(displayName)}</span>
                    ${username ? `<span class="post-username">${escapeHtml(username)}</span>` : ''}
                    <span class="post-time">${time}</span>
                    ${isOwner ? `<button class="delete-post-btn" data-id="${post.id}" title="Delete post"><i class="fas fa-trash"></i></button>` : ''}
                </div>
                <div class="post-body clickable" data-id="${post.id}">
                    <div class="post-content">
                        <p>${escapeHtml(post.decryptedContent || '')}</p>
                        ${mediaHtml}
                    </div>
                </div>
                ${summaryHtml}
                <div class="post-actions">
                    <div class="like-wrapper">
                        <button class="like-btn ${isLiked ? 'liked' : ''}" data-id="${post.id}">
                            <span class="reaction-emoji">${displayEmoji}</span>
                            <span class="like-count">${likes}</span>
                        </button>
                    </div>
                    <button class="comment-btn" data-id="${post.id}">
                        <i class="fas fa-comment"></i> <span>${comments}</span>
                    </button>
                    <button class="save-btn ${saved ? 'saved' : ''}" data-id="${post.id}">
                        <i class="${saved ? 'fas fa-bookmark' : 'far fa-bookmark'}"></i>
                    </button>
                </div>
            </div>
        `;
    }

    let newCards;
    if (append) {
        const before = new Set(container.querySelectorAll('.post-card'));
        container.insertAdjacentHTML('beforeend', html);
        newCards = [...container.querySelectorAll('.post-card')].filter(el => !before.has(el));
    } else {
        container.innerHTML = html;
        newCards = [...container.querySelectorAll('.post-card')];
    }

    staggerFeedIn(newCards);

    const thumbContainers = container.querySelectorAll('.video-thumbnail-container');
    for (const el of thumbContainers) {
        const videoUrl = el.dataset.videoUrl;
        if (videoUrl) {
            renderVideoThumbnail(el, videoUrl);
        }
    }

    container.querySelectorAll('.reaction-summary').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const postId = el.dataset.postId;
            openReactionModal(postId);
        });
    });

    // ---- Like with emoji picker (gap reduced, close delayed) ----
    container.querySelectorAll('.like-wrapper').forEach(wrapper => {
        const btn = wrapper.querySelector('.like-btn');
        const postId = btn.dataset.id;
        let picker = null;
        let closeTimeout = null;
        let isPickerHovered = false;

        const showPicker = () => {
            if (picker) return;
            picker = createEmojiPicker((emoji) => {
                toggleLikeAction(postId, btn, emoji);
                picker.remove();
                picker = null;
                isPickerHovered = false;
                clearTimeout(closeTimeout);
            });
            wrapper.appendChild(picker);
            keepPickerOnScreen(picker);

            picker.style.bottom = 'calc(100% + 2px)';

            picker.addEventListener('mouseenter', () => {
                isPickerHovered = true;
                clearTimeout(closeTimeout);
            });
            picker.addEventListener('mouseleave', () => {
                isPickerHovered = false;
                closeTimeout = setTimeout(() => {
                    if (!isPickerHovered && picker && picker.parentNode) {
                        hidePicker();
                    }
                }, 150);
            });

            requestAnimationFrame(() => {
                picker.style.opacity = '1';
                picker.style.pointerEvents = 'auto';
                picker.style.transform = 'translateY(0) scale(1)';
            });
        };

        const hidePicker = () => {
            clearTimeout(closeTimeout);
            if (!picker) return;
            picker.style.opacity = '0';
            picker.style.pointerEvents = 'none';
            picker.style.transform = 'translateY(10px) scale(0.85)';
            setTimeout(() => {
                if (picker && picker.parentNode) {
                    picker.remove();
                    picker = null;
                    isPickerHovered = false;
                }
            }, 220);
        };

        wrapper.addEventListener('mouseenter', () => {
            clearTimeout(closeTimeout);
            showPicker();
        });
        wrapper.addEventListener('mouseleave', () => {
            if (!isPickerHovered) {
                closeTimeout = setTimeout(() => {
                    if (!isPickerHovered && picker && picker.parentNode) {
                        hidePicker();
                    }
                }, 150);
            }
        });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLikeAction(postId, btn);
        });
    });

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
                    showNotificationModal('Post unsaved', 'info');
                } else {
                    await savePost(postId);
                    icon.className = 'fas fa-bookmark';
                    btn.classList.add('saved', 'hca-saving');
                    btn.addEventListener('animationend', () => btn.classList.remove('hca-saving'), { once: true });
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
                    await loadHomeFeed('feedPosts', false, window._hca_renderId);
                } catch (err) {
                    showNotificationModal('Failed to delete: ' + err.message, 'error');
                }
            });
        });
    });

    container.querySelectorAll('.post-body.clickable').forEach(el => {
        el.addEventListener('click', () => {
            const postId = el.dataset.id;
            openPostView(postId);
        });
    });
}

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
        bumpReactionChip(chip);
    } catch (err) {
        console.warn('Failed to update reaction summary:', err);
    }
}

async function updateFeedLikeButton(postId, liked, reaction, count) {
    const btn = document.querySelector(`.post-card[data-id="${postId}"] .like-btn`);
    if (!btn) return;
    const countSpan = btn.querySelector('.like-count');
    let emojiSpan = btn.querySelector('.reaction-emoji');
    if (!emojiSpan) {
        emojiSpan = document.createElement('span');
        emojiSpan.className = 'reaction-emoji';
        btn.prepend(emojiSpan);
    }
    if (count !== undefined) {
        countSpan.textContent = count;
    }
    emojiSpan.textContent = liked ? (reaction || '❤️') : '❤️';
    btn.classList.toggle('liked', liked);
}

async function toggleLikeAction(postId, btn, reaction) {
    try {
        const result = await toggleLike(postId, reaction);
        const countSpan = btn.querySelector('.like-count');
        let emojiSpan = btn.querySelector('.reaction-emoji');
        if (!emojiSpan) {
            emojiSpan = document.createElement('span');
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
        emojiSpan.textContent = liked ? (result.reaction || reaction || '❤️') : '❤️';

        if (liked) {
            burstLike(btn, { emoji: emojiSpan.textContent });
        }

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

async function updateFeedSaveButton(postId, saved) {
    const btn = document.querySelector(`.post-card[data-id="${postId}"] .save-btn`);
    if (!btn) return;
    const icon = btn.querySelector('i');
    if (saved) {
        icon.className = 'fas fa-bookmark';
        btn.classList.add('saved');
    } else {
        icon.className = 'far fa-bookmark';
        btn.classList.remove('saved');
    }
}

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
                loadHomeFeed('feedPosts', false, window._hca_renderId);
            })
            .subscribe();
        return subscription;
    } catch (err) {
        console.warn('Failed to init realtime:', err);
        return null;
    }
}

window.loadHomeFeed = loadHomeFeed;

export {
    updateReactionSummary,
    updateFeedLikeButton,
    updateFeedSaveButton,
    showNotificationModal,
    showConfirmModal
};