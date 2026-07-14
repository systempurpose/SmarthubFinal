// js/home-loader.js
import { fetchPosts, toggleLike, addComment, subscribeToPosts, deletePost, fetchPostById, fetchComments, savePost, unsavePost, isPostSaved } from './home-sb.js';
import { getSupabaseClient } from './supabase.js';
import { renderVideoPlayer, renderVideoThumbnail } from './videoPlayer.js';

let currentOffset = 0;
const PAGE_SIZE = 20;
let allPosts = [];
let isLoading = false;
let modalPostId = null;

const EMOJIS = ['❤️', '😊', '😂', '😮', '😢', '😡'];

function createEmojiPicker(onSelect) {
    const picker = document.createElement('div');
    picker.className = 'emoji-picker';
    picker.style.cssText = `
        position:absolute; bottom:100%; left:50%; transform:translateX(-50%);
        background:white; border-radius:20px; padding:8px 12px;
        box-shadow:0 8px 30px rgba(0,0,0,0.2); display:flex; gap:8px;
        z-index:100; opacity:0; pointer-events:none;
        transition:opacity 0.2s ease, transform 0.2s ease;
        transform:translateX(-50%) translateY(10px);
    `;
    EMOJIS.forEach(emoji => {
        const btn = document.createElement('span');
        btn.textContent = emoji;
        btn.style.cssText = `
            font-size:24px; cursor:pointer; padding:4px 6px; border-radius:8px;
            transition:background 0.15s;
        `;
        btn.onmouseover = () => btn.style.background = '#f0f0f0';
        btn.onmouseout = () => btn.style.background = 'transparent';
        btn.onclick = (e) => { e.stopPropagation(); onSelect(emoji); };
        picker.appendChild(btn);
    });
    return picker;
}

export async function loadHomeFeed(containerId = 'homeContent', append = false) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn('[loadHomeFeed] Container not found:', containerId);
        return;
    }
    if (isLoading) return;
    isLoading = true;
    try {
        const posts = await fetchPosts(PAGE_SIZE, currentOffset);
        if (!append) {
            allPosts = posts;
            container.innerHTML = '';
        } else {
            allPosts = allPosts.concat(posts);
        }
        currentOffset += posts.length;
        const currentUser = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
        const currentUserId = currentUser?.id || null;
        await renderPosts(container, posts, append, currentUserId);
    } catch (err) {
        console.error('[loadHomeFeed] Error:', err);
        container.innerHTML = `<div class="error">❌ Failed to load feed: ${err.message}</div>`;
    } finally {
        isLoading = false;
    }
}

