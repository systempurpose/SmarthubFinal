// js/userProfileView.js – Read‑only profile view for other users
import { getSupabaseClient } from './supabase.js';
import { fetchSavedPostIds } from './home-sb.js';
import {
    ensureFBStyles,
    renderFullPostCard,
    attachFullPostCardHandlers
} from './searchCards.js';
import { openReactionModal } from './reactionModal.js';
import { openPostView } from './postView.js';

let targetUser = null;

// ---- Skeleton loader ----
function skeletonFeedHtml(count = 3) {
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `
            <div class="skeleton-post">
                <div class="skeleton-line" style="width:40%;"></div>
                <div class="skeleton-line" style="width:90%;"></div>
                <div class="skeleton-line" style="width:70%;"></div>
            </div>
        `;
    }
    return html;
}

// ---- Extra styles specific to this page (back bar + follow row) ----
function ensureProfileViewStyles() {
    if (document.getElementById('upv-styles')) return;
    const style = document.createElement('style');
    style.id = 'upv-styles';
    style.textContent = `
        .upv-header-bar {
            display: flex; align-items: center; gap: 12px;
            padding: 12px var(--hc-gutter);
            border-bottom: 1px solid var(--hc-border);
            position: sticky; top: 0; z-index: 20;
            background: rgba(255,255,255,0.9);
            backdrop-filter: blur(14px) saturate(1.4);
            -webkit-backdrop-filter: blur(14px) saturate(1.4);
        }
        .upv-back-btn {
            display: inline-flex; align-items: center; gap: 8px;
            background: var(--hc-canvas); border: 1px solid var(--hc-border);
            color: var(--hc-ink); font-size: 13.5px; font-weight: 700;
            padding: 8px 14px; border-radius: 999px; cursor: pointer;
            transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
        }
        .upv-back-btn:hover { background: var(--hc-accent-tint); border-color: var(--hc-accent-tint-strong); color: var(--hc-accent-hover); }
        .upv-back-btn:active { transform: scale(0.96); }
        .upv-header-name { font-weight: 800; font-size: 16px; color: var(--hc-ink); letter-spacing: -0.01em; }

        .upv-identity-row {
            display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
        }
        .upv-follow-btn {
            flex-shrink: 0; border: none; border-radius: 999px; padding: 10px 24px;
            font-size: 13.5px; font-weight: 700; cursor: pointer; margin-top: 4px;
            background: var(--hc-accent); color: #fff;
            transition: background 0.15s ease, transform 0.1s ease, opacity 0.15s ease;
        }
        .upv-follow-btn:hover { background: var(--hc-accent-hover); }
        .upv-follow-btn:active { transform: scale(0.96); }
        .upv-follow-btn[data-following="true"] {
            background: #fff; color: var(--hc-ink-soft); border: 1px solid var(--hc-border-strong);
        }
        .upv-follow-btn[data-following="true"]:hover {
            background: var(--hc-like-bg); color: var(--hc-like); border-color: var(--hc-like);
        }
        .upv-follow-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .profile-stats { display: flex; gap: 16px; margin: 6px 0 0; font-size: 13.5px; color: var(--hc-muted); }
        .profile-stats strong { color: var(--hc-ink); }
    `;
    document.head.appendChild(style);
}

// ---- Current user + follow helpers (same `follows` table used across the app) ----
function getCurrentUser() {
    try {
        return JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    } catch {
        return null;
    }
}

async function isFollowing(supabase, followerId, followingId) {
    if (!followerId) return false;
    try {
        const { data, error } = await supabase
            .from('follows')
            .select('follower_id')
            .eq('follower_id', followerId)
            .eq('following_id', followingId)
            .maybeSingle();
        if (error) throw error;
        return !!data;
    } catch (err) {
        console.warn('[userProfileView] Could not load follow status:', err);
        return false;
    }
}

