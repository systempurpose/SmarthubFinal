// ============================================================
// searchCards.js – Facebook-style row renderers for Search
//
//   - renderUserRow        -> compact row for the live dropdown: avatar,
//                             name, username, Follow/Following pill
//   - renderPostRow        -> compact row for the live dropdown: avatar,
//                             author, time, matched snippet
//   - renderFullPostCard   -> the *full* post card used on the results
//                             page: same look/behavior as a post on the
//                             Home feed / Profile — like (with emoji
//                             picker), reaction summary, comment, save,
//                             delete (owner only), media.
//
// renderFullPostCard intentionally reuses the exact classes already
// styled in home.css (.post-card, .post-actions, .like-btn, .save-btn,
// .reaction-summary, etc.) so search results are visually identical to
// the rest of the app, not a separate look.
// ============================================================

import { toggleLike, savePost, unsavePost, deletePost, fetchReactionsSummary } from './home-sb.js';
import { renderVideoThumbnail } from './videoPlayer.js';

// ---- Styles (scoped with fb- prefix so they never collide with se-*) ----
export function ensureFBStyles() {
    if (document.getElementById('fb-search-styles')) return;
    const style = document.createElement('style');
    style.id = 'fb-search-styles';
    style.textContent = `
        .fb-user-row {
            display: flex; align-items: center; gap: 12px;
            padding: 10px 14px; border-radius: 10px; cursor: pointer;
            transition: background 0.15s ease;
        }
        .fb-user-row:hover { background: #f8fafc; }

        .fb-avatar {
            width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0; overflow: hidden;
            display: flex; align-items: center; justify-content: center; color: #fff;
            font-weight: 700; font-size: 16px;
            background: linear-gradient(135deg, #0d9488 0%, #2dd4bf 100%);
        }
        .fb-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .fb-avatar.fb-avatar-sm { width: 40px; height: 40px; font-size: 14px; }

        .fb-user-info { flex: 1; min-width: 0; }
        .fb-user-name { font-weight: 700; font-size: 14.5px; color: #1e293b; line-height: 1.3; }
        .fb-user-username { font-size: 13px; color: #64748b; }

        .fb-follow-btn {
            flex-shrink: 0; border: none; border-radius: 999px; padding: 8px 18px;
            font-size: 13px; font-weight: 700; cursor: pointer;
            background: #0d9488; color: #fff;
            transition: background 0.15s ease, transform 0.1s ease, opacity 0.15s ease;
        }
        .fb-follow-btn:hover { background: #0b7f74; }
        .fb-follow-btn:active { transform: scale(0.96); }
        .fb-follow-btn[data-following="true"] {
            background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0;
        }
        .fb-follow-btn[data-following="true"]:hover {
            background: #fce8ee; color: #dc2626; border-color: #fbcfe0;
        }
        .fb-follow-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .fb-follow-btn.fb-hidden { display: none; }

        mark.fb-hl { background: #ccfbf1; color: #0f766e; border-radius: 3px; padding: 0 1px; }

        .fb-post-row {
            padding: 12px 14px; border-radius: 10px; cursor: pointer;
            transition: background 0.15s ease;
        }
        .fb-post-row:hover { background: #f8fafc; }
        .fb-post-header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
        .fb-post-author-info { flex: 1; min-width: 0; }
        .fb-post-name { font-weight: 700; font-size: 14px; color: #1e293b; }
        .fb-post-meta { font-size: 12px; color: #94a3b8; }
        .fb-post-text {
            margin: 0; font-size: 14.5px; line-height: 1.55; color: #334155;
            padding-left: 54px; word-break: break-word; white-space: pre-wrap;
        }

        .fb-section-label {
            padding: 10px 14px 6px; font-weight: 700; font-size: 13px;
            color: #64748b; display: flex; align-items: center; gap: 6px;
        }
        .fb-section-label i { color: #0d9488; }
        .fb-divider { border: none; border-top: 1px solid #f1f5f9; margin: 4px 0; }

        /* ---- Full post card wrapper (search results page) — the card
           itself reuses .post-card etc. from home.css; this only adds
           the outer spacing/hover so it sits nicely in the results list */
        .fb-results-list .post-card { border-radius: 12px; margin-bottom: 2px; }
        .fb-results-list .post-card:hover { background: #f8fafc; }

        /* ---- Emoji picker (matches Profile/Home's reaction picker) ---- */
        .fb-emoji-picker {
            position: absolute; bottom: calc(100% + 10px); left: 0;
            background: #fff; border-radius: 24px; padding: 8px 10px;
            box-shadow: 0 14px 34px rgba(15,23,42,0.18), 0 2px 8px rgba(15,23,42,0.08);
            display: flex; gap: 2px; align-items: center; z-index: 100;
            opacity: 0; pointer-events: none; transform-origin: bottom left;
            transform: translateY(10px) scale(0.85);
            transition: opacity 0.18s cubic-bezier(0.2,0.7,0.3,1), transform 0.22s cubic-bezier(0.34,1.56,0.64,1);
        }
        .fb-emoji-picker span {
            font-size: 22px; line-height: 1; cursor: pointer; padding: 6px 7px; border-radius: 12px;
            display: inline-flex; align-items: center; justify-content: center;
            transition: transform 0.18s cubic-bezier(0.34,1.56,0.64,1), background 0.15s ease;
        }
        .fb-emoji-picker span:hover { background: #f1f5f9; transform: scale(1.4) translateY(-5px); }

        /* ---- Lightweight toast (search-local, matches app tone colors) ---- */
        .fb-toast-overlay {
            position: fixed; inset: 0; z-index: 999999; pointer-events: none;
            display: flex; align-items: center; justify-content: center; padding: 20px;
            animation: fbToastIn 0.2s ease;
        }
        @keyframes fbToastIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
        @keyframes fbToastOut { to { opacity: 0; transform: scale(0.98); } }
        .fb-toast {
            background: #fff; border-radius: 12px; max-width: 380px; width: 100%;
            padding: 14px 18px; box-shadow: 0 20px 48px rgba(15,23,42,0.2);
            display: flex; align-items: center; gap: 10px; pointer-events: auto;
        }

        /* ---- Lightweight confirm dialog (delete post) ---- */
        .fb-confirm-overlay {
            position: fixed; inset: 0; z-index: 999998; background: rgba(15,23,42,0.55);
            backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center;
            padding: 20px; animation: fbToastIn 0.15s ease;
        }
        .fb-confirm-box {
            background: #fff; border-radius: 16px; max-width: 380px; width: 100%;
            padding: 22px 26px; box-shadow: 0 24px 64px rgba(15,23,42,0.35); text-align: center;
        }
        .fb-confirm-box p { margin: 0 0 18px; font-size: 14.5px; color: #1e293b; line-height: 1.5; }
        .fb-confirm-box .fb-confirm-yes {
            background: #dc2626; color: #fff; border: none; padding: 8px 26px;
            border-radius: 8px; font-weight: 700; cursor: pointer; margin-right: 8px;
        }
        .fb-confirm-box .fb-confirm-no {
            background: #f1f5f9; color: #0f172a; border: none; padding: 8px 26px;
            border-radius: 8px; font-weight: 700; cursor: pointer;
        }
    `;
    document.head.appendChild(style);
}

