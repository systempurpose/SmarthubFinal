// ============================================================
// home-loader.js – Load posts from Supabase and render feed
// ============================================================

import { fetchPosts, toggleLike, addComment, subscribeToPosts } from './home-sb.js';
import { getSupabaseClient } from './supabase.js';

let currentOffset = 0;
const PAGE_SIZE = 20;
let allPosts = [];
let isLoading = false;
let hasMore = true;

// ---- Load the feed ----
export async function loadHomeFeed(containerId = 'homeFeed', append = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (isLoading) return;
    isLoading = true;

    try {
        const posts = await fetchPosts(PAGE_SIZE, currentOffset);
        if (posts.length < PAGE_SIZE) hasMore = false;

        if (!append) {
            allPosts = posts;
            container.innerHTML = '';
        } else {
            allPosts = allPosts.concat(posts);
        }
        currentOffset += posts.length;

        renderPosts(container, posts, append);
    } catch (err) {
        container.innerHTML = `<div class="error">❌ Failed to load feed: ${err.message}</div>`;
    } finally {
        isLoading = false;
    }
}

// ---- Render posts (reuses the existing renderPosts logic from home.js) ----
function renderPosts(container, posts, append) {
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
        const username = user.username ? `@${user.username}` : '@user';
        const time = new Date(post.created_at).toLocaleDateString();
        const likes = post.likes_count?.[0]?.count || 0;
        const comments = post.comments_count?.[0]?.count || 0;

        html += `
            <div class="post-card" data-id="${post.id}">
                <div class="post-header">
                    <div class="post-avatar">
                        ${avatar.startsWith('http') ? `<img src="${avatar}" alt="${displayName}">` : displayName[0].toUpperCase()}
                    </div>
                    <span class="post-user">${escapeHtml(displayName)}</span>
                    <span class="post-username">${escapeHtml(username)}</span>
                    <span class="post-time">${time}</span>
                </div>
                <div class="post-content">
                    <p>${escapeHtml(post.decryptedContent || '')}</p>
                    ${post.media_url ? `<div class="post-media"><img src="${post.media_url}" alt="Media" style="max-width:100%;border-radius:12px;margin-top:8px;"></div>` : ''}
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

    // Attach event listeners for likes, comments, share
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
                alert('Failed to like: ' + err.message);
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
                .then(() => alert('Link copied!'))
                .catch(() => {});
        });
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ---- Real-time subscription (with fallback) ----
export function initRealtimeFeed() {
    try {
        const supabase = getSupabaseClient();
        // Check if the client supports realtime
        if (!supabase || typeof supabase.channel !== 'function') {
            console.warn('Realtime not available: supabase.channel is not a function');
            return null;
        }

        const subscription = supabase
            .channel('public:posts')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, (payload) => {
                if (payload.eventType === 'INSERT') {
                    // Reload feed when a new post is inserted
                    loadHomeFeed('homeFeed', false);
                }
            })
            .subscribe();
        return subscription;
    } catch (err) {
        console.warn('Failed to initialize realtime feed:', err);
        return null;
    }
}