async function toggleFollow(supabase, followerId, followingId, wasFollowing) {
    if (!followerId) throw new Error('Log in to follow people');
    if (wasFollowing) {
        const { error } = await supabase
            .from('follows')
            .delete()
            .eq('follower_id', followerId)
            .eq('following_id', followingId);
        if (error) throw error;
        return false;
    } else {
        const { error } = await supabase
            .from('follows')
            .insert({ follower_id: followerId, following_id: followingId });
        if (error) throw error;
        return true;
    }
}

export async function renderUserProfileView(container, userId) {
    ensureFBStyles();
    ensureProfileViewStyles();

    if (!container) {
        container = document.getElementById('homeContent') || document.getElementById('pageContent');
        if (!container) return;
    }

    const supabase = await getSupabaseClient();
    const currentUser = getCurrentUser();

    // Fetch the user's profile
    const { data: profile, error } = await supabase
        .from('social_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    if (error || !profile) {
        container.innerHTML = `
            <div class="profile-page">
                <div class="page-error">
                    <i class="fas fa-user-slash"></i>
                    <p>User not found.</p>
                    <button onclick="window.navigateHomePage('home')" class="btn-primary">Go Home</button>
                </div>
            </div>
        `;
        return;
    }

    targetUser = profile;

    const displayName = profile.display_name || 'User';
    const username = profile.username || 'user';
    const bio = profile.bio || '';
    const avatarUrl = profile.avatar_url || '';
    const coverUrl = profile.cover_url || '';
    const joinDate = new Date(profile.created_at || Date.now()).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

    // Follower/following counts
    const { count: followers } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', userId);

    const { count: following } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', userId);

    // Is the current (logged-in) visitor already following this person?
    const viewerIsFollowing = currentUser ? await isFollowing(supabase, currentUser.id, userId) : false;
    const isOwnProfile = currentUser && String(currentUser.id) === String(userId);

    const followBtnHtml = (currentUser && !isOwnProfile)
        ? `<button type="button" class="upv-follow-btn" data-user-id="${userId}" data-following="${viewerIsFollowing}">
               ${viewerIsFollowing ? 'Following' : 'Follow'}
           </button>`
        : '';

    const html = `
        <div class="profile-page">
            <div class="upv-header-bar">
                <button class="upv-back-btn" onclick="window.navigateHomePage('home')" type="button">
                    <i class="fas fa-arrow-left"></i> Back
                </button>
                <span class="upv-header-name">${escapeHtml(displayName)}'s Profile</span>
            </div>
            <!-- Cover -->
            <div class="profile-cover">
                ${coverUrl ? `<img src="${escapeHtml(coverUrl)}" alt="Cover photo">` : ''}
            </div>

            <!-- Avatar + identity -->
            <div class="profile-header-row">
                <div class="profile-avatar-wrap">
                    ${avatarUrl
                        ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(displayName)}'s avatar">`
                        : `<div class="profile-avatar-initial">${escapeHtml(displayName[0]?.toUpperCase() || 'U')}</div>`}
                </div>
                <div class="profile-identity" style="flex:1;">
                    <div class="upv-identity-row">
                        <div>
                            <h2 class="profile-display-name">${escapeHtml(displayName)}</h2>
                            <p class="profile-username">@${escapeHtml(username)}</p>
                        </div>
                        ${followBtnHtml}
                    </div>
                    <p class="profile-stats">
                        <span><strong>${followers || 0}</strong> followers</span>
                        <span><strong>${following || 0}</strong> following</span>
                    </p>
                    <p class="profile-joined">Joined ${joinDate}</p>
                </div>
            </div>

            <!-- Bio (read-only) -->
            <div class="profile-bio-section">
                <p class="profile-bio-text" style="font-size:14.5px; line-height:1.6; color:var(--hc-ink-soft); margin:0;">
                    ${bio ? escapeHtml(bio) : 'No bio yet.'}
                </p>
            </div>

            <!-- User's Posts -->
            <div class="profile-feed-section">
                <h3 class="profile-section-title">Posts</h3>
                <div id="profileFeed" class="fb-results-list"></div>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // ---- Follow button ----
    const followBtn = container.querySelector('.upv-follow-btn');
    if (followBtn) {
        followBtn.addEventListener('click', async () => {
            const wasFollowing = followBtn.dataset.following === 'true';
            followBtn.disabled = true;
            try {
                const nowFollowing = await toggleFollow(supabase, currentUser.id, userId, wasFollowing);
                followBtn.dataset.following = String(nowFollowing);
                followBtn.textContent = nowFollowing ? 'Following' : 'Follow';
                const followerCountEl = container.querySelector('.profile-stats strong');
                if (followerCountEl) {
                    const current = parseInt(followerCountEl.textContent) || 0;
                    followerCountEl.textContent = nowFollowing ? current + 1 : Math.max(0, current - 1);
                }
            } catch (err) {
                console.warn('[userProfileView] Follow toggle failed:', err);
            } finally {
                followBtn.disabled = false;
            }
        });
    }

    // Load the user's posts
    await loadUserPosts(userId, currentUser);
}

