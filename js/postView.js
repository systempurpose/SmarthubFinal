// js/postView.js
import { getSupabaseClient } from './supabase.js';
import { toggleLike, addComment, deletePost, fetchPostById, fetchComments } from './home-sb.js';
import { renderVideoPlayer } from './videoPlayer.js';

const EMOJIS = ['❤️', '😊', '😂', '😮', '😢', '😡'];

// ---- Inject modal styles once ----
function ensureStyles() {
    if (document.getElementById('pv-styles')) return;
    const style = document.createElement('style');
    style.id = 'pv-styles';
    style.textContent = `
        .pv-overlay {
            position: fixed; inset: 0; z-index: 100000;
            background: rgba(15, 23, 42, 0.55);
            backdrop-filter: blur(6px);
            display: flex; align-items: center; justify-content: center;
            padding: 20px;
            animation: pv-fade-in 0.15s ease;
        }
        @keyframes pv-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pv-fade-out { to { opacity: 0; } }
        @keyframes pv-pop-in { from { opacity: 0; transform: scale(0.97) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes pv-pop-out { to { opacity: 0; transform: scale(0.97) translateY(6px); } }
        @keyframes pv-spin { to { transform: rotate(360deg); } }
        @keyframes pv-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
        @keyframes pv-content-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

        .pv-overlay.pv-closing { animation: pv-fade-out 0.15s ease forwards; }
        .pv-overlay.pv-closing .pv-card { animation: pv-pop-out 0.15s ease forwards; }

        .pv-card {
            background: #fff; border-radius: 20px; overflow: hidden;
            width: 100%; max-width: 980px; max-height: 90vh;
            display: flex; flex-direction: column;
            box-shadow: 0 24px 64px rgba(15, 23, 42, 0.35);
            animation: pv-pop-in 0.18s ease;
        }

        .pv-header {
            flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
            gap: 12px; padding: 16px 20px; border-bottom: 1px solid #e2e8f0; background: #fafbfc;
        }
        .pv-user { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .pv-avatar {
            width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; overflow: hidden;
            display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700;
            background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%);
        }
        .pv-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .pv-name { font-weight: 700; font-size: 14.5px; color: #0f172a; line-height: 1.3; }
        .pv-meta { font-size: 12.5px; color: #64748b; line-height: 1.3; }
        .pv-header-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
        .pv-icon-btn {
            background: none; border: none; cursor: pointer; color: #64748b;
            width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
            font-size: 15px; transition: background 0.15s ease, color 0.15s ease, transform 0.12s ease;
        }
        .pv-icon-btn:hover { background: #f1f5f9; color: #0f172a; }
        .pv-icon-btn:active { transform: scale(0.9); }
        .pv-icon-btn.pv-danger:hover { background: #fce8ee; color: #dc2626; }
        .pv-close-btn { font-size: 22px; }

        .pv-body { flex: 1; overflow: hidden; display: flex; }
        .pv-left { flex: 1.6; min-width: 0; overflow-y: auto; padding: 20px 20px 24px; scrollbar-width: none; -ms-overflow-style: none; }
        .pv-left::-webkit-scrollbar { display: none; }
        .pv-right {
            flex: 1; min-width: 260px; max-width: 340px; display: flex; flex-direction: column;
            border-left: 1px solid #e2e8f0; background: #fdfdfd;
        }
        .pv-content-in { animation: pv-content-in 0.22s ease; }

        /* ---- Loading state (shown the instant the modal opens) ---- */
        .pv-loading-body { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 320px; }
        .pv-spinner {
            width: 40px; height: 40px; border-radius: 50%;
            border: 3px solid #e2e8f0; border-top-color: #0d9488;
            animation: pv-spin 0.7s linear infinite;
        }
        .pv-skel-avatar {
            width: 40px; height: 40px; border-radius: 50%;
            background: linear-gradient(90deg, #eef1f4 25%, #e4e8ec 37%, #eef1f4 63%);
            background-size: 400% 100%; animation: pv-shimmer 1.4s ease infinite;
        }
        .pv-skel-line {
            border-radius: 6px;
            background: linear-gradient(90deg, #eef1f4 25%, #e4e8ec 37%, #eef1f4 63%);
            background-size: 400% 100%; animation: pv-shimmer 1.4s ease infinite;
        }
        .pv-error-body {
            flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
            gap: 10px; padding: 40px 24px; color: #64748b; text-align: center; min-height: 280px;
        }
        .pv-error-body i { font-size: 28px; color: #dc2626; }
        .pv-error-body p { margin: 0; font-size: 14px; }

        .pv-post-text { font-size: 15.5px; line-height: 1.65; color: #1e293b; margin: 0 0 4px; white-space: pre-wrap; }
        .pv-media { margin-top: 14px; border-radius: 14px; overflow: hidden; background: #000; }
        .pv-media img { display: block; width: 100%; max-height: 60vh; object-fit: contain; background: #000; }

        .pv-comments-head {
            padding: 16px 18px 10px; font-size: 14.5px; font-weight: 700; color: #0f172a;
            display: flex; align-items: center; gap: 6px; flex-shrink: 0;
        }
        .pv-comments-list { flex: 1; overflow-y: auto; padding: 0 18px; scrollbar-width: none; -ms-overflow-style: none; }
        .pv-comments-list::-webkit-scrollbar { display: none; }
        .pv-comment {
            display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid #f1f5f9;
        }
        .pv-comment:last-child { border-bottom: none; }
        .pv-comment-avatar {
            width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; overflow: hidden;
            display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 12.5px;
            background: linear-gradient(135deg, #64748b 0%, #94a3b8 100%);
        }
        .pv-comment-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .pv-comment-name { font-weight: 700; font-size: 13.5px; color: #0f172a; }
        .pv-comment-username { color: #94a3b8; font-size: 12px; }
        .pv-comment-time { color: #cbd5e1; font-size: 11px; }
        .pv-comment-text { font-size: 13.5px; color: #334155; margin-top: 2px; line-height: 1.5; }
        .pv-empty {
            color: #94a3b8; text-align: center; padding: 36px 12px; font-size: 13.5px;
            display: flex; flex-direction: column; align-items: center; gap: 8px;
        }
        .pv-empty i { font-size: 26px; color: #cbd5e1; }

        .pv-actions { flex-shrink: 0; border-top: 1px solid #e2e8f0; padding: 12px 18px 16px; background: #fff; }
        .pv-action-row { display: flex; gap: 6px; margin-bottom: 10px; }
        .pv-action-btn {
            display: flex; align-items: center; gap: 6px; background: none; border: 1px solid transparent;
            font-size: 14px; color: #64748b; cursor: pointer; padding: 6px 12px; border-radius: 20px;
            font-weight: 600; transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.12s ease;
        }
        .pv-action-btn:hover { background: #ccfbf1; color: #0d9488; }
        .pv-action-btn:active { transform: scale(0.94); }
        .pv-action-btn.liked { color: #e0245e; }
        .pv-action-btn.liked:hover { background: #fce8ee; color: #e0245e; }
        .pv-action-btn i { transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .pv-action-btn.liked i { transform: scale(1.15); }

        /* ---- Reaction picker (hover the like button) ---- */
        .pv-like-wrapper { position: relative; display: inline-block; }
        .pv-emoji-picker {
            position: absolute; bottom: calc(100% + 10px); left: 0;
            background: #fff; border-radius: 24px; padding: 8px 10px;
            box-shadow: 0 14px 34px rgba(15, 23, 42, 0.18), 0 2px 8px rgba(15, 23, 42, 0.08);
            display: flex; gap: 2px; align-items: center;
            z-index: 20; opacity: 0; pointer-events: none;
            transform-origin: bottom left;
            transform: translateY(10px) scale(0.85);
            transition: opacity 0.18s cubic-bezier(0.2, 0.7, 0.3, 1), transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .pv-emoji-picker.visible { opacity: 1; pointer-events: auto; transform: translateY(0) scale(1); }
        .pv-emoji-btn {
            font-size: 22px; line-height: 1; cursor: pointer; padding: 6px 7px; border-radius: 12px;
            display: inline-flex; align-items: center; justify-content: center;
            transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.15s ease;
        }
        .pv-emoji-btn:hover { background: #f1f5f9; transform: scale(1.4) translateY(-5px); }

        .pv-comment-form { display: flex; gap: 8px; }
        .pv-comment-input {
            flex: 1; padding: 9px 14px; border: 1px solid #e2e8f0; border-radius: 20px; font-size: 13.5px;
            outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .pv-comment-input:focus { border-color: #0d9488; box-shadow: 0 0 0 3px #ccfbf1; }
        .pv-comment-submit {
            background: #0d9488; color: #fff; border: none; border-radius: 20px; padding: 9px 18px;
            font-weight: 700; font-size: 13.5px; cursor: pointer; transition: background 0.15s ease, transform 0.12s ease;
            flex-shrink: 0;
        }
        .pv-comment-submit:hover:not(:disabled) { background: #0f766e; }
        .pv-comment-submit:active:not(:disabled) { transform: scale(0.96); }
        .pv-comment-submit:disabled { opacity: 0.5; cursor: not-allowed; }

        @media (max-width: 720px) {
            .pv-overlay { padding: 0; }
            .pv-card { max-width: 100%; max-height: 100vh; height: 100%; border-radius: 0; }
            .pv-body { flex-direction: column; }
            .pv-left { flex: none; max-height: 45vh; }
            .pv-right { max-width: none; border-left: none; border-top: 1px solid #e2e8f0; }
        }
    `;
    document.head.appendChild(style);
}

