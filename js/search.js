// ============================================================
// search.js – Search with live suggestions + history (full height)
// History uses sessionStorage – clears when browser/window is closed.
// ============================================================

import { getSupabaseClient } from './supabase.js';
import { decryptAndDecompress } from './home-sb.js';
import { renderUserProfileView } from './userProfileView.js';

const HISTORY_KEY = 'searchHistory_session';
const MAX_HISTORY = 10;

// ---- Inject styles once ----
function ensureStyles() {
    if (document.getElementById('se-styles')) return;
    const style = document.createElement('style');
    style.id = 'se-styles';
    style.textContent = `
        .se-header { display: flex; align-items: center; gap: 8px; flex-shrink: 0; margin: 0; }
        .se-header i { color: #0d9488; }

        .se-bar { position: relative; flex-shrink: 0; margin: 14px 0 16px; }
        .se-bar-icon {
            position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
            color: #94a3b8; font-size: 15px; pointer-events: none;
        }
        .se-input {
            width: 100%; padding: 12px 40px 12px 40px; border-radius: 12px; border: 1px solid #e2e8f0;
            font-size: 15px; outline: none; box-sizing: border-box;
            transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .se-input:focus { border-color: #0d9488; box-shadow: 0 0 0 3px #ccfbf1; }
        .se-clear-btn {
            position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
            background: #f1f5f9; border: none; color: #64748b; width: 24px; height: 24px;
            border-radius: 50%; cursor: pointer; display: none; align-items: center; justify-content: center;
            font-size: 11px; transition: background 0.15s ease;
        }
        .se-clear-btn:hover { background: #e2e8f0; }

        .se-dropdown {
            position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #e2e8f0;
            border-top: none; border-radius: 0 0 14px 14px; max-height: 340px; overflow-y: auto;
            z-index: 100; display: none; box-shadow: 0 10px 24px rgba(15,23,42,0.12);
        }

        .se-section-label {
            padding: 8px 14px; font-weight: 700; font-size: 12px; letter-spacing: 0.03em;
            text-transform: uppercase; color: #94a3b8; border-bottom: 1px solid #f1f5f9;
        }

        .se-row {
            padding: 9px 14px; display: flex; align-items: center; gap: 10px; cursor: pointer;
            transition: background 0.15s ease;
        }
        .se-row:hover { background: #f8fafc; }

        .se-avatar {
            width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; overflow: hidden;
            display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 12.5px;
            background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%);
        }
        .se-avatar img { width: 100%; height: 100%; object-fit: cover; }

        .se-row-name { font-weight: 600; font-size: 14px; color: #1e293b; }
        .se-row-sub { font-size: 12.5px; color: #64748b; }
        .se-row-snippet {
            font-size: 13.5px; color: #334155; white-space: nowrap; overflow: hidden;
            text-overflow: ellipsis; flex: 1;
        }
        .se-row-icon { color: #94a3b8; font-size: 13px; flex-shrink: 0; width: 16px; text-align: center; }
        mark.se-hl { background: #ccfbf1; color: #0f766e; border-radius: 3px; padding: 0 1px; }

        .se-history-item {
            padding: 9px 14px; cursor: pointer; display: flex; align-items: center; justify-content: space-between;
            gap: 8px; transition: background 0.15s ease; border-radius: 8px;
        }
        .se-history-item:hover { background: #f8fafc; }
        .se-history-left { display: flex; align-items: center; gap: 10px; min-width: 0; color: #334155; font-size: 14px; }
        .se-history-left i { color: #94a3b8; font-size: 13px; }
        .se-history-remove {
            color: #cbd5e1; font-size: 12px; cursor: pointer; padding: 4px; border-radius: 50%;
            transition: color 0.15s ease, background 0.15s ease; flex-shrink: 0;
        }
        .se-history-remove:hover { color: #dc2626; background: #fce8ee; }
        .se-history-head {
            display: flex; align-items: center; justify-content: space-between;
            padding: 4px 4px 8px; font-weight: 700; color: #64748b; font-size: 12.5px;
            text-transform: uppercase; letter-spacing: 0.03em;
        }
        .se-clear-all {
            background: none; border: none; color: #dc2626; cursor: pointer; font-weight: 600; font-size: 12.5px;
        }

        .se-results-section-label {
            padding: 6px 4px; font-weight: 700; font-size: 12.5px; color: #64748b;
            text-transform: uppercase; letter-spacing: 0.03em; margin-top: 4px;
            display: flex; align-items: center; gap: 6px;
        }
        .se-results-section-label i { color: #0d9488; }

        .se-user-card {
            padding: 10px 4px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center;
            gap: 12px; cursor: pointer; border-radius: 10px; transition: background 0.15s ease;
        }
        .se-user-card:hover { background: #f8fafc; }
        .se-user-avatar {
            width: 38px; height: 38px; border-radius: 50%; overflow: hidden; flex-shrink: 0;
            display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700;
            background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%);
        }
        .se-user-avatar img { width: 100%; height: 100%; object-fit: cover; }

        .se-post-card {
            padding: 12px 4px; border-bottom: 1px solid #f1f5f9; cursor: pointer;
            border-radius: 10px; transition: background 0.15s ease;
        }
        .se-post-card:hover { background: #f8fafc; }
        .se-post-meta { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; font-size: 12.5px; color: #64748b; }
        .se-post-text { margin: 0; font-size: 14.5px; color: #1e293b; line-height: 1.5; }

        .se-center {
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            height: 100%; color: #94a3b8; gap: 10px; text-align: center; padding: 20px;
        }
        .se-center i { font-size: 28px; color: #cbd5e1; }
        .se-center.se-error { color: #dc2626; }
        .se-center.se-error i { color: #f87171; }
        .se-spin { animation: se-spin 0.8s linear infinite; }
        @keyframes se-spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
}

// ---- Search history (sessionStorage) ----
function getSearchHistory() {
    try {
        const stored = sessionStorage.getItem(HISTORY_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch { return []; }
}

function addSearchHistory(query) {
    if (!query || query.length < 2) return;
    let history = getSearchHistory();
    history = history.filter(item => item !== query);
    history.unshift(query);
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function clearSearchHistory() {
    sessionStorage.removeItem(HISTORY_KEY);
}

function renderHistoryInResults(resultsEl, onSelect) {
    const history = getSearchHistory();
    if (!history.length) {
        resultsEl.innerHTML = `
            <div class="se-center">
                <i class="fas fa-clock-rotate-left"></i>
                <span>No recent searches</span>
            </div>
        `;
        return;
    }
    let html = `
        <div class="se-history-head">
            <span>Recent</span>
            <button id="clearHistoryBtn" class="se-clear-all">Clear all</button>
        </div>
    `;
    for (const q of history) {
        html += `
            <div class="se-history-item" data-query="${escapeHtml(q)}">
                <div class="se-history-left"><i class="fas fa-clock-rotate-left"></i><span>${escapeHtml(q)}</span></div>
                <span class="se-history-remove" data-query="${escapeHtml(q)}"><i class="fas fa-xmark"></i></span>
            </div>
        `;
    }
    resultsEl.innerHTML = html;

    resultsEl.querySelectorAll('.se-history-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.se-history-remove')) return;
            const query = el.dataset.query;
            onSelect(query);
        });
    });
    resultsEl.querySelectorAll('.se-history-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const query = btn.dataset.query;
            let history = getSearchHistory().filter(item => item !== query);
            sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
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

// ---- Navigate to user profile (read-only or own editable) ----
function navigateToUser(userId, query) {
    // Save the search query to history
    if (query && query.length >= 2) {
        addSearchHistory(query);
    }

    const currentUser = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!currentUser) {
        if (typeof window.navigateHomePage === 'function') {
            window.navigateHomePage('profile');
        }
        return;
    }
    // Compare as strings to avoid type mismatch (UUID vs string)
    if (String(userId) === String(currentUser.id)) {
        // My own profile – go to the editable profile page
        if (typeof window.navigateHomePage === 'function') {
            window.navigateHomePage('profile');
        }
    } else {
        // Another user – go to read-only profile view
        if (typeof window.navigateHomePage === 'function') {
            window.navigateHomePage('user-profile', { userId: String(userId) });
        } else {
            // Fallback: directly import and render the profile view
            const container = document.getElementById('homeContent') || document.getElementById('pageContent');
            if (container) {
                renderUserProfileView(container, String(userId));
            }
        }
    }
}

// ---- Main render ----
export async function renderSearch(container) {
    ensureStyles();

    if (!container) {
        container = document.getElementById('homeContent') || document.getElementById('pageContent');
        if (!container) return;
    }

    container.innerHTML = `
        <div class="search-container" style="display:flex; flex-direction:column; height:100%; padding:20px 0;">
            <h2 class="se-header"><i class="fas fa-magnifying-glass"></i> Search</h2>
            <div class="se-bar">
                <i class="fas fa-magnifying-glass se-bar-icon"></i>
                <input type="text" id="searchInput" class="se-input" placeholder="Search posts or users...">
                <button id="searchClearBtn" class="se-clear-btn" title="Clear"><i class="fas fa-xmark"></i></button>
                <div id="searchSuggestions" class="se-dropdown"></div>
            </div>
            <div id="searchResults" style="flex:1; overflow-y:auto;"></div>
        </div>
    `;

    const input = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    const suggestions = document.getElementById('searchSuggestions');
    const results = document.getElementById('searchResults');

    function updateClearBtn() {
        clearBtn.style.display = input.value.length ? 'flex' : 'none';
    }

    function showHistory() {
        renderHistoryInResults(results, (query) => {
            input.value = query;
            updateClearBtn();
            suggestions.style.display = 'none';
            performSearch(query, results);
        });
    }

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

    clearBtn.addEventListener('click', () => {
        input.value = '';
        updateClearBtn();
        suggestions.style.display = 'none';
        showHistory();
        input.focus();
    });

    let debounceTimer;
    input.addEventListener('input', () => {
        updateClearBtn();
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

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = input.value.trim();
            if (query.length >= 2) {
                suggestions.style.display = 'none';
                addSearchHistory(query);
                performSearch(query, results);
            }
        } else if (e.key === 'Escape') {
            suggestions.style.display = 'none';
            input.blur();
        }
    });
}

// ---- Fetch suggestions ----
async function fetchSuggestions(query, suggestionsEl, input, resultsEl) {
    if (!query || query.length < 2) {
        suggestionsEl.style.display = 'none';
        return;
    }
    suggestionsEl.innerHTML = `<div class="se-center" style="height:auto;padding:16px;"><i class="fas fa-circle-notch se-spin" style="font-size:16px;"></i></div>`;
    suggestionsEl.style.display = 'block';

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
            html += `<div class="se-section-label">Users</div>`;
            for (const u of users) {
                const name = u.display_name || u.username || 'User';
                html += `
                    <div class="se-row" data-type="user" data-user-id="${u.user_id}" data-name="${escapeHtml(name)}">
                        <div class="se-avatar">
                            ${u.avatar_url ? `<img src="${u.avatar_url}" alt="">` : (name[0] || 'U').toUpperCase()}
                        </div>
                        <div style="min-width:0;">
                            <div class="se-row-name">${highlightMatch(name, query)}</div>
                            <div class="se-row-sub">@${escapeHtml(u.username || 'user')}</div>
                        </div>
                    </div>
                `;
            }
        }
        if (matchedPosts.length) {
            html += `<div class="se-section-label">Posts</div>`;
            for (const p of matchedPosts) {
                const snippet = p.decryptedContent.substring(0, 60) + (p.decryptedContent.length > 60 ? '…' : '');
                html += `
                    <div class="se-row" data-type="post" data-post-id="${p.id}">
                        <i class="fas fa-file-lines se-row-icon"></i>
                        <div class="se-row-snippet">${highlightMatch(snippet, query)}</div>
                    </div>
                `;
            }
        }
        if (!html) {
            html = `<div class="se-center" style="height:auto;padding:20px;"><i class="fas fa-ghost"></i><span>No suggestions found</span></div>`;
        }
        suggestionsEl.innerHTML = html;
        suggestionsEl.style.display = 'block';

        suggestionsEl.querySelectorAll('.se-row[data-type="user"]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const userId = item.dataset.userId;
                const query = input.value.trim();
                suggestionsEl.style.display = 'none';
                navigateToUser(userId, query);
            });
        });
        suggestionsEl.querySelectorAll('.se-row[data-type="post"]').forEach(item => {
            item.addEventListener('click', async (e) => {
                e.stopPropagation();
                suggestionsEl.style.display = 'none';
                try {
                    const { openPostView } = await import('./postView.js');
                    openPostView(item.dataset.postId);
                } catch (err) {
                    console.warn('[search] Could not open post view:', err);
                }
            });
        });
    } catch (err) {
        console.warn('[search] Suggestion error:', err);
        suggestionsEl.innerHTML = `<div class="se-center" style="height:auto;padding:16px;color:#dc2626;"><i class="fas fa-triangle-exclamation" style="font-size:16px;"></i><span>Error loading suggestions</span></div>`;
        suggestionsEl.style.display = 'block';
    }
}

// ---- Full search ----
async function performSearch(query, resultsEl) {
    resultsEl.innerHTML = `<div class="se-center"><i class="fas fa-circle-notch se-spin"></i><span>Searching...</span></div>`;
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

        const decryptedAll = await Promise.all(posts.map(async (p) => {
            const decrypted = await decryptAndDecompress(p.content);
            return { ...p, decryptedContent: decrypted };
        }));
        const decryptedPosts = decryptedAll.filter(p =>
            p.decryptedContent.toLowerCase().includes(query.toLowerCase())
        );

        let html = '';
        if (users.length) {
            html += `<div class="se-results-section-label"><i class="fas fa-user"></i> Users</div>`;
            for (const u of users) {
                const name = u.display_name || u.username || 'User';
                html += `
                    <div class="se-user-card" data-user-id="${u.user_id}">
                        <div class="se-user-avatar">
                            ${u.avatar_url ? `<img src="${u.avatar_url}" alt="">` : (name[0] || 'U').toUpperCase()}
                        </div>
                        <div>
                            <div style="font-weight:700;font-size:14.5px;color:#1e293b;">${highlightMatch(name, query)}</div>
                            <div style="color:#64748b;font-size:13px;">@${escapeHtml(u.username || 'user')}</div>
                        </div>
                    </div>
                `;
            }
        }
        if (decryptedPosts.length) {
            html += `<div class="se-results-section-label"><i class="fas fa-file-lines"></i> Posts</div>`;
            for (const p of decryptedPosts) {
                html += `
                    <div class="se-post-card" data-post-id="${p.id}">
                        <div class="se-post-meta">
                            <i class="fas fa-clock" style="font-size:11px;"></i>
                            <span>${new Date(p.created_at).toLocaleDateString()}</span>
                        </div>
                        <p class="se-post-text">${highlightMatch(p.decryptedContent, query)}</p>
                    </div>
                `;
            }
        }
        if (!html) {
            resultsEl.innerHTML = `
                <div class="se-center">
                    <i class="fas fa-ghost"></i>
                    <span>No results found for "${escapeHtml(query)}"</span>
                </div>
            `;
            return;
        }
        resultsEl.innerHTML = html;

        resultsEl.querySelectorAll('.se-user-card').forEach(card => {
            card.addEventListener('click', () => {
                const userId = card.dataset.userId;
                navigateToUser(userId, query);
            });
        });
        resultsEl.querySelectorAll('.se-post-card').forEach(card => {
            card.addEventListener('click', async () => {
                try {
                    const { openPostView } = await import('./postView.js');
                    openPostView(card.dataset.postId);
                } catch (err) {
                    console.warn('[search] Could not open post view:', err);
                }
            });
        });
    } catch (err) {
        resultsEl.innerHTML = `
            <div class="se-center se-error">
                <i class="fas fa-triangle-exclamation"></i>
                <span>Error: ${escapeHtml(err.message)}</span>
            </div>
        `;
    }
}

// ---- Highlight match ----
function highlightMatch(text, query) {
    if (!text) return '';
    const safeText = text;
    const idx = safeText.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return escapeHtml(safeText);
    const before = escapeHtml(safeText.slice(0, idx));
    const match = escapeHtml(safeText.slice(idx, idx + query.length));
    const after = escapeHtml(safeText.slice(idx + query.length));
    return `${before}<mark class="se-hl">${match}</mark>${after}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}