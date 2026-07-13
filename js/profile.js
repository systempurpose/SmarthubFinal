// ============================================================
// profile.js – Social Profile (with media attach & delete)
// ============================================================

import { getSupabaseClient } from './supabase.js';
import { createPost, toggleLike, deletePost } from './home-sb.js';
import { uploadProfileImage, updateProfile } from './profile-sb.js';
import { uploadVideo } from './videoUpload.js';
import { getPublicVideoUrl } from './videoUtils.js';
import { renderVideoPlayer } from './videoPlayer.js';

let currentProfileUser = null;
let currentUser = null;

export async function renderProfile(container) {
    if (!container) {
        container = document.getElementById('homeContent') || document.getElementById('pageContent');
        if (!container) return;
    }

    // ---- Get user from localStorage ----
    try {
        const stored = localStorage.getItem('smarthub.user');
        if (stored) currentUser = JSON.parse(stored);
    } catch (e) {}

    if (!currentUser || !currentUser.id) {
        container.innerHTML = `
            <div style="padding:40px;text-align:center;">
                <p>Please log in to view your profile.</p>
                <button onclick="document.getElementById('loginBtn')?.click()" class="btn-primary">Login</button>
            </div>
        `;
        return;
    }

    const supabase = await getSupabaseClient();

    // ---- Fetch profile ----
    let { data: profile, error } = await supabase
        .from('social_profiles')
        .select('*')
        .eq('user_id', currentUser.id)
        .maybeSingle();

    if (error) {
        container.innerHTML = `<div style="padding:40px;text-align:center;color:red;">Error loading profile: ${error.message}</div>`;
        return;
    }

    // ---- Create profile if missing ----
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
                    <div style="padding:40px;text-align:center;color:red;">
                        Failed to create profile: ${insertError.message}
                        <button onclick="window.renderHome()" class="btn-primary">Go Home</button>
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

    const displayName = profile.display_name || 'User';
    const username = profile.username || 'user';
    const bio = profile.bio || 'No bio yet.';
    const avatarUrl = profile.avatar_url || '';
    const coverUrl = profile.cover_url || '';
    const joinDate = new Date(profile.created_at || Date.now()).toLocaleDateString();

    // ---- Build profile HTML ----
    const html = `
        <div class="profile-container" style="display:flex; flex-direction:column; height:100%; padding:20px 0;">
            <!-- Cover -->
            <div class="profile-cover" style="position:relative;height:200px;background:#e2e8f0;overflow:hidden;border-radius:16px 16px 0 0;">
                ${coverUrl ? `<img src="${coverUrl}" alt="Cover" style="width:100%;height:100%;object-fit:cover;">` : ''}
                <button class="change-cover-btn" style="position:absolute;bottom:12px;right:12px;background:rgba(0,0,0,0.6);color:#fff;border:none;border-radius:20px;padding:6px 14px;font-size:12px;cursor:pointer;">
                    <i class="fas fa-camera"></i> Change Cover
                </button>
                <input type="file" id="coverInput" accept="image/*" style="display:none;">
            </div>

            <!-- Avatar -->
            <div style="display:flex;align-items:flex-end;margin-top:-40px;padding:0 20px;">
                <div class="profile-avatar" style="position:relative;width:100px;height:100px;border-radius:50%;border:4px solid #fff;background:#c4c9d4;overflow:hidden;">
                    ${avatarUrl ? `<img src="${avatarUrl}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;">` : displayName[0].toUpperCase()}
                    <button class="change-avatar-btn" style="position:absolute;bottom:2px;right:2px;background:rgba(0,0,0,0.6);color:#fff;border:none;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;">
                        <i class="fas fa-camera"></i>
                    </button>
                    <input type="file" id="avatarInput" accept="image/*" style="display:none;">
                </div>
                <div style="margin-left:16px;flex:1;">
                    <h2 style="margin:0;font-size:22px;font-weight:700;">${displayName}</h2>
                    <p style="margin:0;color:#64748b;font-size:14px;">@${username}</p>
                    <p style="margin:4px 0 0;font-size:13px;color:#64748b;">Joined ${joinDate}</p>
                </div>
            </div>

            <!-- Bio -->
            <div style="padding:12px 20px;">
                <div style="display:flex;gap:8px;margin-bottom:8px;">
                    <input type="text" id="bioInput" value="${bio}" placeholder="Write your bio..." style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid #e2e8f0;font-size:14px;">
                    <button id="saveBioBtn" class="btn-primary" style="padding:8px 16px;border-radius:8px;font-size:13px;">Save</button>
                </div>
            </div>

            <!-- Post Input with media attach -->
            <div style="padding:0 20px 16px;">
                <div class="composer-card" style="border:1px solid #e2e8f0;border-radius:16px;padding:12px;">
                    <textarea id="profileComposer" rows="2" placeholder="What's on your mind?" style="width:100%;border:none;outline:none;resize:none;font-size:15px;font-family:inherit;"></textarea>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
                        <div class="composer-tools" style="display:flex;gap:6px;">
                            <button id="profileVideoBtn" title="Attach video" style="background:none;border:none;font-size:18px;cursor:pointer;color:#64748b;">
                                <i class="fas fa-video"></i>
                            </button>
                            <button id="profileImageBtn" title="Attach image" style="background:none;border:none;font-size:18px;cursor:pointer;color:#64748b;">
                                <i class="fas fa-image"></i>
                            </button>
                            <button id="profileGifBtn" title="Add GIF" style="background:none;border:none;font-size:18px;cursor:pointer;color:#64748b;">
                                <i class="fas fa-grin"></i>
                            </button>
                        </div>
                        <button id="profilePostBtn" class="composer-submit" style="background:#0d9488;border:none;color:#fff;padding:6px 18px;border-radius:20px;font-weight:600;cursor:pointer;">Post</button>
                    </div>
                    <input type="file" id="profileMediaInput" accept="video/*,image/*" style="display:none;">
                    <div id="profileUploadProgress" style="display:none;margin-top:8px;font-size:13px;color:#0d9488;"></div>
                </div>
            </div>

            <!-- User's Posts -->
            <div style="flex:1;padding:0 20px 20px;overflow-y:auto;">
                <h3 style="font-size:16px;font-weight:600;margin:0 0 12px;">Posts</h3>
                <div id="profileFeed"></div>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // ---- Load user's posts ----
    await loadUserPosts(currentUser.id);

    // ---- Profile update events ----
    document.querySelector('.change-avatar-btn')?.addEventListener('click', () => {
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

    document.querySelector('.change-cover-btn')?.addEventListener('click', () => {
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

    document.getElementById('saveBioBtn')?.addEventListener('click', async () => {
        const newBio = document.getElementById('bioInput').value.trim();
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

    let pendingMedia = null;

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
            progress.style.display = 'block';
            progress.textContent = 'Uploading media...';
            if (file.type.startsWith('video/')) {
                const result = await uploadVideo(file);
                pendingMedia = { url: result.url || result.storagePath, type: 'video' };
                progress.textContent = '✅ Video attached!';
            } else {
                const reader = new FileReader();
                const dataUrl = await new Promise((resolve) => {
                    reader.onload = (e) => resolve(e.target.result);
                    reader.readAsDataURL(file);
                });
                pendingMedia = { url: dataUrl, type: 'image' };
                progress.textContent = '✅ Image attached!';
            }
            setTimeout(() => { progress.style.display = 'none'; }, 3000);
        } catch (err) {
            progress.style.color = '#dc2626';
            progress.textContent = '❌ ' + err.message;
        } finally {
            mediaInput.value = '';
        }
    });

    postBtn.addEventListener('click', async () => {
        const text = composer.value.trim();
        if (!text && !pendingMedia) {
            toast('Please write something or attach media.', 'info');
            return;
        }

        let mediaUrl = null;
        let mediaType = null;
        if (pendingMedia) {
            mediaUrl = pendingMedia.url;
            mediaType = pendingMedia.type;
            pendingMedia = null;
        }

        postBtn.disabled = true;
        postBtn.textContent = 'Posting...';
        try {
            await createPost(text || '📎', mediaUrl, mediaType);
            composer.value = '';
            toast('Post published!', 'success');
            await loadUserPosts(currentUser.id);
        } catch (err) {
            toast('Failed to post: ' + err.message, 'error');
        } finally {
            postBtn.disabled = false;
            postBtn.textContent = 'Post';
        }
    });
}

// ---- Load user posts with media and delete ----
async function loadUserPosts(userId) {
    const feed = document.getElementById('profileFeed');
    if (!feed) return;

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
            feed.innerHTML = `<div style="text-align:center;padding:20px;color:#64748b;">No posts yet.</div>`;
            return;
        }

        const { decryptAndDecompress } = await import('./home-sb.js');
        for (const post of posts) {
            post.decryptedContent = await decryptAndDecompress(post.content);
        }

        let html = '';
        for (const post of posts) {
            const time = new Date(post.created_at).toLocaleDateString();
            const isOwner = currentUser && post.user_id === currentUser.id;
            const videoUrl = post.media_url && post.media_type === 'video' ? post.media_url : null;
            const imageUrl = post.media_url && post.media_type === 'image' ? post.media_url : null;

            let mediaHtml = '';
            if (videoUrl) {
                // Placeholder container for video player
                mediaHtml = `<div class="video-player-container" data-video-url="${escapeHtml(videoUrl)}" style="margin-top:8px;"></div>`;
            } else if (imageUrl) {
                mediaHtml = `<img src="${escapeHtml(imageUrl)}" alt="Media" style="max-width:100%;border-radius:12px;margin-top:8px;">`;
            }

            html += `
                <div class="post-card" data-id="${post.id}">
                    <div class="post-header">
                        <div class="post-avatar">
                            ${currentProfileUser?.avatar_url ? `<img src="${currentProfileUser.avatar_url}" alt="Avatar">` : (currentProfileUser?.display_name?.[0] || 'U').toUpperCase()}
                        </div>
                        <span class="post-user">${currentProfileUser?.display_name || 'User'}</span>
                        <span class="post-time">${time}</span>
                        ${isOwner ? `<button class="delete-post-btn" data-id="${post.id}" style="margin-left:auto;background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px;" title="Delete post"><i class="fas fa-trash"></i></button>` : ''}
                    </div>
                    <div class="post-content">
                        <p>${escapeHtml(post.decryptedContent)}</p>
                        ${mediaHtml}
                    </div>
                    <div class="post-actions">
                        <button class="like-btn" data-id="${post.id}">
                            <i class="fas fa-heart"></i> <span class="like-count">0</span>
                        </button>
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
        feed.innerHTML = html;

        // ---- Render video players ----
        const videoContainers = feed.querySelectorAll('.video-player-container');
        for (const container of videoContainers) {
            const videoUrl = container.dataset.videoUrl;
            if (videoUrl) {
                try {
                    await renderVideoPlayer(container, videoUrl, { controls: true });
                } catch (err) {
                    container.innerHTML = `<div style="color:red;padding:8px;">Failed to load video</div>`;
                    console.warn('Video render error:', err);
                }
            }
        }

        // ---- Attach event listeners ----
        const { toggleLike } = await import('./home-sb.js');

        feed.querySelectorAll('.like-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const postId = btn.dataset.id;
                try {
                    const result = await toggleLike(postId);
                    const countSpan = btn.querySelector('.like-count');
                    const current = parseInt(countSpan.textContent);
                    countSpan.textContent = result.action === 'liked' ? current + 1 : current - 1;
                    btn.classList.toggle('liked', result.action === 'liked');
                } catch (err) {
                    toast('Failed to like: ' + err.message, 'error');
                }
            });
        });

        feed.querySelectorAll('.share-btn').forEach(btn => {
            btn.addEventListener('click', () => {
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
                    await loadUserPosts(currentUser.id);
                } catch (err) {
                    toast('Failed to delete: ' + err.message, 'error');
                }
            });
        });

    } catch (err) {
        feed.innerHTML = `<div style="color:red;">Failed to load posts: ${err.message}</div>`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function toast(message, tone = 'info') {
    if (typeof window.toast === 'function') {
        window.toast(message, tone);
    } else {
        alert(message);
    }
}