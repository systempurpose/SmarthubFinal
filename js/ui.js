// ==================== GLOBALS ====================
let currentDeviceId = null;
let wizardStep = 0;
let lastUsbState = null; // Track last USB state for dashboard re-render
// ---- Persistent test results ----
window._hardwareTestResults = {};   // { testId: { status, message, passed } }
window._connectionTestResults = {}; // { testId: { status, message, passed } }
// ---- Load and apply settings from Supabase (if user is logged in) ----
window.loadAndApplySettings = async function() {
    try {
        // Get user ID from sb-utils
        const { getCurrentUserId } = await import('./sb-utils.js');
        const userId = getCurrentUserId();
        if (!userId) {
            console.log('[Settings] No user logged in – using localStorage defaults.');
            return;
        }

        const { loadSettingsWithFallback } = await import('./settings-sb.js');
        const settings = await loadSettingsWithFallback(userId);

        if (settings) {
            applyTheme(settings);
            applyLanguage(settings.language);
            console.log('[Settings] Applied from Supabase:', settings);
        } else {
            console.log('[Settings] No settings found in Supabase – using localStorage.');
        }
    } catch (e) {
        console.warn('[Settings] Failed to load from Supabase:', e);
        // Fallback: try localStorage directly
        try {
            const stored = localStorage.getItem('smartHubSettings');
            if (stored) {
                const settings = JSON.parse(stored);
                applyTheme(settings);
                applyLanguage(settings.language);
                console.log('[Settings] Applied from localStorage fallback.');
            }
        } catch (e2) { /* ignore */ }
    }
};
// Expose save/load functions globally
// Expose storage functions globally
window.saveStorageResults = saveStorageResults;
window.loadStorageResults = loadStorageResults;
window.renderStorageResults = renderStorageResults;

// Also for app scan
window.saveAppScanResults = saveAppScanResults;
window.loadAppScanResults = loadAppScanResults;
window.renderAppScanResults = renderAppScanResults;

window.saveHardwareResults = saveHardwareResults;
window.loadHardwareResults = loadHardwareResults;

window.saveConnectionResults = saveConnectionResults;
window.loadConnectionResults = loadConnectionResults;

window.saveAdvancedResults = saveAdvancedResults;
window.loadAdvancedResults = loadAdvancedResults;



function openTutorial() {
    // Replace the URL with your actual tutorial video
 
    window.open('https://www.youtube.com/watch?v=6KbKqQVJXcQ', '_blank');
}

// ==================== SIDEBAR HIGHLIGHT ====================
function setActiveNav(page) {
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    const target = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (target) target.classList.add('active');
}

function toggleDeviceSections(show) {
    const deviceCard = document.getElementById('device-info-card');
    const statusBar = document.getElementById('status-bar');
    if (deviceCard) {
        deviceCard.style.display = show ? 'flex' : 'none';
    }
    if (statusBar) {
        statusBar.style.display = show ? 'grid' : 'none';
    }
}
// ---- Apply full theme (accent, background, text) ----
// ---- Apply full theme (accent, background, card, text) ----
function applyTheme(settings) {
    // ---- 1. READ SETTINGS ----
    const accent = settings.themeColor || '#0d6efd';
    const btnColor = settings.buttonColor || accent;
    const bg = settings.bgColor || '#ffffff';
    const cardBg = settings.cardColor || '#ffffff';
    const text = settings.textColor || '#1f2937';
    const buttonTextColor = getContrastColor(btnColor); // black or white based on button background

    // Store for later use
    window._activeTheme = settings;

    // ---- 2. SET CSS CUSTOM PROPERTIES ----
    document.documentElement.style.setProperty('--primary-color', accent);
    document.documentElement.style.setProperty('--primary-color-dark', adjustColor(accent, -20));
    document.documentElement.style.setProperty('--button-color', btnColor);
    document.documentElement.style.setProperty('--button-color-dark', adjustColor(btnColor, -18));
    document.documentElement.style.setProperty('--button-text-color', buttonTextColor);
    document.documentElement.style.setProperty('--bg-color', bg);
    document.documentElement.style.setProperty('--card-color', cardBg);
    document.documentElement.style.setProperty('--text-color', text);

    // ---- 3. APPLY TO BODY & MAIN CONTAINERS ----
    document.body.style.backgroundColor = bg;
    document.body.style.color = text;

    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.style.backgroundColor = bg;
        mainContent.style.color = text;
    }

    const pageContent = document.getElementById('pageContent');
    if (pageContent) {
        pageContent.style.backgroundColor = bg;
        pageContent.style.color = text;
    }

    // ---- 4. SIDEBAR ----
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.style.color = text;
        sidebar.querySelectorAll('a, span, div, .nav-item, .sidebar-footer, .connection-status, .auth-email, .auth-role').forEach(el => {
            if (!el.style.color) {
                el.style.color = text;
            }
        });
        const header = sidebar.querySelector('.sidebar-header h2');
        if (header) header.style.color = text;
    }

    // ---- 5. SWEEP INLINE STYLES (Fixes "white cards" issue) ----
    // Use the existing sweepThemeColors function (it's defined later in your file)
    // If you don't have it, define it (I'll include it below for completeness).
    if (typeof sweepThemeColors === 'function') {
        const colorsObj = { accent, btnColor, bgColor: bg, cardColor: cardBg, textColor: text };
        sweepThemeColors(document.body, colorsObj);
        document.querySelectorAll('.modal, .modal-content, .modal-header, .modal-body, .modal-footer').forEach(el => {
            sweepThemeColors(el, colorsObj);
        });
        const side = document.querySelector('.sidebar');
        if (side) sweepThemeColors(side, colorsObj);
        const header = document.querySelector('header.app-header');
        if (header) sweepThemeColors(header, colorsObj);
    } else {
        // Fallback: use the inline sweeper (you already have one inside applyTheme)
        // I'll include a simplified version here to avoid breaking.
        sweepInlineStyles(document.body);
    }

    // ---- 6. CARDS & PANELS (force card background and text color) ----
    document.querySelectorAll('.card, .info-card, .status-card, .test-card, .action-card, .metric, .health-card, .summary-card, .overview-item').forEach(el => {
        el.style.backgroundColor = cardBg;
        el.style.color = text;
        el.querySelectorAll('div, span, p, h1, h2, h3, h4, h5, h6, label, strong, .item-label, .item-value').forEach(child => {
            child.style.color = text;
        });
    });

    // ---- 7. MODALS ----
    document.querySelectorAll('.modal .modal-content, .modal .modal-body, .modal .modal-header, .modal .modal-footer').forEach(el => {
        el.style.backgroundColor = cardBg;
        el.style.color = text;
        el.querySelectorAll('h3, p, span, label, div').forEach(child => {
            if (!child.style.color) {
                child.style.color = text;
            }
        });
    });

    // ---- 8. PRIMARY BUTTONS (use dedicated button color and contrast text) ----
    document.querySelectorAll('.btn-primary, button.primary, .auth-login-btn, #saveSettingsBtn, .auth-login-btn').forEach(btn => {
        btn.style.setProperty('background', btnColor, 'important');
        btn.style.setProperty('border-color', btnColor, 'important');
        btn.style.setProperty('color', buttonTextColor, 'important');
    });

    // ---- 9. SECONDARY BUTTONS ----
    document.querySelectorAll('.btn-secondary, #resetSettingsBtn, .btn-secondary button').forEach(btn => {
        if (!btn.style.background) {
            btn.style.borderColor = text + '30';
            btn.style.color = text;
        }
    });

    console.log('[Theme] Applied:', { accent, btnColor, bg, cardBg, text, buttonTextColor });
}

// Helper: inline sweeper (fallback if sweepThemeColors not defined)
function sweepInlineStyles(root) {
    if (!root) return;
    // This is the same as your existing sweeper – you can keep it.
    // (I'm not re‑implementing it here for brevity; your current code already has it.)
}

