// ============================================================
// profile.js – Social Profile (full‑page scrollable)
// Styling lives in home.css (shared with the Home feed) under
// .composer-*, .post-*, .empty-state, .page-error/.page-login,
// and the .profile-* chrome rules.
// ============================================================

import { getSupabaseClient } from './supabase.js';
import { createPost, toggleLike, deletePost, fetchReactionsSummary, fetchSavedPostIds } from './home-sb.js';
import { uploadProfileImage, updateProfile } from './profile-sb.js';
import { uploadVideo } from './videoUpload.js';
import { renderVideoThumbnail } from './videoPlayer.js';
import { openPostView } from './postView.js';
import { openReactionModal } from './reactionModal.js';

let currentProfileUser = null;
let currentUser = null;
let currentFeedType = 'user'; // 'user' or 'saved'
let savedCount = 0;

// ---- Emoji picker ----
const EMOJIS = ['❤️', '😊', '😂', '😮', '😢', '😡'];

function createEmojiPicker(onSelect) {
    const picker = document.createElement('div');
    picker.className = 'emoji-picker';
    picker.style.cssText = `
        position:absolute; bottom:calc(100% + 10px); left:0;
        background:white; border-radius:24px; padding:8px 10px;
        box-shadow:0 14px 34px rgba(15,23,42,0.18), 0 2px 8px rgba(15,23,42,0.08);
        display:flex; gap:2px; align-items:center;
        z-index:100; opacity:0; pointer-events:none;
        transform-origin: bottom left;
        transform:translateY(10px) scale(0.85);
        transition:opacity 0.18s cubic-bezier(0.2,0.7,0.3,1), transform 0.22s cubic-bezier(0.34,1.56,0.64,1);
        will-change:transform,opacity;
    `;
    EMOJIS.forEach(emoji => {
        const btn = document.createElement('span');
        btn.textContent = emoji;
        btn.style.cssText = `
            font-size:22px; line-height:1; cursor:pointer; padding:6px 7px; border-radius:12px;
            display:inline-flex; align-items:center; justify-content:center;
            transition:transform 0.18s cubic-bezier(0.34,1.56,0.64,1), background 0.15s ease;
            transform: scale(1) translateY(0);
        `;
        btn.onmouseenter = () => {
            btn.style.background = '#f1f5f9';
            btn.style.transform = 'scale(1.4) translateY(-5px)';
        };
        btn.onmouseleave = () => {
            btn.style.background = 'transparent';
            btn.style.transform = 'scale(1) translateY(0)';
        };
        btn.onclick = (e) => { e.stopPropagation(); onSelect(emoji); };
        picker.appendChild(btn);
    });
    return picker;
}

function keepPickerOnScreen(picker) {
    requestAnimationFrame(() => {
        const rect = picker.getBoundingClientRect();
        if (rect.right > window.innerWidth - 8) {
            picker.style.left = 'auto';
            picker.style.right = '0';
            picker.style.transformOrigin = 'bottom right';
        }
    });
}

// ---- 🆕 Helper: Live update reaction summary chip ----
export async function updateProfileSummary(postId) {
    const chip = document.querySelector(`.profile-feed-section .reaction-summary[data-post-id="${postId}"]`);
    if (!chip) return;
    try {
        const summary = await fetchReactionsSummary(postId);
        const totalReactions = Object.values(summary).reduce((a, b) => a + b, 0);
        if (totalReactions === 0) {
            chip.remove();
            return;
        }
        chip.innerHTML = `
            ${Object.entries(summary).map(([emoji, count]) =>
                `<span class="reaction-chip">${emoji} ${count}</span>`
            ).join('')}
            <span class="reaction-total">${totalReactions}</span>
        `;
    } catch (err) {
        console.warn('Failed to update profile summary:', err);
    }
}