// ---- Tiny toast + confirm (self-contained, so search doesn't depend on profile.js internals) ----
function fbToast(message, tone = 'info') {
    document.querySelectorAll('.fb-toast-overlay').forEach(n => n.remove());
    const colors = {
        success: { bg: '#d1fae5', border: '#34d399', text: '#065f46', icon: 'fa-check-circle' },
        error: { bg: '#fce8ee', border: '#f87171', text: '#991b1b', icon: 'fa-circle-exclamation' },
        info: { bg: '#e0f2fe', border: '#60a5fa', text: '#1e40af', icon: 'fa-info-circle' },
    };
    const c = colors[tone] || colors.info;
    const overlay = document.createElement('div');
    overlay.className = 'fb-toast-overlay';
    overlay.innerHTML = `
        <div class="fb-toast" style="border-left:4px solid ${c.border}; background:${c.bg};">
            <i class="fas ${c.icon}" style="color:${c.border}; font-size:18px; flex-shrink:0;"></i>
            <span style="color:${c.text}; font-size:13.5px; font-weight:500; line-height:1.4;">${escapeHtml(message)}</span>
        </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => {
        overlay.style.animation = 'fbToastOut 0.2s ease forwards';
        setTimeout(() => overlay.remove(), 220);
    }, 2200);
}

function fbConfirm(message, onYes) {
    const overlay = document.createElement('div');
    overlay.className = 'fb-confirm-overlay';
    overlay.innerHTML = `
        <div class="fb-confirm-box">
            <p>${escapeHtml(message)}</p>
            <button type="button" class="fb-confirm-yes">Delete</button>
            <button type="button" class="fb-confirm-no">Cancel</button>
        </div>
    `;
    document.body.appendChild(overlay);
    const cleanup = () => overlay.remove();
    overlay.querySelector('.fb-confirm-yes').addEventListener('click', () => { cleanup(); onYes && onYes(); });
    overlay.querySelector('.fb-confirm-no').addEventListener('click', cleanup);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
}

// ---- Emoji picker (same 6 reactions used across the app) ----
const EMOJIS = ['❤️', '😊', '😂', '😮', '😢', '😡'];

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

// ---- Escaping / highlighting (shared) ----
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

export function highlightMatch(text, query) {
    if (!text) return '';
    if (!query) return escapeHtml(text);
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return escapeHtml(text);
    const before = escapeHtml(text.slice(0, idx));
    const match = escapeHtml(text.slice(idx, idx + query.length));
    const after = escapeHtml(text.slice(idx + query.length));
    return `${before}<mark class="fb-hl">${match}</mark>${after}`;
}

function initials(name) {
    return (name && name[0] ? name[0] : 'U').toUpperCase();
}

// ---- User row: avatar + name/username(+bio) + Follow pill ----
// user: { user_id, display_name, username, avatar_url, bio? }
// opts: { query, isFollowing, isSelf, small }
export function renderUserRow(user, opts = {}) {
    const { query = '', isFollowing = false, isSelf = false, small = false } = opts;
    const name = user.display_name || user.username || 'User';
    const avatarCls = small ? 'fb-avatar fb-avatar-sm' : 'fb-avatar';
    const followBtn = isSelf
        ? ''
        : `<button type="button" class="fb-follow-btn" data-user-id="${user.user_id}" data-following="${isFollowing}">
               ${isFollowing ? 'Following' : 'Follow'}
           </button>`;
    const bioLine = (!small && user.bio)
        ? `<div class="fb-user-username" style="margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(user.bio)}</div>`
        : '';
    return `
        <div class="fb-user-row" data-user-id="${user.user_id}">
            <div class="${avatarCls}">
                ${user.avatar_url ? `<img src="${user.avatar_url}" alt="">` : initials(name)}
            </div>
            <div class="fb-user-info">
                <div class="fb-user-name">${highlightMatch(name, query)}</div>
                <div class="fb-user-username">@${escapeHtml(user.username || 'user')}</div>
                ${bioLine}
            </div>
            ${followBtn}
        </div>
    `;
}

