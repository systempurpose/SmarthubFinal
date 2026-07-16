// js/reactionModal.js
import { getSupabaseClient } from './supabase.js';
import { fetchReactedUsers, fetchCommentReactedUsers } from './home-sb.js';
import { followUser, unfollowUser } from './follow.js';

function ensureStyles() {
    if (document.getElementById('rm-styles')) return;
    const style = document.createElement('style');
    style.id = 'rm-styles';
    style.textContent = `
        .rm-overlay {
            position: fixed; inset: 0; z-index: 200000;
            background: rgba(15, 23, 42, 0.55);
            backdrop-filter: blur(6px);
            display: flex; align-items: center; justify-content: center;
            padding: 20px;
            animation: rm-fade-in 0.15s ease;
        }
        @keyframes rm-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes rm-fade-out { to { opacity: 0; } }
        @keyframes rm-pop-in { from { opacity: 0; transform: scale(0.97) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes rm-pop-out { to { opacity: 0; transform: scale(0.97) translateY(6px); } }
        @keyframes rm-spin { to { transform: rotate(360deg); } }

        .rm-overlay.rm-closing { animation: rm-fade-out 0.15s ease forwards; }
        .rm-overlay.rm-closing .rm-card { animation: rm-pop-out 0.15s ease forwards; }

        .rm-card {
            background: #fff; border-radius: 20px;
            max-width: 480px; width: 100%; max-height: 80vh;
            display: flex; flex-direction: column;
            box-shadow: 0 24px 64px rgba(15, 23, 42, 0.35);
            animation: rm-pop-in 0.18s ease;
        }

        .rm-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 16px 20px; border-bottom: 1px solid #e2e8f0;
            flex-shrink: 0;
        }
        .rm-header h3 { margin: 0; font-size: 17px; font-weight: 800; }
        .rm-close {
            background: none; border: none; font-size: 22px; cursor: pointer;
            color: #64748b; width: 34px; height: 34px;
            border-radius: 50%; display: flex; align-items: center; justify-content: center;
            transition: background 0.15s ease;
        }
        .rm-close:hover { background: #f1f5f9; color: #0f172a; }

        .rm-body {
            flex: 1; overflow-y: auto; padding: 8px 20px 16px;
        }

        .rm-filter-bar {
            display: flex;
            gap: 6px;
            padding: 0 0 12px 0;
            border-bottom: 1px solid #e2e8f0;
            margin-bottom: 12px;
            flex-wrap: wrap;
        }
        .rm-filter-btn {
            background: #f1f5f9;
            border: none;
            border-radius: 20px;
            padding: 6px 14px;
            font-size: 13px;
            font-weight: 600;
            color: #64748b;
            cursor: pointer;
            transition: all 0.15s ease;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .rm-filter-btn:hover:not(.active) {
            background: #e6fbf8;
            color: #0d9488;
        }
        .rm-filter-btn.active {
            background: #0d9488;
            color: #fff;
        }
        .rm-filter-btn .count {
            font-weight: 400;
            font-size: 11px;
            opacity: 0.7;
        }
        .rm-filter-btn.active .count { opacity: 0.9; }

        .rm-spinner {
            display: flex; align-items: center; justify-content: center;
            padding: 40px 0; color: #94a3b8;
        }
        .rm-spinner i { font-size: 28px; animation: rm-spin 0.8s linear infinite; }

        .rm-empty {
            text-align: center; padding: 40px 0; color: #94a3b8;
        }

        .rm-user {
            display: flex; align-items: center; gap: 12px;
            padding: 10px 0; border-bottom: 1px solid #f1f5f9;
        }
        .rm-user:last-child { border-bottom: none; }

        .rm-avatar {
            width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
            display: flex; align-items: center; justify-content: center;
            color: #fff; font-weight: 700; font-size: 14px;
            background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%);
            overflow: hidden;
        }
        .rm-avatar img { width: 100%; height: 100%; object-fit: cover; }

        .rm-info { flex: 1; min-width: 0; }
        .rm-name { font-weight: 700; font-size: 14px; color: #0f172a; }
        .rm-username { font-size: 12.5px; color: #64748b; }

        .rm-emoji { font-size: 22px; flex-shrink: 0; margin-left: auto; }

        .rm-follow-btn {
            background: none; border: 1px solid #e2e8f0; border-radius: 20px;
            padding: 4px 14px; font-size: 12px; font-weight: 700;
            color: #64748b; cursor: pointer;
            transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
            flex-shrink: 0;
        }
        .rm-follow-btn:hover { background: #f8fafc; color: #0f172a; border-color: #cbd5e1; }
        .rm-follow-btn.is-following {
            background: #ccfbf1; color: #0d9488; border-color: #ccfbf1;
        }
        .rm-follow-btn.is-following:hover {
            background: #fce8ee; color: #e0245e; border-color: #fce8ee;
        }

        @media (max-width: 480px) {
            .rm-overlay { padding: 0; }
            .rm-card { max-height: 100vh; height: 100%; border-radius: 0; }
        }
    `;
    document.head.appendChild(style);
}