// ---- 🆕 Helper: Live update the like button on the profile feed ----
export async function updateProfileLikeButton(postId, liked, reaction, count) {
    const btn = document.querySelector(`.profile-feed-section .post-card[data-id="${postId}"] .like-btn`);
    if (!btn) return;
    const countSpan = btn.querySelector('.like-count');
    const emojiSpan = btn.querySelector('.reaction-emoji') || document.createElement('span');
    if (!btn.querySelector('.reaction-emoji')) {
        emojiSpan.className = 'reaction-emoji';
        btn.prepend(emojiSpan);
    }
    if (count !== undefined) {
        countSpan.textContent = count;
    }
    emojiSpan.textContent = liked ? (reaction || '❤️') : '❤️';
    btn.classList.toggle('liked', liked);
    btn.style.color = liked ? '#e0245e' : '#555';
}

// ---- Toggle like with live summary update ----
async function toggleLikeAction(postId, btn, reaction) {
    try {
        const result = await toggleLike(postId, reaction);
        const countSpan = btn.querySelector('.like-count');
        const current = parseInt(countSpan.textContent) || 0;
        let newCount = current;
        let liked = false;
        if (result.action === 'liked') {
            newCount = current + 1;
            liked = true;
        } else if (result.action === 'unliked') {
            newCount = Math.max(0, current - 1);
            liked = false;
        } else if (result.action === 'updated') {
            liked = true;
        }
        countSpan.textContent = newCount;
        btn.classList.toggle('liked', liked);
        const emojiSpan = btn.querySelector('.reaction-emoji') || document.createElement('span');
        emojiSpan.className = 'reaction-emoji';
        if (liked) {
            const emoji = result.reaction || (reaction || '❤️');
            emojiSpan.textContent = emoji;
        } else {
            emojiSpan.textContent = '❤️';
        }
        if (!btn.querySelector('.reaction-emoji')) {
            btn.prepend(emojiSpan);
        }
        btn.style.transform = 'scale(1.25)';
        setTimeout(() => btn.style.transform = 'scale(1)', 180);

        // ---- 🚀 Live update the reaction summary chip ----
        await updateProfileSummary(postId);
    } catch (err) {
        toast('Failed to like: ' + err.message, 'error');
    }
}