// ---- Helper to darken a hex color (used for gradients) ----
function adjustColor(hex, percent) {
    let r, g, b;
    if (hex.startsWith('#')) {
        const full = hex.length === 7 ? hex : `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
        r = parseInt(full.slice(1,3), 16);
        g = parseInt(full.slice(3,5), 16);
        b = parseInt(full.slice(5,7), 16);
    } else {
        return '#0b5ed7';
    }
    const darken = (val) => Math.max(0, Math.min(255, val + percent));
    return `#${darken(r).toString(16).padStart(2,'0')}${darken(g).toString(16).padStart(2,'0')}${darken(b).toString(16).padStart(2,'0')}`;
}

function getContrastColor(hex) {
    if (!hex) return '#ffffff';
    let cleaned = String(hex).trim();
    if (cleaned.startsWith('#')) cleaned = cleaned.slice(1);
    if (cleaned.length === 3) {
        cleaned = cleaned.split('').map(ch => ch + ch).join('');
    }
    if (cleaned.length !== 6) return '#ffffff';
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? '#000000' : '#ffffff';
}
let usbState = null; // track current USB state

const PAGE_REQUIRES_ADB = {
    'device-info': true,
    'hardware-tests': true,
    'connection-troubleshoot': true,
    'ai-conclusion': true,
    'repairs': false,    // ← set to false
    'bsod': false,
    'advanced': false,
    'dashboard': false,
};
// ==================== CUSTOM ALERT & CONFIRM ====================
// ==================== CUSTOM ALERT & CONFIRM ====================
// ---- Show custom alert with modern design ----
function showAlert(title, message, tone = 'info') {
    return new Promise((resolve) => {
        let modal = document.getElementById('alertModal');
        if (!modal) {
            const modalHtml = `
                <div id="alertModal" class="modal" style="display: none; z-index: 99999; align-items: center; justify-content: center;">
                    <div class="modal-content" style="
                        max-width: 420px;
                        width: 90%;
                        border-radius: 20px;
                        overflow: hidden;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.25);
                        background: #ffffff;
                        transform: scale(0.95);
                        transition: transform 0.2s ease;
                    ">
                        <!-- Header -->
                        <div id="alertModalHeader" style="
                            padding: 20px 24px 16px 24px;
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            border-bottom: 1px solid rgba(0,0,0,0.06);
                        ">
                            <span id="alertModalIcon" style="font-size: 28px; line-height: 1;">✅</span>
                            <h3 id="alertModalTitle" style="
                                margin: 0;
                                font-size: 18px;
                                font-weight: 700;
                                color: #0f172a;
                            ">Success</h3>
                        </div>
                        <!-- Body -->
                        <div style="padding: 24px 28px 20px 28px;">
                            <p id="alertModalMessage" style="
                                margin: 0;
                                font-size: 15px;
                                line-height: 1.6;
                                color: #334155;
                                white-space: pre-wrap;
                                word-break: break-word;
                            "></p>
                        </div>
                        <!-- Footer -->
                        <div style="padding: 12px 28px 24px 28px; display: flex; justify-content: flex-end;">
                            <button id="alertModalOkBtn" class="btn-primary" style="
                                padding: 10px 28px;
                                border-radius: 10px;
                                font-weight: 600;
                                font-size: 14px;
                                cursor: pointer;
                                background: #0d6efd;
                                border: none;
                                color: white;
                                transition: background 0.15s ease, transform 0.1s ease;
                            "
                            onmouseover="this.style.background='#0b5ed7'"
                            onmouseout="this.style.background='#0d6efd'"
                            onmousedown="this.style.transform='scale(0.97)'"
                            onmouseup="this.style.transform='scale(1)'"
                            >OK</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modal = document.getElementById('alertModal');
        }

        // ---- Set content and styling based on tone ----
        const icon = document.getElementById('alertModalIcon');
        const titleEl = document.getElementById('alertModalTitle');
        const msgEl = document.getElementById('alertModalMessage');
        const header = document.getElementById('alertModalHeader');

        // Determine colors and icon
        let headerBg = '#f8fafc';
        let iconChar = 'ℹ️';
        let titleText = title || 'Info';
        let borderColor = '#e2e8f0';
        let btnColor = '#0d6efd';

        if (tone === 'success' || title.toLowerCase().includes('success')) {
            headerBg = '#f0fdf4';
            iconChar = '✅';
            borderColor = '#86efac';
            btnColor = '#16a34a';
        } else if (tone === 'error' || title.toLowerCase().includes('error') || title.toLowerCase().includes('failed')) {
            headerBg = '#fef2f2';
            iconChar = '❌';
            borderColor = '#fca5a5';
            btnColor = '#dc2626';
        } else {
            headerBg = '#eff6ff';
            iconChar = 'ℹ️';
            borderColor = '#93c5fd';
            btnColor = '#0d6efd';
        }

        // Apply styles
        header.style.background = headerBg;
        header.style.borderBottomColor = borderColor;
        icon.textContent = iconChar;
        titleEl.textContent = title || 'Info';
        msgEl.textContent = message || '';

        // Update button color
        const okBtn = document.getElementById('alertModalOkBtn');
        okBtn.style.background = btnColor;
        okBtn.onmouseover = () => { okBtn.style.background = adjustColor(btnColor, -15); };
        okBtn.onmouseout = () => { okBtn.style.background = btnColor; };

        // Show modal with animation
        modal.style.display = 'flex';
        const content = modal.querySelector('.modal-content');
        content.style.transform = 'scale(1)';

        // ---- Close handler ----
        const closeModal = () => {
            modal.style.display = 'none';
            resolve();
        };

        // Replace button to avoid multiple listeners
        const newOk = okBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOk, okBtn);
        newOk.addEventListener('click', closeModal);

        // Click outside to close (optional – can be disabled)
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        }, { once: true });
    });
}

// Helper to darken a hex color (used for button hover)
function adjustColor(hex, percent) {
    let r, g, b;
    if (hex.startsWith('#')) {
        const full = hex.length === 7 ? hex : `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
        r = parseInt(full.slice(1,3), 16);
        g = parseInt(full.slice(3,5), 16);
        b = parseInt(full.slice(5,7), 16);
    } else {
        return '#0b5ed7';
    }
    const darken = (val) => Math.max(0, Math.min(255, val + percent));
    return `#${darken(r).toString(16).padStart(2,'0')}${darken(g).toString(16).padStart(2,'0')}${darken(b).toString(16).padStart(2,'0')}`;
}

function showConfirm(title, message, options = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        if (!modal) {
            const modalHtml = `
                <div id="confirmModal" class="modal" style="display: none; z-index: 99999;">
                    <div class="modal-content" style="max-width: 480px; width: 92%; border-radius: 16px; padding: 0; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid #e5e7eb; background: #f8fafc;">
                            <h3 id="confirmModalTitle" style="margin: 0; font-size: 17px; font-weight: 600; color: #1f2937; display: flex; align-items: center; gap: 10px;">
                                <span id="confirmModalIcon" style="font-size: 20px;">❓</span>
                                <span id="confirmModalTitleText">Confirm</span>
                            </h3>
                            <span class="close-button" id="confirmModalClose" style="cursor: pointer; font-size: 24px; color: #9ca3af; line-height: 1; padding: 0 4px;">&times;</span>
                        </div>
                        <div class="modal-body" id="confirmModalBody" style="padding: 24px 24px 16px 24px; background: #ffffff;">
                            <p id="confirmModalMessage" style="margin: 0; font-size: 15px; line-height: 1.6; color: #374151; white-space: pre-wrap; word-break: break-all;"></p>
                            <div id="confirmModalExtra" style="margin-top: 12px;"></div>
                        </div>
                        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 12px 24px 20px 24px; background: #ffffff; border-top: 1px solid #f1f3f5;">
                            <button id="confirmModalNoBtn" class="btn-secondary" style="padding: 8px 24px; border-radius: 8px; font-weight: 500; font-size: 14px; cursor: pointer; background: #f1f3f5; border: 1px solid #e5e7eb; color: #374151;">
                                ${options.noText || 'No'}
                            </button>
                            <button id="confirmModalYesBtn" class="btn-primary" style="padding: 8px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; background: ${options.danger ? '#dc2626' : '#0d6efd'}; border: none; color: white; box-shadow: 0 2px 8px ${options.danger ? 'rgba(220,38,38,0.3)' : 'rgba(13,110,253,0.3)'};">
                                ${options.yesText || 'Yes'}
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }
        const modalEl = document.getElementById('confirmModal');
        const titleEl = document.getElementById('confirmModalTitleText');
        const iconEl = document.getElementById('confirmModalIcon');
        const msgEl = document.getElementById('confirmModalMessage');
        const extraEl = document.getElementById('confirmModalExtra');
        const yesBtn = document.getElementById('confirmModalYesBtn');
        const noBtn = document.getElementById('confirmModalNoBtn');
        const closeBtn = document.getElementById('confirmModalClose');

        // Set content
        titleEl.textContent = title || 'Confirm';
        iconEl.textContent = options.icon || '❓';
        msgEl.innerHTML = message || 'Are you sure?';
        extraEl.innerHTML = options.extra || '';

        // Handle custom file path styling
        if (options.isPath) {
            msgEl.style.background = '#f8fafc';
            msgEl.style.padding = '12px 16px';
            msgEl.style.borderRadius = '8px';
            msgEl.style.fontFamily = 'monospace';
            msgEl.style.fontSize = '13px';
            msgEl.style.color = '#1e293b';
            msgEl.style.wordBreak = 'break-all';
            msgEl.style.border = '1px solid #e5e7eb';
        } else {
            msgEl.style.background = 'transparent';
            msgEl.style.padding = '0';
            msgEl.style.fontFamily = 'inherit';
            msgEl.style.fontSize = '15px';
            msgEl.style.border = 'none';
        }

        modalEl.style.display = 'flex';

        const resolveAndClose = (result) => {
            modalEl.style.display = 'none';
            resolve(result);
        };

        const newYes = yesBtn.cloneNode(true);
        const newNo = noBtn.cloneNode(true);
        const newClose = closeBtn.cloneNode(true);
        yesBtn.parentNode.replaceChild(newYes, yesBtn);
        noBtn.parentNode.replaceChild(newNo, noBtn);
        closeBtn.parentNode.replaceChild(newClose, closeBtn);

        newYes.addEventListener('click', () => resolveAndClose(true));
        newNo.addEventListener('click', () => resolveAndClose(false));
        newClose.addEventListener('click', () => resolveAndClose(false));
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) resolveAndClose(false);
        }, { once: true });
    });
}


// Device info will be updated when a device is selected.
// ==================== API HELPER ====================
const BACKEND_URL = (() => {
    if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
        return window.location.origin;
    }
    return 'http://127.0.0.1:3333';
})();
window.BACKEND_URL = BACKEND_URL;   // ← ADD THIS LINE


async function fetchWithTimeout(url, options = {}, timeoutMs = 6000) {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);
    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
        });
    } catch (err) {
        if (timedOut || controller.signal.aborted) {
            throw new Error(`Request timed out after ${timeoutMs} ms`);
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
}
// ---- Global navigation helper ----
// ---- Global navigation helper ----
// ---- Global navigation helper ----
window.navigateTo = function(page) {
    // If the page is handled by the sidebar nav items, click the nav item
    const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (navItem) {
        navItem.click();
        return;
    }

    // Handle pages that are not in the sidebar (bottom nav only)
    if (page === 'search') {
        import('./search.js').then(module => {
            if (module.renderSearch) module.renderSearch();
        }).catch(err => {
            console.error('Failed to load search:', err);
            document.getElementById('pageContent').innerHTML = `
                <div class="card" style="padding:40px;text-align:center;">
                    <p>Could not load Search: ${err.message}</p>
                </div>
            `;
        });
        return;
    }

    if (page === 'notifications') {
        import('./alerts.js').then(module => {
            if (module.renderAlerts) module.renderAlerts();
        }).catch(err => {
            console.error('Failed to load notifications:', err);
            document.getElementById('pageContent').innerHTML = `
                <div class="card" style="padding:40px;text-align:center;">
                    <p>Could not load Notifications: ${err.message}</p>
                </div>
            `;
        });
        return;
    }

    if (page === 'profile') {
        // Load the new social profile module
        import('./profile.js').then(module => {
            if (module.renderProfile) module.renderProfile();
        }).catch(err => {
            console.warn('New profile failed, falling back to old:', err);
            // Fallback to old profile
            if (typeof renderProfilePage === 'function') {
                renderProfilePage();
            } else {
                document.getElementById('pageContent').innerHTML = `
                    <div class="card" style="padding:40px;text-align:center;">
                        <p>Could not load Profile: ${err.message}</p>
                    </div>
                `;
            }
        });
        return;
    }

    // Fallback: try to render page directly
    if (typeof window.renderPage === 'function') {
        window.renderPage(page);
    } else {
        console.warn('No navigation target for page:', page);
        // Show a friendly message
        document.getElementById('pageContent').innerHTML = `
            <div class="card" style="padding:40px;text-align:center;">
                <p>Page "${page}" is not available.</p>
            </div>
        `;
    }
};
function showLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('active');
        // Force a reflow to ensure the transition starts
        overlay.offsetHeight;
    } else {
        console.warn('Loading overlay not found in DOM');
    }
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}
// ==================== MODERN SPINNER HELPER ====================
function getModernSpinnerHTML(text = 'Loading...') {
    return `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30px 0;">
            <div style="position: relative; width: 60px; height: 60px; display: flex; justify-content: center; align-items: center;">
                <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; border: 4px solid transparent; border-top-color: #3b82f6; border-right-color: #60a5fa; border-bottom-color: #93c5fd; animation: spin 0.9s cubic-bezier(0.65, 0, 0.35, 1) infinite;"></div>
                <div style="position: absolute; width: 80%; height: 80%; border-radius: 50%; border: 4px solid transparent; border-top-color: #7c3aed; border-right-color: #a78bfa; border-bottom-color: #c4b5fd; animation: spin 1.1s cubic-bezier(0.65, 0, 0.35, 1) infinite reverse;"></div>
                <div style="position: absolute; width: 60%; height: 60%; border-radius: 50%; border: 4px solid transparent; border-top-color: #10b981; border-right-color: #34d399; border-bottom-color: #6ee7b7; animation: spin 1.3s cubic-bezier(0.65, 0, 0.35, 1) infinite;"></div>
                <div style="width: 12px; height: 12px; background: #3b82f6; border-radius: 50%; animation: pulse 1.2s ease-in-out infinite; z-index: 1;"></div>
            </div>
            <p style="margin-top: 16px; color: #6B7280; font-weight: 500; font-size: 14px;">${escapeHtml(text)}</p>
        </div>
    `;
}
// ==================== BRAND ICON MAPPING ====================
function getBrandIcon(brand) {
    const brandMap = {
        'samsung': 'fab fa-samsung',
        'xiaomi': 'fas fa-mobile-alt',
        'redmi': 'fas fa-mobile-alt',
        'huawei': 'fas fa-mobile-alt',
        'honor': 'fas fa-mobile-alt',
        'oneplus': 'fas fa-mobile-alt',
        'google': 'fab fa-google',
        'pixel': 'fab fa-google',
        'motorola': 'fas fa-mobile-alt',
        'lenovo': 'fas fa-mobile-alt',
        'nokia': 'fas fa-mobile-alt',
        'sony': 'fab fa-sony',
        'lg': 'fas fa-mobile-alt',
        'htc': 'fas fa-mobile-alt',
        'oppo': 'fas fa-mobile-alt',
        'vivo': 'fas fa-mobile-alt',
        'realme': 'fas fa-mobile-alt',
        'tecno': 'fas fa-mobile-alt',
        'infinix': 'fas fa-mobile-alt',
        'itel': 'fas fa-mobile-alt',
        'asus': 'fab fa-asus',
        'acer': 'fas fa-mobile-alt'
    };
    const key = brand.toLowerCase().trim();
    return brandMap[key] || 'fas fa-mobile-alt';
}

function getBrandColor(brand) {
    const colorMap = {
        'samsung': '#1428A0',
        'xiaomi': '#FF6700',
        'redmi': '#FF6700',
        'huawei': '#FF0000',
        'honor': '#000000',
        'oneplus': '#EB0028',
        'google': '#4285F4',
        'pixel': '#4285F4',
        'motorola': '#64B72C',
        'lenovo': '#E2231A',
        'nokia': '#124191',
        'sony': '#000000',
        'lg': '#A50034',
        'oppo': '#008000',
        'vivo': '#415FFF',
        'realme': '#FF8000',
        'tecno': '#00A3E0',
        'infinix': '#00A3E0',
        'itel': '#00A3E0',
        'asus': '#0068B4',
        'acer': '#83B81A'
    };
    const key = brand.toLowerCase().trim();
    return colorMap[key] || '#6B7280';
}

// ========================================================================
// DEVICE INFO CARD — self-contained: every helper this file needs lives
// in this same file. (Previous crash was a ReferenceError because
// showDeviceInfoSkeleton()/statPill()/etc. were defined in a separate
// snippet that didn't make it into the project — that throws BEFORE the
// try/catch even starts, so the card is left showing its raw static
// placeholder text with nothing visibly wrong in the UI.)
// ========================================================================

const BRAND_LOGO_MAP = {
    'alcatel': 'Alcatel-Logo.png',
    'asus': 'Asus-Logo.png',
    'blackberry': 'Blackberry-logo.png',
    'cat': 'CAT-logo.png',
    'doogee': 'Doogee-Logo.png',
    'energizer': 'Energizer-logo.png',
    'google': 'Google-Logo.png',
    'htc': 'HTC-logo.png',
    'honor': 'Honor-Logo.png',
    'huawei': 'Huawei-Logo.png',
    'infinix': 'Infinix-Logo.png',
    'itel': 'Itel-Logo.png',
    'lg': 'LG-Logo.png',
    'lenovo': 'Lenovo-logo.png',
    'meizu': 'Meizu-Logo.png',
    'nokia': 'Nokia-Logo.png',
    'oneplus': 'OnePlus-Logo.png',
    'oppo': 'Oppo-logo.png',
    'realme': 'Realme-Logo.png',
    'samsung': 'Samsung-Logo-2.png',
    'sharp': 'Sharp-logo.png',
    'sony': 'Sony-logo.png',
    'tcl': 'TCL-Logo.png',
    'tecno': 'Tecno-Mobile-Logo.png',
    'ulefone': 'Ulefone-Logo.png',
    'vivo': 'Vivo-Logo.png',
    'vodafone': 'Vodafone-logo.png',
    'xiaomi': 'Xiaomi-logo.png',
    'zte': 'ZTE-Logo.png'
};

// Fallback so this file works even if a project-wide getBrandColor() isn't loaded.
function getBrandColorSafe(brandKey) {
    if (typeof getBrandColor === 'function') {
        try { return getBrandColor(brandKey); } catch (e) { /* fall through */ }
    }
    return '#6B7280';
}

function statPill(icon, text) {
    return `
        <span style="display:inline-flex; align-items:center; gap:6px; font-size:13px; color:#4b5563; background:#f8fafc; border:1px solid #eef1f5; padding:4px 10px; border-radius:999px;">
            <i class="fas ${icon}" style="font-size:11px; color:#9ca3af;"></i>${text}
        </span>
    `;
}

function formatPatchDate(raw) {
    if (!raw || raw === 'Unknown') return 'Unknown';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
}

function showDeviceInfoSkeleton() {
    const card = document.getElementById('device-info-card');
    if (!card) return;
    card.style.display = 'flex';
    card.style.opacity = '1';
    card.dataset.state = 'loading';

    const shimmer = 'background: linear-gradient(90deg,#eef1f5 25%,#e2e8f0 37%,#eef1f5 63%); background-size:400% 100%; animation: dviShimmer 1.4s ease infinite; border-radius:6px;';
    if (!document.getElementById('dviShimmerKeyframes')) {
        const style = document.createElement('style');
        style.id = 'dviShimmerKeyframes';
        style.textContent = `@keyframes dviShimmer {0%{background-position:100% 0} 100%{background-position:0 0}}`;
        document.head.appendChild(style);
    }

    const brandEl = document.getElementById('brand-icon');
    if (brandEl) brandEl.innerHTML = `<div style="width:56px; height:56px; border-radius:14px; ${shimmer}"></div>`;

    const modelEl = document.getElementById('device-model');
    if (modelEl) modelEl.innerHTML = `<span style="display:inline-block; width:140px; height:18px; ${shimmer}"></span>`;

    const brandLabel = document.getElementById('device-brand');
    if (brandLabel) brandLabel.textContent = '';

    ['device-android', 'device-security', 'device-resolution'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<span style="display:inline-block; width:80px; height:14px; ${shimmer}"></span>`;
    });
}

function showDeviceInfoError(message) {
    const card = document.getElementById('device-info-card');
    if (!card) return;
    card.style.display = 'flex';
    card.dataset.state = 'error';
    card.innerHTML = `
        <div style="display:flex; align-items:center; gap:14px; width:100%;">
            <div style="width:48px; height:48px; border-radius:12px; background:#fef2f2; color:#dc2626; display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0;">
                <i class="fas fa-triangle-exclamation"></i>
            </div>
            <div>
                <div style="font-weight:600; color:#1e293b; font-size:15px;">Couldn't load device info</div>
                <div style="font-size:13px; color:#6B7280; margin-top:2px;">${message || 'The connected device may have been disconnected.'}</div>
            </div>
        </div>
    `;
}

async function updateDeviceInfo() {
    // Everything lives inside one try/catch now — if ANY helper above is
    // somehow still missing, we land in the catch and show a visible error
    // banner instead of silently freezing on the static placeholder text.
    try {
        // ---- Safety: no device – hide the card ----
        if (!currentDeviceId) {
            console.warn('[DeviceInfo] No device connected – hiding card.');
            const card = document.getElementById('device-info-card');
            if (card) card.style.display = 'none';
            return;
        }

        showDeviceInfoSkeleton();

        console.log('[DeviceInfo] Fetching device data for:', currentDeviceId);
        const res = await fetch(`${BACKEND_URL}/device/${currentDeviceId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        let rawText = await res.text();
        console.log('[DeviceInfo] Raw response length:', rawText.length);

        try {
            const parsedJson = JSON.parse(rawText);
            if (typeof parsedJson === 'string') rawText = parsedJson;
        } catch (e) {}

        const props = {};
        const lines = rawText.split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const match = trimmed.match(/^\[(.*?)\]:\s*\[(.*?)\]$/);
            if (match) props[match[1]] = match[2];
        }

        console.log('[DeviceInfo] Parsed props:', Object.keys(props).length, 'keys');

        // ---- Extract values with fallbacks ----
        const manufacturer = props['ro.product.manufacturer'] || props['ro.product.vendor.manufacturer'] || props['ro.product.brand'] || 'Unknown';
        const model = props['ro.product.model'] || props['ro.product.vendor.model'] || 'Device';
        const androidVersion = props['ro.build.version.release'] || props['ro.build.version.release_or_codename'] || 'Unknown';
        const patch = props['ro.build.version.security_patch'] || 'Unknown';

        // ---- Resolution (fallback to wm size) ----
        let width = props['sys.logical.width'] || '';
        let height = props['sys.logical.height'] || '';
        if (!width || !height) {
            try {
                const wmRes = await fetch(`/adb-shell`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deviceId: currentDeviceId, command: 'wm size' })
                });
                if (wmRes.ok) {
                    const wmData = await wmRes.json();
                    const wmOutput = wmData.output || '';
                    const match = wmOutput.match(/(?:Physical size|Override size):\s*(\d+)x(\d+)/i);
                    if (match) {
                        width = match[1];
                        height = match[2];
                    }
                }
            } catch (e) {
                console.warn('[DeviceInfo] wm size fallback failed:', e);
            }
        }
        const resolution = (width && height) ? `${width} × ${height}` : 'Unknown';

        // ---- Brand badge ----
        const brandCandidates = [
            manufacturer,
            props['ro.product.brand'],
            props['ro.product.vendor.brand'],
            props['ro.product.name'],
            props['ro.product.marketname']
        ].filter(Boolean).map(value => String(value).toLowerCase().trim());
        const brandKey = brandCandidates.find(key => BRAND_LOGO_MAP[key]) || brandCandidates[0] || 'unknown';
        const color = getBrandColorSafe(brandKey);
        const brandEl = document.getElementById('brand-icon');
        if (brandEl) {
            const logoFile = BRAND_LOGO_MAP[brandKey];
            const initial = (manufacturer || '?').trim().charAt(0).toUpperCase();
            const logoUrl = logoFile ? new URL(`../android_logo/${logoFile}`, window.location.href).href : '';

            brandEl.innerHTML = `
                <div style="width:56px; height:56px; border-radius:14px; background:${logoFile ? '#f8fafc' : color}; border:1px solid #eef1f5; display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0;">
                    ${logoFile
                        ? `<img id="brandLogoImg" alt="${manufacturer}" style="height:34px; width:auto; max-width:44px; object-fit:contain;">`
                        : `<span style="font-size:22px; font-weight:700; color:#fff;">${initial}</span>`
                    }
                </div>
            `;
            if (logoFile) {
                const img = document.getElementById('brandLogoImg');
                if (img) {
                    img.addEventListener('error', () => {
                        const parent = img.parentElement;
                        if (parent) {
                            parent.style.background = color;
                            parent.innerHTML = `<span style="font-size:22px; font-weight:700; color:#fff;">${initial}</span>`;
                        }
                    }, { once: true });
                    img.src = logoUrl;
                }
            }
        }

        // ---- Update DOM ----
        const modelEl = document.getElementById('device-model');
        if (modelEl) modelEl.textContent = model;

        const brandLabel = document.getElementById('device-brand');
        if (brandLabel) brandLabel.textContent = manufacturer;

        const androidEl = document.getElementById('device-android');
        if (androidEl) androidEl.innerHTML = statPill('fa-mobile-screen', `Android ${androidVersion}`);

        const patchEl = document.getElementById('device-security');
        if (patchEl) patchEl.innerHTML = statPill('fa-shield-halved', `Patch: ${formatPatchDate(patch)}`);

        const resEl = document.getElementById('device-resolution');
        if (resEl) resEl.innerHTML = statPill('fa-expand', resolution);

        // ---- Reveal the card ----
        const card = document.getElementById('device-info-card');
        if (card) {
            card.style.display = 'flex';
            card.dataset.state = 'ready';
            card.style.opacity = '1';
        }

        console.log('[DeviceInfo] ✅ Updated device info card:', { model, manufacturer, androidVersion, patch, resolution });

        // ---- Update status bar ----
        if (typeof updateStatusBar === 'function') {
            await updateStatusBar();
        }

    } catch (err) {
        console.error('[DeviceInfo] Failed:', err);
        showDeviceInfoError(err.message);
    }
}
async function updateStatusBar() {
    try {
        console.log('[StatusBar] Fetching hardware data...');
        // Use apiCall() which adds the /api prefix automatically
        const [battery, storage, ram] = await Promise.all([
            apiCall(`/hardware/battery?deviceId=${currentDeviceId}`).catch(() => ({})),
            apiCall(`/hardware/storage?deviceId=${currentDeviceId}`).catch(() => ({})),
            apiCall(`/hardware/ram?deviceId=${currentDeviceId}`).catch(() => ({}))
        ]);

        console.log('[StatusBar] Battery raw:', battery);
        console.log('[StatusBar] Storage raw:', storage);
        console.log('[StatusBar] RAM raw:', ram);

        // ---- BATTERY ----
        let batteryPct = 0;
        if (battery && typeof battery.level === 'number') batteryPct = battery.level;
        else if (battery && typeof battery.level === 'string') batteryPct = parseFloat(battery.level) || 0;
        else if (battery && battery.percent !== undefined) batteryPct = parseFloat(battery.percent) || 0;
        batteryPct = Math.min(100, Math.max(0, batteryPct));

        // ---- STORAGE ----
        let storagePct = 0;
        let storageText = 'N/A';
        if (storage) {
            // Helper to parse "5.6G" or "3.2 GB" to bytes
            function parseSizeToBytes(str) {
                if (!str || str === '?') return 0;
                const trimmed = String(str).trim();
                const match = trimmed.match(/^([\d.]+)\s*([GMK]?)/i);
                if (!match) return 0;
                let val = parseFloat(match[1]);
                const unit = (match[2] || '').toUpperCase();
                if (unit === 'G') return val * 1024 * 1024 * 1024;
                if (unit === 'M') return val * 1024 * 1024;
                if (unit === 'K') return val * 1024;
                return val; // assume bytes
            }
            const totalBytes = parseSizeToBytes(storage.total);
            const usedBytes = parseSizeToBytes(storage.used);
            if (totalBytes > 0 && usedBytes > 0) {
                storagePct = (usedBytes / totalBytes) * 100;
                storagePct = Math.min(100, Math.max(0, storagePct));
                storageText = Math.round(storagePct) + '%';
            } else if (storage.percent !== undefined) {
                storagePct = parseFloat(storage.percent) || 0;
                storageText = Math.round(storagePct) + '%';
            }
        }

        // ---- RAM ----
        let ramPct = 0;
        let ramText = 'N/A';
        if (ram) {
            function parseRamToBytes(str) {
                if (!str || str === '?') return 0;
                const trimmed = String(str).trim();
                const match = trimmed.match(/^([\d.]+)\s*([GMK]?)/i);
                if (!match) return 0;
                let val = parseFloat(match[1]);
                const unit = (match[2] || '').toUpperCase();
                if (unit === 'G') return val * 1024 * 1024 * 1024;
                if (unit === 'M') return val * 1024 * 1024;
                if (unit === 'K') return val * 1024;
                return val;
            }
            const totalBytes = parseRamToBytes(ram.total);
            const usedBytes = parseRamToBytes(ram.used);
            if (totalBytes > 0 && usedBytes > 0) {
                ramPct = (usedBytes / totalBytes) * 100;
                ramPct = Math.min(100, Math.max(0, ramPct));
                ramText = Math.round(ramPct) + '%';
            } else if (ram.percent !== undefined) {
                ramPct = parseFloat(ram.percent) || 0;
                ramText = Math.round(ramPct) + '%';
            }
        }

        // ---- Update DOM ----
        const batteryEl = document.getElementById('status-battery');
        const batteryBar = document.getElementById('status-battery-bar');
        const batterySummary = document.getElementById('device-battery-summary');
        if (batteryEl) batteryEl.textContent = Math.round(batteryPct) + '%';
        if (batteryBar) {
            batteryBar.style.width = batteryPct + '%';
            batteryBar.style.background = batteryPct < 20 ? '#EF4444' : batteryPct < 50 ? '#F59E0B' : '#10B981';
        }
        if (batterySummary) batterySummary.textContent = `🔋 ${Math.round(batteryPct)}%`;

        const storageEl = document.getElementById('status-storage');
        const storageBar = document.getElementById('status-storage-bar');
        if (storageEl) storageEl.textContent = storageText;
        if (storageBar) {
            storageBar.style.width = (storagePct > 0 ? storagePct : 0) + '%';
            storageBar.style.background = storagePct > 90 ? '#EF4444' : storagePct > 75 ? '#F59E0B' : '#3B82F6';
        }

        const ramEl = document.getElementById('status-ram');
        const ramBar = document.getElementById('status-ram-bar');
        if (ramEl) ramEl.textContent = ramText;
        if (ramBar) {
            ramBar.style.width = (ramPct > 0 ? ramPct : 0) + '%';
            ramBar.style.background = ramPct > 85 ? '#EF4444' : ramPct > 70 ? '#F59E0B' : '#8B5CF6';
        }

        // ---- Make cards clickable ----
        const statusCards = document.querySelectorAll('.status-card');
        const cardActions = [
            showBatteryModal,
            showStorageModal,
            showRamModal,
            showSecurityModal
        ];
        statusCards.forEach((card, index) => {
            card.removeEventListener('click', cardActions[index]);
            if (cardActions[index]) {
                card.addEventListener('click', cardActions[index]);
                card.style.cursor = 'pointer';
            }
        });

        console.log('[StatusBar] Updated: Battery', Math.round(batteryPct) + '%', 'Storage', storageText, 'RAM', ramText);
    } catch (err) {
        console.error('[StatusBar] Error:', err);
    }
}

async function apiCall(endpoint, options = {}) {
    const { timeoutMs = 6000, ...fetchOptions } = options;
    const response = await fetchWithTimeout(`${BACKEND_URL}/api${endpoint}`, {
        headers: { 'Content-Type': 'application/json', ...(fetchOptions.headers || {}) },
        ...fetchOptions,
    }, timeoutMs);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Produce a very short one-line summary of what the app has actually done
function summarizeAppBehavior(behavior) {
    let parts = [];
    if (behavior.installTime && behavior.installTime !== 'Unknown') {
        parts.push(`📅 Installed ${behavior.installTime}`);
    }
    const accesses = Array.isArray(behavior.permissionAccesses) ? behavior.permissionAccesses : [];
    const anyRequested = accesses.some(p =>
        typeof p.lastAccessTime === 'string' &&
        !p.lastAccessTime.includes('Never') &&
        !p.lastAccessTime.toLowerCase().includes('ignore')
    );
    if (anyRequested) {
        const requested = accesses
            .filter(p => !p.lastAccessTime.includes('Never') && !p.lastAccessTime.toLowerCase().includes('ignore'))
            .map(p => p.permission)
            .slice(0, 3);
        parts.push(`⚠️ requested ${requested.join(', ')}${requested.length >= 3 ? '…' : ''}`);
    } else {
        parts.push(`✅ never requested dangerous permissions`);
    }
    const used = behavior.lastUsed;
    if (used === 'Never' || used === 'Not available') {
        parts.push(`⏱️ never launched`);
    } else if (used && used !== 'Unknown') {
        parts.push(`⏱️ last used ${used}`);
    }
    return parts.join(' · ');
}
// Convert RSSI dBm to a short user-friendly label and simple bar indicator
function rssiToLabel(rssi) {
    // Treat invalid sentinel values as no signal
    if (rssi === null || rssi === undefined || rssi <= -127) {
        return { label: 'No signal', bars: '◯◯◯◯' , detailed: false };
    }
    // Stronger is closer to 0 (e.g., -30 is excellent)
    if (rssi >= -50) return { label: 'Excellent', bars: '▂▃▄▅', detailed: true };
    if (rssi >= -60) return { label: 'Good', bars: '▂▃▄◯', detailed: true };
    if (rssi >= -70) return { label: 'Fair', bars: '▂▃◯◯', detailed: true };
    if (rssi >= -80) return { label: 'Weak', bars: '▂◯◯◯', detailed: true };
    return { label: 'Very weak', bars: '◯◯◯◯', detailed: true };
}

function formatWifiStatus(wifi) {
    if (!wifi) {
        return {
            ssid: 'Not connected',
            status: 'No Wi-Fi info',
            signal: 'N/A',
            linkSpeed: 'N/A',
            frequency: 'N/A'
        };
    }
    let rawSsid = wifi.ssid && wifi.ssid !== '<unknown ssid>' ? String(wifi.ssid).trim() : '';
    if (rawSsid.includes(',') && rawSsid.toLowerCase().includes('bssid:')) {
        rawSsid = rawSsid.split(',')[0].trim();
    }
    const ssid = rawSsid || 'Not connected';
    const supplicant = (wifi.supplicantState || wifi.state || '').toString();
    const disconnected = /disconnect|disconnected|inactive|scanning|unknown/i.test(supplicant) || ssid === 'Not connected';
    const status = disconnected ? 'Disconnected' : (supplicant || 'Connected');
    const rssi = wifi.rssi;
    let signal = 'N/A';
    if (disconnected) {
        signal = 'Disconnected';
    } else if (rssi !== undefined && rssi !== null) {
        const label = rssiToLabel(rssi);
        signal = `${label.label} ${label.bars}`;
        if (label.detailed) signal += ` (${rssi} dBm)`;
    }
    return {
        ssid,
        status,
        signal,
        linkSpeed: wifi.linkSpeed ? `${wifi.linkSpeed} Mbps` : 'N/A',
        frequency: wifi.frequency ? `${wifi.frequency} MHz` : 'N/A'
    };
}

// ==================== CONNECTION STATUS ====================
async function fetchDevices() {
    const endpoints = [
        `${BACKEND_URL}/api/devices`,
        `${BACKEND_URL}/devices`
    ];
    for (const url of endpoints) {
        try {
            const res = await fetchWithTimeout(url, { headers: { 'Content-Type': 'application/json' } }, 6000);
            if (res.ok) {
                return await res.json();
            }
        } catch (err) {
            console.warn(`[fetchDevices] Failed to fetch from ${url}:`, err.message);
        }
    }
    // All attempts failed – return empty list so caller can use USB fallback
    console.warn('[fetchDevices] All endpoints failed, returning empty device list.');
    return { devices: [] };
}

// js/ui.js
function connectSSE() {
    const eventSource = new EventSource(`${BACKEND_URL}/api/events`);

    eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'deviceState') {
            // Update device status instantly
            currentDeviceId = data.deviceId;
            updateConnectionStatus();  // now instant, no delay
            renderDashboard();
        }
    };

    eventSource.onerror = () => {
        // Reconnect after a delay if the connection drops
        setTimeout(connectSSE, 3000);
    };
}

// Call this once on app start (after initNavigation)
connectSSE();

// ---- Smart connection status updater (no spam) ----
// ---- Improved connection status with triple‑layer detection ----
let _lastConnectionState = null;
let _updatingConnection = false;
let _connectionUpdateTimer = null;
let _connectionAttempts = 0;

async function updateConnectionStatus(force = false) {
    if (_updatingConnection) return;
    _updatingConnection = true;

    const statusSpan = document.querySelector('#connectionStatus span');
    if (!statusSpan) {
        _updatingConnection = false;
        return;
    }

    try {
        console.log('[ConnStatus] Checking connection...');
        let found = false;
        let deviceId = null;
        let displayText = '';
        let color = '#6B7280';
        const previousDeviceId = currentDeviceId; // ✅ Save previous ID
        let usbStateChanged = false;

        // ---- Layer 1: ADB ----
        try {
            const data = await fetchDevices();
            const devices = Array.isArray(data.devices) ? data.devices : Array.isArray(data) ? data : [];
            if (devices.length > 0) {
                const first = devices[0];
                deviceId = typeof first === 'string' ? first : (first.id || first.serial || first.device || String(first));
                if (deviceId) {
                    found = true;
                    displayText = `ADB: ${deviceId}`;
                    color = '#107c10';
                    currentDeviceId = deviceId;
                    window.currentDeviceId = deviceId; // ✅ Sync global
                    console.log('[ConnStatus] ✅ ADB device found:', deviceId);
                }
            } else {
                // No ADB devices – clear global
                if (currentDeviceId !== null) {
                    currentDeviceId = null;
                    window.currentDeviceId = null;
                }
            }
        } catch (adbErr) {
            console.warn('[ConnStatus] ADB failed:', adbErr.message);
            // On error, clear global
            currentDeviceId = null;
            window.currentDeviceId = null;
        }

        // ---- Layer 2: USB State (if no ADB) ----
        if (!found) {
            try {
                const resp = await fetch(`${BACKEND_URL}/api/device-state`);
                if (resp.ok) {
                    const stateData = await resp.json();
                    const state = stateData.state;
                    const details = stateData.details || '';

                    const stateMap = {
                        'adb_ready': { label: 'ADB Ready', color: '#107c10' },
                        'adb_unauthorized': { label: 'ADB Unauthorized', color: '#ed6c02' },
                        'recovery': { label: 'Recovery Mode', color: '#ed6c02' },
                        'sideload': { label: 'Sideload Mode', color: '#ed6c02' },
                        'mtp_normal': { label: 'MTP (OS Booted)', color: '#107c10' },
                        'bootloader': { label: 'Fastboot', color: '#ed6c02' },
                        'samsung_download': { label: 'Download Mode (Odin)', color: '#ed6c02' },
                        'edl_qualcomm': { label: 'Qualcomm EDL', color: '#d32f2f' },
                        'preloader_mediatek': { label: 'MediaTek Preloader', color: '#d32f2f' },
                        'unknown_enumeration': { label: 'Unknown USB', color: '#6B7280' },
                        'generic_usb_detected': { label: 'USB Detected', color: '#6B7280' },
                        'no_response': { label: 'No Device', color: '#6B7280' }
                    };
                    const info = stateMap[state] || { label: state || 'Unknown', color: '#6B7280' };
                    const shortDetails = details && details.length > 40 ? details.substring(0, 40) + '…' : details;
                    displayText = shortDetails ? `${info.label} – ${shortDetails}` : info.label;
                    color = info.color;
                    found = true;
                    // No ADB device – clear global
                    currentDeviceId = null;
                    window.currentDeviceId = null;
                    console.log('[ConnStatus] 🔌 USB state:', state, displayText);
                } else {
                    console.warn('[ConnStatus] USB state endpoint returned non-OK');
                }
            } catch (usbErr) {
                console.warn('[ConnStatus] USB state fetch failed:', usbErr.message);
            }
        }

        // ---- Layer 3: Fallback to no device ----
        if (!found) {
            displayText = 'No device found';
            color = '#d83b01';
            if (currentDeviceId !== null) {
                currentDeviceId = null;
                window.currentDeviceId = null;
            }
            console.log('[ConnStatus] ❌ No device detected');
        }

        // ---- Update UI ----
        statusSpan.innerText = displayText;
        statusSpan.style.color = color;

        // ---- Notify if state changed ----
        const stateKey = `${displayText}_${color}`;
        const stateChanged = (_lastConnectionState !== stateKey) || force || (currentDeviceId !== previousDeviceId);
        if (stateChanged) {
            _lastConnectionState = stateKey;
            if (currentDeviceId && typeof updateDeviceInfo === 'function') {
                updateDeviceInfo().catch(err => console.warn('[updateConnectionStatus] updateDeviceInfo failed:', err));
            }
            // Re‑render dashboard if on dashboard page or advanced page
            const activePage = document.querySelector('.nav-item.active')?.dataset.page;
            if (activePage === 'dashboard') {
                console.log('[updateConnectionStatus] re-rendering dashboard');
                await renderDashboard();
            } else if (activePage === 'advanced') {
                console.log('[updateConnectionStatus] re-rendering advanced diagnostic');
                if (typeof window.renderAdvancedDiagnostic === 'function') {
                    window.renderAdvancedDiagnostic();
                }
            }
        }

        // Update device sections visibility
        toggleDeviceSections(!!currentDeviceId);

    } catch (err) {
        console.error('[ConnStatus] Unexpected error:', err);
    } finally {
        _updatingConnection = false;
        _connectionAttempts = 0;
        // Schedule next update (10 seconds later)
        if (_connectionUpdateTimer) clearTimeout(_connectionUpdateTimer);
        _connectionUpdateTimer = setTimeout(() => {
            updateConnectionStatus();
        }, 10000);
    }
}

function scheduleNextConnectionUpdate() {
    if (_connectionUpdateTimer) clearTimeout(_connectionUpdateTimer);
    _connectionUpdateTimer = setTimeout(() => {
        updateConnectionStatus();
    }, 10000); // 10 seconds instead of 5
}

// ==================== SUSPICIOUS SCAN DEBUG ====================
async function testSuspiciousScan() {
    if (!currentDeviceId) {
        alert('No device connected');
        return;
    }
    let modal = document.getElementById('scanDebugModal');
    if (!modal) {
        const modalHtml = `
            <div id="scanDebugModal" class="modal" style="display: none;">
                <div class="modal-content" style="max-width: 700px;">
                    <div class="modal-header">
                        <h3>Suspicious App Scan Results</h3>
                        <span class="close-button" id="closeScanDebugModal">&times;</span>
                    </div>
                    <div class="modal-body" id="scanDebugBody" style="max-height: 500px; overflow-y: auto;">
                        Loading...
                    </div>
                    <div class="modal-footer">
                        <button id="closeScanDebugModalBtn" class="btn-secondary">Close</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('scanDebugModal');
        const closeModal = () => modal.style.display = 'none';
        document.getElementById('closeScanDebugModal')?.addEventListener('click', closeModal);
        document.getElementById('closeScanDebugModalBtn')?.addEventListener('click', closeModal);
        window.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    }
    modal.style.display = 'flex';
    const bodyDiv = document.getElementById('scanDebugBody');
    bodyDiv.innerHTML = '<div class="spinner"></div><p>Scanning for suspicious apps...</p>';
    try {
        const response = await fetch(`${BACKEND_URL}/api/suspicious-apps?deviceId=${currentDeviceId}`);
        const data = await response.json();
        const apps = data.suspiciousApps || [];
        const debug = data.debug || {};
        if (apps.length === 0) {
            let debugHtml = '<p>✅ No suspicious apps found.</p>';
            if (debug.totalApps) {
                debugHtml += `<details><summary>Debug Info (${debug.totalApps} apps scanned)</summary>
                    <ul>
                        <li>✅ Apps from trusted prefixes (Google, Samsung, etc.): ${debug.skippedByTrustedPrefix} (e.g., ${debug.sampleSkippedTrustedPrefix?.join(', ') || 'none'})</li>
                        <li>✅ Apps from trusted exact packages (OTA agents): ${debug.skippedByTrustedExact} (e.g., ${debug.sampleSkippedTrustedExact?.join(', ') || 'none'})</li>
                        <li>✅ Apps installed via legitimate stores (Play Store, Galaxy Store, etc.): ${debug.skippedByLegitStore} (e.g., ${debug.sampleSkippedLegitStore?.join(', ') || 'none'})</li>
                        <li>🔍 Sideloaded apps evaluated: ${debug.evaluatedSideloaded}</li>
                    </ul>
                    <p>If you expect some apps to be flagged, they may have been installed from a trusted store or have a trusted package name prefix.</p>
                </details>`;
            } else {
                debugHtml += '<p><small>No debug information returned from backend.</small></p>';
            }
            bodyDiv.innerHTML = debugHtml;
        } else {
            const filteredApps = apps.filter(app => (app.riskScore || 0) >= 30);
            let html = `<p>Found ${filteredApps.length} suspicious app(s):</p><ul style="list-style: none; padding-left: 0;">`;
            for (const app of filteredApps) {
                const threatDescriptions = getHumanReadableThreats(app.threatTypes || [], []);
                html += `
                    <li style="margin-bottom: 16px; padding: 12px; background: #fff3e0; border-radius: 12px;">
                        <strong>${escapeHtml(app.displayName)}</strong> (${escapeHtml(app.packageName)})<br>
                        <span style="font-size: 12px;">Reason: ${escapeHtml(app.reason)}</span><br>
                        <span style="font-size: 12px;">Threat Level: ${app.threatLevel}</span><br>
                        ${app.packageLegitimacy?.verdict === 'trusted' ? `<span style="font-size: 12px; color: #2e7d32;">✅ Package identity verified by local web evidence</span><br>` : ''}
                        ${app.packageLegitimacy?.verdict === 'uncertain' ? `<span style="font-size: 12px; color: #8a6d3b;">ℹ️ Package identity could not be confirmed automatically</span><br>` : ''}
                        ${app.threatTypes && app.threatTypes.length > 0 ? `<span style="font-size: 12px;">Threat Types: ${app.threatTypes.map(t => t.type).join(', ')}</span><br>` : ''}
                        ${threatDescriptions.length > 0 ? `<div style="font-size: 12px; margin-top: 4px; color: #444;"><strong>What it can do:</strong><ul style="margin: 4px 0 0 18px; padding: 0;">${threatDescriptions.map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ul></div>` : ''}
                        <span style="font-size: 12px;">Suggested Action: ${escapeHtml(app.suggestedAction)}</span>
                    </li>
                `;
            }
            html += '</ul>';
            bodyDiv.innerHTML = html;
        }
    } catch (err) {
        bodyDiv.innerHTML = `<p style="color: red;">Error: ${err.message}</p>`;
    }
}


// ==================== ADVANCED DIAGNOSTIC PAGE ====================
// ==================== ADVANCED DIAGNOSTIC PAGE ====================
// ==================== ADVANCED DIAGNOSTIC PAGE ====================
// ==================== ADVANCED DIAGNOSTIC PAGE ====================
// In js/advanceDiagnostic.js – replace the renderAdvancedDiagnostic function

async function renderAdvancedDiagnostic() {
    const container = document.getElementById('pageContent');

    // ---- Helper: get current language ----
    function _getLang() {
        return window._activeLang
            || (window.SmartHubI18n && window.SmartHubI18n.getCurrentLang ? window.SmartHubI18n.getCurrentLang() : 'en');
    }

    function _t(key, fallback) {
        const lang = _getLang();
        let result = null;
        if (window.SmartHubI18n && typeof window.SmartHubI18n.t === 'function') {
            result = window.SmartHubI18n.t(key, lang);
        }
        if (result === null || result === undefined || result === '') {
            if (typeof t === 'function') {
                result = t(key, lang);
            }
        }
        if (result === null || result === undefined || result === '') {
            result = fallback || key;
        }
        return result;
    }

    if (!currentDeviceId) {
        container.innerHTML = `
            <div class="card" style="text-align: center; padding: 40px;">
                <i class="fas fa-plug" style="font-size: 48px; color: #d83b01;"></i>
                <h2 data-i18n="adv.page.noDeviceTitle">${_t('adv.page.noDeviceTitle', 'No Device Connected')}</h2>
                <p data-i18n="adv.page.noDeviceDesc">${_t('adv.page.noDeviceDesc', 'Please connect your Android phone via USB and enable USB debugging.')}</p>
            </div>
        `;
        if (typeof applyLanguage === 'function') {
            applyLanguage(_getLang());
        }
        return;
    }

    if (!window.SmartHub?.advanceDiagnostic) {
        container.innerHTML = `
            <div class="card" style="padding: 20px; background: #ffebee; color: #c62828;">
                <span data-i18n="adv.page.moduleMissing">${_t('adv.page.moduleMissing', '❌ Advanced diagnostic module not loaded. Check script inclusion.')}</span>
            </div>
        `;
        if (typeof applyLanguage === 'function') {
            applyLanguage(_getLang());
        }
        return;
    }

    // ---- ADB helper ----
    async function runAdb(command) {
        const resp = await fetch('/adb-shell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: currentDeviceId, command })
        });
        if (!resp.ok) throw new Error(`ADB command failed: ${resp.status}`);
        const data = await resp.json();
        return data.output;
    }

    const pageHtml = `
        <div style="margin-bottom: 24px;">
            <h1 style="margin-bottom: 6px; font-size: 24px; font-weight: 700; color: #1f2937;" data-i18n="adv.page.title">${_t('adv.page.title', '🔍 Advanced Diagnostics')}</h1>
            <p style="color: #6b7280; font-size: 14px; margin: 0;" data-i18n="adv.page.subtitle">${_t('adv.page.subtitle', 'A deeper pass across software behavior, installed apps, and rootkit indicators.')}</p>
        </div>

        <div style="background: white; border-radius: 16px; padding: 28px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid #f1f3f5;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px;">
                <div style="display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: #f8fafc; border-radius: 10px;">
                    <div style="width: 32px; height: 32px; border-radius: 8px; background: #eff6ff; color: #0d6efd; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="fas fa-heart-pulse" style="font-size: 13px;"></i>
                    </div>
                    <div>
                        <div style="font-size: 13px; font-weight: 600; color: #1f2937;" data-i18n="adv.page.softwareHealthLabel">${_t('adv.page.softwareHealthLabel', 'Software Health')}</div>
                        <div style="font-size: 11px; color: #9ca3af;" data-i18n="adv.page.softwareHealthDesc">${_t('adv.page.softwareHealthDesc', '26 system checks')}</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: #f8fafc; border-radius: 10px;">
                    <div style="width: 32px; height: 32px; border-radius: 8px; background: #f0fdf4; color: #16a34a; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="fas fa-magnifying-glass" style="font-size: 13px;"></i>
                    </div>
                    <div>
                        <div style="font-size: 13px; font-weight: 600; color: #1f2937;" data-i18n="adv.page.deepScanLabel">${_t('adv.page.deepScanLabel', 'Deep App Scan')}</div>
                        <div style="font-size: 11px; color: #9ca3af;" data-i18n="adv.page.deepScanDesc">${_t('adv.page.deepScanDesc', 'Installed apps & behavior')}</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: #f8fafc; border-radius: 10px;">
                    <div style="width: 32px; height: 32px; border-radius: 8px; background: #fef2f2; color: #dc2626; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="fas fa-shield-halved" style="font-size: 13px;"></i>
                    </div>
                    <div>
                        <div style="font-size: 13px; font-weight: 600; color: #1f2937;" data-i18n="adv.page.rootkitLabel">${_t('adv.page.rootkitLabel', 'Rootkit Check')}</div>
                        <div style="font-size: 11px; color: #9ca3af;" data-i18n="adv.page.rootkitDesc">${_t('adv.page.rootkitDesc', 'Kernel & process anomalies')}</div>
                    </div>
                </div>
            </div>

            <div style="text-align: center; padding: 8px 0 4px 0;">
                <button id="runAdvancedDiagBtn" style="
                    border: none; cursor: pointer;
                    background: linear-gradient(135deg, #0d6efd 0%, #0b5ed7 100%);
                    color: white; font-size: 15px; font-weight: 600;
                    padding: 13px 40px; border-radius: 12px;
                    box-shadow: 0 4px 14px rgba(13,110,253,0.3);
                    transition: transform 0.15s ease, box-shadow 0.15s ease;
                " onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 6px 18px rgba(13,110,253,0.38)'"
                   onmouseout="this.style.transform='none'; this.style.boxShadow='0 4px 14px rgba(13,110,253,0.3)'">
                    <i class="fas fa-play"></i> <span data-i18n="adv.page.runBtn">${_t('adv.page.runBtn', 'Run Advanced Scan')}</span>
                </button>
                <div style="font-size: 12px; color: #9ca3af; margin-top: 10px;" data-i18n="adv.page.runHint">${_t('adv.page.runHint', 'Takes a couple of minutes — the phone stays usable during the scan.')}</div>
            </div>
        </div>

        <div id="advancedDiagContainer" style="margin-top: 20px;"></div>
    `;

    container.innerHTML = pageHtml;

    // ---- APPLY LANGUAGE ----
    if (typeof applyLanguage === 'function') {
        const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
        applyLanguage(window._activeLang || savedLang);
    }

    const runBtn = document.getElementById('runAdvancedDiagBtn');
    const diagContainer = document.getElementById('advancedDiagContainer');

    function ensureScanModal() {
        let modal = document.getElementById('advancedDiagModal');
        if (!modal) {
            const modalHTML = `
                <div id="advancedDiagModal" class="modal" style="display: none; z-index: 99999;">
                    <div class="modal-content" style="max-width: 1100px; width: 95vw; max-height: 85vh; display: flex; flex-direction: column; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3); background: #ffffff;">
                        <div class="modal-header" style="padding: 16px 24px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                            <h3 id="advancedDiagModalTitle" data-i18n="adv.modal.title" style="margin: 0; font-size: 18px; font-weight: 600; color: #1f2937;">${_t('adv.modal.title', 'Advanced Diagnostics')}</h3>
                            <span class="close-button" id="closeAdvancedDiagModal" style="cursor: pointer; font-size: 24px; color: #9ca3af; line-height: 1; padding: 0 4px;">&times;</span>
                        </div>
                        <div id="advancedDiagModalBody" class="modal-body" style="flex: 1; overflow-y: auto; padding: 20px 24px; background: #ffffff;"></div>
                        <div class="modal-footer" style="padding: 12px 24px; background: #f8fafc; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end;">
                            <button id="closeAdvancedDiagModalBtn" class="btn-secondary" style="padding: 8px 24px; border-radius: 8px; font-weight: 500; font-size: 14px; cursor: pointer; background: #f1f3f5; border: 1px solid #e5e7eb; color: #374151;" data-i18n="adv.modal.close">${_t('adv.modal.close', 'Close')}</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            modal = document.getElementById('advancedDiagModal');
            document.getElementById('closeAdvancedDiagModal').addEventListener('click', () => modal.style.display = 'none');
            document.getElementById('closeAdvancedDiagModalBtn').addEventListener('click', () => modal.style.display = 'none');
            window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

            // Apply language to modal
            if (typeof applyLanguage === 'function') {
                applyLanguage(_getLang());
            }
        }
        return modal;
    }

    runBtn.addEventListener('click', async function() {
        const btn = this;
        btn.disabled = true;
        btn.style.opacity = '0.75';
        btn.style.cursor = 'not-allowed';
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span data-i18n="adv.scan.scanningBtn">' + _t('adv.scan.scanningBtn', 'Scanning...') + '</span>';

        // ---- LAUNCH ANDROID APP ----
        try {
            await runAdb('am start -n com.smarthub.diagnostics/.MainActivity');
            console.log('[Advanced] Android app launched');
        } catch (e) {
            console.warn('[Advanced] Could not launch Android app:', e);
        }

        const modal = ensureScanModal();
        const modalTitle = document.getElementById('advancedDiagModalTitle');
        const modalBody = document.getElementById('advancedDiagModalBody');
        modalTitle.textContent = _t('adv.modal.title', 'Advanced Diagnostics');
        modalBody.innerHTML = window.getModernSpinnerHTML(_t('adv.scan.runningModal', 'Running advanced diagnostics... This may take 2-3 minutes.'));
        modal.style.display = 'flex';

        diagContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: #6b7280;" data-i18n="adv.scan.inProgress">${_t('adv.scan.inProgress', '⏳ Scan in progress... See modal for details.')}</div>`;

        try {
            const results = await window.SmartHub.advanceDiagnostic.runFullSuite(
                currentDeviceId,
                (msg) => {
                    const textEl = modalBody.querySelector('.loading-text');
                    if (textEl) textEl.textContent = msg;
                }
            );

            // ---- 🧠 REMOVE AI DIAGNOSIS SECTION ----
            if (results && results.ai) {
                delete results.ai;
            }

            modal.style.display = 'none';
            window.SmartHub.advanceDiagnostic.renderResults('advancedDiagContainer');

            // ---- SAVE ADVANCED RESULTS (without AI) ----
            const advancedResults = {
                software: results.software ? results.software.map(r => ({ name: r.name, passed: r.passed })) : [],
                scanTime: new Date().toLocaleString()
            };
            saveAdvancedResults(advancedResults);

        } catch (err) {
            modal.style.display = 'none';
            diagContainer.innerHTML = `
                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px; color: #b91c1c;">
                    <div style="display: flex; align-items: center; gap: 8px; font-weight: 600; margin-bottom: 6px;">
                        <i class="fas fa-triangle-exclamation"></i> <span data-i18n="adv.scan.failedTitle">${_t('adv.scan.failedTitle', 'Scan failed')}</span>
                    </div>
                    <div style="font-size: 13px; color: #991b1b; margin-bottom: 12px;">${escapeHtml(err.message)}</div>
                    <button onclick="renderAdvancedDiagnostic()" style="border: 1px solid #fca5a5; background: white; color: #b91c1c; padding: 6px 16px; border-radius: 8px; font-size: 13px; cursor: pointer;" data-i18n="adv.scan.retryBtn">
                        ${_t('adv.scan.retryBtn', '🔄 Retry')}
                    </button>
                </div>
            `;
            if (typeof applyLanguage === 'function') {
                applyLanguage(_getLang());
            }
        } finally {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.innerHTML = '<i class="fas fa-play"></i> <span data-i18n="adv.page.runBtn">' + _t('adv.page.runBtn', 'Run Advanced Scan') + '</span>';
        }
    });

    // ---- On mount: restore previous advanced results ----
    const savedAdv = loadAdvancedResults();
    if (savedAdv) {
        diagContainer.innerHTML = `
            <div style="font-size:12px;color:#9ca3af;margin-bottom:8px;" data-i18n="adv.scan.lastScan">
                ${_t('adv.scan.lastScan', 'Last scan:')} ${new Date(savedAdv.date).toLocaleString()}
            </div>
        `;
        if (typeof applyLanguage === 'function') {
            applyLanguage(_getLang());
        }
    }
}


// ---- Extracted ADB dashboard rendering (keep the existing logic) ----
// ---- RENDER FULL ADB DASHBOARD ----



// ===== SAVE/LOAD SCAN RESULTS =====

function saveAppScanResults(results) {
    if (results) {
        localStorage.setItem('smartHubAppScanResults', JSON.stringify(results));
    } else {
        localStorage.removeItem('smartHubAppScanResults');
    }
}

function loadAppScanResults() {
    try {
        const data = localStorage.getItem('smartHubAppScanResults');
        return data ? JSON.parse(data) : null;
    } catch { return null; }
}

function saveStorageResults(results) {
    if (results) {
        localStorage.setItem('smartHubStorageResults', JSON.stringify(results));
    } else {
        localStorage.removeItem('smartHubStorageResults');
    }
}
// ---- Profile page renderer ----
// ---- Global navigation helper ----
// ---- Global navigation helper ----
window.navigateTo = function(page) {
    // For pages that are handled by initNavigation, find the sidebar nav item and click it
    const navItem = document.querySelector(`.sidebar-nav a[data-page="${page}"]`);
    if (navItem) {
        navItem.click();
    } else {
        // Fallback for profile (old) if not found
        if (page === 'profile') {
            if (typeof window.renderProfilePage === 'function') {
                window.renderProfilePage();
            } else {
                alert('Profile page not available.');
            }
        } else {
            console.warn('No navigation target for page:', page);
        }
    }
};
// ---- Profile page renderer ----
// ---- Render profile page ----
// ---- Render profile page ----
// ---- Render profile page ----
// ---- Render profile page ----
// ---- Render profile page ----
// ---- Render profile page ----
// ---- Render profile page ----
// ---- Render profile page ----
async function renderProfilePage() {
    console.log('[Profile] renderProfilePage called');

    // 1. Ensure the profile module is loaded
    if (typeof window.renderProfilePageContent !== 'function') {
        console.log('[Profile] Module not loaded – importing dynamically...');
        try {
            const module = await import('/js/userProfile.js');
            if (typeof module.renderProfilePageContent === 'function') {
                window.renderProfilePageContent = module.renderProfilePageContent;
            } else if (module.default && typeof module.default.renderProfilePageContent === 'function') {
                window.renderProfilePageContent = module.default.renderProfilePageContent;
            } else {
                throw new Error('Profile module did not export renderProfilePageContent');
            }
            console.log('[Profile] Module loaded and render function assigned.');
        } catch (err) {
            console.error('[Profile] Failed to load module:', err);
            document.getElementById('pageContent').innerHTML = `
                <div class="card" style="text-align:center;padding:40px;">
                    <p>❌ Profile module failed to load. Please refresh the app.</p>
                    <button onclick="location.reload()" class="btn-secondary">Reload</button>
                </div>
            `;
            return;
        }
    }

    // 2. Get the current user
    let user = null;
    try {
        const { getSupabaseClient } = await import('./supabase.js');
        const supabase = await getSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) user = session.user;
    } catch (e) {
        console.warn('[Profile] Could not get user from session, falling back to localStorage:', e);
    }

    if (!user) {
        const stored = localStorage.getItem('smarthub.user');
        if (stored) {
            try { user = JSON.parse(stored); } catch (e) {}
        }
    }

    // 3. If no user, show login prompt
    if (!user) {
        document.getElementById('pageContent').innerHTML = `
            <div class="card" style="text-align:center;padding:40px;">
                <p>Please log in to view your profile.</p>
                <button onclick="document.getElementById('loginBtn').click()" class="btn-primary">Login</button>
            </div>
        `;
        return;
    }

    // 4. Render the profile
    if (typeof window.renderProfilePageContent === 'function') {
        window.renderProfilePageContent(user);
    } else {
        document.getElementById('pageContent').innerHTML = `
            <div class="card" style="text-align:center;padding:40px;">
                <p>Profile module still not available. Please refresh.</p>
                <button onclick="location.reload()" class="btn-secondary">Reload</button>
            </div>
        `;
    }
}

// Expose globally
window.renderProfilePage = renderProfilePage;

// Expose globally


// Expose globally

// ---- Hardware Test Results ----
function saveHardwareResults(summary) {
    // merge with whatever is already stored, so a single-test run
    // doesn't wipe out previously saved results for other tests
    const existing = loadHardwareResults();
    const mergedResults = {
        ...(existing?.results || {}),
        ...window._hardwareTestResults
    };

    const payload = {
        timestamp: Date.now(),
        date: new Date().toISOString(),
        summary: summary || existing?.summary || null,
        results: mergedResults
    };
    try {
        localStorage.setItem('hardwareTestResults', JSON.stringify(payload));
    } catch (e) {
        console.error('Failed to save hardware results:', e);
    }
    window._hardwareTestResults = mergedResults;
    return payload;
}

function loadHardwareResults() {
    try {
        const raw = localStorage.getItem('hardwareTestResults');
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

// ---- Connection Test Results ----
function saveConnectionResults(testId, result) {
    window._connectionTestResults[testId] = result;
    const payload = {
        timestamp: Date.now(),
        date: new Date().toISOString(),
        results: window._connectionTestResults
    };
    try {
        localStorage.setItem('connectionTestResults', JSON.stringify(payload));
    } catch (e) {
        console.error('Failed to save connection results:', e);
    }
    return payload;
}

function loadConnectionResults() {
    try {
        const raw = localStorage.getItem('connectionTestResults');
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        console.error('Failed to load connection results:', e);
        return null;
    }
}

// ---- Advanced Diagnostic Results (app scan + storage analysis) ----
function saveAdvancedResults(scanData) {
  const payload = {
    timestamp: Date.now(),
    date: new Date().toISOString(),
    appScan: scanData.appScan || null,       // app scan output
    storageAnalysis: scanData.storageAnalysis || null // storage analysis output
  };
  try {
    localStorage.setItem('advancedDiagnosticResults', JSON.stringify(payload));
  } catch (e) {
    console.error('Failed to save advanced diagnostic results:', e);
  }
  return payload;
}

function loadAdvancedResults() {
  try {
    const raw = localStorage.getItem('advancedDiagnosticResults');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('Failed to load advanced diagnostic results:', e);
    return null;
  }
}

function loadStorageResults() {
    try {
        const data = localStorage.getItem('smartHubStorageResults');
        return data ? JSON.parse(data) : null;
    } catch { return null; }
}
// ---- Advanced Results Rendering (Dashboard) ----
function renderAdvancedResults(results) {
    const container = document.getElementById('advancedResults');
    if (!container) return;

    if (!results || !results.software || results.software.length === 0) {
        container.style.display = 'none';
        return;
    }

    const checks = results.software;
    const total = checks.length;
    const passed = checks.filter(r => r.passed).length;
    const scanTime = results.scanTime || t('common.unknown', 'Unknown');

    const allPassed = passed === total;
    const borderColor = allPassed ? '#16a34a' : '#f59e0b';
    const textColor = allPassed ? '#16a34a' : '#f59e0b';

    let html = `
        <div class="card" style="border-left: 4px solid ${borderColor}; margin-bottom: 16px;">
            <div class="card-title" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                <span><i class="fas fa-microscope"></i> ${t('ai.report.advanced', 'Advanced Diagnostic')}</span>
                <div style="display: flex; align-items: center; gap: 12px; font-size: 13px; flex-wrap: wrap;">
                    <span style="color: ${textColor}; font-weight: 600;">${passed}/${total} ${t('adv.checksPassed', 'checks passed')}</span>
                    <span style="color: #6b7280; font-size: 12px;">${scanTime}</span>
                    <button onclick="clearScanResults('advanced')" style="background: none; border: none; color: #9ca3af; cursor: pointer; font-size: 14px;">✕</button>
                </div>
            </div>
            <div class="card-content" style="padding: 12px 0;">
                <!-- Progress bar -->
                <div style="display: flex; align-items: center; gap: 16px;">
                    <div style="font-size: 24px; font-weight: 700; color: ${textColor};">
                        ${Math.round((passed / total) * 100)}%
                    </div>
                    <div style="flex: 1; background: #e5e7eb; border-radius: 8px; height: 8px;">
                        <div style="width: ${(passed / total) * 100}%; background: ${borderColor}; height: 100%; border-radius: 8px;"></div>
                    </div>
                </div>
                <!-- Status message -->
                <div style="margin-top: 8px; font-size: 13px; color: ${textColor};">
                    ${allPassed 
                        ? t('adv.summary.allPassed', '✅ All software checks passed.')
                        : t('adv.summary.issues', '⚠️ Some software issues detected. Run the advanced diagnostic for details.')
                    }
                </div>
                <!-- View Details button -->
                <div style="margin-top: 8px;">
                    <button onclick="navigateTo && navigateTo('advanced')" style="background: none; border: 1px solid #d1d5db; border-radius: 12px; padding: 4px 16px; font-size: 11px; cursor: pointer;">📊 ${t('adv.btn.details', 'View Details')}</button>
                </div>
            </div>
        </div>
    `;

    container.style.display = 'block';
    container.innerHTML = html;
}

// ---- Connection Results Rendering (Dashboard) ----
function renderConnectionResults(results) {
    const container = document.getElementById('connectionResults');
    if (!container) return;
    if (!results) { container.style.display = 'none'; return; }
    const passed = Object.values(results).filter(r => r && r.passed).length;
    const total = Object.keys(results).length;
    const color = passed === total ? '#16a34a' : passed > 0 ? '#f59e0b' : '#dc2626';
    container.style.display = 'block';
    container.innerHTML = `
        <div class="card" style="border-left: 4px solid ${color}; margin-bottom: 16px;">
            <div class="card-title"><i class="fas fa-wifi"></i> Connection Tests</div>
            <div class="card-content">
                <p>${passed}/${total} services healthy</p>
                <p style="font-size:12px; color:#6B7280;">${results.scanTime || ''}</p>
            </div>
        </div>
    `;
}

// ---- Repair Results (localStorage) ----
function loadRepairResults() {
    try {
        const data = localStorage.getItem('smartHubRepairResults');
        return data ? JSON.parse(data) : null;
    } catch { return null; }
}

function saveRepairResults(results) {
    if (results) {
        localStorage.setItem('smartHubRepairResults', JSON.stringify(results));
    } else {
        localStorage.removeItem('smartHubRepairResults');
    }
}

function renderRepairResults(results, containerId = 'repairResults') {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!results) {
        container.style.display = 'none';
        return;
    }

    const statusColor = results.status === 'success' ? '#16a34a' : results.status === 'failed' ? '#dc2626' : '#f59e0b';
    const statusIcon = results.status === 'success' ? '✅' : results.status === 'failed' ? '❌' : '⚠️';

    // ---- Build details display ----
    let detailsHtml = '';
    if (results.details) {
        // If it's retrieve_email and we have an emails array
        if (results.actionType === 'retrieve_email' && Array.isArray(results.details.emails) && results.details.emails.length > 0) {
            const emails = results.details.emails;
            detailsHtml = `
                <div style="margin-top:8px; background:#f8fafc; padding:8px 12px; border-radius:6px; max-height:150px; overflow-y:auto; font-size:13px; border:1px solid #e5e7eb;">
                    <strong style="display:block; margin-bottom:4px;">📧 Found ${emails.length} email(s):</strong>
                    ${emails.map(e => `<div style="padding:2px 0; font-family:monospace;">${escapeHtml(e)}</div>`).join('')}
                </div>
            `;
        } else if (results.actionType === 'retrieve_email' && typeof results.details.count === 'number') {
            // Fallback if emails array is missing
            detailsHtml = `<div style="margin-top:8px; color:#6B7280; font-size:13px;">📧 ${results.details.count} account(s) found</div>`;
        } else if (typeof results.details === 'object' && Object.keys(results.details).length > 0) {
            // For other actions, show a simple key‑value summary
            const summaryStr = Object.entries(results.details).map(([k,v]) => `${k}: ${v}`).join(', ');
            detailsHtml = `<div style="margin-top:8px; font-size:13px; color:#6B7280;">${escapeHtml(summaryStr)}</div>`;
        }
    }

    container.style.display = 'block';
    container.innerHTML = `
        <div class="card" style="border-left: 4px solid ${statusColor}; margin-bottom: 16px;">
            <div class="card-title" style="display: flex; justify-content: space-between;">
                <span><i class="fas fa-tools"></i> Latest Repair</span>
                <span style="color: ${statusColor};">${statusIcon} ${results.status.toUpperCase()}</span>
            </div>
            <div class="card-content">
                <p><strong>Action:</strong> ${results.actionType || 'Unknown'}</p>
                <p style="color: #6B7280;">${results.summary || ''}</p>
                ${detailsHtml}
                <p style="font-size:12px; color:#9CA3AF; margin-top:4px;">${results.createdAt || ''}</p>
            </div>
        </div>
    `;
}

// ---- Expose all helpers globally ----
window.renderAdvancedResults = renderAdvancedResults;
window.renderConnectionResults = renderConnectionResults;
window.loadRepairResults = loadRepairResults;
window.saveRepairResults = saveRepairResults;
window.renderRepairResults = renderRepairResults;
// ===== LOAD SAVED SCAN RESULTS (async, Supabase first) =====


// ===== RENDER SCAN RESULTS ON DASHBOARD =====

function renderAppScanResults(results) {
    const container = document.getElementById('appScanResults');
    if (!container) return;

    // Update global appSecurityResults for safety card
    const deviceId = typeof currentDeviceId !== 'undefined' ? currentDeviceId : null;
    if (deviceId) {
        if (!window._appSecurityResults) window._appSecurityResults = {};
        const suspiciousApps = results && results.suspiciousApps ? results.suspiciousApps : [];
        window._appSecurityResults[deviceId] = suspiciousApps;

        // Update safety card count
        const safetyEl = document.getElementById('safetySuspicious');
        if (safetyEl) {
            const count = suspiciousApps.length;
            safetyEl.textContent = count > 0 ? `⚠️ ${count}` : '✅ 0';
            safetyEl.style.color = count > 0 ? '#dc2626' : '#16a34a';
        }
    }

    if (!results || !results.suspiciousApps || results.suspiciousApps.length === 0) {
        container.style.display = 'none';
        return;
    }

    const apps = results.suspiciousApps;
    const total = apps.length;
    const critical = apps.filter(a => a.riskScore >= 80).length;
    const high = apps.filter(a => a.riskScore >= 60 && a.riskScore < 80).length;
    const medium = apps.filter(a => a.riskScore >= 35 && a.riskScore < 60).length;
    const low = apps.filter(a => a.riskScore < 35).length;

    let html = `
        <div class="card" style="border-left: 4px solid ${total > 0 ? '#dc2626' : '#16a34a'}; margin-bottom: 16px;">
            <div class="card-title" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                <span><i class="fas fa-shield-halved"></i> ${t('action.appSecurity.title', 'App Security Scan')}</span>
                <div style="display: flex; align-items: center; gap: 12px; font-size: 13px; flex-wrap: wrap;">
                    ${total > 0 
                        ? `<span style="color: #dc2626;">⚠️ ${total} ${t('security.suspiciousApps', 'suspicious app(s)')}</span>`
                        : `<span style="color: #16a34a;">✅ ${t('security.noSuspicious', 'All clear')}</span>`
                    }
                    <span style="color: #6b7280; font-size: 12px;">${results.scanTime || ''}</span>
                    <button onclick="clearScanResults('app')" style="background: none; border: none; color: #9ca3af; cursor: pointer; font-size: 14px;">✕</button>
                </div>
            </div>
            <div class="card-content">
                <!-- Summary bar -->
                <div style="display: flex; gap: 16px; padding: 8px 0; flex-wrap: wrap;">
                    ${critical > 0 ? `<span><span style="color: #c62828; font-weight: bold;">🔴 ${critical}</span> ${t('security.riskLevel.critical', 'Critical')}</span>` : ''}
                    ${high > 0 ? `<span><span style="color: #e65100; font-weight: bold;">🟠 ${high}</span> ${t('security.riskLevel.high', 'High')}</span>` : ''}
                    ${medium > 0 ? `<span><span style="color: #e67e22; font-weight: bold;">🟡 ${medium}</span> ${t('security.riskLevel.medium', 'Medium')}</span>` : ''}
                    ${low > 0 ? `<span><span style="color: #2e7d32; font-weight: bold;">🟢 ${low}</span> ${t('security.riskLevel.low', 'Low')}</span>` : ''}
                </div>
                <!-- App list -->
                <div style="max-height: 500px; overflow-y: auto;">
                    ${apps.map(app => {
                        const threat = window.getThreatLevel(app.riskScore);
                        const threatIcon = threat.icon || (app.riskScore >= 80 ? '🔴' : app.riskScore >= 60 ? '🟠' : '🟡');
                        const malwareCapabilities = window.getHumanReadableThreats(app.threatTypes || [], []);
                        const humanReasons = window.getHumanFriendlyRiskReasons(app);

                        let riskFactors = [];
                        if (app.isSideloaded) riskFactors.push(t('security.sideloaded', '📦 Sideloaded (not from Play Store)'));
                        if (app.installer && app.installer.toLowerCase().includes('unknown')) riskFactors.push(t('security.unknownInstaller', '❓ Unknown installer'));
                        if (app.dangerousPermissions && app.dangerousPermissions.length > 5) riskFactors.push(t('security.manyPermissions', '🔓 Requests many dangerous permissions'));
                        if (app.entropy && app.entropy > 0.85) riskFactors.push(t('security.highEntropy', '🧩 High code entropy (possible obfuscation/packing)'));

                        const pkg = app.packageName;
                        const onclickHandler = `
                            window.uninstallPackage('${escapeHtml(pkg)}', window.removeAppCard);
                        `;

                        return `
                            <div id="app-card-${escapeHtml(pkg)}" class="app-card-item" data-package="${escapeHtml(pkg)}"
                                 style="margin-bottom: 12px; padding: 16px; border-radius: 12px;
                                        border-left: 6px solid ${threat.color};
                                        background: ${threat.bg};
                                        box-shadow: 0 2px 8px rgba(0,0,0,0.06);">

                                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
                                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                        <span style="font-size: 20px;">${threatIcon}</span>
                                        <strong style="font-size: 15px;">${escapeHtml(app.displayName)}</strong>
                                        <span style="font-size: 12px; color: #888; font-family: monospace;">${escapeHtml(app.packageName)}</span>
                                    </div>
                                    <button onclick="${onclickHandler}"
                                            class="delete-app"
                                            style="background: #d32f2f; color: white; border: none;
                                                   border-radius: 20px; padding: 4px 16px; cursor: pointer;
                                                   font-size: 12px; white-space: nowrap;
                                                   transition: background 0.2s ease, transform 0.15s ease;"
                                            onmouseover="this.style.background='#b71c1c'; this.style.transform='scale(1.05)'"
                                            onmouseout="this.style.background='#d32f2f'; this.style.transform='scale(1)'">
                                        🗑️ ${t('common.uninstall', 'Uninstall')}
                                    </button>
                                </div>

                                ${app.reason ? `<div style="font-size: 13px; color: #555; margin-top: 6px;">${escapeHtml(app.reason)}</div>` : ''}

                                ${humanReasons.length ? `<div style="font-size: 13px; margin-top: 4px; color: #424242; background: rgba(255,255,255,0.5); padding: 6px 10px; border-radius: 6px;">${humanReasons.join('; ')}</div>` : ''}

                                ${malwareCapabilities.length ? `<div style="font-size: 13px; margin-top: 4px; color: #4a148c; background: rgba(255,255,255,0.65); padding: 6px 10px; border-radius: 6px;"><strong>${t('security.malwareCapabilities', 'What this malware can do:')}</strong><ul style="margin: 4px 0 0 18px; padding: 0;">${malwareCapabilities.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : ''}

                                ${riskFactors.length ? `
                                    <div style="margin-top:6px; font-size:13px; color:#555; background:#f8f9fa; padding:6px 10px; border-radius:6px;">
                                        <strong>${t('security.riskFactors', '⚠️ Risk factors:')}</strong> ${riskFactors.join(' • ')}
                                    </div>
                                ` : ''}

                                ${app.entropy ? `<div style="font-size: 12px; color: #666; margin-top: 8px; background: #f5f5f5; padding: 6px 10px; border-radius: 6px;">${t('security.entropy', 'Entropy:')} ${app.entropy.toFixed(3)} ${app.entropy > 0.85 ? t('security.entropyHigh', '⚠️ (high → possible packing/obfuscation)') : ''}</div>` : ''}

                                <div style="display: flex; gap: 16px; margin-top: 8px; font-size: 12px; color: #666; flex-wrap: wrap;">
                                    ${app.installer ? `<span>${t('security.installedVia', '📦 Installed via:')} ${escapeHtml(app.installer)}</span>` : ''}
                                    ${app.installDate ? `<span>${t('security.installedDate', '📅 Installed:')} ${escapeHtml(app.installDate)}</span>` : ''}
                                </div>

                                <div style="margin-top: 10px; font-size: 13px; border-top: 1px dashed #ddd; padding-top: 10px;">
                                    <span style="background: ${threat.bg}; color: ${threat.color}; padding: 2px 10px; border-radius: 12px; font-weight: 600; font-size: 12px;">${threat.label}</span>
                                    &nbsp; ${t('security.riskScore', 'Risk Score:')} <strong>${app.riskScore}/100</strong>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            <div style="padding: 8px 16px 12px; font-size: 12px; color: #6b7280; border-top: 1px solid #f1f3f5; display: flex; justify-content: space-between; align-items: center;">
                <span>${t('hw.modal.lastScan', 'Last scan:')} ${results.scanTime || t('common.unknown', 'N/A')}</span>
                <button onclick="window.runAppScan()" style="background: none; border: 1px solid #d1d5db; border-radius: 12px; padding: 4px 16px; font-size: 11px; cursor: pointer;">🔄 ${t('common.rescan', 'Rescan')}</button>
            </div>
        </div>
    `;

    container.style.display = 'block';
    container.innerHTML = html;
}


function renderStorageResults(results) {
    const container = document.getElementById('storageResults');
    if (!container) return;

    // --- If no results or empty, show a friendly message ---
    if (!results || !results.files || results.files.length === 0) {
        container.style.display = 'block';
        container.innerHTML = `
            <div class="card" style="border-left: 4px solid #22c55e; margin-bottom: 16px;">
                <div class="card-title" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                    <span><i class="fas fa-hdd"></i> ${t('action.storageAnalysis.title', 'Storage Analysis')}</span>
                    <span style="color: #6b7280; font-size: 12px;">${results ? results.scanTime : t('common.unknown', 'N/A')}</span>
                </div>
                <div class="card-content" style="padding: 16px; text-align: center; color: #6b7280;">
                    ✅ ${t('storage.noLargeFiles', 'No large files (>500 MB) found on your device.')}
                    ${results ? `<br><small>${t('hw.modal.lastScan', 'Last scan:')} ${results.scanTime}</small>` : ''}
                </div>
            </div>
        `;
        return;
    }

    // --- Existing code for displaying files ---
    const files = results.files;
    const totalSize = files.reduce((sum, f) => sum + (f.bytes || 0), 0);
    const count = files.length;

    // ---- Group files by category ----
    const categories = {
        'DCIM': { label: t('storage.category.dcim', '📸 Camera (DCIM)'), files: [] },
        'Movies': { label: t('storage.category.movies', '🎬 Movies'), files: [] },
        'Music': { label: t('storage.category.music', '🎵 Music'), files: [] },
        'Pictures': { label: t('storage.category.pictures', '🖼️ Pictures'), files: [] },
        'Download': { label: t('storage.category.download', '📥 Downloads'), files: [] },
        'Android/obb': { label: t('storage.category.obb', '🎮 Game OBB'), files: [] },
        'Android/data': { label: t('storage.category.appData', '📂 App Data (Games)'), files: [] },
        'Documents': { label: t('storage.category.documents', '📄 Documents'), files: [] },
        'Other': { label: t('storage.category.other', '📦 Other'), files: [] }
    };

    files.forEach(file => {
        const path = file.path || '';
        let category = 'Other';
        if (path.includes('/DCIM/')) category = 'DCIM';
        else if (path.includes('/Movies/')) category = 'Movies';
        else if (path.includes('/Music/')) category = 'Music';
        else if (path.includes('/Pictures/')) category = 'Pictures';
        else if (path.includes('/Download/')) category = 'Download';
        else if (path.includes('/Android/obb/')) category = 'Android/obb';
        else if (path.includes('/Android/data/')) category = 'Android/data';
        else if (path.includes('/Documents/')) category = 'Documents';
        categories[category].files.push(file);
    });

    // Format storage values, with fallback
    const storageUsed = results.storageUsed || '?';
    const storageTotal = results.storageTotal || '?';
    const percentUsed = results.percentUsed !== undefined && results.percentUsed !== null ? results.percentUsed : 0;

    let html = `
        <div class="card" style="border-left: 4px solid #f59e0b; margin-bottom: 16px;">
            <div class="card-title" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                <span><i class="fas fa-hdd"></i> ${t('action.storageAnalysis.title', 'Storage Analysis')}</span>
                <div style="display: flex; align-items: center; gap: 12px; font-size: 13px; flex-wrap: wrap;">
                    <span style="color: #f59e0b;">📁 ${count} ${t('storage.largeFiles', 'large files')} (${formatSize(totalSize)})</span>
                    <span style="color: #6b7280; font-size: 12px;">${results.scanTime || ''}</span>
                    <button onclick="clearScanResults('storage')" style="background: none; border: none; color: #9ca3af; cursor: pointer; font-size: 14px;">✕</button>
                </div>
            </div>
            <div class="card-content">
                <!-- Storage summary -->
                <div style="margin-bottom: 12px; padding: 12px; background: #f8fafc; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; font-size: 14px;">
                        <span><strong>💾 ${t('storage.summary.title', 'Storage')}</strong> ${storageUsed} / ${storageTotal}</span>
                        <span style="color: ${percentUsed > 90 ? '#dc2626' : '#22c55e'};">${percentUsed.toFixed(1)}% ${t('storage.summary.used', 'used')}</span>
                    </div>
                    <div style="margin-top: 4px; background: #e5e7eb; border-radius: 8px; height: 6px; overflow: hidden;">
                        <div style="width: ${Math.min(percentUsed, 100)}%; background: ${percentUsed > 90 ? '#dc2626' : '#22c55e'}; height: 100%; border-radius: 8px;"></div>
                    </div>
                </div>
    `;

    // ---- Render categories ----
    for (const [key, cat] of Object.entries(categories)) {
        if (cat.files.length === 0) continue;
        const catSize = cat.files.reduce((sum, f) => sum + (f.bytes || 0), 0);
        html += `
            <div style="margin-top: 12px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: #ffffff;">
                <div style="background: #f8fafc; padding: 8px 14px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                    <span><strong>${cat.label}</strong> (${cat.files.length} ${t('storage.files', 'files')})</span>
                    <span style="color: #6b7280; font-size: 13px;">${formatSize(catSize)}</span>
                </div>
                <div style="padding: 6px 12px; display: block; max-height: 300px; overflow-y: auto;">
                    ${cat.files.map(file => {
                        const path = file.path || '';
                        const name = file.name || path || 'Unnamed';
                        const size = file.size || formatSize(file.bytes);
                        const isApp = path.startsWith('package:');
                        const displayPath = isApp ? path.replace('package:', '') : path;
                        const buttonLabel = isApp ? t('common.uninstall', '🗑️ Uninstall') : t('storage.delete.btn', '🗑️ Delete');
                        const icon = isApp ? '📱' : getFileIcon(path);
                        const sizeColor = getSizeColor(file.bytes || 0);
                        const onClick = isApp
                            ? `window._handleUninstall('${escapeHtml(displayPath)}', this)`
                            : `window._handleDelete('${escapeHtml(path)}', this)`;
                        return `
                            <div class="storage-item" data-path="${escapeHtml(path)}" data-bytes="${file.bytes || 0}" style="display: flex; justify-content: space-between; align-items: center; padding: 6px 4px; border-bottom: 1px solid #f1f3f5; font-size: 13px; transition: background 0.15s ease;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                                <span style="display: flex; align-items: center; gap: 8px; word-break: break-all; flex: 1; margin-right: 12px;">
                                    <span style="font-size: 16px;">${icon}</span>
                                    <span style="color: #1f2937;">${escapeHtml(name)}</span>
                                </span>
                                <span style="white-space: nowrap; margin-right: 12px; color: ${sizeColor}; font-weight: 500;">${escapeHtml(size)}</span>
                                <button onclick="${onClick}" style="background: #ef4444; color: white; border: none; border-radius: 6px; padding: 4px 14px; font-size: 11px; cursor: pointer; transition: background 0.15s ease; flex-shrink: 0;" onmouseover="this.style.background='#dc2626'" onmouseout="this.style.background='#ef4444'">${buttonLabel}</button>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    html += `
            </div>
            <div style="padding: 8px 16px 12px; font-size: 12px; color: #6b7280; border-top: 1px solid #f1f3f5; display: flex; justify-content: space-between; align-items: center;">
                <span>${t('hw.modal.lastScan', 'Last scan:')} ${results.scanTime || t('common.unknown', 'N/A')}</span>
                <button onclick="window.runStorageAnalysis()" style="background: none; border: 1px solid #d1d5db; border-radius: 12px; padding: 4px 16px; font-size: 11px; cursor: pointer;">🔄 ${t('common.rescan', 'Rescan')}</button>
            </div>
        </div>
    `;

    container.style.display = 'block';
    container.innerHTML = html;
}

function renderHardwareResults(results) {
    const container = document.getElementById('hardwareResults');
    if (!container) return;

    if (!results || !results.results || Object.keys(results.results).length === 0) {
        container.style.display = 'none';
        return;
    }

    const total = Object.keys(results.results).length;
    const passed = Object.values(results.results).filter(r => r.passed).length;
    const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
    const color = pct >= 80 ? '#2e7d32' : pct >= 50 ? '#ed6c02' : '#d32f2f';

    let html = `
        <div class="card" style="border-left: 4px solid ${color}; margin-bottom: 16px;">
            <div class="card-title" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                <span><i class="fas fa-microscope"></i> Hardware Tests</span>
                <div style="display: flex; align-items: center; gap: 12px; font-size: 13px; flex-wrap: wrap;">
                    <span style="color: ${color};">${passed}/${total} tests passed</span>
                    <span style="color: #6b7280; font-size: 12px;">${results.scanTime || ''}</span>
                </div>
            </div>
            <div class="card-content">
                <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 8px;">
                    <div style="flex:1; min-width:100px;">
                        <div style="background:#e5e7eb; border-radius:8px; height:8px; overflow:hidden;">
                            <div style="width:${pct}%; background:${color}; height:100%; border-radius:8px;"></div>
                        </div>
                    </div>
                    <span style="font-weight:600; font-size:16px; color:${color};">${pct}%</span>
                </div>
                <div style="font-size:12px; color:#6b7280;">
                    ${pct === 100 ? '✅ All tests passed' : pct >= 80 ? '⚠️ Most tests passed' : '❌ Many tests failed'}
                </div>
                <div style="margin-top:8px;">
                    <button onclick="document.querySelector('.nav-item[data-page=\\'hardware-tests\\']')?.click()" style="background:none; border:1px solid #d1d5db; border-radius:12px; padding:4px 16px; font-size:11px; cursor:pointer;">📊 View Details</button>
                </div>
            </div>
        </div>
    `;

    container.style.display = 'block';
    container.innerHTML = html;
}

// Expose globally
window.renderHardwareResults = renderHardwareResults;

function ensureInfoModal(modalId, title) {
    let modal = document.getElementById(modalId);
    if (!modal) {
        const modalHtml = `
            <div id="${modalId}" class="modal" style="display: none;">
                <div class="modal-content" style="max-width: 620px;">
                    <div class="modal-header">
                        <h3>${title}</h3>
                        <span class="close-button">&times;</span>
                    </div>
                    <div class="modal-body" id="${modalId}Body"></div>
                    <div class="modal-footer">
                        <button class="btn-secondary close-button">Close</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById(modalId);
        modal.querySelectorAll('.close-button').forEach(el => el.addEventListener('click', () => modal.style.display = 'none'));
        window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    } else {
        modal.querySelector('.modal-header h3').textContent = title;
    }
    return modal;
}

function renderPieChart(svgElement, segments) {
    if (!svgElement) return;
    const total = segments.reduce((sum, segment) => sum + (segment.value || 0), 0);
    if (total === 0) return;
    let startAngle = 0;
    const center = 110;
    const radius = 100;
    let paths = '';
    for (const segment of segments) {
        const slice = segment.value / total;
        const endAngle = startAngle + slice * Math.PI * 2;
        const x1 = center + radius * Math.cos(startAngle);
        const y1 = center + radius * Math.sin(startAngle);
        const x2 = center + radius * Math.cos(endAngle);
        const y2 = center + radius * Math.sin(endAngle);
        const largeArc = slice > 0.5 ? 1 : 0;
        const d = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
        paths += `<path d="${d}" fill="${segment.color}" stroke="#fff" stroke-width="1"></path>`;
        startAngle = endAngle;
    }
    svgElement.innerHTML = paths;
}

// ==================== MODALS ====================

// Battery modal – only apps draining battery (no temperature)

// Storage modal – pie chart using canvas (simple, no external lib)
// Storage modal – redesigned with a single segmented bar instead of a canvas pie chart

// RAM modal – list apps by RSS memory descending


// Temperature modal – show temperature + top CPU-consuming apps


// ==================== UPDATED SECURITY MODAL ====================

// ---- Helper: get threat level with translations ----
function getThreatLevel(riskScore) {
    if (riskScore >= 80) return { 
        level: 'critical', 
        label: t('security.riskLevel.critical', '🔥 CRITICAL'), 
        color: '#c62828', 
        bg: '#ffebee' 
    };
    if (riskScore >= 60) return { 
        level: 'high', 
        label: t('security.riskLevel.high', '⚠️ HIGH RISK'), 
        color: '#e65100', 
        bg: '#fff3e0' 
    };
    if (riskScore >= 35) return { 
        level: 'medium', 
        label: t('security.riskLevel.medium', '⚠️ MEDIUM RISK'), 
        color: '#e67e22', 
        bg: '#fef9e7' 
    };
    return { 
        level: 'low', 
        label: t('security.riskLevel.low', 'ℹ️ LOW RISK'), 
        color: '#2e7d32', 
        bg: '#e8f5e9' 
    };
}

// ---- Helper: human‑readable threat descriptions (translated) ----
function getHumanReadableThreats(malwareTypes, suspiciousIndicators) {
    const threats = [];
    const typeMap = {
        'spyware': 'threat.spyware',
        'ransomware': 'threat.ransomware',
        'adware': 'threat.adware',
        'click_fraud': 'threat.click_fraud',
        'banking_trojan': 'threat.banking_trojan',
        'data stealer': 'threat.data_stealer',
        'backdoor': 'threat.backdoor',
        'fake app': 'threat.fake_app',
        'riskware': 'threat.riskware',
        'information stealer': 'threat.information_stealer',
        'premium dialer': 'threat.premium_dialer',
        'trojan': 'threat.trojan',
        'generic_risk': 'threat.generic_risk'
    };
    const types = Array.isArray(malwareTypes) 
        ? malwareTypes.map(t => String(typeof t === 'string' ? t : t.type || '').trim().toLowerCase()) 
        : [];
    for (const type of types) {
        if (type && typeMap[type]) {
            threats.push(t(typeMap[type], ''));
        } else if (type) {
            threats.push(t('threat.unknown', '⚠️ Detected as "{type}" — potentially harmful.').replace('{type}', type));
        }
    }
    if (suspiciousIndicators && suspiciousIndicators.length > 0) {
        const hasObfuscation = suspiciousIndicators.some(i => 
            i.toLowerCase().includes('packed') || 
            i.toLowerCase().includes('polymorphic') || 
            i.toLowerCase().includes('entropy')
        );
        if (hasObfuscation) threats.push(t('threat.obfuscation', ''));
        const hasManyComponents = suspiciousIndicators.some(i => i.includes('Unusually many'));
        if (hasManyComponents) threats.push(t('threat.many_components', ''));
        const hasBroadcastReceiver = suspiciousIndicators.some(i => i.includes('broadcast receivers'));
        if (hasBroadcastReceiver) threats.push(t('threat.broadcast_receiver', ''));
    }
    if (threats.length === 0) threats.push(t('threat.no_specific', ''));
    return threats;
}

// ---- Helper: human‑friendly risk reasons (translated) ----
function getHumanFriendlyRiskReasons(app) {
    const reasons = [];
    if (app.isSideloaded) {
        const installer = app.installer || t('risk.unknownSource', 'Unknown source');
        reasons.push(t('risk.installedFrom', '📦 Installed from: {installer} (not from official app store)')
            .replace('{installer}', installer));
    }
    if (app.dangerousPermCount > 0) {
        const permLabels = [];
        const perms = app.dangerousPermissions || [];
        const permMap = {
            'CAMERA': 'perm.camera',
            'RECORD_AUDIO': 'perm.microphone',
            'READ_CONTACTS': 'perm.contacts',
            'READ_SMS': 'perm.sms',
            'SEND_SMS': 'perm.smsSend',
            'ACCESS_FINE_LOCATION': 'perm.locationFine',
            'ACCESS_COARSE_LOCATION': 'perm.locationCoarse',
            'READ_CALL_LOG': 'perm.callLog',
            'WRITE_CALL_LOG': 'perm.callLogModify',
            'CALL_PHONE': 'perm.phoneCalls',
            'SYSTEM_ALERT_WINDOW': 'perm.overlay',
            'BIND_ACCESSIBILITY_SERVICE': 'perm.accessibility',
            'DEVICE_ADMIN': 'perm.deviceAdmin',
            'REQUEST_INSTALL_PACKAGES': 'perm.installPackages',
            'PACKAGE_USAGE_STATS': 'perm.usageStats',
            'WRITE_SETTINGS': 'perm.writeSettings',
            'READ_EXTERNAL_STORAGE': 'perm.readStorage',
            'WRITE_EXTERNAL_STORAGE': 'perm.writeStorage'
        };
        for (const p of perms) {
            for (const [key, labelKey] of Object.entries(permMap)) {
                if (p.includes(key)) {
                    const label = t(labelKey, key);
                    if (!permLabels.includes(label)) permLabels.push(label);
                }
            }
        }
        if (permLabels.length > 0) {
            reasons.push(t('risk.canAccess', '🔓 Can access: {permissions}').replace('{permissions}', permLabels.join(', ')));
        } else {
            reasons.push(t('risk.requestsPerms', '🔓 Requests {count} dangerous permission(s)')
                .replace('{count}', app.dangerousPermCount));
        }
    }
    if (app.riskScore >= 70) reasons.push(t('risk.highRisk', '🚨 High risk — strongly recommended to uninstall.'));
    else if (app.riskScore >= 40) reasons.push(t('risk.moderateRisk', '⚠️ Moderate risk — review carefully.'));
    return reasons;
}

// ---- Updated showSecurityModal ----
async function showSecurityModal() {
    const modal = ensureInfoModal('securityModal', t('security.title', '🛡️ Security Overview'));
    const body = document.getElementById('securityModalBody');
    body.innerHTML = getModernSpinnerHTML(t('security.loading', 'Loading security status...'));
    modal.style.display = 'flex';

    try {
        const response = await fetch(`${BACKEND_URL}/api/suspicious-apps?deviceId=${currentDeviceId}`);
        const data = await response.json();
        const suspiciousApps = data.suspiciousApps || [];
        let html = `
            <div style="margin-bottom: 16px;">
                <strong>${t('security.totalApps', 'Total Apps:')}</strong> ${data.totalApps || '?'}<br>
                <strong>${t('security.suspiciousApps', 'Suspicious Apps:')}</strong> ${suspiciousApps.length}<br>
            </div>
        `;
        if (suspiciousApps.length === 0) {
            html += `<p style="color: #2e7d32;">${t('security.noSuspicious', '✅ No suspicious apps found.')}</p>`;
        } else {
            html += `<ul style="list-style: none; padding-left: 0;">`;
            for (const app of suspiciousApps.slice(0, 10)) {
                const threat = getThreatLevel(app.riskScore);
                const reasons = getHumanFriendlyRiskReasons(app);
                const threatDescriptions = getHumanReadableThreats(app.malwareTypes || [], app.suspiciousIndicators || []);
                html += `
                    <li style="margin-bottom: 16px; padding: 12px; background: ${threat.bg}; border-radius: 8px; border-left: 4px solid ${threat.color};">
                        <strong>${escapeHtml(app.displayName)}</strong> (${escapeHtml(app.packageName)})<br>
                        <span style="font-weight: bold; color: ${threat.color};">${threat.label}</span><br>
                        ${reasons.map(r => `<span style="font-size: 13px;">${r}</span><br>`).join('')}
                        ${threatDescriptions.map(d => `<span style="font-size: 13px;">${d}</span><br>`).join('')}
                        ${app.riskScore !== undefined ? `<span style="font-size: 12px; color: #666;">${t('security.riskScore', 'Risk Score:')} ${app.riskScore}/100</span>` : ''}
                    </li>
                `;
            }
            if (suspiciousApps.length > 10) {
                html += `<li>${t('security.moreApps', '... and {count} more').replace('{count}', suspiciousApps.length - 10)}</li>`;
            }
            html += `</ul>`;
        }
        body.innerHTML = html;
    } catch (err) {
        body.innerHTML = `<p style="color: red;">${t('security.error', 'Error: {message}').replace('{message}', err.message)}</p>`;
    }
}
// ==================== DEEP DIAGNOSTIC ====================

// ==================== STORAGE ANALYSIS (standalone) ====================
// ==================== STORAGE ANALYSIS (standalone) ====================


// ==================== APP SECURITY SCAN (standalone) ====================


// ==================== STORAGE CATEGORY DETAILS ====================

// ---- Show category details ----
// ==================== STORAGE CATEGORY DETAILS ====================

// ---- Show category details ----
// ---- Show category details ----
// ---- Show category details ----
// ---- Show category details ----
// ---- Show category details ----
async function showCategoryDetails(category) {
    if (!currentDeviceId) {
        alert('No device connected. Please connect a phone first.');
        return;
    }

    const modalBody = document.getElementById('quickDiagModalBody');
    const existingDetails = modalBody.querySelector('.category-details');
    if (existingDetails) existingDetails.remove();

    const storageSection = modalBody.querySelector('.storage-section');
    if (!storageSection) return;

    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'category-details';
    detailsDiv.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <div class="spinner"></div>
            <p>Scanning ${category}... this may take up to 2 minutes.</p>
        </div>
    `;
    storageSection.after(detailsDiv);

    try {
        const url = `${BACKEND_URL}/api/storage-category-details?deviceId=${encodeURIComponent(currentDeviceId)}&category=${encodeURIComponent(category)}`;
        console.log(`[StorageDetails] Fetching: ${url}`);
        // Increase timeout to 180 seconds for media/other scans
        let timeoutMs = 180000; // 3 minutes
        // For apps, we can keep shorter timeout because it's faster
        if (category === 'apps') timeoutMs = 60000;
        const response = await fetchWithTimeout(url, {}, timeoutMs);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        const data = await response.json();
        renderCategoryDetails(category, data.items || []);
    } catch (err) {
        console.error('Error fetching category details:', err);
        let errorMsg = err.message;
        if (err.name === 'AbortError' || errorMsg.includes('aborted')) {
            errorMsg = 'The scan is taking longer than expected. Try again later, or reduce the number of files/apps.';
        }
        detailsDiv.innerHTML = `<div style="color: #d32f2f; padding: 12px; background: #ffebee; border-radius: 6px;">
            ❌ Error loading details: ${escapeHtml(errorMsg)}
            <br><br>
            <button onclick="showCategoryDetails('${category}')" class="btn-secondary" style="margin-top: 8px;">🔄 Retry</button>
        </div>`;
    }
}
// ---- Render category details ----
function renderCategoryDetails(category, items) {
    const modalBody = document.getElementById('quickDiagModalBody');
    const detailsDiv = modalBody.querySelector('.category-details');
    if (!detailsDiv) return;

    if (!items || items.length === 0) {
        detailsDiv.innerHTML = `<div style="padding: 12px; color: #28a745; background: #e8f5e9; border-radius: 6px;">
            ✅ No items ≥1GB found in ${category}.
        </div>`;
        return;
    }

    // Sort by size descending (already sorted, but ensure)
    items.sort((a, b) => b.bytes - a.bytes);

    // Build a table for better readability
    let html = `
        <div style="margin-top: 12px; padding: 12px; background: #fff; border-radius: 8px; border: 1px solid #e5e7eb;">
            <h4 style="margin: 0 0 8px 0; font-size: 15px;">
                📁 ${category.charAt(0).toUpperCase() + category.slice(1)} Details
                <span style="font-size: 12px; color: #888; font-weight: normal;">(${items.length} items)</span>
            </h4>
            <div style="max-height: 350px; overflow-y: auto; border: 1px solid #f1f3f5; border-radius: 6px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead style="background: #f8f9fa; position: sticky; top: 0; z-index: 1;">
                        <tr>
                            <th style="padding: 6px 10px; text-align: left; border-bottom: 2px solid #e5e7eb;">Name</th>
                            <th style="padding: 6px 10px; text-align: right; border-bottom: 2px solid #e5e7eb;">Size</th>
                            <th style="padding: 6px 10px; text-align: center; border-bottom: 2px solid #e5e7eb;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    for (const item of items) {
        const displayName = item.name || item.packageName || 'Unknown';
        const size = item.size || formatSize(item.bytes);
        const pkg = item.packageName || '';
        const path = item.path || '';

        html += `
            <tr style="border-bottom: 1px solid #f1f3f5;">
                <td style="padding: 6px 10px; word-break: break-all;">${escapeHtml(displayName)}</td>
                <td style="padding: 6px 10px; text-align: right; white-space: nowrap;">${escapeHtml(size)}</td>
                <td style="padding: 6px 10px; text-align: center;">
        `;

        if (category === 'apps' && pkg) {
            html += `<button onclick="uninstallPackage('${escapeHtml(pkg)}')" 
                        style="background: #dc3545; color: white; border: none; border-radius: 12px; padding: 2px 10px; font-size: 11px; cursor: pointer;"
                        onmouseover="this.style.background='#b71c1c'" 
                        onmouseout="this.style.background='#dc3545'">
                        🗑️ Uninstall
                    </button>`;
        } else if (category !== 'apps' && path) {
            html += `<button onclick="deleteFile('${escapeHtml(path)}')" 
                        style="background: #dc3545; color: white; border: none; border-radius: 12px; padding: 2px 10px; font-size: 11px; cursor: pointer;"
                        onmouseover="this.style.background='#b71c1c'" 
                        onmouseout="this.style.background='#dc3545'">
                        🗑️ Delete
                    </button>`;
        } else {
            html += `<span style="color: #888; font-size: 11px;">—</span>`;
        }

        html += `</td></tr>`;
    }

    html += `
                    </tbody>
                </table>
            </div>
            <div style="font-size: 12px; color: #6c757d; margin-top: 6px; text-align: right;">Total: ${items.length} items</div>
        </div>
    `;

    detailsDiv.innerHTML = html;
    detailsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- Helper: format size in bytes to human-readable ----
function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
}

// ---- Render category details ----
function renderCategoryDetails(category, items) {
    const modalBody = document.getElementById('quickDiagModalBody');
    const detailsDiv = modalBody.querySelector('.category-details');
    if (!detailsDiv) return;

    if (!items || items.length === 0) {
        detailsDiv.innerHTML = `<div style="padding: 12px; color: #28a745;">✅ No items ≥1GB found in ${category}.</div>`;
        return;
    }

    // Sort by size descending
    items.sort((a, b) => b.bytes - a.bytes);

    let html = `
        <div style="margin-top: 12px; padding: 12px; background: #fff; border-radius: 8px; border: 1px solid #e5e7eb;">
            <h4 style="margin: 0 0 8px 0; font-size: 15px;">📁 ${category.charAt(0).toUpperCase() + category.slice(1)} Details</h4>
            <div style="max-height: 300px; overflow-y: auto;">
    `;

    for (const item of items) {
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #f1f3f5; font-size: 13px;">
                <span style="word-break: break-all; flex: 1; margin-right: 10px;">${escapeHtml(item.name)}</span>
                <span style="white-space: nowrap; margin-right: 10px; color: #555;">${escapeHtml(item.size)}</span>
                ${category === 'apps' ? `<button onclick="uninstallPackage('${escapeHtml(item.packageName)}')" style="background: #dc3545; color: white; border: none; border-radius: 12px; padding: 2px 10px; font-size: 11px; cursor: pointer;">🗑️ Uninstall</button>` : ''}
                ${category !== 'apps' && item.path ? `<button onclick="deleteFile('${escapeHtml(item.path)}')" style="background: #dc3545; color: white; border: none; border-radius: 12px; padding: 2px 10px; font-size: 11px; cursor: pointer;">🗑️ Delete</button>` : ''}
            </div>
        `;
    }

    html += `
            </div>
            <div style="font-size: 12px; color: #6c757d; margin-top: 4px;">Total: ${items.length} items</div>
        </div>
    `;

    detailsDiv.innerHTML = html;
    detailsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ==================== FILE OPERATIONS ====================

// ---- Delete a file ----
// ---- Delete a file ----
async function deleteFile(filePath) {
    // Use the custom modal
    const confirmed = await showConfirm(
        'Delete File',
        `Are you sure you want to delete this file?\n\n${filePath}`,
        { icon: '🗑️', danger: true, yesText: 'Delete', isPath: true }
    );
    if (!confirmed) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/delete-file`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: currentDeviceId, filePath })
        });
        const data = await response.json();
        if (response.ok) {
            await showAlert('Success', 'File deleted successfully.');
            // Refresh the details view if a category is open
            const activeCategory = document.querySelector('.storage-category.active');
            if (activeCategory) {
                showCategoryDetails(activeCategory.dataset.category);
            } else {
                runDeepDiagnostic();
            }
        } else {
            await showAlert('Error', `Failed to delete: ${data.error}`);
        }
    } catch (err) {
        await showAlert('Error', `Error: ${err.message}`);
    }
}

// ---- Uninstall an app ----
// ---- Uninstall an app ----
// ---- Uninstall an app (with optional success callback) ----
// ---- Uninstall an app (with optional success callback) ----
async function uninstallPackage(packageName, onSuccess) {
    const confirmed = await showConfirm(
        'Uninstall App',
        `Are you sure you want to uninstall this app?\n\n📱 ${packageName}`,
        { icon: '🗑️', danger: true, yesText: 'Uninstall', isPath: false }
    );
    if (!confirmed) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/uninstall-package`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: currentDeviceId, packageName })
        });
        const data = await response.json();
        if (response.ok) {
            await showAlert('Success', `Successfully uninstalled ${packageName}`);
            // Call the success callback if provided
            if (typeof onSuccess === 'function') {
                onSuccess(packageName);
            }
            // Refresh the details view if a category is open
            const activeCategory = document.querySelector('.storage-category.active');
            if (activeCategory) {
                showCategoryDetails(activeCategory.dataset.category);
            } else {
                // Only call runDeepDiagnostic if it exists (may not be defined in some contexts)
                if (typeof runDeepDiagnostic === 'function') {
                    runDeepDiagnostic();
                }
            }
        } else {
            await showAlert('Error', `Failed to uninstall: ${data.error}`);
        }
    } catch (err) {
        await showAlert('Error', `Error: ${err.message}`);
    }
}

// ---- Open app manager (placeholder) ----
function openAppManager() {
    alert('App Manager – you can uninstall apps from the Device Info page.');
    // Optionally navigate to Device Info page
    // document.querySelector('.nav-item[data-page="device-info"]')?.click();
}

// ==================== HELP MODAL ====================
// Help modal – redesigned with a connected vertical stepper (ADB setup is a real sequence,
// so numbered steps earn their place here) and a segmented pill control instead of plain tabs.
function showHelpModal() {
    const modal = document.getElementById('helpModal');
    if (!modal) createHelpModal();
    else modal.style.display = 'flex';
}

function createHelpModal() {
    const steps = [
        { title: 'Open Developer Options', desc: 'Settings → About Phone → tap "Build Number" 7 times.' },
        { title: 'Turn on USB Debugging', desc: 'Settings → Developer Options → enable USB Debugging.' },
        { title: 'Connect via USB', desc: 'Plug in the phone and accept the RSA key fingerprint on its screen.' },
        { title: 'Confirm the connection', desc: 'The device appears as "Connected" in the sidebar.' }
    ];

    const uiFields = [
        { icon: 'fa-gauge-high', name: 'Dashboard', desc: 'Battery, storage, RAM, network status, and quick actions.' },
        { icon: 'fa-mobile-screen', name: 'Device Info', desc: 'Detailed hardware and software properties.' },
        { icon: 'fa-microscope', name: 'Hardware Tests', desc: 'Runs diagnostic tests on individual components.' },
        { icon: 'fa-network-wired', name: 'Connection Troubleshoot', desc: 'Resets Wi-Fi, Bluetooth, and mobile data.' },
        { icon: 'fa-brain', name: 'AI Conclusion', desc: 'Analyzes test results and suggests fixes.' },
        { icon: 'fa-broom', name: 'Repairs', desc: 'Debloating and cleanup tools.' },
        { icon: 'fa-triangle-exclamation', name: 'BSOD Diagnosis', desc: 'Analyzes boot failures on unresponsive devices.' }
    ];

    const modalHTML = `
        <div id="helpModal" class="modal" style="display: none;">
            <div class="modal-content" style="max-width: 560px; padding: 0; border-radius: 16px; overflow: hidden;">

                <!-- Header -->
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid #f1f3f5;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-circle-question" style="font-size: 20px; color: #0d6efd;"></i>
                        <h3 style="margin: 0; font-size: 17px; font-weight: 600; color: #1f2937;">SmartHub Help Guide</h3>
                    </div>
                    <span id="closeHelpModalBtn" style="cursor: pointer; font-size: 22px; color: #9ca3af; line-height: 1;">&times;</span>
                </div>

                <!-- Segmented tab switcher -->
                <div style="padding: 16px 24px 0 24px;">
                    <div style="display: inline-flex; background: #f1f3f5; border-radius: 10px; padding: 3px; gap: 2px;">
                        <button class="help-tab-btn active" data-tab="adb" style="border: none; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.08); color: #1f2937; font-weight: 600; font-size: 13px; padding: 7px 16px; border-radius: 8px; cursor: pointer; transition: all 0.15s ease;">
                            ADB Setup
                        </button>
                        <button class="help-tab-btn" data-tab="ui" style="border: none; background: transparent; box-shadow: none; color: #6b7280; font-weight: 500; font-size: 13px; padding: 7px 16px; border-radius: 8px; cursor: pointer; transition: all 0.15s ease;">
                            UI Fields
                        </button>
                    </div>
                </div>

                <!-- Body -->
                <div style="padding: 20px 24px 24px 24px; max-height: 60vh; overflow-y: auto;">

                    <!-- ADB Setup: connected stepper -->
                    <div id="helpPanelAdb" class="help-panel">
                        <div style="display: flex; flex-direction: column;">
                            ${steps.map((step, i) => `
                                <div style="display: flex; gap: 14px;">
                                    <div style="display: flex; flex-direction: column; align-items: center; flex-shrink: 0;">
                                        <div style="width: 26px; height: 26px; border-radius: 50%; background: #0d6efd; color: white; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center;">
                                            ${i + 1}
                                        </div>
                                        ${i < steps.length - 1 ? '<div style="width: 2px; flex: 1; background: #e5e7eb; margin: 4px 0;"></div>' : ''}
                                    </div>
                                    <div style="padding-bottom: ${i < steps.length - 1 ? '22px' : '2px'};">
                                        <div style="font-size: 14px; font-weight: 600; color: #1f2937; margin-bottom: 2px;">${escapeHtml(step.title)}</div>
                                        <div style="font-size: 13px; color: #6b7280; line-height: 1.5;">${escapeHtml(step.desc)}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- UI Fields: reference list -->
                    <div id="helpPanelUi" class="help-panel" style="display: none;">
                        <div style="display: flex; flex-direction: column;">
                            ${uiFields.map(f => `
                                <div style="display: flex; align-items: flex-start; gap: 12px; padding: 11px 0; border-bottom: 1px solid #f1f3f5;">
                                    <div style="width: 30px; height: 30px; border-radius: 8px; background: #eff6ff; color: #0d6efd; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 13px;">
                                        <i class="fas ${f.icon}"></i>
                                    </div>
                                    <div>
                                        <div style="font-size: 14px; font-weight: 600; color: #1f2937;">${escapeHtml(f.name)}</div>
                                        <div style="font-size: 13px; color: #6b7280; margin-top: 1px; line-height: 1.4;">${escapeHtml(f.desc)}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // ---- Tab switching ----
    const tabButtons = document.querySelectorAll('.help-tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => {
                b.classList.remove('active');
                b.style.background = 'transparent';
                b.style.boxShadow = 'none';
                b.style.color = '#6b7280';
                b.style.fontWeight = '500';
            });
            btn.classList.add('active');
            btn.style.background = 'white';
            btn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
            btn.style.color = '#1f2937';
            btn.style.fontWeight = '600';

            document.querySelectorAll('.help-panel').forEach(p => p.style.display = 'none');
            const target = btn.dataset.tab === 'adb' ? 'helpPanelAdb' : 'helpPanelUi';
            document.getElementById(target).style.display = 'block';
        });
    });

    // ---- Close handlers ----
    const closeModal = () => document.getElementById('helpModal').style.display = 'none';
    document.getElementById('closeHelpModalBtn')?.addEventListener('click', closeModal);
    window.addEventListener('click', (e) => { if (e.target === document.getElementById('helpModal')) closeModal(); });

    document.getElementById('helpModal').style.display = 'flex';
}

// ==================== HARDWARE TESTS PAGE ====================
// Feature cache
let hardwareFeaturesCache = null;

async function getHardwareFeatures() {
    if (hardwareFeaturesCache !== null) return hardwareFeaturesCache;
    try {
        const res = await fetch(`${BACKEND_URL}/adb-shell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: currentDeviceId, command: 'pm list features' })
        });
        const data = await res.json();
        const output = data.output || '';
        const features = output.split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('feature:'))
            .map(line => line.replace('feature:', '').trim());
        hardwareFeaturesCache = features;
        return features;
    } catch (err) {
        console.warn('Could not fetch hardware features:', err);
        return [];
    }
}