// ---- Post row: avatar + author name + time, then content ----
// post: { id, decryptedContent, created_at, user_id }
// author: { display_name, username, avatar_url } (may be null if profile missing)
export function renderPostRow(post, query, author) {
    const name = (author && (author.display_name || author.username)) || 'Unknown';
    const avatar = author && author.avatar_url;
    const when = post.created_at ? new Date(post.created_at).toLocaleDateString() : '';
    return `
        <div class="fb-post-row" data-post-id="${post.id}">
            <div class="fb-post-header">
                <div class="fb-avatar fb-avatar-sm">
                    ${avatar ? `<img src="${avatar}" alt="">` : initials(name)}
                </div>
                <div class="fb-post-author-info">
                    <div class="fb-post-name">${escapeHtml(name)}</div>
                    <div class="fb-post-meta">${escapeHtml(when)}</div>
                </div>
            </div>
            <p class="fb-post-text">${highlightMatch(post.decryptedContent, query)}</p>
        </div>
    `;
}

// ---- Full post card: same markup/classes as Profile/Home feed posts ----
// post: { id, decryptedContent, created_at, user_id, media }
// author: { display_name, username, avatar_url }
// state: { likeCount, isLiked, reactionEmoji, summary, isSaved, isOwner }
export function renderFullPostCard(post, query, author, state = {}) {
    const {
        likeCount = 0, isLiked = false, reactionEmoji = '❤️',
        summary = {}, isSaved = false, isOwner = false
    } = state;

    const name = (author && (author.display_name || author.username)) || 'Unknown';
    const username = (author && author.username) || 'user';
    const avatar = author && author.avatar_url;
    const time = post.created_at
        ? new Date(post.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : '';

    const totalReactions = Object.values(summary).reduce((a, b) => a + b, 0);
    const summaryHtml = totalReactions > 0
        ? `<div class="reaction-summary" data-post-id="${post.id}">
             ${Object.entries(summary).map(([emoji, count]) => `<span class="reaction-chip">${emoji} ${count}</span>`).join('')}
             <span class="reaction-total">${totalReactions}</span>
           </div>`
        : '';

    // ---- Media (same shape as profile.js: array of {url, type}) ----
    let mediaHtml = '';
    const mediaArray = Array.isArray(post.media) ? post.media : [];
    if (mediaArray.length > 1) {
        const cols = Math.min(mediaArray.length, 3);
        mediaHtml = `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;margin-top:8px;border-radius:12px;overflow:hidden;">`;
        for (const m of mediaArray.slice(0, 3)) {
            mediaHtml += m.type === 'video'
                ? `<div class="video-thumbnail-container" data-video-url="${escapeHtml(m.url)}" style="aspect-ratio:1/1;"></div>`
                : `<img src="${escapeHtml(m.url)}" style="width:100%;aspect-ratio:1/1;object-fit:cover;background:#000;">`;
        }
        if (mediaArray.length > 3) {
            mediaHtml += `<div style="display:flex;align-items:center;justify-content:center;background:#f1f5f9;font-size:14px;font-weight:700;color:#64748b;aspect-ratio:1/1;border-radius:4px;">+${mediaArray.length - 3}</div>`;
        }
        mediaHtml += '</div>';
    } else if (mediaArray.length === 1) {
        const m = mediaArray[0];
        mediaHtml = m.type === 'video'
            ? `<div class="video-thumbnail-container" data-video-url="${escapeHtml(m.url)}" style="margin-top:8px;"></div>`
            : `<img src="${escapeHtml(m.url)}" style="max-width:100%;border-radius:12px;margin-top:8px;">`;
    } else if (post.media_url) {
        mediaHtml = post.media_type === 'video'
            ? `<div class="video-thumbnail-container" data-video-url="${escapeHtml(post.media_url)}" style="margin-top:8px;"></div>`
            : `<img src="${escapeHtml(post.media_url)}" style="max-width:100%;border-radius:12px;margin-top:8px;">`;
    }

    return `
        <div class="post-card" data-id="${post.id}" style="cursor:pointer;">
            <div class="post-header">
                <div class="post-avatar">${avatar ? `<img src="${avatar}" alt="">` : initials(name)}</div>
                <span class="post-user">${escapeHtml(name)}</span>
                <span class="post-username">@${escapeHtml(username)}</span>
                <span class="post-time">${escapeHtml(time)}</span>
                ${isOwner ? `<button class="delete-post-btn" data-id="${post.id}" type="button" title="Delete post"><i class="fas fa-trash"></i></button>` : ''}
            </div>
            <div class="post-content">
                <p>${highlightMatch(post.decryptedContent, query)}</p>
                ${mediaHtml}
            </div>
            ${summaryHtml}
            <div class="post-actions">
                <div class="like-wrapper">
                    <button class="like-btn ${isLiked ? 'liked' : ''}" data-id="${post.id}">
                        <span class="reaction-emoji">${isLiked ? reactionEmoji : '❤️'}</span>
                        <span class="like-count">${likeCount}</span>
                    </button>
                </div>
                <button class="comment-btn" data-id="${post.id}"><i class="fas fa-comment"></i> <span>0</span></button>
                <button class="save-btn ${isSaved ? 'saved' : ''}" data-id="${post.id}"
                    style="background:none;border:none;display:flex;align-items:center;gap:4px;font-size:14px;color:${isSaved ? '#0d9488' : '#555'};cursor:pointer;">
                    <i class="${isSaved ? 'fas fa-bookmark' : 'far fa-bookmark'}"></i>
                </button>
            </div>
        </div>
    `;
}

// ---- Wire up the full post card's interactions ----
// deps: { currentUserId, onOpenPost(postId), onOpenReactions(postId), onDeleted(postId) }
export function attachFullPostCardHandlers(container, deps = {}) {
    const { onOpenPost, onOpenReactions, onDeleted } = deps;

    container.querySelectorAll('.video-thumbnail-container').forEach(el => {
        const videoUrl = el.dataset.videoUrl;
        if (videoUrl) renderVideoThumbnail(el, videoUrl);
    });

    container.querySelectorAll('.reaction-summary').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            onOpenReactions ? onOpenReactions(el.dataset.postId) : null;
        });
    });

    // ---- Like with emoji picker (stays open when cursor moves to picker) ----
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

        // Reduce gap between button and picker
        picker.style.bottom = 'calc(100% + 2px)';

        // Track hover on picker
        picker.addEventListener('mouseenter', () => {
            isPickerHovered = true;
            clearTimeout(closeTimeout);
        });
        picker.addEventListener('mouseleave', () => {
            isPickerHovered = false;
            // Start a timer to close if they don't re-enter
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
        // Only close if cursor is not on picker
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

    container.querySelectorAll('.save-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const postId = btn.dataset.id;
            const icon = btn.querySelector('i');
            const wasSaved = btn.classList.contains('saved');
            try {
                if (wasSaved) {
                    await unsavePost(postId);
                    icon.className = 'far fa-bookmark';
                    btn.classList.remove('saved');
                    btn.style.color = '#555';
                    fbToast('Post unsaved', 'info');
                } else {
                    await savePost(postId);
                    icon.className = 'fas fa-bookmark';
                    btn.classList.add('saved');
                    btn.style.color = '#0d9488';
                    fbToast('Post saved!', 'success');
                }
            } catch (err) {
                fbToast('Failed: ' + err.message, 'error');
            }
        });
    });

    container.querySelectorAll('.comment-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            onOpenPost && onOpenPost(btn.dataset.id);
        });
    });

    container.querySelectorAll('.delete-post-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const postId = btn.dataset.id;
            fbConfirm('Delete this post?', async () => {
                try {
                    await deletePost(postId);
                    const card = btn.closest('.post-card');
                    if (card) card.remove();
                    fbToast('Post deleted', 'success');
                    onDeleted && onDeleted(postId);
                } catch (err) {
                    fbToast('Failed to delete: ' + err.message, 'error');
                }
            });
        });
    });

    container.querySelectorAll('.post-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            onOpenPost && onOpenPost(card.dataset.id);
        });
    });
}

// ---- Wire up click handlers on a container that holds rendered rows ----
export function attachUserRowHandlers(container, { onProfileClick, onFollowToggle } = {}) {
    container.querySelectorAll('.fb-user-row').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.closest('.fb-follow-btn')) return;
            onProfileClick && onProfileClick(row.dataset.userId);
        });
    });
    container.querySelectorAll('.fb-follow-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!onFollowToggle) return;
            const userId = btn.dataset.userId;
            const wasFollowing = btn.dataset.following === 'true';
            btn.disabled = true;
            try {
                const nowFollowing = await onFollowToggle(userId, wasFollowing);
                btn.dataset.following = String(nowFollowing);
                btn.textContent = nowFollowing ? 'Following' : 'Follow';
            } catch (err) {
                console.warn('[searchCards] Follow toggle failed:', err);
            } finally {
                btn.disabled = false;
            }
        });
    });
}

export function attachPostRowHandlers(container, { onPostClick } = {}) {
    container.querySelectorAll('.fb-post-row').forEach(row => {
        row.addEventListener('click', () => {
            onPostClick && onPostClick(row.dataset.postId);
        });
    });
}