async function loadUserPosts(userId, currentUser) {
    const feed = document.getElementById('profileFeed');
    if (!feed) return;

    feed.innerHTML = skeletonFeedHtml();

    try {
        const supabase = await getSupabaseClient();
        const { data: posts, error } = await supabase
            .from('posts')
            .select('id, content, user_id, created_at, media, media_url, media_type')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;
        if (!posts || posts.length === 0) {
            feed.innerHTML = `<div class="empty-state"><i class="fas fa-feather-alt"></i><h3>No posts yet</h3><p>This user hasn't posted anything yet.</p></div>`;
            return;
        }

        const { decryptAndDecompress } = await import('./home-sb.js');
        for (const post of posts) {
            post.decryptedContent = await decryptAndDecompress(post.content);
            if (post.media && typeof post.media === 'string') {
                try { post.media = JSON.parse(post.media); } catch (e) { post.media = []; }
            }
            if (post.media && !Array.isArray(post.media)) post.media = [];
        }

        const postIds = posts.map(p => p.id);
        let likesMap = {}, userReactionsMap = {}, summaryMap = {};
        if (postIds.length) {
            const { data: likes } = await supabase
                .from('likes')
                .select('post_id, reaction, user_id')
                .in('post_id', postIds);
            if (likes) {
                likes.forEach(l => {
                    likesMap[l.post_id] = (likesMap[l.post_id] || 0) + 1;
                    if (currentUser && l.user_id === currentUser.id) {
                        userReactionsMap[l.post_id] = l.reaction || '❤️';
                    }
                    if (!summaryMap[l.post_id]) summaryMap[l.post_id] = {};
                    const r = l.reaction || '❤️';
                    summaryMap[l.post_id][r] = (summaryMap[l.post_id][r] || 0) + 1;
                });
            }
        }

        let savedSet = new Set();
        if (currentUser) {
            try {
                savedSet = new Set(await fetchSavedPostIds());
            } catch (err) {
                console.warn('[userProfileView] Could not load saved posts:', err);
            }
        }

        let html = '';
        for (const post of posts) {
            const reaction = userReactionsMap[post.id];
            html += renderFullPostCard(post, '', targetUser, {
                likeCount: likesMap[post.id] || 0,
                isLiked: !!reaction,
                reactionEmoji: reaction || '❤️',
                summary: summaryMap[post.id] || {},
                isSaved: savedSet.has(post.id),
                isOwner: false // visiting someone else's profile — never show delete here
            });
        }
        feed.innerHTML = html;

        attachFullPostCardHandlers(feed, {
            onOpenPost: (postId) => openPostView(postId),
            onOpenReactions: (postId) => openReactionModal(postId)
        });
    } catch (err) {
        feed.innerHTML = `<div class="page-error">Couldn't load posts: ${escapeHtml(err.message)}</div>`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}