// ============================================================
// home.js – full scrollable (header + composer + feed)
// ============================================================

import { uploadVideo } from './videoUpload.js';
import { loadHomeFeed, initRealtimeFeed } from './home-loader.js';
import { createPost } from './home-sb.js';
import { openPostModal } from './postModal.js';
let realtimeSubscription = null;
let pendingMedia = null;
let currentPage = 'home';

export function renderHome() {
    const container = document.getElementById('pageContent');
    if (!container) return;

    let currentUser = null;
    try {
        const stored = localStorage.getItem('smarthub.user');
        if (stored) currentUser = JSON.parse(stored);
    } catch (e) {}

    const avatarInitial = currentUser?.name?.[0] || currentUser?.email?.[0] || 'U';

    // Layout – edge-to-edge, all spacing lives in home.css so nothing
    // reintroduces a left/right gutter via inline styles.
    const html = `
        <div class="home-container">
            <main class="home-main">

                <div id="homeHeader" class="feed-header">
                    <h2>Home</h2>
                    <div class="feed-tabs">
                        <button class="active" data-feed="for-you">For You</button>
                        <button data-feed="following">Following</button>
                    </div>
                </div>

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
                                    <button id="composerVideoBtn" type="button" title="Add video" aria-label="Add video"><i class="fas fa-video"></i></button>
                                    <button id="composerImageBtn" type="button" title="Add image" aria-label="Add image"><i class="fas fa-image"></i></button>
                                    <button id="composerGifBtn" type="button" title="Add GIF" aria-label="Add GIF"><i class="fas fa-grin"></i></button>
                                </div>
                                <button class="composer-submit" id="composerSubmit" disabled>Post</button>
                            </div>
                            <input type="file" id="composerFileInput" accept="video/*,image/*" style="display:none;">
                            <div id="composerUploadProgress" class="composer-upload-progress" style="display:none;"></div>
                        </div>
                    </div>
                </div>

                <!-- Unified content container -->
                <div id="homeContent"></div>

                <!-- Bottom navigation – brand + centered items + decorative accent -->
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

    // ---- Load home feed into homeContent ----
    loadHomeFeed('homeContent');

    // ---- Real-time subscription ----
    if (realtimeSubscription) {
        realtimeSubscription.unsubscribe();
        realtimeSubscription = null;
    }
    realtimeSubscription = initRealtimeFeed();

    // ---- Feed tabs ----
    document.querySelectorAll('.feed-tabs button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.feed-tabs button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const feedType = btn.dataset.feed;
            if (feedType === 'for-you') {
                currentOffset = 0;
                loadHomeFeed('homeContent');
            }
            // 'following' just toggles the tab – no action yet
        });
    });

    // ---- Composer ----
    setupComposer();

    // ---- Bottom nav ----
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            document.querySelectorAll('.bottom-nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            navigateHomePage(page);
        });
    });

    if (typeof window.toast !== 'function') {
        window.toast = (msg) => alert(msg);
    }
}

let currentOffset = 0;

function setupComposer() {
    const text = document.getElementById('composerText');
    if (!text) return;
    const submit = document.getElementById('composerSubmit');
    const videoBtn = document.getElementById('composerVideoBtn');
    const imageBtn = document.getElementById('composerImageBtn');
    const fileInput = document.getElementById('composerFileInput');
    const progress = document.getElementById('composerUploadProgress');
    const mediaPreview = document.getElementById('composerMediaPreview');

    const refreshSubmitState = () => {
        const hasText = text.value.trim().length > 0;
        submit.disabled = !hasText && !pendingMedia;
    };

    const renderMediaPreview = () => {
        if (!pendingMedia) {
            mediaPreview.innerHTML = '';
            return;
        }
        const src = pendingMedia.type === 'video' ? pendingMedia.url : pendingMedia.previewUrl;
        const isVideo = pendingMedia.type === 'video';
        mediaPreview.innerHTML = `
            <div class="media-preview">
                ${isVideo
                    ? `<video src="${src}" muted></video><span class="video-badge"><i class="fas fa-video"></i> Video</span>`
                    : `<img src="${src}" alt="Attached image">`}
                <button type="button" class="media-remove-btn" id="composerMediaRemove" aria-label="Remove attachment"><i class="fas fa-xmark"></i></button>
            </div>
        `;
        document.getElementById('composerMediaRemove')?.addEventListener('click', () => {
            pendingMedia = null;
            renderMediaPreview();
            refreshSubmitState();
        });
    };

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
        const file = e.target.files[0];
        if (!file) return;
        try {
            progress.classList.remove('is-error');
            progress.style.display = 'flex';
            progress.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
            if (file.type.startsWith('video/')) {
                const result = await uploadVideo(file);
                pendingMedia = { url: result.url, type: 'video' };
                progress.innerHTML = '<i class="fas fa-circle-check"></i> Video attached';
            } else {
                const previewUrl = URL.createObjectURL(file);
                pendingMedia = { file, type: 'image', previewUrl };
                progress.innerHTML = '<i class="fas fa-circle-check"></i> Image attached';
            }
            renderMediaPreview();
            refreshSubmitState();
            setTimeout(() => { progress.style.display = 'none'; }, 2500);
        } catch (err) {
            progress.classList.add('is-error');
            progress.innerHTML = '<i class="fas fa-circle-exclamation"></i> ' + err.message;
        } finally {
            fileInput.value = '';
        }
    });

    submit.addEventListener('click', async () => {
        const content = text.value.trim();
        if (!content) return;

        let mediaUrl = null, mediaType = null;
        if (pendingMedia) {
            if (pendingMedia.type === 'video' && pendingMedia.url) {
                mediaUrl = pendingMedia.url;
                mediaType = 'video';
            } else if (pendingMedia.type === 'image' && pendingMedia.file) {
                const reader = new FileReader();
                const data = await new Promise((resolve) => {
                    reader.onload = (e) => resolve(e.target.result);
                    reader.readAsDataURL(pendingMedia.file);
                });
                mediaUrl = data;
                mediaType = 'image';
            }
            pendingMedia = null;
            renderMediaPreview();
        }

        submit.disabled = true;
        submit.textContent = 'Posting...';
        try {
            await createPost(content, mediaUrl, mediaType);
            toast('Post published', 'success');
            text.value = '';
            submit.disabled = true;
            progress.style.display = 'none';
            currentOffset = 0;
            await loadHomeFeed('homeContent');
        } catch (err) {
            toast('Failed to post: ' + err.message, 'error');
        } finally {
            submit.disabled = false;
            submit.textContent = 'Post';
            refreshSubmitState();
        }
    });
}

async function navigateHomePage(page) {
    if (page === currentPage) return;
    currentPage = page;

    const content = document.getElementById('homeContent');
    if (!content) return;

    // Show/hide header and composer
    const header = document.getElementById('homeHeader');
    const composer = document.getElementById('homeComposer');

    if (page === 'home') {
        if (header) header.style.display = 'block';
        if (composer) composer.style.display = 'block';
        content.innerHTML = '';
        loadHomeFeed('homeContent');
        return;
    } else {
        if (header) header.style.display = 'none';
        if (composer) composer.style.display = 'none';
    }

    content.innerHTML = '<div class="spinner" style="margin:40px auto;"></div>';

    try {
        if (page === 'search') {
            const module = await import('./search.js');
            module.renderSearch(content);
        } else if (page === 'notifications') {
            const module = await import('./alerts.js');
            module.renderAlerts(content);
        } else if (page === 'profile') {
            const module = await import('./profile.js');
            module.renderProfile(content);
        } else {
            content.innerHTML = `<div class="empty-state"><i class="fas fa-compass"></i><h3>Page not found</h3><p>That section doesn't exist.</p></div>`;
        }
    } catch (err) {
        content.innerHTML = `
            <div class="page-error">
                <p>Failed to load: ${err.message}</p>
                <button onclick="window.renderHome()" class="btn-primary">Go Home</button>
            </div>
        `;
    }
}

export function cleanupHome() {
    if (realtimeSubscription) {
        realtimeSubscription.unsubscribe();
        realtimeSubscription = null;
    }
}

window.renderHome = renderHome;
window.cleanupHome = cleanupHome;