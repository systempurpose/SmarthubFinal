// ============================================================
// home.js – Threads-style Homepage with content container
// ============================================================

import { loadVideoFeed } from './videoLoader.js';
import { uploadVideo } from './videoUpload.js';
import { loadHomeFeed, initRealtimeFeed } from './home-loader.js';
import { createPost } from './home-sb.js';

let realtimeSubscription = null;
let pendingMedia = null;
let currentPage = 'home';

export function renderHome() {
    const container = document.getElementById('pageContent');
    if (!container) {
        console.warn('[home] pageContent not found');
        return;
    }

    let currentUser = null;
    try {
        const stored = localStorage.getItem('smarthub.user');
        if (stored) currentUser = JSON.parse(stored);
    } catch (e) { /* ignore */ }

    const avatarInitial = currentUser?.name?.[0] || currentUser?.email?.[0] || 'U';

    // Build the home layout with a content container
    let html = `
        <div class="home-container">
            <main class="home-main">

                <!-- Feed Header (visible only on home page) -->
                <div id="homeHeader" class="feed-header" style="display:${currentPage === 'home' ? 'block' : 'none'};">
                    <h2>Home</h2>
                    <div class="feed-tabs">
                        <button class="active" data-feed="for-you">For You</button>
                        <button data-feed="following">Following</button>
                    </div>
                </div>

                <!-- Composer (visible only on home page) -->
                <div id="homeComposer" class="composer-card" style="display:${currentPage === 'home' ? 'block' : 'none'};">
                    <div class="composer-input">
                        <div class="composer-avatar">
                            ${currentUser?.avatar_url
                                ? `<img src="${currentUser.avatar_url}" alt="Avatar">`
                                : avatarInitial.toUpperCase()
                            }
                        </div>
                        <div class="composer-body">
                            <textarea id="composerText" rows="2" placeholder="What's on your mind? Share a repair tip..."></textarea>
                            <div class="composer-actions">
                                <div class="composer-tools">
                                    <button id="composerVideoBtn" title="Attach video"><i class="fas fa-video"></i></button>
                                    <button id="composerImageBtn" title="Attach image"><i class="fas fa-image"></i></button>
                                    <button id="composerGifBtn" title="Add GIF"><i class="fas fa-grin"></i></button>
                                </div>
                                <button class="composer-submit" id="composerSubmit" disabled>Post</button>
                            </div>
                            <input type="file" id="composerFileInput" accept="video/*,image/*" style="display:none;">
                            <div id="composerUploadProgress" class="composer-upload-progress" style="display:none;"></div>
                        </div>
                    </div>
                </div>

                <!-- Dynamic Content Area -->
                <div id="homeContent"></div>

                <!-- Video Feed (only on home) -->
                <div id="videoFeedContainer" class="video-section" style="display:${currentPage === 'home' ? 'block' : 'none'};">
                    <h3 class="video-section__title">
                        <i class="fas fa-video"></i> Repair Videos
                    </h3>
                    <div id="videoFeed"></div>
                </div>

                <!-- Bottom Navigation -->
                <nav class="home-bottom-nav">
                    <a href="#" class="bottom-nav-item ${currentPage === 'home' ? 'active' : ''}" data-page="home">
                        <i class="fas fa-home"></i>
                        <span>Home</span>
                    </a>
                    <a href="#" class="bottom-nav-item ${currentPage === 'search' ? 'active' : ''}" data-page="search">
                        <i class="fas fa-search"></i>
                        <span>Search</span>
                    </a>
                    <a href="#" class="bottom-nav-item ${currentPage === 'notifications' ? 'active' : ''}" data-page="notifications">
                        <i class="fas fa-bell"></i>
                        <span>Alerts</span>
                    </a>
                    <a href="#" class="bottom-nav-item ${currentPage === 'profile' ? 'active' : ''}" data-page="profile">
                        <i class="fas fa-user"></i>
                        <span>Social Profile</span>
                    </a>
                </nav>
            </main>
        </div>
    `;

    container.innerHTML = html;

    // ---- Load home content ----
    if (currentPage === 'home') {
        loadHomeFeed('homeFeed');
        loadVideoFeed('videoFeed');
        initRealtimeFeed();
        setupComposer();
    } else {
        // Navigate to the current page (if not home)
        navigateHomePage(currentPage);
    }

    // ---- Bottom navigation ----
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            navigateHomePage(page);
        });
    });

    // ---- Toast fallback ----
    if (typeof window.toast !== 'function') {
        window.toast = function(message) { alert(message); };
    }
}

