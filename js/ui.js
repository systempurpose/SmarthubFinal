// ==================== GLOBALS ====================
let currentDeviceId = null;
let wizardStep = 0;
let lastUsbState = null; // Track last USB state for dashboard re-render
// ---- Persistent test results ----
window._hardwareTestResults = {};   // { testId: { status, message, passed } }
window._connectionTestResults = {}; // { testId: { status, message, passed } }

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
    const accent = settings.themeColor || '#0d6efd';
    const bg = settings.bgColor || '#ffffff';
    const cardBg = settings.cardColor || '#ffffff';
    const text = settings.textColor || '#1f2937';

    // Store the settings for later use
    window._activeTheme = settings;

    // Set CSS custom properties
    document.documentElement.style.setProperty('--primary-color', accent);
    document.documentElement.style.setProperty('--primary-color-dark', adjustColor(accent, -20));
    document.documentElement.style.setProperty('--bg-color', bg);
    document.documentElement.style.setProperty('--card-color', cardBg);
    document.documentElement.style.setProperty('--text-color', text);

    // ---- Body & Main Content ----
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

    // ---- Sidebar ----
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.style.color = text;
        // Keep sidebar background dark (or you can make it customizable too)
        // sidebar.style.backgroundColor = '#1e293b';
        
        // Update sidebar links and text
        sidebar.querySelectorAll('a, span, div, .nav-item, .sidebar-footer, .connection-status, .auth-email, .auth-role').forEach(el => {
            if (!el.style.color) {
                el.style.color = text;
            }
        });
        
        // Also update the sidebar header
        const header = sidebar.querySelector('.sidebar-header h2');
        if (header) header.style.color = text;
    }

    // ---- Cards & Panels ----
    document.querySelectorAll('.card, .info-card, .status-card, .test-card, .action-card, .metric, .health-card, .summary-card, .overview-item').forEach(el => {
        // Only override if they don't have explicit background set inline
        if (!el.style.backgroundColor) {
            el.style.backgroundColor = cardBg;
        }
        if (!el.style.color) {
            el.style.color = text;
        }
        // Also update child text elements
        el.querySelectorAll('div, span, p, h1, h2, h3, h4, h5, h6, label, strong, .item-label, .item-value').forEach(child => {
            if (!child.style.color) {
                child.style.color = text;
            }
        });
    });

    // ---- Modals ----
    document.querySelectorAll('.modal .modal-content, .modal .modal-body, .modal .modal-header, .modal .modal-footer').forEach(el => {
        el.style.backgroundColor = cardBg;
        el.style.color = text;
        el.querySelectorAll('h3, p, span, label, div').forEach(child => {
            if (!child.style.color) {
                child.style.color = text;
            }
        });
    });

    // ---- Buttons (accent) ----
    document.querySelectorAll('.btn-primary, button.primary, .auth-login-btn, #saveSettingsBtn, .auth-login-btn').forEach(btn => {
        btn.style.background = accent;
        btn.style.borderColor = accent;
        btn.style.color = '#ffffff';
    });

    // ---- Secondary buttons ----
    document.querySelectorAll('.btn-secondary, #resetSettingsBtn, .btn-secondary button').forEach(btn => {
        if (!btn.style.background) {
            btn.style.borderColor = text + '30';
            btn.style.color = text;
        }
    });

    console.log('[Theme] Applied:', { accent, bg, cardBg, text });
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
function showAlert(title, message) {
    return new Promise((resolve) => {
        let modal = document.getElementById('alertModal');
        if (!modal) {
            const modalHtml = `
                <div id="alertModal" class="modal" style="display: none; z-index: 99999;">
                    <div class="modal-content" style="max-width: 420px; width: 90%; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                        <div class="modal-header" style="padding: 16px 24px; border-bottom: 1px solid #e5e7eb; background: #f8fafc; display: flex; justify-content: space-between; align-items: center;">
                            <h3 id="alertModalTitle" style="margin: 0; font-size: 17px; font-weight: 600; color: #1f2937; display: flex; align-items: center; gap: 8px;">
                                <span id="alertModalIcon" style="font-size: 20px;">${title.includes('Success') ? '✅' : '⚠️'}</span>
                                <span>${title}</span>
                            </h3>
                            <span class="close-button" id="alertModalClose" style="cursor: pointer; font-size: 24px; color: #9ca3af; line-height: 1; padding: 0 4px;">&times;</span>
                        </div>
                        <div class="modal-body" style="padding: 20px 24px; background: #ffffff;">
                            <p id="alertModalMessage" style="margin: 0; font-size: 15px; line-height: 1.6; color: #374151; white-space: pre-wrap; word-break: break-all;">${message}</p>
                        </div>
                        <div class="modal-footer" style="padding: 12px 24px; background: #f8fafc; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end;">
                            <button id="alertModalOkBtn" class="btn-primary" style="padding: 8px 24px; border-radius: 8px; font-weight: 500; font-size: 14px; cursor: pointer; background: #0d6efd; border: none; color: white;">OK</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modal = document.getElementById('alertModal');
        }
        // Update icon based on title
        const icon = document.getElementById('alertModalIcon');
        if (icon) {
            icon.textContent = title.toLowerCase().includes('success') ? '✅' : title.toLowerCase().includes('error') ? '❌' : '⚠️';
        }
        document.getElementById('alertModalTitle').textContent = title;
        document.getElementById('alertModalMessage').textContent = message;
        modal.style.display = 'flex';
        const closeModal = () => {
            modal.style.display = 'none';
            resolve();
        };
        const okBtn = document.getElementById('alertModalOkBtn');
        const closeBtn = document.getElementById('alertModalClose');
        const newOk = okBtn.cloneNode(true);
        const newClose = closeBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOk, okBtn);
        closeBtn.parentNode.replaceChild(newClose, closeBtn);
        newOk.addEventListener('click', closeModal);
        newClose.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        }, { once: true });
    });
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

// ==================== UPDATE DEVICE INFO & STATUS BAR ====================
async function updateDeviceInfo() {
    try {
        console.log('[DeviceInfo] Fetching device data...');
        const res = await fetch(`${BACKEND_URL}/device/${currentDeviceId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let rawText = await res.text();
        try {
            const parsedJson = JSON.parse(rawText);
            if (typeof parsedJson === 'string') rawText = parsedJson;
        } catch (e) {}
        const lines = rawText.split(/\r?\n/);
        const props = {};
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const match = trimmed.match(/^\[(.*?)\]:\s*\[(.*?)\]$/);
            if (match) props[match[1]] = match[2];
        }

        const manufacturer = props['ro.product.manufacturer'] || 'Unknown';
        const model = props['ro.product.model'] || 'Device';
        const androidVersion = props['ro.build.version.release'] || '';
        const width = props['sys.logical.width'] || '';
        const height = props['sys.logical.height'] || '';
        const resolution = (width && height) ? `${width} x ${height}` : '';

        // ---- Brand Logo Mapping ----
        const brandKey = manufacturer.toLowerCase().trim();
        const color = getBrandColor(brandKey) || '#6B7280';

        // Map manufacturer to logo filename (exact filenames from android_logo folder)
        const brandLogoMap = {
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

        // Update the brand icon container
        const brandEl = document.getElementById('brand-icon');
        if (brandEl) {
            const logoFile = brandLogoMap[brandKey];
            if (logoFile) {
                // Build the image tag with a fallback to text on error
                const imgSrc = `/android_logo/${logoFile}`;
                brandEl.innerHTML = `
                    <img src="${imgSrc}" alt="${manufacturer}" style="height: 48px; width: auto; max-width: 120px; object-fit: contain;"
                         onerror="this.onerror=null; this.parentElement.innerHTML='<span style=\\'font-size: 28px; font-weight: 700; color: ${color}; letter-spacing: 1px;\\'>${manufacturer}</span>'">
                `;
                // Also set a timeout fallback in case the image loads very slowly or fails silently
                const img = brandEl.querySelector('img');
                if (img) {
                    setTimeout(() => {
                        if (img && !img.complete) {
                            const parent = img.parentElement;
                            if (parent) {
                                parent.innerHTML = `<span style="font-size: 28px; font-weight: 700; color: ${color}; letter-spacing: 1px;">${manufacturer}</span>`;
                            }
                        }
                    }, 3000);
                }
                console.log('[DeviceInfo] Using logo:', imgSrc);
            } else {
                // No logo file: show text logo
                brandEl.innerHTML = `<span style="font-size: 28px; font-weight: 700; color: ${color}; letter-spacing: 1px;">${manufacturer}</span>`;
                console.log('[DeviceInfo] No logo found, using text');
            }
        } else {
            console.warn('[DeviceInfo] brand-icon element not found');
        }

        // ---- Update other device details ----
        const modelEl = document.getElementById('device-model');
        if (modelEl) modelEl.textContent = model;
        const brandLabel = document.getElementById('device-brand');
        if (brandLabel) brandLabel.textContent = manufacturer;
        const androidEl = document.getElementById('device-android');
        if (androidEl) androidEl.textContent = `Android ${androidVersion}`;
        const resEl = document.getElementById('device-resolution');
        if (resEl) resEl.textContent = resolution;

        // Update the status bar
        await updateStatusBar();
    } catch (err) {
        console.warn('[DeviceInfo] Failed:', err);
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
    try {
        return await apiCall('/devices');
    } catch (err) {
        console.warn('[fetchDevices] /api/devices failed, retrying direct /api/devices fetch', err);
        try {
            const res = await fetchWithTimeout(`${BACKEND_URL}/api/devices`, { headers: { 'Content-Type': 'application/json' } }, 6000);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (err2) {
            console.warn('[fetchDevices] direct /api/devices failed, trying /devices fallback', err2);
            try {
                const res2 = await fetchWithTimeout(`${BACKEND_URL}/devices`, { headers: { 'Content-Type': 'application/json' } }, 6000);
                if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
                return await res2.json();
            } catch (err3) {
                console.error('[fetchDevices] /devices fallback failed', err3);
                throw err3;
            }
        }
    }
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

async function updateConnectionStatus() {
    console.log('[updateConnectionStatus] called');
    const statusSpan = document.querySelector('#connectionStatus span');
    if (!statusSpan) {
        console.warn('[updateConnectionStatus] #connectionStatus span not found');
        return;
    }
    statusSpan.innerText = 'Checking…';
    statusSpan.style.color = '#6B7280';
    const previousDeviceId = currentDeviceId;
    let foundDevice = false;
    let usbStateChanged = false;

    // 1. Try ADB
    try {
        console.log('[updateConnectionStatus] fetching devices via ADB');
        const data = await fetchDevices();
        const devices = Array.isArray(data.devices) ? data.devices : Array.isArray(data) ? data : [];
        if (devices.length) {
            const firstDevice = typeof devices[0] === 'string' ? devices[0] : (devices[0].id || devices[0].serial || devices[0].device || String(devices[0]));
            currentDeviceId = firstDevice;
            console.log('[updateConnectionStatus] ADB device found:', currentDeviceId);
            statusSpan.innerText = `ADB: ${currentDeviceId}`;
            statusSpan.style.color = '#107c10';
            foundDevice = true;
            // Clear USB state when ADB is found
            if (lastUsbState !== null) {
                lastUsbState = null;
                usbStateChanged = true;
            }
            try {
                await updateDeviceInfo();
            } catch (deviceInfoErr) {
                console.warn('[updateConnectionStatus] updateDeviceInfo failed', deviceInfoErr);
            }
        } else {
            // No ADB device – clear currentDeviceId
            if (currentDeviceId !== null) {
                currentDeviceId = null;
            }
        }
    } catch (err) {
        console.warn('[updateConnectionStatus] ADB fetch failed:', err);
        currentDeviceId = null;
    }

    // 2. If no ADB device, try USB state detection
    if (!foundDevice) {
        try {
            console.log('[updateConnectionStatus] checking USB state via /api/device-state');
            const resp = await fetch(`${BACKEND_URL}/api/device-state`);
            if (resp.ok) {
                const stateData = await resp.json();
                const state = stateData.state;
                const details = stateData.details || '';
                // Map state to display label
                const stateLabels = {
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
                    'generic_usb_detected': { label: 'USB Detected (unclassified)', color: '#6B7280' },
                    'no_response': { label: 'No Device', color: '#6B7280' }
                };
                const info = stateLabels[state] || { label: state || 'Unknown', color: '#6B7280' };
                // Truncate details
                const shortDetails = details && details.length > 40 ? details.substring(0, 40) + '…' : details;
                const displayText = shortDetails ? `${info.label} – ${shortDetails}` : info.label;
                statusSpan.innerText = displayText;
                statusSpan.style.color = info.color;
                // Track state change for dashboard re-render
                if (lastUsbState !== state) {
                    lastUsbState = state;
                    usbStateChanged = true;
                }
                // Clear currentDeviceId since ADB not available
                if (currentDeviceId !== null) {
                    currentDeviceId = null;
                }
                console.log('[updateConnectionStatus] USB state:', state, displayText);
                foundDevice = true;
            } else {
                console.warn('[updateConnectionStatus] /api/device-state returned non-OK');
                // No USB state – ensure lastUsbState is null
                if (lastUsbState !== null) {
                    lastUsbState = null;
                    usbStateChanged = true;
                }
            }
        } catch (err) {
            console.warn('[updateConnectionStatus] USB state fetch failed:', err);
            // No USB state – ensure lastUsbState is null
            if (lastUsbState !== null) {
                lastUsbState = null;
                usbStateChanged = true;
            }
        }
    }

    // 3. If nothing found at all
    if (!foundDevice) {
        // Ensure USB state is cleared
        if (lastUsbState !== null) {
            lastUsbState = null;
            usbStateChanged = true;
        }
        if (currentDeviceId !== null) {
            currentDeviceId = null;
        }
        statusSpan.innerText = 'No device found';
        statusSpan.style.color = '#d83b01';
    }

    // 4. Re-render dashboard if needed
    const activePage = document.querySelector('.nav-item.active')?.dataset.page;
    if (activePage === 'dashboard' && (currentDeviceId !== previousDeviceId || usbStateChanged)) {
        console.log('[updateConnectionStatus] re-rendering dashboard (ADB changed or USB state changed)');
        await renderDashboard();
    }
    // Update visibility of device sections
    toggleDeviceSections(!!currentDeviceId);
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

// ===== LOAD SAVED SCAN RESULTS (async, Supabase first) =====
async function loadSavedScanResults() {
    try {
        // Dynamically import Supabase helpers (since ui.js is not a module)
        const { getCurrentUserId, getCurrentDeviceId } = await import('./sb-utils.js');
        const { fetchLatestAppScan, fetchLatestStorageScan } = await import('./sb-loader.js');

        const userId = getCurrentUserId();
        const deviceId = getCurrentDeviceId() || window.currentDeviceId;

        // ---- App Scan ----
        let appResults = null;
        if (userId && deviceId) {
            try {
                appResults = await fetchLatestAppScan(userId, deviceId);
                console.log('[loadSavedScanResults] App scan loaded from Supabase');
            } catch (e) {
                console.warn('[loadSavedScanResults] Supabase app scan fetch failed:', e);
            }
        }
        if (!appResults) {
            appResults = loadAppScanResults(); // localStorage fallback
        }
        if (appResults) {
            renderAppScanResults(appResults);
        }

        // ---- Storage Scan ----
        let storageResults = null;
        if (userId && deviceId) {
            try {
                storageResults = await fetchLatestStorageScan(userId, deviceId);
                console.log('[loadSavedScanResults] Storage scan loaded from Supabase');
            } catch (e) {
                console.warn('[loadSavedScanResults] Supabase storage scan fetch failed:', e);
            }
        }
        if (!storageResults) {
            storageResults = loadStorageResults();
        }
        if (storageResults) {
            renderStorageResults(storageResults);
        }

        // ---- Local‑only scans ----
        const hardwareResults = loadHardwareResults();
        if (hardwareResults) renderHardwareResults(hardwareResults);

        const connectionResults = loadConnectionResults();
        if (connectionResults) renderConnectionResults(connectionResults);

        const advancedResults = loadAdvancedResults();
        if (advancedResults) renderAdvancedResults(advancedResults);

    } catch (err) {
        console.warn('[loadSavedScanResults] Failed to load from Supabase, using localStorage only:', err);
        // Fallback: just load from localStorage
        const appResults = loadAppScanResults();
        if (appResults) renderAppScanResults(appResults);
        const storageResults = loadStorageResults();
        if (storageResults) renderStorageResults(storageResults);
        const hardwareResults = loadHardwareResults();
        if (hardwareResults) renderHardwareResults(hardwareResults);
        const connectionResults = loadConnectionResults();
        if (connectionResults) renderConnectionResults(connectionResults);
        const advancedResults = loadAdvancedResults();
        if (advancedResults) renderAdvancedResults(advancedResults);
    }
}

// ---- Expose globally so other modules can trigger a reload ----
window.loadSavedScanResults = loadSavedScanResults;

function clearScanResults(type) {
    if (type === 'app') {
        localStorage.removeItem('smartHubAppScanResults');
        document.getElementById('appScanResults').style.display = 'none';
        document.getElementById('appScanResults').innerHTML = '';
    } else if (type === 'storage') {
        localStorage.removeItem('smartHubStorageResults');
        document.getElementById('storageResults').style.display = 'none';
        document.getElementById('storageResults').innerHTML = '';
    }
}

// ===== RENDER SCAN RESULTS ON DASHBOARD =====

function renderAppScanResults(results) {
    const container = document.getElementById('appScanResults');
    if (!container) return;

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
                <span><i class="fas fa-shield-halved"></i> App Security Scan</span>
                <div style="display: flex; align-items: center; gap: 12px; font-size: 13px; flex-wrap: wrap;">
                    ${total > 0 ? `<span style="color: #dc2626;">⚠️ ${total} suspicious app(s)</span>` : '<span style="color: #16a34a;">✅ All clear</span>'}
                    <span style="color: #6b7280; font-size: 12px;">${results.scanTime || ''}</span>
                    <button onclick="clearScanResults('app')" style="background: none; border: none; color: #9ca3af; cursor: pointer; font-size: 14px;">✕</button>
                </div>
            </div>
            <div class="card-content">
                <!-- Summary bar -->
                <div style="display: flex; gap: 16px; padding: 8px 0; flex-wrap: wrap;">
                    ${critical > 0 ? `<span><span style="color: #c62828; font-weight: bold;">🔴 ${critical}</span> Critical</span>` : ''}
                    ${high > 0 ? `<span><span style="color: #e65100; font-weight: bold;">🟠 ${high}</span> High</span>` : ''}
                    ${medium > 0 ? `<span><span style="color: #e67e22; font-weight: bold;">🟡 ${medium}</span> Medium</span>` : ''}
                    ${low > 0 ? `<span><span style="color: #2e7d32; font-weight: bold;">🟢 ${low}</span> Low</span>` : ''}
                </div>
                <!-- App list -->
                <div style="max-height: 500px; overflow-y: auto;">
                    ${apps.map(app => {
                        const threat = window.getThreatLevel(app.riskScore);
                        const threatIcon = threat.icon || (app.riskScore >= 80 ? '🔴' : app.riskScore >= 60 ? '🟠' : '🟡');
                        const malwareCapabilities = window.getHumanReadableThreats(app.threatTypes || [], []);
                        const humanReasons = window.getHumanFriendlyRiskReasons(app);

                        let riskFactors = [];
                        if (app.isSideloaded) riskFactors.push('📦 Sideloaded (not from Play Store)');
                        if (app.installer && app.installer.toLowerCase().includes('unknown')) riskFactors.push('❓ Unknown installer');
                        if (app.dangerousPermissions && app.dangerousPermissions.length > 5) riskFactors.push('🔓 Requests many dangerous permissions');
                        if (app.entropy && app.entropy > 0.85) riskFactors.push('🧩 High code entropy (possible obfuscation/packing)');

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
                                        🗑️ Uninstall
                                    </button>
                                </div>

                                ${app.reason ? `<div style="font-size: 13px; color: #555; margin-top: 6px;">${escapeHtml(app.reason)}</div>` : ''}

                                ${humanReasons.length ? `<div style="font-size: 13px; margin-top: 4px; color: #424242; background: rgba(255,255,255,0.5); padding: 6px 10px; border-radius: 6px;">${humanReasons.join('; ')}</div>` : ''}

                                ${malwareCapabilities.length ? `<div style="font-size: 13px; margin-top: 4px; color: #4a148c; background: rgba(255,255,255,0.65); padding: 6px 10px; border-radius: 6px;"><strong>What this malware can do:</strong><ul style="margin: 4px 0 0 18px; padding: 0;">${malwareCapabilities.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : ''}

                                ${riskFactors.length ? `
                                    <div style="margin-top:6px; font-size:13px; color:#555; background:#f8f9fa; padding:6px 10px; border-radius:6px;">
                                        <strong>⚠️ Risk factors:</strong> ${riskFactors.join(' • ')}
                                    </div>
                                ` : ''}

                                ${app.entropy ? `<div style="font-size: 12px; color: #666; margin-top: 8px; background: #f5f5f5; padding: 6px 10px; border-radius: 6px;">Entropy: ${app.entropy.toFixed(3)} ${app.entropy > 0.85 ? '⚠️ (high → possible packing/obfuscation)' : ''}</div>` : ''}

                                <div style="display: flex; gap: 16px; margin-top: 8px; font-size: 12px; color: #666; flex-wrap: wrap;">
                                    ${app.installer ? `<span>📦 Installed via: ${escapeHtml(app.installer)}</span>` : ''}
                                    ${app.installDate ? `<span>📅 Installed: ${escapeHtml(app.installDate)}</span>` : ''}
                                </div>

                                <div style="margin-top: 10px; font-size: 13px; border-top: 1px dashed #ddd; padding-top: 10px;">
                                    <span style="background: ${threat.bg}; color: ${threat.color}; padding: 2px 10px; border-radius: 12px; font-weight: 600; font-size: 12px;">${threat.label}</span>
                                    &nbsp; Risk Score: <strong>${app.riskScore}/100</strong>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            <div style="padding: 8px 16px 12px; font-size: 12px; color: #6b7280; border-top: 1px solid #f1f3f5; display: flex; justify-content: space-between; align-items: center;">
                <span>Last scan: ${results.scanTime || 'N/A'}</span>
                <button onclick="window.runAppScan()" style="background: none; border: 1px solid #d1d5db; border-radius: 12px; padding: 4px 16px; font-size: 11px; cursor: pointer;">🔄 Rescan</button>
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
                    <span><i class="fas fa-hdd"></i> Storage Analysis</span>
                    <span style="color: #6b7280; font-size: 12px;">${results ? results.scanTime : 'N/A'}</span>
                </div>
                <div class="card-content" style="padding: 16px; text-align: center; color: #6b7280;">
                    ✅ No large files (>500 MB) found on your device.
                    ${results ? `<br><small>Last scan: ${results.scanTime}</small>` : ''}
                </div>
            </div>
        `;
        return;
    }

    // --- Existing code for displaying files (keep as is) ---
    const files = results.files;
    const totalSize = files.reduce((sum, f) => sum + (f.bytes || 0), 0);
    const count = files.length;

    // ---- Group files by category ----
    const categories = {
        'DCIM': { label: '📸 Camera (DCIM)', files: [] },
        'Movies': { label: '🎬 Movies', files: [] },
        'Music': { label: '🎵 Music', files: [] },
        'Pictures': { label: '🖼️ Pictures', files: [] },
        'Download': { label: '📥 Downloads', files: [] },
        'Android/obb': { label: '🎮 Game OBB', files: [] },
        'Android/data': { label: '📂 App Data (Games)', files: [] },
        'Documents': { label: '📄 Documents', files: [] },
        'Other': { label: '📦 Other', files: [] }
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

    let html = `
        <div class="card" style="border-left: 4px solid #f59e0b; margin-bottom: 16px;">
            <div class="card-title" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                <span><i class="fas fa-hdd"></i> Storage Analysis</span>
                <div style="display: flex; align-items: center; gap: 12px; font-size: 13px; flex-wrap: wrap;">
                    <span style="color: #f59e0b;">📁 ${count} large files (${formatSize(totalSize)})</span>
                    <span style="color: #6b7280; font-size: 12px;">${results.scanTime || ''}</span>
                    <button onclick="clearScanResults('storage')" style="background: none; border: none; color: #9ca3af; cursor: pointer; font-size: 14px;">✕</button>
                </div>
            </div>
            <div class="card-content">
                <!-- Storage summary -->
                <div style="margin-bottom: 12px; padding: 12px; background: #f8fafc; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; font-size: 14px;">
                        <span><strong>💾 Storage</strong> ${results.storageUsed || '?'} / ${results.storageTotal || '?'}</span>
                        <span style="color: ${(results.percentUsed || 0) > 90 ? '#dc2626' : '#22c55e'};">${(results.percentUsed || 0).toFixed(1)}% used</span>
                    </div>
                    <div style="margin-top: 4px; background: #e5e7eb; border-radius: 8px; height: 6px; overflow: hidden;">
                        <div style="width: ${Math.min(results.percentUsed || 0, 100)}%; background: ${(results.percentUsed || 0) > 90 ? '#dc2626' : '#22c55e'}; height: 100%; border-radius: 8px;"></div>
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
                    <span><strong>${cat.label}</strong> (${cat.files.length} files)</span>
                    <span style="color: #6b7280; font-size: 13px;">${formatSize(catSize)}</span>
                </div>
                <div style="padding: 6px 12px; display: block; max-height: 300px; overflow-y: auto;">
                    ${cat.files.map(file => {
                        const path = file.path || '';
                        const name = file.name || path || 'Unnamed';
                        const size = file.size || formatSize(file.bytes);
                        const isApp = path.startsWith('package:');
                        const displayPath = isApp ? path.replace('package:', '') : path;
                        const buttonLabel = isApp ? '🗑️ Uninstall' : '🗑️ Delete';
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
                <span>Last scan: ${results.scanTime || 'N/A'}</span>
                <button onclick="window.runStorageAnalysis()" style="background: none; border: 1px solid #d1d5db; border-radius: 12px; padding: 4px 16px; font-size: 11px; cursor: pointer;">🔄 Rescan</button>
            </div>
        </div>
    `;

    container.style.display = 'block';
    container.innerHTML = html;
}

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


// Security Modal – shows malware scan summary
async function showSecurityModal() {
    const modal = ensureInfoModal('securityModal', '🛡️ Security Overview');
    const body = document.getElementById('securityModalBody');
body.innerHTML = getModernSpinnerHTML('Loading security status...');
    modal.style.display = 'flex';
    try {
        const response = await fetch(`${BACKEND_URL}/api/suspicious-apps?deviceId=${currentDeviceId}`);
        const data = await response.json();
        const suspiciousApps = data.suspiciousApps || [];
        let html = `
            <div style="margin-bottom: 16px;">
                <strong>Total Apps:</strong> ${data.totalApps || '?'}<br>
                <strong>Suspicious Apps:</strong> ${suspiciousApps.length}<br>
            </div>
        `;
        if (suspiciousApps.length === 0) {
            html += `<p style="color: #2e7d32;">✅ No suspicious apps found.</p>`;
        } else {
            html += `<ul style="list-style: none; padding-left: 0;">`;
            for (const app of suspiciousApps.slice(0, 10)) {
                html += `
                    <li style="margin-bottom: 12px; padding: 10px; background: #fff3e0; border-radius: 8px;">
                        <strong>${escapeHtml(app.displayName)}</strong> (${escapeHtml(app.packageName)})<br>
                        <span style="font-size: 12px;">Risk: ${app.threatLevel}</span><br>
                        <span style="font-size: 12px;">${escapeHtml(app.reason)}</span>
                    </li>
                `;
            }
            if (suspiciousApps.length > 10) {
                html += `<li>... and ${suspiciousApps.length - 10} more</li>`;
            }
            html += `</ul>`;
        }
        body.innerHTML = html;
    } catch (err) {
        body.innerHTML = `<p style="color: red;">Error: ${err.message}</p>`;
    }
}
// ==================== HUMAN-FRIENDLY THREAT SUMMARIES ====================

function getThreatLevel(riskScore) {
    if (riskScore >= 80) return { level: 'critical', label: '🔥 CRITICAL', color: '#c62828', bg: '#ffebee' };
    if (riskScore >= 60) return { level: 'high', label: '⚠️ HIGH RISK', color: '#e65100', bg: '#fff3e0' };
    if (riskScore >= 35) return { level: 'medium', label: '⚠️ MEDIUM RISK', color: '#e67e22', bg: '#fef9e7' };
    return { level: 'low', label: 'ℹ️ LOW RISK', color: '#2e7d32', bg: '#e8f5e9' };
}

function getHumanReadableThreats(malwareTypes, suspiciousIndicators) {
    const threats = [];
    const typeDescriptions = {
        'spyware': '📷 Accesses your camera, microphone, location, or messages without your knowledge.',
        'ransomware': '💰 Can lock your device or encrypt your files and demand payment.',
        'adware': '📢 Displays aggressive ads and may redirect you to malicious websites.',
        'click_fraud': '🖱️ Simulates taps and clicks to generate fake ad revenue or drive unwanted installs.',
        'banking_trojan': '🏦 Targets banking/financial apps to steal your login credentials.',
        'data stealer': '📁 Extracts your personal files, messages, or photos and sends them to a remote server.',
        'backdoor': '🚪 Allows remote control of your device without your permission.',
        'fake app': '🎭 Pretends to be a legitimate app but may steal your information.',
        'riskware': '⚠️ Legitimate app that can be exploited by malware — review its behavior.',
        'information stealer': '🔐 Collects your passwords, emails, and personal data.',
        'premium dialer': '💸 Can send SMS or make calls to premium numbers, causing unexpected charges.',
        'trojan': '🐴 Disguised as a normal app; performs malicious actions in the background.',
        'generic_risk': '⚠️ Suspicious behavior was detected, but there is not enough evidence to name one malware family.'
    };
    // Handle both array of strings and array of objects with .type
    const types = Array.isArray(malwareTypes) ? malwareTypes.map(t => String(typeof t === 'string' ? t : t.type || '').trim().toLowerCase()) : [];
    for (const type of types) {
        if (type && typeDescriptions[type]) {
            threats.push(typeDescriptions[type]);
        } else if (type) {
            threats.push(`⚠️ Detected as "${type}" — potentially harmful.`);
        }
    }
    if (suspiciousIndicators && suspiciousIndicators.length > 0) {
        const hasObfuscation = suspiciousIndicators.some(i => i.toLowerCase().includes('packed') || i.toLowerCase().includes('polymorphic') || i.toLowerCase().includes('entropy'));
        if (hasObfuscation) threats.push('🕵️ Uses advanced hiding techniques to avoid detection (packed/obfuscated code).');
        const hasManyComponents = suspiciousIndicators.some(i => i.includes('Unusually many'));
        if (hasManyComponents) threats.push('🧩 Has many background services — can run in the background without your knowledge.');
        const hasBroadcastReceiver = suspiciousIndicators.some(i => i.includes('broadcast receivers'));
        if (hasBroadcastReceiver) threats.push('📡 Can automatically start when certain events happen (e.g., boot, network change).');
    }
    if (threats.length === 0) threats.push('📋 No specific threats detected, but the app has suspicious characteristics.');
    return threats;
}

function getHumanFriendlyRiskReasons(app) {
    const reasons = [];
    if (app.isSideloaded) {
        const installer = app.installer || 'Unknown source';
        reasons.push(`📦 Installed from: ${installer} (not from official app store)`);
    }
    if (app.dangerousPermCount > 0) {
        const permLabels = [];
        const perms = app.dangerousPermissions || [];
        const permMap = {
            'CAMERA': '📷 Camera',
            'RECORD_AUDIO': '🎙️ Microphone',
            'READ_CONTACTS': '📇 Contacts',
            'READ_SMS': '📩 SMS messages',
            'SEND_SMS': '📤 SMS sending',
            'ACCESS_FINE_LOCATION': '📍 Location (GPS)',
            'ACCESS_COARSE_LOCATION': '📍 Location (approximate)',
            'READ_CALL_LOG': '📞 Call log',
            'WRITE_CALL_LOG': '✏️ Call log (modify)',
            'CALL_PHONE': '📞 Phone calls',
            'SYSTEM_ALERT_WINDOW': '🖼️ Draw overlays on other apps',
            'BIND_ACCESSIBILITY_SERVICE': '♿ Accessibility (control your screen)',
            'DEVICE_ADMIN': '🔒 Device administration',
            'REQUEST_INSTALL_PACKAGES': '📥 Install other apps',
            'PACKAGE_USAGE_STATS': '📊 See which apps you use',
            'WRITE_SETTINGS': '⚙️ Modify system settings',
            'READ_EXTERNAL_STORAGE': '📂 Read files',
            'WRITE_EXTERNAL_STORAGE': '📂 Write/delete files'
        };
        for (const p of perms) {
            for (const [key, label] of Object.entries(permMap)) {
                if (p.includes(key)) {
                    if (!permLabels.includes(label)) permLabels.push(label);
                }
            }
        }
        if (permLabels.length > 0) {
            reasons.push(`🔓 Can access: ${permLabels.join(', ')}`);
        } else {
            reasons.push(`🔓 Requests ${app.dangerousPermCount} dangerous permission(s)`);
        }
    }
    if (app.riskScore >= 70) reasons.push('🚨 High risk — strongly recommended to uninstall.');
    else if (app.riskScore >= 40) reasons.push('⚠️ Moderate risk — review carefully.');
    return reasons;
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

function sweepThemeColors(root, color, darker) {
    if (!root) return;
    const primaryRe = new RegExp(DEFAULT_PRIMARY, 'gi');
    const darkRe = new RegExp(DEFAULT_PRIMARY_DARK, 'gi');
    root.querySelectorAll('[style]').forEach(el => {
        let style = el.getAttribute('style');
        if (!style) return;
        const lower = style.toLowerCase();
        if (!lower.includes(DEFAULT_PRIMARY) && !lower.includes(DEFAULT_PRIMARY_DARK)) return;
        style = style.replace(primaryRe, color).replace(darkRe, darker);
        el.setAttribute('style', style);
    });
}

function applyThemeColor(color) {
    window._activeThemeColor = color;
    const darker = adjustColor(color, -20);
    document.documentElement.style.setProperty('--primary-color', color);
    document.documentElement.style.setProperty('--primary-color-dark', darker);
    // Also expose an RGB triple for use with rgba() in CSS (hover backgrounds)
    try {
        const rgb = hexToRgb(color);
        if (rgb) document.documentElement.style.setProperty('--primary-color-rgb', `${rgb.r},${rgb.g},${rgb.b}`);
    } catch (e) {
        // ignore
    }
    // Sweep the visible page content plus key chrome regions so inline
    // background colors and gradients update without scanning the whole DOM.
    const container = document.getElementById('pageContent');
    if (container) sweepThemeColors(container, color, darker);

    const header = document.querySelector('header.app-header');
    if (header) sweepThemeColors(header, color, darker);

    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sweepThemeColors(sidebar, color, darker);

    // Update any open modal headers / cards
    document.querySelectorAll('.modal, .modal-header, .card-header').forEach(el => {
        try { sweepThemeColors(el, color, darker); } catch (e) { /* ignore */ }
    });
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

                // Clean up any intervals (e.g., BSOD polling)
                if (window._bsodCleanup) window._bsodCleanup();
                if (window._crashAnalysisCleanup) window._crashAnalysisCleanup();

                // Render the page
                if (page === 'dashboard') await renderDashboard();
                else if (page === 'device-info') await renderDeviceInfo();
                else if (page === 'hardware-tests') await renderHardwareTests();
                else if (page === 'connection-troubleshoot') await renderConnectionTroubleshoot();
                else if (page === 'ai-conclusion') await renderAIConclusion();
                else if (page === 'repairs') await renderRepairs();
                else if (page === 'bsod') await renderBsodDiagnosis();
                else if (page === 'advanced') await renderAdvancedDiagnostic();
                else if (page === 'settings') await renderSettings();
                else await renderDashboard();
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
        // Show loading overlay
        showLoading();

        initNavigation();
        await updateConnectionStatus();
        setInterval(updateConnectionStatus, 5000);

        // Ensure the dashboard nav item is active on startup
        const defaultNav = document.querySelector('.nav-item[data-page="dashboard"]');
        if (defaultNav) {
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            defaultNav.classList.add('active');
        }

        await renderDashboard();

        // Also refresh when the window regains focus, so the app updates automatically.
        window.addEventListener('focus', async () => {
            try {
                await updateConnectionStatus();
                if (document.querySelector('.nav-item.active')?.dataset.page === 'dashboard') {
                    await renderDashboard();
                }
            } catch (err) {
                console.error('[Window focus] refresh failed', err);
            }
        });

        // Hide loading after dashboard is rendered
        hideLoading();
    } catch (err) {
        console.error('[Init] Error:', err);
        // Hide loading even if error occurs
        hideLoading();
    }
})();
