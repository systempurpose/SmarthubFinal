// ============================================================
// profile.js – Social Profile (full‑page scrollable)
// Styling lives in home.css (shared with the Home feed) under
// .composer-*, .post-*, .empty-state, .page-error/.page-login,
// and the .profile-* chrome rules.
// ============================================================

import { getSupabaseClient } from './supabase.js';
import { createPost, toggleLike, deletePost, fetchReactionsSummary, fetchSavedPostIds, savePost, unsavePost, isPostSaved } from './home-sb.js';
import { uploadProfileImage, updateProfile } from './profile-sb.js';
import { uploadVideo } from './videoUpload.js';
import { renderVideoThumbnail } from './videoPlayer.js';
import { openPostView } from './postView.js';
import { openReactionModal } from './reactionModal.js';

let currentProfileUser = null;
let currentUser = null;
let currentFeedType = 'user'; // 'user' or 'saved'
let savedCount = 0;

// ---- Custom notification modal (replaces toast/alert) ----
function showNotificationModal(message, tone = 'info', duration = 2500) {
    const existing = document.querySelector('.notification-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'notification-modal-overlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 999999;
        pointer-events: none;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        animation: notifFadeIn 0.2s ease;
    `;

    const colors = {
        success: { bg: '#d1fae5', border: '#34d399', text: '#065f46', icon: 'fa-check-circle' },
        error: { bg: '#fce8ee', border: '#f87171', text: '#991b1b', icon: 'fa-circle-exclamation' },
        info: { bg: '#e0f2fe', border: '#60a5fa', text: '#1e40af', icon: 'fa-info-circle' },
    };
    const c = colors[tone] || colors.info;

    overlay.innerHTML = `
        <div style="
            background: #fff;
            border-radius: 12px;
            max-width: 420px;
            width: 100%;
            padding: 16px 20px;
            box-shadow: 0 20px 48px rgba(15, 23, 42, 0.2);
            display: flex;
            align-items: center;
            gap: 12px;
            border-left: 4px solid ${c.border};
            pointer-events: auto;
            background: ${c.bg};
        ">
            <i class="fas ${c.icon}" style="color: ${c.border}; font-size: 20px; flex-shrink: 0;"></i>
            <span style="color: ${c.text}; font-size: 14px; font-weight: 500; line-height: 1.4; flex:1;">
                ${escapeHtml(message)}
            </span>
            <button class="notif-close" style="
                background: none; border: none; color: ${c.text};
                cursor: pointer; font-size: 18px; padding: 0 4px; opacity:0.6;
                transition: opacity 0.15s;
            " aria-label="Close">&times;</button>
        </div>
    `;
    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector('.notif-close');
    const close = () => {
        overlay.style.animation = 'notifFadeOut 0.2s ease forwards';
        setTimeout(() => overlay.remove(), 250);
    };
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    const timer = setTimeout(close, duration);
    const escHandler = (e) => {
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    overlay._close = close;
    overlay._timer = timer;
}

// ---- Custom confirmation modal (replaces browser confirm) ----
function showConfirmModal(message, onConfirm, onCancel) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 999998;
        background: rgba(15, 23, 42, 0.55);
        backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
        animation: confirmFadeIn 0.15s ease;
    `;
    overlay.innerHTML = `
        <div style="
            background: #fff;
            border-radius: 16px;
            max-width: 400px;
            width: 100%;
            padding: 24px 28px;
            box-shadow: 0 24px 64px rgba(15, 23, 42, 0.35);
            text-align: center;
        ">
            <p style="margin: 0 0 20px; font-size: 15px; color: #1e293b; line-height: 1.5;">
                ${escapeHtml(message)}
            </p>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button id="confirmYes" style="
                    background: #0d9488; color: #fff; border: none;
                    padding: 8px 28px; border-radius: 8px; font-weight: 700;
                    cursor: pointer; transition: background 0.15s;
                ">Yes</button>
                <button id="confirmNo" style="
                    background: #f1f5f9; color: #0f172a; border: none;
                    padding: 8px 28px; border-radius: 8px; font-weight: 700;
                    cursor: pointer; transition: background 0.15s;
                ">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const yesBtn = overlay.querySelector('#confirmYes');
    const noBtn = overlay.querySelector('#confirmNo');

    const cleanup = () => overlay.remove();
    yesBtn.addEventListener('click', () => { cleanup(); if (onConfirm) onConfirm(); });
    noBtn.addEventListener('click', () => { cleanup(); if (onCancel) onCancel(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { cleanup(); if (onCancel) onCancel(); } });

    const escHandler = (e) => {
        if (e.key === 'Escape') { cleanup(); if (onCancel) onCancel(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
}

// ---- Inject styles for modals and animations once ----
function ensureModalStyles() {
    if (document.getElementById('profileModalStyles')) return;
    const style = document.createElement('style');
    style.id = 'profileModalStyles';
    style.textContent = `
        @keyframes notifFadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
        @keyframes notifFadeOut { to { opacity: 0; transform: scale(0.98); } }
        @keyframes confirmFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .confirm-overlay button#confirmYes:hover { background: #0b7f74; }
        .confirm-overlay button#confirmNo:hover { background: #e2e8f0; }
        .notification-modal-overlay .notif-close:hover { opacity: 1 !important; }

        /* ---- Animation enhancements ---- */
        .post-card {
            transition: transform 0.2s cubic-bezier(0.2, 0.7, 0.3, 1), background 0.15s ease, box-shadow 0.15s ease;
        }
        .post-card:hover {
            background: #fafbfc;
            transform: translateY(-1px);
        }

        .post-actions button {
            transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
        }
        .post-actions button:active {
            transform: scale(0.92);
        }
        .post-actions button .fa-heart,
        .post-actions button .fa-bookmark,
        .post-actions button .fa-bookmark-o,
        .post-actions button .fa-comment {
            transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .post-actions button:hover .fa-heart { transform: scale(1.1); }
        .post-actions button:hover .fa-bookmark { transform: scale(1.1); }
        .post-actions button:hover .fa-bookmark-o { transform: scale(1.1); }
        .post-actions button:hover .fa-comment { transform: scale(1.1); }

        .like-btn.liked .fa-heart {
            animation: heartPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes heartPop {
            0% { transform: scale(1); }
            50% { transform: scale(1.5); }
            100% { transform: scale(1); }
        }

        .save-btn.saved .fa-bookmark {
            animation: bookmarkPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes bookmarkPop {
            0% { transform: scale(1); }
            50% { transform: scale(1.3); }
            100% { transform: scale(1); }
        }

        .reaction-summary {
            transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
        }
        .reaction-summary:hover {
            transform: scale(1.02);
        }

        .delete-post-btn {
            transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
        }
        .delete-post-btn:active {
            transform: scale(0.85);
        }

        .profile-avatar-wrap .overlay-btn,
        .profile-cover .overlay-btn {
            transition: opacity 0.2s ease, transform 0.2s ease, background 0.2s ease;
        }
        .profile-avatar-wrap .overlay-btn:hover,
        .profile-cover .overlay-btn:hover {
            transform: scale(1.05);
        }

        .profile-bio-edit-btn {
            transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
        }
        .profile-bio-edit-btn:active {
            transform: scale(0.9);
        }

        .composer-submit {
            transition: background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
        }
        .composer-submit:active:not(:disabled) {
            transform: scale(0.95);
        }

        .composer-tools button {
            transition: background 0.15s ease, transform 0.15s ease, color 0.15s ease;
        }
        .composer-tools button:active {
            transform: scale(0.85);
        }

        .media-remove-btn {
            transition: background 0.15s ease, transform 0.15s ease;
        }
        .media-remove-btn:hover {
            transform: scale(1.1);
        }
        .media-remove-btn:active {
            transform: scale(0.85);
        }

        .feed-tab {
            transition: color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease, transform 0.15s ease;
        }
        .feed-tab:active {
            transform: scale(0.95);
        }

        .profile-feed-section #profileFeed {
            transition: opacity 0.25s ease;
        }

        /* Skeleton shimmer enhancement */
        .skeleton-line {
            animation: shimmer 1.4s ease infinite;
        }
        @keyframes shimmer {
            0% { background-position: 100% 50%; }
            100% { background-position: 0 50%; }
        }
    `;
    document.head.appendChild(style);
}
ensureModalStyles();

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

// ---- Helpers for live updates (exported) ----
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

        await updateProfileSummary(postId);
    } catch (err) {
        showNotificationModal('Failed to like: ' + err.message, 'error');
    }
}

// ---- Main render function ----
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

    const savedIds = await fetchSavedPostIds();
    savedCount = savedIds.length;

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
                        <input type="file" id="profileMediaInput" accept="video/*,image/*" multiple style="display:none;">
                        <div id="profileUploadProgress" class="composer-upload-progress" style="display:none;"></div>
                    </div>
                </div>
            </div>

            <!-- User's Posts with tabs -->
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

    currentFeedType = 'user';
    await loadUserPosts(currentUser.id);

    // ---- Tab switching ----
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
            showNotificationModal('Avatar updated!', 'success');
        } catch (err) {
            showNotificationModal('Failed to update avatar: ' + err.message, 'error');
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
            showNotificationModal('Cover updated!', 'success');
        } catch (err) {
            showNotificationModal('Failed to update cover: ' + err.message, 'error');
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
            showNotificationModal('Bio updated!', 'success');
        } catch (err) {
            showNotificationModal('Failed to update bio: ' + err.message, 'error');
        }
    });

    // ---- Composer with multiple media support ----
    const composer = document.getElementById('profileComposer');
    const postBtn = document.getElementById('profilePostBtn');
    const videoBtn = document.getElementById('profileVideoBtn');
    const imageBtn = document.getElementById('profileImageBtn');
    const gifBtn = document.getElementById('profileGifBtn');
    const mediaInput = document.getElementById('profileMediaInput');
    const progress = document.getElementById('profileUploadProgress');
    const mediaPreview = document.getElementById('profileMediaPreview');

    let pendingMedia = [];

    function renderMediaPreviews() {
        if (!pendingMedia.length) {
            mediaPreview.style.display = 'none';
            mediaPreview.innerHTML = '';
            return;
        }
        let html = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">';
        for (let i = 0; i < pendingMedia.length; i++) {
            const item = pendingMedia[i];
            const isVideo = item.type === 'video';
            const src = isVideo ? item.url : (item.previewUrl || item.url);
            html += `
                <div style="position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;flex-shrink:0;">
                    ${isVideo
                        ? `<video src="${escapeHtml(src)}" muted style="width:100%;height:100%;object-fit:cover;"></video>`
                        : `<img src="${escapeHtml(src)}" style="width:100%;height:100%;object-fit:cover;">`}
                    <button class="media-remove-btn" data-index="${i}" style="position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,0.6);color:#fff;border:none;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;">&times;</button>
                </div>
            `;
        }
        html += '</div>';
        mediaPreview.innerHTML = html;
        mediaPreview.style.display = 'block';

        mediaPreview.querySelectorAll('.media-remove-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                pendingMedia.splice(idx, 1);
                renderMediaPreviews();
            });
        });
    }

    function clearMediaPreview() {
        pendingMedia = [];
        renderMediaPreviews();
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
        showNotificationModal('GIF support coming soon!', 'info');
    });

    mediaInput.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files || !files.length) return;

        progress.classList.remove('is-error');
        progress.style.display = 'flex';
        progress.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                if (file.type.startsWith('video/')) {
                    const result = await uploadVideo(file);
                    pendingMedia.push({ url: result.url || result.storagePath, type: 'video' });
                } else {
                    const reader = new FileReader();
                    const dataUrl = await new Promise((resolve) => {
                        reader.onload = (e) => resolve(e.target.result);
                        reader.readAsDataURL(file);
                    });
                    pendingMedia.push({ url: dataUrl, type: 'image', previewUrl: dataUrl });
                }
            } catch (err) {
                showNotificationModal('Failed to upload: ' + err.message, 'error');
            }
        }
        renderMediaPreviews();
        progress.style.display = 'none';
        mediaInput.value = '';
    });

    postBtn.addEventListener('click', async () => {
        const text = composer.value.trim();
        if (!text && !pendingMedia.length) {
            showNotificationModal('Write something or attach media first.', 'info');
            return;
        }

        postBtn.disabled = true;
        postBtn.textContent = 'Posting...';
        try {
            await createPostWithMedia(text, pendingMedia);
            composer.value = '';
            clearMediaPreview();
            showNotificationModal('Post published!', 'success');
            if (currentFeedType === 'user') {
                await loadUserPosts(currentUser.id);
            } else {
                await loadSavedPosts();
            }
        } catch (err) {
            showNotificationModal('Failed to post: ' + err.message, 'error');
        } finally {
            postBtn.disabled = false;
            postBtn.textContent = 'Post';
        }
    });
}

// ---- Helper: Create a post with multiple media ----
async function createPostWithMedia(text, mediaArray) {
    const supabase = await getSupabaseClient();
    const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!user) throw new Error('You must be logged in');

    const { compressAndEncrypt } = await import('./home-sb.js');
    const encryptedContent = await compressAndEncrypt(text);

    const payload = {
        user_id: user.id,
        content: encryptedContent,
        created_at: new Date().toISOString()
    };

    if (mediaArray.length) {
        payload.media_url = mediaArray[0].url;
        payload.media_type = mediaArray[0].type;
        payload.media = mediaArray;
    }

    const { data, error } = await supabase.from('posts').insert(payload).select();
    if (error) throw error;
    return data[0];
}

// ---- Skeleton and feed load functions ----
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
            feed.innerHTML = `<div class="empty-state"><i class="fas fa-feather-alt"></i><h3>No posts yet</h3><p>Share what's on your mind above to get started.</p></div>`;
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

        // ---- Compute saved status for each post ----
        const savedMap = {};
        const savedPromises = posts.map(async post => {
            savedMap[post.id] = await isPostSaved(post.id);
        });
        await Promise.all(savedPromises);

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

        feed.innerHTML = renderPostCards(posts, likesMap, userReactionsMap, summaryMap, savedMap);
        attachPostEventListeners(feed);
    } catch (err) {
        feed.innerHTML = `<div class="page-error">Couldn't load posts: ${escapeHtml(err.message)}</div>`;
    }
}

async function loadSavedPosts() {
    const feed = document.getElementById('profileFeed');
    if (!feed) return;
    feed.innerHTML = skeletonFeedHtml();

    try {
        const supabase = await getSupabaseClient();
        const savedIds = await fetchSavedPostIds();
        savedCount = savedIds.length;
        const badge = document.getElementById('savedCountBadge');
        if (badge) badge.textContent = savedCount;

        if (!savedIds.length) {
            feed.innerHTML = `<div class="empty-state"><i class="fas fa-bookmark"></i><h3>No saved posts</h3><p>Save posts you find interesting to see them here.</p></div>`;
            return;
        }

        const { data: posts, error } = await supabase
            .from('posts')
            .select('*')
            .in('id', savedIds)
            .order('created_at', { ascending: false });

        if (error) throw error;
        if (!posts || posts.length === 0) {
            feed.innerHTML = `<div class="empty-state"><i class="fas fa-bookmark"></i><h3>No saved posts</h3><p>Save posts you find interesting to see them here.</p></div>`;
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

        // ---- Compute saved status for each post (all true since they're from saved list) ----
        const savedMap = {};
        posts.forEach(post => { savedMap[post.id] = true; });

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

        feed.innerHTML = renderPostCards(posts, likesMap, userReactionsMap, summaryMap, savedMap);
        attachPostEventListeners(feed);
    } catch (err) {
        feed.innerHTML = `<div class="page-error">Couldn't load saved posts: ${escapeHtml(err.message)}</div>`;
    }
}

// ---- Updated renderPostCards with save button ----
function renderPostCards(posts, likesMap, userReactionsMap, summaryMap, savedMap = {}) {
    let html = '';
    for (const post of posts) {
        const time = new Date(post.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const isOwner = currentUser && post.user_id === currentUser.id;
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

        const isSaved = savedMap[post.id] || false;

        // ---- Media rendering ----
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
                    <button class="save-btn ${isSaved ? 'saved' : ''}" data-id="${post.id}" style="background:none;border:none;display:flex;align-items:center;gap:4px;font-size:14px;color:${isSaved ? '#0d9488' : '#555'};cursor:pointer;transition:color 0.15s ease, transform 0.15s ease;">
                        <i class="fas ${isSaved ? 'fa-bookmark' : 'fa-bookmark-o'}"></i>
                    </button>
                </div>
            </div>
        `;
    }
    return html;
}

// ---- attachPostEventListeners with save button handler ----
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

    // ---- Save button handler ----
    feed.querySelectorAll('.save-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const postId = btn.dataset.id;
            const icon = btn.querySelector('i');
            try {
                const saved = await isPostSaved(postId);
                if (saved) {
                    await unsavePost(postId);
                    icon.className = 'fas fa-bookmark-o';
                    btn.classList.remove('saved');
                    btn.style.color = '#555';
                    showNotificationModal('Post unsaved', 'info');
                } else {
                    await savePost(postId);
                    icon.className = 'fas fa-bookmark';
                    btn.classList.add('saved');
                    btn.style.color = '#0d9488';
                    showNotificationModal('Post saved!', 'success');
                }
            } catch (err) {
                showNotificationModal('Failed: ' + err.message, 'error');
            }
        });
    });

    feed.querySelectorAll('.comment-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const postId = btn.dataset.id;
            openPostView(postId);
        });
    });

    feed.querySelectorAll('.delete-post-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const postId = btn.dataset.id;
            showConfirmModal('Delete this post?', async () => {
                try {
                    await deletePost(postId);
                    showNotificationModal('Post deleted', 'success');
                    if (currentFeedType === 'user') {
                        await loadUserPosts(currentUser.id);
                    } else {
                        await loadSavedPosts();
                    }
                } catch (err) {
                    showNotificationModal('Failed to delete: ' + err.message, 'error');
                }
            });
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