export async function renderProfile(container) {
    if (!container) {
        container = document.getElementById('homeContent') || document.getElementById('pageContent');
        if (!container) return;
    }

    try {
        const stored = localStorage.getItem('smarthub.user');
        if (stored) currentUser = JSON.parse(stored);
    } catch (e) {}

    if (!currentUser || !currentUser.id) {
        container.innerHTML = `
            <div class="profile-page">
                <div class="page-login">
                    <i class="fas fa-user-circle"></i>
                    <p>Log in to view your profile.</p>
                    <button onclick="document.getElementById('loginBtn')?.click()" class="btn-primary">Log in</button>
                </div>
            </div>
        `;
        return;
    }

    const supabase = await getSupabaseClient();

    let { data: profile, error } = await supabase
        .from('social_profiles')
        .select('*')
        .eq('user_id', currentUser.id)
        .maybeSingle();

    if (error) {
        container.innerHTML = `<div class="profile-page"><div class="page-error">Couldn't load your profile: ${escapeHtml(error.message)}</div></div>`;
        return;
    }

    if (!profile) {
        const defaultDisplay = currentUser.name || currentUser.email?.split('@')[0] || 'User';
        const defaultUsername = currentUser.email?.split('@')[0] || 'user';

        const { data: newProfile, error: insertError } = await supabase
            .from('social_profiles')
            .insert({
                user_id: currentUser.id,
                display_name: defaultDisplay,
                username: defaultUsername,
                bio: 'Hello, I am using SmartHub!',
                created_at: new Date().toISOString()
            })
            .select()
            .maybeSingle();

        if (insertError) {
            if (insertError.code === '23505') {
                const { data: refetched } = await supabase
                    .from('social_profiles')
                    .select('*')
                    .eq('user_id', currentUser.id)
                    .maybeSingle();
                if (refetched) profile = refetched;
            }
            if (!profile) {
                container.innerHTML = `
                    <div class="profile-page">
                        <div class="page-error">
                            Couldn't set up your profile: ${escapeHtml(insertError.message)}
                            <div style="margin-top:14px;"><button onclick="window.renderHome()" class="btn-primary">Go home</button></div>
                        </div>
                    </div>
                `;
                return;
            }
        } else {
            profile = newProfile;
        }
        currentUser.name = defaultDisplay;
        localStorage.setItem('smarthub.user', JSON.stringify(currentUser));
    }

    currentProfileUser = profile;

    // ---- Follower / following counts ----
    const { count: followers } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', currentUser.id);

    const { count: following } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', currentUser.id);

    const displayName = profile.display_name || 'User';
    const username = profile.username || 'user';
    const bio = profile.bio || '';
    const avatarUrl = profile.avatar_url || '';
    const coverUrl = profile.cover_url || '';
    const joinDate = new Date(profile.created_at || Date.now()).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

    // ---- Fetch saved count for badge ----
    const savedIds = await fetchSavedPostIds();
    savedCount = savedIds.length;

    // ---- Build profile HTML with improved tabs ----
    const html = `
        <div class="profile-page">
            <!-- Cover -->
            <div class="profile-cover">
                ${coverUrl ? `<img src="${escapeHtml(coverUrl)}" alt="Cover photo">` : ''}
                <button class="profile-change-cover-btn overlay-btn" type="button">
                    <i class="fas fa-camera"></i> Change cover
                </button>
                <input type="file" id="coverInput" accept="image/*" style="display:none;">
            </div>

            <!-- Avatar + identity -->
            <div class="profile-header-row">
                <div class="profile-avatar-wrap">
                    ${avatarUrl
                        ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(displayName)}'s avatar">`
                        : `<div class="profile-avatar-initial">${escapeHtml(displayName[0]?.toUpperCase() || 'U')}</div>`}
                    <button class="profile-change-avatar-btn overlay-btn" type="button" aria-label="Change avatar">
                        <i class="fas fa-camera"></i>
                    </button>
                    <input type="file" id="avatarInput" accept="image/*" style="display:none;">
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

            <!-- Bio (edit-in-place) -->
            <div class="profile-bio-section">
                <div class="profile-bio-display" id="bioDisplay">
                    <p class="profile-bio-text" id="bioText">${bio ? escapeHtml(bio) : 'No bio yet — tell people about yourself.'}</p>
                    <button class="profile-bio-edit-btn" id="bioEditBtn" type="button" aria-label="Edit bio">
                        <i class="fas fa-pen"></i>
                    </button>
                </div>
                <div class="profile-bio-edit-row" id="bioEditRow" style="display:none;">
                    <input type="text" id="bioInput" value="${escapeHtml(bio)}" placeholder="Write your bio...">
                    <button id="saveBioBtn" class="btn-primary" type="button">Save</button>
                    <button id="cancelBioBtn" class="btn-secondary" type="button">Cancel</button>
                </div>
            </div>

            <!-- Post Input with media attach -->
            <div class="composer-card">
                <div class="composer-input">
                    <div class="profile-composer-avatar composer-avatar">
                        ${avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="">` : escapeHtml(displayName[0]?.toUpperCase() || 'U')}
                    </div>
                    <div class="composer-body">
                        <textarea id="profileComposer" rows="2" placeholder="What's on your mind?"></textarea>
                        <div id="profileMediaPreview" class="media-preview" style="display:none;"></div>
                        <div class="composer-actions">
                            <div class="composer-tools">
                                <button id="profileVideoBtn" title="Attach video" type="button"><i class="fas fa-video"></i></button>
                                <button id="profileImageBtn" title="Attach image" type="button"><i class="fas fa-image"></i></button>
                                <button id="profileGifBtn" title="Add GIF" type="button"><i class="fas fa-grin"></i></button>
                            </div>
                            <button id="profilePostBtn" class="composer-submit" type="button">Post</button>
                        </div>
                        <input type="file" id="profileMediaInput" accept="video/*,image/*" style="display:none;">
                        <div id="profileUploadProgress" class="composer-upload-progress" style="display:none;"></div>
                    </div>
                </div>
            </div>

            <!-- User's Posts with redesigned tabs -->
            <div class="profile-feed-section">
                <div class="profile-feed-tabs feed-tabs" style="margin:0 var(--hc-gutter) 12px;">
                    <button class="feed-tab active" data-feed="user">
                        <i class="fas fa-pen"></i> Posts
                    </button>
                    <button class="feed-tab" data-feed="saved">
                        <i class="fas fa-bookmark"></i> Saved
                        <span class="saved-count-badge" id="savedCountBadge">${savedCount}</span>
                    </button>
                </div>
                <div id="profileFeed" style="transition: opacity 0.2s ease;"></div>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // ---- Load posts (default: user's own) ----
    currentFeedType = 'user';
    await loadUserPosts(currentUser.id);

    // ---- Tab switching with animation ----
    document.querySelectorAll('.feed-tab').forEach(tab => {
        tab.addEventListener('click', async () => {
            document.querySelectorAll('.feed-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const feed = tab.dataset.feed;
            const feedEl = document.getElementById('profileFeed');
            feedEl.style.opacity = '0.4';
            if (feed === 'user') {
                currentFeedType = 'user';
                await loadUserPosts(currentUser.id);
            } else if (feed === 'saved') {
                currentFeedType = 'saved';
                await loadSavedPosts();
            }
            feedEl.style.opacity = '1';
        });
    });

    // ---- Cover / avatar update ----
    document.querySelector('.profile-change-avatar-btn')?.addEventListener('click', () => {
        document.getElementById('avatarInput').click();
    });
    document.getElementById('avatarInput')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const url = await uploadProfileImage(file, 'avatars');
            await updateProfile({ avatar_url: url });
            renderProfile(container);
            toast('Avatar updated!', 'success');
        } catch (err) {
            toast('Failed to update avatar: ' + err.message, 'error');
        }
    });

    document.querySelector('.profile-change-cover-btn')?.addEventListener('click', () => {
        document.getElementById('coverInput').click();
    });
    document.getElementById('coverInput')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const url = await uploadProfileImage(file, 'covers');
            await updateProfile({ cover_url: url });
            renderProfile(container);
            toast('Cover updated!', 'success');
        } catch (err) {
            toast('Failed to update cover: ' + err.message, 'error');
        }
    });

    // ---- Bio edit-in-place ----
    const bioDisplay = document.getElementById('bioDisplay');
    const bioEditRow = document.getElementById('bioEditRow');
    const bioEditBtn = document.getElementById('bioEditBtn');
    const bioInput = document.getElementById('bioInput');
    const cancelBioBtn = document.getElementById('cancelBioBtn');

    bioEditBtn?.addEventListener('click', () => {
        bioDisplay.style.display = 'none';
        bioEditRow.style.display = 'flex';
        bioInput.focus();
        bioInput.setSelectionRange(bioInput.value.length, bioInput.value.length);
    });
    cancelBioBtn?.addEventListener('click', () => {
        bioInput.value = bio;
        bioEditRow.style.display = 'none';
        bioDisplay.style.display = 'flex';
    });
    document.getElementById('saveBioBtn')?.addEventListener('click', async () => {
        const newBio = bioInput.value.trim();
        try {
            await updateProfile({ bio: newBio });
            renderProfile(container);
            toast('Bio updated!', 'success');
        } catch (err) {
            toast('Failed to update bio: ' + err.message, 'error');
        }
    });

    // ---- Composer with media ----
    const composer = document.getElementById('profileComposer');
    const postBtn = document.getElementById('profilePostBtn');
    const videoBtn = document.getElementById('profileVideoBtn');
    const imageBtn = document.getElementById('profileImageBtn');
    const gifBtn = document.getElementById('profileGifBtn');
    const mediaInput = document.getElementById('profileMediaInput');
    const progress = document.getElementById('profileUploadProgress');
    const mediaPreview = document.getElementById('profileMediaPreview');

    let pendingMedia = null;

    function clearMediaPreview() {
        pendingMedia = null;
        mediaPreview.style.display = 'none';
        mediaPreview.innerHTML = '';
    }

    videoBtn.addEventListener('click', () => {
        mediaInput.accept = 'video/*';
        mediaInput.click();
    });

    imageBtn.addEventListener('click', () => {
        mediaInput.accept = 'image/*';
        mediaInput.click();
    });

    gifBtn.addEventListener('click', () => {
        toast('GIF support coming soon!', 'info');
    });

    mediaInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            progress.classList.remove('is-error');
            progress.style.display = 'flex';
            progress.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
            if (file.type.startsWith('video/')) {
                const result = await uploadVideo(file);
                pendingMedia = { url: result.url || result.storagePath, type: 'video' };
                mediaPreview.innerHTML = `
                    <span class="video-badge"><i class="fas fa-video"></i> Video</span>
                    <video src="${escapeHtml(pendingMedia.url)}" muted></video>
                    <button class="media-remove-btn" type="button" aria-label="Remove media"><i class="fas fa-times"></i></button>
                `;
            } else {
                const reader = new FileReader();
                const dataUrl = await new Promise((resolve) => {
                    reader.onload = (e) => resolve(e.target.result);
                    reader.readAsDataURL(file);
                });
                pendingMedia = { url: dataUrl, type: 'image' };
                mediaPreview.innerHTML = `
                    <img src="${dataUrl}" alt="Attached image">
                    <button class="media-remove-btn" type="button" aria-label="Remove media"><i class="fas fa-times"></i></button>
                `;
            }
            mediaPreview.style.display = 'block';
            mediaPreview.querySelector('.media-remove-btn')?.addEventListener('click', clearMediaPreview);
            progress.style.display = 'none';
        } catch (err) {
            progress.classList.add('is-error');
            progress.innerHTML = '<i class="fas fa-circle-exclamation"></i> ' + err.message;
        } finally {
            mediaInput.value = '';
        }
    });

    postBtn.addEventListener('click', async () => {
        const text = composer.value.trim();
        if (!text && !pendingMedia) {
            toast('Write something or attach media first.', 'info');
            return;
        }

        let mediaUrl = null;
        let mediaType = null;
        if (pendingMedia) {
            mediaUrl = pendingMedia.url;
            mediaType = pendingMedia.type;
        }

        postBtn.disabled = true;
        postBtn.textContent = 'Posting...';
        try {
            await createPost(text || '📎', mediaUrl, mediaType);
            composer.value = '';
            clearMediaPreview();
            toast('Post published!', 'success');
            if (currentFeedType === 'user') {
                await loadUserPosts(currentUser.id);
            } else {
                await loadSavedPosts();
            }
        } catch (err) {
            toast('Failed to post: ' + err.message, 'error');
        } finally {
            postBtn.disabled = false;
            postBtn.textContent = 'Post';
        }
    });
}

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

// ---- Load user's own posts ----
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
            feed.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-feather-alt"></i>
                    <h3>No posts yet</h3>
                    <p>Share what's on your mind above to get started.</p>
                </div>
            `;
            return;
        }

        const { decryptAndDecompress } = await import('./home-sb.js');
        for (const post of posts) {
            post.decryptedContent = await decryptAndDecompress(post.content);
        }

        const postIds = posts.map(p => p.id);
        let likesMap = {}, userReactionsMap = {}, summaryMap = {};
        if (postIds.length && currentUser) {
            const { data: likes } = await supabase
                .from('likes')
                .select('post_id, reaction, user_id')
                .in('post_id', postIds);
            if (likes) {
                likesMap = likes.reduce((acc, l) => {
                    acc[l.post_id] = (acc[l.post_id] || 0) + 1;
                    return acc;
                }, {});
                for (const l of likes) {
                    if (l.user_id === currentUser.id) {
                        userReactionsMap[l.post_id] = l.reaction || '❤️';
                    }
                }
                const grouped = {};
                likes.forEach(l => {
                    if (!grouped[l.post_id]) grouped[l.post_id] = {};
                    const r = l.reaction || '❤️';
                    grouped[l.post_id][r] = (grouped[l.post_id][r] || 0) + 1;
                });
                summaryMap = grouped;
            }
        }

        feed.innerHTML = renderPostCards(posts, likesMap, userReactionsMap, summaryMap);
        attachPostEventListeners(feed);
    } catch (err) {
        feed.innerHTML = `<div class="page-error">Couldn't load posts: ${escapeHtml(err.message)}</div>`;
    }
}