// ---- Reaction picker (shared look with the rest of the app) ----
// Anchored to the LEFT edge of its wrapper so it grows rightward from
// the like button instead of straddling it and clipping off-screen.
function createReactionPicker(onSelect) {
    const picker = document.createElement('div');
    picker.className = 'pv-emoji-picker';
    EMOJIS.forEach(emoji => {
        const btn = document.createElement('span');
        btn.className = 'pv-emoji-btn';
        btn.textContent = emoji;
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

function attachReactionPicker(wrapper, btn, onReact) {
    let picker = null;
    let hideTimeout = null;

    const show = () => {
        if (picker) return;
        picker = createReactionPicker((emoji) => {
            onReact(emoji);
            hide(true);
        });
        wrapper.appendChild(picker);
        keepPickerOnScreen(picker);
        requestAnimationFrame(() => picker.classList.add('visible'));
        clearTimeout(hideTimeout);
    };
    const hide = (immediate = false) => {
        if (!picker) return;
        const remove = () => {
            picker.classList.remove('visible');
            setTimeout(() => {
                if (picker && picker.parentNode) picker.remove();
                picker = null;
            }, 220);
        };
        if (immediate) { remove(); return; }
        hideTimeout = setTimeout(remove, 2000);
    };

    wrapper.addEventListener('mouseenter', show);
    wrapper.addEventListener('mouseleave', () => hide(false));
}

/**
 * Open a modal showing a single post with comments and reactions.
 * Shows a loading state immediately, then swaps in the real content
 * once the post/comments/like-status have been fetched.
 * @param {string} postId - The post ID to view.
 */
export async function openPostView(postId) {
    ensureStyles();

    // Prevent stacking multiple viewers if the user clicks another post
    // while one is still opening.
    document.querySelectorAll('.pv-overlay').forEach(el => el.remove());

    const currentUser = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!currentUser) {
        alert('Please log in to view this post.');
        return;
    }

    // ---- 1. Build the modal shell immediately with a loading state ----
    const modal = document.createElement('div');
    modal.className = 'pv-overlay';
    modal.innerHTML = `
        <div class="pv-card">
            <div class="pv-header">
                <div class="pv-user">
                    <div class="pv-skel-avatar"></div>
                    <div style="min-width:0;">
                        <div class="pv-skel-line" style="width:130px;height:12px;"></div>
                        <div class="pv-skel-line" style="width:90px;height:10px;margin-top:7px;"></div>
                    </div>
                </div>
                <div class="pv-header-actions">
                    <button class="pv-icon-btn pv-close-btn close-modal-btn" title="Close">&times;</button>
                </div>
            </div>
            <div class="pv-body">
                <div class="pv-loading-body"><div class="pv-spinner"></div></div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    let closed = false;
    const closeModal = () => {
        if (closed) return;
        closed = true;
        modal.classList.add('pv-closing');
        setTimeout(() => {
            modal.remove();
            document.body.style.overflow = prevBodyOverflow;
        }, 150);
    };
    modal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // ---- 2. Fetch post, comments, and like status in parallel ----
    let post, comments = [], userLiked = false;
    try {
        const supabase = await getSupabaseClient();
        const [postResult, commentsResult, likeResult] = await Promise.all([
            fetchPostById(postId),
            fetchComments(postId).catch(() => []),
            supabase.from('likes').select('id').eq('post_id', postId).eq('user_id', currentUser.id).maybeSingle()
        ]);
        post = postResult;
        comments = commentsResult;
        userLiked = !!likeResult?.data;
    } catch (err) {
        console.error('Failed to fetch post:', err);
        if (closed) return;
        renderErrorState(modal, 'Something went wrong loading this post.');
        return;
    }

    if (closed) return; // user closed the modal while data was loading

    if (!post) {
        renderErrorState(modal, 'This post could not be found.');
        return;
    }

    renderPostContent(modal, post, comments, userLiked, currentUser, closeModal);
}

// ---- Swap the loading skeleton for an error message ----
function renderErrorState(modal, message) {
    const body = modal.querySelector('.pv-body');
    if (!body) return;
    body.innerHTML = `
        <div class="pv-error-body">
            <i class="fas fa-circle-exclamation"></i>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}

// ---- Swap the loading skeleton for the real post content ----
function renderPostContent(modal, post, comments, userLiked, currentUser, closeModal) {
    const user = post.profiles || {};
    const displayName = user.display_name || 'User';
    const username = user.username || '';
    const avatarUrl = user.avatar_url || '';
    const decryptedContent = post.decryptedContent || '';
    const isOwner = currentUser && post.user_id === currentUser.id;

    // Header
    modal.querySelector('.pv-user').innerHTML = `
        <div class="pv-avatar">
            ${avatarUrl ? `<img src="${avatarUrl}" alt="">` : (displayName[0] || 'U').toUpperCase()}
        </div>
        <div style="min-width:0;">
            <div class="pv-name">${escapeHtml(displayName)}</div>
            <div class="pv-meta">@${escapeHtml(username)} · ${new Date(post.created_at).toLocaleDateString()}</div>
        </div>
    `;
    if (isOwner) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'pv-icon-btn pv-danger delete-post-modal-btn';
        deleteBtn.title = 'Delete post';
        deleteBtn.dataset.id = post.id;
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        modal.querySelector('.pv-header-actions').prepend(deleteBtn);
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Delete this post?')) return;
            try {
                await deletePost(post.id);
                closeModal();
                const activePage = document.querySelector('.bottom-nav-item.active')?.dataset.page;
                if (activePage === 'home') {
                    if (typeof window.loadHomeFeed === 'function') {
                        window.loadHomeFeed('homeContent');
                    } else {
                        window.location.reload();
                    }
                } else if (activePage === 'profile') {
                    if (typeof window.renderProfile === 'function') {
                        window.renderProfile();
                    }
                }
                toast('Post deleted.', 'success');
            } catch (err) {
                alert('Failed to delete: ' + err.message);
            }
        });
    }

    // Media
    let mediaHtml = '';
    if (post.media_url) {
        if (post.media_type === 'video') {
            mediaHtml = `<div class="pv-media video-player-container" data-video-url="${post.media_url}"></div>`;
        } else if (post.media_type === 'image') {
            mediaHtml = `<div class="pv-media"><img src="${post.media_url}" alt="Post media"></div>`;
        }
    }

    // Body
    const body = modal.querySelector('.pv-body');
    body.innerHTML = `
        <div class="pv-left pv-content-in">
            <p class="pv-post-text">${escapeHtml(decryptedContent)}</p>
            ${mediaHtml}
        </div>
        <div class="pv-right pv-content-in">
            <div class="pv-comments-head"><i class="fas fa-comment-dots"></i> Comments</div>
            <div class="pv-comments-list" id="commentsContainer">${renderCommentsHtml(comments)}</div>

            <div class="pv-actions">
                <div class="pv-action-row">
                    <div class="pv-like-wrapper">
                        <button id="likeBtn" class="pv-action-btn ${userLiked ? 'liked' : ''}" data-post-id="${post.id}">
                            <i class="fas fa-heart"></i> <span id="likeCount">${post.likes_count || 0}</span>
                        </button>
                    </div>
                    <button id="shareBtn" class="pv-action-btn">
                        <i class="fas fa-share-alt"></i> Share
                    </button>
                </div>
                <div class="pv-comment-form">
                    <input type="text" id="commentInput" class="pv-comment-input" placeholder="Write a comment...">
                    <button id="commentSubmitBtn" class="pv-comment-submit">Post</button>
                </div>
            </div>
        </div>
    `;

    // ---- Render video player if video ----
    if (post.media_type === 'video') {
        const videoContainer = modal.querySelector('.video-player-container');
        if (videoContainer) {
            renderVideoPlayer(videoContainer, post.media_url, { controls: true }).catch(err => {
                console.warn('Failed to render video player:', err);
                videoContainer.innerHTML = `<div style="color:#dc2626;padding:16px;text-align:center;">Video playback not available</div>`;
            });
        }
    }

    // ---- Like button + reaction picker ----
    const likeWrapper = modal.querySelector('.pv-like-wrapper');
    const likeBtn = modal.querySelector('#likeBtn');
    const likeCount = modal.querySelector('#likeCount');

    const doLike = async () => {
        likeBtn.disabled = true;
        try {
            const result = await toggleLike(post.id);
            const isLiked = result.action === 'liked';
            likeBtn.classList.toggle('liked', isLiked);
            const current = parseInt(likeCount.textContent) || 0;
            likeCount.textContent = isLiked ? current + 1 : Math.max(0, current - 1);
        } catch (err) {
            alert('Failed to like: ' + err.message);
        } finally {
            likeBtn.disabled = false;
        }
    };
    likeBtn.addEventListener('click', doLike);
    attachReactionPicker(likeWrapper, likeBtn, () => doLike());

    // ---- Share button ----
    modal.querySelector('#shareBtn').addEventListener('click', () => {
        const url = window.location.href + '?post=' + post.id;
        if (navigator.share) {
            navigator.share({ title: 'Check out this post', text: decryptedContent, url });
        } else {
            navigator.clipboard.writeText(url).then(() => toast('Link copied!', 'success'));
        }
    });

    // ---- Comment submit ----
    const commentInput = modal.querySelector('#commentInput');
    const commentSubmit = modal.querySelector('#commentSubmitBtn');
    const submitComment = async () => {
        const text = commentInput.value.trim();
        if (!text) return;
        commentSubmit.disabled = true;
        try {
            await addComment(post.id, text);
            const freshComments = await fetchComments(post.id);
            modal.querySelector('#commentsContainer').innerHTML = renderCommentsHtml(freshComments);
            commentInput.value = '';
        } catch (err) {
            alert('Failed to comment: ' + err.message);
        } finally {
            commentSubmit.disabled = false;
        }
    };
    commentSubmit.addEventListener('click', submitComment);
    commentInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitComment();
    });
}

