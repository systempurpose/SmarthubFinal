// ============================================================
// alerts.js – Notifications (full height, centered empty state)
// Real-time updates via Supabase Realtime
// ============================================================

import { getSupabaseClient } from './supabase.js';
import { decryptAndDecompress } from './home-sb.js';

let subscription = null;
let isSubscribed = false;

// ---- Inject styles once ----
function ensureStyles() {
    if (document.getElementById('al-styles')) return;
    const style = document.createElement('style');
    style.id = 'al-styles';
    style.textContent = `
        .al-header {
            display: flex; align-items: center; justify-content: space-between;
            flex-shrink: 0; padding-bottom: 4px;
        }
        .al-header h2 { display: flex; align-items: center; gap: 8px; margin: 0; }
        .al-header h2 i { color: #0d9488; }
        .al-count {
            background: #ccfbf1; color: #0d9488; font-size: 12px; font-weight: 700;
            padding: 2px 9px; border-radius: 999px; min-width: 22px; text-align: center;
        }

        .al-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; margin-top: 8px; }

        .al-item {
            display: flex; align-items: flex-start; gap: 12px; padding: 12px 8px;
            border-radius: 12px; cursor: pointer; transition: background 0.15s ease;
        }
        .al-item:hover { background: #f8fafc; }
        .al-item + .al-item { margin-top: 2px; }

        .al-avatar-wrap { position: relative; flex-shrink: 0; }
        .al-avatar {
            width: 42px; height: 42px; border-radius: 50%; overflow: hidden;
            display: flex; align-items: center; justify-content: center;
            color: #fff; font-weight: 700; font-size: 15px;
            background: linear-gradient(135deg, #64748b 0%, #94a3b8 100%);
        }
        .al-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .al-badge {
            position: absolute; bottom: -3px; right: -3px; width: 20px; height: 20px;
            border-radius: 50%; border: 2px solid #fff; display: flex; align-items: center;
            justify-content: center; font-size: 11px; color: #fff;
            background: #e0245e; /* fallback for likes */
        }
        .al-badge.comment { background: #0d9488; }
        .al-badge .al-reaction-emoji { font-size: 11px; line-height: 1; }

        .al-body { flex: 1; min-width: 0; }
        .al-line { font-size: 14px; color: #1e293b; line-height: 1.4; }
        .al-line strong { font-weight: 700; }
        .al-time { font-size: 12px; color: #94a3b8; margin-top: 2px; }
        .al-quote {
            margin-top: 6px; color: #334155; background: #f8fafc; border-left: 3px solid #0d9488;
            padding: 6px 10px; border-radius: 6px; font-size: 13.5px; line-height: 1.5;
        }

        .al-center {
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            height: 100%; color: #94a3b8; gap: 10px; text-align: center; padding: 20px;
        }
        .al-center i { font-size: 30px; color: #cbd5e1; }
        .al-center.al-error i { color: #f87171; }
        .al-center.al-error { color: #dc2626; }
        .al-spin { animation: al-spin 0.8s linear infinite; }
        @keyframes al-spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
}

// ---- Main render function ----
export async function renderAlerts(container) {
    ensureStyles();

    // Clean up any previous subscription
    cleanupAlerts();

    if (!container) {
        container = document.getElementById('homeContent') || document.getElementById('pageContent');
        if (!container) return;
    }

    container.innerHTML = `
        <div class="alerts-container" style="display:flex; flex-direction:column; height:100%; padding:20px 0;">
            <div class="al-header">
                <h2><i class="fas fa-bell"></i> Notifications</h2>
                <span class="al-count" id="alertsCount" style="display:none;">0</span>
            </div>
            <div id="alertsList" class="al-list"></div>
        </div>
    `;

    const list = document.getElementById('alertsList');
    const countBadge = document.getElementById('alertsCount');

    list.innerHTML = `
        <div class="al-center">
            <i class="fas fa-circle-notch al-spin"></i>
            <span>Loading notifications...</span>
        </div>
    `;

    const supabase = await getSupabaseClient();
    const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!user) {
        list.innerHTML = `
            <div class="al-center">
                <i class="fas fa-user-lock"></i>
                <span>Please log in to see notifications.</span>
            </div>
        `;
        return;
    }

    // ---- Load initial notifications ----
    await loadNotifications(list, countBadge, user, supabase);

    // ---- Set up real-time subscription ----
    await setupRealtimeSubscription(user, supabase, list, countBadge);
}

// ---- Load notifications (shared by initial load and real-time updates) ----
async function loadNotifications(list, countBadge, user, supabase) {
    try {
        // Fetch user's posts
        const { data: posts, error: postsError } = await supabase
            .from('posts')
            .select('id')
            .eq('user_id', user.id);
        if (postsError) throw postsError;

        const postIds = posts.map(p => p.id);
        if (!postIds.length) {
            list.innerHTML = emptyState();
            countBadge.style.display = 'none';
            return;
        }

        // ---- Fetch likes with reaction ----
        const { data: likes, error: likeErr } = await supabase
            .from('likes')
            .select('post_id, user_id, created_at, reaction')
            .in('post_id', postIds)
            .order('created_at', { ascending: false })
            .limit(50);
        if (likeErr) throw likeErr;

        // ---- Fetch comments ----
        const { data: comments, error: commentErr } = await supabase
            .from('comments')
            .select('post_id, user_id, content, created_at')
            .in('post_id', postIds)
            .order('created_at', { ascending: false })
            .limit(50);
        if (commentErr) throw commentErr;

        // ---- Collect all user IDs ----
        const userIds = new Set();
        for (const l of likes) userIds.add(l.user_id);
        for (const c of comments) userIds.add(c.user_id);

        // ---- Fetch profiles ----
        let profileMap = {};
        if (userIds.size) {
            const { data: profiles, error: profileErr } = await supabase
                .from('social_profiles')
                .select('user_id, display_name, avatar_url')
                .in('user_id', Array.from(userIds));
            if (!profileErr && profiles) {
                profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p]));
            }
        }

        // ---- Build notifications ----
        const notifications = [];
        for (const l of likes) {
            const profile = profileMap[l.user_id];
            notifications.push({
                type: 'like',
                user: profile?.display_name || 'Someone',
                avatar: profile?.avatar_url || '',
                postId: l.post_id,
                reaction: l.reaction || '❤️',
                time: l.created_at
            });
        }
        for (const c of comments) {
            const profile = profileMap[c.user_id];
            let decryptedContent = '';
            try {
                decryptedContent = await decryptAndDecompress(c.content);
            } catch (e) {
                decryptedContent = '[Unable to decrypt]';
            }
            notifications.push({
                type: 'comment',
                user: profile?.display_name || 'Someone',
                avatar: profile?.avatar_url || '',
                postId: c.post_id,
                content: decryptedContent,
                time: c.created_at
            });
        }
        notifications.sort((a, b) => new Date(b.time) - new Date(a.time));

        if (!notifications.length) {
            list.innerHTML = emptyState();
            countBadge.style.display = 'none';
            return;
        }

        countBadge.textContent = notifications.length;
        countBadge.style.display = 'inline-block';

        let html = '';
        for (const n of notifications) {
            const initial = (n.user[0] || 'U').toUpperCase();

            let actionText;
            let badgeContent;
            if (n.type === 'like') {
                const reactionEmoji = n.reaction || '❤️';
                actionText = `${reactionEmoji} reacted to your post`;
                badgeContent = `<span class="al-reaction-emoji">${reactionEmoji}</span>`;
            } else {
                actionText = 'commented on your post';
                badgeContent = `<i class="fas fa-comment"></i>`;
            }

            const badgeClass = n.type === 'like' ? 'al-badge like' : 'al-badge comment';

            html += `
                <div class="al-item" data-post-id="${n.postId}">
                    <div class="al-avatar-wrap">
                        <div class="al-avatar">
                            ${n.avatar ? `<img src="${n.avatar}" alt="">` : initial}
                        </div>
                        <div class="${badgeClass}">${badgeContent}</div>
                    </div>
                    <div class="al-body">
                        <div class="al-line"><strong>${escapeHtml(n.user)}</strong> ${actionText}</div>
                        <div class="al-time">${relativeTime(n.time)}</div>
                        ${n.content ? `<div class="al-quote">${escapeHtml(n.content)}</div>` : ''}
                    </div>
                </div>
            `;
        }
        list.innerHTML = html;

        // ---- Click a notification to open the related post ----
        list.querySelectorAll('.al-item').forEach(item => {
            item.addEventListener('click', async () => {
                const postId = item.dataset.postId;
                if (!postId) return;
                try {
                    const { openPostView } = await import('./postView.js');
                    openPostView(postId);
                } catch (err) {
                    console.warn('[alerts] Could not open post view:', err);
                }
            });
        });

    } catch (err) {
        list.innerHTML = `
            <div class="al-center al-error">
                <i class="fas fa-triangle-exclamation"></i>
                <span>Error loading notifications: ${escapeHtml(err.message)}</span>
            </div>
        `;
        countBadge.style.display = 'none';
    }
}

// ---- Setup real-time subscription ----
async function setupRealtimeSubscription(user, supabase, list, countBadge) {
    if (isSubscribed) return;
    isSubscribed = true;

    try {
        // Get the user's post IDs
        const { data: posts } = await supabase
            .from('posts')
            .select('id')
            .eq('user_id', user.id);
        const postIds = posts.map(p => p.id);
        if (!postIds.length) return;

        // Subscribe to likes on the user's posts
        subscription = supabase
            .channel('alerts-channel')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'likes',
                    filter: `post_id=in.(${postIds.join(',')})`
                },
                async () => {
                    // Refresh notifications on new like
                    await loadNotifications(list, countBadge, user, supabase);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'comments',
                    filter: `post_id=in.(${postIds.join(',')})`
                },
                async () => {
                    // Refresh notifications on new comment
                    await loadNotifications(list, countBadge, user, supabase);
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('[alerts] Real-time subscription active');
                }
            });
    } catch (err) {
        console.warn('[alerts] Realtime subscription error:', err);
        // Fallback: no real-time, but the initial load still works
    }
}

// ---- Cleanup function (exported) ----
export function cleanupAlerts() {
    if (subscription) {
        try {
            subscription.unsubscribe();
        } catch (e) {
            console.warn('[alerts] Unsubscribe error:', e);
        }
        subscription = null;
    }
    isSubscribed = false;
}

function emptyState() {
    return `
        <div class="al-center">
            <i class="fas fa-bell-slash"></i>
            <span>No notifications yet.</span>
        </div>
    `;
}

// ---- Twitter/Instagram-style relative time ----
function relativeTime(iso) {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}