// js/home-loader.js
import { fetchPosts, toggleLike, subscribeToPosts, deletePost, savePost, unsavePost, isPostSaved } from './home-sb.js';
import { getSupabaseClient } from './supabase.js';
import { renderVideoThumbnail } from './videoPlayer.js';
import { openPostView } from './postView.js';

let currentOffset = 0;
const PAGE_SIZE = 20;
let allPosts = [];
let isLoading = false;

const EMOJIS = ['❤️', '😊', '😂', '😮', '😢', '😡'];

// ---- Emoji reaction picker ----
// Anchored to the LEFT edge of its wrapper (not centered) so it grows
// rightward from the like button instead of straddling it and clipping
// off the left side of the screen/card.
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
    EMOJIS.forEach((emoji, i) => {
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

function keepPickerOnScreen(picker, wrapper) {
    // If the wrapper is close enough to the right edge that the picker
    // would overflow, flip the anchor to the right instead.
    requestAnimationFrame(() => {
        const rect = picker.getBoundingClientRect();
        if (rect.right > window.innerWidth - 8) {
            picker.style.left = 'auto';
            picker.style.right = '0';
            picker.style.transformOrigin = 'bottom right';
        }
    });
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
            keepPickerOnScreen(picker, wrapper);
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

    // ---- Comment, Save, Delete ----
    container.querySelectorAll('.comment-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const postId = btn.dataset.id;
            openPostView(postId); // NEW – opens the new modal
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

    // ---- Click on post body to open modal ----
    container.querySelectorAll('.post-body.clickable').forEach(el => {
        el.addEventListener('click', () => {
            const postId = el.dataset.id;
            openPostView(postId);
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

// ---- Export ----
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