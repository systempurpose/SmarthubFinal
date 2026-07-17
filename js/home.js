// js/home.js
import { uploadMedia } from './videoUpload.js';  // <-- use uploadMedia
import { loadHomeFeed, initRealtimeFeed, showNotificationModal, showConfirmModal } from './home-loader.js';
import { createPostWithMedia } from './home-sb.js';
import { openPostView } from './postView.js';
import './cursor.js';

let realtimeSubscription = null;
let pendingMedia = [];
let currentPage = 'home';
let renderIdCounter = 0;
window._hca_renderId = 0;

function renderLoadingSkeleton() {
    return `
        <div class="feed-loading-skeleton" style="padding-top:20px;">
            <div class="feed-loading-label">Loading...</div>
            ${Array.from({ length: 3 }, () => `
                <div class="skeleton-post">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                        <div class="skeleton-line" style="width:38px; height:38px; border-radius:50%; flex-shrink:0; margin-bottom:0;"></div>
                        <div style="flex:1;">
                            <div class="skeleton-line" style="width:35%; height:12px; margin-bottom:4px;"></div>
                            <div class="skeleton-line" style="width:20%; height:10px;"></div>
                        </div>
                    </div>
                    <div class="skeleton-line" style="width:100%; height:14px; margin-bottom:6px;"></div>
                    <div class="skeleton-line" style="width:85%; height:14px; margin-bottom:12px;"></div>
                    <div class="skeleton-line" style="width:100%; aspect-ratio: 16/9; border-radius: var(--hc-radius-md, 14px); margin-bottom:12px;"></div>
                    <div style="display:flex; gap:16px;">
                        <div class="skeleton-line" style="width:40px; height:16px; border-radius:12px;"></div>
                        <div class="skeleton-line" style="width:40px; height:16px; border-radius:12px;"></div>
                        <div class="skeleton-line" style="width:40px; height:16px; border-radius:12px;"></div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function ensureFadeStyles() {
    if (document.getElementById('homeFadeStyles')) return;
    const style = document.createElement('style');
    style.id = 'homeFadeStyles';
    style.textContent = `
        #homeContent.page-fade-in {
            animation: pageFadeIn 0.25s cubic-bezier(0.2, 0.7, 0.3, 1) both;
        }
        @keyframes pageFadeIn {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .feed-loading-skeleton {
            display: flex;
            flex-direction: column;
            padding: 0;
        }
        .feed-loading-label {
            padding: 16px var(--hc-gutter, 20px) 4px;
            font-size: 13px;
            font-weight: 500;
            color: var(--hc-muted, #64748b);
        }
        .skeleton-post {
            padding: 16px var(--hc-gutter, 20px);
            border-bottom: 1px solid var(--hc-border, #e6eaf0);
        }
        .skeleton-post .skeleton-line {
            margin-bottom: 8px;
        }
        .skeleton-post .skeleton-line:last-child {
            margin-bottom: 0;
        }
    `;
    document.head.appendChild(style);
}
ensureFadeStyles();

export async function renderHome() {
    const container = document.getElementById('pageContent');
    if (!container) return;

    let currentUser = null;
    try {
        const stored = localStorage.getItem('smarthub.user');
        if (stored) currentUser = JSON.parse(stored);
    } catch (e) {}

    const avatarInitial = currentUser?.name?.[0] || currentUser?.email?.[0] || 'U';

    const html = `
        <div class="home-container">
            <main class="home-main">
                <div id="homeContent">
                    <!-- Header -->
                    <div id="homeHeader" class="feed-header">
                        <h2>Home</h2>
                        <div class="feed-tabs">
                            <button class="active" data-feed="for-you">For You</button>
                            <button data-feed="following">Following</button>
                        </div>
                    </div>

                    <!-- Composer -->
                    <div id="homeComposer" class="composer-card">
                        <div class="composer-input">
                            <div class="composer-avatar">
                                ${currentUser?.avatar_url ? `<img src="${currentUser.avatar_url}" alt="">` : avatarInitial.toUpperCase()}
                            </div>
                            <div class="composer-body">
                                <textarea id="composerText" rows="2" placeholder="What's on your mind? Share a repair tip..."></textarea>
                                <div id="composerMediaPreview"></div>
                                <div class="composer-actions">
                                    <div class="composer-tools">
                                        <button id="composerVideoBtn" type="button" title="Add video"><i class="fas fa-video"></i></button>
                                        <button id="composerImageBtn" type="button" title="Add image"><i class="fas fa-image"></i></button>
                                    </div>
                                    <button class="composer-submit" id="composerSubmit" disabled>Post</button>
                                </div>
                                <input type="file" id="composerFileInput" accept="video/*,image/*" multiple style="display:none;">
                                <div id="composerUploadProgress" class="composer-upload-progress" style="display:none;"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Posts container -->
                    <div id="feedPosts"></div>
                </div>

                <!-- Bottom navigation -->
                <nav class="home-bottom-nav">
                    <div class="nav-brand" aria-hidden="true">
                        <i class="fas fa-toolbox"></i>
                        <span>SmartHub</span>
                    </div>
                    <div class="nav-items">
                        <a href="#" class="bottom-nav-item active" data-page="home"><i class="fas fa-home"></i><span>Home</span></a>
                        <a href="#" class="bottom-nav-item" data-page="search"><i class="fas fa-search"></i><span>Search</span></a>
                        <a href="#" class="bottom-nav-item" data-page="notifications"><i class="fas fa-bell"></i><span>Alerts</span></a>
                        <a href="#" class="bottom-nav-item" data-page="profile"><i class="fas fa-user"></i><span>Social Profile</span></a>
                    </div>
                    <div class="nav-decor" aria-hidden="true">
                        <i class="fas fa-circle-dot"></i>
                        <i class="fas fa-circle-dot"></i>
                        <i class="fas fa-circle-dot"></i>
                    </div>
                </nav>
            </main>
        </div>
    `;

    container.innerHTML = html;

    const initialRenderId = ++renderIdCounter;
    window._hca_renderId = initialRenderId;
    await loadHomeFeed('feedPosts', false, initialRenderId);

    if (realtimeSubscription) {
        realtimeSubscription.unsubscribe();
        realtimeSubscription = null;
    }
    realtimeSubscription = await initRealtimeFeed();

    document.querySelectorAll('.feed-tabs button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.feed-tabs button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const feedType = btn.dataset.feed;
            if (feedType === 'for-you') {
                loadHomeFeed('feedPosts', false, window._hca_renderId);
            }
        });
    });

    setupComposer();

    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            document.querySelectorAll('.bottom-nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            navigateHomePage(page, {});
        });
    });
}