// ==================== HARDWARE TESTS PAGE (FULL UPDATED) ====================


// ==================== LIVE SCREEN ====================
let liveScreenInterval = null;

async function renderLiveScreen() {
    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `<div class="card">No device connected.</div>`;
        return;
    }

    const container = document.getElementById('pageContent');
    container.innerHTML = `
        <h1>📱 Live Screen</h1>
        <div class="card">
            <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px;">
                <button id="captureBtn" class="btn-primary">🔄 Capture Now</button>
                <button id="autoRefreshBtn" class="btn-secondary">⏱️ Auto-Refresh (3s)</button>
                <button id="stopAutoBtn" class="btn-secondary" style="display: none;">⏹️ Stop</button>
                <button id="analyzeBtn" class="btn-primary" style="background: #7C3AED;">🔍 Read Text (OCR)</button>
            </div>
            <div id="liveScreenContainer" style="text-align: center;">
                <img id="liveScreenImg" src="" alt="Screenshot" style="max-width: 100%; max-height: 70vh; border: 1px solid #ccc; border-radius: 8px; display: none;">
                <div id="liveScreenPlaceholder" style="padding: 40px; color: #888;">Click "Capture Now" to see the phone screen.</div>
            </div>
            <div id="analysisResult" style="margin-top: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px; display: none; white-space: pre-wrap;"></div>
        </div>
    `;

    const img = document.getElementById('liveScreenImg');
    const placeholder = document.getElementById('liveScreenPlaceholder');
    const analysisDiv = document.getElementById('analysisResult');

    async function captureAndDisplay() {
        try {
            const resp = await fetch(`${BACKEND_URL}/api/screenshot?deviceId=${currentDeviceId}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            if (!data.image) throw new Error('No image data');
            img.src = `data:image/png;base64,${data.image}`;
            img.style.display = 'block';
            placeholder.style.display = 'none';
            return data.image;
        } catch (err) {
            alert('Capture failed: ' + err.message);
            return null;
        }
    }

    async function analyzeWithOCR() {
        // Check if Tesseract is loaded
        if (typeof Tesseract === 'undefined') {
            analysisDiv.style.display = 'block';
            analysisDiv.innerHTML = '❌ Tesseract.js not loaded. Please check the script tag in ui.html.';
            return;
        }

        const imgSrc = img.src;
        if (!imgSrc || imgSrc === '') {
            alert('Please capture a screenshot first.');
            return;
        }
        const base64Data = imgSrc.split(',')[1];
        if (!base64Data) {
            alert('Invalid image data.');
            return;
        }

        analysisDiv.style.display = 'block';
        analysisDiv.innerHTML = '🔍 OCR is reading the screen...';

        try {
            const result = await Tesseract.recognize(
                `data:image/png;base64,${base64Data}`,
                'eng',
                { logger: m => console.log(m) }
            );
            const text = result.data.text.trim();
            if (text.length === 0) {
                analysisDiv.innerHTML = '📝 No text detected on the screen.';
            } else {
                analysisDiv.innerHTML = `<strong>📝 Screen Text (OCR):</strong>\n${text}`;
            }
        } catch (err) {
            analysisDiv.innerHTML = `❌ OCR failed: ${err.message}`;
        }
    }

    document.getElementById('captureBtn').addEventListener('click', async () => {
        await captureAndDisplay();
        analysisDiv.style.display = 'none';
    });

    document.getElementById('analyzeBtn').addEventListener('click', analyzeWithOCR);

    let autoInterval = null;
    document.getElementById('autoRefreshBtn').addEventListener('click', () => {
        if (autoInterval) clearInterval(autoInterval);
        autoInterval = setInterval(async () => {
            await captureAndDisplay();
        }, 3000);
        document.getElementById('autoRefreshBtn').style.display = 'none';
        document.getElementById('stopAutoBtn').style.display = 'inline-block';
    });

    document.getElementById('stopAutoBtn').addEventListener('click', () => {
        if (autoInterval) clearInterval(autoInterval);
        autoInterval = null;
        document.getElementById('autoRefreshBtn').style.display = 'inline-block';
        document.getElementById('stopAutoBtn').style.display = 'none';
    });
}


// ==================== DEVICE INFO (smart auto‑refresh) ====================
let deviceInfoTimer = null;
let lastDeviceInfoData = null;

async function renderDeviceInfo() {
    const container = document.getElementById('pageContent');

    if (!currentDeviceId) {
        container.innerHTML = `<div class="card">${t('deviceInfo.noDevice')}</div>`;
        if (deviceInfoTimer) {
            clearTimeout(deviceInfoTimer);
            deviceInfoTimer = null;
        }
        lastDeviceInfoData = null;
        return;
    }

    // Clear any existing timer
    if (deviceInfoTimer) {
        clearTimeout(deviceInfoTimer);
        deviceInfoTimer = null;
    }

    // ---- Function to fetch and render only if data changed ----
    async function fetchAndRender(forceUpdate = false) {
        // Safety: only render if still on Device Info page
        const activePage = document.querySelector('.nav-item.active')?.dataset.page;
        if (activePage !== 'device-info') {
            console.log('[DeviceInfo] Not on Device Info page, skipping render');
            return;
        }

        try {
            const [infoRes, wifiRes] = await Promise.all([
                fetch(`${BACKEND_URL}/api/device/info/${currentDeviceId}`),
                fetch(`${BACKEND_URL}/wifi/status/${currentDeviceId}`).catch(() => null)
            ]);

            if (!infoRes.ok) throw new Error(`HTTP ${infoRes.status}`);
            const infoData = await infoRes.json();
            const wifiData = wifiRes && wifiRes.ok ? await wifiRes.json() : null;

            // Build hash for change detection
            const currentDataHash = JSON.stringify({ info: infoData, wifi: wifiData });
            if (!forceUpdate && lastDeviceInfoData === currentDataHash) {
                console.log('[DeviceInfo] No changes, skipping re-render');
                return;
            }

            console.log('[DeviceInfo] Data changed, re-rendering');

            // ---- Build the full HTML (your existing card logic) ----
            const props = infoData;
            const get = (key, fallback = '?') => props[key] !== undefined ? props[key] : fallback;
            const boolIcon = (val) => val ? '✅' : '❌';

            // ---- Existing fields ----
            const volteState = get('gsm.sys.volte.state') === '1' ? t('deviceInfo.on') : t('deviceInfo.off');
            const vowifiState = get('gsm.sys.vowifi.state') === '1' ? t('deviceInfo.on') : t('deviceInfo.off');
            const bluetoothOn = infoData.bluetoothOn !== undefined ? infoData.bluetoothOn : false;
            const mobileDataToggle = infoData.mobileDataToggle !== undefined ? infoData.mobileDataToggle : false;
            const mobileDataConnected = infoData.mobileDataConnected !== undefined ? infoData.mobileDataConnected : false;

            // ---- Battery ----
            const batteryCapacity = infoData.batteryCapacity ? infoData.batteryCapacity + ' mAh' : t('deviceInfo.notAvailable');
            const batteryHealth = infoData.batteryHealth || t('deviceInfo.notAvailable');
            const batteryVoltage = infoData.batteryVoltage ? infoData.batteryVoltage + ' mV' : t('deviceInfo.notAvailable');
            const batteryTemp = infoData.batteryTemperature ? infoData.batteryTemperature + '°C' : t('deviceInfo.notAvailable');
            const maxChargeCurrent = infoData.maxChargingCurrent ? infoData.maxChargingCurrent + ' mA' : t('deviceInfo.notAvailable');
            const maxChargeVoltage = infoData.maxChargingVoltage ? infoData.maxChargingVoltage + ' mV' : t('deviceInfo.notAvailable');

            // ---- Display ----
            const refreshRate = infoData.refreshRate || t('deviceInfo.notAvailable');

            // ---- Camera ----
            const camRes = (infoData.cameraResolutions && infoData.cameraResolutions.length)
                ? infoData.cameraResolutions.join(', ')
                : t('deviceInfo.notAvailable');

            // ---- MACs ----
            const wifiMac = infoData.wifiMac || t('deviceInfo.notAvailable');
            const btMac = infoData.btMac || t('deviceInfo.notAvailable');

            // ---- Paired devices ----
            const pairedDevices = infoData.pairedDevices || [];
            const pairedCount = pairedDevices.length;
            const pairedSummary = pairedCount > 0 ? `${pairedCount} ${t('deviceInfo.device')}${pairedCount > 1 ? t('deviceInfo.devicesPlural') : ''} ${t('deviceInfo.paired')}` : t('deviceInfo.none');

            // ---- New fields ----
            const widevineLevel = infoData.widevineLevel || t('deviceInfo.notAvailable');
            const drmSchemes = (infoData.drmSchemes && infoData.drmSchemes.length) ? infoData.drmSchemes.join(', ') : t('deviceInfo.none');
            const storageTotal = infoData.storageTotal || '?';
            const storageUsed = infoData.storageUsed || '?';
            const storageFree = infoData.storageFree || '?';
            const storageType = infoData.storageType || t('deviceInfo.unknown');
            const gnss = (infoData.gnssProviders && infoData.gnssProviders.length) ? infoData.gnssProviders.join(', ') : t('deviceInfo.unknown');
            const hasGyroText = infoData.hasGyro ? '✅' : '❌';
            const hasMagText = infoData.hasMagnetometer ? '✅' : '❌';
            const hasBaroText = infoData.hasBarometer ? '✅' : '❌';
            const usbOtg = infoData.usbOtgSupported ? t('deviceInfo.usbOtgSupported') : t('deviceInfo.usbOtgNotSupported');
            const localIp = infoData.localIp || t('deviceInfo.notConnected');
            const gateway = infoData.gateway || t('deviceInfo.notAvailable');
            const dns = (infoData.dnsServers && infoData.dnsServers.length) ? infoData.dnsServers.join(', ') : t('deviceInfo.notAvailable');

            // ---- Helpers ----
            const makeCard = (title, icon, items) => `
                <div class="info-card">
                    <div class="card-header"><i class="${icon}"></i> ${title}</div>
                    <div class="card-grid">
                        ${items.map(item => `<div class="card-item"><span class="item-label">${item.label}</span><span class="item-value">${escapeHtml(item.value)}</span></div>`).join('')}
                    </div>
                </div>
            `;

            const makeCardWithExtra = (title, icon, items, extraHtml) => `
                <div class="info-card">
                    <div class="card-header"><i class="${icon}"></i> ${title}</div>
                    <div class="card-grid">
                        ${items.map(item => `<div class="card-item"><span class="item-label">${item.label}</span><span class="item-value">${escapeHtml(item.value)}</span></div>`).join('')}
                    </div>
                    ${extraHtml ? `<div style="padding: 8px 16px 12px; text-align: right;">${extraHtml}</div>` : ''}
                </div>
            `;

            const cards = [];

            // ---- Device Overview ----
            cards.push(makeCard(t('deviceInfo.deviceOverview'), 'fas fa-info-circle', [
                { label: t('deviceInfo.model'), value: get('ro.product.model', t('deviceInfo.unknown')) },
                { label: t('deviceInfo.manufacturer'), value: get('ro.product.manufacturer', t('deviceInfo.unknown')) },
                { label: t('deviceInfo.android'), value: `${get('ro.build.version.release')} (SDK ${get('ro.build.version.sdk')})` },
                { label: t('deviceInfo.securityPatch'), value: get('ro.build.version.security_patch') },
                { label: t('deviceInfo.boardCpu'), value: `${get('ro.product.board')} / ${get('ro.product.cpu.abi')}` },
                { label: t('deviceInfo.serial'), value: get('ro.serialno') },
                { label: t('deviceInfo.displayRes'), value: `${get('sys.logical.width', '?')} x ${get('sys.logical.height', '?')}` }
            ]));

            // ---- Battery ----
            cards.push(makeCard(t('deviceInfo.battery'), 'fas fa-battery-full', [
                { label: t('deviceInfo.capacity'), value: batteryCapacity },
                { label: t('deviceInfo.health'), value: batteryHealth },
                { label: t('deviceInfo.voltage'), value: batteryVoltage },
                { label: t('deviceInfo.temperature'), value: batteryTemp },
                { label: t('deviceInfo.maxChargeCurrent'), value: maxChargeCurrent },
                { label: t('deviceInfo.maxChargeVoltage'), value: maxChargeVoltage }
            ]));

            // ---- Display ----
            cards.push(makeCard(t('deviceInfo.display'), 'fas fa-desktop', [
                { label: t('deviceInfo.refreshRate'), value: refreshRate },
                { label: t('deviceInfo.density'), value: `${get('ro.sf.lcd_density', '?')} dpi` }
            ]));

            // ---- Camera ----
            cards.push(makeCard(t('deviceInfo.camera'), 'fas fa-camera', [
                { label: t('deviceInfo.resolutions'), value: camRes }
            ]));

            // ---- DRM & Media ----
            cards.push(makeCard(t('deviceInfo.drm'), 'fas fa-lock', [
                { label: t('deviceInfo.widevine'), value: widevineLevel },
                { label: t('deviceInfo.supportedDrm'), value: drmSchemes }
            ]));

            // ---- Storage ----
            cards.push(makeCard(t('deviceInfo.storage'), 'fas fa-hdd', [
                { label: t('deviceInfo.totalData'), value: storageTotal },
                { label: t('deviceInfo.used'), value: storageUsed },
                { label: t('deviceInfo.free'), value: storageFree },
                { label: t('deviceInfo.hardwareType'), value: storageType }
            ]));

            // ---- GNSS / GPS ----
            cards.push(makeCard(t('deviceInfo.gnss'), 'fas fa-satellite', [
                { label: t('deviceInfo.satellites'), value: gnss }
            ]));

            // ---- Sensors ----
            cards.push(makeCard(t('deviceInfo.sensors'), 'fas fa-microchip', [
                { label: t('deviceInfo.gyroscope'), value: hasGyroText },
                { label: t('deviceInfo.magnetometer'), value: hasMagText },
                { label: t('deviceInfo.barometer'), value: hasBaroText }
            ]));

            // ---- USB OTG ----
            cards.push(makeCard(t('deviceInfo.usbOtg'), 'fas fa-usb', [
                { label: t('deviceInfo.hostMode'), value: usbOtg }
            ]));

            // ---- Network Details ----
            cards.push(makeCard(t('deviceInfo.networkDetails'), 'fas fa-network-wired', [
                { label: t('deviceInfo.localIp'), value: localIp },
                { label: t('deviceInfo.gateway'), value: gateway },
                { label: t('deviceInfo.dnsServers'), value: dns }
            ]));

            // ---- Bluetooth ----
            let pairedExtra = '';
            if (pairedCount > 0) {
                pairedExtra = `<button class="btn-secondary" style="font-size:12px; padding:4px 12px;" onclick="showPairedDevicesModal()">📋 ${t('deviceInfo.showPaired')} (${pairedCount})</button>`;
            }
            cards.push(makeCardWithExtra(t('deviceInfo.bluetooth'), 'fab fa-bluetooth', [
                { label: t('deviceInfo.enabled'), value: boolIcon(bluetoothOn) },
                { label: t('deviceInfo.adapterState'), value: bluetoothOn ? t('deviceInfo.on') : t('deviceInfo.off') },
                { label: t('deviceInfo.pairedDevices'), value: pairedSummary },
                { label: t('deviceInfo.macAddress'), value: btMac }
            ], pairedExtra));

            // ---- WiFi ----
            let wifiItems = [];
            if (wifiData && wifiData.wifi) {
                const info = formatWifiStatus(wifiData.wifi);
                wifiItems = [
                    { label: t('deviceInfo.ssid'), value: info.ssid },
                    { label: t('deviceInfo.status'), value: info.status },
                    { label: t('deviceInfo.signal'), value: info.signal },
                    { label: t('deviceInfo.linkSpeed'), value: info.linkSpeed },
                    { label: t('deviceInfo.frequency'), value: info.frequency },
                    { label: t('deviceInfo.macAddress'), value: wifiMac }
                ];
            } else {
                wifiItems = [
                    { label: t('deviceInfo.status'), value: t('deviceInfo.wifiUnavailable') },
                    { label: t('deviceInfo.macAddress'), value: wifiMac }
                ];
            }
            cards.push(makeCard(t('deviceInfo.wifi'), 'fas fa-wifi', wifiItems));

            // ---- Network & SIM ----
            cards.push(makeCard(t('deviceInfo.networkSim'), 'fas fa-network-wired', [
                { label: t('deviceInfo.operator'), value: get('gsm.operator.alpha', t('deviceInfo.unknown')) },
                { label: t('deviceInfo.networkType'), value: get('gsm.network.type', t('deviceInfo.unknown')) },
                { label: t('deviceInfo.simState'), value: get('gsm.sim.state', t('deviceInfo.unknown')) },
                { label: t('deviceInfo.mobileDataToggle'), value: boolIcon(mobileDataToggle) },
                { label: t('deviceInfo.mobileDataConnected'), value: boolIcon(mobileDataConnected) },
                { label: t('deviceInfo.volteVowifi'), value: `${t('deviceInfo.volte')} ${volteState} / ${t('deviceInfo.vowifi')} ${vowifiState}` }
            ]));

            // ---- System & Build ----
            cards.push(makeCard(t('deviceInfo.systemBuild'), 'fas fa-code-branch', [
                { label: t('deviceInfo.fingerprint'), value: get('ro.build.fingerprint', 'N/A').substring(0, 60) + '...' },
                { label: t('deviceInfo.buildDate'), value: get('ro.build.date', 'N/A') },
                { label: t('deviceInfo.bootloader'), value: get('ro.bootloader', t('deviceInfo.unknown')) },
                { label: t('deviceInfo.encryption'), value: get('ro.crypto.state') === 'encrypted' ? '🔒 ' + t('deviceInfo.encrypted') : t('deviceInfo.unencrypted') }
            ]));

            // ---- Hardware ----
            cards.push(makeCard(t('deviceInfo.hardware'), 'fas fa-microchip', [
                { label: t('deviceInfo.soc'), value: `${get('ro.soc.model', 'N/A')} (${get('ro.board.platform', 'N/A')})` },
                { label: t('deviceInfo.gpu'), value: get('ro.hardware.egl', 'N/A') },
                { label: t('deviceInfo.ram'), value: get('ro.boot.ddrsize', 'N/A') },
                { label: t('deviceInfo.displayDensity'), value: `${get('ro.sf.lcd_density', 'N/A')} dpi` }
            ]));

            // ---- Special Features ----
            cards.push(makeCard(t('deviceInfo.specialFeatures'), 'fas fa-star', [
                { label: t('deviceInfo.gestureSupport'), value: get('ro.os_gesture_support') === '1' ? '✅' : '❌' },
                { label: t('deviceInfo.gameMode'), value: get('ro.os_gamemode_support') === '1' ? '✅' : '❌' },
                { label: t('deviceInfo.faceUnlock'), value: get('ro.faceid.support') === '1' ? '✅' : '❌' },
                { label: t('deviceInfo.fingerprintSensor'), value: get('ro.fingerprint_support') === '1' ? '✅' : '❌' }
            ]));

            // ---- Security & Boot ----
            cards.push(makeCard(t('deviceInfo.securityBoot'), 'fas fa-shield-alt', [
                { label: t('deviceInfo.verifiedBoot'), value: get('ro.boot.verifiedbootstate', t('deviceInfo.unknown')) },
                { label: t('deviceInfo.bootloaderLock'), value: get('ro.boot.flash.locked') === '1' ? '🔒 ' + t('deviceInfo.locked') : '🔓 ' + t('deviceInfo.unlocked') },
                { label: t('deviceInfo.dmVerity'), value: get('ro.boot.veritymode', t('deviceInfo.unknown')) },
                { label: t('deviceInfo.adbSecure'), value: get('ro.adb.secure') === '1' ? t('deviceInfo.yes') : t('deviceInfo.no') }
            ]));

            const finalHtml = `<div class="cards-container">${cards.join('')}</div>`;
            container.innerHTML = finalHtml;
            window._pairedDevices = pairedDevices;

            // Update the stored hash
            lastDeviceInfoData = currentDataHash;

        } catch (err) {
            container.innerHTML = `<div class="card">${t('deviceInfo.errorLoading')}: ${escapeHtml(err.message)}</div>`;
        }
    }

    // ---- Initial fetch (force update) ----
    await fetchAndRender(true);

    // ---- Schedule the next refresh ----
    function scheduleNextRefresh() {
        if (deviceInfoTimer) {
            clearTimeout(deviceInfoTimer);
            deviceInfoTimer = null;
        }

        const activePage = document.querySelector('.nav-item.active')?.dataset.page;
        if (activePage === 'device-info' && currentDeviceId) {
            deviceInfoTimer = setTimeout(async () => {
                await fetchAndRender(false);
                scheduleNextRefresh();
            }, 3000);
        } else {
            deviceInfoTimer = null;
            lastDeviceInfoData = null;
        }
    }

    scheduleNextRefresh();
}

// ---- Show Paired Devices Modal ----
function showPairedDevicesModal() {
    const devices = window._pairedDevices || [];
    if (!devices.length) {
        alert('No paired devices found.');
        return;
    }

    let modal = document.getElementById('pairedDevicesModal');
    if (!modal) {
        const modalHtml = `
            <div id="pairedDevicesModal" class="modal" style="display: none;">
                <div class="modal-content" style="max-width: 600px; max-height: 80vh; display: flex; flex-direction: column;">
                    <div class="modal-header">
                        <h3><i class="fab fa-bluetooth"></i> Paired Bluetooth Devices</h3>
                        <span class="close-button" id="closePairedModal">&times;</span>
                    </div>
                    <div class="modal-body" id="pairedDevicesBody" style="flex: 1; overflow-y: auto; padding: 8px 16px;">
                        <!-- Devices rendered here -->
                    </div>
                    <div class="modal-footer">
                        <button id="closePairedModalBtn" class="btn-secondary">Close</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('pairedDevicesModal');
        document.getElementById('closePairedModal').addEventListener('click', () => modal.style.display = 'none');
        document.getElementById('closePairedModalBtn').addEventListener('click', () => modal.style.display = 'none');
        window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    }

    // Inject CSS to hide scrollbar and style items
    const style = document.createElement('style');
    style.id = 'pairedDevicesModalStyle';
    style.textContent = `
        #pairedDevicesBody::-webkit-scrollbar {
            display: none;
        }
        #pairedDevicesBody {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
        .paired-device-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid #f0f0f0;
        }
        .paired-device-item:last-child {
            border-bottom: none;
        }
        .paired-device-info {
            flex: 1;
            min-width: 0;
            padding-right: 12px;
        }
        .paired-device-name {
            font-weight: 600;
            font-size: 14px;
            color: #1f1f1f;
        }
        .paired-device-mac {
            font-size: 12px;
            color: #888;
            font-family: monospace;
            margin-top: 2px;
        }
        .paired-device-forget-btn {
            flex-shrink: 0;
            background: #dc3545;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 4px 14px;
            font-size: 12px;
            cursor: pointer;
            transition: background 0.2s;
        }
        .paired-device-forget-btn:hover {
            background: #b71c1c;
        }
    `;
    // Remove old style if exists
    const oldStyle = document.getElementById('pairedDevicesModalStyle');
    if (oldStyle) oldStyle.remove();
    document.head.appendChild(style);

    const body = document.getElementById('pairedDevicesBody');
    body.innerHTML = devices.map(d => {
        // If name is "Unknown" or empty, use MAC as the display name
        const displayName = (d.name && d.name !== 'Unknown' && d.name !== 'null' && d.name.trim() !== '') 
            ? d.name 
            : d.mac;
        return `
            <div class="paired-device-item">
                <div class="paired-device-info">
                    <div class="paired-device-name">${escapeHtml(displayName)}</div>
                    <div class="paired-device-mac">${escapeHtml(d.mac)}</div>
                </div>
                <button class="paired-device-forget-btn" onclick="forgetBluetoothDevice('${d.mac}')">Forget</button>
            </div>
        `;
    }).join('');

    modal.style.display = 'flex';
}

// ---- Forget a Bluetooth device ----
async function forgetBluetoothDevice(mac) {
    if (!confirm(`Forget device with MAC ${mac}?`)) return;
    try {
        const response = await fetch(`${BACKEND_URL}/api/forget-bluetooth-device`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: currentDeviceId, mac })
        });
        const data = await response.json();
        if (response.ok) {
            alert('Device forgotten successfully.');
            // Refresh the device info to update paired list
            await renderDeviceInfo();
            // Close modal if open
            const modal = document.getElementById('pairedDevicesModal');
            if (modal) modal.style.display = 'none';
        } else {
            alert('Failed to forget device: ' + (data.error || 'Unknown error'));
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}
// ==================== AI CONCLUSION ====================