// ---- Load saved posts ----
async function loadSavedPosts() {
    const feed = document.getElementById('profileFeed');
    if (!feed) return;
    feed.innerHTML = skeletonFeedHtml();

    try {
        const supabase = await getSupabaseClient();
        const savedIds = await fetchSavedPostIds();
        savedCount = savedIds.length;

        // Update badge
        const badge = document.getElementById('savedCountBadge');
        if (badge) badge.textContent = savedCount;

        if (!savedIds.length) {
            feed.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-bookmark"></i>
                    <h3>No saved posts</h3>
                    <p>Save posts you find interesting to see them here.</p>
                </div>
            `;
            return;
        }

        const { data: posts, error } = await supabase
            .from('posts')
            .select('*')
            .in('id', savedIds)
            .order('created_at', { ascending: false });

        if (error) throw error;
        if (!posts || posts.length === 0) {
            feed.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-bookmark"></i>
                    <h3>No saved posts</h3>
                    <p>Save posts you find interesting to see them here.</p>
                </div>
            `;
            return;
        }

        const { decryptAndDecompress } = await import('./home-sb.js');
        for (const post of posts) {
            post.decryptedContent = await decryptAndDecompress(post.content);
        }

        const postIds = posts.map(p => p.id);
        let likesMap = {}, userReactionsMap = {}, summaryMap = {};
        if (postIds.length && currentUser) {
            const { data: likes } = await supabase
                .from('likes')
                .select('post_id, reaction, user_id')
                .in('post_id', postIds);
            if (likes) {
                likesMap = likes.reduce((acc, l) => {
                    acc[l.post_id] = (acc[l.post_id] || 0) + 1;
                    return acc;
                }, {});
                for (const l of likes) {
                    if (l.user_id === currentUser.id) {
                        userReactionsMap[l.post_id] = l.reaction || '❤️';
                    }
                }
                const grouped = {};
                likes.forEach(l => {
                    if (!grouped[l.post_id]) grouped[l.post_id] = {};
                    const r = l.reaction || '❤️';
                    grouped[l.post_id][r] = (grouped[l.post_id][r] || 0) + 1;
                });
                summaryMap = grouped;
            }
        }

        feed.innerHTML = renderPostCards(posts, likesMap, userReactionsMap, summaryMap);
        attachPostEventListeners(feed);
    } catch (err) {
        feed.innerHTML = `<div class="page-error">Couldn't load saved posts: ${escapeHtml(err.message)}</div>`;
    }
}

