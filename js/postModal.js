// js/postModal.js
import { getSupabaseClient } from './supabase.js';
import { fetchPostById, fetchComments, toggleLike, addComment, deletePost, savePost, unsavePost, isPostSaved } from './home-sb.js';
import { renderVideoPlayer } from './videoPlayer.js';

let modalPostId = null;
let loadToken = 0; // guards against a slow fetch overwriting a newer, faster one

const EMOJIS = ['❤️', '😊', '😂', '😮', '😢', '😡'];

// ---- Emoji reaction picker ----
// Anchored to the LEFT edge of its wrapper (not centered) so it grows
// rightward from the like button instead of straddling it and clipping
// off the left side of the card.
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

// ---- One-time spinner keyframes, shared by the modal's loading state ----
function ensureSpinnerStyles() {
    if (document.getElementById('postModalSpinnerStyles')) return;
    const style = document.createElement('style');
    style.id = 'postModalSpinnerStyles';
    style.textContent = `
        @keyframes postModalSpin { to { transform: rotate(360deg); } }
        @keyframes postModalFadeIn { from { opacity:0; } to { opacity:1; } }
        #postModalLoading {
            position:absolute; inset:0; background:rgba(255,255,255,0.9);
            backdrop-filter:blur(2px); display:flex; align-items:center; justify-content:center;
            z-index:5; opacity:0; pointer-events:none; transition:opacity 0.18s ease;
        }
        #postModalLoading.visible { opacity:1; pointer-events:auto; }
        #postModalLoading .spinner-ring {
            width:38px; height:38px; border-radius:50%;
            border:3px solid #e2e8f0; border-top-color:#0d9488;
            animation:postModalSpin 0.7s linear infinite;
        }
        #postModalBody.content-loaded { animation:postModalFadeIn 0.25s ease; }
    `;
    document.head.appendChild(style);
}

function ensureModal() {
    let modal = document.getElementById('postModal');
    if (!modal) {
        ensureSpinnerStyles();
        modal = document.createElement('div');
        modal.id = 'postModal';
        modal.className = 'modal';
        modal.style.cssText = 'display:none;z-index:999999;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);';
        modal.innerHTML = `
            <div class="modal-content" style="position:relative;max-width:1000px;width:95%;max-height:90vh;background:white;border-radius:20px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(0,0,0,0.4);">
                <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #e1e8ed;">
                    <h3 style="margin:0;font-size:18px;">Post</h3>
                    <button id="closePostModal" style="background:none;border:none;font-size:28px;cursor:pointer;color:#999;">&times;</button>
                </div>
                <div id="postModalBody" style="position:relative;flex:1;overflow-y:auto;display:flex;flex-direction:row;padding:16px 20px;min-height:240px;">
                    <!-- Loading overlay – shown immediately on open, faded out once content is ready -->
                    <div id="postModalLoading">
                        <div class="spinner-ring"></div>
                    </div>
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
                await refreshModal(modalPostId, { showLoading: false });
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

function setModalLoading(isLoading) {
    const overlay = document.getElementById('postModalLoading');
    const body = document.getElementById('postModalBody');
    if (!overlay) return;
    overlay.classList.toggle('visible', isLoading);
    if (!isLoading && body) {
        body.classList.remove('content-loaded');
        // restart the fade-in animation
        void body.offsetWidth;
        body.classList.add('content-loaded');
    }
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

export async function openPostModal(postId, focusComment = false) {
    modalPostId = postId;
    const modal = ensureModal();
    modal.style.display = 'flex';
    // Show the spinner immediately so the click feels instant, even
    // before the network request resolves.
    setModalLoading(true);
    await refreshModal(postId, { showLoading: true });
    if (focusComment) {
        const input = document.getElementById('commentInput');
        setTimeout(() => input.focus(), 300);
    }
}

async function refreshModal(postId, { showLoading = false } = {}) {
    const body = document.getElementById('postModalBody');
    const userInfoDiv = document.getElementById('modalUserInfo');
    const textDiv = document.getElementById('modalText');
    const mediaDiv = document.getElementById('modalMedia');
    const commentsDiv = document.getElementById('modalComments');
    const likeWrapper = body.querySelector('.like-wrapper');
    const likeBtn = body.querySelector('.like-btn');
    const saveBtn = body.querySelector('.save-btn');

    if (!body) return;

    const myToken = ++loadToken;
    if (showLoading) setModalLoading(true);

    try {
        const post = await fetchPostById(postId);

        // A newer call to refreshModal happened while this one was in
        // flight (user clicked another post) – drop this stale result.
        if (myToken !== loadToken) return;

        if (!post) {
            body.innerHTML = '<div style="padding:20px;color:red;">Post not found.</div>';
            setModalLoading(false);
            return;
        }
        const comments = await fetchComments(postId);
        if (myToken !== loadToken) return;

        const currentUser = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
        const isOwner = currentUser && post.user_id === currentUser.id;
        const saved = await isPostSaved(postId);

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

        let mediaHtml = '';
        if (post.media_url) {
            if (post.media_type === 'video') {
                mediaHtml = `<div id="modalVideoContainer" data-video-url="${escapeHtml(post.media_url)}" style="margin:8px 0;"></div>`;
            } else if (post.media_type === 'image') {
                mediaHtml = `<img src="${escapeHtml(post.media_url)}" alt="Media" style="max-width:100%;border-radius:12px;margin:8px 0;">`;
            }
        }
        mediaDiv.innerHTML = mediaHtml;

        const videoContainer = document.getElementById('modalVideoContainer');
        if (videoContainer) {
            const videoUrl = videoContainer.dataset.videoUrl;
            if (videoUrl) {
                await renderVideoPlayer(videoContainer, videoUrl, { controls: true, autoplay: true });
            }
        }

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

        likeBtn.dataset.id = post.id;
        likeBtn.querySelector('.like-count').textContent = post.likes_count || 0;
        likeBtn.querySelector('i').className = `fas ${post.userLiked ? 'fa-heart liked' : 'fa-heart'}`;
        likeBtn.classList.toggle('liked', post.userLiked || false);

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
        likeWrapper.addEventListener('mouseenter', showPicker);
        likeWrapper.addEventListener('mouseleave', hidePicker);
        likeBtn.onclick = (e) => {
            e.stopPropagation();
            toggleLikeAction(post.id, likeBtn);
        };

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
                    // Optionally trigger refresh on the page (home or profile) – could be handled by caller.
                } catch (err) {
                    toast('Failed to delete: ' + err.message, 'error');
                }
            });
        }

        setModalLoading(false);

    } catch (err) {
        if (myToken !== loadToken) return;
        body.innerHTML = `<div style="padding:20px;color:red;">Failed to load post: ${err.message}</div>`;
        setModalLoading(false);
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