// ==================== SETTINGS PAGE ====================
// ==================== I18N ====================
// Minimal, real translation system. Add more keys/languages as you go —
// any element with data-i18n="key" gets its text swapped automatically.

// ==================== SETTINGS PAGE ====================


// ==================== THEME COLOR ====================
// Your render functions hardcode "#0d6efd" / "#0b5ed7" directly in inline
// styles (confirmed across renderAdvancedDiagnostic, renderAIConclusion, etc.),
// they don't read a CSS variable. So changing the color has to happen two ways:
//  1. Set CSS variables for any NEW markup that's written to use them.
//  2. Sweep the DOM that's already on screen and rewrite the literal hex
//     values in inline `style` attributes to the new color.
// A MutationObserver on #pageContent re-runs step 2 automatically every time
// you navigate to a different page, so the whole app stays re-themed without
// having to touch every render function individually.

const DEFAULT_PRIMARY = '#0d6efd';
const DEFAULT_PRIMARY_DARK = '#0b5ed7';

// ---- Helper: get black or white text based on background color ----
function getContrastColor(hex) {
    if (!hex) return '#ffffff';
    let cleaned = String(hex).trim();
    if (cleaned.startsWith('#')) cleaned = cleaned.slice(1);
    if (cleaned.length === 3) {
        cleaned = cleaned.split('').map(ch => ch + ch).join('');
    }
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return '#ffffff';
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? '#000000' : '#ffffff';
}

