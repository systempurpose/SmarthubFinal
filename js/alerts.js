// ============================================================
// alerts.js – Notifications (full height, centered empty state)
// ============================================================

import { getSupabaseClient } from './supabase.js';

export async function renderAlerts(container) {
    if (!container) {
        container = document.getElementById('homeContent') || document.getElementById('pageContent');
        if (!container) return;
    }

    container.innerHTML = `
        <div class="alerts-container" style="display:flex; flex-direction:column; height:100%; padding:20px 0;">
            <h2 style="flex-shrink:0;"><i class="fas fa-bell"></i> Notifications</h2>
            <div id="alertsList" style="flex:1; overflow-y:auto; display:flex; flex-direction:column; margin-top:12px;"></div>
        </div>
    `;

    const list = document.getElementById('alertsList');
    const supabase = await getSupabaseClient();
    const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!user) {
        list.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; height:100%; color:#999;">Please log in to see notifications.</div>';
        return;
    }

    try {
        const { data: posts, error: postsError } = await supabase
            .from('posts')
            .select('id')
            .eq('user_id', user.id);
        if (postsError) throw postsError;

        const postIds = posts.map(p => p.id);
        if (!postIds.length) {
            list.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; height:100%; color:#999;">No notifications yet.</div>';
            return;
        }

        const { data: likes, error: likeErr } = await supabase
            .from('likes')
            .select('post_id, user_id, created_at')
            .in('post_id', postIds)
            .order('created_at', { ascending: false })
            .limit(20);
        if (likeErr) throw likeErr;

        const { data: comments, error: commentErr } = await supabase
            .from('comments')
            .select('post_id, user_id, content, created_at')
            .in('post_id', postIds)
            .order('created_at', { ascending: false })
            .limit(20);
        if (commentErr) throw commentErr;

        const userIds = new Set();
        for (const l of likes) userIds.add(l.user_id);
        for (const c of comments) userIds.add(c.user_id);

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
            list.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; height:100%; color:#999;">No notifications yet.</div>';
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
        list.style.display = 'block'; // override flex if needed

    } catch (err) {
        list.innerHTML = `<p style="color:red;">Error loading notifications: ${err.message}</p>`;
        list.style.display = 'block';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}