function toast(message, tone = 'info') {
    if (typeof window.toast === 'function') {
        window.toast(message, tone);
    } else {
        alert(message);
    }
}

// ---- Comments renderer (shared by initial render + refresh) ----
function renderCommentsHtml(commentsData) {
    if (!commentsData || commentsData.length === 0) {
        return `<div class="pv-empty"><i class="fas fa-comment-slash"></i>No comments yet. Be the first!</div>`;
    }
    return commentsData.map(c => {
        const cUser = c.profiles || {};
        const cAvatar = cUser.avatar_url || '';
        const cName = cUser.display_name || 'User';
        const cUsername = cUser.username || '';
        const cTime = new Date(c.created_at).toLocaleDateString();
        const cContent = c.decryptedContent || '';
        return `
            <div class="pv-comment">
                <div class="pv-comment-avatar">
                    ${cAvatar ? `<img src="${cAvatar}" alt="">` : (cName[0] || 'U').toUpperCase()}
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                        <span class="pv-comment-name">${escapeHtml(cName)}</span>
                        <span class="pv-comment-username">@${escapeHtml(cUsername)}</span>
                        <span class="pv-comment-time">${cTime}</span>
                    </div>
                    <div class="pv-comment-text">${escapeHtml(cContent)}</div>
                </div>
            </div>
        `;
    }).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}