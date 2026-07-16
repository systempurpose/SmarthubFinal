// ============================================================
// search.js – Search with live suggestions + history (full height)
// History uses sessionStorage – clears when browser/window is closed.
// User + post rows now render Facebook-style via searchCards.js.
// ============================================================

import { getSupabaseClient } from './supabase.js';
import { decryptAndDecompress, fetchSavedPostIds } from './home-sb.js';
import { renderUserProfileView } from './userProfileView.js';
import { openReactionModal } from './reactionModal.js';
import {
    ensureFBStyles,
    renderUserRow,
    renderPostRow,
    renderFullPostCard,
    attachUserRowHandlers,
    attachPostRowHandlers,
    attachFullPostCardHandlers,
    escapeHtml
} from './searchCards.js';

const HISTORY_KEY = 'searchHistory_session';
const MAX_HISTORY = 10;

// How many posts to pull down and scan client-side per search.
// Post content is encrypted, so we can't filter with SQL `ilike` on it —
// we have to fetch, decrypt, then match. Raise this if you have more
// posts than that and want full-history search coverage.
const POST_SCAN_LIMIT = 500;

// ---- Inject styles once ----
function ensureStyles() {
    ensureFBStyles();
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

// ---- Current user helper ----
function getCurrentUser() {
    try {
        return JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    } catch {
        return null;
    }
}

// ---- Follow status + toggle ----
// Assumes a `follows` table: follower_id (who clicks Follow), following_id (who gets followed).
// Adjust the table/column names below if yours differ.
async function getFollowingSet(supabase, currentUserId, candidateIds) {
    if (!currentUserId || !candidateIds.length) return new Set();
    try {
        const { data, error } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', currentUserId)
            .in('following_id', candidateIds);
        if (error) throw error;
        return new Set((data || []).map(r => r.following_id));
    } catch (err) {
        console.warn('[search] Could not load follow status:', err);
        return new Set();
    }
}

async function toggleFollow(supabase, currentUserId, targetUserId, wasFollowing) {
    if (!currentUserId) throw new Error('Not logged in');
    if (wasFollowing) {
        const { error } = await supabase
            .from('follows')
            .delete()
            .eq('follower_id', currentUserId)
            .eq('following_id', targetUserId);
        if (error) throw error;
        return false;
    } else {
        const { error } = await supabase
            .from('follows')
            .insert({ follower_id: currentUserId, following_id: targetUserId });
        if (error) throw error;
        return true;
    }
}

// ---- Bulk-fetch like counts / current user's reaction / grouped summary ----
// Mirrors the same query profile.js runs for its own feed, so search results
// show identical reaction data.
async function fetchLikeData(supabase, postIds, currentUserId) {
    const likesMap = {}, userReactionsMap = {}, summaryMap = {};
    if (!postIds.length) return { likesMap, userReactionsMap, summaryMap };
    try {
        const { data: likes, error } = await supabase
            .from('likes')
            .select('post_id, reaction, user_id')
            .in('post_id', postIds);
        if (error) throw error;
        (likes || []).forEach(l => {
            likesMap[l.post_id] = (likesMap[l.post_id] || 0) + 1;
            if (currentUserId && l.user_id === currentUserId) {
                userReactionsMap[l.post_id] = l.reaction || '❤️';
            }
            if (!summaryMap[l.post_id]) summaryMap[l.post_id] = {};
            const r = l.reaction || '❤️';
            summaryMap[l.post_id][r] = (summaryMap[l.post_id][r] || 0) + 1;
        });
    } catch (err) {
        console.warn('[search] Could not load like data:', err);
    }
    return { likesMap, userReactionsMap, summaryMap };
}

// ---- Fetch author profiles for a set of post user_ids (for FB-style post rows) ----
async function fetchAuthors(supabase, userIds) {
    const map = new Map();
    const uniqueIds = [...new Set(userIds)];
    if (!uniqueIds.length) return map;
    try {
        const { data, error } = await supabase
            .from('social_profiles')
            .select('user_id, display_name, username, avatar_url')
            .in('user_id', uniqueIds);
        if (error) throw error;
        (data || []).forEach(p => map.set(p.user_id, p));
    } catch (err) {
        console.warn('[search] Could not load post authors:', err);
    }
    return map;
}

// ---- Navigate to user profile (read-only or own editable) ----
function navigateToUser(userId, query) {
    if (query && query.length >= 2) {
        addSearchHistory(query);
    }

    const currentUser = getCurrentUser();
    if (!currentUser) {
        if (typeof window.navigateHomePage === 'function') {
            window.navigateHomePage('profile');
        }
        return;
    }
    if (String(userId) === String(currentUser.id)) {
        if (typeof window.navigateHomePage === 'function') {
            window.navigateHomePage('profile');
        }
    } else {
        if (typeof window.navigateHomePage === 'function') {
            window.navigateHomePage('user-profile', { userId: String(userId) });
        } else {
            const container = document.getElementById('homeContent') || document.getElementById('pageContent');
            if (container) {
                renderUserProfileView(container, String(userId));
            }
        }
    }
}

async function openPost(postId) {
    try {
        const { openPostView } = await import('./postView.js');
        openPostView(postId);
    } catch (err) {
        console.warn('[search] Could not open post view:', err);
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

// ---- Fetch suggestions (compact dropdown preview – capped, like FB's dropdown) ----
async function fetchSuggestions(query, suggestionsEl, input, resultsEl) {
    if (!query || query.length < 2) {
        suggestionsEl.style.display = 'none';
        return;
    }
    suggestionsEl.innerHTML = `<div class="se-center" style="height:auto;padding:16px;"><i class="fas fa-circle-notch se-spin" style="font-size:16px;"></i></div>`;
    suggestionsEl.style.display = 'block';

    try {
        const supabase = await getSupabaseClient();
        const currentUser = getCurrentUser();

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
            .limit(POST_SCAN_LIMIT);
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
        const matchedPosts = decryptedPosts.slice(0, 5); // dropdown preview only – full list shown on Enter

        const followingSet = currentUser
            ? await getFollowingSet(supabase, currentUser.id, users.map(u => u.user_id))
            : new Set();
        const authors = await fetchAuthors(supabase, matchedPosts.map(p => p.user_id));

        let html = '';
        if (users.length) {
            html += `<div class="fb-section-label"><i class="fas fa-user"></i> People (${users.length})</div>`;
            for (const u of users) {
                html += renderUserRow(u, {
                    query,
                    isFollowing: followingSet.has(u.user_id),
                    isSelf: currentUser && String(currentUser.id) === String(u.user_id),
                    small: true
                });
            }
        }
        if (matchedPosts.length) {
            if (users.length) html += `<hr class="fb-divider">`;
            html += `<div class="fb-section-label"><i class="fas fa-file-lines"></i> Posts</div>`;
            for (const p of matchedPosts) {
                html += renderPostRow(p, query, authors.get(p.user_id));
            }
        }
        if (!html) {
            html = `<div class="se-center" style="height:auto;padding:20px;"><i class="fas fa-ghost"></i><span>No suggestions found</span></div>`;
        }
        suggestionsEl.innerHTML = html;
        suggestionsEl.style.display = 'block';

        attachUserRowHandlers(suggestionsEl, {
            onProfileClick: (userId) => {
                suggestionsEl.style.display = 'none';
                navigateToUser(userId, input.value.trim());
            },
            onFollowToggle: async (userId, wasFollowing) => {
                const me = getCurrentUser();
                return toggleFollow(supabase, me && me.id, userId, wasFollowing);
            }
        });
        attachPostRowHandlers(suggestionsEl, {
            onPostClick: (postId) => {
                suggestionsEl.style.display = 'none';
                openPost(postId);
            }
        });
    } catch (err) {
        console.warn('[search] Suggestion error:', err);
        suggestionsEl.innerHTML = `<div class="se-center" style="height:auto;padding:16px;color:#dc2626;"><i class="fas fa-triangle-exclamation" style="font-size:16px;"></i><span>Error loading suggestions</span></div>`;
        suggestionsEl.style.display = 'block';
    }
}

// ---- Full search (Enter) – shows every matching user + every matching post ----
async function performSearch(query, resultsEl) {
    resultsEl.innerHTML = `<div class="se-center"><i class="fas fa-circle-notch se-spin"></i><span>Searching...</span></div>`;
    addSearchHistory(query);
    const supabase = await getSupabaseClient();
    const currentUser = getCurrentUser();

    try {
        const { data: posts, error: postErr } = await supabase
            .from('posts')
            .select('id, content, user_id, created_at, media, media_url, media_type')
            .order('created_at', { ascending: false })
            .limit(POST_SCAN_LIMIT);
        if (postErr) throw postErr;

        const { data: users, error: userErr } = await supabase
            .from('social_profiles')
            .select('display_name, username, avatar_url, user_id, bio')
            .ilike('display_name', `%${query}%`)
            .limit(20);
        if (userErr) throw userErr;

        const decryptedAll = await Promise.all(posts.map(async (p) => {
            try {
                const decrypted = await decryptAndDecompress(p.content);
                return { ...p, decryptedContent: decrypted };
            } catch {
                return { ...p, decryptedContent: '' };
            }
        }));
        // Every post whose decrypted content matches the query – no cap.
        const decryptedPosts = decryptedAll.filter(p =>
            p.decryptedContent.toLowerCase().includes(query.toLowerCase())
        );
        // Normalize post.media (may be stored as a JSON string, same as profile.js)
        decryptedPosts.forEach(p => {
            if (p.media && typeof p.media === 'string') {
                try { p.media = JSON.parse(p.media); } catch { p.media = []; }
            }
            if (p.media && !Array.isArray(p.media)) p.media = [];
        });

        const followingSet = currentUser
            ? await getFollowingSet(supabase, currentUser.id, users.map(u => u.user_id))
            : new Set();
        const authors = await fetchAuthors(supabase, decryptedPosts.map(p => p.user_id));

        const postIds = decryptedPosts.map(p => p.id);
        const { likesMap, userReactionsMap, summaryMap } = await fetchLikeData(supabase, postIds, currentUser && currentUser.id);
        let savedSet = new Set();
        if (currentUser) {
            try {
                const savedIds = await fetchSavedPostIds();
                savedSet = new Set(savedIds);
            } catch (err) {
                console.warn('[search] Could not load saved posts:', err);
            }
        }

        let html = '';
        if (users.length) {
            html += `<div class="fb-section-label"><i class="fas fa-user"></i> People (${users.length})</div>`;
            for (const u of users) {
                html += renderUserRow(u, {
                    query,
                    isFollowing: followingSet.has(u.user_id),
                    isSelf: currentUser && String(currentUser.id) === String(u.user_id)
                });
            }
        }
        if (decryptedPosts.length) {
            if (users.length) html += `<hr class="fb-divider">`;
            html += `<div class="fb-section-label"><i class="fas fa-file-lines"></i> Posts (${decryptedPosts.length})</div>`;
            html += `<div class="fb-results-list">`;
            for (const p of decryptedPosts) {
                const reaction = userReactionsMap[p.id];
                html += renderFullPostCard(p, query, authors.get(p.user_id), {
                    likeCount: likesMap[p.id] || 0,
                    isLiked: !!reaction,
                    reactionEmoji: reaction || '❤️',
                    summary: summaryMap[p.id] || {},
                    isSaved: savedSet.has(p.id),
                    isOwner: currentUser && String(currentUser.id) === String(p.user_id)
                });
            }
            html += `</div>`;
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

        attachUserRowHandlers(resultsEl, {
            onProfileClick: (userId) => navigateToUser(userId, query),
            onFollowToggle: async (userId, wasFollowing) => {
                const me = getCurrentUser();
                return toggleFollow(supabase, me && me.id, userId, wasFollowing);
            }
        });
        attachFullPostCardHandlers(resultsEl, {
            currentUserId: currentUser && currentUser.id,
            onOpenPost: (postId) => openPost(postId),
            onOpenReactions: (postId) => openReactionModal(postId)
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