// ---- Helper: darken a hex color ----
function adjustColor(hex, percent) {
    if (!hex) return '#0b5ed7';
    let r, g, b;
    if (hex.startsWith('#')) {
        const full = hex.length === 7 ? hex : `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
        r = parseInt(full.slice(1, 3), 16);
        g = parseInt(full.slice(3, 5), 16);
        b = parseInt(full.slice(5, 7), 16);
    } else {
        return '#0b5ed7';
    }
    const darken = (val) => Math.max(0, Math.min(255, val + percent));
    return `#${darken(r).toString(16).padStart(2, '0')}${darken(g).toString(16).padStart(2, '0')}${darken(b).toString(16).padStart(2, '0')}`;
}

// ---- Sweep inline styles: replace hardcoded colors with theme values ----
function sweepThemeColors(root, colors) {
    // colors = { accent, btnColor, bgColor, cardColor, textColor }
    if (!root) return;

    // Prepare regex patterns for replacement
    const accent = colors.accent || '#0d6efd';
    const btnColor = colors.btnColor || accent;
    const cardBg = colors.cardColor || '#ffffff';
    const text = colors.textColor || '#1f2937';
    const bg = colors.bgColor || '#ffffff';

    const btnDark = adjustColor(btnColor, -20);
    const accentDark = adjustColor(accent, -20);
    const buttonTextColor = getContrastColor(btnColor);

    root.querySelectorAll('[style]').forEach(el => {
        let style = el.getAttribute('style');
        if (!style) return;
        let modified = false;

        // ---- 1. Replace old primary colors with new accent ----
        // (Keep for backward compatibility with old inline styles)
        const oldPrimary = '#0d6efd';
        const oldPrimaryDark = '#0b5ed7';
        if (style.toLowerCase().includes(oldPrimary) || style.toLowerCase().includes(oldPrimaryDark)) {
            style = style.replace(new RegExp(oldPrimary, 'gi'), accent);
            style = style.replace(new RegExp(oldPrimaryDark, 'gi'), accentDark);
            modified = true;
        }

        // ---- 2. Replace hardcoded card backgrounds (white) with cardBg ----
        const bgPatterns = [
            /background:\s*white/gi,
            /background:\s*#fff/gi,
            /background:\s*#ffffff/gi,
            /background:\s*#FFFFFF/gi,
            /background:\s*rgb\(255,\s*255,\s*255\)/gi,
            /background:\s*rgba\(255,\s*255,\s*255,\s*1\)/gi,
            /background-color:\s*white/gi,
            /background-color:\s*#fff/gi,
            /background-color:\s*#ffffff/gi,
            /background-color:\s*#FFFFFF/gi,
            /background-color:\s*rgb\(255,\s*255,\s*255\)/gi,
            /background-color:\s*rgba\(255,\s*255,\s*255,\s*1\)/gi
        ];
        bgPatterns.forEach(pattern => {
            if (pattern.test(style)) {
                style = style.replace(pattern, `background: ${cardBg}`);
                modified = true;
            }
        });

        // ---- 3. Replace hardcoded text colors with textColor ----
        const textPatterns = [
            /color:\s*#1f2937/gi,
            /color:\s*#374151/gi,
            /color:\s*#6B7280/gi, // muted text – replace with textColor (opacity can be added later)
        ];
        textPatterns.forEach(pattern => {
            if (pattern.test(style)) {
                style = style.replace(pattern, `color: ${text}`);
                modified = true;
            }
        });

        // ---- 4. Replace primary button backgrounds with btnColor ----
        // (We'll handle buttons separately, but we can also catch inline button styles)
        const btnBgPatterns = [
            /background:\s*#0d6efd/gi,
            /background:\s*#0b5ed7/gi,
            /background:\s*rgb\(13,\s*110,\s*253\)/gi,
        ];
        btnBgPatterns.forEach(pattern => {
            if (pattern.test(style)) {
                style = style.replace(pattern, `background: ${btnColor}`);
                // Also set text color to contrast
                style = style.replace(/color:\s*[^;]+/gi, `color: ${buttonTextColor}`);
                modified = true;
            }
        });

        if (modified) {
            el.setAttribute('style', style);
        }
    });

    // ---- Additionally, apply to .btn-primary elements directly ----
    root.querySelectorAll('.btn-primary, button.primary, .auth-login-btn, #saveSettingsBtn, .auth-login-btn').forEach(btn => {
        btn.style.setProperty('background', btnColor, 'important');
        btn.style.setProperty('border-color', btnColor, 'important');
        btn.style.setProperty('color', buttonTextColor, 'important');
    });
}

// ---- Apply full theme (accent, button color, background, card, text) ----
function applyThemeColor(colors) {
    // Accepts either a settings object or individual values
    const accent = colors.themeColor || colors.accent || '#0d6efd';
    const btnColor = colors.buttonColor || colors.btnColor || accent;
    const bg = colors.bgColor || colors.bg || '#ffffff';
    const cardBg = colors.cardColor || colors.cardBg || '#ffffff';
    const text = colors.textColor || colors.text || '#1f2937';

    // Store the active theme for later use
    window._activeTheme = { themeColor: accent, buttonColor: btnColor, bgColor: bg, cardColor: cardBg, textColor: text };

    // Set CSS custom properties
    document.documentElement.style.setProperty('--primary-color', accent);
    document.documentElement.style.setProperty('--primary-color-dark', adjustColor(accent, -20));
    document.documentElement.style.setProperty('--button-color', btnColor);
    document.documentElement.style.setProperty('--button-color-dark', adjustColor(btnColor, -20));
    document.documentElement.style.setProperty('--bg-color', bg);
    document.documentElement.style.setProperty('--card-color', cardBg);
    document.documentElement.style.setProperty('--text-color', text);

    // Apply to body and main containers
    document.body.style.backgroundColor = bg;
    document.body.style.color = text;

    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.style.backgroundColor = bg;
        mainContent.style.color = text;
    }

    const pageContent = document.getElementById('pageContent');
    if (pageContent) {
        pageContent.style.backgroundColor = bg;
        pageContent.style.color = text;
    }

    // Sweep inline styles across the whole document
    const colorsObj = { accent, btnColor, bgColor: bg, cardColor: cardBg, textColor: text };
    sweepThemeColors(document.body, colorsObj);

    // Also sweep modals, sidebar, etc.
    document.querySelectorAll('.modal, .modal-content, .modal-header, .modal-body, .modal-footer').forEach(el => {
        sweepThemeColors(el, colorsObj);
    });
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sweepThemeColors(sidebar, colorsObj);
    const header = document.querySelector('header.app-header');
    if (header) sweepThemeColors(header, colorsObj);

    console.log('[Theme] Applied (full):', colorsObj);
}

