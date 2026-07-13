// ============================================================
// search.js – Search posts and users (renders into container)
// ============================================================

import { getSupabaseClient } from './supabase.js';
import { decryptAndDecompress } from './home-sb.js';

export async function renderSearch(container) {
    // If no container provided, fallback to pageContent
    if (!container) {
        container = document.getElementById('pageContent');
        if (!container) {
            console.warn('[search] container not found');
            return;
        }
    }

    container.innerHTML = `
        <div class="search-container" style="padding:20px 0;">
            <h2>🔍 Search</h2>
            <input type="text" id="searchInput" placeholder="Search posts or users..." style="width:100%;padding:12px 16px;border-radius:12px;border:1px solid #e2e8f0;font-size:16px;margin-bottom:16px;">
            <div id="searchResults"></div>
        </div>
    `;

    const input = document.getElementById('searchInput');
    const results = document.getElementById('searchResults');

    let debounceTimer;
    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const query = input.value.trim();
        if (query.length < 2) {
            results.innerHTML = '';
            return;
        }
        debounceTimer = setTimeout(() => performSearch(query, results), 300);
    });
}

async function performSearch(query, results) {
    results.innerHTML = '<div class="spinner"></div>';
    const supabase = await getSupabaseClient();
    try {
        // Search posts
        const { data: posts, error: postErr } = await supabase
            .from('posts')
            .select('id, content, user_id, created_at')
            .order('created_at', { ascending: false })
            .limit(20);
        if (postErr) throw postErr;

        // Search users
        const { data: users, error: userErr } = await supabase
            .from('social_profiles')
            .select('display_name, username, avatar_url, user_id')
            .ilike('display_name', `%${query}%`)
            .limit(10);
        if (userErr) throw userErr;

        // Decrypt post content
        const decryptedPosts = await Promise.all(posts.map(async (p) => {
            const decrypted = await decryptAndDecompress(p.content);
            return { ...p, decryptedContent: decrypted };
        }));

        let html = '';
        if (users.length) {
            html += `<h3>Users</h3>`;
            for (const u of users) {
                html += `
                    <div class="user-result" style="padding:8px 0;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:12px;cursor:pointer;" onclick="window.navigateTo('profile');">
                        <div class="post-avatar" style="width:36px;height:36px;border-radius:50%;background:#c4c9d4;display:flex;align-items:center;justify-content:center;color:#fff;">
                            ${u.avatar_url ? `<img src="${u.avatar_url}" style="width:100%;height:100%;border-radius:50%;">` : (u.display_name?.[0] || 'U').toUpperCase()}
                        </div>
                        <div>
                            <strong>${u.display_name || u.username}</strong>
                            <div style="color:#64748b;font-size:13px;">@${u.username || 'user'}</div>
                        </div>
                    </div>
                `;
            }
        }
        if (decryptedPosts.length) {
            html += `<h3>Posts</h3>`;
            for (const p of decryptedPosts) {
                html += `
                    <div class="post-result" style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
                        <div style="display:flex;gap:10px;align-items:center;margin-bottom:4px;">
                            <span style="font-weight:600;">User</span>
                            <span style="color:#64748b;font-size:13px;">${new Date(p.created_at).toLocaleDateString()}</span>
                        </div>
                        <p style="margin:0;">${escapeHtml(p.decryptedContent)}</p>
                    </div>
                `;
            }
        }
        if (!html) html = '<p style="color:#64748b;">No results found.</p>';
        results.innerHTML = html;

    } catch (err) {
        results.innerHTML = `<p style="color:red;">Error: ${err.message}</p>`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}