// ---- Shared: render post cards ----
function renderPostCards(posts, likesMap, userReactionsMap, summaryMap) {
    let html = '';
    for (const post of posts) {
        const time = new Date(post.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const isOwner = currentUser && post.user_id === currentUser.id;
        const videoUrl = post.media_url && post.media_type === 'video' ? post.media_url : null;
        const imageUrl = post.media_url && post.media_type === 'image' ? post.media_url : null;

        let mediaHtml = '';
        if (videoUrl) {
            mediaHtml = `<div class="video-thumbnail-container" data-video-url="${escapeHtml(videoUrl)}" style="margin-top:8px;"></div>`;
        } else if (imageUrl) {
            mediaHtml = `<img src="${escapeHtml(imageUrl)}" alt="Media">`;
        }

        const avatarHtml = currentProfileUser?.avatar_url
            ? `<img src="${escapeHtml(currentProfileUser.avatar_url)}" alt="">`
            : escapeHtml((currentProfileUser?.display_name?.[0] || 'U').toUpperCase());

        const likeCount = likesMap[post.id] || 0;
        const userReaction = userReactionsMap[post.id] || null;
        const isLiked = !!userReaction;
        const displayEmoji = isLiked ? userReaction : '❤️';

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

        html += `
            <div class="post-card" data-id="${post.id}" style="cursor:pointer;">
                <div class="post-header">
                    <div class="post-avatar">${avatarHtml}</div>
                    <span class="post-user">${escapeHtml(currentProfileUser?.display_name || 'User')}</span>
                    <span class="post-username">@${escapeHtml(currentProfileUser?.username || 'user')}</span>
                    <span class="post-time">${time}</span>
                    ${isOwner ? `<button class="delete-post-btn" data-id="${post.id}" type="button" title="Delete post"><i class="fas fa-trash"></i></button>` : ''}
                </div>
                <div class="post-content">
                    <p>${escapeHtml(post.decryptedContent)}</p>
                    ${mediaHtml}
                </div>
                ${summaryHtml}
                <div class="post-actions">
                    <div class="like-wrapper">
                        <button class="like-btn ${isLiked ? 'liked' : ''}" data-id="${post.id}">
                            <span class="reaction-emoji">${displayEmoji}</span>
                            <span class="like-count">${likeCount}</span>
                        </button>
                    </div>
                    <button class="comment-btn" data-id="${post.id}">
                        <i class="fas fa-comment"></i> <span>0</span>
                    </button>
                    <button class="share-btn" data-id="${post.id}">
                        <i class="fas fa-share"></i>
                    </button>
                </div>
            </div>
        `;
    }
    return html;
}

// ---- Shared: attach event listeners to posts ----
function attachPostEventListeners(feed) {
    // Render video thumbnails
    feed.querySelectorAll('.video-thumbnail-container').forEach(el => {
        const videoUrl = el.dataset.videoUrl;
        if (videoUrl) renderVideoThumbnail(el, videoUrl);
    });

    // Reaction summary click
    feed.querySelectorAll('.reaction-summary').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const postId = el.dataset.postId;
            openReactionModal(postId);
        });
    });

    // Like with emoji picker
    feed.querySelectorAll('.like-wrapper').forEach(wrapper => {
        const btn = wrapper.querySelector('.like-btn');
        const postId = btn.dataset.id;
        let picker = null;
        let timeout = null;

        const showPicker = () => {
            if (picker) return;
            picker = createEmojiPicker((emoji) => {
                toggleLikeAction(postId, btn, emoji);
                picker.remove();
                picker = null;
            });
            wrapper.appendChild(picker);
            keepPickerOnScreen(picker);
            requestAnimationFrame(() => {
                picker.style.opacity = '1';
                picker.style.pointerEvents = 'auto';
                picker.style.transform = 'translateY(0) scale(1)';
            });
            clearTimeout(timeout);
        };
        const hidePicker = () => {
            if (!picker) return;
            timeout = setTimeout(() => {
                picker.style.opacity = '0';
                picker.style.pointerEvents = 'none';
                picker.style.transform = 'translateY(10px) scale(0.85)';
                setTimeout(() => {
                    if (picker && picker.parentNode) picker.remove();
                    picker = null;
                }, 220);
            }, 2000);
        };

        wrapper.addEventListener('mouseenter', showPicker);
        wrapper.addEventListener('mouseleave', hidePicker);
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLikeAction(postId, btn);
        });
    });

    // Comment, Share, Delete
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
                .then(() => toast('Link copied!', 'info'))
                .catch(() => {});
        });
    });

    feed.querySelectorAll('.delete-post-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const postId = btn.dataset.id;
            if (!confirm('Delete this post?')) return;
            try {
                await deletePost(postId);
                toast('Post deleted', 'success');
                if (currentFeedType === 'user') {
                    await loadUserPosts(currentUser.id);
                } else {
                    await loadSavedPosts();
                }
            } catch (err) {
                toast('Failed to delete: ' + err.message, 'error');
            }
        });
    });

    // Click on post card – open modal
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

function toast(message, tone = 'info') {
    if (typeof window.toast === 'function') {
        window.toast(message, tone);
    } else {
        alert(message);
    }
}