function hexToRgb(hex) {
    if (!hex) return null;
    const h = hex.replace('#','');
    const full = h.length === 6 ? h : h.split('').map(c=>c+c).join('');
    const r = parseInt(full.slice(0,2),16);
    const g = parseInt(full.slice(2,4),16);
    const b = parseInt(full.slice(4,6),16);
    return { r, g, b };
}

// Re-apply the active theme color whenever #pageContent's content changes
// (i.e. every time the user navigates to a page rendered with the default blue).
document.addEventListener('DOMContentLoaded', () => {
    const pageContent = document.getElementById('pageContent');
    if (!pageContent) return;

    const observer = new MutationObserver((mutations) => {
        // Apply theme sweeps immediately.
        if (window._activeThemeColor && window._activeThemeColor.toLowerCase() !== DEFAULT_PRIMARY) {
            sweepThemeColors(pageContent, window._activeThemeColor, adjustColor(window._activeThemeColor, -20));
        }

        // Safely re-run scoped translations after a page render. Disconnect
        // observer while translating to avoid recursive mutation handling.
        if (window._activeLang && window._activeLang !== 'en' && window.SmartHubI18n && typeof window.SmartHubI18n.applyTranslations === 'function') {
            try {
                observer.disconnect();
                window.SmartHubI18n.applyTranslations(pageContent);
                window.SmartHubI18n.applyTranslations(document.querySelector('.sidebar'));
                window.SmartHubI18n.applyTranslations(document.querySelector('header.app-header'));
            } catch (e) {
                // ignore
            } finally {
                observer.observe(pageContent, { childList: true, subtree: true });
            }
        }
    });
    observer.observe(pageContent, { childList: true, subtree: true });

    // Apply whatever was saved before any page renders, in case Settings
    // wasn't the first page visited this session.
    const saved = JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en","themeColor":"#0d6efd"}');
    applyThemeColor(saved.themeColor || DEFAULT_PRIMARY);
    if (window.SmartHubI18n && typeof window.SmartHubI18n.setCurrentLang === 'function') {
        try {
            window.SmartHubI18n.setCurrentLang(saved.language || 'en', pageContent);
            // Ensure sidebar and header also translate on initial load
            try {
                window.SmartHubI18n.applyTranslations(document.querySelector('.sidebar'));
                window.SmartHubI18n.applyTranslations(document.querySelector('header.app-header'));
            } catch (e) { /* ignore */ }
        } catch (e) {
            applyLanguage(saved.language || 'en');
        }
    } else {
        applyLanguage(saved.language || 'en');
    }
});

