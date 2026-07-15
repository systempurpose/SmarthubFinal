// js/userProfileView.js – Read‑only profile view for other users
import { getSupabaseClient } from './supabase.js';
import { renderVideoThumbnail } from './videoPlayer.js';
import { openPostView } from './postView.js';
import { openReactionModal } from './reactionModal.js';

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

export async function renderUserProfileView(container, userId) {
    if (!container) {
        container = document.getElementById('homeContent') || document.getElementById('pageContent');
        if (!container) return;
    }

    const supabase = await getSupabaseClient();

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

    const html = `
        <div class="profile-page">
            <div class="profile-header-bar" style="display:flex; align-items:center; gap:12px; padding:16px var(--hc-gutter); border-bottom:1px solid var(--hc-border);">
                <button class="back-btn" onclick="window.navigateHomePage('home')" style="background:none; border:none; font-size:16px; color:var(--hc-muted); cursor:pointer; display:flex; align-items:center; gap:6px; padding:4px 8px; border-radius:8px; transition:background 0.15s;">
                    <i class="fas fa-arrow-left"></i> Back
                </button>
                <span style="font-weight:700; font-size:16px;">${escapeHtml(displayName)}'s Profile</span>
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
                <div class="profile-identity">
                    <h2 class="profile-display-name">${escapeHtml(displayName)}</h2>
                    <p class="profile-username">@${escapeHtml(username)}</p>
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
                <div id="profileFeed"></div>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Load the user's posts
    await loadUserPosts(userId);
}

async function loadUserPosts(userId) {
    const feed = document.getElementById('profileFeed');
    if (!feed) return;

    feed.innerHTML = skeletonFeedHtml();

    try {
        const supabase = await getSupabaseClient();
        const { data: posts, error } = await supabase
            .from('posts')
            .select('*')
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
                try { post.media = JSON.parse(post.media); } catch(e) { post.media = []; }
            }
            if (post.media && !Array.isArray(post.media)) post.media = [];
        }

        const postIds = posts.map(p => p.id);
        let likesMap = {}, summaryMap = {};
        if (postIds.length) {
            const { data: likes } = await supabase
                .from('likes')
                .select('post_id, reaction, user_id')
                .in('post_id', postIds);
            if (likes) {
                likesMap = likes.reduce((acc, l) => {
                    acc[l.post_id] = (acc[l.post_id] || 0) + 1;
                    return acc;
                }, {});
                const grouped = {};
                likes.forEach(l => {
                    if (!grouped[l.post_id]) grouped[l.post_id] = {};
                    const r = l.reaction || '❤️';
                    grouped[l.post_id][r] = (grouped[l.post_id][r] || 0) + 1;
                });
                summaryMap = grouped;
            }
        }

        feed.innerHTML = renderPostCards(posts, likesMap, summaryMap);
        attachPostEventListeners(feed);
    } catch (err) {
        feed.innerHTML = `<div class="page-error">Couldn't load posts: ${escapeHtml(err.message)}</div>`;
    }
}