// ---- setupComposer – uses uploadMedia for videos and images ----
function setupComposer() {
    const text = document.getElementById('composerText');
    if (!text) {
        console.warn('[Home] Composer textarea not found – check DOM');
        return;
    }
    const submit = document.getElementById('composerSubmit');
    const videoBtn = document.getElementById('composerVideoBtn');
    const imageBtn = document.getElementById('composerImageBtn');
    const fileInput = document.getElementById('composerFileInput');
    const progress = document.getElementById('composerUploadProgress');
    const mediaPreview = document.getElementById('composerMediaPreview');

    const refreshSubmitState = () => {
        const hasText = text.value.trim().length > 0;
        submit.disabled = !hasText && pendingMedia.length === 0;
    };

    const renderMediaPreviews = () => {
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
                <div class="media-preview-item" data-index="${i}" style="position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;flex-shrink:0;cursor:pointer;">
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

        mediaPreview.querySelectorAll('.media-preview-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.media-remove-btn')) return;
                const index = parseInt(el.dataset.index);
                const items = pendingMedia.map(m => ({ url: m.url || m.previewUrl, type: m.type }));
                import('./mediaPreviewModal.js').then(module => {
                    module.openMediaPreview(items, index);
                });
            });
        });

        mediaPreview.querySelectorAll('.media-remove-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                pendingMedia.splice(idx, 1);
                renderMediaPreviews();
                refreshSubmitState();
            });
        });
    };

    function clearMediaPreview() {
        pendingMedia = [];
        renderMediaPreviews();
        refreshSubmitState();
    }

    text.addEventListener('input', refreshSubmitState);

    videoBtn.addEventListener('click', () => {
        fileInput.accept = 'video/*';
        fileInput.click();
    });
    imageBtn.addEventListener('click', () => {
        fileInput.accept = 'image/*';
        fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files || !files.length) return;

        progress.classList.remove('is-error');
        progress.style.display = 'flex';
        progress.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                let mediaType = 'image';
                if (file.type.startsWith('video/')) mediaType = 'video';
                // Use uploadMedia with the correct mediaType
                const result = await uploadMedia(file, mediaType);
                if (mediaType === 'video') {
                    pendingMedia.push({ url: result.url, type: 'video' });
                } else {
                    // For images, also store a preview (if we want to show it)
                    const previewUrl = URL.createObjectURL(file);
                    pendingMedia.push({ file, type: 'image', previewUrl, url: result.url });
                }
            } catch (err) {
                showNotificationModal('Failed to upload: ' + err.message, 'error');
            }
        }
        renderMediaPreviews();
        progress.style.display = 'none';
        refreshSubmitState();
        fileInput.value = '';
    });

    submit.addEventListener('click', async () => {
        const content = text.value.trim();
        if (!content && pendingMedia.length === 0) {
            showNotificationModal('Write something or attach media first.', 'info');
            return;
        }

        const mediaArray = [];
        for (const item of pendingMedia) {
            if (item.type === 'video' && item.url) {
                mediaArray.push({ url: item.url, type: 'video' });
            } else if (item.type === 'image' && item.file) {
                // We already uploaded the image; we have the URL from the uploadMedia result.
                // If we stored the URL in item.url, we can use it directly.
                // In the handler above, we set item.url = result.url for images as well.
                // But we stored it as item.url = result.url; let's use it.
                // Actually we stored result.url as item.url, but we also stored the file for preview.
                // Use the uploaded URL.
                if (item.url) {
                    mediaArray.push({ url: item.url, type: 'image' });
                } else {
                    // Fallback: read as data URL (shouldn't happen)
                    const reader = new FileReader();
                    const data = await new Promise((resolve) => {
                        reader.onload = (e) => resolve(e.target.result);
                        reader.readAsDataURL(item.file);
                    });
                    mediaArray.push({ url: data, type: 'image' });
                }
            }
        }

        submit.disabled = true;
        submit.textContent = 'Posting...';
        try {
            await createPostWithMedia(content || '📎', mediaArray);
            showNotificationModal('Post published!', 'success');
            text.value = '';
            pendingMedia = [];
            renderMediaPreviews();
            refreshSubmitState();
            progress.style.display = 'none';
            await loadHomeFeed('feedPosts', false, window._hca_renderId);
        } catch (err) {
            showNotificationModal('Failed to post: ' + err.message, 'error');
        } finally {
            submit.disabled = false;
            submit.textContent = 'Post';
            refreshSubmitState();
        }
    });
}