// Helper to darken a hex color by a percentage (for gradient)
function adjustColor(hex, percent) {
    let r, g, b;
    if (hex.startsWith('#')) {
        const full = hex.length === 7 ? hex : `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
        r = parseInt(full.slice(1,3), 16);
        g = parseInt(full.slice(3,5), 16);
        b = parseInt(full.slice(5,7), 16);
    } else {
        return '#0b5ed7';
    }
    const darken = (val) => Math.max(0, Math.min(255, val + percent));
    return `#${darken(r).toString(16).padStart(2,'0')}${darken(g).toString(16).padStart(2,'0')}${darken(b).toString(16).padStart(2,'0')}`;
}

// ==================== CONNECTION TROUBLESHOOT ====================
async function callFix(service, action) {
    const response = await fetch(`${BACKEND_URL}/android-connectivity/fix/${currentDeviceId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
}

async function renderFullFixPage(showWarning) {
    try {
        // Fetch WiFi and device info
        const [wifiRes, infoRes] = await Promise.all([
            fetch(`${BACKEND_URL}/wifi/status/${currentDeviceId}`).catch(() => null),
            fetch(`${BACKEND_URL}/api/device/info/${currentDeviceId}`).catch(() => null)
        ]);

        let bluetoothOn = false;
        let mobileDataToggle = false;
        let mobileDataConnected = false;
        let pairedDevices = [];
        if (infoRes && infoRes.ok) {
            const infoData = await infoRes.json();
            bluetoothOn = infoData.bluetoothOn !== undefined ? infoData.bluetoothOn : false;
            mobileDataToggle = infoData.mobileDataToggle !== undefined ? infoData.mobileDataToggle : false;
            mobileDataConnected = infoData.mobileDataConnected !== undefined ? infoData.mobileDataConnected : false;
            pairedDevices = infoData.pairedDevices || [];
        }

        // WiFi
        let wifiHtml = '';
        if (wifiRes && wifiRes.ok) {
            const wifiData = await wifiRes.json();
            if (wifiData.wifi) {
                const w = wifiData.wifi;
                const info = formatWifiStatus(w);
                wifiHtml = `
                    <div class="info-card">
                        <div class="card-header"><i class="fas fa-wifi"></i> WiFi</div>
                        <div class="card-grid">
                            <div class="card-item"><span class="item-label">SSID</span><span class="item-value">${escapeHtml(info.ssid)}</span></div>
                            <div class="card-item"><span class="item-label">Status</span><span class="item-value">${escapeHtml(info.status)}</span></div>
                            <div class="card-item"><span class="item-label">Signal</span><span class="item-value">${escapeHtml(info.signal)}</span></div>
                            <div class="card-item"><span class="item-label">Link Speed</span><span class="item-value">${escapeHtml(info.linkSpeed)}</span></div>
                        </div>
                        <div class="card-actions" style="display:flex; flex-wrap:wrap; gap:8px; padding:8px 16px 12px;">
                            <button class="btn-primary fix-wifi" data-action="wifi_reset">🔄 Reset WiFi</button>
                            <button class="btn-secondary fix-wifi" data-action="wifi_scan">📡 Scan</button>
                        </div>
                    </div>
                `;
            } else {
                wifiHtml = `<div class="info-card"><div class="card-header"><i class="fas fa-wifi"></i> WiFi</div><div class="card-grid"><div class="card-item">Unable to fetch WiFi status</div></div></div>`;
            }
        } else {
            wifiHtml = `<div class="info-card"><div class="card-header"><i class="fas fa-wifi"></i> WiFi</div><div class="card-grid"><div class="card-item">Unable to fetch WiFi status</div></div></div>`;
        }

        // Bluetooth
        const pairedCount = pairedDevices.length;
        const pairedDisplay = pairedCount > 0 ? `${pairedCount} device${pairedCount > 1 ? 's' : ''} paired` : 'None';
        const btHtml = `
            <div class="info-card">
                <div class="card-header"><i class="fab fa-bluetooth"></i> Bluetooth</div>
                <div class="card-grid">
                    <div class="card-item"><span class="item-label">Enabled</span><span class="item-value">${bluetoothOn ? '✅ Yes' : '❌ No'}</span></div>
                    <div class="card-item"><span class="item-label">Paired Devices</span><span class="item-value">${pairedDisplay}</span></div>
                    <div class="card-item"><span class="item-label">Connected</span><span class="item-value">${'?'}</span></div>
                </div>
                <div class="card-actions" style="display:flex; flex-wrap:wrap; gap:8px; padding:8px 16px 12px;">
                    <button class="btn-primary fix-bluetooth" data-action="bluetooth_reset">🔄 Reset Bluetooth</button>
                    <button class="btn-secondary fix-bluetooth" data-action="bluetooth_force_stop">⏹️ Force Stop & Reset</button>
                    <button class="btn-secondary fix-bluetooth" data-action="bluetooth_clear_cache">🧹 Clear Cache</button>
                </div>
            </div>
        `;

        // Mobile Data
        const mobileHtml = `
            <div class="info-card">
                <div class="card-header"><i class="fas fa-mobile-alt"></i> Mobile Data</div>
                <div class="card-grid">
                    <div class="card-item"><span class="item-label">Toggle</span><span class="item-value">${mobileDataToggle ? '✅ On' : '❌ Off'}</span></div>
                    <div class="card-item"><span class="item-label">Connection</span><span class="item-value">${mobileDataConnected ? '✅ Connected' : '❌ Not Connected'}</span></div>
                </div>
                <div class="card-actions" style="display:flex; flex-wrap:wrap; gap:8px; padding:8px 16px 12px;">
                    <button class="btn-primary fix-mobile" data-action="mobile_data_reset">🔄 Reset Mobile Data</button>
                    <button class="btn-secondary fix-mobile" data-action="set_lte">📶 Force LTE</button>
                </div>
            </div>
        `;

        // Advanced Network Fixes
        const advancedHtml = `
            <div class="info-card">
                <div class="card-header"><i class="fas fa-tools"></i> Advanced Network Fixes</div>
                <div class="card-grid">
                    <div class="card-item" style="grid-column: span 2;">
                        <span style="font-size:13px; color:#6B7280;">These actions reset all radios or network configurations.</span>
                    </div>
                </div>
                <div class="card-actions" style="display:flex; flex-wrap:wrap; gap:8px; padding:8px 16px 12px;">
                    <button class="btn-secondary fix-advanced" data-action="airplane_mode_reset">✈️ Airplane Mode Reset</button>
                    <button class="btn-secondary fix-advanced" data-action="reset_network_full">🔄 Full Network Reset</button>
                </div>
            </div>
        `;

        // Build the full HTML with optional warning
        let warningHtml = '';
        if (showWarning) {
            warningHtml = `
                <div class="info-card" style="border-left:4px solid #f59e0b; margin-bottom:16px;">
                    <div class="card-content" style="color:#92400e;">
                        ⚠️ All services are healthy. Fixes are available but not required.
                    </div>
                </div>
            `;
        }

        const html = `
            ${warningHtml}
            <div class="cards-container">
                ${wifiHtml}
                ${btHtml}
                ${mobileHtml}
                ${advancedHtml}
            </div>
            <div id="fixResult" class="card" style="display: none; margin-top: 20px;"></div>
        `;

        document.getElementById('pageContent').innerHTML = html;

        // ---- Attach event listeners (same as before) ----
        async function callFix(service, action) {
            const response = await fetch(`${BACKEND_URL}/android-connectivity/fix/${currentDeviceId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        }

        function showFixResult(message, isError = false) {
            const resultDiv = document.getElementById('fixResult');
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = `<div style="color: ${isError ? '#d32f2f' : '#2e7d32'};">${escapeHtml(message)}</div>`;
            setTimeout(() => resultDiv.style.display = 'none', 5000);
        }

        // WiFi
        document.querySelectorAll('.fix-wifi').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;
                try {
                    await callFix('wifi', action);
                    showFixResult(`WiFi fix '${action}' completed.`);
                    setTimeout(() => renderFullFixPage(showWarning), 2000);
                } catch (err) {
                    showFixResult(`WiFi fix failed: ${err.message}`, true);
                }
            });
        });

        // Bluetooth
        document.querySelectorAll('.fix-bluetooth').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;
                try {
                    await callFix('bluetooth', action);
                    showFixResult(`Bluetooth fix '${action}' completed.`);
                    setTimeout(() => renderFullFixPage(showWarning), 2000);
                } catch (err) {
                    showFixResult(`Bluetooth fix failed: ${err.message}`, true);
                }
            });
        });

        // Mobile Data
        document.querySelectorAll('.fix-mobile').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;
                try {
                    await callFix('mobile', action);
                    showFixResult(`Mobile data fix '${action}' completed.`);
                    setTimeout(() => renderFullFixPage(showWarning), 2000);
                } catch (err) {
                    showFixResult(`Mobile data fix failed: ${err.message}`, true);
                }
            });
        });

        // Advanced
        document.querySelectorAll('.fix-advanced').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;
                try {
                    await callFix('network', action);
                    showFixResult(`Advanced fix '${action}' completed.`);
                    setTimeout(() => renderFullFixPage(showWarning), 2000);
                } catch (err) {
                    showFixResult(`Advanced fix failed: ${err.message}`, true);
                }
            });
        });

    } catch (err) {
        document.getElementById('pageContent').innerHTML = `<div class="card">Error loading troubleshoot page: ${err.message}</div>`;
    }
}


