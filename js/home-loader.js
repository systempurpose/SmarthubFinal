// ============================================================
// home-loader.js – Load and render posts with delete
// ============================================================

import { fetchPosts, toggleLike, addComment, subscribeToPosts, deletePost } from './home-sb.js';
import { getSupabaseClient } from './supabase.js';

let currentOffset = 0;
const PAGE_SIZE = 20;
let allPosts = [];
let isLoading = false;

export async function loadHomeFeed(containerId = 'homeFeed', append = false) {
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
        renderPosts(container, posts, append, currentUserId);
    } catch (err) {
        console.error('[loadHomeFeed] Error:', err);
        container.innerHTML = `<div class="error">❌ Failed to load feed: ${err.message}</div>`;
    } finally {
        isLoading = false;
    }
}

function renderPosts(container, posts, append, currentUserId) {
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

        let mediaHtml = '';
        if (post.media_url) {
            if (post.media_type === 'video') {
                mediaHtml = `<video controls style="max-width:100%;border-radius:12px;margin-top:8px;max-height:400px;">
                                <source src="${post.media_url}" type="video/mp4">
                                Your browser does not support the video tag.
                            </video>`;
            } else if (post.media_type === 'image') {
                mediaHtml = `<img src="${post.media_url}" alt="Media" style="max-width:100%;border-radius:12px;margin-top:8px;">`;
            }
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
                <div class="post-content">
                    <p>${escapeHtml(post.decryptedContent || '')}</p>
                    ${mediaHtml}
                </div>
                <div class="post-actions">
                    <button class="like-btn" data-id="${post.id}">
                        <i class="fas fa-heart"></i> <span class="like-count">${likes}</span>
                    </button>
                    <button class="comment-btn" data-id="${post.id}">
                        <i class="fas fa-comment"></i> <span>${comments}</span>
                    </button>
                    <button class="share-btn" data-id="${post.id}">
                        <i class="fas fa-share"></i>
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

    // Attach event listeners
    container.querySelectorAll('.like-btn').forEach(btn => {
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

    container.querySelectorAll('.comment-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const postId = btn.dataset.id;
            const composer = document.getElementById('composerText');
            if (composer) {
                composer.focus();
                composer.value = `@post_${postId} `;
                composer.dispatchEvent(new Event('input'));
            }
        });
    });

    container.querySelectorAll('.share-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const postId = btn.dataset.id;
            navigator.clipboard.writeText(`Check out this post on SmartHub: #${postId}`)
                .then(() => toast('Link copied!', 'info'))
                .catch(() => {});
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
                await loadHomeFeed('homeFeed', false);
            } catch (err) {
                toast('Failed to delete: ' + err.message, 'error');
            }
        });
    });
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

// ---- Real-time subscription ----
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
                loadHomeFeed('homeFeed', false);
            })
            .subscribe();
        return subscription;
    } catch (err) {
        console.warn('Failed to init realtime:', err);
        return null;
    }
}