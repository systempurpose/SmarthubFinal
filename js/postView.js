// js/postView.js
import { getSupabaseClient } from './supabase.js';
import { toggleLike, addComment, deletePost } from './home-sb.js';
import { renderVideoPlayer } from './videoPlayer.js';
import { getPublicVideoUrl } from './videoUtils.js';

/**
 * Open a modal showing a single post with comments and reactions.
 * @param {string} postId - The post ID to view.
 */
export async function openPostView(postId) {
    const supabase = await getSupabaseClient();
    const currentUser = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!currentUser) {
        alert('Please log in to view this post.');
        return;
    }

    // ---- 1. Fetch post data ----
    const { data: post, error: postErr } = await supabase
        .from('posts')
        .select('*, social_profiles(user_id, display_name, avatar_url, username)')
        .eq('id', postId)
        .maybeSingle();
    if (postErr || !post) {
        alert('Post not found.');
        return;
    }

    // Decrypt content
    const { decryptAndDecompress } = await import('./home-sb.js');
    let decryptedContent = '';
    try {
        decryptedContent = await decryptAndDecompress(post.content);
    } catch (e) {
        decryptedContent = '[Unable to decrypt]';
    }

    const user = post.social_profiles || {};
    const displayName = user.display_name || 'User';
    const username = user.username || '';
    const avatarUrl = user.avatar_url || '';

    // ---- 2. Fetch comments ----
    const { data: comments, error: commentsErr } = await supabase
        .from('comments')
        .select('*, social_profiles(user_id, display_name, avatar_url, username)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
    if (commentsErr) console.warn('Could not fetch comments:', commentsErr);

    // ---- 3. Check if current user liked this post ----
    const { data: likeData } = await supabase
        .from('likes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', currentUser.id)
        .maybeSingle();
    const userLiked = !!likeData;

    // ---- 4. Build modal HTML ----
    const modal = document.createElement('div');
    modal.className = 'modal post-view-modal';
    modal.style.cssText = `
        display: flex;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.6);
        backdrop-filter: blur(6px);
        align-items: center;
        justify-content: center;
        z-index: 100000;
    `;

    const isOwner = currentUser && post.user_id === currentUser.id;

    // Media HTML
    let mediaHtml = '';
    if (post.media_url) {
        if (post.media_type === 'video') {
            mediaHtml = `<div class="post-view-media video-container" style="margin-top:12px;border-radius:12px;overflow:hidden;background:#000;max-height:400px;display:flex;align-items:center;justify-content:center;">
                            <video controls style="max-width:100%;max-height:400px;width:auto;border-radius:12px;" src="${post.media_url}"></video>
                         </div>`;
            // Use renderVideoPlayer for encryption – but we need to pass container, not video tag.
            // We'll use a placeholder and call renderVideoPlayer after mount.
        } else if (post.media_type === 'image') {
            mediaHtml = `<img src="${post.media_url}" alt="Media" style="max-width:100%;border-radius:12px;margin-top:12px;">`;
        }
    }

    // Comments HTML
    let commentsHtml = '';
    if (comments && comments.length) {
        commentsHtml = comments.map(c => {
            const cUser = c.social_profiles || {};
            const cAvatar = cUser.avatar_url || '';
            const cName = cUser.display_name || 'User';
            const cUsername = cUser.username || '';
            const cTime = new Date(c.created_at).toLocaleDateString();
            // Decrypt comment content (if encrypted)
            let cContent = c.content;
            // Since comments are also encrypted, we need to decrypt.
            // For now, we'll assume they are encrypted – we'll decrypt inline.
            // We'll handle decryption later in JS.
            return `<div class="comment-item" style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #f0f0f0;">
                        <div class="comment-avatar" style="width:32px;height:32px;border-radius:50%;background:#c4c9d4;flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:14px;">
                            ${cAvatar ? `<img src="${cAvatar}" style="width:100%;height:100%;object-fit:cover;">` : (cName[0] || 'U').toUpperCase()}
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                                <span style="font-weight:600;font-size:14px;">${escapeHtml(cName)}</span>
                                <span style="color:#64748b;font-size:12px;">@${escapeHtml(cUsername)}</span>
                                <span style="color:#94a3b8;font-size:11px;">${cTime}</span>
                            </div>
                            <div style="font-size:14px;color:#1e293b;margin-top:2px;" class="comment-content" data-comment-id="${c.id}">${escapeHtml(cContent)}</div>
                        </div>
                    </div>`;
        }).join('');
    } else {
        commentsHtml = `<div style="color:#94a3b8;padding:20px 0;text-align:center;">No comments yet. Be the first!</div>`;
    }

    modal.innerHTML = `
        <div class="modal-content" style="background:white;border-radius:20px;max-width:600px;width:95%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <!-- Header -->
            <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;background:#fafafa;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <div class="post-avatar" style="width:36px;height:36px;border-radius:50%;background:#c4c9d4;overflow:hidden;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;">
                        ${avatarUrl ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : (displayName[0] || 'U').toUpperCase()}
                    </div>
                    <div>
                        <div style="font-weight:600;font-size:15px;">${escapeHtml(displayName)}</div>
                        <div style="font-size:12px;color:#64748b;">@${escapeHtml(username)} · ${new Date(post.created_at).toLocaleDateString()}</div>
                    </div>
                    ${isOwner ? `<button class="delete-post-modal-btn" data-id="${post.id}" style="margin-left:auto;background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px;" title="Delete post"><i class="fas fa-trash"></i></button>` : ''}
                </div>
                <button class="close-modal-btn" style="background:none;border:none;font-size:28px;cursor:pointer;color:#64748b;">&times;</button>
            </div>

            <!-- Body (scrollable) -->
            <div style="flex:1;overflow-y:auto;padding:20px;">
                <!-- Post content -->
                <div class="post-content" style="font-size:15px;line-height:1.6;color:#1e293b;">
                    <p>${escapeHtml(decryptedContent)}</p>
                </div>
                ${mediaHtml}
                <!-- Video placeholder for encrypted videos -->
                ${post.media_type === 'video' ? `<div class="video-player-container" data-video-url="${post.media_url}" style="margin-top:12px;"></div>` : ''}

                <!-- Like and share buttons -->
                <div style="display:flex;gap:16px;margin-top:16px;padding-top:12px;border-top:1px solid #e2e8f0;">
                    <button id="likeBtn" class="${userLiked ? 'liked' : ''}" data-post-id="${post.id}" style="display:flex;align-items:center;gap:6px;background:none;border:none;font-size:15px;color:${userLiked ? '#e0245e' : '#64748b'};cursor:pointer;padding:4px 10px;border-radius:20px;transition:background 0.15s;">
                        <i class="fas fa-heart"></i> <span id="likeCount">${post.likes_count?.[0]?.count || 0}</span>
                    </button>
                    <button id="shareBtn" style="display:flex;align-items:center;gap:6px;background:none;border:none;font-size:15px;color:#64748b;cursor:pointer;padding:4px 10px;border-radius:20px;">
                        <i class="fas fa-share-alt"></i> Share
                    </button>
                </div>

                <!-- Comments section -->
                <div style="margin-top:20px;border-top:1px solid #e2e8f0;padding-top:16px;">
                    <h4 style="font-size:16px;font-weight:600;margin:0 0 12px;">Comments</h4>
                    <div id="commentsContainer">${commentsHtml}</div>
                </div>
            </div>

            <!-- Footer (comment input) -->
            <div style="padding:12px 20px;border-top:1px solid #e2e8f0;display:flex;gap:10px;background:#fafafa;">
                <input type="text" id="commentInput" placeholder="Write a comment..." style="flex:1;padding:8px 14px;border:1px solid #e2e8f0;border-radius:20px;font-size:14px;outline:none;">
                <button id="commentSubmitBtn" style="background:#0d9488;color:#fff;border:none;border-radius:20px;padding:8px 20px;font-weight:600;cursor:pointer;">Post</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // ---- Close modal ----
    const closeModal = () => modal.remove();
    modal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // ---- Render video player if video ----
    if (post.media_type === 'video') {
        const videoContainer = modal.querySelector('.video-player-container');
        if (videoContainer) {
            try {
                await renderVideoPlayer(videoContainer, post.media_url, { controls: true });
            } catch (err) {
                console.warn('Failed to render video player:', err);
                videoContainer.innerHTML = `<div style="color:red;padding:8px;">Video playback not available</div>`;
            }
        }
    }

    // ---- Like button ----
    const likeBtn = modal.querySelector('#likeBtn');
    const likeCount = modal.querySelector('#likeCount');
    likeBtn.addEventListener('click', async () => {
        try {
            const result = await toggleLike(post.id);
            const isLiked = result.action === 'liked';
            likeBtn.classList.toggle('liked', isLiked);
            likeBtn.style.color = isLiked ? '#e0245e' : '#64748b';
            const current = parseInt(likeCount.textContent);
            likeCount.textContent = isLiked ? current + 1 : current - 1;
        } catch (err) {
            alert('Failed to like: ' + err.message);
        }
    });

    // ---- Share button ----
    modal.querySelector('#shareBtn').addEventListener('click', () => {
        const url = window.location.href + '?post=' + post.id;
        if (navigator.share) {
            navigator.share({ title: 'Check out this post', text: decryptedContent, url });
        } else {
            navigator.clipboard.writeText(url).then(() => alert('Link copied!'));
        }
    });

    // ---- Delete post ----
    const deleteBtn = modal.querySelector('.delete-post-modal-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Delete this post?')) return;
            try {
                await deletePost(post.id);
                closeModal();
                // Reload feed if on home page
                const activePage = document.querySelector('.bottom-nav-item.active')?.dataset.page;
                if (activePage === 'home') {
                    currentOffset = 0;
                    loadHomeFeed('homeContent');
                } else if (activePage === 'profile') {
                    // reload profile feed (if we have a function)
                    if (typeof window.loadUserPosts === 'function') {
                        // we'd need to pass userId
                    }
                }
                alert('Post deleted.');
            } catch (err) {
                alert('Failed to delete: ' + err.message);
            }
        });
    }

    // ---- Comment submit ----
    const commentInput = modal.querySelector('#commentInput');
    const commentSubmit = modal.querySelector('#commentSubmitBtn');
    commentSubmit.addEventListener('click', async () => {
        const text = commentInput.value.trim();
        if (!text) return;
        try {
            const newComment = await addComment(post.id, text);
            // Refresh comments
            const { data: freshComments } = await supabase
                .from('comments')
                .select('*, social_profiles(user_id, display_name, avatar_url, username)')
                .eq('post_id', post.id)
                .order('created_at', { ascending: true });
            if (freshComments) {
                // Render comments again
                renderComments(modal.querySelector('#commentsContainer'), freshComments);
                commentInput.value = '';
            }
        } catch (err) {
            alert('Failed to comment: ' + err.message);
        }
    });

    // ---- Decrypt comments ----
    // We'll decrypt comment content on the fly.
    async function decryptCommentContent(comment) {
        try {
            const decrypted = await decryptAndDecompress(comment.content);
            return decrypted;
        } catch (e) {
            return comment.content;
        }
    }

    async function renderComments(container, commentsData) {
        if (!commentsData || commentsData.length === 0) {
            container.innerHTML = `<div style="color:#94a3b8;padding:20px 0;text-align:center;">No comments yet. Be the first!</div>`;
            return;
        }
        let html = '';
        for (const c of commentsData) {
            const cUser = c.social_profiles || {};
            const cAvatar = cUser.avatar_url || '';
            const cName = cUser.display_name || 'User';
            const cUsername = cUser.username || '';
            const cTime = new Date(c.created_at).toLocaleDateString();
            let cContent = c.content;
            try {
                cContent = await decryptAndDecompress(c.content);
            } catch (e) {}
            html += `
                <div class="comment-item" style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #f0f0f0;">
                    <div class="comment-avatar" style="width:32px;height:32px;border-radius:50%;background:#c4c9d4;flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:14px;">
                        ${cAvatar ? `<img src="${cAvatar}" style="width:100%;height:100%;object-fit:cover;">` : (cName[0] || 'U').toUpperCase()}
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                            <span style="font-weight:600;font-size:14px;">${escapeHtml(cName)}</span>
                            <span style="color:#64748b;font-size:12px;">@${escapeHtml(cUsername)}</span>
                            <span style="color:#94a3b8;font-size:11px;">${cTime}</span>
                        </div>
                        <div style="font-size:14px;color:#1e293b;margin-top:2px;">${escapeHtml(cContent)}</div>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    }

    // ---- Initial comment render with decryption ----
    if (comments && comments.length) {
        await renderComments(modal.querySelector('#commentsContainer'), comments);
    }

    // Also update like count from DB (we already have it)
    // We'll update it after render.

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}