// ============================================================
// search.js – Search with live suggestions + history (full height)
// ============================================================

import { getSupabaseClient } from './supabase.js';
import { decryptAndDecompress } from './home-sb.js';

const HISTORY_KEY = 'searchHistory';
const MAX_HISTORY = 10;

function getSearchHistory() {
    try {
        const stored = localStorage.getItem(HISTORY_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch { return []; }
}

function addSearchHistory(query) {
    if (!query || query.length < 2) return;
    let history = getSearchHistory();
    history = history.filter(item => item !== query);
    history.unshift(query);
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function clearSearchHistory() {
    localStorage.removeItem(HISTORY_KEY);
}

function renderHistoryInResults(resultsEl, onSelect) {
    const history = getSearchHistory();
    if (!history.length) {
        resultsEl.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:center; height:100%; color:#999; font-size:16px;">
                No recent searches
            </div>
        `;
        return;
    }
    let html = `<div style="padding:8px 0; font-weight:600; color:#64748b; border-bottom:1px solid #f0f0f0;">Recent</div>`;
    for (const q of history) {
        html += `
            <div class="history-item" data-query="${escapeHtml(q)}" 
                 style="padding:10px 0; cursor:pointer; border-bottom:1px solid #f5f5f5; display:flex; justify-content:space-between; transition:background 0.15s;"
                 onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                <span>${escapeHtml(q)}</span>
                <span class="remove-history" data-query="${escapeHtml(q)}" style="color:#dc2626; font-size:13px; cursor:pointer;">✕</span>
            </div>
        `;
    }
    html += `
        <div style="padding:8px 0; text-align:right; font-size:13px;">
            <button id="clearHistoryBtn" style="background:none; border:none; color:#dc2626; cursor:pointer; font-weight:500;">Clear all</button>
        </div>
    `;
    resultsEl.innerHTML = html;

    resultsEl.querySelectorAll('.history-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-history')) return;
            const query = el.dataset.query;
            onSelect(query);
        });
    });
    resultsEl.querySelectorAll('.remove-history').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const query = btn.dataset.query;
            let history = getSearchHistory().filter(item => item !== query);
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
            renderHistoryInResults(resultsEl, onSelect);
        });
    });
    const clearBtn = resultsEl.querySelector('#clearHistoryBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            clearSearchHistory();
            renderHistoryInResults(resultsEl, onSelect);
        });
    }
}

export async function renderSearch(container) {
    if (!container) {
        container = document.getElementById('homeContent') || document.getElementById('pageContent');
        if (!container) return;
    }

    container.innerHTML = `
        <div class="search-container" style="display:flex; flex-direction:column; height:100%; padding:20px 0;">
            <h2 style="flex-shrink:0;">🔍 Search</h2>
            <div style="position:relative; flex-shrink:0; margin:12px 0 16px;">
                <input type="text" id="searchInput" placeholder="Search posts or users..." 
                       style="width:100%; padding:12px 16px; border-radius:12px; border:1px solid #e2e8f0; font-size:16px;">
                <div id="searchSuggestions" style="position:absolute; top:100%; left:0; right:0; background:white; border:1px solid #e2e8f0; border-top:none; border-radius:0 0 12px 12px; max-height:300px; overflow-y:auto; z-index:100; display:none; box-shadow:0 4px 12px rgba(0,0,0,0.1);"></div>
            </div>
            <div id="searchResults" style="flex:1; overflow-y:auto;"></div>
        </div>
    `;

    const input = document.getElementById('searchInput');
    const suggestions = document.getElementById('searchSuggestions');
    const results = document.getElementById('searchResults');

    // ---- Show history when input is empty and focused ----
    function showHistory() {
        renderHistoryInResults(results, (query) => {
            input.value = query;
            suggestions.style.display = 'none';
            performSearch(query, results);
        });
    }

    // Initial: show history
    showHistory();

    input.addEventListener('focus', () => {
        const query = input.value.trim();
        if (query.length === 0) {
            showHistory();
        } else if (query.length >= 2) {
            fetchSuggestions(query, suggestions, input, results);
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(() => { suggestions.style.display = 'none'; }, 200);
    });

    let debounceTimer;
    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const query = input.value.trim();
        if (query.length < 2) {
            suggestions.style.display = 'none';
            if (query.length === 0) {
                showHistory();
            } else {
                results.innerHTML = '';
            }
            return;
        }
        debounceTimer = setTimeout(() => {
            fetchSuggestions(query, suggestions, input, results);
        }, 200);
    });
}

// ---- Fetch suggestions ----
async function fetchSuggestions(query, suggestionsEl, input, resultsEl) {
    if (!query || query.length < 2) {
        suggestionsEl.style.display = 'none';
        return;
    }
    try {
        const supabase = await getSupabaseClient();

        const { data: users, error: userErr } = await supabase
            .from('social_profiles')
            .select('display_name, username, avatar_url, user_id')
            .ilike('display_name', `%${query}%`)
            .limit(5);
        if (userErr) throw userErr;

        const { data: posts, error: postErr } = await supabase
            .from('posts')
            .select('id, content, user_id, created_at')
            .order('created_at', { ascending: false })
            .limit(10);
        if (postErr) throw postErr;

        const decryptedPosts = [];
        for (const p of posts) {
            try {
                const decrypted = await decryptAndDecompress(p.content);
                if (decrypted.toLowerCase().includes(query.toLowerCase())) {
                    decryptedPosts.push({ ...p, decryptedContent: decrypted });
                }
            } catch (e) {}
        }
        const matchedPosts = decryptedPosts.slice(0, 5);

        let html = '';
        if (users.length) {
            html += `<div style="padding:8px 12px; font-weight:600; color:#64748b; border-bottom:1px solid #f0f0f0;">Users</div>`;
            for (const u of users) {
                html += `
                    <div class="suggestion-item" data-type="user" data-user-id="${u.user_id}" 
                         style="padding:8px 12px; display:flex; align-items:center; gap:10px; cursor:pointer; border-bottom:1px solid #f5f5f5; transition:background 0.15s;"
                         onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                        <div class="post-avatar" style="width:28px;height:28px;border-radius:50%;background:#c4c9d4;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:12px;">
                            ${u.avatar_url ? `<img src="${u.avatar_url}" style="width:100%;height:100%;border-radius:50%;">` : (u.display_name?.[0] || 'U').toUpperCase()}
                        </div>
                        <div>
                            <div style="font-weight:500;font-size:14px;">${escapeHtml(u.display_name || u.username)}</div>
                            <div style="font-size:12px;color:#64748b;">@${escapeHtml(u.username || 'user')}</div>
                        </div>
                    </div>
                `;
            }
        }
        if (matchedPosts.length) {
            if (users.length) {
                html += `<div style="padding:8px 12px; font-weight:600; color:#64748b; border-bottom:1px solid #f0f0f0;">Posts</div>`;
            }
            for (const p of matchedPosts) {
                html += `
                    <div class="suggestion-item" data-type="post" data-post-id="${p.id}" 
                         style="padding:8px 12px; cursor:pointer; border-bottom:1px solid #f5f5f5; transition:background 0.15s;"
                         onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                        <div style="font-size:13px; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(p.decryptedContent.substring(0, 60))}${p.decryptedContent.length > 60 ? '…' : ''}</div>
                    </div>
                `;
            }
        }
        if (!html) {
            html = `<div style="padding:12px; color:#999;">No suggestions found</div>`;
        }
        suggestionsEl.innerHTML = html;
        suggestionsEl.style.display = 'block';

        suggestionsEl.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const type = item.dataset.type;
                const query = input.value.trim();
                if (type === 'user') {
                    const name = item.querySelector('div > div:first-child')?.textContent || query;
                    input.value = name;
                    suggestionsEl.style.display = 'none';
                    addSearchHistory(query);
                    performSearch(query, resultsEl);
                } else if (type === 'post') {
                    suggestionsEl.style.display = 'none';
                    addSearchHistory(query);
                    performSearch(query, resultsEl);
                }
            });
        });
    } catch (err) {
        console.warn('[search] Suggestion error:', err);
        suggestionsEl.innerHTML = `<div style="padding:12px; color:red;">Error loading suggestions</div>`;
        suggestionsEl.style.display = 'block';
    }
}

// ---- Full search ----
async function performSearch(query, resultsEl) {
    resultsEl.innerHTML = '<div class="spinner"></div>';
    addSearchHistory(query);
    const supabase = await getSupabaseClient();
    try {
        const { data: posts, error: postErr } = await supabase
            .from('posts')
            .select('id, content, user_id, created_at')
            .order('created_at', { ascending: false })
            .limit(20);
        if (postErr) throw postErr;

        const { data: users, error: userErr } = await supabase
            .from('social_profiles')
            .select('display_name, username, avatar_url, user_id')
            .ilike('display_name', `%${query}%`)
            .limit(10);
        if (userErr) throw userErr;

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
                            <strong>${escapeHtml(u.display_name || u.username)}</strong>
                            <div style="color:#64748b;font-size:13px;">@${escapeHtml(u.username || 'user')}</div>
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
        resultsEl.innerHTML = html;
    } catch (err) {
        resultsEl.innerHTML = `<p style="color:red;">Error: ${err.message}</p>`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}