/**
 * Internal function to build and show a reaction modal
 * @param {Array} users - list of user objects { user_id, reaction, display_name, username, avatar_url, is_following }
 * @param {string} title - modal title (e.g. "Reactions" or "Comment Reactions")
 */
function renderReactionModal(users, title = 'Reactions') {
    ensureStyles();
    document.querySelectorAll('.rm-overlay').forEach(el => el.remove());

    if (!users || !users.length) {
        // Use a simple alert or a toast if available
        alert('No reactions yet.');
        return;
    }

    const currentUser = JSON.parse(localStorage.getItem('smarthub.user') || 'null');

    // Group by reaction
    const groups = {};
    users.forEach(u => {
        const emoji = u.reaction || '❤️';
        if (!groups[emoji]) groups[emoji] = [];
        groups[emoji].push(u);
    });

    const sortedEmojis = Object.keys(groups).sort((a, b) => {
        if (a === '❤️') return -1;
        if (b === '❤️') return 1;
        return a.localeCompare(b);
    });

    // Build modal shell
    const overlay = document.createElement('div');
    overlay.className = 'rm-overlay';
    overlay.innerHTML = `
        <div class="rm-card">
            <div class="rm-header">
                <h3>${title}</h3>
                <button class="rm-close" title="Close">&times;</button>
            </div>
            <div class="rm-body" id="rmBody">
                <div class="rm-filter-bar" id="rmFilterBar"></div>
                <div id="rmUserList"></div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const bodyEl = document.getElementById('rmBody');
    const filterBar = document.getElementById('rmFilterBar');
    const userList = document.getElementById('rmUserList');
    const closeBtn = overlay.querySelector('.rm-close');

    let closed = false;
    const closeModal = () => {
        if (closed) return;
        closed = true;
        overlay.classList.add('rm-closing');
        setTimeout(() => overlay.remove(), 150);
    };
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // Build filter buttons
    const allBtn = document.createElement('button');
    allBtn.className = 'rm-filter-btn active';
    allBtn.dataset.filter = 'all';
    allBtn.innerHTML = `All <span class="count">${users.length}</span>`;
    filterBar.appendChild(allBtn);

    sortedEmojis.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'rm-filter-btn';
        btn.dataset.filter = emoji;
        btn.innerHTML = `${emoji} <span class="count">${groups[emoji].length}</span>`;
        filterBar.appendChild(btn);
    });

    // Render function
    const renderList = (filter) => {
        let filtered = users;
        if (filter && filter !== 'all') {
            filtered = users.filter(u => (u.reaction || '❤️') === filter);
        }
        if (!filtered.length) {
            userList.innerHTML = `<div class="rm-empty">No users with that reaction.</div>`;
            return;
        }
        let html = '';
        for (const user of filtered) {
            const isOwn = currentUser && user.user_id === currentUser.id;
            const isFollowing = user.is_following || false;
            const followLabel = isFollowing ? 'Following' : 'Follow';
            const followClass = isFollowing ? 'rm-follow-btn is-following' : 'rm-follow-btn';

            const avatarHtml = user.avatar_url
                ? `<img src="${user.avatar_url}" alt="${user.display_name}">`
                : user.display_name[0].toUpperCase();

            html += `
                <div class="rm-user" data-user-id="${user.user_id}">
                    <div class="rm-avatar">${avatarHtml}</div>
                    <div class="rm-info">
                        <div class="rm-name">${escapeHtml(user.display_name)}</div>
                        <div class="rm-username">@${escapeHtml(user.username || '')}</div>
                    </div>
                    <div class="rm-emoji">${user.reaction}</div>
                    ${!isOwn ? `<button class="${followClass}" data-user-id="${user.user_id}">${followLabel}</button>` : ''}
                </div>
            `;
        }
        userList.innerHTML = html;

        // Follow button events
        userList.querySelectorAll('.rm-follow-btn').forEach(btn => {
            const targetUserId = btn.dataset.userId;
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                btn.disabled = true;
                try {
                    const currentlyFollowing = btn.classList.contains('is-following');
                    if (currentlyFollowing) {
                        await unfollowUser(targetUserId);
                        btn.classList.remove('is-following');
                        btn.textContent = 'Follow';
                    } else {
                        await followUser(targetUserId);
                        btn.classList.add('is-following');
                        btn.textContent = 'Following';
                    }
                } catch (err) {
                    alert('Failed to update follow: ' + err.message);
                } finally {
                    btn.disabled = false;
                }
            });
        });
    };

    // Filter button clicks
    const filterBtns = filterBar.querySelectorAll('.rm-filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderList(btn.dataset.filter);
        });
    });

    // Initial render
    renderList('all');
}

// ---- Public API ----
export async function openReactionModal(postId) {
    try {
        const users = await fetchReactedUsers(postId);
        renderReactionModal(users, 'Reactions');
    } catch (err) {
        console.error('[reactionModal] Error:', err);
        alert('Failed to load reactions: ' + err.message);
    }
}

export async function openCommentReactionModal(commentId) {
    try {
        const users = await fetchCommentReactedUsers(commentId);
        renderReactionModal(users, 'Comment Reactions');
    } catch (err) {
        console.error('[commentReactionModal] Error:', err);
        alert('Failed to load comment reactions: ' + err.message);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}