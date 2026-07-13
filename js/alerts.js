// ============================================================
// alerts.js – Notifications (with manual profile fetch)
// ============================================================

import { getSupabaseClient } from './supabase.js';

export async function renderAlerts(container) {
    if (!container) {
        container = document.getElementById('pageContent');
        if (!container) {
            console.warn('[alerts] container not found');
            return;
        }
    }

    container.innerHTML = `
        <div class="alerts-container" style="padding:20px 0; min-height: calc(100vh - 200px);">
            <h2><i class="fas fa-bell"></i> Notifications</h2>
            <div id="alertsList"></div>
        </div>
    `;

    const list = document.getElementById('alertsList');
    const supabase = await getSupabaseClient();
    const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!user) {
        list.innerHTML = '<p>Please log in to see notifications.</p>';
        return;
    }

    try {
        // Get user's posts
        const { data: posts, error: postsError } = await supabase
            .from('posts')
            .select('id')
            .eq('user_id', user.id);
        if (postsError) throw postsError;

        const postIds = posts.map(p => p.id);
        if (!postIds.length) {
            list.innerHTML = '<p style="color:#64748b;">No notifications yet.</p>';
            return;
        }

        // Fetch likes (without join)
        const { data: likes, error: likeErr } = await supabase
            .from('likes')
            .select('post_id, user_id, created_at')
            .in('post_id', postIds)
            .order('created_at', { ascending: false })
            .limit(20);
        if (likeErr) throw likeErr;

        // Fetch comments (without join)
        const { data: comments, error: commentErr } = await supabase
            .from('comments')
            .select('post_id, user_id, content, created_at')
            .in('post_id', postIds)
            .order('created_at', { ascending: false })
            .limit(20);
        if (commentErr) throw commentErr;

        // Collect all user_ids from likes and comments
        const userIds = new Set();
        for (const l of likes) userIds.add(l.user_id);
        for (const c of comments) userIds.add(c.user_id);

        // Fetch profiles for those user_ids
        let profileMap = {};
        if (userIds.size) {
            const { data: profiles, error: profileErr } = await supabase
                .from('social_profiles')
                .select('user_id, display_name')
                .in('user_id', Array.from(userIds));
            if (!profileErr && profiles) {
                profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p]));
            }
        }

        // Build notifications
        const notifications = [];
        for (const l of likes) {
            const displayName = profileMap[l.user_id]?.display_name || 'Someone';
            notifications.push({
                type: 'like',
                user: displayName,
                postId: l.post_id,
                time: l.created_at
            });
        }
        for (const c of comments) {
            const displayName = profileMap[c.user_id]?.display_name || 'Someone';
            notifications.push({
                type: 'comment',
                user: displayName,
                postId: c.post_id,
                content: c.content,
                time: c.created_at
            });
        }
        notifications.sort((a, b) => new Date(b.time) - new Date(a.time));

        if (!notifications.length) {
            list.innerHTML = '<p style="color:#64748b;">No notifications yet.</p>';
            return;
        }

        let html = '';
        for (const n of notifications) {
            const time = new Date(n.time).toLocaleDateString() + ' ' + new Date(n.time).toLocaleTimeString();
            html += `
                <div style="padding:12px 0;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:12px;">
                    <div style="font-size:20px;">${n.type === 'like' ? '❤️' : '💬'}</div>
                    <div>
                        <strong>${escapeHtml(n.user)}</strong> ${n.type === 'like' ? 'liked your post' : 'commented on your post'}
                        <div style="font-size:13px;color:#64748b;">${time}</div>
                        ${n.content ? `<div style="margin-top:4px;color:#1e293b;background:#f8fafc;padding:4px 8px;border-radius:6px;">${escapeHtml(n.content)}</div>` : ''}
                    </div>
                </div>
            `;
        }
        list.innerHTML = html;

    } catch (err) {
        list.innerHTML = `<p style="color:red;">Error loading notifications: ${err.message}</p>`;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}