async function renderPosts(container, posts, append, currentUserId) {
    if (!posts || posts.length === 0) {
        if (!append) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comment"></i>
                    <h3>No posts yet</h3>
                    <p>Be the first to share a repair tip!</p>
                </div>
            `;
        }
        return;
    }

    let html = '';
    for (const post of posts) {
        const user = post.profiles || {};
        const avatar = user.avatar_url || post.user_id?.[0] || '?';
        const displayName = user.display_name || 'User';
        const username = user.username ? `@${user.username}` : '';
        const time = new Date(post.created_at).toLocaleDateString();
        const likes = post.likes_count?.[0]?.count || 0;
        const comments = post.comments_count?.[0]?.count || 0;
        const isOwner = currentUserId && post.user_id === currentUserId;
        const saved = await isPostSaved(post.id);

        const videoUrl = post.media_url && post.media_type === 'video' ? post.media_url : null;
        const imageUrl = post.media_url && post.media_type === 'image' ? post.media_url : null;

        let mediaHtml = '';
        if (videoUrl) {
            mediaHtml = `<div class="video-thumbnail-container" data-video-url="${escapeHtml(videoUrl)}" style="margin-top:8px;"></div>`;
        } else if (imageUrl) {
            mediaHtml = `<img src="${escapeHtml(imageUrl)}" alt="Media" style="max-width:100%;border-radius:12px;margin-top:8px;">`;
        }

        html += `
            <div class="post-card" data-id="${post.id}">
                <div class="post-header">
                    <div class="post-avatar">
                        ${avatar.startsWith('http') ? `<img src="${avatar}" alt="${displayName}">` : displayName[0].toUpperCase()}
                    </div>
                    <span class="post-user">${escapeHtml(displayName)}</span>
                    ${username ? `<span class="post-username">${escapeHtml(username)}</span>` : ''}
                    <span class="post-time">${time}</span>
                    ${isOwner ? `<button class="delete-post-btn" data-id="${post.id}" style="margin-left:auto;background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px;" title="Delete post"><i class="fas fa-trash"></i></button>` : ''}
                </div>
                <div class="post-body clickable" data-id="${post.id}" style="cursor:pointer;">
                    <div class="post-content">
                        <p>${escapeHtml(post.decryptedContent || '')}</p>
                        ${mediaHtml}
                    </div>
                </div>
                <div class="post-actions">
                    <div class="like-wrapper" style="position:relative;display:inline-block;">
                        <button class="like-btn" data-id="${post.id}" style="background:none;border:none;display:flex;align-items:center;gap:4px;font-size:14px;color:#555;cursor:pointer;transition:transform 0.2s;">
                            <i class="fas fa-heart"></i> <span class="like-count">${likes}</span>
                        </button>
                    </div>
                    <button class="comment-btn" data-id="${post.id}" style="background:none;border:none;display:flex;align-items:center;gap:4px;font-size:14px;color:#555;cursor:pointer;">
                        <i class="fas fa-comment"></i> <span>${comments}</span>
                    </button>
                    <button class="save-btn" data-id="${post.id}" style="background:none;border:none;display:flex;align-items:center;gap:4px;font-size:14px;color:#555;cursor:pointer;">
                        <i class="fas ${saved ? 'fa-bookmark' : 'fa-bookmark-o'}"></i>
                    </button>
                </div>
            </div>
        `;
    }

    if (append) {
        container.insertAdjacentHTML('beforeend', html);
    } else {
        container.innerHTML = html;
    }

    // ---- Render video thumbnails ----
    const thumbContainers = container.querySelectorAll('.video-thumbnail-container');
    for (const el of thumbContainers) {
        const videoUrl = el.dataset.videoUrl;
        if (videoUrl) {
            renderVideoThumbnail(el, videoUrl);
        }
    }

    // ---- Like with emoji picker ----
    container.querySelectorAll('.like-wrapper').forEach(wrapper => {
        const btn = wrapper.querySelector('.like-btn');
        const postId = btn.dataset.id;
        let picker = null;
        let timeout = null;

        const showPicker = () => {
            if (picker) return;
            picker = createEmojiPicker((emoji) => {
                toggleLikeAction(postId, btn);
                picker.remove();
                picker = null;
            });
            wrapper.appendChild(picker);
            requestAnimationFrame(() => {
                picker.style.opacity = '1';
                picker.style.pointerEvents = 'auto';
                picker.style.transform = 'translateX(-50%) translateY(0)';
            });
            clearTimeout(timeout);
        };
        const hidePicker = () => {
            if (!picker) return;
            timeout = setTimeout(() => {
                picker.style.opacity = '0';
                picker.style.pointerEvents = 'none';
                picker.style.transform = 'translateX(-50%) translateY(10px)';
                setTimeout(() => {
                    if (picker.parentNode) picker.remove();
                    picker = null;
                }, 250);
            }, 2000);
        };

        wrapper.addEventListener('mouseenter', showPicker);
        wrapper.addEventListener('mouseleave', hidePicker);
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLikeAction(postId, btn);
        });
    });

    // ---- Comment, Save, Delete, Click ----
    container.querySelectorAll('.comment-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const postId = btn.dataset.id;
            openPostModal(postId, true);
        });
    });

    container.querySelectorAll('.save-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const postId = btn.dataset.id;
            const icon = btn.querySelector('i');
            try {
                const saved = await isPostSaved(postId);
                if (saved) {
                    await unsavePost(postId);
                    icon.className = 'fas fa-bookmark-o';
                    toast('Post unsaved', 'info');
                } else {
                    await savePost(postId);
                    icon.className = 'fas fa-bookmark';
                    toast('Post saved!', 'success');
                }
            } catch (err) {
                toast('Failed: ' + err.message, 'error');
            }
        });
    });

    container.querySelectorAll('.delete-post-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const postId = btn.dataset.id;
            if (!confirm('Delete this post?')) return;
            try {
                await deletePost(postId);
                toast('Post deleted', 'success');
                currentOffset = 0;
                await loadHomeFeed('homeContent', false);
            } catch (err) {
                toast('Failed to delete: ' + err.message, 'error');
            }
        });
    });

    container.querySelectorAll('.post-body.clickable').forEach(el => {
        el.addEventListener('click', () => {
            const postId = el.dataset.id;
            openPostModal(postId);
        });
    });
}

async function toggleLikeAction(postId, btn) {
    try {
        const result = await toggleLike(postId);
        const countSpan = btn.querySelector('.like-count');
        const current = parseInt(countSpan.textContent);
        countSpan.textContent = result.action === 'liked' ? current + 1 : current - 1;
        btn.classList.toggle('liked', result.action === 'liked');
        btn.style.transform = 'scale(1.3)';
        setTimeout(() => btn.style.transform = 'scale(1)', 200);
    } catch (err) {
        toast('Failed to like: ' + err.message, 'error');
    }
}

function ensureModal() {
    let modal = document.getElementById('postModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'postModal';
        modal.className = 'modal';
        modal.style.cssText = 'display:none;z-index:999999;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:1000px;width:95%;max-height:90vh;background:white;border-radius:20px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(0,0,0,0.4);">
                <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #e1e8ed;">
                    <h3 style="margin:0;font-size:18px;">Post</h3>
                    <button id="closePostModal" style="background:none;border:none;font-size:28px;cursor:pointer;color:#999;">&times;</button>
                </div>
                <div id="postModalBody" style="flex:1;overflow-y:auto;display:flex;flex-direction:row;padding:16px 20px;">
                    <!-- Left column -->
                    <div id="modalLeft" style="flex:2;padding-right:20px;min-width:0;display:flex;flex-direction:column;">
                        <div id="modalUserInfo" style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"></div>
                        <div id="modalText" style="font-size:15px;line-height:1.6;color:#1a1a1a;margin-bottom:12px;"></div>
                        <div id="modalMedia" style="flex:1;"></div>
                    </div>
                    <!-- Right column -->
                    <div id="modalRight" style="flex:1;display:flex;flex-direction:column;border-left:1px solid #e1e8ed;padding-left:20px;">
                        <div id="modalComments" style="flex:1;overflow-y:auto;margin-bottom:12px;"></div>
                        <div id="modalActions" style="border-top:1px solid #e1e8ed;padding-top:12px;">
                            <div style="display:flex;gap:16px;margin-bottom:8px;">
                                <div class="like-wrapper" style="position:relative;display:inline-block;">
                                    <button class="like-btn" data-id="" style="background:none;border:none;display:flex;align-items:center;gap:4px;font-size:14px;color:#555;cursor:pointer;transition:transform 0.2s;">
                                        <i class="fas fa-heart"></i> <span class="like-count">0</span>
                                    </button>
                                </div>
                                <button class="save-btn" data-id="" style="background:none;border:none;display:flex;align-items:center;gap:4px;font-size:14px;color:#555;cursor:pointer;">
                                    <i class="fas fa-bookmark-o"></i>
                                </button>
                            </div>
                            <div style="display:flex;gap:8px;">
                                <input type="text" id="commentInput" placeholder="Write a comment..." style="flex:1;padding:8px 12px;border:1px solid #e2e8f0;border-radius:20px;outline:none;font-size:13px;">
                                <button id="postCommentBtn" class="btn-primary" style="padding:6px 16px;border-radius:20px;border:none;background:#0d9488;color:white;font-weight:600;cursor:pointer;">Post</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const closeBtn = modal.querySelector('#closePostModal');
        closeBtn.addEventListener('click', () => {
            stopVideoInModal(modal);
            modal.style.display = 'none';
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                stopVideoInModal(modal);
                modal.style.display = 'none';
            }
        });

        const commentInput = modal.querySelector('#commentInput');
        const commentBtn = modal.querySelector('#postCommentBtn');
        commentBtn.addEventListener('click', async () => {
            const text = commentInput.value.trim();
            if (!text || !modalPostId) return;
            try {
                await addComment(modalPostId, text);
                commentInput.value = '';
                toast('Comment added!', 'success');
                await refreshModal(modalPostId);
            } catch (err) {
                toast('Failed to add comment: ' + err.message, 'error');
            }
        });
        commentInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') commentBtn.click();
        });
    }
    return modal;
}

function stopVideoInModal(modal) {
    const video = modal.querySelector('video');
    if (video) {
        video.pause();
        video.currentTime = 0;
    }
}

async function openPostModal(postId, focusComment = false) {
    modalPostId = postId;
    const modal = ensureModal();
    modal.style.display = 'flex';
    await refreshModal(postId);
    if (focusComment) {
        const input = document.getElementById('commentInput');
        setTimeout(() => input.focus(), 300);
    }
}

async function refreshModal(postId) {
    const body = document.getElementById('postModalBody');
    const userInfoDiv = document.getElementById('modalUserInfo');
    const textDiv = document.getElementById('modalText');
    const mediaDiv = document.getElementById('modalMedia');
    const commentsDiv = document.getElementById('modalComments');
    const likeWrapper = body.querySelector('.like-wrapper');
    const likeBtn = body.querySelector('.like-btn');
    const saveBtn = body.querySelector('.save-btn');

    if (!body) return;
    try {
        const post = await fetchPostById(postId);
        if (!post) {
            body.innerHTML = '<div style="padding:20px;color:red;">Post not found.</div>';
            return;
        }
        const comments = await fetchComments(postId);
        const currentUser = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
        const isOwner = currentUser && post.user_id === currentUser.id;
        const saved = await isPostSaved(postId);

        // ---- User info & text above video ----
        userInfoDiv.innerHTML = `
            <div class="post-avatar" style="width:36px;height:36px;border-radius:50%;background:#c4c9d4;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;flex-shrink:0;">
                ${post.profiles?.avatar_url ? `<img src="${post.profiles.avatar_url}" style="width:100%;height:100%;border-radius:50%;">` : (post.profiles?.display_name?.[0] || 'U').toUpperCase()}
            </div>
            <div>
                <span style="font-weight:600;">${escapeHtml(post.profiles?.display_name || 'User')}</span>
                <span style="color:#999;font-size:13px;margin-left:8px;">${new Date(post.created_at).toLocaleString()}</span>
            </div>
            ${isOwner ? `<button class="delete-post-btn" data-id="${post.id}" style="margin-left:auto;background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px;"><i class="fas fa-trash"></i></button>` : ''}
        `;
        textDiv.innerHTML = `<p style="margin:0;">${escapeHtml(post.decryptedContent || '')}</p>`;

        // ---- Media (video/image) ----
        let mediaHtml = '';
        if (post.media_url) {
            if (post.media_type === 'video') {
                mediaHtml = `<div id="modalVideoContainer" data-video-url="${escapeHtml(post.media_url)}" style="margin:8px 0;"></div>`;
            } else if (post.media_type === 'image') {
                mediaHtml = `<img src="${escapeHtml(post.media_url)}" alt="Media" style="max-width:100%;border-radius:12px;margin:8px 0;">`;
            }
        }
        mediaDiv.innerHTML = mediaHtml;

        // ---- Render video with autoplay ----
        const videoContainer = document.getElementById('modalVideoContainer');
        if (videoContainer) {
            const videoUrl = videoContainer.dataset.videoUrl;
            if (videoUrl) {
                await renderVideoPlayer(videoContainer, videoUrl, { controls: true, autoplay: true });
            }
        }

        // ---- Comments ----
        let commentsHtml = '';
        if (comments.length === 0) {
            commentsHtml = '<p style="color:#999;font-size:14px;">No comments yet.</p>';
        } else {
            commentsHtml = comments.map(c => `
                <div style="padding:8px 0;border-bottom:1px solid #f0f0f0;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-weight:600;">${escapeHtml(c.user_name)}</span>
                        <span style="font-size:12px;color:#999;">${new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    <p style="margin:4px 0 0;font-size:14px;">${escapeHtml(c.decryptedContent)}</p>
                </div>
            `).join('');
        }
        commentsDiv.innerHTML = commentsHtml;

        // ---- Like button with emoji picker ----
        likeBtn.dataset.id = post.id;
        likeBtn.querySelector('.like-count').textContent = post.likes_count || 0;
        likeBtn.querySelector('i').className = `fas ${post.userLiked ? 'fa-heart liked' : 'fa-heart'}`;
        likeBtn.classList.toggle('liked', post.userLiked || false);

        // Emoji picker for modal like
        let picker = null;
        let timeout = null;
        const showPicker = () => {
            if (picker) return;
            picker = createEmojiPicker((emoji) => {
                toggleLikeAction(post.id, likeBtn);
                picker.remove();
                picker = null;
            });
            likeWrapper.appendChild(picker);
            requestAnimationFrame(() => {
                picker.style.opacity = '1';
                picker.style.pointerEvents = 'auto';
                picker.style.transform = 'translateX(-50%) translateY(0)';
            });
            clearTimeout(timeout);
        };
        const hidePicker = () => {
            if (!picker) return;
            timeout = setTimeout(() => {
                picker.style.opacity = '0';
                picker.style.pointerEvents = 'none';
                picker.style.transform = 'translateX(-50%) translateY(10px)';
                setTimeout(() => {
                    if (picker.parentNode) picker.remove();
                    picker = null;
                }, 250);
            }, 2000);
        };
        likeWrapper.addEventListener('mouseenter', showPicker);
        likeWrapper.addEventListener('mouseleave', hidePicker);
        likeBtn.onclick = (e) => {
            e.stopPropagation();
            toggleLikeAction(post.id, likeBtn);
        };

        // ---- Save button ----
        saveBtn.dataset.id = post.id;
        const saveIcon = saveBtn.querySelector('i');
        saveIcon.className = saved ? 'fas fa-bookmark' : 'fas fa-bookmark-o';
        saveBtn.onclick = async (e) => {
            e.stopPropagation();
            const postId = saveBtn.dataset.id;
            try {
                const savedNow = await isPostSaved(postId);
                if (savedNow) {
                    await unsavePost(postId);
                    saveIcon.className = 'fas fa-bookmark-o';
                    toast('Post unsaved', 'info');
                } else {
                    await savePost(postId);
                    saveIcon.className = 'fas fa-bookmark';
                    toast('Post saved!', 'success');
                }
            } catch (err) {
                toast('Failed: ' + err.message, 'error');
            }
        };

        // ---- Delete ----
        const deleteBtn = userInfoDiv.querySelector('.delete-post-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const postId = deleteBtn.dataset.id;
                if (!confirm('Delete this post?')) return;
                try {
                    await deletePost(postId);
                    toast('Post deleted', 'success');
                    document.getElementById('postModal').style.display = 'none';
                    currentOffset = 0;
                    await loadHomeFeed('homeContent', false);
                } catch (err) {
                    toast('Failed to delete: ' + err.message, 'error');
                }
            });
        }

    } catch (err) {
        body.innerHTML = `<div style="padding:20px;color:red;">Failed to load post: ${err.message}</div>`;
        console.error('Modal refresh error:', err);
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

// ---- EXPORT initRealtimeFeed ----
export function initRealtimeFeed() {
    try {
        const supabase = getSupabaseClient();
        if (!supabase || typeof supabase.channel !== 'function') {
            console.warn('Realtime not available');
            return null;
        }
        const subscription = supabase
            .channel('public:posts')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => {
                loadHomeFeed('homeContent', false);
            })
            .subscribe();
        return subscription;
    } catch (err) {
        console.warn('Failed to init realtime:', err);
        return null;
    }
}