// ---- Setup composer (only called on home) ----
function setupComposer() {
    const composerText = document.getElementById('composerText');
    const composerSubmit = document.getElementById('composerSubmit');
    const composerVideoBtn = document.getElementById('composerVideoBtn');
    const composerImageBtn = document.getElementById('composerImageBtn');
    const composerFileInput = document.getElementById('composerFileInput');
    const composerUploadProgress = document.getElementById('composerUploadProgress');

    if (!composerText) return;

    composerText.addEventListener('input', () => {
        composerSubmit.disabled = composerText.value.trim().length === 0;
    });

    composerVideoBtn.addEventListener('click', () => {
        composerFileInput.accept = 'video/*';
        composerFileInput.click();
    });

    composerImageBtn.addEventListener('click', () => {
        composerFileInput.accept = 'image/*';
        composerFileInput.click();
    });

    composerFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            composerUploadProgress.classList.remove('is-error');
            composerUploadProgress.style.display = 'flex';
            composerUploadProgress.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
            if (file.type.startsWith('video/')) {
                const result = await uploadVideo(file);
                pendingMedia = { url: result.url, type: 'video' };
                composerUploadProgress.innerHTML = '<i class="fas fa-circle-check"></i> Video attached!';
            } else {
                pendingMedia = { file: file, type: 'image' };
                composerUploadProgress.innerHTML = '<i class="fas fa-circle-check"></i> Image attached!';
            }
            setTimeout(() => {
                composerUploadProgress.style.display = 'none';
            }, 3000);
        } catch (err) {
            composerUploadProgress.classList.add('is-error');
            composerUploadProgress.innerHTML = '<i class="fas fa-circle-exclamation"></i> ' + err.message;
        } finally {
            composerFileInput.value = '';
        }
    });

    composerSubmit.addEventListener('click', async () => {
        const text = composerText.value.trim();
        if (!text) return;

        let mediaUrl = null;
        let mediaType = null;
        if (pendingMedia) {
            if (pendingMedia.type === 'video' && pendingMedia.url) {
                mediaUrl = pendingMedia.url;
                mediaType = 'video';
            } else if (pendingMedia.type === 'image' && pendingMedia.file) {
                const reader = new FileReader();
                const imageData = await new Promise((resolve) => {
                    reader.onload = (e) => resolve(e.target.result);
                    reader.readAsDataURL(pendingMedia.file);
                });
                mediaUrl = imageData;
                mediaType = 'image';
            }
            pendingMedia = null;
        }

        composerSubmit.disabled = true;
        composerSubmit.textContent = 'Posting...';

        try {
            await createPost(text, mediaUrl, mediaType);
            toast('Post published', 'success');
            composerText.value = '';
            composerSubmit.disabled = true;
            composerUploadProgress.style.display = 'none';
            await loadHomeFeed('homeFeed');
        } catch (err) {
            toast('Failed to post: ' + err.message, 'error');
        } finally {
            composerSubmit.disabled = false;
            composerSubmit.textContent = 'Post';
        }
    });
}

// ---- Navigation (self-contained) ----
async function navigateHomePage(page) {
    if (page === currentPage) return;
    currentPage = page;

    const content = document.getElementById('homeContent');
    if (!content) return;

    // Show/hide header and composer
    const header = document.getElementById('homeHeader');
    const composer = document.getElementById('homeComposer');
    const videoSection = document.getElementById('videoFeedContainer');
    if (header) header.style.display = page === 'home' ? 'block' : 'none';
    if (composer) composer.style.display = page === 'home' ? 'block' : 'none';
    if (videoSection) videoSection.style.display = page === 'home' ? 'block' : 'none';

    // Update bottom nav active state
    document.querySelectorAll('.bottom-nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });

    // Clear content
    content.innerHTML = '<div class="spinner" style="margin:40px auto;"></div>';

    try {
        if (page === 'home') {
            // Reload home
            renderHome();
            return;
        }

        if (page === 'search') {
            const module = await import('./search.js');
            module.renderSearch(content);
            return;
        }

        if (page === 'notifications') {
            const module = await import('./alerts.js');
            module.renderAlerts(content);
            return;
        }

        if (page === 'profile') {
            const module = await import('./profile.js');
            module.renderProfile(content);
            return;
        }

        content.innerHTML = `<div class="card" style="padding:40px;text-align:center;">Page "${page}" not found.</div>`;
    } catch (err) {
        content.innerHTML = `
            <div class="card" style="padding:40px;text-align:center;color:#dc2626;">
                <p>Failed to load page: ${err.message}</p>
                <button onclick="window.renderHome()" class="btn-primary">Go Home</button>
            </div>
        `;
    }
}

// ---- Cleanup ----
export function cleanupHome() {
    if (realtimeSubscription) {
        realtimeSubscription.unsubscribe();
        realtimeSubscription = null;
    }
}

window.renderHome = renderHome;
window.cleanupHome = cleanupHome;