function renderPostCards(posts, likesMap, summaryMap) {
    let html = '';
    for (const post of posts) {
        const time = new Date(post.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const avatarHtml = targetUser?.avatar_url
            ? `<img src="${escapeHtml(targetUser.avatar_url)}" alt="">`
            : escapeHtml((targetUser?.display_name?.[0] || 'U').toUpperCase());

        const likeCount = likesMap[post.id] || 0;

        const summary = summaryMap[post.id] || {};
        const totalReactions = Object.values(summary).reduce((a, b) => a + b, 0);
        const summaryHtml = totalReactions > 0
            ? `<div class="reaction-summary" data-post-id="${post.id}">
                ${Object.entries(summary).map(([emoji, count]) =>
                    `<span class="reaction-chip">${emoji} ${count}</span>`
                ).join('')}
                <span class="reaction-total">${totalReactions}</span>
               </div>`
            : '';

        let mediaHtml = '';
        const mediaArray = post.media || [];
        if (mediaArray.length > 1) {
            const cols = Math.min(mediaArray.length, 3);
            mediaHtml = `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;margin-top:8px;border-radius:12px;overflow:hidden;">`;
            const displayItems = mediaArray.slice(0, 3);
            for (const m of displayItems) {
                if (m.type === 'video') {
                    mediaHtml += `<div class="video-thumbnail-container" data-video-url="${escapeHtml(m.url)}" style="aspect-ratio:1/1;"></div>`;
                } else {
                    mediaHtml += `<img src="${escapeHtml(m.url)}" style="width:100%;aspect-ratio:1/1;object-fit:cover;background:#000;">`;
                }
            }
            if (mediaArray.length > 3) {
                mediaHtml += `<div style="display:flex;align-items:center;justify-content:center;background:#f1f5f9;font-size:14px;font-weight:700;color:#64748b;aspect-ratio:1/1;border-radius:4px;">+${mediaArray.length - 3}</div>`;
            }
            mediaHtml += '</div>';
        } else if (mediaArray.length === 1) {
            const m = mediaArray[0];
            if (m.type === 'video') {
                mediaHtml = `<div class="video-thumbnail-container" data-video-url="${escapeHtml(m.url)}" style="margin-top:8px;"></div>`;
            } else {
                mediaHtml = `<img src="${escapeHtml(m.url)}" style="max-width:100%;border-radius:12px;margin-top:8px;">`;
            }
        } else if (post.media_url) {
            const isVideo = post.media_type === 'video';
            if (isVideo) {
                mediaHtml = `<div class="video-thumbnail-container" data-video-url="${escapeHtml(post.media_url)}" style="margin-top:8px;"></div>`;
            } else {
                mediaHtml = `<img src="${escapeHtml(post.media_url)}" style="max-width:100%;border-radius:12px;margin-top:8px;">`;
            }
        }

        html += `
            <div class="post-card" data-id="${post.id}" style="cursor:pointer;">
                <div class="post-header">
                    <div class="post-avatar">${avatarHtml}</div>
                    <span class="post-user">${escapeHtml(targetUser?.display_name || 'User')}</span>
                    <span class="post-username">@${escapeHtml(targetUser?.username || 'user')}</span>
                    <span class="post-time">${time}</span>
                </div>
                <div class="post-content">
                    <p>${escapeHtml(post.decryptedContent)}</p>
                    ${mediaHtml}
                </div>
                ${summaryHtml}
                <div class="post-actions">
                    <button class="comment-btn" data-id="${post.id}" style="background:none;border:none;display:flex;align-items:center;gap:4px;font-size:14px;color:#555;cursor:pointer;">
                        <i class="fas fa-comment"></i> <span>0</span>
                    </button>
                    <button class="share-btn" data-id="${post.id}" style="background:none;border:none;display:flex;align-items:center;gap:4px;font-size:14px;color:#555;cursor:pointer;">
                        <i class="fas fa-share"></i>
                    </button>
                </div>
            </div>
        `;
    }
    return html;
}

function attachPostEventListeners(feed) {
    feed.querySelectorAll('.video-thumbnail-container').forEach(el => {
        const videoUrl = el.dataset.videoUrl;
        if (videoUrl) renderVideoThumbnail(el, videoUrl);
    });

    feed.querySelectorAll('.reaction-summary').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const postId = el.dataset.postId;
            openReactionModal(postId);
        });
    });

    feed.querySelectorAll('.comment-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const postId = btn.dataset.id;
            openPostView(postId);
        });
    });

    feed.querySelectorAll('.share-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const postId = btn.dataset.id;
            navigator.clipboard.writeText(`Check out this post on SmartHub: #${postId}`)
                .then(() => {})
                .catch(() => {});
        });
    });

    feed.querySelectorAll('.post-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            const postId = card.dataset.id;
            openPostView(postId);
        });
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}