// ---- Navigation with cancellation ----
async function navigateHomePage(page, params = {}) {
    const thisRenderId = ++renderIdCounter;
    window._hca_renderId = thisRenderId;

    if (page === currentPage) return;
    currentPage = page;

    const content = document.getElementById('homeContent');
    const feedContainer = document.getElementById('feedPosts');
    if (!content || !feedContainer) return;

    const header = document.getElementById('homeHeader');
    const composer = document.getElementById('homeComposer');

    if (page === 'home') {
        if (header) header.style.display = 'block';
        if (composer) composer.style.display = 'block';
        feedContainer.innerHTML = '';
        await loadHomeFeed('feedPosts', false, thisRenderId);
        return;
    } else {
        if (header) header.style.display = 'none';
        if (composer) composer.style.display = 'none';
    }

    feedContainer.classList.remove('page-fade-in');
    feedContainer.innerHTML = renderLoadingSkeleton();

    await new Promise(r => requestAnimationFrame(r));

    if (thisRenderId !== window._hca_renderId) return;

    try {
        let renderFn;
        if (page === 'search') {
            const module = await import('./search.js');
            if (thisRenderId !== window._hca_renderId) return;
            renderFn = module.renderSearch;
        } else if (page === 'notifications') {
            const module = await import('./alerts.js');
            if (thisRenderId !== window._hca_renderId) return;
            renderFn = module.renderAlerts;
        } else if (page === 'profile') {
            const module = await import('./profile.js');
            if (thisRenderId !== window._hca_renderId) return;
            renderFn = module.renderProfile;
        } else if (page === 'user-profile') {
            const { userId } = params || {};
            if (!userId) {
                feedContainer.innerHTML = `<div class="page-error">User ID required.</div>`;
                return;
            }
            const module = await import('./userProfileView.js');
            if (thisRenderId !== window._hca_renderId) return;
            renderFn = (el) => module.renderUserProfileView(el, userId);
        } else {
            feedContainer.innerHTML = `<div class="empty-state"><i class="fas fa-compass"></i><h3>Page not found</h3><p>That section doesn't exist.</p></div>`;
            return;
        }

        if (thisRenderId !== window._hca_renderId) return;

        await renderFn(feedContainer);

        if (thisRenderId !== window._hca_renderId) return;

        feedContainer.classList.add('page-fade-in');
    } catch (err) {
        if (thisRenderId !== window._hca_renderId) return;
        feedContainer.innerHTML = `
            <div class="page-error">
                <p>Failed to load: ${err.message}</p>
                <button onclick="window.renderHome()" class="btn-primary">Go Home</button>
            </div>
        `;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

export function cleanupHome() {
    if (realtimeSubscription) {
        realtimeSubscription.unsubscribe();
        realtimeSubscription = null;
    }
}

window.renderHome = renderHome;
window.cleanupHome = cleanupHome;
window.navigateHomePage = navigateHomePage;