async function runConnectionTest(testId) {
    const resultDiv = document.getElementById('testResult');
    const fixContainer = document.getElementById('fixButtonsContainer');
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `<p>🔄 Testing ${testId}...</p>`;
    fixContainer.style.display = 'none';

    // Before testing, ensure proper radio state
    if (testId === 'wifi') {
        // Turn on WiFi, turn off mobile data
        await runAdb('svc wifi enable');
        await runAdb('svc data disable');
        await new Promise(r => setTimeout(r, 1500));
    } else if (testId === 'mobile') {
        // Turn on mobile data, turn off WiFi
        await runAdb('svc data enable');
        await runAdb('svc wifi disable');
        await new Promise(r => setTimeout(r, 1500));
    } else if (testId === 'bluetooth') {
        // Ensure Bluetooth is on
        await runAdb('svc bluetooth enable');
        await new Promise(r => setTimeout(r, 1000));
    }

    // Call the diagnostic endpoint
    const endpoint = `/connectivity/diagnose/${testId}/${currentDeviceId}`;
    try {
        const resp = await fetch(`${BACKEND_URL}${endpoint}`);
        const data = await resp.json();
        const pass = data.ok === true;
        const icon = pass ? '✅' : '❌';
        const color = pass ? '#2e7d32' : '#d32f2f';
        let msg = pass ? data.message : (data.error || 'Failed');
        // Show extra details for BT and mobile
        if (testId === 'bluetooth' && pass) {
            msg += ` | Paired: ${data.pairedCount || 0} | OPP: ${data.oppSupported ? '✅' : '❌'}`;
        }
        if (testId === 'mobile' && data.signalStrength) {
            msg += ` | Signal: ${data.signalStrength}`;
        }
        resultDiv.innerHTML = `<div style="background: ${pass ? '#e8f5e9' : '#ffebee'}; padding: 12px; border-radius: 8px; color: ${color};">${icon} ${msg}</div>`;

        // Show fix buttons if test failed
        if (!pass) {
            fixContainer.style.display = 'block';
            fixContainer.innerHTML = `
                <div class="info-card">
                    <div class="card-header">🛠️ Fix Options</div>
                    <div class="card-actions" style="display:flex; flex-wrap:wrap; gap:8px; padding:8px 16px 12px;">
                        <button class="btn-primary fix-btn" data-action="${testId}_reset">🔄 Reset ${testId}</button>
                        ${testId === 'wifi' ? `<button class="btn-secondary fix-btn" data-action="wifi_scan">📡 Scan</button>` : ''}
                        ${testId === 'bluetooth' ? `<button class="btn-secondary fix-btn" data-action="bluetooth_force_stop">⏹️ Force Stop</button>` : ''}
                        ${testId === 'bluetooth' ? `<button class="btn-secondary fix-btn" data-action="bluetooth_clear_cache">🧹 Clear Cache</button>` : ''}
                        ${testId === 'mobile' ? `<button class="btn-secondary fix-btn" data-action="set_lte">📶 Force LTE</button>` : ''}
                    </div>
                </div>
            `;
            document.querySelectorAll('.fix-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const action = btn.dataset.action;
                    try {
                        const fixResp = await fetch(`${BACKEND_URL}/android-connectivity/fix/${currentDeviceId}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action })
                        });
                        const fixData = await fixResp.json();
                        alert(fixData.message || 'Fix applied');
                        // Re-run the test
                        await runConnectionTest(testId);
                    } catch (err) {
                        alert('Fix failed: ' + err.message);
                    }
                });
            });
        } else {
            fixContainer.style.display = 'none';
        }
    } catch (err) {
        resultDiv.innerHTML = `<div style="background: #ffebee; padding: 12px; border-radius: 8px; color: #d32f2f;">❌ Error: ${err.message}</div>`;
    }
}

// Helper: wait for user confirmation with a custom modal
function waitForUserConfirmationWithMessage(title, message, timeoutMs = 30000) {
    return new Promise((resolve) => {
        // Create a modal if not exists
        let modal = document.getElementById('userConfirmModal');
        if (!modal) {
            const modalHtml = `
                <div id="userConfirmModal" class="modal" style="display: none;">
                    <div class="modal-content" style="max-width: 500px;">
                        <div class="modal-header">
                            <h3 id="confirmModalTitle">Confirm</h3>
                            <span class="close-button" id="closeConfirmModal">&times;</span>
                        </div>
                        <div class="modal-body" id="confirmModalBody" style="white-space: pre-wrap;"></div>
                        <div class="modal-footer">
                            <button id="confirmYesBtn" class="btn-primary">✅ Yes</button>
                            <button id="confirmNoBtn" class="btn-secondary">❌ No</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modal = document.getElementById('userConfirmModal');
            document.getElementById('closeConfirmModal').addEventListener('click', () => modal.style.display = 'none');
            window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
        }

        document.getElementById('confirmModalTitle').textContent = title;
        document.getElementById('confirmModalBody').textContent = message;
        modal.style.display = 'flex';

        const yesBtn = document.getElementById('confirmYesBtn');
        const noBtn = document.getElementById('confirmNoBtn');
        let resolved = false;

        const cleanup = () => {
            if (resolved) return;
            resolved = true;
            yesBtn.removeEventListener('click', onYes);
            noBtn.removeEventListener('click', onNo);
            modal.style.display = 'none';
        };

        const onYes = () => { cleanup(); resolve('yes'); };
        const onNo = () => { cleanup(); resolve('no'); };

        yesBtn.addEventListener('click', onYes);
        noBtn.addEventListener('click', onNo);

        // Auto timeout
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                cleanup();
                resolve('timeout');
            }
        }, timeoutMs);
    });
}

// ==================== BSOD DIAGNOSIS ====================
// ==================== BSOD DIAGNOSIS (ENHANCED) ====================
// ==================== BSOD DIAGNOSIS (ENHANCED) ====================
// ==================== BSOD DIAGNOSIS (ENHANCED) ====================
// ==================== BSOD DIAGNOSIS ====================
// ==================== BSOD DIAGNOSIS (WITH WARNING MODAL) ====================
// ==================== BSOD DIAGNOSIS (WITH WARNING MODAL) ====================
// ==================== BSOD DIAGNOSIS (WITH WARNING MODAL) ====================
// ==================== BSOD DIAGNOSIS (WITH WARNING MODAL & NAVIGATION) ====================

// ---- Actual BSOD page rendering (separate) ----


function getRecommendation(cause) {
    if (cause.includes("corruption") || cause.includes("crash")) return "📱 Consider re-flashing the stock firmware. Back up your data if possible. If the issue persists, it may point to a hardware problem with the storage chip.";
    else if (cause.includes("instability")) return "🔧 Boot into Safe Mode (if possible) and uninstall recently added apps. Check for system updates or perform a factory reset as a last resort.";
    return "✅ Your phone shows no clear signs of OS corruption. If the screen remains black, the issue is likely hardware-related (display cable, motherboard, or power).";
}

// ==================== USB DEBUGGING WIZARD ====================
const modalEl = document.getElementById('wizardModal');
const closeModalBtn = document.querySelector('.close-button');
const prevBtn = document.getElementById('wizardPrevBtn');
const nextBtn = document.getElementById('wizardNextBtn');
const cancelBtn = document.getElementById('wizardCancelBtn');

function openWizard() {
    wizardStep = 0;
    modalEl.style.display = 'flex';
    updateWizardUI();
}

function updateWizardUI() {
    const body = document.getElementById('wizardBody');
    const steps = [
        { title: 'Enable Developer Options', content: 'Go to Settings → About Phone → Tap "Build Number" 7 times.' },
        { title: 'Turn on USB Debugging', content: 'Go to Settings → Developer Options → Enable USB Debugging.' },
        { title: 'Connect via USB', content: 'Plug your phone into the PC. Accept the RSA key fingerprint on the phone.' },
        { title: 'Verify Connection', content: 'Click "Test Connection" below.' }
    ];
    body.innerHTML = `<div class="progress-step">Step ${wizardStep+1} of ${steps.length}</div><h4>${steps[wizardStep].title}</h4><p>${steps[wizardStep].content}</p>${wizardStep === 3 ? '<button id="testConnBtn" class="btn-primary">Test Connection</button><div id="connResult"></div>' : ''}`;
    prevBtn.disabled = wizardStep === 0;
    if (wizardStep === 3) {
        document.getElementById('testConnBtn')?.addEventListener('click', async () => {
            try {
                const result = await apiCall('/devices');
                const div = document.getElementById('connResult');
                if (result.devices && result.devices.length) {
                    div.innerHTML = '<span style="color:green;">✅ Device found! You can close this wizard.</span>';
                    nextBtn.disabled = false;
                } else {
                    div.innerHTML = '<span style="color:red;">❌ No device. Re-check USB debugging and cable.</span>';
                }
            } catch (err) {
                document.getElementById('connResult').innerHTML = '<span style="color:red;">❌ ADB error. Is ADB installed?</span>';
            }
        });
    } else {
        nextBtn.disabled = false;
    }
}

nextBtn.onclick = () => { if (wizardStep < 3) { wizardStep++; updateWizardUI(); } else { modalEl.style.display = 'none'; } };
prevBtn.onclick = () => { if (wizardStep > 0) { wizardStep--; updateWizardUI(); } };
cancelBtn.onclick = () => modalEl.style.display = 'none';
if (closeModalBtn) closeModalBtn.onclick = () => modalEl.style.display = 'none';

// ==================== NAVIGATION ====================
function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            const page = item.dataset.page;

            // ---- Clear any pending device info timer ----
            if (deviceInfoTimer) {
                clearTimeout(deviceInfoTimer);
                deviceInfoTimer = null;
                lastDeviceInfoData = null;
            }

            // ---- ADB Required Check ----
            const adbRequiredPages = [
                'device-info',
                'hardware-tests',
                'connection-troubleshoot',
                'ai-conclusion',
                'advanced'
            ];
            if (adbRequiredPages.includes(page) && !currentDeviceId) {
                showAdbRequiredModal();
                return;
            }

            // ---- Normal navigation ----
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            showLoading();
            try {
                await new Promise(r => setTimeout(r, 50));

                // Clean up intervals
                if (window._bsodCleanup) window._bsodCleanup();
                if (window._crashAnalysisCleanup) window._crashAnalysisCleanup();

                // ---- Render pages ----
                if (page === 'dashboard') await renderDashboard();

                else if (page === 'home') {
                    if (typeof window.renderHome === 'function') {
                        window.renderHome();
                    } else {
                        try {
                            const module = await import('./home.js');
                            if (module.renderHome) {
                                window.renderHome = module.renderHome;
                                module.renderHome();
                            } else {
                                throw new Error('renderHome not exported');
                            }
                        } catch (err) {
                            document.getElementById('pageContent').innerHTML = `
                                <div class="card" style="padding:40px;text-align:center;">
                                    <p>Could not load Home page: ${err.message}</p>
                                </div>
                            `;
                        }
                    }
                }

                else if (page === 'search') {
                    try {
                        const module = await import('./search.js');
                        module.renderSearch();
                    } catch (err) {
                        document.getElementById('pageContent').innerHTML = `
                            <div class="card" style="padding:40px;text-align:center;">
                                <p>Could not load Search page: ${err.message}</p>
                            </div>
                        `;
                    }
                }

                else if (page === 'notifications') {
                    try {
                        const module = await import('./alerts.js');
                        module.renderAlerts();
                    } catch (err) {
                        document.getElementById('pageContent').innerHTML = `
                            <div class="card" style="padding:40px;text-align:center;">
                                <p>Could not load Notifications: ${err.message}</p>
                            </div>
                        `;
                    }
                }

                else if (page === 'social-profile') {
                    try {
                        const module = await import('./profile.js');
                        module.renderProfile();
                    } catch (err) {
                        document.getElementById('pageContent').innerHTML = `
                            <div class="card" style="padding:40px;text-align:center;">
                                <p>Could not load Social Profile: ${err.message}</p>
                            </div>
                        `;
                    }
                }

                else if (page === 'profile') {
                    // Old profile – keep for compatibility
                    if (typeof renderProfilePage === 'function') {
                        renderProfilePage();
                    } else {
                        document.getElementById('pageContent').innerHTML = `
                            <div class="card" style="padding:40px;text-align:center;">
                                <p>Profile page not available.</p>
                            </div>
                        `;
                    }
                }

                else if (page === 'device-info') await renderDeviceInfo();
                else if (page === 'hardware-tests') await renderHardwareTests();
                else if (page === 'connection-troubleshoot') await renderConnectionTroubleshoot();
                else if (page === 'ai-conclusion') await renderAIConclusion();
                else if (page === 'repairs') await renderRepairs();
                else if (page === 'bsod') await renderBsodDiagnosis();
                else if (page === 'advanced') await renderAdvancedDiagnostic();

                else if (page === 'repair-shorts') {
                    if (typeof window.renderRepairShorts === 'function') {
                        window.renderRepairShorts();
                    } else {
                        try {
                            const module = await import('./repairShorts.js');
                            if (module.renderRepairShorts) {
                                window.renderRepairShorts = module.renderRepairShorts;
                                module.renderRepairShorts();
                            }
                        } catch (err) {
                            document.getElementById('pageContent').innerHTML = `
                                <div class="card" style="padding:40px;text-align:center;">
                                    <p>Could not load Repair Shorts: ${err.message}</p>
                                </div>
                            `;
                        }
                    }
                }

                else if (page === 'settings') await renderSettings();

                else await renderDashboard();

                // ---- Re-apply theme ----
                if (window._activeTheme) {
                    applyTheme(window._activeTheme);
                }

            } catch (err) {
                console.error('Page render error:', err);
            } finally {
                await new Promise(r => setTimeout(r, 300));
                hideLoading();
            }
        });
    });
}

// ---- Show ADB Required modal ----
// ---- Show ADB Required modal ----
function showAdbRequiredModal() {
    const modal = document.getElementById('adbRequiredModal');
    if (!modal) {
        // Fallback alert if modal not found
        alert('USB Debugging (ADB) is required for this feature. Please enable it in Developer Options.');
        return;
    }
    modal.style.display = 'flex';
    const closeModal = () => { modal.style.display = 'none'; };
    const closeBtn = document.getElementById('adbRequiredClose');
    const okBtn = document.getElementById('adbRequiredOkBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeModal, { once: true });
    if (okBtn) okBtn.addEventListener('click', closeModal, { once: true });
    const watchBtn = document.getElementById('adbRequiredWatchBtn');
    if (watchBtn) {
        watchBtn.addEventListener('click', () => {
            window.open('https://www.youtube.com/watch?v=6KbKqQVJXcQ', '_blank');
        }, { once: true });
    }
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    }, { once: true });
}

function openTutorial() {
    window.open('https://www.youtube.com/watch?v=6KbKqQVJXcQ', '_blank');
}

// ==================== INIT ====================
(async () => {
    try {
        showLoading();

        initNavigation();
        await updateConnectionStatus();

        // ---- Smart connection status updater (no spam) ----
        function scheduleNextConnectionUpdate() {
            if (_connectionUpdateTimer) clearTimeout(_connectionUpdateTimer);
            _connectionUpdateTimer = setTimeout(() => {
                updateConnectionStatus();
            }, 10000);
        }

        // ---- Debounced focus handler ----
        let focusTimer = null;
        window.addEventListener('focus', () => {
            if (focusTimer) clearTimeout(focusTimer);
            focusTimer = setTimeout(() => {
                updateConnectionStatus(true);
            }, 300);
        });

        // Start the update loop
        scheduleNextConnectionUpdate();

        // Ensure the dashboard nav item is active on startup
        const defaultNav = document.querySelector('.nav-item[data-page="dashboard"]');
        if (defaultNav) {
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            defaultNav.classList.add('active');
        }

        await renderDashboard();
        hideLoading();
    } catch (err) {
        console.error('[Init] Error:', err);
        hideLoading();
    }
})();
