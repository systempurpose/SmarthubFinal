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

    if (!currentDeviceId) {
        container.innerHTML = `
            <div class="card" style="text-align: center; padding: 40px;">
                <i class="fas fa-plug" style="font-size: 48px; color: #d83b01;"></i>
                <h2>No Device Connected</h2>
                <p>Please connect your Android phone via USB and enable USB debugging.</p>
            </div>
        `;
        return;
    }

    if (!window.SmartHub?.advanceDiagnostic) {
        container.innerHTML = `
            <div class="card" style="padding: 20px; background: #ffebee; color: #c62828;">
                ❌ Advanced diagnostic module not loaded. Check script inclusion.
            </div>
        `;
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
            <h1 style="margin-bottom: 6px; font-size: 24px; font-weight: 700; color: #1f2937;">🔍 Advanced Diagnostics</h1>
            <p style="color: #6b7280; font-size: 14px; margin: 0;">A deeper pass across software behavior, installed apps, and rootkit indicators.</p>
        </div>

        <div style="background: white; border-radius: 16px; padding: 28px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid #f1f3f5;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px;">
                <div style="display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: #f8fafc; border-radius: 10px;">
                    <div style="width: 32px; height: 32px; border-radius: 8px; background: #eff6ff; color: #0d6efd; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="fas fa-heart-pulse" style="font-size: 13px;"></i>
                    </div>
                    <div>
                        <div style="font-size: 13px; font-weight: 600; color: #1f2937;">Software Health</div>
                        <div style="font-size: 11px; color: #9ca3af;">26 system checks</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: #f8fafc; border-radius: 10px;">
                    <div style="width: 32px; height: 32px; border-radius: 8px; background: #f0fdf4; color: #16a34a; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="fas fa-magnifying-glass" style="font-size: 13px;"></i>
                    </div>
                    <div>
                        <div style="font-size: 13px; font-weight: 600; color: #1f2937;">Deep App Scan</div>
                        <div style="font-size: 11px; color: #9ca3af;">Installed apps & behavior</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: #f8fafc; border-radius: 10px;">
                    <div style="width: 32px; height: 32px; border-radius: 8px; background: #fef2f2; color: #dc2626; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="fas fa-shield-halved" style="font-size: 13px;"></i>
                    </div>
                    <div>
                        <div style="font-size: 13px; font-weight: 600; color: #1f2937;">Rootkit Check</div>
                        <div style="font-size: 11px; color: #9ca3af;">Kernel & process anomalies</div>
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
                    <i class="fas fa-play"></i> Run Advanced Scan
                </button>
                <div style="font-size: 12px; color: #9ca3af; margin-top: 10px;">Takes a couple of minutes — the phone stays usable during the scan.</div>
            </div>
        </div>

        <div id="advancedDiagContainer" style="margin-top: 20px;"></div>
    `;

    container.innerHTML = pageHtml;

    const runBtn = document.getElementById('runAdvancedDiagBtn');
    const diagContainer = document.getElementById('advancedDiagContainer');

    function ensureScanModal() {
        let modal = document.getElementById('advancedDiagModal');
        if (!modal) {
            const modalHTML = `
                <div id="advancedDiagModal" class="modal" style="display: none; z-index: 99999;">
                    <div class="modal-content" style="max-width: 1100px; width: 95vw; max-height: 85vh; display: flex; flex-direction: column; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3); background: #ffffff;">
                        <div class="modal-header" style="padding: 16px 24px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                            <h3 id="advancedDiagModalTitle" style="margin: 0; font-size: 18px; font-weight: 600; color: #1f2937;">Advanced Diagnostics</h3>
                            <span class="close-button" id="closeAdvancedDiagModal" style="cursor: pointer; font-size: 24px; color: #9ca3af; line-height: 1; padding: 0 4px;">&times;</span>
                        </div>
                        <div id="advancedDiagModalBody" class="modal-body" style="flex: 1; overflow-y: auto; padding: 20px 24px; background: #ffffff;"></div>
                        <div class="modal-footer" style="padding: 12px 24px; background: #f8fafc; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end;">
                            <button id="closeAdvancedDiagModalBtn" class="btn-secondary" style="padding: 8px 24px; border-radius: 8px; font-weight: 500; font-size: 14px; cursor: pointer; background: #f1f3f5; border: 1px solid #e5e7eb; color: #374151;">Close</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            modal = document.getElementById('advancedDiagModal');
            document.getElementById('closeAdvancedDiagModal').addEventListener('click', () => modal.style.display = 'none');
            document.getElementById('closeAdvancedDiagModalBtn').addEventListener('click', () => modal.style.display = 'none');
            window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
        }
        return modal;
    }

    runBtn.addEventListener('click', async function() {
        const btn = this;
        btn.disabled = true;
        btn.style.opacity = '0.75';
        btn.style.cursor = 'not-allowed';
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';

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
        modalTitle.textContent = 'Advanced Diagnostics';
        modalBody.innerHTML = window.getModernSpinnerHTML('Running advanced diagnostics... This may take 2-3 minutes.');
        modal.style.display = 'flex';

        diagContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: #6b7280;">⏳ Scan in progress... See modal for details.</div>`;

        try {
            const results = await window.SmartHub.advanceDiagnostic.runFullSuite(
                currentDeviceId,
                (msg) => {
                    const textEl = modalBody.querySelector('.loading-text');
                    if (textEl) textEl.textContent = msg;
                }
            );

            // ---- 🧠 REMOVE AI DIAGNOSIS SECTION ----
            // Remove the 'ai' property so it won't be rendered or saved
            if (results && results.ai) {
                delete results.ai;
            }

            modal.style.display = 'none';
            window.SmartHub.advanceDiagnostic.renderResults('advancedDiagContainer');

            // ---- SAVE ADVANCED RESULTS (without AI) ----
            const advancedResults = {
                software: results.software ? results.software.map(r => ({ name: r.name, passed: r.passed })) : [],
                // ai intentionally omitted
                scanTime: new Date().toLocaleString()
            };
            saveAdvancedResults(advancedResults);

        } catch (err) {
            modal.style.display = 'none';
            diagContainer.innerHTML = `
                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px; color: #b91c1c;">
                    <div style="display: flex; align-items: center; gap: 8px; font-weight: 600; margin-bottom: 6px;">
                        <i class="fas fa-triangle-exclamation"></i> Scan failed
                    </div>
                    <div style="font-size: 13px; color: #991b1b; margin-bottom: 12px;">${escapeHtml(err.message)}</div>
                    <button onclick="renderAdvancedDiagnostic()" style="border: 1px solid #fca5a5; background: white; color: #b91c1c; padding: 6px 16px; border-radius: 8px; font-size: 13px; cursor: pointer;">
                        🔄 Retry
                    </button>
                </div>
            `;
        } finally {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.innerHTML = '<i class="fas fa-play"></i> Run Advanced Scan';
        }
    });

    // ---- On mount: restore previous advanced results ----
    const savedAdv = loadAdvancedResults();
    if (savedAdv) {
        diagContainer.innerHTML = `
            <div style="font-size:12px;color:#9ca3af;margin-bottom:8px;">
                Last scan: ${new Date(savedAdv.date).toLocaleString()}
            </div>
        `;
    }
}



// ==================== DASHBOARD ====================
async function renderDashboard() {
    const container = document.getElementById('pageContent');
    if (!container) return;

    // ---- Verify ADB is actually responsive ----
    if (currentDeviceId) {
        try {
            const resp = await fetch(`${BACKEND_URL}/adb-shell`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId: currentDeviceId, command: 'echo "ping"' })
            });
            if (!resp.ok) {
                console.warn('[Dashboard] ADB ping failed, clearing currentDeviceId');
                currentDeviceId = null;
            }
        } catch (e) {
            console.warn('[Dashboard] ADB ping error, clearing currentDeviceId', e);
            currentDeviceId = null;
        }
    }

    // ---- If ADB is available, render full dashboard ----
    if (currentDeviceId) {
        await renderAdbDashboard(container);

        // Add Storage Analysis button if not already present
        
        return;
    }

    // ---- No ADB – check USB state ----
    try {
        const resp = await fetch(`${BACKEND_URL}/api/device-state`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const stateData = await resp.json();
        const state = stateData.state;
        const details = stateData.details || '';

        const stateLabels = {
            'adb_ready': { icon: '✅', color: '#107c10', label: 'ADB Ready' },
            'adb_unauthorized': { icon: '⚠️', color: '#ed6c02', label: 'ADB Unauthorized' },
            'recovery': { icon: '🔧', color: '#ed6c02', label: 'Recovery Mode' },
            'sideload': { icon: '🔧', color: '#ed6c02', label: 'Sideload Mode' },
            'mtp_normal': { icon: '📁', color: '#107c10', label: 'MTP Mode (OS Booted)' },
            'bootloader': { icon: '🔧', color: '#ed6c02', label: 'Fastboot / Bootloader' },
            'samsung_download': { icon: '📥', color: '#ed6c02', label: 'Download Mode (Odin)' },
            'edl_qualcomm': { icon: '🔴', color: '#c62828', label: 'Qualcomm EDL' },
            'preloader_mediatek': { icon: '🔴', color: '#c62828', label: 'MediaTek Preloader' },
            'unknown_enumeration': { icon: '❓', color: '#6B7280', label: 'Unknown USB' },
            'generic_usb_detected': { icon: '🔌', color: '#6B7280', label: 'USB Detected (unclassified)' },
            'no_response': { icon: '📴', color: '#6B7280', label: 'No Device' }
        };

        const info = stateLabels[state] || { icon: '❓', color: '#6B7280', label: state || 'Unknown' };

        // ---- MTP Mode – OS booted successfully ----
        if (state === 'mtp_normal') {
            container.innerHTML = `
                <div class="info-card" style="text-align: left; padding: 30px; border-left: 4px solid #107c10;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <div>
                            <div style="font-size: 48px; margin-bottom: 4px;">${info.icon}</div>
                            <h2 style="color: #1e293b; margin: 0;">${info.label}</h2>
                        </div>
                        <button onclick="openTutorial()" class="btn-primary" style="font-size: 14px; padding: 10px 20px; border-radius: 8px;">
                            ▶️ Watch Tutorial
                        </button>
                    </div>
                    <p style="color: #6B7280; margin-bottom: 16px;">
                        Your phone is booted and connected in file‑transfer mode.
                    </p>
                    <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
                        <h3 style="margin-top: 0; color: #1e293b; font-size: 16px;">📋 How to Enable USB Debugging</h3>
                        <ol style="margin: 0; padding-left: 20px; color: #334155; line-height: 1.8;">
                            <li>Go to <strong>Settings</strong> → <strong>About Phone</strong></li>
                            <li>Tap <strong>Build Number</strong> 7 times to unlock Developer Options</li>
                            <li>Go back to <strong>Settings</strong> → <strong>Developer Options</strong></li>
                            <li>Toggle <strong>USB Debugging</strong> <span style="color: #dc2626;">ON</span></li>
                            <li>Connect your phone via USB and accept the RSA fingerprint prompt</li>
                        </ol>
                        <p style="margin: 12px 0 0 0; font-size: 13px; color: #64748b;">
                            💡 After enabling, the sidebar will show your device and you'll have full diagnostic access.
                        </p>
                    </div>
                    <p style="color: #94a3b8; font-size: 12px; margin-top: 8px;">
                        OS is alive. Any BSOD symptom is likely app/UI-level, not a boot failure.
                    </p>
                </div>
            `;
            return;
        }

        // ---- Firmware-level modes ----
        if (state === 'samsung_download' || state === 'bootloader' || state === 'edl_qualcomm' || state === 'preloader_mediatek') {
            container.innerHTML = `
                <div class="info-card" style="text-align: center; padding: 30px; border-left: 4px solid #ed6c02;">
                    <div style="font-size: 48px; margin-bottom: 12px;">${info.icon}</div>
                    <h2 style="color: #1e293b;">Device in ${info.label}</h2>
                    <p style="color: #6B7280;">${details}</p>
                    <p style="color: #475569; font-size: 14px; margin-top: 8px;">
                        This device is not booted into Android. Use <strong>BSOD Diagnosis</strong> for troubleshooting.
                    </p>
                    <button onclick="document.querySelector('.nav-item[data-page=\\'bsod\\']')?.click()" class="btn-primary" style="margin-top: 12px;">
                        🔍 Go to BSOD Diagnosis
                    </button>
                </div>
            `;
            return;
        }

        // ---- Recovery mode ----
        if (state === 'recovery' || state === 'sideload') {
            container.innerHTML = `
                <div class="info-card" style="text-align: center; padding: 30px; border-left: 4px solid #ed6c02;">
                    <div style="font-size: 48px; margin-bottom: 12px;">${info.icon}</div>
                    <h2 style="color: #1e293b;">${info.label}</h2>
                    <p style="color: #6B7280;">${details}</p>
                    <p style="color: #475569; font-size: 14px; margin-top: 8px;">
                        Boot partition is intact. System partition may be corrupted.
                    </p>
                    <button onclick="document.querySelector('.nav-item[data-page=\\'bsod\\']')?.click()" class="btn-primary" style="margin-top: 12px;">
                        🔍 Go to BSOD Diagnosis
                    </button>
                </div>
            `;
            return;
        }

        // ---- Generic USB detected ----
        if (state === 'generic_usb_detected' || state === 'unknown_enumeration') {
            container.innerHTML = `
                <div class="info-card" style="text-align: center; padding: 30px; border-left: 4px solid #6B7280;">
                    <div style="font-size: 48px; margin-bottom: 12px;">${info.icon}</div>
                    <h2 style="color: #1e293b;">${info.label}</h2>
                    <p style="color: #6B7280;">${details}</p>
                    <p style="color: #475569; font-size: 14px; margin-top: 8px;">
                        A USB device was detected but could not be classified. Try reconnecting or check drivers.
                    </p>
                </div>
            `;
            return;
        }

        // ---- No response ----
        if (state === 'no_response') {
            // Fall through to "No Device Connected" below
        }
    } catch (err) {
        console.warn('[Dashboard] USB state check failed:', err);
        // Fall through to "No Device Connected"
    }

    // ---- Fallback: No device connected ----
    container.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; text-align: center; min-height: 400px;">
            <div style="position: relative; width: 80px; height: 80px; margin-bottom: 24px;">
                <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; border: 4px solid #e5e7eb;"></div>
                <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; border: 4px solid transparent; border-top-color: #3b82f6; animation: spin 1s linear infinite;"></div>
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 32px; color: #9ca3af;">
                    <i class="fas fa-plug"></i>
                </div>
            </div>
            <h2 style="color: #1e293b; font-size: 24px; font-weight: 600; margin-bottom: 8px;">No Device Detected</h2>
            <p style="color: #6B7280; font-size: 16px; margin-bottom: 4px;">Waiting for phone to be connected...</p>
            <p style="color: #94a3b8; font-size: 14px;">Please connect your Android phone via USB and enable USB debugging.</p>
            <button id="openWizardFromDashboard" class="btn-primary" style="margin-top: 20px; padding: 10px 32px; border-radius: 8px;">
                🔌 Open USB Debugging Wizard
            </button>
        </div>
    `;
    document.getElementById('openWizardFromDashboard')?.addEventListener('click', openWizard);
}

// ---- Extracted ADB dashboard rendering (keep the existing logic) ----
// ---- RENDER FULL ADB DASHBOARD ----

async function renderAdbDashboard(container) {
    container.innerHTML = `
        <h1 style="margin-bottom: 24px;">Dashboard</h1>
        <div class="action-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px;">
            <div class="action-card" data-action="storage-analysis" style="background: white; border-radius: 16px; padding: 20px 16px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; border: 1px solid #e5e7eb;">
                <div style="font-size: 32px; margin-bottom: 8px;">💾</div>
                <div style="font-weight: 600; font-size: 15px;">Storage Analysis</div>
                <div style="font-size: 12px; color: #6B7280; margin-top: 4px;">Check storage usage & large files</div>
            </div>
            <div class="action-card" data-action="app-security" style="background: white; border-radius: 16px; padding: 20px 16px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; border: 1px solid #e5e7eb;">
                <div style="font-size: 32px; margin-bottom: 8px;">🛡️</div>
                <div style="font-weight: 600; font-size: 15px;">App Security Scan</div>
                <div style="font-size: 12px; color: #6B7280; margin-top: 4px;">Detect suspicious & risky apps</div>
            </div>
            <div class="action-card" data-action="install" style="background: white; border-radius: 16px; padding: 20px 16px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; border: 1px solid #e5e7eb;">
                <div style="font-size: 32px; margin-bottom: 8px;">📱</div>
                <div style="font-weight: 600; font-size: 15px;">Install Android App</div>
                <div style="font-size: 12px; color: #6B7280; margin-top: 4px;">Deploy companion app</div>
            </div>
            <div class="action-card" data-action="wizard" style="background: white; border-radius: 16px; padding: 20px 16px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; border: 1px solid #e5e7eb;">
                <div style="font-size: 32px; margin-bottom: 8px;">🔌</div>
                <div style="font-weight: 600; font-size: 15px;">USB Debugging Wizard</div>
                <div style="font-size: 12px; color: #6B7280; margin-top: 4px;">Connect your phone</div>
            </div>
            <div class="action-card" data-action="help" style="background: white; border-radius: 16px; padding: 20px 16px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; border: 1px solid #e5e7eb;">
                <div style="font-size: 32px; margin-bottom: 8px;">❓</div>
                <div style="font-weight: 600; font-size: 15px;">Help</div>
                <div style="font-size: 12px; color: #6B7280; margin-top: 4px;">Guides & support</div>
            </div>
        </div>

        <div class="card" id="softwareSafetyCard">
            <div class="card-title"><i class="fas fa-shield-alt"></i> Software Safety</div>
            <div id="safetyContent" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px;">
                <div style="background: #f8f9fa; border-radius: 8px; padding: 10px; text-align: center;">
                    <div style="font-size: 12px; color: #6B7280;">Security Patch</div>
                    <div id="safetyPatch" style="font-weight: 600;">---</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 10px; text-align: center;">
                    <div style="font-size: 12px; color: #6B7280;">Root Status</div>
                    <div id="safetyRoot" style="font-weight: 600;">---</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 10px; text-align: center;">
                    <div style="font-size: 12px; color: #6B7280;">Play Protect</div>
                    <div id="safetyPlayProtect" style="font-weight: 600;">---</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 10px; text-align: center;">
                    <div style="font-size: 12px; color: #6B7280;">Unknown Sources</div>
                    <div id="safetyUnknown" style="font-weight: 600;">---</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 10px; text-align: center;">
                    <div style="font-size: 12px; color: #6B7280;">USB Debugging</div>
                    <div id="safetyAdb" style="font-weight: 600;">---</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 10px; text-align: center;">
                    <div style="font-size: 12px; color: #6B7280;">Suspicious Apps</div>
                    <div id="safetySuspicious" style="font-weight: 600;">---</div>
                </div>
            </div>
        </div>

        <!-- ===== SCAN RESULTS SECTION (UPDATED) ===== -->
        <div id="scanResultsSection" style="margin-top: 24px;">
            <div id="appScanResults" style="display: none; margin-bottom: 16px;"></div>
            <div id="storageResults" style="display: none; margin-bottom: 16px;"></div>
            <div id="hardwareResults" style="display: none; margin-bottom: 16px;"></div>
            <div id="connectionResults" style="display: none; margin-bottom: 16px;"></div>
            <div id="advancedResults" style="display: none; margin-bottom: 16px;"></div>
        </div>

        <div id="deviceOverview" class="card" style="display: none;"></div>
        <div id="networkStatus" class="card" style="display: none;"></div>
        <div id="phoneSummary" class="card" style="display: none;">
            <div class="card-title"><i class="fas fa-mobile-alt"></i> Phone Summary</div>
            <div class="phone-summary-grid"></div>
        </div>
        <div id="alertsCard" class="card" style="display: none;"></div>
        <div id="diagnosticResult" class="card" style="display: none;"></div>
    `;

    loadSavedScanResults();

    // Attach event listeners (unchanged)
    const storageCard = container.querySelector('.action-card[data-action="storage-analysis"]');
    if (storageCard) storageCard.addEventListener('click', runStorageAnalysis);

    const appSecurityCard = container.querySelector('.action-card[data-action="app-security"]');
    if (appSecurityCard) {
        appSecurityCard.addEventListener('click', function(e) {
            try {
                if (typeof window.runAppScan === 'function') {
                    window.runAppScan();
                } else {
                    const script = document.createElement('script');
                    script.src = '../js/appScan.js';
                    script.onload = () => {
                        if (typeof window.runAppScan === 'function') {
                            window.runAppScan();
                        } else {
                            alert('AppScan module loaded but function not found. Refresh the page.');
                        }
                    };
                    script.onerror = () => {
                        console.error('Failed to load appScan.js');
                        alert('Failed to load AppScan module. Please refresh the page.');
                    };
                    document.head.appendChild(script);
                }
            } catch (err) {
                console.error('[Dashboard] Error running app scan:', err);
                alert('Error: ' + err.message);
            }
        });
    }

    const installCard = container.querySelector('.action-card[data-action="install"]');
    if (installCard) {
        installCard.addEventListener('click', async () => {
            if (!currentDeviceId) {
                await showAlert('No Device', 'No device connected. Please connect a phone first.');
                return;
            }
            const btn = installCard;
            const descEl = btn.querySelector('div:last-child');
            const originalText = descEl?.innerHTML || 'Deploy companion app';
            if (descEl) descEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Installing...';
            try {
                const response = await fetch(`${BACKEND_URL}/api/install-apk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deviceId: currentDeviceId })
                });
                const data = await response.json();
                if (response.ok) {
                    await showAlert('Success', 'Android app installed successfully!');
                } else {
                    await showAlert('Error', 'Installation failed: ' + data.error);
                }
            } catch (err) {
                await showAlert('Error', 'Error: ' + err.message);
            } finally {
                if (descEl) descEl.innerHTML = originalText;
            }
        });
    }

    const wizardCard = container.querySelector('.action-card[data-action="wizard"]');
    if (wizardCard) wizardCard.addEventListener('click', openWizard);

    const helpCard = container.querySelector('.action-card[data-action="help"]');
    if (helpCard) helpCard.addEventListener('click', showHelpModal);

    // Fetch hardware data (unchanged)
    console.log('[Dashboard] Fetching hardware data for device:', currentDeviceId);
    try {
        const [battery, storage, ram, deviceText, wifiStatus, tempData, safetyData] = await Promise.all([
            apiCall(`/hardware/battery?deviceId=${currentDeviceId}`).catch(e => {
                console.error('[Dashboard] Battery API error:', e);
                return { level: '?', health: 'unknown' };
            }),
            apiCall(`/hardware/storage?deviceId=${currentDeviceId}`).catch(e => {
                console.error('[Dashboard] Storage API error:', e);
                return { total: '?', used: '?', free: '?' };
            }),
            apiCall(`/hardware/ram?deviceId=${currentDeviceId}`).catch(e => {
                console.error('[Dashboard] RAM API error:', e);
                return { total: '?', used: '?' };
            }),
            fetchWithTimeout(`${BACKEND_URL}/device/${currentDeviceId}`, {}, 7000)
                .then(r => r.text())
                .catch(e => {
                    console.error('[Dashboard] Device props error:', e);
                    return '';
                }),
            fetchWithTimeout(`${BACKEND_URL}/wifi/status/${currentDeviceId}`, {}, 7000)
                .then(r => r.json())
                .catch(e => {
                    console.error('[Dashboard] WiFi status error:', e);
                    return null;
                }),
            apiCall(`/hardware/temperature?deviceId=${currentDeviceId}`).catch(e => {
                console.error('[Dashboard] Temperature error:', e);
                return { temperature: 'Unknown' };
            }),
            fetch(`${BACKEND_URL}/api/software-safety?deviceId=${currentDeviceId}`)
                .then(r => r.ok ? r.json() : null)
                .catch(e => {
                    console.error('[Dashboard] Software safety error:', e);
                    return null;
                })
        ]);

        console.log('[Dashboard] Battery data:', battery);
        console.log('[Dashboard] Storage data:', storage);
        console.log('[Dashboard] RAM data:', ram);

        await updateStatusBar();

        if (safetyData) {
            document.getElementById('safetyPatch').textContent = safetyData.patchDate || 'Unknown';
            document.getElementById('safetyRoot').textContent = safetyData.isRooted ? '⚠️ Rooted' : '✅ Safe';
            document.getElementById('safetyPlayProtect').textContent = safetyData.playProtectEnabled ? '✅ On' : '⚠️ Off';
            document.getElementById('safetyUnknown').textContent = safetyData.unknownSourcesEnabled ? '⚠️ Allowed' : '✅ Disabled';
            document.getElementById('safetyAdb').textContent = safetyData.adbDebugging ? '⚠️ Enabled' : '✅ Disabled';
            const suspCount = (window._appSecurityResults && window._appSecurityResults[currentDeviceId]) 
                ? window._appSecurityResults[currentDeviceId].length 
                : 0;
            document.getElementById('safetySuspicious').textContent = suspCount > 0 ? `⚠️ ${suspCount}` : '✅ 0';
        }
    } catch (err) {
        console.error('[Dashboard] Error fetching data:', err);
    }

    document.getElementById('testScanBtn')?.addEventListener('click', testSuspiciousScan);
}

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

function loadSavedScanResults() {
    // App Security Scan
    const appResults = loadAppScanResults();
    if (appResults) renderAppScanResults(appResults);

    // Storage Analysis
    const storageResults = loadStorageResults();
    if (storageResults) renderStorageResults(storageResults);

    // Hardware Tests
    const hardwareResults = loadHardwareResults();
    if (hardwareResults) renderHardwareResults(hardwareResults);

    // Connection Troubleshoot
    const connectionResults = loadConnectionResults();
    if (connectionResults) renderConnectionResults(connectionResults);

    // Advanced Diagnostic
    const advancedResults = loadAdvancedResults();
    if (advancedResults) renderAdvancedResults(advancedResults);
}

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
async function showBatteryModal() {
    const modal = ensureInfoModal('batteryModal', '🔋 Battery & CPU Usage');
    const body = document.getElementById('batteryModalBody');
    body.innerHTML = getModernSpinnerHTML('Loading battery data...');
    modal.style.display = 'flex';

    try {
        const [battery, cpuData] = await Promise.all([
            apiCall(`/hardware/battery?deviceId=${currentDeviceId}`).catch(() => ({})),
            apiCall(`/hardware/cpu-usage?deviceId=${currentDeviceId}`).catch(() => ({}))
        ]);

        const topApps = cpuData.topApps || [];

        // ---- Battery Summary (compact) ----
        const level = battery.level !== undefined && battery.level !== null ? battery.level : '?';
        const health = battery.health ?? 'unknown';
        const healthEmoji = health === 'good' ? '✅' : health === 'overheat' ? '🌡️' : health === 'dead' ? '💀' : '⚠️';
        const charging = battery.charging !== undefined ? (battery.charging ? '⚡ Charging' : '🔌 Not charging') : '?';
        const temperature = battery.temperature ?? 'Unknown';
        const voltage = battery.voltage ?? 'Unknown';
        const technology = battery.technology ?? 'Unknown';

        // Compact grid with smaller cards
        let summaryHtml = `
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px;">
                <div style="background: #f8f9fa; border-radius: 8px; padding: 6px 8px; text-align: center;">
                    <div style="font-size: 10px; color: #6B7280;">Battery</div>
                    <div style="font-size: 18px; font-weight: 600;">${level}%</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 6px 8px; text-align: center;">
                    <div style="font-size: 10px; color: #6B7280;">Health</div>
                    <div style="font-size: 14px; font-weight: 600;">${healthEmoji} ${health}</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 6px 8px; text-align: center;">
                    <div style="font-size: 10px; color: #6B7280;">Status</div>
                    <div style="font-size: 13px; font-weight: 600;">${charging}</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 6px 8px; text-align: center;">
                    <div style="font-size: 10px; color: #6B7280;">Temp</div>
                    <div style="font-size: 14px; font-weight: 600;">${temperature}</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 6px 8px; text-align: center;">
                    <div style="font-size: 10px; color: #6B7280;">Voltage</div>
                    <div style="font-size: 14px; font-weight: 600;">${voltage}</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 6px 8px; text-align: center;">
                    <div style="font-size: 10px; color: #6B7280;">Type</div>
                    <div style="font-size: 13px; font-weight: 600;">${technology}</div>
                </div>
            </div>
        `;

        // ---- Apps Section (compact) ----
        let appsHtml = '';
        if (topApps.length === 0) {
            appsHtml = `
                <div style="text-align: center; padding: 16px; background: #fef3c7; border-radius: 8px; font-size: 13px;">
                    <p>📊 No app usage data available.</p>
                    <p style="font-size: 12px; color: #78350f;">Run some apps and refresh.</p>
                    <button id="refreshCpuBtn" class="btn-primary" style="margin-top: 8px; font-size: 12px; padding: 4px 12px;">🔄 Refresh</button>
                </div>
            `;
        } else {
            const itemsHtml = topApps.slice(0, 20).map(app => {
                const cpu = parseFloat(app.cpu);
                return `
                    <div class="battery-process-item" data-name="${escapeHtml(app.name.toLowerCase())}" style="margin-bottom: 6px; background: #ffffff; border-radius: 6px; padding: 4px 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
                            <span style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%;">📱 ${escapeHtml(app.name)}</span>
                            <span style="font-size: 11px; color: #555;">${app.cpu} CPU</span>
                        </div>
                        <div style="background: #e9ecef; border-radius: 2px; height: 3px; margin-top: 2px; overflow: hidden;">
                            <div style="width: ${Math.min(100, cpu)}%; background: #f97316; height: 100%;"></div>
                        </div>
                    </div>
                `;
            }).join('');

            appsHtml = `
                <div style="margin-bottom: 8px;">
                    <input type="text" id="cpuSearchInput" placeholder="🔍 Filter apps..." style="width:100%; padding:4px 10px; border:1px solid #ddd; border-radius:20px; font-size:12px; outline:none;">
                </div>
                <div style="max-height: 220px; overflow-y: auto; padding-right: 4px;">
                    ${itemsHtml}
                </div>
                <div style="margin-top: 6px; font-size: 10px; color: #6c757d; text-align: center;">
                    CPU usage as proxy for battery drain.
                </div>
                <div style="margin-top: 8px; text-align: right;">
                    <button id="refreshCpuBtn" class="btn-secondary" style="padding: 2px 10px; font-size: 11px;">🔄 Refresh</button>
                </div>
            `;
        }

        body.innerHTML = summaryHtml + appsHtml;

        // ---- Event Listeners ----
        document.getElementById('refreshCpuBtn')?.addEventListener('click', showBatteryModal);
        const searchInput = document.getElementById('cpuSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                const items = document.querySelectorAll('.battery-process-item');
                items.forEach(item => {
                    const name = item.getAttribute('data-name');
                    if (name && name.includes(query)) {
                        item.style.display = '';
                    } else {
                        item.style.display = 'none';
                    }
                });
            });
        }

    } catch (err) {
        console.error('Battery modal error:', err);
        body.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #d32f2f;">
                <p>❌ Error: ${escapeHtml(err.message)}</p>
                <button id="retryBatteryBtn" class="btn-primary" style="margin-top: 12px;">🔄 Retry</button>
            </div>
        `;
        document.getElementById('retryBatteryBtn')?.addEventListener('click', showBatteryModal);
    }
}
// Storage modal – pie chart using canvas (simple, no external lib)
// Storage modal – redesigned with a single segmented bar instead of a canvas pie chart
async function showStorageModal() {
    const modal = ensureInfoModal('storageModal', '💾 Storage Details');
    const body = document.getElementById('storageModalBody');
    body.innerHTML = getModernSpinnerHTML('Loading storage...');
    modal.style.display = 'flex';
    try {
        const url = `${BACKEND_URL}/api/hardware/storage-details?deviceId=${currentDeviceId}`;
        console.log('Fetching storage details from:', url);
        const response = await fetchWithTimeout(url, {}, 120000);
        const data = await response.json();
        console.log('Storage details response:', data);
        const b = data.breakdown || {};
        const total = b.total?.human || '?';
        const used = b.used?.human || '?';
        const free = b.free?.human || '?';
        const freeBytes = Number(b.free?.bytes) || 0;

        const categories = [
            { key: 'apps', label: 'Apps', icon: '📱', color: '#0d6efd', data: b.apps },
            { key: 'media', label: 'Media', icon: '🎬', color: '#198754', data: b.media },
            { key: 'system', label: 'System', icon: '⚙️', color: '#0dcaf0', data: b.system },
            { key: 'other', label: 'Other', icon: '📦', color: '#6c757d', data: b.other }
        ].map(cat => ({
            ...cat,
            bytes: Number(cat.data?.bytes) || 0,
            human: cat.data?.human || '0 KB'
        }));

        const totalBytesAll = categories.reduce((sum, c) => sum + c.bytes, 0) + freeBytes;
        const segments = totalBytesAll > 0
            ? [...categories, { key: 'free', label: 'Free', icon: '🟩', color: '#e5e7eb', bytes: freeBytes, human: free }]
                .map(s => ({ ...s, percent: (s.bytes / totalBytesAll) * 100 }))
            : [];

        // Sort the legend by size descending (free space always shown last, regardless of size)
        const sortedCategories = [...categories].sort((a, b2) => b2.bytes - a.bytes);
        const freeSegment = segments.find(s => s.key === 'free');

        // Free-space status color: this is the actual question a technician is asking
        const freePercent = freeSegment ? freeSegment.percent : 0;
        const freeStatusColor = freePercent < 10 ? '#dc3545' : freePercent < 20 ? '#f59e0b' : '#198754';
        const freeStatusLabel = freePercent < 10 ? 'Low' : freePercent < 20 ? 'Getting full' : 'Healthy';

        const html = `
            <div style="padding: 4px 0;">
                <!-- Headline numbers -->
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 32px; font-weight: 700; color: #1f2937; line-height: 1.1;">
                        ${escapeHtml(total)} <span style="font-size: 16px; font-weight: 500; color: #9ca3af;">total</span>
                    </div>
                    <div style="font-size: 14px; color: #6b7280; margin-top: 6px;">
                        <strong style="color: #374151;">${escapeHtml(used)}</strong> used ·
                        <strong style="color: #374151;">${escapeHtml(free)}</strong> free
                        <span style="display: inline-block; margin-left: 8px; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; background: ${freeStatusColor}18; color: ${freeStatusColor};">
                            ${freeStatusLabel}
                        </span>
                    </div>
                </div>

                <!-- Segmented storage bar -->
                <div style="display: flex; width: 100%; height: 14px; border-radius: 8px; overflow: hidden; background: #f1f3f5; margin-bottom: 20px; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.04);">
                    ${segments.map(s => `
                        <div title="${escapeHtml(s.label)}: ${escapeHtml(s.human)}"
                             style="width: ${Math.max(s.percent, s.bytes > 0 ? 0.6 : 0)}%; background: ${s.color}; transition: width 0.3s ease;">
                        </div>
                    `).join('')}
                </div>

                <!-- Category legend -->
                <div style="display: flex; flex-direction: column; gap: 2px;">
                    ${sortedCategories.map(cat => {
                        const pct = segments.find(s => s.key === cat.key)?.percent || 0;
                        return `
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 4px; border-bottom: 1px solid #f1f3f5;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="width: 10px; height: 10px; border-radius: 3px; background: ${cat.color}; flex-shrink: 0;"></span>
                                <span style="font-size: 14px; color: #374151;">${cat.icon} ${escapeHtml(cat.label)}</span>
                            </div>
                            <div style="text-align: right;">
                                <span style="font-size: 14px; font-weight: 600; color: #1f2937;">${escapeHtml(cat.human)}</span>
                                <span style="font-size: 12px; color: #9ca3af; margin-left: 6px;">${pct.toFixed(1)}%</span>
                            </div>
                        </div>
                    `;
                    }).join('')}
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 4px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="width: 10px; height: 10px; border-radius: 3px; background: #e5e7eb; flex-shrink: 0;"></span>
                            <span style="font-size: 14px; color: #9ca3af;">🟩 Free</span>
                        </div>
                        <div style="text-align: right;">
                            <span style="font-size: 14px; font-weight: 600; color: #6b7280;">${escapeHtml(free)}</span>
                            <span style="font-size: 12px; color: #9ca3af; margin-left: 6px;">${freePercent.toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        body.innerHTML = html;
    } catch (err) {
        console.error('Storage modal error:', err);
        body.innerHTML = `<div class="alert alert-danger">Error: ${escapeHtml(err.message)}</div>`;
    }
}

// RAM modal – list apps by RSS memory descending
function simplifyAppName(pkg) {
    // Remove common prefixes
    let name = pkg
        .replace(/^com\.(android|google|transsion|transsnet|facebook|whatsapp|instagram)\./i, '')
        .replace(/^android\./i, '')
        .replace(/\.android$/, '')
        .replace(/[.:]/g, ' ');
    // Map known long names
    const map = {
        'chrome': 'Chrome',
        'gms': 'Play Services',
        'messaging': 'Messages',
        'phonemaster': 'Phone Master',
        'phonemanager': 'Phone Manager',
        'launcher': 'Launcher',
        'weathers': 'Weather',
        'store': 'App Store',
        'instagram': 'Instagram',
        'facebook': 'Facebook',
        'whatsapp': 'WhatsApp'
    };
    const lower = name.toLowerCase();
    for (const [key, val] of Object.entries(map)) {
        if (lower.includes(key)) return val;
    }
    // Capitalize first letter of each word
    return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').substring(0, 25);
}

async function showRamModal() {
    const modal = ensureInfoModal('ramModal', '🧠 RAM Usage by App');
    const body = document.getElementById('ramModalBody');
    body.innerHTML = getModernSpinnerHTML('Loading RAM usage...');
    modal.style.display = 'flex';
    try {
        const [processes, ramInfo] = await Promise.all([
            fetchWithTimeout(`${BACKEND_URL}/api/hardware/ram-usage?deviceId=${currentDeviceId}`, {}, 15000).then(r => r.json()),
            fetchWithTimeout(`${BACKEND_URL}/api/hardware/ram?deviceId=${currentDeviceId}`, {}, 8000).then(r => r.json())
        ]);

        const totalRam = ramInfo.total || '?';
        const usedRam = ramInfo.used || '?';
        
        let usedMB = 0;
        if (usedRam !== '?') {
            const match = usedRam.match(/(\d+(?:\.\d+)?)/);
            if (match) {
                usedMB = parseFloat(match[1]);
                if (usedRam.includes('GB')) usedMB *= 1024;
            }
        }
        
        // Overall RAM usage bar – reduced top margin/padding
        let ramBarHtml = '';
        if (totalRam !== '?' && usedRam !== '?') {
            const usedGB = parseFloat(usedRam);
            const totalGB = parseFloat(totalRam);
            if (!isNaN(usedGB) && !isNaN(totalGB) && totalGB > 0) {
                const percent = (usedGB / totalGB) * 100;
                ramBarHtml = `
                    <div style="background: #f8f9fa; border-radius: 16px; padding: 12px; margin-bottom: 16px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                            <span style="font-weight: 600;">📊 RAM Usage</span>
                            <span>${escapeHtml(usedRam)} / ${escapeHtml(totalRam)} (${percent.toFixed(1)}%)</span>
                        </div>
                        <div style="background: #e9ecef; border-radius: 10px; height: 8px; overflow: hidden;">
                            <div style="width: ${percent}%; background: #0d6efd; height: 100%; border-radius: 10px;"></div>
                        </div>
                    </div>
                `;
            }
        }

        // Prepare process list with percentages based on used RAM
        let processList = (Array.isArray(processes) ? processes : []).map(proc => {
            const mb = parseFloat(proc.rssMB);
            let percentOfUsed = 0;
            if (!isNaN(mb) && usedMB > 0) percentOfUsed = (mb / usedMB) * 100;
            return {
                originalName: proc.name,
                displayName: simplifyAppName(proc.name),
                percent: percentOfUsed,
                mb: mb
            };
        }).filter(p => p.percent > 0.01 || p.mb > 0);

        // Calculate total accounted percentage
        const accountedPercent = processList.reduce((sum, p) => sum + p.percent, 0);
        const remainingPercent = Math.max(0, 100 - accountedPercent);
        
        // Add "System & Kernel" entry if unaccounted memory exists
        if (remainingPercent > 0.5) {
            processList.push({
                originalName: 'system_kernel',
                displayName: '🖥️ System & Kernel',
                percent: remainingPercent,
                mb: (remainingPercent / 100) * usedMB
            });
        }

        // Sort ALL entries (including kernel) by percentage descending
        processList.sort((a, b) => b.percent - a.percent);

        const listId = 'ramProcessList';

        const html = `
            ${ramBarHtml}
            <div style="margin-bottom: 12px;">
                <input type="text" id="ramSearchInput" placeholder="🔍 Filter apps..." style="width:100%; padding:8px 12px; border:1px solid #ddd; border-radius:24px; font-size:13px; outline:none;">
            </div>
            <div id="${listId}" class="ram-process-list-container" style="max-height: 320px; overflow-y: auto; padding-right: 6px;">
                ${processList.map(proc => `
                    <div class="ram-process-item" data-name="${escapeHtml(proc.originalName.toLowerCase())}" style="margin-bottom: 12px; background: #ffffff; border-radius: 10px; padding: 8px 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <span style="font-weight: 600; font-size: 13px;">${escapeHtml(proc.displayName)}</span>
                            <span style="font-size: 12px; color: #555;">${proc.percent.toFixed(1)}% (${proc.mb.toFixed(0)} MB)</span>
                        </div>
                        <div style="background: #e9ecef; border-radius: 4px; height: 4px; overflow: hidden;">
                            <div style="width: ${proc.percent}%; background: #0d6efd; height: 100%; border-radius: 4px;"></div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div style="margin-top: 8px; font-size: 11px; color: #6c757d; text-align: center;">
                Percentages shown are of <strong>used RAM</strong> (${escapeHtml(usedRam)}).  
                "System & Kernel" includes drivers, caches, and kernel memory.
            </div>
        `;

        body.innerHTML = html;

        // Search filter
        const searchInput = document.getElementById('ramSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                const items = document.querySelectorAll('.ram-process-item');
                items.forEach(item => {
                    const name = item.getAttribute('data-name');
                    if (name && name.includes(query)) {
                        item.style.display = '';
                    } else {
                        item.style.display = 'none';
                    }
                });
            });
        }

    } catch (err) {
        console.error('RAM modal error:', err);
        body.innerHTML = `<div class="alert alert-danger">Error: ${escapeHtml(err.message)}</div>`;
    }
}

// Temperature modal – show temperature + top CPU-consuming apps
async function showTemperatureModal() {
    const modal = ensureInfoModal('temperatureModal', '🌡️ Phone Temperature & Heat Contributors');
    const body = document.getElementById('temperatureModalBody');
    body.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"></div><p>Loading data...</p></div>';
    modal.style.display = 'flex';
    try {
        const response = await fetchWithTimeout(`${BACKEND_URL}/api/hardware/cpu-usage?deviceId=${currentDeviceId}`, {}, 15000);
        const data = await response.json();
        let html = `
            <div class="card bg-light mb-3">
                <div class="card-body p-2 text-center">
                    <h5 class="card-title">Current Temperature</h5>
                    <p class="display-6">${escapeHtml(data.currentTemp || 'Unknown')}</p>
                </div>
            </div>
        `;
        if (Array.isArray(data.topApps) && data.topApps.length) {
            html += `<div class="card"><div class="card-header">🔥 Apps consuming CPU</div><div class="list-group list-group-flush">`;
            for (const app of data.topApps.slice(0, 10)) {
                const displayName = simplifyAppName(app.name);
                html += `<div class="list-group-item d-flex justify-content-between align-items-center">
                            <strong>${escapeHtml(displayName)}</strong>
                            <span class="badge bg-warning text-dark">${escapeHtml(app.cpu)}% CPU</span>
                         </div>`;
            }
            html += `</div></div>`;
        } else {
            html += '<p class="text-muted">No high CPU usage detected.</p>';
        }
        body.innerHTML = html;
    } catch (err) {
        body.innerHTML = `<div class="alert alert-danger">Error: ${escapeHtml(err.message)}</div>`;
    }
}

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
// ==================== HARDWARE TESTS PAGE (FINAL) ====================
async function renderHardwareTests() {
    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `<div class="card">No device connected. Please connect an Android phone with USB debugging enabled.</div>`;
        return;
    }

    // ========== HELPERS ==========
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

    async function launchAndroidApp() {
        await runAdb('am start -n com.smarthub.diagnostics/.MainActivity');
    }

    async function launchTestRunner(testType) {
        await runAdb(`am start -n com.smarthub.diagnostics/.TestRunnerActivity --es test ${testType}`);
    }

    async function launchExtraHardwareTest(mode) {
        await runAdb(`am start -n com.smarthub.diagnostics/.ExtraHardwareTestActivity --es mode ${mode}`);
    }

    async function returnToMainApp() {
        await runAdb('input keyevent KEYCODE_BACK');
        await new Promise(r => setTimeout(r, 500));
        await launchAndroidApp();
    }

    // ---- Hardware feature detection ----
    let hardwareFeaturesCache = null;

    async function getHardwareFeatures() {
        if (hardwareFeaturesCache) return hardwareFeaturesCache;
        try {
            const out = await runAdb('pm list features');
            const features = out.split('\n')
                .filter(line => line.includes('feature:'))
                .map(line => line.replace(/^feature:/, '').trim());
            hardwareFeaturesCache = features;
            return features;
        } catch {
            return [];
        }
    }

    async function hasFeature(feature) {
        const features = await getHardwareFeatures();
        return features.some(f => f === feature);
    }

    async function hasSensor(sensorType) {
        try {
            const out = await runAdb(`dumpsys sensorservice | grep -i "${sensorType}"`);
            return out.trim().length > 0;
        } catch {
            return false;
        }
    }

    // ---- Modal helpers ----
    let modal, modalTitle, modalBody, yesBtn, noBtn, closeBtn;
    let currentResolver = null;

    function initModal() {
        modal = document.getElementById('hwTestModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'hwTestModal';
            modal.className = 'modal';
            modal.style.display = 'none';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 500px; width: 90%; background: white; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
                    <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
                        <h3 id="hwModalTitle" style="margin: 0; font-size: 18px;">Hardware Test</h3>
                        <span class="close-button" id="hwCloseModalBtn" style="cursor: pointer; font-size: 24px; color: #6B7280;">&times;</span>
                    </div>
                    <div class="modal-body" id="hwModalBody" style="padding: 20px; text-align: center; min-height: 150px;"></div>
                    <div class="modal-footer" id="hwModalFooter" style="padding: 16px 20px; border-top: 1px solid #e5e7eb; text-align: center;">
                        <button id="hwYesBtn" class="btn-primary" style="display: none; margin: 0 8px;">✅ Yes, it worked</button>
                        <button id="hwNoBtn" class="btn-secondary" style="display: none; margin: 0 8px;">❌ No, it failed</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        modalTitle = document.getElementById('hwModalTitle');
        modalBody = document.getElementById('hwModalBody');
        yesBtn = document.getElementById('hwYesBtn');
        noBtn = document.getElementById('hwNoBtn');
        closeBtn = document.getElementById('hwCloseModalBtn');

        closeBtn.addEventListener('click', closeModal);
        window.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    }

    function showModal(title, message) {
        if (!modal) initModal();
        modalTitle.textContent = title;
        modalBody.innerHTML = message;
        modal.style.display = 'flex';
        yesBtn.style.display = 'none';
        noBtn.style.display = 'none';
    }

    function closeModal() {
        if (modal) modal.style.display = 'none';
        if (currentResolver) {
            currentResolver('no');
            currentResolver = null;
        }
    }

    function waitForUserConfirmation() {
        return new Promise((resolve) => {
            currentResolver = resolve;
            yesBtn.style.display = 'inline-block';
            noBtn.style.display = 'inline-block';
            const onYes = () => { cleanup(); resolve('yes'); };
            const onNo = () => { cleanup(); resolve('no'); };
            const cleanup = () => {
                yesBtn.removeEventListener('click', onYes);
                noBtn.removeEventListener('click', onNo);
                yesBtn.style.display = 'none';
                noBtn.style.display = 'none';
                currentResolver = null;
                closeModal();
            };
            yesBtn.addEventListener('click', onYes);
            noBtn.addEventListener('click', onNo);
        });
    }

    initModal();

    // ========== TEST DEFINITIONS (unchanged) ==========
    const testDefs = {
        battery: {
            title: 'Battery',
            desc: 'Check battery level and health',
            run: async () => {
                const data = await apiCall(`/hardware/battery?deviceId=${currentDeviceId}`);
                const level = data.level || 0;
                const health = data.health || 'unknown';
                const passed = (level >= 20 && health === 'good');
                const message = passed ? `Level: ${level}%, health: ${health}` : (level < 20 ? 'Low battery (<20%)' : 'Poor battery health');
                return { passed, message };
            }
        },
        storage: {
            title: 'Storage',
            desc: 'Check storage space',
            run: async () => {
                const data = await apiCall(`/hardware/storage?deviceId=${currentDeviceId}`);
                const free = data.free || '0';
                let freeGB = 0;
                const match = String(free).match(/(\d+(?:\.\d+)?)/);
                if (match) freeGB = parseFloat(match[1]);
                const passed = freeGB > 1.0;
                const message = `Free space: ${free}`;
                return { passed, message };
            }
        },
        sensors: {
            title: 'Sensors',
            desc: 'Detect accelerometer, gyro, proximity, light',
            run: async () => {
                try {
                    const res = await apiCall(`/hardware/sensors?deviceId=${currentDeviceId}`);
                    const sensors = res.sensors || [];
                    const types = sensors.map(s => s.type.toLowerCase());
                    const hasAccel = types.some(t => t.includes('accelerometer'));
                    const hasGyro = types.some(t => t.includes('gyroscope'));
                    const hasProx = types.some(t => t.includes('proximity'));
                    const hasLight = types.some(t => t.includes('light'));
                    const passed = hasAccel && hasProx && hasLight;
                    const missing = [];
                    if (!hasAccel) missing.push('accelerometer');
                    if (!hasProx) missing.push('proximity');
                    if (!hasLight) missing.push('light');
                    let message = passed
                        ? `All core sensors detected (Gyro: ${hasGyro ? '✅' : '❌ optional'})`
                        : `Missing required: ${missing.join(', ')}`;
                    return { passed, message };
                } catch (err) {
                    return { passed: false, message: 'Failed to read sensors' };
                }
            }
        },
        display: {
            title: 'Display',
            desc: 'Check screen resolution',
            run: async () => {
                const deviceRes = await fetch(`${BACKEND_URL}/device/${currentDeviceId}`);
                let raw = await deviceRes.text();
                try { const p = JSON.parse(raw); if (typeof p === 'string') raw = p; } catch(e) {}
                const width = raw.match(/\[sys.logical.width\]:\s*\[(\d+)\]/)?.[1];
                const height = raw.match(/\[sys.logical.height\]:\s*\[(\d+)\]/)?.[1];
                const passed = width && height;
                const message = passed ? `${width} x ${height}` : 'Could not read resolution';
                return { passed, message };
            }
        },
        proximity: {
            title: 'Proximity Sensor',
            desc: 'Check if proximity sensor is present',
            run: async () => {
                const features = await getHardwareFeatures();
                const hasProx = features.some(f => f === 'android.hardware.sensor.proximity');
                if (!hasProx) {
                    return { passed: true, message: 'Not supported (no proximity sensor)' };
                }
                return { passed: true, message: 'Proximity sensor present' };
            }
        },
        gyro: {
            title: 'Gyroscope / Accelerometer',
            desc: 'Check motion sensors',
            run: async () => {
                const features = await getHardwareFeatures();
                const hasGyro = features.some(f => f === 'android.hardware.sensor.gyroscope');
                const hasAccel = features.some(f => f === 'android.hardware.sensor.accelerometer');
                if (!hasGyro && !hasAccel) {
                    return { passed: true, message: 'Not supported (no motion sensors)' };
                }
                return { passed: true, message: `Motion sensors present (Gyro: ${hasGyro}, Accel: ${hasAccel})` };
            }
        },
        gps: {
            title: 'GPS',
            desc: 'Enable GPS and check lock',
            run: async () => {
                try {
                    await runAdb('settings put secure location_mode 3');
                    await new Promise(r => setTimeout(r, 1000));
                    const mode = await runAdb('settings get secure location_mode');
                    const enabled = mode.trim() === '3';
                    if (!enabled) {
                        return { passed: false, message: 'GPS could not be enabled' };
                    }
                    const dump = await runAdb('dumpsys location');
                    const hasFix = dump.includes('mLocation') && dump.includes('latitude') && !dump.includes('mLocation=null');
                    const passed = hasFix;
                    const message = hasFix ? 'GPS locked successfully' : 'GPS enabled but no fix (move outdoors)';
                    return { passed, message };
                } catch (e) {
                    return { passed: false, message: 'Failed to check GPS: ' + e.message };
                }
            }
        },
        fingerprint: {
            title: 'Fingerprint',
            desc: 'Check fingerprint hardware',
            run: async () => {
                const features = await getHardwareFeatures();
                const hasFingerprint = features.some(f => f === 'android.hardware.fingerprint');
                return { passed: true, message: hasFingerprint ? 'Fingerprint hardware present' : 'Not supported (no fingerprint sensor)' };
            }
        },
        nfc: {
            title: 'NFC',
            desc: 'Check NFC hardware',
            run: async () => {
                const features = await getHardwareFeatures();
                const hasNfc = features.some(f => f === 'android.hardware.nfc');
                return { passed: true, message: hasNfc ? 'NFC hardware present' : 'Not supported (no NFC)' };
            }
        },
        microphone: {
            title: 'Microphone',
            desc: 'Record and playback test',
            run: async () => {
                await launchTestRunner('microphone');
                showModal('Microphone Test', `
                    <p>🎤 The phone is recording and then playing back your voice.</p>
                    <p>After the recording, the sound will loop.</p>
                    <p><strong>Did you hear your voice clearly?</strong></p>
                `);
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? 'User confirmed microphone working' : 'Microphone issue reported';
                return { passed, message };
            }
        },
        vibration: {
            title: 'Vibration',
            desc: 'Test vibration motor',
            run: async () => {
                try { await runAdb('cmd vibrator_manager synced oneshot 500'); } catch(e) {}
                showModal('Vibration Test', `
                    <p>📳 The phone should vibrate for a moment.</p>
                    <p><strong>Did you feel the vibration?</strong></p>
                `);
                const result = await waitForUserConfirmation();
                closeModal();
                const passed = (result === 'yes');
                const message = passed ? 'User confirmed vibration' : 'Vibration issue reported';
                return { passed, message };
            }
        },
        flashlight: {
            title: 'Flashlight',
            desc: 'Test rear flashlight',
            run: async () => {
                await launchTestRunner('flash');
                showModal('Flashlight Test', `
                    <p>🔦 The rear flashlight should turn on briefly.</p>
                    <p><strong>Did you see the light?</strong></p>
                `);
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? 'User confirmed flashlight' : 'Flashlight issue reported';
                return { passed, message };
            }
        },
        speaker: {
            title: 'Speaker',
            desc: 'Play test tone',
            run: async () => {
                await launchTestRunner('sound');
                showModal('Speaker Test', `
                    <p>🔊 The phone should play a short test tone at medium volume.</p>
                    <p><strong>Did you hear the sound clearly?</strong></p>
                `);
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? 'User confirmed speaker' : 'Speaker issue reported';
                return { passed, message };
            }
        },
        headphone: {
            title: 'Headphone',
            desc: 'Test headphone audio',
            run: async () => {
                await launchTestRunner('headphone');
                showModal('Headphone Test', `
                    <p>🎧 Please plug in headphones.</p>
                    <p>The phone will play a sound through the headphones.</p>
                    <p><strong>Did you hear the sound clearly?</strong></p>
                `);
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? 'User confirmed headphone working' : 'Headphone issue reported';
                return { passed, message };
            }
        },
        touch: {
            title: 'Touch Screen',
            desc: 'Draw on screen to test',
            run: async () => {
                await launchTestRunner('touch');
                showModal('Touch Screen Test', `
                    <p>📱 The phone is now in touch test mode.</p>
                    <p>Draw inside the square guide on the phone.</p>
                    <p><strong>Does the screen register your touches and draw smoothly?</strong></p>
                `);
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? 'User confirmed touch working' : 'Touch issues reported';
                return { passed, message };
            }
        },
        multitouch: {
            title: 'Multi‑touch',
            desc: 'Test 5‑point multi‑touch',
            run: async () => {
                await launchExtraHardwareTest('multitouch');
                showModal('Multi‑touch Test', `
                    <p>📱 Place 5 fingers on the screen simultaneously.</p>
                    <p>The phone will show the number of touches detected.</p>
                    <p><strong>Did it detect at least 5 fingers?</strong></p>
                `);
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? 'User confirmed 5‑point multi‑touch' : 'Multi‑touch issue reported';
                return { passed, message };
            }
        },
        buttons: {
            title: 'Physical Buttons',
            desc: 'Test Volume Up & Down',
            run: async () => {
                await launchExtraHardwareTest('buttons');
                showModal('Physical Buttons Test', `
                    <p>🔘 Press <strong>Volume Up</strong> and <strong>Volume Down</strong>.</p>
                    <p>The phone will show which buttons you pressed.</p>
                    <p><strong>Did both buttons register?</strong></p>
                `);
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? 'User confirmed both volume buttons' : 'Button issue reported';
                return { passed, message };
            }
        },
        colorsweep: {
            title: 'Screen Burn‑in / Dead Pixel',
            desc: 'Cycle through solid colors',
            run: async () => {
                await launchExtraHardwareTest('colorsweep');
                showModal('Screen Burn‑in Test', `
                    <p>🎨 The screen will cycle through solid colors (Red, Green, Blue, White, Black).</p>
                    <p>Tap the "Next" button on the phone to advance each color.</p>
                    <p><strong>Did the screen display all colors correctly without dead pixels or burn‑in?</strong></p>
                `);
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? 'User confirmed screen normal' : 'Screen issue reported';
                return { passed, message };
            }
        },
        camerafront: {
            title: 'Front Camera',
            desc: 'Check front camera + autofocus',
            run: async () => {
                const hasFrontCam = await hasFeature('android.hardware.camera.front');
                if (!hasFrontCam) {
                    return { passed: true, message: 'Not supported (no front camera hardware)' };
                }
                await launchExtraHardwareTest('camera_front');
                showModal('Front Camera Test', `
                    <p>📸 The front camera preview should appear on the phone.</p>
                    <p><strong>Is the preview clear and working?</strong></p>
                `);
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? 'User confirmed front camera working' : 'Front camera issue reported';
                return { passed, message };
            }
        },
        camerarear: {
            title: 'Rear Camera',
            desc: 'Check rear camera + autofocus',
            run: async () => {
                const hasRearCam = await hasFeature('android.hardware.camera');
                if (!hasRearCam) {
                    return { passed: true, message: 'Not supported (no rear camera hardware)' };
                }
                await launchExtraHardwareTest('camera_rear');
                showModal('Rear Camera Test', `
                    <p>📸 The rear camera preview should appear on the phone.</p>
                    <p><strong>Is the preview clear and working?</strong></p>
                `);
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? 'User confirmed rear camera working' : 'Rear camera issue reported';
                return { passed, message };
            }
        },
        magnetometer: {
            title: 'Magnetometer',
            desc: 'Test magnetic field sensor',
            run: async () => {
                const hasMag = await hasSensor('Magnetic field');
                if (!hasMag) {
                    return { passed: true, message: 'Not supported (no magnetometer)' };
                }
                await launchExtraHardwareTest('magnetometer');
                showModal('Magnetometer Test', `
                    <p>🧲 Move the phone in a figure‑8 pattern to calibrate.</p>
                    <p>The phone will show live magnetic field readings.</p>
                    <p><strong>Did the readings change as you moved the phone?</strong></p>
                `);
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? 'User confirmed magnetometer working' : 'Magnetometer issue reported';
                return { passed, message };
            }
        },
        barometer: {
            title: 'Barometer',
            desc: 'Test pressure sensor',
            run: async () => {
                const hasBaro = await hasSensor('Pressure');
                if (!hasBaro) {
                    return { passed: true, message: 'Not supported (no barometer)' };
                }
                await launchExtraHardwareTest('barometer');
                showModal('Barometer Test', `
                    <p>🌡️ The app will read pressure/altitude sensor.</p>
                    <p><strong>Did the app show a pressure reading?</strong></p>
                `);
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? 'User confirmed barometer working' : 'Barometer issue reported';
                return { passed, message };
            }
        },
        irblaster: {
            title: 'IR Blaster',
            desc: 'Detect infrared transmitter',
            run: async () => {
                const hasIr = await hasFeature('android.hardware.consumerir');
                if (!hasIr) {
                    return { passed: true, message: 'Not supported (no IR blaster)' };
                }
                await launchExtraHardwareTest('ir_blaster');
                showModal('IR Blaster Test', `
                    <p>📡 The phone will check for IR blaster hardware.</p>
                    <p><strong>Does the phone have an IR blaster?</strong></p>
                `);
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? 'User confirmed IR blaster present' : 'IR blaster issue reported';
                return { passed, message };
            }
        },
        faceunlock: {
            title: 'Face Unlock',
            desc: 'Check face recognition hardware',
            run: async () => {
                const hasFace = await hasFeature('android.hardware.biometrics.face');
                if (!hasFace) {
                    return { passed: true, message: 'Not supported (no face unlock hardware)' };
                }
                await launchExtraHardwareTest('face_unlock');
                showModal('Face Unlock Test', `
                    <p>👤 The app will check face unlock hardware and enrollment status.</p>
                    <p><strong>Does the phone support face unlock?</strong></p>
                `);
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? 'User confirmed face unlock hardware' : 'Face unlock issue reported';
                return { passed, message };
            }
        }
    };

    // ========== BUILD UI ==========
    const testIds = Object.keys(testDefs);
    let cardsHtml = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px;">`;
    for (const id of testIds) {
        const def = testDefs[id];
        cardsHtml += `
            <div class="test-card" id="card-${id}" style="background: white; padding: 16px 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); display: flex; flex-direction: column; justify-content: space-between; border-left: 4px solid #6B7280;">
                <div>
                    <h3 style="margin: 0 0 4px 0; font-size: 16px;">${def.title}</h3>
                    <p style="margin: 0 0 12px 0; color: #6B7280; font-size: 13px;">${def.desc}</p>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                    <span class="status-text" style="font-weight: 600; color: #6B7280; font-size: 14px;">⏳ Pending</span>
                    <button class="btn-secondary run-single-test" data-test="${id}" style="font-size: 12px; padding: 4px 16px;">Run</button>
                </div>
                <div class="result-message" style="font-size: 12px; color: #6B7280; margin-top: 4px; word-break: break-word; display: none;"></div>
            </div>
        `;
    }
    cardsHtml += `</div>`;

    const fullHtml = `
        <div class="info-card" style="text-align: center; margin-bottom: 24px;">
            <div class="card-header"><i class="fas fa-microscope"></i> Hardware Diagnostics</div>
            <div class="card-content">
                <p>Run individual tests below or run the full suite.</p>
                <button id="startHwTestBtn" class="btn-primary" style="font-size: 16px;">🔍 Start Full Hardware Test</button>
            </div>
        </div>
        ${cardsHtml}
        <div id="hwResults" style="display: none;">
            <div class="cards-container" id="hwCardsContainer"></div>
            <div id="hwSummaryCard" class="info-card" style="margin-top: 24px;"></div>
        </div>
    `;

    document.getElementById('pageContent').innerHTML = fullHtml;

    // ========== RESTORE SAVED RESULTS ON MOUNT ==========
    const saved = loadHardwareResults();
    if (saved && saved.results) {
        window._hardwareTestResults = saved.results;
        Object.entries(saved.results).forEach(([id, r]) => {
            const card = document.getElementById(`card-${id}`);
            if (!card) return;
            const statusSpan = card.querySelector('.status-text');
            const msgSpan = card.querySelector('.result-message');
            const btn = card.querySelector('.run-single-test');
            const color = r.passed ? '#2e7d32' : '#d32f2f';
            statusSpan.style.color = color;
            statusSpan.textContent = `${r.passed ? '✅ Passed' : '❌ Failed'}`;
            msgSpan.textContent = r.message || '';
            msgSpan.style.display = 'block';
            msgSpan.style.color = color;
            if (btn) btn.textContent = r.passed ? 'Rerun' : 'Details';
        });
        if (saved.summary) {
            const summaryDiv = document.getElementById('hwSummaryCard');
            if (summaryDiv) {
                const { total, passed, percentage } = saved.summary;
                summaryDiv.innerHTML = `
                    <div class="card-header"><i class="fas fa-clipboard-list"></i> Test Summary</div>
                    <div class="card-content">
                        <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 20px; flex-wrap: wrap;">
                            <div style="position: relative; width: 80px; height: 80px; flex-shrink: 0;">
                                <svg viewBox="0 0 36 36" style="width: 100%; height: 100%; transform: rotate(-90deg);">
                                    <circle cx="18" cy="18" r="16" fill="none" stroke="#e6e6e6" stroke-width="3"/>
                                    <circle cx="18" cy="18" r="16" fill="none" stroke="${percentage >= 80 ? '#2e7d32' : percentage >= 60 ? '#ed6c02' : '#d32f2f'}" stroke-width="3"
                                        stroke-dasharray="${percentage} 100" stroke-linecap="round"/>
                                </svg>
                                <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 16px; font-weight: bold;">${percentage}%</span>
                            </div>
                            <div>
                                <h3 style="margin: 0; font-size: 20px;">${passed}/${total} tests passed</h3>
                                <p style="margin: 4px 0 0; color: #6B7280;">${percentage === 100 ? '✅ All tests passed – device is fully functional!' : percentage >= 80 ? '⚠️ Most tests passed – minor issues may exist.' : '❌ Multiple failures – device needs attention.'}</p>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
    }

    // ========== SINGLE TEST HANDLER (with per‑test save) ==========
    document.querySelectorAll('.run-single-test').forEach(btn => {
        btn.addEventListener('click', async function() {
            const testId = this.dataset.test;
            const card = document.getElementById(`card-${testId}`);
            const statusSpan = card.querySelector('.status-text');
            const msgSpan = card.querySelector('.result-message');
            const btn = card.querySelector('.run-single-test');
            const def = testDefs[testId];
            if (!def) return;

            btn.disabled = true;
            btn.textContent = '⏳ Running...';
            statusSpan.style.color = '#f59e0b';
            statusSpan.textContent = '⏳ Running...';
            msgSpan.style.display = 'none';

            try {
                const result = await def.run();
                const passed = result.passed;
                const icon = passed ? '✅' : '❌';
                const color = passed ? '#2e7d32' : '#d32f2f';
                statusSpan.style.color = color;
                statusSpan.textContent = `${icon} ${passed ? 'Passed' : 'Failed'}`;
                msgSpan.textContent = result.message || '';
                msgSpan.style.display = 'block';
                msgSpan.style.color = color;
                btn.textContent = passed ? 'Rerun' : 'Details';

                // ---- SAVE THIS SINGLE TEST RESULT ----
                window._hardwareTestResults[testId] = { name: def.title, passed, message: result.message };
                saveHardwareResults(null); // keep existing summary
            } catch (err) {
                statusSpan.style.color = '#d32f2f';
                statusSpan.textContent = '❌ Error';
                msgSpan.textContent = err.message || '';
                msgSpan.style.display = 'block';
                msgSpan.style.color = '#d32f2f';
                btn.textContent = 'Retry';

                window._hardwareTestResults[testId] = { name: def.title, passed: false, message: err.message };
                saveHardwareResults(null);
            } finally {
                btn.disabled = false;
            }
        });
    });

    // ========== FULL SUITE HANDLER (with summary save) ==========
    document.getElementById('startHwTestBtn').addEventListener('click', async function() {
        const resultsContainer = document.getElementById('hwResults');
        resultsContainer.style.display = 'block';
        const cardsContainer = document.getElementById('hwCardsContainer');
        cardsContainer.innerHTML = '';
        const results = {};

        try {
            await launchAndroidApp();
        } catch (e) {
            alert('Companion app not installed. Some tests may fail.');
        }

        for (const id of testIds) {
            const def = testDefs[id];
            const card = document.getElementById(`card-${id}`);
            const statusSpan = card.querySelector('.status-text');
            const msgSpan = card.querySelector('.result-message');
            const btn = card.querySelector('.run-single-test');
            btn.disabled = true;
            btn.textContent = '⏳ Running...';
            statusSpan.style.color = '#f59e0b';
            statusSpan.textContent = '⏳ Running...';
            msgSpan.style.display = 'none';

            try {
                const result = await def.run();
                results[id] = { name: def.title, passed: result.passed, message: result.message };
                const passed = result.passed;
                const icon = passed ? '✅' : '❌';
                const color = passed ? '#2e7d32' : '#d32f2f';
                statusSpan.style.color = color;
                statusSpan.textContent = `${icon} ${passed ? 'Passed' : 'Failed'}`;
                msgSpan.textContent = result.message || '';
                msgSpan.style.display = 'block';
                msgSpan.style.color = color;
                btn.textContent = passed ? 'Rerun' : 'Details';
                btn.disabled = false;
            } catch (err) {
                results[id] = { name: def.title, passed: false, message: err.message };
                statusSpan.style.color = '#d32f2f';
                statusSpan.textContent = '❌ Error';
                msgSpan.textContent = err.message || '';
                msgSpan.style.display = 'block';
                msgSpan.style.color = '#d32f2f';
                btn.textContent = 'Retry';
                btn.disabled = false;
            }
            await new Promise(r => setTimeout(r, 500));
        }

        const passedCount = Object.values(results).filter(r => r.passed).length;
        const total = testIds.length;
        const percentage = Math.round((passedCount / total) * 100);

        const summaryDiv = document.getElementById('hwSummaryCard');
        summaryDiv.innerHTML = `
            <div class="card-header"><i class="fas fa-clipboard-list"></i> Test Summary</div>
            <div class="card-content">
                <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 20px; flex-wrap: wrap;">
                    <div style="position: relative; width: 80px; height: 80px; flex-shrink: 0;">
                        <svg viewBox="0 0 36 36" style="width: 100%; height: 100%; transform: rotate(-90deg);">
                            <circle cx="18" cy="18" r="16" fill="none" stroke="#e6e6e6" stroke-width="3"/>
                            <circle cx="18" cy="18" r="16" fill="none" stroke="${percentage >= 80 ? '#2e7d32' : percentage >= 60 ? '#ed6c02' : '#d32f2f'}" stroke-width="3"
                                stroke-dasharray="${percentage} 100" stroke-linecap="round"/>
                        </svg>
                        <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 16px; font-weight: bold;">${percentage}%</span>
                    </div>
                    <div>
                        <h3 style="margin: 0; font-size: 20px;">${passedCount}/${total} tests passed</h3>
                        <p style="margin: 4px 0 0; color: #6B7280;">${percentage === 100 ? '✅ All tests passed – device is fully functional!' : percentage >= 80 ? '⚠️ Most tests passed – minor issues may exist.' : '❌ Multiple failures – device needs attention.'}</p>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;">
                    ${Object.values(results).map(r => `
                        <div style="background: ${r.passed ? '#e8f5e9' : '#ffebee'}; border-radius: 8px; padding: 10px 14px; display: flex; align-items: center; gap: 10px; border-left: 4px solid ${r.passed ? '#2e7d32' : '#d32f2f'};">
                            <span style="font-size: 20px;">${r.passed ? '✅' : '❌'}</span>
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: 600; font-size: 14px;">${escapeHtml(r.name)}</div>
                                <div style="font-size: 12px; color: #555; word-break: break-word;">${escapeHtml(r.message)}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        resultsContainer.scrollIntoView({ behavior: 'smooth' });

        // ---- SAVE FULL SUITE SUMMARY ----
        const summary = { total, passed: passedCount, percentage };
        window._hardwareTestResults = results;
        saveHardwareResults(summary);
    });
}

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

// ==================== REPAIRS PAGE ====================
// ==================== REPAIRS PAGE ====================
// ==================== REPAIRS PAGE (NO‑ADB VERSION) ====================
// ==================== REPAIRS PAGE (BRAND‑SELECTION + GUIDES) ====================

// ===// ==================== REPAIRS PAGE (MODAL‑BASED BRAND SELECTION) ====================
// ==================== REPAIRS PAGE (FULLY UPDATED) ====================
async function renderRepairs() {
    const container = document.getElementById('pageContent');

    // ---- Helper: run ADB command ----
    async function runAdb(command) {
        const response = await fetch(`${BACKEND_URL}/adb-shell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: currentDeviceId, command })
        });
        if (!response.ok) throw new Error(`ADB command failed: ${response.status}`);
        const data = await response.json();
        return data.output;
    }

    // ---- Helper: run Fastboot command ----
    async function runFastboot(command) {
        try {
            const response = await fetch(`${BACKEND_URL}/fastboot-shell`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId: currentDeviceId, command })
            });
            if (!response.ok) throw new Error(`Fastboot command failed: ${response.status}`);
            const data = await response.json();
            return data.output;
        } catch (e) {
            console.warn('Fastboot not implemented in backend – falling back to manual guide.');
            return null;
        }
    }

    // ---- Helper: show result modal ----
    function showResultModal(title, message, isSuccess = true) {
        const icon = isSuccess ? '✅' : '❌';
        const color = isSuccess ? '#16a34a' : '#dc2626';
        const modalHtml = `
            <div id="resultModal" class="modal" style="display: none; z-index: 99999; background: rgba(0,0,0,0.6); backdrop-filter: blur(6px); align-items: center; justify-content: center;">
                <div class="modal-content" style="max-width: 480px; padding: 0; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden; background: white;">
                    <div style="background: ${isSuccess ? '#f0fdf4' : '#fef2f2'}; padding: 16px 24px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 28px;">${icon}</span>
                            <div>
                                <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: ${color};">${title}</h3>
                            </div>
                            <button id="resultModalClose" style="margin-left: auto; background: transparent; border: none; font-size: 24px; color: #6B7280; cursor: pointer; padding: 0 8px;">&times;</button>
                        </div>
                    </div>
                    <div style="padding: 24px;">
                        <p style="margin: 0; font-size: 14px; color: #374151; white-space: pre-wrap; word-break: break-word;">${escapeHtml(message)}</p>
                        <button id="resultModalOkBtn" class="btn-primary" style="margin-top: 16px; padding: 8px 24px; border-radius: 8px; font-weight: 500; font-size: 14px; cursor: pointer; background: ${color}; border: none; color: white;">OK</button>
                    </div>
                </div>
            </div>
        `;
        const old = document.getElementById('resultModal');
        if (old) old.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('resultModal');
        modal.style.display = 'flex';
        const close = () => modal.style.display = 'none';
        document.getElementById('resultModalClose').addEventListener('click', close);
        document.getElementById('resultModalOkBtn').addEventListener('click', close);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    }

    // ---- Helper: show confirmation modal for dangerous actions ----
    function showDangerConfirm(title, message, callback) {
        const modalHtml = `
            <div id="dangerConfirmModal" class="modal" style="display: none; z-index: 99999; background: rgba(0,0,0,0.6); backdrop-filter: blur(6px); align-items: center; justify-content: center;">
                <div class="modal-content" style="max-width: 480px; padding: 0; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden; background: white;">
                    <div style="background: #fef2f2; padding: 16px 24px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 28px;">⚠️</span>
                            <div>
                                <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #dc2626;">${title}</h3>
                            </div>
                            <button id="dangerConfirmClose" style="margin-left: auto; background: transparent; border: none; font-size: 24px; color: #6B7280; cursor: pointer; padding: 0 8px;">&times;</button>
                        </div>
                    </div>
                    <div style="padding: 24px;">
                        <p style="margin: 0 0 16px 0; font-size: 14px; color: #374151; white-space: pre-wrap;">${escapeHtml(message)}</p>
                        <div style="display: flex; gap: 12px; justify-content: flex-end;">
                            <button id="dangerConfirmCancel" class="btn-secondary" style="padding: 8px 24px; border-radius: 8px; font-weight: 500; font-size: 14px; cursor: pointer; background: #f1f3f5; border: 1px solid #e5e7eb; color: #374151;">Cancel</button>
                            <button id="dangerConfirmOk" class="btn-primary" style="padding: 8px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; background: #dc2626; border: none; color: white;">Proceed</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        const old = document.getElementById('dangerConfirmModal');
        if (old) old.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('dangerConfirmModal');
        modal.style.display = 'flex';
        const close = () => modal.style.display = 'none';
        document.getElementById('dangerConfirmClose').addEventListener('click', close);
        document.getElementById('dangerConfirmCancel').addEventListener('click', close);
        document.getElementById('dangerConfirmOk').addEventListener('click', () => {
            close();
            if (typeof callback === 'function') callback();
        });
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    }

    // ---- Detect device (for auto-brand selection in Factory Reset) ----
    async function getDeviceBrand() {
        try {
            const resp = await fetch(`${BACKEND_URL}/api/device/info/${currentDeviceId}`);
            if (!resp.ok) return null;
            const data = await resp.json();
            return data['ro.product.manufacturer'] || null;
        } catch (e) {
            console.warn('Could not fetch manufacturer:', e);
            return null;
        }
    }

    const detectedBrand = currentDeviceId ? await getDeviceBrand() : null;

    // ---- Brand logo mapping (for Factory Reset modal) ----
    const brandLogoMap = {
        'alcatel': 'Alcatel-Logo.png',
        'asus': 'Asus-Logo.png',
        'blackberry': 'Blackberry-logo.png',
        'cat': 'CAT-logo.png',
        'doogee': 'Doogee-Logo.png',
        'energizer': 'Energizer-Logo.png',
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
    const supportedBrands = Object.keys(brandLogoMap).sort();

    // ---- Reset instructions (no bold) ----
    function getResetInstructions(brand) {
        const brandLower = brand.toLowerCase();
        const instructions = {
            samsung: {
                combo: 'Volume Up + Power',
                steps: [
                    'Power off the device.',
                    'Press and hold Volume Up and Power buttons simultaneously.',
                    'When the Samsung logo appears, release the Power button but keep holding Volume Up.',
                    'Use Volume keys to navigate to "Wipe data/factory reset".',
                    'Press Power to confirm.',
                    'Select "Yes" and wait for the reset to complete.',
                    'Select "Reboot system now".'
                ],
                note: 'If you see a warning about custom OS, it is safe to proceed.'
            },
            google: {
                combo: 'Volume Down + Power',
                steps: [
                    'Power off the device.',
                    'Press and hold Volume Down and Power buttons simultaneously.',
                    'When the bootloader menu appears, use Volume keys to select "Recovery mode".',
                    'Press Power to enter Recovery.',
                    'When the Android logo with an exclamation mark appears, press Power + Volume Up briefly.',
                    'Use Volume keys to select "Wipe data/factory reset".',
                    'Press Power to confirm.',
                    'Select "Reboot system now".'
                ],
                note: 'For Pixel devices, the key combo may be Volume Down + Power, then navigate to Recovery.'
            },
            oneplus: {
                combo: 'Volume Down + Power',
                steps: [
                    'Power off the device.',
                    'Press and hold Volume Down and Power buttons simultaneously.',
                    'When the OnePlus logo appears, release the Power button but keep holding Volume Down.',
                    'Use Volume keys to select "English" (if prompted).',
                    'Select "Wipe data and cache".',
                    'Confirm by selecting "Yes".',
                    'After wipe, select "Reboot".'
                ],
                note: 'For newer OnePlus models, you may need to enter Recovery mode first (Volume Down + Power).'
            },
            xiaomi: {
                combo: 'Volume Up + Power',
                steps: [
                    'Power off the device.',
                    'Press and hold Volume Up and Power buttons simultaneously.',
                    'When the Mi logo appears, release the Power button but keep holding Volume Up.',
                    'Use Volume keys to select "Wipe data".',
                    'Press Power to confirm.',
                    'Select "Wipe all data" and confirm.',
                    'Wait for the process to complete, then select "Reboot".'
                ],
                note: 'Some Xiaomi devices may use Volume Down + Power instead.'
            },
            huawei: {
                combo: 'Volume Up + Power',
                steps: [
                    'Power off the device.',
                    'Press and hold Volume Up and Power buttons simultaneously.',
                    'When the Huawei logo appears, release the Power button but keep holding Volume Up.',
                    'Use Volume keys to select "Wipe data/factory reset".',
                    'Press Power to confirm.',
                    'Select "Reset" and wait.',
                    'Select "Reboot" when done.'
                ],
                note: 'For some Huawei models, you may need to connect a USB cable during the process.'
            },
            lg: {
                combo: 'Volume Down + Power (release and press again)',
                steps: [
                    'Power off the device.',
                    'Press and hold Volume Down and Power buttons simultaneously.',
                    'When the LG logo appears, release the Power button for a second, then press it again (while still holding Volume Down).',
                    'A factory reset menu will appear. Use Volume keys to select "Yes".',
                    'Press Power to confirm.',
                    'Select "Yes" again to confirm.',
                    'Wait for reset, then select "Reboot".'
                ],
                note: 'This method works on most LG devices.'
            },
            motorola: {
                combo: 'Volume Down + Power',
                steps: [
                    'Power off the device.',
                    'Press and hold Volume Down and Power buttons simultaneously.',
                    'When the bootloader menu appears, use Volume keys to select "Recovery mode".',
                    'Press Power to enter Recovery.',
                    'When the Android logo appears, press Volume Up for 2 seconds, then release.',
                    'Use Volume keys to select "Wipe data/factory reset".',
                    'Press Power to confirm.',
                    'Select "Reboot system now".'
                ],
                note: 'For Moto devices, the recovery menu may look different.'
            },
            unknown: {
                combo: 'Volume Up + Power (or Volume Down + Power)',
                steps: [
                    'Power off the device.',
                    'Try pressing and holding either Volume Up + Power or Volume Down + Power.',
                    'If you see a menu, navigate to "Wipe data/factory reset".',
                    'Confirm and reboot.',
                    'If neither works, search online for your specific model\'s recovery key combination.'
                ],
                note: 'We couldn\'t detect your brand automatically. Try both combinations.'
            }
        };
        return instructions[brandLower] || instructions.unknown;
    }

    // ---- Legal disclaimer modal ----
    function showLegalDisclaimer(action, callback) {
        const modalHtml = `
            <div id="legalDisclaimerModal" class="modal" style="display: none; z-index: 99999; background: rgba(0,0,0,0.6); backdrop-filter: blur(6px); align-items: center; justify-content: center;">
                <div class="modal-content acrylic" style="max-width: 480px; padding: 0; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden;">
                    <div style="background: #fef3c7; padding: 16px 24px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 28px;">⚠️</span>
                            <div>
                                <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #92400e;">Legal Disclaimer</h3>
                                <p style="margin: 2px 0 0 0; font-size: 13px; color: #78350f;">Please read before proceeding</p>
                            </div>
                            <button id="legalDisclaimerClose" style="margin-left: auto; background: transparent; border: none; font-size: 24px; color: #78350f; cursor: pointer; padding: 0 8px;">&times;</button>
                        </div>
                    </div>
                    <div style="padding: 24px 24px 20px 24px;">
                        <p style="font-size: 14px; color: #1e293b; line-height: 1.6; margin: 0 0 16px 0;">
                            This tool is intended <strong>only for legitimate device recovery</strong> by the rightful owner.
                            Unauthorized use to bypass security on devices you do not own is illegal and unethical.
                        </p>
                        <p style="font-size: 13px; color: #6B7280; margin: 0 0 20px 0;">
                            By proceeding, you confirm that you are the owner of this device or have explicit authorization from the owner.
                        </p>
                        <div style="display: flex; gap: 12px; justify-content: flex-end;">
                            <button id="legalCancelBtn" class="btn-secondary" style="padding: 8px 24px; border-radius: 8px; font-weight: 500; font-size: 14px; cursor: pointer;">Cancel</button>
                            <button id="legalAcceptBtn" class="btn-primary" style="padding: 8px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; background: #0d6efd;">I Understand</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        const old = document.getElementById('legalDisclaimerModal');
        if (old) old.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('legalDisclaimerModal');
        modal.style.display = 'flex';
        const closeModal = (accepted) => {
            modal.style.display = 'none';
            if (accepted && typeof callback === 'function') callback();
        };
        document.getElementById('legalAcceptBtn').addEventListener('click', () => closeModal(true));
        document.getElementById('legalCancelBtn').addEventListener('click', () => closeModal(false));
        document.getElementById('legalDisclaimerClose').addEventListener('click', () => closeModal(false));
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(false); });
    }

    // ---- Factory Reset Modal (guide) ----
    function showFactoryResetModal() {
        let modal = document.getElementById('factoryResetModal');
        if (!modal) {
            const modalHtml = `
                <div id="factoryResetModal" class="modal" style="display: none; z-index: 99999; background: rgba(0,0,0,0.6); backdrop-filter: blur(6px); align-items: center; justify-content: center;">
                    <div class="modal-content" style="max-width: 700px; max-height: 85vh; display: flex; flex-direction: column; padding: 0; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3); background: #ffffff;">
                        <div class="modal-header" style="padding: 16px 24px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
                            <h3 id="factoryResetModalTitle" style="margin: 0; font-size: 18px; font-weight: 600; color: #1f2937;">🗑️ Factory Reset – Select Your Brand</h3>
                            <span class="close-button" id="closeFactoryResetModal" style="cursor: pointer; font-size: 24px; color: #9ca3af; line-height: 1; padding: 0 4px;">&times;</span>
                        </div>
                        <div id="factoryResetModalBody" class="modal-body" style="flex: 1; overflow-y: auto; padding: 20px 24px; background: #ffffff;"></div>
                        <div class="modal-footer" style="padding: 12px 24px; background: #f8fafc; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; flex-shrink: 0;">
                            <button id="closeFactoryResetModalBtn" class="btn-secondary" style="padding: 8px 24px; border-radius: 8px; font-weight: 500; font-size: 14px; cursor: pointer; background: #f1f3f5; border: 1px solid #e5e7eb; color: #374151;">Close</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modal = document.getElementById('factoryResetModal');
            document.getElementById('closeFactoryResetModal').addEventListener('click', () => modal.style.display = 'none');
            document.getElementById('closeFactoryResetModalBtn').addEventListener('click', () => modal.style.display = 'none');
            window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
        }
        const bodyEl = document.getElementById('factoryResetModalBody');
        const titleEl = document.getElementById('factoryResetModalTitle');

        function showBrandGrid() {
            titleEl.textContent = '🗑️ Factory Reset – Select Your Brand';
            let html = `
                <p style="color: #6B7280; margin-bottom: 16px;">Choose your device brand to view the factory reset guide.</p>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px;">
            `;
            for (const brand of supportedBrands) {
                const logoFile = brandLogoMap[brand];
                const displayName = brand.charAt(0).toUpperCase() + brand.slice(1);
                html += `
                    <div class="brand-card" data-brand="${brand}" style="
                        background: white;
                        border: 2px solid #e5e7eb;
                        border-radius: 12px;
                        padding: 16px 8px;
                        text-align: center;
                        cursor: pointer;
                        transition: all 0.15s ease;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
                    " onmouseover="this.style.borderColor='#0d6efd'; this.style.boxShadow='0 4px 12px rgba(13,110,253,0.15)'" onmouseout="this.style.borderColor='#e5e7eb'; this.style.boxShadow='none'">
                        <img src="../android_logo/${logoFile}" alt="${displayName}" style="height: 48px; max-width: 80px; object-fit: contain; margin-bottom: 8px;">
                        <div style="font-size: 13px; font-weight: 500; color: #1f2937;">${displayName}</div>
                    </div>
                `;
            }
            html += `</div>`;
            bodyEl.innerHTML = html;
            document.querySelectorAll('.brand-card').forEach(card => {
                card.addEventListener('click', function() {
                    const brand = this.dataset.brand;
                    showGuideForBrand(brand);
                });
            });
        }

        function showGuideForBrand(brand) {
            const resetInfo = getResetInstructions(brand);
            const displayName = brand.charAt(0).toUpperCase() + brand.slice(1);
            const combo = resetInfo.combo;
            const steps = resetInfo.steps.map((s, i) => `${i+1}. ${s}`).join('<br>');
            const note = resetInfo.note || '';
            const logoFile = brandLogoMap[brand];
            let logoHtml = logoFile ? `<img src="../android_logo/${logoFile}" alt="${displayName}" style="height: 40px; max-width: 120px; object-fit: contain; margin-right: 12px;">` : '';

            titleEl.textContent = `🗑️ Factory Reset – ${displayName}`;
            bodyEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; flex-wrap:wrap;">
                    ${logoHtml}
                    <div>
                        <strong style="font-size: 18px;">${displayName}</strong>
                        <span style="font-size: 13px; color: #6B7280; margin-left: 8px;">— Factory Reset Guide</span>
                    </div>
                </div>
                <p style="margin: 4px 0 12px; font-size: 14px; color: #374151;">
                    <strong>Key combination:</strong> ${combo}
                </p>
                <div style="font-size: 14px; color: #374151; line-height: 1.8; background: #f8fafc; padding: 12px 16px; border-radius: 8px;">
                    ${steps}
                </div>
                ${note ? `<p style="margin: 12px 0 0; font-size: 13px; color: #6B7280;">ℹ️ ${note}</p>` : ''}
                <div style="margin-top: 16px; padding: 10px 14px; background: #fef3c7; border-radius: 6px; font-size: 13px; color: #92400e;">
                    ⚠️ This will erase all data and may trigger Factory Reset Protection (FRP). Have your Google account ready.
                </div>
                <div style="margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap;">
                    <button id="copyResetGuideBtn" class="btn-secondary" style="padding: 6px 18px; font-size: 13px; border-radius: 8px;">📋 Copy Instructions</button>
                    <button id="backToBrandsBtn" class="btn-secondary" style="padding: 6px 18px; font-size: 13px; border-radius: 8px;">⬅️ Back to Brands</button>
                </div>
            `;
            document.getElementById('copyResetGuideBtn')?.addEventListener('click', function() {
                const text = `Factory Reset for ${displayName}:\n\nKey combo: ${combo}\n\nSteps:\n${steps.replace(/<br>/g, '\n')}`;
                navigator.clipboard.writeText(text).then(() => {
                    this.textContent = '✅ Copied!';
                    setTimeout(() => { this.textContent = '📋 Copy Instructions'; }, 2000);
                });
            });
            document.getElementById('backToBrandsBtn')?.addEventListener('click', showBrandGrid);
        }
        showBrandGrid();
        modal.style.display = 'flex';
    }

    // ---- Get Android SDK version ----
    async function getAndroidVersion() {
        try {
            const output = await runAdb('shell getprop ro.build.version.sdk');
            const sdk = parseInt(output.trim(), 10);
            return isNaN(sdk) ? null : sdk;
        } catch { return null; }
    }

    // ---- Internal FRP deactivation with version awareness ----
    async function deactivateFrpInternal(silent = false) {
        const sdk = await getAndroidVersion();
        const version = sdk || 0;
        const result = {
            success: false,
            version: version,
            commands: []
        };

        // Pre-check: Are there any Google accounts?
        try {
            const accounts = await runAdb('shell dumpsys account');
            if (!accounts.includes('com.google')) {
                result.success = true;
                result.commands.push({ cmd: 'precheck', status: '✅ No Google accounts found; FRP already removed.' });
                return result;
            }
        } catch (e) { /* ignore */ }

        // Build command list based on SDK
        let commands = [];

        // Base commands for all versions
        const baseCommands = [
            'pm clear com.google.android.gsf',
            'pm clear com.google.android.gms',
            'content delete --uri content://settings/secure --bind name:s:frp_credential_handle',
            'content delete --uri content://settings/secure --bind name:s:frp_credential_handle_signature',
            'content delete --uri content://settings/secure --bind name:s:frp_credential_handle_signature_sha256',
            'content delete --uri content://settings/secure --bind name:s:frp_credential_handle_sha256',
            'locksettings clear --old 0',
        ];

        // Version-specific commands
        if (version >= 26 && version <= 30) { // Android 8-11
            commands.push(
                'settings delete secure frp_credential_handle',
                'settings delete global frp_credential_handle'
            );
        } else if (version >= 31 && version <= 33) { // Android 12-13
            commands.push(
                'settings delete secure frp_credential_handle',
                'settings delete global frp_credential_handle',
                'cmd account remove-account com.google'
            );
        } else if (version >= 34) { // Android 14-15
            commands.push(
                'settings delete secure frp_credential_handle',
                'settings delete global frp_credential_handle',
                'cmd account remove-account com.google',
                'dumpsys account --remove-all'
            );
        } else {
            // Fallback for older/unknown: try all known variants
            commands.push(
                'settings delete secure frp_credential_handle',
                'settings delete global frp_credential_handle',
                'content delete --uri content://settings/secure --bind name:s:frp_credential_handle',
                'content delete --uri content://settings/global --bind name:s:frp_credential_handle'
            );
        }

        // Broadcast to trigger account cleanup
        commands.push('am broadcast -a android.intent.action.USER_UNLOCKED');

        const allCommands = [...baseCommands, ...commands];
        let successCount = 0;

        for (const cmd of allCommands) {
            try {
                const output = await runAdb(`shell ${cmd}`);
                const status = (output && output.includes('Error')) ? '❌ Failed' : '✅ Succeeded';
                result.commands.push({ cmd, status });
                if (status === '✅ Succeeded') successCount++;
            } catch (e) {
                result.commands.push({ cmd, status: `❌ Error: ${e.message}` });
            }
        }

        // Final check: are there still accounts?
        try {
            const accounts = await runAdb('shell dumpsys account');
            const hasGoogle = accounts.includes('com.google');
            result.success = (!hasGoogle && successCount > 0) || (successCount > 2);
            if (!hasGoogle) {
                result.success = true;
            }
        } catch (e) {
            result.success = successCount > 0;
        }

        return result;
    }

    // ---- Public Deactivate FRP (with UI feedback) ----
    async function deactivateFrp() {
        const resultDiv = document.getElementById('frpResult');
        resultDiv.innerHTML = '⏳ Deactivating FRP... (detecting Android version)';

        const result = await deactivateFrpInternal(false);
        const version = result.version || 'unknown';
        let html = `
            <div style="margin-top:8px; padding:12px; border-radius:6px; border-left:4px solid ${result.success ? '#16a34a' : '#dc2626'}; background: ${result.success ? '#f0fdf4' : '#fef2f2'};">
                <strong>${result.success ? '✅' : '❌'} ${result.success ? 'FRP deactivated' : 'FRP deactivation incomplete'}</strong>
                <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">
                    Android SDK: ${version} &nbsp;|&nbsp; Commands attempted: ${result.commands.length}
                </p>
                <div style="margin-top:6px; max-height:200px; overflow-y:auto; font-size:12px; background:rgba(0,0,0,0.03); padding:6px; border-radius:4px;">
                    ${result.commands.map(c => `<div>${c.status} – ${c.cmd}</div>`).join('')}
                </div>
                ${result.success ? '<p style="margin:4px 0 0; font-size:12px; color:#92400e;">Reboot the device to apply changes.</p>' : '<p style="margin:4px 0 0; font-size:12px; color:#92400e;">Try the manual guide below.</p>'}
            </div>
        `;
        resultDiv.innerHTML = html;
    }

    // ---- Combined FRP deactivation + Factory Reset ----
    async function performFullResetWithFrpRemoval() {
        const resultDiv = document.getElementById('factoryResetResult');
        if (!resultDiv) {
            const card = document.querySelector('.card:has(#factoryResetModalBtn)');
            if (card) {
                const div = document.createElement('div');
                div.id = 'factoryResetResult';
                div.style.marginTop = '12px';
                div.style.fontSize = '13px';
                card.appendChild(div);
            }
        }
        const resultEl = document.getElementById('factoryResetResult');
        if (resultEl) resultEl.innerHTML = '⏳ Removing FRP and accounts...';

        const result = await deactivateFrpInternal(true);
        if (!result.success) {
            if (resultEl) {
                resultEl.innerHTML = `
                    <div style="margin-top:8px; padding:12px; background:#fef2f2; border-radius:6px; border-left:4px solid #dc2626;">
                        <strong>❌ FRP removal failed</strong>
                        <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">
                            Cannot proceed with factory reset because FRP could not be removed.
                            Please try using the "Deactivate FRP" button manually first.
                        </p>
                        <div style="margin-top:6px; max-height:150px; overflow-y:auto; font-size:12px; background:rgba(0,0,0,0.03); padding:6px; border-radius:4px;">
                            ${result.commands.map(c => `<div>${c.status} – ${c.cmd}</div>`).join('')}
                        </div>
                    </div>
                `;
            }
            return;
        }

        if (resultEl) resultEl.innerHTML = '⏳ Sending factory reset command...';

        try {
            const writeCmd = `echo '--wipe_data' > /cache/recovery/command`;
            await runAdb(`shell ${writeCmd}`);
            if (resultEl) resultEl.innerHTML = '⏳ Rebooting to recovery...';
            await runAdb('reboot recovery');
            if (resultEl) {
                resultEl.innerHTML = `
                    <div style="margin-top:8px; padding:12px; background:#f0fdf4; border-radius:6px; border-left:4px solid #16a34a;">
                        <strong>✅ FRP removed and reset triggered</strong>
                        <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">
                            The device is now rebooting into recovery mode and will perform a factory reset automatically.
                            FRP has been cleared.
                        </p>
                    </div>
                `;
            }
        } catch (err) {
            if (resultEl) {
                resultEl.innerHTML = `
                    <div style="margin-top:8px; padding:12px; background:#fef2f2; border-radius:6px; border-left:4px solid #dc2626;">
                        <strong>❌ Reset failed</strong>
                        <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">${escapeHtml(err.message)}</p>
                        <p style="margin:4px 0 0; font-size:12px; color:#92400e;">FRP was removed but reset failed. Try manual guide.</p>
                    </div>
                `;
            }
        }
    }

    // ---- ADB Factory Reset with Confirmation (captcha) ----
    function showAdbFactoryResetModal() {
        const modalId = 'adbFactoryResetModal';
        const existing = document.getElementById(modalId);
        if (existing) existing.remove();

        const modalHtml = `
            <div id="${modalId}" class="modal" style="display: none; z-index: 99999; background: rgba(0,0,0,0.7); backdrop-filter: blur(6px); align-items: center; justify-content: center;">
                <div class="modal-content" style="max-width: 480px; padding: 0; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden; background: #ffffff;">
                    <div style="background: #dc2626; padding: 16px 24px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 28px;">⚠️</span>
                            <div>
                                <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: white;">Factory Reset via ADB</h3>
                                <p style="margin: 2px 0 0 0; font-size: 13px; color: #fca5a5;">This action is irreversible</p>
                            </div>
                            <button id="adbResetModalClose" style="margin-left: auto; background: transparent; border: none; font-size: 24px; color: white; cursor: pointer; padding: 0 8px;">&times;</button>
                        </div>
                    </div>
                    <div style="padding: 24px;">
                        <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px;">
                            <p style="margin: 0; font-size: 14px; color: #991b1b; font-weight: 500;">
                                ⚠️ This will erase <strong>ALL</strong> data and <strong>automatically remove FRP</strong> before wiping.
                                You will need your Google account credentials to set up the device again.
                            </p>
                        </div>
                        <div style="background: #fef9c3; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px;">
                            <p style="margin: 0; font-size: 13px; color: #92400e;">
                                To confirm, type <strong>CONFIRM</strong> in the box below.
                            </p>
                        </div>
                        <div style="margin-bottom: 16px;">
                            <label for="confirmInput" style="font-size: 14px; font-weight: 500; color: #1f2937;">Type "CONFIRM" to proceed</label>
                            <input type="text" id="confirmInput" placeholder="CONFIRM" style="
                                width: 100%;
                                padding: 10px 12px;
                                border: 2px solid #d1d5db;
                                border-radius: 8px;
                                font-size: 14px;
                                margin-top: 4px;
                                transition: border-color 0.2s;
                            " autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false">
                            <div id="confirmError" style="color: #dc2626; font-size: 12px; margin-top: 4px; display: none;">Please type CONFIRM exactly.</div>
                        </div>
                        <div style="display: flex; gap: 12px; justify-content: flex-end;">
                            <button id="adbResetCancel" class="btn-secondary" style="padding: 8px 24px; border-radius: 8px; font-weight: 500; font-size: 14px; cursor: pointer; background: #f1f3f5; border: 1px solid #e5e7eb; color: #374151;">Cancel</button>
                            <button id="adbResetProceed" class="btn-primary" style="padding: 8px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; background: #dc2626; border: none; color: white; opacity: 0.5; pointer-events: none;">Proceed</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById(modalId);
        modal.style.display = 'flex';

        const input = document.getElementById('confirmInput');
        const proceedBtn = document.getElementById('adbResetProceed');
        const errorDiv = document.getElementById('confirmError');
        const closeModal = () => modal.style.display = 'none';

        document.getElementById('adbResetModalClose').addEventListener('click', closeModal);
        document.getElementById('adbResetCancel').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        input.addEventListener('input', function() {
            const val = this.value.trim();
            if (val.toUpperCase() === 'CONFIRM') {
                proceedBtn.style.opacity = '1';
                proceedBtn.style.pointerEvents = 'auto';
                errorDiv.style.display = 'none';
            } else {
                proceedBtn.style.opacity = '0.5';
                proceedBtn.style.pointerEvents = 'none';
                errorDiv.style.display = 'block';
                errorDiv.textContent = 'Please type CONFIRM exactly.';
            }
        });

        proceedBtn.addEventListener('click', function() {
            if (input.value.trim().toUpperCase() === 'CONFIRM') {
                closeModal();
                performFullResetWithFrpRemoval();
            }
        });
    }

    // ---- NEW: Disable Bloatware ----
    function showBloatwareModal() {
        const modalId = 'bloatwareModal';
        const existing = document.getElementById(modalId);
        if (existing) existing.remove();

        // Common bloatware packages (add more as needed)
        const packages = [
            { name: 'Facebook', pkg: 'com.facebook.katana' },
            { name: 'Facebook Messenger', pkg: 'com.facebook.orca' },
            { name: 'Instagram', pkg: 'com.instagram.android' },
            { name: 'TikTok', pkg: 'com.zhiliaoapp.musically' },
            { name: 'LinkedIn', pkg: 'com.linkedin.android' },
            { name: 'Snapchat', pkg: 'com.snapchat.android' },
            { name: 'Twitter', pkg: 'com.twitter.android' },
            { name: 'Chrome', pkg: 'com.android.chrome' },
            { name: 'Google Photos', pkg: 'com.google.android.apps.photos' },
            { name: 'Google Drive', pkg: 'com.google.android.apps.docs' },
            { name: 'YouTube', pkg: 'com.google.android.youtube' },
            { name: 'Play Movies', pkg: 'com.google.android.videos' },
            { name: 'Play Music', pkg: 'com.google.android.music' },
            { name: 'Duo', pkg: 'com.google.android.apps.tachyon' },
            { name: 'Gmail', pkg: 'com.google.android.gm' },
        ];

        let checkboxes = packages.map(p => `
            <div style="display:flex; align-items:center; gap:8px; padding:4px 0;">
                <input type="checkbox" id="pkg_${p.pkg}" value="${p.pkg}" style="width:16px; height:16px;">
                <label for="pkg_${p.pkg}" style="font-size:13px;">${p.name} <span style="color:#6B7280; font-size:11px;">(${p.pkg})</span></label>
            </div>
        `).join('');

        const modalHtml = `
            <div id="${modalId}" class="modal" style="display: none; z-index: 99999; background: rgba(0,0,0,0.6); backdrop-filter: blur(6px); align-items: center; justify-content: center;">
                <div class="modal-content" style="max-width: 480px; padding: 0; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden; background: #ffffff;">
                    <div style="background: #0d6efd; padding: 16px 24px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 28px;">📦</span>
                            <div>
                                <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: white;">Disable Bloatware</h3>
                                <p style="margin: 2px 0 0 0; font-size: 13px; color: #b0d4ff;">Select apps to disable (user‑only)</p>
                            </div>
                            <button id="bloatwareModalClose" style="margin-left: auto; background: transparent; border: none; font-size: 24px; color: white; cursor: pointer; padding: 0 8px;">&times;</button>
                        </div>
                    </div>
                    <div style="padding: 24px; max-height: 400px; overflow-y: auto;">
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            ${checkboxes}
                        </div>
                        <div style="margin-top:12px; font-size:12px; color:#6B7280;">
                            <label><input type="checkbox" id="selectAllBloatware"> Select All</label>
                        </div>
                    </div>
                    <div style="padding: 12px 24px; background: #f8fafc; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; gap: 12px;">
                        <button id="bloatwareCancel" class="btn-secondary" style="padding: 8px 24px; border-radius: 8px; font-weight: 500; font-size: 14px; cursor: pointer; background: #f1f3f5; border: 1px solid #e5e7eb; color: #374151;">Cancel</button>
                        <button id="bloatwareDisable" class="btn-primary" style="padding: 8px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; background: #dc2626; border: none; color: white;">Disable Selected</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById(modalId);
        modal.style.display = 'flex';

        const closeModal = () => modal.style.display = 'none';
        document.getElementById('bloatwareModalClose').addEventListener('click', closeModal);
        document.getElementById('bloatwareCancel').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        // Select All
        document.getElementById('selectAllBloatware').addEventListener('change', function() {
            const checkboxes = modal.querySelectorAll('input[type="checkbox"][value]');
            checkboxes.forEach(cb => cb.checked = this.checked);
        });

        // Disable
        document.getElementById('bloatwareDisable').addEventListener('click', async function() {
            const checked = modal.querySelectorAll('input[type="checkbox"][value]:checked');
            if (checked.length === 0) {
                alert('Please select at least one app to disable.');
                return;
            }
            const packages = Array.from(checked).map(cb => cb.value);
            closeModal();

            // Show progress in the result div
            const resultDiv = document.getElementById('bloatwareResult');
            resultDiv.innerHTML = '⏳ Disabling selected apps...';

            let results = [];
            for (const pkg of packages) {
                try {
                    const output = await runAdb(`shell pm disable-user --user 0 ${pkg}`);
                    const status = output.includes('new state: disabled-user') ? '✅ Disabled' : '⚠️ ' + output.trim();
                    results.push({ pkg, status });
                } catch (e) {
                    results.push({ pkg, status: '❌ Error: ' + e.message });
                }
            }

            const success = results.filter(r => r.status.includes('✅')).length;
            const html = `
                <div style="margin-top:8px; padding:12px; border-radius:6px; border-left:4px solid ${success > 0 ? '#16a34a' : '#dc2626'}; background: ${success > 0 ? '#f0fdf4' : '#fef2f2'};">
                    <strong>${success > 0 ? '✅' : '❌'} ${success > 0 ? `${success} app(s) disabled` : 'No apps disabled'}</strong>
                    <div style="margin-top:6px; max-height:200px; overflow-y:auto; font-size:12px; background:rgba(0,0,0,0.03); padding:6px; border-radius:4px;">
                        ${results.map(r => `<div>${r.status} – ${r.pkg}</div>`).join('')}
                    </div>
                </div>
            `;
            resultDiv.innerHTML = html;
        });
    }

    // ---- NEW: Clear Cache ----
    async function clearCache() {
        const resultDiv = document.getElementById('cacheResult');
        resultDiv.innerHTML = '⏳ Clearing cache...';

        try {
            // First try to trim caches (safe method)
            const output = await runAdb('shell pm trim-caches 9999999999');
            // Also clear app cache for all packages
            const apps = await runAdb('shell pm list packages');
            const packages = apps.split('\n').map(line => line.replace('package:', '').trim()).filter(Boolean);
            let cleared = 0;
            for (const pkg of packages.slice(0, 50)) { // limit to 50 to avoid timeout
                try {
                    await runAdb(`shell pm clear --cache-only ${pkg}`);
                    cleared++;
                } catch (e) { /* ignore */ }
            }
            resultDiv.innerHTML = `
                <div style="margin-top:8px; padding:12px; background:#f0fdf4; border-radius:6px; border-left:4px solid #16a34a;">
                    <strong>✅ Cache cleared</strong>
                    <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">
                        Trimmed caches and cleared cache for ${cleared} apps.
                    </p>
                </div>
            `;
        } catch (err) {
            resultDiv.innerHTML = `
                <div style="margin-top:8px; padding:12px; background:#fef2f2; border-radius:6px; border-left:4px solid #dc2626;">
                    <strong>❌ Clear cache failed</strong>
                    <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">${escapeHtml(err.message)}</p>
                    <p style="margin:4px 0 0; font-size:12px; color:#92400e;">Try using the manual guide below.</p>
                </div>
            `;
        }
    }

    // ---- NEW: Reboot to Recovery / Download ----
    async function rebootToRecovery() {
        const resultDiv = document.getElementById('rebootResult');
        resultDiv.innerHTML = '⏳ Rebooting to Recovery...';
        try {
            await runAdb('reboot recovery');
            resultDiv.innerHTML = `
                <div style="margin-top:8px; padding:12px; background:#f0fdf4; border-radius:6px; border-left:4px solid #16a34a;">
                    <strong>✅ Reboot to Recovery sent</strong>
                    <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">The device should now boot into Recovery mode.</p>
                </div>
            `;
        } catch (err) {
            resultDiv.innerHTML = `
                <div style="margin-top:8px; padding:12px; background:#fef2f2; border-radius:6px; border-left:4px solid #dc2626;">
                    <strong>❌ Failed to reboot</strong>
                    <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">${escapeHtml(err.message)}</p>
                </div>
            `;
        }
    }

    async function rebootToDownload() {
        const resultDiv = document.getElementById('rebootResult');
        resultDiv.innerHTML = '⏳ Rebooting to Download mode...';
        try {
            await runAdb('reboot download');
            resultDiv.innerHTML = `
                <div style="margin-top:8px; padding:12px; background:#f0fdf4; border-radius:6px; border-left:4px solid #16a34a;">
                    <strong>✅ Reboot to Download sent</strong>
                    <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">The device should now boot into Download mode (Samsung).</p>
                </div>
            `;
        } catch (err) {
            resultDiv.innerHTML = `
                <div style="margin-top:8px; padding:12px; background:#fef2f2; border-radius:6px; border-left:4px solid #dc2626;">
                    <strong>❌ Failed to reboot</strong>
                    <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">${escapeHtml(err.message)}</p>
                </div>
            `;
        }
    }

    // ---- Build main UI ----
    let deviceCheckHtml = '';
    if (!currentDeviceId) {
        deviceCheckHtml = `
            <div style="margin-bottom:16px; padding:12px 16px; background:#fef3c7; border-radius:8px; border-left:4px solid #f59e0b; font-size:13px; color:#92400e;">
                ⚠️ No device connected. Some features require ADB, but guides are always available.
            </div>
        `;
    }

    const html = `
        <div style="margin-bottom:24px;">
            <h1 style="margin-bottom:6px; font-size:24px; font-weight:700; color:#1f2937;">🔧 Repair Tools</h1>
            <p style="color:#6b7280; font-size:14px; margin:0;">Recovery and maintenance operations – practical guides & automation.</p>
            <div style="margin-top:8px; padding:8px 12px; background:#fef3c7; border-radius:6px; border-left:4px solid #f59e0b; font-size:13px; color:#92400e;">
                ⚠️ These actions can erase data or void warranties. Proceed with caution.
            </div>
            ${deviceCheckHtml}
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">

            <!-- FRP Card -->
            <div class="card" style="padding:20px;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <span style="font-size:28px;">🚫</span>
                    <h3 style="margin:0; font-size:17px; font-weight:600;">FRP Bypass</h3>
                </div>
                <p style="color:#6B7280; font-size:14px;">Remove Google accounts and deactivate Factory Reset Protection.</p>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <button id="frpDeactivateBtn" class="btn-primary" style="width:100%; padding:6px; border-radius:8px; font-size:13px; background:#dc2626;" ${!currentDeviceId ? 'disabled style="opacity:0.5;"' : ''}>
                        🔓 Deactivate FRP <span style="font-size:11px; color:${!currentDeviceId ? '#fca5a5' : '#fca5a5'};">(ADB required)</span>
                    </button>
                    <button id="frpGuideBtn" class="btn-secondary" style="width:100%; padding:6px; border-radius:8px; font-size:13px;">
                        📋 Guide (no ADB) <span style="font-size:11px; color:#6B7280;">(no ADB)</span>
                    </button>
                </div>
                <div id="frpResult" style="margin-top:8px; font-size:13px;"></div>
            </div>

            <!-- Retrieve Email Card -->
            <div class="card" style="padding:20px;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <span style="font-size:28px;">📧</span>
                    <h3 style="margin:0; font-size:17px; font-weight:600;">Retrieve Email</h3>
                </div>
                <p style="color:#6B7280; font-size:14px;">Recover Google account email – use web guide or ADB retrieval.</p>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <button id="retrieveEmailGuideBtn" class="btn-secondary" style="width:100%; padding:8px; border-radius:8px; font-size:13px;">
                        📋 Show Guide <span style="font-size:11px; color:#6B7280;">(no ADB)</span>
                    </button>
                    <button id="retrieveEmailAdbBtn" class="btn-primary" style="width:100%; padding:8px; border-radius:8px; font-size:13px; background:#0d6efd;" ${!currentDeviceId ? 'disabled style="opacity:0.5;"' : ''}>
                        🔌 Retrieve via ADB <span style="font-size:11px; color:${!currentDeviceId ? '#9ca3af' : '#b0d4ff'};">(ADB required)</span>
                    </button>
                </div>
                <div id="emailResult" style="margin-top:8px; font-size:13px;"></div>
            </div>

            <!-- Factory Reset Card -->
            <div class="card" style="padding:20px; border-left:4px solid #dc2626;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <span style="font-size:28px;">🗑️</span>
                    <h3 style="margin:0; font-size:17px; font-weight:600;">Factory Reset</h3>
                </div>
                <p style="color:#6B7280; font-size:14px;">Wipe all data – FRP will be removed automatically before reset.</p>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <button id="factoryResetModalBtn" class="btn-secondary" style="width:100%; padding:6px; border-radius:8px; font-size:13px;">
                        📋 Show Reset Guide <span style="font-size:11px; color:#6B7280;">(no ADB)</span>
                    </button>
                    <button id="adbFactoryResetBtn" class="btn-primary" style="width:100%; padding:6px; border-radius:8px; font-size:13px; background:#dc2626;" ${!currentDeviceId ? 'disabled style="opacity:0.5;"' : ''}>
                        🔧 Factory Reset via ADB <span style="font-size:11px; color:${!currentDeviceId ? '#fca5a5' : '#fca5a5'};">(ADB required)</span>
                    </button>
                </div>
                <div id="factoryResetResult" style="margin-top:8px; font-size:13px;"></div>
            </div>

            <!-- Bootloader Card -->
            <div class="card" style="padding:20px;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <span style="font-size:28px;">🔓</span>
                    <h3 style="margin:0; font-size:17px; font-weight:600;">Bootloader</h3>
                </div>
                <p style="color:#6B7280; font-size:14px;">Reboot, unlock, or lock the bootloader (wipes data).</p>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <button id="bootloaderRebootBtn" class="btn-secondary" style="width:100%; padding:6px; border-radius:8px; font-size:13px;" ${!currentDeviceId ? 'disabled style="opacity:0.5;"' : ''}>
                        📱 Reboot to Bootloader <span style="font-size:11px; color:${!currentDeviceId ? '#9ca3af' : '#6B7280'};">(ADB required)</span>
                    </button>
                    <button id="bootloaderUnlockBtn" class="btn-primary" style="width:100%; padding:6px; border-radius:8px; font-size:13px; background:#dc2626;" ${!currentDeviceId ? 'disabled style="opacity:0.5;"' : ''}>
                        🔓 Unlock Bootloader <span style="font-size:11px; color:${!currentDeviceId ? '#fca5a5' : '#fca5a5'};">(ADB required)</span>
                    </button>
                    <button id="bootloaderLockBtn" class="btn-primary" style="width:100%; padding:6px; border-radius:8px; font-size:13px; background:#dc2626;" ${!currentDeviceId ? 'disabled style="opacity:0.5;"' : ''}>
                        🔒 Lock Bootloader <span style="font-size:11px; color:${!currentDeviceId ? '#fca5a5' : '#fca5a5'};">(ADB required)</span>
                    </button>
                    <button id="bootloaderCommandsBtn" class="btn-secondary" style="width:100%; padding:6px; border-radius:8px; font-size:13px;">
                        📋 Commands Guide <span style="font-size:11px; color:#6B7280;">(no ADB)</span>
                    </button>
                </div>
                <div id="bootloaderResult" style="margin-top:8px; font-size:13px;"></div>
            </div>

            <!-- NEW: Disable Bloatware Card -->
            <div class="card" style="padding:20px;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <span style="font-size:28px;">📦</span>
                    <h3 style="margin:0; font-size:17px; font-weight:600;">Disable Bloatware</h3>
                </div>
                <p style="color:#6B7280; font-size:14px;">Disable pre‑installed system apps (user‑only).</p>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <button id="bloatwareModalBtn" class="btn-primary" style="width:100%; padding:6px; border-radius:8px; font-size:13px; background:#0d6efd;" ${!currentDeviceId ? 'disabled style="opacity:0.5;"' : ''}>
                        📦 Select Apps to Disable <span style="font-size:11px; color:${!currentDeviceId ? '#9ca3af' : '#b0d4ff'};">(ADB required)</span>
                    </button>
                    <button id="bloatwareGuideBtn" class="btn-secondary" style="width:100%; padding:6px; border-radius:8px; font-size:13px;">
                        📋 Guide (no ADB) <span style="font-size:11px; color:#6B7280;">(no ADB)</span>
                    </button>
                </div>
                <div id="bloatwareResult" style="margin-top:8px; font-size:13px;"></div>
            </div>

            <!-- NEW: Clear Cache Card -->
            <div class="card" style="padding:20px;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <span style="font-size:28px;">🧹</span>
                    <h3 style="margin:0; font-size:17px; font-weight:600;">Clear Cache</h3>
                </div>
                <p style="color:#6B7280; font-size:14px;">Clear app cache and temporary files.</p>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <button id="clearCacheBtn" class="btn-primary" style="width:100%; padding:6px; border-radius:8px; font-size:13px; background:#0d6efd;" ${!currentDeviceId ? 'disabled style="opacity:0.5;"' : ''}>
                        🧹 Clear Cache <span style="font-size:11px; color:${!currentDeviceId ? '#9ca3af' : '#b0d4ff'};">(ADB required)</span>
                    </button>
                    <button id="cacheGuideBtn" class="btn-secondary" style="width:100%; padding:6px; border-radius:8px; font-size:13px;">
                        📋 Guide (no ADB) <span style="font-size:11px; color:#6B7280;">(no ADB)</span>
                    </button>
                </div>
                <div id="cacheResult" style="margin-top:8px; font-size:13px;"></div>
            </div>

            <!-- NEW: Reboot Modes Card -->
            <div class="card" style="padding:20px;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <span style="font-size:28px;">📱</span>
                    <h3 style="margin:0; font-size:17px; font-weight:600;">Reboot Modes</h3>
                </div>
                <p style="color:#6B7280; font-size:14px;">Reboot to Recovery or Download mode.</p>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <button id="rebootRecoveryBtn" class="btn-primary" style="width:100%; padding:6px; border-radius:8px; font-size:13px; background:#0d6efd;" ${!currentDeviceId ? 'disabled style="opacity:0.5;"' : ''}>
                        📱 Reboot to Recovery <span style="font-size:11px; color:${!currentDeviceId ? '#9ca3af' : '#b0d4ff'};">(ADB required)</span>
                    </button>
                    <button id="rebootDownloadBtn" class="btn-primary" style="width:100%; padding:6px; border-radius:8px; font-size:13px; background:#0d6efd;" ${!currentDeviceId ? 'disabled style="opacity:0.5;"' : ''}>
                        📱 Reboot to Download <span style="font-size:11px; color:${!currentDeviceId ? '#9ca3af' : '#b0d4ff'};">(ADB required)</span>
                    </button>
                    <button id="rebootGuideBtn" class="btn-secondary" style="width:100%; padding:6px; border-radius:8px; font-size:13px;">
                        📋 Guide (no ADB) <span style="font-size:11px; color:#6B7280;">(no ADB)</span>
                    </button>
                </div>
                <div id="rebootResult" style="margin-top:8px; font-size:13px;"></div>
            </div>

        </div>
    `;

    container.innerHTML = html;

    // ---- Event Listeners ----

    // ---- FRP Deactivate ----
    document.getElementById('frpDeactivateBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Deactivate FRP', () => {
            showDangerConfirm(
                '⚠️ Remove All Google Accounts & FRP',
                'This will remove all Google accounts and FRP locks from this device.\n\n' +
                'This action is irreversible. You will not be able to restore account information without re-entering credentials.\n\n' +
                'Do you want to proceed?',
                () => {
                    deactivateFrp();
                }
            );
        });
    });

    // ---- FRP Guide ----
    document.getElementById('frpGuideBtn').addEventListener('click', function() {
        const resultDiv = document.getElementById('frpResult');
        const isOpen = resultDiv.querySelector('.guide-close-btn') !== null;
        if (isOpen) {
            resultDiv.innerHTML = '';
            return;
        }
        resultDiv.innerHTML = `
            <div style="position:relative; margin-top:8px; padding:12px; background:#f0f9ff; border-radius:6px; border-left:4px solid #0ea5e9;">
                <button class="guide-close-btn" style="position:absolute; top:4px; right:8px; background:transparent; border:none; font-size:20px; color:#6B7280; cursor:pointer;" title="Close guide">&times;</button>
                <strong>📋 FRP Bypass Guide (no ADB)</strong>
                <p style="margin:6px 0 0; font-size:13px;">
                    If USB Debugging is not available, try these methods:
                </p>
                <ul style="font-size:13px; color:#374151; margin-top:4px; padding-left:20px;">
                    <li><strong>Method 1:</strong> Use the <a href="https://www.google.com/android/find" target="_blank">Find My Device</a> website to remotely lock the device and reset the password.</li>
                    <li><strong>Method 2:</strong> Boot into Recovery Mode and perform a factory reset (this will erase all data).</li>
                    <li><strong>Method 3:</strong> Use third‑party tools like <a href="https://frp2026.github.io/" target="_blank">FRP2026</a> (works on some devices).</li>
                    <li><strong>Method 4:</strong> Try the Emergency Call trick: <code>*#*#4636#*#*</code> might grant access to settings.</li>
                </ul>
                <hr style="margin:12px 0; border:0; border-top:1px solid #e5e7eb;">
                <p style="margin:0; font-size:12px; color:#6B7280;">
                    💡 <strong>Note:</strong> These methods may not work on all devices. The ADB method above is more reliable.
                </p>
            </div>
        `;
        resultDiv.querySelector('.guide-close-btn').addEventListener('click', function() {
            resultDiv.innerHTML = '';
        });
    });

    // ---- Retrieve Email: Guide ----
    document.getElementById('retrieveEmailGuideBtn').addEventListener('click', function() {
        const resultDiv = document.getElementById('emailResult');
        const isOpen = resultDiv.querySelector('.guide-close-btn') !== null;
        if (isOpen) {
            resultDiv.innerHTML = '';
            return;
        }
        resultDiv.innerHTML = `
            <div style="position:relative; margin-top:8px; padding:12px; background:#f0f9ff; border-radius:6px; border-left:4px solid #0ea5e9;">
                <button class="guide-close-btn" style="position:absolute; top:4px; right:8px; background:transparent; border:none; font-size:20px; color:#6B7280; cursor:pointer;" title="Close guide">&times;</button>
                <strong>📧 Account Recovery Guide</strong>
                <p style="margin:6px 0 0; font-size:13px;">
                    Open <a href="https://accounts.google.com/signin/usernamerecovery" target="_blank">Google Account Recovery</a> on any device.
                    If you can access the phone's browser via Emergency Call or Accessibility, visit that URL directly on the phone.
                </p>
                <hr style="margin:12px 0; border:0; border-top:1px solid #e5e7eb;">
                <p style="margin:0; font-size:12px; color:#6B7280;">
                    💡 <strong>Tip:</strong> On the lock screen, try swiping up and tapping "Emergency call", then enter <code>*#*#4636#*#*</code> or similar codes to access settings (varies by device).
                </p>
            </div>
        `;
        resultDiv.querySelector('.guide-close-btn').addEventListener('click', function() {
            resultDiv.innerHTML = '';
        });
    });

    // ---- Retrieve Email: ADB ----
    document.getElementById('retrieveEmailAdbBtn').addEventListener('click', async function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Retrieve Email via ADB', async () => {
            const resultDiv = document.getElementById('emailResult');
            resultDiv.innerHTML = '⏳ Retrieving accounts via ADB...';
            try {
                const output = await runAdb('dumpsys account');
                const emails = output.match(/\[([^\]]+@[^\]]+)\]/g) || [];
                const uniqueEmails = [...new Set(emails.map(e => e.replace(/[\[\]]/g, '')))];
                if (uniqueEmails.length === 0) {
                    resultDiv.innerHTML = `
                        <div style="margin-top:8px; padding:12px; background:#fef2f2; border-radius:6px; border-left:4px solid #dc2626;">
                            <strong>❌ No emails found</strong>
                            <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">No Google accounts were detected on this device.</p>
                        </div>
                    `;
                } else {
                    resultDiv.innerHTML = `
                        <div style="margin-top:8px; padding:12px; background:#f0fdf4; border-radius:6px; border-left:4px solid #16a34a;">
                            <strong>✅ Found ${uniqueEmails.length} account(s)</strong>
                            <div style="margin-top:6px; font-size:13px; color:#374151;">
                                ${uniqueEmails.map(e => `📧 ${e}`).join('<br>')}
                            </div>
                        </div>
                    `;
                }
            } catch (err) {
                resultDiv.innerHTML = `
                    <div style="margin-top:8px; padding:12px; background:#fef2f2; border-radius:6px; border-left:4px solid #dc2626;">
                        <strong>❌ ADB retrieval failed</strong>
                        <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">${escapeHtml(err.message)}</p>
                        <p style="margin:4px 0 0; font-size:12px; color:#92400e;">Make sure USB Debugging is enabled and the device is authorized.</p>
                    </div>
                `;
            }
        });
    });

    // Factory Reset: Guide
    document.getElementById('factoryResetModalBtn').addEventListener('click', function() {
        showLegalDisclaimer('Factory Reset Guide', () => {
            showFactoryResetModal();
        });
    });

    // Factory Reset: ADB
    document.getElementById('adbFactoryResetBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Factory Reset via ADB', () => {
            showAdbFactoryResetModal();
        });
    });

    // Bootloader: Reboot
    document.getElementById('bootloaderRebootBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Reboot to Bootloader', async () => {
            const resultDiv = document.getElementById('bootloaderResult');
            resultDiv.innerHTML = '⏳ Rebooting to bootloader...';
            try {
                await runAdb('reboot bootloader');
                resultDiv.innerHTML = `
                    <div style="margin-top:8px; padding:12px; background:#f0fdf4; border-radius:6px; border-left:4px solid #16a34a;">
                        <strong>✅ Reboot sent</strong>
                        <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">The device should now be in bootloader mode. Use fastboot commands for further actions.</p>
                    </div>
                `;
            } catch (err) {
                resultDiv.innerHTML = `
                    <div style="margin-top:8px; padding:12px; background:#fef2f2; border-radius:6px; border-left:4px solid #dc2626;">
                        <strong>❌ Failed to reboot</strong>
                        <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">${escapeHtml(err.message)}</p>
                        <p style="margin:4px 0 0; font-size:12px; color:#92400e;">Try manually: power off, then press Volume Down + Power to enter bootloader.</p>
                    </div>
                `;
            }
        });
    });

    // Bootloader: Unlock
    document.getElementById('bootloaderUnlockBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showDangerConfirm(
            '🔓 Unlock Bootloader',
            'This will erase ALL data on the device and may void your warranty.\n\nAre you sure you want to proceed?',
            () => {
                showLegalDisclaimer('Unlock Bootloader', async () => {
                    const resultDiv = document.getElementById('bootloaderResult');
                    resultDiv.innerHTML = '⏳ Attempting to unlock bootloader...';
                    try {
                        await runAdb('reboot bootloader').catch(() => {});
                        const output = await runFastboot('flashing unlock');
                        if (output === null) {
                            resultDiv.innerHTML = `
                                <div style="margin-top:8px; padding:12px; background:#fef3c7; border-radius:6px; border-left:4px solid #f59e0b;">
                                    <strong>⚠️ Fastboot not available</strong>
                                    <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">Please run the following command manually in terminal:</p>
                                    <pre style="background:#1e293b; color:#e2e8f0; padding:8px; border-radius:4px; font-size:12px; margin:8px 0 0;">fastboot flashing unlock</pre>
                                    <p style="margin:4px 0 0; font-size:12px; color:#92400e;">Follow the on-screen instructions on your device.</p>
                                </div>
                            `;
                        } else {
                            resultDiv.innerHTML = `
                                <div style="margin-top:8px; padding:12px; background:#f0fdf4; border-radius:6px; border-left:4px solid #16a34a;">
                                    <strong>✅ Bootloader unlocked</strong>
                                    <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">Output: ${escapeHtml(output)}</p>
                                    <p style="margin:4px 0 0; font-size:12px; color:#92400e;">The device will likely reboot and wipe all data.</p>
                                </div>
                            `;
                        }
                    } catch (err) {
                        resultDiv.innerHTML = `
                            <div style="margin-top:8px; padding:12px; background:#fef2f2; border-radius:6px; border-left:4px solid #dc2626;">
                                <strong>❌ Unlock failed</strong>
                                <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">${escapeHtml(err.message)}</p>
                                <p style="margin:4px 0 0; font-size:12px; color:#92400e;">Ensure USB Debugging and OEM unlocking are enabled, and the device is in bootloader mode.</p>
                            </div>
                        `;
                    }
                });
            }
        );
    });

    // Bootloader: Lock
    document.getElementById('bootloaderLockBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showDangerConfirm(
            '🔒 Lock Bootloader',
            'This will erase ALL data on the device and restore factory state.\n\nAre you sure you want to proceed?',
            () => {
                showLegalDisclaimer('Lock Bootloader', async () => {
                    const resultDiv = document.getElementById('bootloaderResult');
                    resultDiv.innerHTML = '⏳ Attempting to lock bootloader...';
                    try {
                        await runAdb('reboot bootloader').catch(() => {});
                        const output = await runFastboot('flashing lock');
                        if (output === null) {
                            resultDiv.innerHTML = `
                                <div style="margin-top:8px; padding:12px; background:#fef3c7; border-radius:6px; border-left:4px solid #f59e0b;">
                                    <strong>⚠️ Fastboot not available</strong>
                                    <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">Please run the following command manually in terminal:</p>
                                    <pre style="background:#1e293b; color:#e2e8f0; padding:8px; border-radius:4px; font-size:12px; margin:8px 0 0;">fastboot flashing lock</pre>
                                    <p style="margin:4px 0 0; font-size:12px; color:#92400e;">Follow the on-screen instructions on your device.</p>
                                </div>
                            `;
                        } else {
                            resultDiv.innerHTML = `
                                <div style="margin-top:8px; padding:12px; background:#f0fdf4; border-radius:6px; border-left:4px solid #16a34a;">
                                    <strong>✅ Bootloader locked</strong>
                                    <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">Output: ${escapeHtml(output)}</p>
                                    <p style="margin:4px 0 0; font-size:12px; color:#92400e;">The device will likely reboot and wipe all data.</p>
                                </div>
                            `;
                        }
                    } catch (err) {
                        resultDiv.innerHTML = `
                            <div style="margin-top:8px; padding:12px; background:#fef2f2; border-radius:6px; border-left:4px solid #dc2626;">
                                <strong>❌ Lock failed</strong>
                                <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">${escapeHtml(err.message)}</p>
                                <p style="margin:4px 0 0; font-size:12px; color:#92400e;">Ensure USB Debugging and OEM unlocking are enabled, and the device is in bootloader mode.</p>
                            </div>
                        `;
                    }
                });
            }
        );
    });

    // Bootloader: Commands Guide
    document.getElementById('bootloaderCommandsBtn').addEventListener('click', function() {
        const resultDiv = document.getElementById('bootloaderResult');
        const isOpen = resultDiv.querySelector('.guide-close-btn') !== null;
        if (isOpen) {
            resultDiv.innerHTML = '';
            return;
        }
        const commands = `
# Reboot to bootloader (if ADB available)
adb reboot bootloader

# Check fastboot connection
fastboot devices

# Unlock bootloader (wipes data)
fastboot flashing unlock   # or fastboot oem unlock

# Lock bootloader (wipes data)
fastboot flashing lock     # or fastboot oem lock
        `;
        resultDiv.innerHTML = `
            <div style="position:relative; margin-top:12px; padding:16px; background:#f0f4ff; border-radius:8px; border-left:4px solid #0d6efd;">
                <button class="guide-close-btn" style="position:absolute; top:4px; right:8px; background:transparent; border:none; font-size:20px; color:#6B7280; cursor:pointer;" title="Close guide">&times;</button>
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                    <span style="font-size:20px;">🔓</span>
                    <strong style="font-size:16px;">Bootloader Commands Guide</strong>
                </div>
                <p style="margin:4px 0 8px; font-size:13px; color:#6B7280;">
                    Unlocking the bootloader will wipe all data and may void warranty.
                    Ensure OEM unlocking is enabled in Developer Options.
                </p>
                <pre style="background:#1e293b; color:#e2e8f0; padding:12px; border-radius:6px; font-size:12px; overflow-x:auto; white-space:pre-wrap;">${commands}</pre>
                <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:8px;">
                    <button id="copyBootloaderCommands" class="btn-secondary" style="padding:4px 16px; font-size:12px;">📋 Copy Commands</button>
                </div>
                <div style="margin-top:8px; font-size:12px; color:#6B7280;">
                    <a href="https://developer.android.com/studio/command-line/adb" target="_blank">Official ADB/Fastboot documentation</a>
                </div>
            </div>
        `;
        resultDiv.querySelector('.guide-close-btn').addEventListener('click', function() {
            resultDiv.innerHTML = '';
        });
        document.getElementById('copyBootloaderCommands')?.addEventListener('click', function() {
            navigator.clipboard.writeText(commands).then(() => {
                this.textContent = '✅ Copied!';
                setTimeout(() => { this.textContent = '📋 Copy Commands'; }, 2000);
            });
        });
    });

    // ---- NEW: Disable Bloatware Modal ----
    document.getElementById('bloatwareModalBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Disable Bloatware', () => {
            showBloatwareModal();
        });
    });

    // ---- NEW: Bloatware Guide (toggle) ----
    document.getElementById('bloatwareGuideBtn').addEventListener('click', function() {
        const resultDiv = document.getElementById('bloatwareResult');
        const isOpen = resultDiv.querySelector('.guide-close-btn') !== null;
        if (isOpen) {
            resultDiv.innerHTML = '';
            return;
        }
        resultDiv.innerHTML = `
            <div style="position:relative; margin-top:8px; padding:12px; background:#f0f9ff; border-radius:6px; border-left:4px solid #0ea5e9;">
                <button class="guide-close-btn" style="position:absolute; top:4px; right:8px; background:transparent; border:none; font-size:20px; color:#6B7280; cursor:pointer;" title="Close guide">&times;</button>
                <strong>📋 Disable Bloatware Guide (no ADB)</strong>
                <p style="margin:6px 0 0; font-size:13px;">
                    To disable bloatware without ADB:
                </p>
                <ol style="font-size:13px; color:#374151; margin-top:4px; padding-left:20px;">
                    <li>Go to <strong>Settings → Apps</strong> (or Apps & Notifications).</li>
                    <li>Select the app you want to disable.</li>
                    <li>Tap <strong>Disable</strong> (if available).</li>
                    <li>If "Disable" is greyed out, tap <strong>Force Stop</strong> and then try again.</li>
                    <li>For system apps that cannot be disabled, you may need to use ADB or third‑party tools.</li>
                </ol>
                <hr style="margin:12px 0; border:0; border-top:1px solid #e5e7eb;">
                <p style="margin:0; font-size:12px; color:#6B7280;">
                    💡 <strong>Note:</strong> Some apps may not be disabled without ADB. The ADB method above is more flexible.
                </p>
            </div>
        `;
        resultDiv.querySelector('.guide-close-btn').addEventListener('click', function() {
            resultDiv.innerHTML = '';
        });
    });

    // ---- NEW: Clear Cache ----
    document.getElementById('clearCacheBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Clear Cache', () => {
            clearCache();
        });
    });

    // ---- NEW: Cache Guide (toggle) ----
    document.getElementById('cacheGuideBtn').addEventListener('click', function() {
        const resultDiv = document.getElementById('cacheResult');
        const isOpen = resultDiv.querySelector('.guide-close-btn') !== null;
        if (isOpen) {
            resultDiv.innerHTML = '';
            return;
        }
        resultDiv.innerHTML = `
            <div style="position:relative; margin-top:8px; padding:12px; background:#f0f9ff; border-radius:6px; border-left:4px solid #0ea5e9;">
                <button class="guide-close-btn" style="position:absolute; top:4px; right:8px; background:transparent; border:none; font-size:20px; color:#6B7280; cursor:pointer;" title="Close guide">&times;</button>
                <strong>📋 Clear Cache Guide (no ADB)</strong>
                <p style="margin:6px 0 0; font-size:13px;">
                    To clear cache without ADB:
                </p>
                <ol style="font-size:13px; color:#374151; margin-top:4px; padding-left:20px;">
                    <li>Go to <strong>Settings → Storage</strong>.</li>
                    <li>Tap <strong>Cache data</strong> (or "Clear cache").</li>
                    <li>Alternatively, go to <strong>Settings → Apps</strong>, select each app, and tap <strong>Clear cache</strong>.</li>
                    <li>For a deeper clean, boot into Recovery Mode and select <strong>Wipe cache partition</strong>.</li>
                </ol>
                <hr style="margin:12px 0; border:0; border-top:1px solid #e5e7eb;">
                <p style="margin:0; font-size:12px; color:#6B7280;">
                    💡 <strong>Note:</strong> The ADB method above can clear cache for all apps at once.
                </p>
            </div>
        `;
        resultDiv.querySelector('.guide-close-btn').addEventListener('click', function() {
            resultDiv.innerHTML = '';
        });
    });

    // ---- NEW: Reboot Modes ----
    document.getElementById('rebootRecoveryBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Reboot to Recovery', () => {
            rebootToRecovery();
        });
    });

    document.getElementById('rebootDownloadBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Reboot to Download', () => {
            rebootToDownload();
        });
    });

    // ---- NEW: Reboot Guide (toggle) ----
    document.getElementById('rebootGuideBtn').addEventListener('click', function() {
        const resultDiv = document.getElementById('rebootResult');
        const isOpen = resultDiv.querySelector('.guide-close-btn') !== null;
        if (isOpen) {
            resultDiv.innerHTML = '';
            return;
        }
        // Brand-specific recovery/downoad key combos
        const recoveryCombos = {
            'Samsung': 'Volume Up + Power',
            'Google': 'Volume Down + Power (then select Recovery)',
            'OnePlus': 'Volume Down + Power',
            'Xiaomi': 'Volume Up + Power',
            'Huawei': 'Volume Up + Power',
            'LG': 'Volume Down + Power (release and press again)',
            'Motorola': 'Volume Down + Power (then select Recovery)',
            'generic': 'Volume Up + Power (or Volume Down + Power)'
        };

        let brand = detectedBrand ? detectedBrand.charAt(0).toUpperCase() + detectedBrand.slice(1) : 'Unknown';
        let combo = recoveryCombos[brand] || recoveryCombos.generic;

        resultDiv.innerHTML = `
            <div style="position:relative; margin-top:8px; padding:12px; background:#f0f9ff; border-radius:6px; border-left:4px solid #0ea5e9;">
                <button class="guide-close-btn" style="position:absolute; top:4px; right:8px; background:transparent; border:none; font-size:20px; color:#6B7280; cursor:pointer;" title="Close guide">&times;</button>
                <strong>📋 Reboot Guide (no ADB)</strong>
                <p style="margin:6px 0 0; font-size:13px;">
                    To enter <strong>Recovery Mode</strong> or <strong>Download Mode</strong> without ADB:
                </p>
                <ul style="font-size:13px; color:#374151; margin-top:4px; padding-left:20px;">
                    <li><strong>Power off</strong> the device.</li>
                    <li>Press and hold <strong>${combo}</strong> simultaneously.</li>
                    <li>For Recovery, release when the logo appears and use volume keys to navigate.</li>
                    <li>For Download (Samsung), press Volume Up when prompted.</li>
                    <li>If the combo doesn't work, search online for your specific model.</li>
                </ul>
                <hr style="margin:12px 0; border:0; border-top:1px solid #e5e7eb;">
                <p style="margin:0; font-size:12px; color:#6B7280;">
                    💡 <strong>Detected brand:</strong> ${brand} &nbsp;|&nbsp; Recommended combo: ${combo}
                </p>
            </div>
        `;
        resultDiv.querySelector('.guide-close-btn').addEventListener('click', function() {
            resultDiv.innerHTML = '';
        });
    });
}
// ==================== DEVICE INFO (with auto‑refresh) ====================
// ==================== DEVICE INFO (with auto‑refresh) ====================
// ==================== DEVICE INFO (with auto‑refresh) ====================
// ==================== DEVICE INFO (smart auto‑refresh) ====================
// ==================== DEVICE INFO (smart auto‑refresh) ====================
let deviceInfoTimer = null;
let lastDeviceInfoData = null;

async function renderDeviceInfo() {
    const container = document.getElementById('pageContent');

    if (!currentDeviceId) {
        container.innerHTML = `<div class="card">No device connected.</div>`;
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
            const volteState = get('gsm.sys.volte.state') === '1' ? 'On' : 'Off';
            const vowifiState = get('gsm.sys.vowifi.state') === '1' ? 'On' : 'Off';
            const bluetoothOn = infoData.bluetoothOn !== undefined ? infoData.bluetoothOn : false;
            const mobileDataToggle = infoData.mobileDataToggle !== undefined ? infoData.mobileDataToggle : false;
            const mobileDataConnected = infoData.mobileDataConnected !== undefined ? infoData.mobileDataConnected : false;

            // ---- Battery ----
            const batteryCapacity = infoData.batteryCapacity ? infoData.batteryCapacity + ' mAh' : 'Not available';
            const batteryHealth = infoData.batteryHealth || 'Not available';
            const batteryVoltage = infoData.batteryVoltage ? infoData.batteryVoltage + ' mV' : 'Not available';
            const batteryTemp = infoData.batteryTemperature ? infoData.batteryTemperature + '°C' : 'Not available';
            const maxChargeCurrent = infoData.maxChargingCurrent ? infoData.maxChargingCurrent + ' mA' : 'Not available';
            const maxChargeVoltage = infoData.maxChargingVoltage ? infoData.maxChargingVoltage + ' mV' : 'Not available';

            // ---- Display ----
            const refreshRate = infoData.refreshRate || 'Not available';

            // ---- Camera ----
            const camRes = (infoData.cameraResolutions && infoData.cameraResolutions.length)
                ? infoData.cameraResolutions.join(', ')
                : 'Not available';

            // ---- MACs ----
            const wifiMac = infoData.wifiMac || 'Not available';
            const btMac = infoData.btMac || 'Not available';

            // ---- Paired devices ----
            const pairedDevices = infoData.pairedDevices || [];
            const pairedCount = pairedDevices.length;
            const pairedSummary = pairedCount > 0 ? `${pairedCount} device${pairedCount > 1 ? 's' : ''} paired` : 'None';

            // ---- New fields ----
            const widevineLevel = infoData.widevineLevel || 'Not available';
            const drmSchemes = (infoData.drmSchemes && infoData.drmSchemes.length) ? infoData.drmSchemes.join(', ') : 'None';
            const storageTotal = infoData.storageTotal || '?';
            const storageUsed = infoData.storageUsed || '?';
            const storageFree = infoData.storageFree || '?';
            const storageType = infoData.storageType || 'Unknown';
            const gnss = (infoData.gnssProviders && infoData.gnssProviders.length) ? infoData.gnssProviders.join(', ') : 'Unknown';
            const hasGyroText = infoData.hasGyro ? '✅' : '❌';
            const hasMagText = infoData.hasMagnetometer ? '✅' : '❌';
            const hasBaroText = infoData.hasBarometer ? '✅' : '❌';
            const usbOtg = infoData.usbOtgSupported ? '✅ Supported' : 'Not supported';
            const localIp = infoData.localIp || 'Not connected';
            const gateway = infoData.gateway || 'Not available';
            const dns = (infoData.dnsServers && infoData.dnsServers.length) ? infoData.dnsServers.join(', ') : 'Not available';

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
            cards.push(makeCard('Device Overview', 'fas fa-info-circle', [
                { label: 'Model', value: get('ro.product.model', 'Unknown') },
                { label: 'Manufacturer', value: get('ro.product.manufacturer', 'Unknown') },
                { label: 'Android', value: `${get('ro.build.version.release')} (SDK ${get('ro.build.version.sdk')})` },
                { label: 'Security Patch', value: get('ro.build.version.security_patch') },
                { label: 'Board / CPU', value: `${get('ro.product.board')} / ${get('ro.product.cpu.abi')}` },
                { label: 'Serial', value: get('ro.serialno') },
                { label: 'Display', value: `${get('sys.logical.width', '?')} x ${get('sys.logical.height', '?')}` }
            ]));

            // ---- Battery ----
            cards.push(makeCard('Battery', 'fas fa-battery-full', [
                { label: 'Capacity', value: batteryCapacity },
                { label: 'Health', value: batteryHealth },
                { label: 'Voltage', value: batteryVoltage },
                { label: 'Temperature', value: batteryTemp },
                { label: 'Max Charge Current', value: maxChargeCurrent },
                { label: 'Max Charge Voltage', value: maxChargeVoltage }
            ]));

            // ---- Display ----
            cards.push(makeCard('Display', 'fas fa-desktop', [
                { label: 'Refresh Rate', value: refreshRate },
                { label: 'Density', value: `${get('ro.sf.lcd_density', '?')} dpi` }
            ]));

            // ---- Camera ----
            cards.push(makeCard('Camera', 'fas fa-camera', [
                { label: 'Resolutions', value: camRes }
            ]));

            // ---- DRM & Media ----
            cards.push(makeCard('DRM & Media', 'fas fa-lock', [
                { label: 'Widevine Level', value: widevineLevel },
                { label: 'Supported DRM', value: drmSchemes }
            ]));

            // ---- Storage ----
            cards.push(makeCard('Storage', 'fas fa-hdd', [
                { label: 'Total (Data)', value: storageTotal },
                { label: 'Used', value: storageUsed },
                { label: 'Free', value: storageFree },
                { label: 'Hardware Type', value: storageType }
            ]));

            // ---- GNSS / GPS ----
            cards.push(makeCard('GNSS / GPS', 'fas fa-satellite', [
                { label: 'Satellites', value: gnss }
            ]));

            // ---- Sensors ----
            cards.push(makeCard('Sensors', 'fas fa-microchip', [
                { label: 'Gyroscope', value: hasGyroText },
                { label: 'Magnetometer', value: hasMagText },
                { label: 'Barometer', value: hasBaroText }
            ]));

            // ---- USB OTG ----
            cards.push(makeCard('USB OTG', 'fas fa-usb', [
                { label: 'Host Mode', value: usbOtg }
            ]));

            // ---- Network Details ----
            cards.push(makeCard('Network Details', 'fas fa-network-wired', [
                { label: 'Local IP', value: localIp },
                { label: 'Gateway', value: gateway },
                { label: 'DNS Servers', value: dns }
            ]));

            // ---- Bluetooth ----
            let pairedExtra = '';
            if (pairedCount > 0) {
                pairedExtra = `<button class="btn-secondary" style="font-size:12px; padding:4px 12px;" onclick="showPairedDevicesModal()">📋 Show (${pairedCount})</button>`;
            }
            cards.push(makeCardWithExtra('Bluetooth', 'fab fa-bluetooth', [
                { label: 'Enabled', value: boolIcon(bluetoothOn) },
                { label: 'Adapter State', value: bluetoothOn ? 'ON' : 'OFF' },
                { label: 'Paired Devices', value: pairedSummary },
                { label: 'MAC Address', value: btMac }
            ], pairedExtra));

            // ---- WiFi ----
            let wifiItems = [];
            if (wifiData && wifiData.wifi) {
                const info = formatWifiStatus(wifiData.wifi);
                wifiItems = [
                    { label: 'SSID', value: info.ssid },
                    { label: 'Status', value: info.status },
                    { label: 'Signal', value: info.signal },
                    { label: 'Link Speed', value: info.linkSpeed },
                    { label: 'Frequency', value: info.frequency },
                    { label: 'MAC Address', value: wifiMac }
                ];
            } else {
                wifiItems = [
                    { label: 'Status', value: 'Unable to fetch WiFi info' },
                    { label: 'MAC Address', value: wifiMac }
                ];
            }
            cards.push(makeCard('WiFi', 'fas fa-wifi', wifiItems));

            // ---- Network & SIM ----
            cards.push(makeCard('Network & SIM', 'fas fa-network-wired', [
                { label: 'Operator', value: get('gsm.operator.alpha', 'Unknown') },
                { label: 'Network Type', value: get('gsm.network.type', 'Unknown') },
                { label: 'SIM State', value: get('gsm.sim.state', 'Unknown') },
                { label: 'Mobile Data (Toggle)', value: boolIcon(mobileDataToggle) },
                { label: 'Mobile Data (Connected)', value: boolIcon(mobileDataConnected) },
                { label: 'VoLTE / VoWiFi', value: `VoLTE ${volteState} / VoWiFi ${vowifiState}` }
            ]));

            // ---- System & Build ----
            cards.push(makeCard('System & Build', 'fas fa-code-branch', [
                { label: 'Fingerprint', value: get('ro.build.fingerprint', 'N/A').substring(0, 60) + '...' },
                { label: 'Build Date', value: get('ro.build.date', 'N/A') },
                { label: 'Bootloader', value: get('ro.bootloader', 'unknown') },
                { label: 'Encryption', value: get('ro.crypto.state') === 'encrypted' ? '🔒 Encrypted' : 'Unencrypted' }
            ]));

            // ---- Hardware ----
            cards.push(makeCard('Hardware', 'fas fa-microchip', [
                { label: 'SoC', value: `${get('ro.soc.model', 'N/A')} (${get('ro.board.platform', 'N/A')})` },
                { label: 'GPU', value: get('ro.hardware.egl', 'N/A') },
                { label: 'RAM', value: get('ro.boot.ddrsize', 'N/A') },
                { label: 'Display Density', value: `${get('ro.sf.lcd_density', 'N/A')} dpi` }
            ]));

            // ---- Special Features ----
            cards.push(makeCard('Special Features', 'fas fa-star', [
                { label: 'Gesture Support', value: get('ro.os_gesture_support') === '1' ? '✅' : '❌' },
                { label: 'Game Mode', value: get('ro.os_gamemode_support') === '1' ? '✅' : '❌' },
                { label: 'Face Unlock', value: get('ro.faceid.support') === '1' ? '✅' : '❌' },
                { label: 'Fingerprint Sensor', value: get('ro.fingerprint_support') === '1' ? '✅' : '❌' }
            ]));

            // ---- Security & Boot ----
            cards.push(makeCard('Security & Boot', 'fas fa-shield-alt', [
                { label: 'Verified Boot', value: get('ro.boot.verifiedbootstate', 'unknown') },
                { label: 'Bootloader Lock', value: get('ro.boot.flash.locked') === '1' ? '🔒 Locked' : '🔓 Unlocked' },
                { label: 'dm‑verity', value: get('ro.boot.veritymode', 'unknown') },
                { label: 'ADB Secure', value: get('ro.adb.secure') === '1' ? 'Yes' : 'No' }
            ]));

            const finalHtml = `<div class="cards-container">${cards.join('')}</div>`;
            container.innerHTML = finalHtml;
            window._pairedDevices = pairedDevices;

            // Update the stored hash
            lastDeviceInfoData = currentDataHash;

        } catch (err) {
            container.innerHTML = `<div class="card">Error loading device info: ${err.message}</div>`;
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
async function renderAIConclusion() {
    const container = document.getElementById('pageContent');

    // ---- Collect all available diagnostic results ----
    const availableReports = [];

    // 1. App Security Scan
    try {
        const appData = loadAppScanResults();
        if (appData && appData.suspiciousApps && appData.suspiciousApps.length > 0) {
            availableReports.push({
                id: 'app',
                name: 'App Security Scan',
                summary: `${appData.suspiciousApps.length} suspicious app(s) found`,
                data: appData,
                icon: '🛡️',
                timestamp: appData.date || appData.timestamp
            });
        }
    } catch (e) { /* ignore */ }

    // 2. Storage Analysis
    try {
        const storageData = loadStorageResults();
        if (storageData && storageData.files && storageData.files.length > 0) {
            const totalSize = storageData.files.reduce((s, f) => s + (f.bytes || 0), 0);
            availableReports.push({
                id: 'storage',
                name: 'Storage Analysis',
                summary: `${storageData.files.length} large files (${formatSize(totalSize)})`,
                data: storageData,
                icon: '💾',
                timestamp: storageData.date || storageData.timestamp
            });
        } else if (storageData) {
            availableReports.push({
                id: 'storage',
                name: 'Storage Analysis',
                summary: 'No large files (>500MB) found',
                data: storageData,
                icon: '💾',
                timestamp: storageData.date || storageData.timestamp
            });
        }
    } catch (e) { /* ignore */ }

    // 3. Hardware Tests
    try {
        const hwData = loadHardwareResults();
        if (hwData && hwData.results) {
            const total = Object.keys(hwData.results).length;
            const passed = Object.values(hwData.results).filter(r => r.passed).length;
            availableReports.push({
                id: 'hardware',
                name: 'Hardware Tests',
                summary: `${passed}/${total} tests passed`,
                data: hwData,
                icon: '🔬',
                timestamp: hwData.date || hwData.timestamp
            });
        }
    } catch (e) { /* ignore */ }

    // 4. Connection Troubleshoot
    try {
        const connData = loadConnectionResults();
        if (connData && connData.results) {
            const total = Object.keys(connData.results).length;
            const passed = Object.values(connData.results).filter(r => r.passed).length;
            availableReports.push({
                id: 'connection',
                name: 'Connection Troubleshoot',
                summary: `${passed}/${total} services healthy`,
                data: connData,
                icon: '📶',
                timestamp: connData.date || connData.timestamp
            });
        }
    } catch (e) { /* ignore */ }

    // 5. Advanced Diagnostic
    try {
        const advData = loadAdvancedResults();
        if (advData && advData.software) {
            const total = advData.software.length;
            const passed = advData.software.filter(r => r.passed).length;
            availableReports.push({
                id: 'advanced',
                name: 'Advanced Diagnostic',
                summary: `${passed}/${total} software checks passed`,
                data: advData,
                icon: '🔍',
                timestamp: advData.date || advData.timestamp
            });
        }
    } catch (e) { /* ignore */ }

    // ---- Helper: relative time ----
    function timeAgo(iso) {
        if (!iso) return '';
        const diffMs = Date.now() - new Date(iso).getTime();
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        return `${days}d ago`;
    }

    // ---- Build the UI ----
    let reportsHtml = '';
    if (availableReports.length === 0) {
        reportsHtml = `
            <div style="text-align: center; padding: 48px 20px;">
                <div style="font-size: 44px; margin-bottom: 10px; opacity: 0.6;">📭</div>
                <h3 style="margin: 0; color: #1f2937; font-size: 17px;">No diagnostic results yet</h3>
                <p style="margin: 6px 0 20px; color: #6B7280; font-size: 14px;">Run at least one diagnostic below, then come back here for an AI‑powered analysis.</p>
                <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
                    <button onclick="navigateTo && navigateTo('hardware')" style="padding: 8px 16px; border-radius: 8px; border: 1px solid #e5e7eb; background: white; color: #374151; font-size: 13px; cursor: pointer;">🔬 Hardware Tests</button>
                    <button onclick="navigateTo && navigateTo('connection')" style="padding: 8px 16px; border-radius: 8px; border: 1px solid #e5e7eb; background: white; color: #374151; font-size: 13px; cursor: pointer;">📶 Connection Troubleshoot</button>
                    <button onclick="navigateTo && navigateTo('advanced')" style="padding: 8px 16px; border-radius: 8px; border: 1px solid #e5e7eb; background: white; color: #374151; font-size: 13px; cursor: pointer;">🔍 Advanced Diagnostics</button>
                </div>
            </div>
        `;
    } else {
        reportsHtml = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 8px;">
                <p style="color: #6B7280; font-size: 14px; margin: 0;">Select the diagnostic results you want the AI to analyze:</p>
                <div style="display: flex; gap: 6px;">
                    <button id="selectAllReportsBtn" style="padding: 5px 12px; border-radius: 7px; border: 1px solid #e5e7eb; background: white; color: #0d6efd; font-size: 12px; font-weight: 600; cursor: pointer;">Select all</button>
                    <button id="clearReportsBtn" style="padding: 5px 12px; border-radius: 7px; border: 1px solid #e5e7eb; background: white; color: #6B7280; font-size: 12px; font-weight: 600; cursor: pointer;">Clear</button>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;">
                ${availableReports.map(report => `
                    <div class="report-card"
                         data-report-id="${report.id}"
                         role="checkbox"
                         aria-checked="false"
                         tabindex="0"
                         style="
                            background: white;
                            border-radius: 12px;
                            padding: 16px;
                            border: 2px solid #e5e7eb;
                            cursor: pointer;
                            transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
                            box-shadow: 0 1px 3px rgba(0,0,0,0.06);
                            outline: none;
                        "
                        onclick="toggleReportCard(this)"
                        onkeydown="if(event.key===' '||event.key==='Enter'){event.preventDefault();toggleReportCard(this);}"
                    >
                        <div style="display: flex; align-items: flex-start; gap: 12px;">
                            <span style="font-size: 26px; line-height: 1;">${report.icon}</span>
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: 600; font-size: 14.5px; color: #1f2937;">${escapeHtml(report.name)}</div>
                                <div style="font-size: 12.5px; color: #6B7280; margin-top: 2px;">${escapeHtml(report.summary)}</div>
                                ${report.timestamp ? `<div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">${timeAgo(report.timestamp)}</div>` : ''}
                            </div>
                            <div class="report-checkbox" style="
                                width: 20px; height: 20px; border-radius: 6px;
                                border: 2px solid #d1d5db; background: white;
                                display: flex; align-items: center; justify-content: center;
                                flex-shrink: 0; transition: all 0.15s ease;
                            ">
                                <span class="checkmark" style="display: none; color: white; font-size: 13px; font-weight: 700;">✓</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <!-- ===== USER INPUT SECTION ===== -->
            <div style="margin-top: 22px;">
                <label for="aiUserInput" style="font-weight: 500; font-size: 14px; color: #1f2937; display: block; margin-bottom: 4px;">
                    📝 Describe the issue or symptoms
                </label>
                <p style="font-size: 12px; color: #6B7280; margin: 0 0 8px 0;">
                    What is the phone doing (or not doing)? The more detail you provide, the better the AI diagnosis.
                </p>
                <textarea id="aiUserInput" rows="3" style="
                    width: 100%;
                    padding: 12px 14px;
                    border-radius: 10px;
                    border: 1px solid #e5e7eb;
                    font-size: 14px;
                    font-family: inherit;
                    resize: vertical;
                    transition: border-color 0.15s ease;
                    outline: none;
                    background: white;
                " placeholder="e.g. Phone is overheating and randomly rebooting, battery drains fast, and the camera app crashes when opened."></textarea>
            </div>

            <div style="margin-top: 22px; text-align: center;">
                <button id="runAIConclusionBtn" class="btn-primary" style="padding: 12px 40px; font-size: 15px; font-weight: 600; border-radius: 12px; border: none; background: linear-gradient(135deg, #0d6efd 0%, #0b5ed7 100%); color: white; cursor: pointer; box-shadow: 0 4px 14px rgba(13,110,253,0.3);">
                    🧠 <span id="runAIConclusionBtnLabel">Analyze ${availableReports.length} report${availableReports.length !== 1 ? 's' : ''}</span>
                </button>
                <div id="runAIConclusionHint" style="font-size: 12px; color: #9ca3af; margin-top: 8px;">All reports selected by default — deselect any you don't want included.</div>
            </div>
        `;
    }

    const html = `
        <div style="margin-bottom: 24px;">
            <h1 style="margin-bottom: 6px; font-size: 24px; font-weight: 700; color: #1f2937;">🧠 AI Conclusion</h1>
            <p style="color: #6b7280; font-size: 14px; margin: 0;">Aggregate your diagnostic results and get an AI‑powered root‑cause analysis.</p>
        </div>

        <div class="card" style="padding: 24px;">
            ${reportsHtml}
        </div>

        <div id="aiResultContainer" style="margin-top: 24px; display: none;">
            <div id="aiResultCard" class="card" style="padding: 24px; border-left: 4px solid #0d6efd; position: relative;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 8px; flex-wrap: wrap;">
                    <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1f2937;">🧠 AI Analysis</h3>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span id="aiTimestamp" style="font-size: 12px; color: #9ca3af;"></span>
                        <button id="copyAiResultBtn" title="Copy analysis" style="display: none; border: 1px solid #e5e7eb; background: white; color: #6B7280; font-size: 12px; padding: 5px 10px; border-radius: 7px; cursor: pointer;">📋 Copy</button>
                    </div>
                </div>
                <div id="aiResultContent" style="line-height: 1.7; color: #374151;"></div>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // ---- Toggle report card selection ----
    window.toggleReportCard = function(card) {
        const checkmark = card.querySelector('.checkmark');
        const box = card.querySelector('.report-checkbox');
        const isSelected = checkmark.style.display === 'inline';
        checkmark.style.display = isSelected ? 'none' : 'inline';
        card.setAttribute('aria-checked', String(!isSelected));
        card.style.borderColor = isSelected ? '#e5e7eb' : '#0d6efd';
        card.style.background = isSelected ? 'white' : '#f0f7ff';
        card.style.boxShadow = isSelected ? '0 1px 3px rgba(0,0,0,0.06)' : '0 2px 8px rgba(13,110,253,0.15)';
        box.style.background = isSelected ? 'white' : '#0d6efd';
        box.style.borderColor = isSelected ? '#d1d5db' : '#0d6efd';
        updateRunButtonState();
    };

    function updateRunButtonState() {
        const btn = document.getElementById('runAIConclusionBtn');
        const label = document.getElementById('runAIConclusionBtnLabel');
        const hint = document.getElementById('runAIConclusionHint');
        if (!btn) return;
        const count = document.querySelectorAll('.report-card[aria-checked="true"]').length;
        label.textContent = count === 0 ? 'Select reports to analyze' : `Analyze ${count} report${count !== 1 ? 's' : ''}`;
        btn.style.opacity = count === 0 ? '0.5' : '1';
        btn.style.pointerEvents = count === 0 ? 'none' : 'auto';
        hint.textContent = count === 0
            ? 'Select at least one report above.'
            : `${count} of ${availableReports.length} report${availableReports.length !== 1 ? 's' : ''} selected.`;
    }

    // ---- Select all / clear ----
    const selectAllBtn = document.getElementById('selectAllReportsBtn');
    const clearBtn = document.getElementById('clearReportsBtn');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            document.querySelectorAll('.report-card[aria-checked="false"]').forEach(card => toggleReportCard(card));
        });
    }
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            document.querySelectorAll('.report-card[aria-checked="true"]').forEach(card => toggleReportCard(card));
        });
    }

    // ---- Handle AI conclusion button ----
    const runBtn = document.getElementById('runAIConclusionBtn');
    const resultContainer = document.getElementById('aiResultContainer');
    const resultCard = document.getElementById('aiResultCard');
    const resultContent = document.getElementById('aiResultContent');
    const timestampEl = document.getElementById('aiTimestamp');
    const copyBtn = document.getElementById('copyAiResultBtn');

    if (runBtn) {
        runBtn.addEventListener('click', async function() {
            const selectedCards = document.querySelectorAll('.report-card[aria-checked="true"]');
            const selectedIds = Array.from(selectedCards).map(card => card.dataset.reportId);

            if (selectedIds.length === 0) {
                return;
            }

            // Collect user input
            const userInput = document.getElementById('aiUserInput')?.value?.trim() || '';

            const payload = {
                deviceId: currentDeviceId,
                selectedReports: selectedIds,
                userInput: userInput,
                reports: availableReports
                    .filter(r => selectedIds.includes(r.id))
                    .reduce((acc, r) => {
                        acc[r.id] = r.data;
                        return acc;
                    }, {})
            };

            resultContainer.style.display = 'block';
            resultCard.style.borderLeftColor = '#0d6efd';
            resultContent.innerHTML = window.getModernSpinnerHTML('AI is analyzing your diagnostic data and symptoms...');
            timestampEl.textContent = '';
            copyBtn.style.display = 'none';
            resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

            try {
                const response = await fetch(`${BACKEND_URL}/ai-adb-conclude`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `HTTP ${response.status}`);
                }

                const data = await response.json();
                if (data.ok && data.conclusion) {
                    const c = data.conclusion;
                    let conclusionHtml = '';

                    let sevColor = '#0d6efd', sevBg = '#eff6ff', sevLabel = null;
                    if (c.confidence !== undefined && c.confidence !== null) {
                        const confPercent = (c.confidence * 100).toFixed(0);
                        if (confPercent >= 70) { sevColor = '#16a34a'; sevBg = '#f0fdf4'; sevLabel = 'High confidence'; }
                        else if (confPercent >= 40) { sevColor = '#d97706'; sevBg = '#fffbeb'; sevLabel = 'Moderate confidence'; }
                        else { sevColor = '#dc2626'; sevBg = '#fef2f2'; sevLabel = 'Low confidence'; }
                        resultCard.style.borderLeftColor = sevColor;
                    }

                    if (c.humanSummary || c.likelyCause) {
                        conclusionHtml += `
                            <div style="margin-bottom: 16px; padding: 16px; background: ${sevBg}; border-radius: 8px; border-left: 4px solid ${sevColor};">
                                <div style="display:flex; align-items:center; gap:8px; justify-content:space-between;">
                                    <div style="font-weight: 600; font-size: 16px; color: #1f2937;">📋 Conclusion</div>
                                    ${sevLabel ? `<span style="font-size:11px; font-weight:600; color:${sevColor}; background:white; padding:2px 8px; border-radius:999px; border:1px solid ${sevColor}33;">${sevLabel}</span>` : ''}
                                </div>
                                <div style="margin-top: 6px; color: #374151;">${escapeHtml(c.humanSummary || c.likelyCause || 'No clear cause identified')}</div>
                            </div>
                        `;
                    }

                    if (c.confidence !== undefined && c.confidence !== null) {
                        const confPercent = (c.confidence * 100).toFixed(0);
                        conclusionHtml += `
                            <div style="margin-bottom: 16px; display: flex; align-items: center; gap: 12px;">
                                <span style="font-size: 13px; font-weight: 500; color: #6B7280; flex-shrink:0;">Confidence</span>
                                <div style="flex: 1; max-width: 220px; background: #e5e7eb; border-radius: 10px; height: 8px; overflow: hidden;">
                                    <div style="width: ${confPercent}%; background: ${sevColor}; height: 100%; border-radius: 10px; transition: width 0.4s ease;"></div>
                                </div>
                                <span style="font-weight: 600; font-size: 13px; color: #1f2937;">${confPercent}%</span>
                            </div>
                        `;
                    }

                    if (c.actions && c.actions.length > 0) {
                        conclusionHtml += `
                            <div style="margin-bottom: 12px;">
                                <div style="font-weight: 600; font-size: 15px; color: #1f2937;">🔧 Recommended Actions</div>
                                <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #374151;">
                                    ${c.actions.map(a => `<li style="margin-bottom: 4px;">${escapeHtml(a)}</li>`).join('')}
                                </ul>
                            </div>
                        `;
                    }

                    if (c.nextStep) {
                        conclusionHtml += `
                            <div style="margin-top: 12px; padding: 12px 16px; background: #f0fdf4; border-radius: 8px; border-left: 4px solid #22c55e;">
                                <span style="font-weight: 600;">📌 Next Step:</span>
                                <span style="color: #374151;">${escapeHtml(c.nextStep)}</span>
                            </div>
                        `;
                    }

                    if (c.details) {
                        conclusionHtml += `
                            <div style="margin-top: 12px; padding: 12px 16px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #6B7280;">
                                <div style="font-weight: 600; font-size: 14px; color: #1f2937;">📊 Additional Details</div>
                                <div style="margin-top: 4px; color: #374151; white-space: pre-wrap; font-size: 13px;">${escapeHtml(c.details)}</div>
                            </div>
                        `;
                    }

                    // Show user input if provided
                    if (userInput) {
                        conclusionHtml += `
                            <div style="margin-top: 12px; padding: 12px 16px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                                <div style="font-weight: 600; font-size: 14px; color: #92400e;">📝 Your Symptom Description</div>
                                <div style="margin-top: 4px; color: #78350f; font-size: 13px;">${escapeHtml(userInput)}</div>
                            </div>
                        `;
                    }

                    resultContent.innerHTML = conclusionHtml;
                    timestampEl.textContent = `Analyzed at ${new Date().toLocaleString()}`;

                    const includedNames = selectedIds.map(id => {
                        const found = availableReports.find(r => r.id === id);
                        return found ? found.name : id;
                    });
                    resultContent.innerHTML += `
                        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af;">
                            Included: ${includedNames.join(', ')}
                        </div>
                    `;

                    copyBtn.style.display = 'inline-block';
                    copyBtn.onclick = () => {
                        const plainText = resultContent.innerText;
                        navigator.clipboard.writeText(plainText).then(() => {
                            copyBtn.textContent = '✅ Copied';
                            setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 1500);
                        });
                    };

                } else {
                    throw new Error(data.error || 'AI could not generate a conclusion.');
                }
            } catch (err) {
                resultCard.style.borderLeftColor = '#dc2626';
                resultContent.innerHTML = `
                    <div style="color: #991b1b; padding: 14px 16px; background: #fef2f2; border-radius: 8px; border-left: 4px solid #dc2626;">
                        <div style="font-weight:600; margin-bottom:4px;">❌ Something went wrong</div>
                        <div style="font-size: 13px;">${escapeHtml(err.message)}</div>
                        <button onclick="document.getElementById('runAIConclusionBtn').click()" style="margin-top:10px; border: 1px solid #fca5a5; background: white; color: #b91c1c; padding: 6px 16px; border-radius: 8px; font-size: 13px; cursor: pointer;">🔄 Retry</button>
                    </div>
                `;
            }
        });
    }

    // ---- Auto-select all reports by default ----
    document.querySelectorAll('.report-card').forEach(card => toggleReportCard(card));
}

// ==================== SETTINGS PAGE ====================
// ==================== I18N ====================
// Minimal, real translation system. Add more keys/languages as you go —
// any element with data-i18n="key" gets its text swapped automatically.
const I18N = {
    en: {
        settingsTitle: '⚙️ Settings',
        settingsSubtitle: 'Customize SmartHub to your preferences.',
        languageLabel: '🌐 Language',
        languageHint: 'UI language (translations are work in progress).',
        themeLabel: '🎨 Theme Color',
        themeHint: 'Choose a primary color for buttons and highlights.',
        adbLabel: '📂 ADB Path (optional)',
        adbHint: 'Leave empty to use ADB from system PATH.',
        refreshLabel: '⏱️ Auto‑Refresh (seconds)',
        refreshHint: 'Interval for automatic device info updates.',
        saveBtn: '💾 Save Settings',
        resetBtn: '↩️ Reset to Defaults',
        savedMsg: '✅ Settings saved successfully!',
        resetMsg: '✅ Settings reset to defaults.'
    },
    es: {
        settingsTitle: '⚙️ Configuración',
        settingsSubtitle: 'Personaliza SmartHub según tus preferencias.',
        languageLabel: '🌐 Idioma',
        languageHint: 'Idioma de la interfaz (traducciones en progreso).',
        themeLabel: '🎨 Color del Tema',
        themeHint: 'Elige un color principal para botones y resaltados.',
        adbLabel: '📂 Ruta de ADB (opcional)',
        adbHint: 'Déjalo vacío para usar ADB del PATH del sistema.',
        refreshLabel: '⏱️ Actualización Automática (segundos)',
        refreshHint: 'Intervalo para actualizar la información del dispositivo.',
        saveBtn: '💾 Guardar Configuración',
        resetBtn: '↩️ Restablecer Valores',
        savedMsg: '✅ ¡Configuración guardada con éxito!',
        resetMsg: '✅ Configuración restablecida.'
    },
    fr: {
        settingsTitle: '⚙️ Paramètres',
        settingsSubtitle: 'Personnalisez SmartHub selon vos préférences.',
        languageLabel: '🌐 Langue',
        languageHint: "Langue de l'interface (traductions en cours).",
        themeLabel: '🎨 Couleur du Thème',
        themeHint: 'Choisissez une couleur principale pour les boutons.',
        adbLabel: '📂 Chemin ADB (optionnel)',
        adbHint: "Laissez vide pour utiliser l'ADB du PATH système.",
        refreshLabel: '⏱️ Actualisation Auto (secondes)',
        refreshHint: "Intervalle de mise à jour des infos de l'appareil.",
        saveBtn: '💾 Enregistrer',
        resetBtn: '↩️ Réinitialiser',
        savedMsg: '✅ Paramètres enregistrés avec succès !',
        resetMsg: '✅ Paramètres réinitialisés.'
    },
    de: {
        settingsTitle: '⚙️ Einstellungen',
        settingsSubtitle: 'Passe SmartHub an deine Vorlieben an.',
        languageLabel: '🌐 Sprache',
        languageHint: 'UI-Sprache (Übersetzungen in Arbeit).',
        themeLabel: '🎨 Themenfarbe',
        themeHint: 'Wähle eine Hauptfarbe für Buttons und Akzente.',
        adbLabel: '📂 ADB-Pfad (optional)',
        adbHint: 'Leer lassen, um ADB aus dem System-PATH zu nutzen.',
        refreshLabel: '⏱️ Auto-Aktualisierung (Sekunden)',
        refreshHint: 'Intervall für automatische Geräteinfo-Updates.',
        saveBtn: '💾 Speichern',
        resetBtn: '↩️ Zurücksetzen',
        savedMsg: '✅ Einstellungen erfolgreich gespeichert!',
        resetMsg: '✅ Einstellungen zurückgesetzt.'
    },
    zh: {
        settingsTitle: '⚙️ 设置',
        settingsSubtitle: '根据您的喜好自定义 SmartHub。',
        languageLabel: '🌐 语言',
        languageHint: '界面语言（翻译正在进行中）。',
        themeLabel: '🎨 主题颜色',
        themeHint: '为按钮和高亮选择主色调。',
        adbLabel: '📂 ADB 路径（可选）',
        adbHint: '留空则使用系统 PATH 中的 ADB。',
        refreshLabel: '⏱️ 自动刷新（秒）',
        refreshHint: '自动更新设备信息的间隔。',
        saveBtn: '💾 保存设置',
        resetBtn: '↩️ 恢复默认',
        savedMsg: '✅ 设置已成功保存！',
        resetMsg: '✅ 设置已恢复默认。'
    },
    fil: {
        settingsTitle: '⚙️ Mga Setting',
        settingsSubtitle: 'I-customize ang SmartHub ayon sa gusto mo.',
        languageLabel: '🌐 Wika',
        languageHint: 'Wika ng UI (patuloy pang isinasalin).',
        themeLabel: '🎨 Kulay ng Tema',
        themeHint: 'Pumili ng pangunahing kulay para sa mga button at highlight.',
        adbLabel: '📂 ADB Path (opsyonal)',
        adbHint: 'Iwanang blangko para gamitin ang ADB mula sa system PATH.',
        refreshLabel: '⏱️ Auto‑Refresh (segundo)',
        refreshHint: 'Agwat ng oras para sa awtomatikong pag-update ng device info.',
        saveBtn: '💾 I-save ang mga Setting',
        resetBtn: '↩️ Ibalik sa Default',
        savedMsg: '✅ Matagumpay na na-save ang mga setting!',
        resetMsg: '✅ Naibalik sa default ang mga setting.'
    }
};

function t(key, lang) {
    lang = lang || window._activeLang || 'en';
    return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
}

// Swaps text for every element tagged data-i18n="key" currently in the DOM.
// Call this after any render that includes translated elements, and whenever
// the language changes.
function applyLanguage(lang) {
    window._activeLang = lang;
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key, lang);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.setAttribute('placeholder', t(key, lang));
    });
}

// ==================== SETTINGS PAGE ====================
function renderSettings() {
    const container = document.getElementById('pageContent');

    const settings = JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en","themeColor":"#0d6efd","adbPath":"","autoRefresh":3}');
    const lang = settings.language || 'en';

    const languageOptions = [
        { code: 'en', label: 'English' },
        { code: 'es', label: 'Español' },
        { code: 'fr', label: 'Français' },
        { code: 'de', label: 'Deutsch' },
        { code: 'zh', label: '中文' },
        { code: 'fil', label: 'Filipino' },
    ];

    const themeColors = [
        '#0d6efd', // blue
        '#6f42c1', // purple
        '#dc3545', // red
        '#28a745', // green
        '#fd7e14', // orange
        '#20c997', // teal
        '#e83e8c', // pink
        '#6610f2', // indigo
    ];

    const html = `
        <div style="margin-bottom:24px;">
            <h1 data-i18n="settingsTitle" style="margin-bottom:6px; font-size:24px; font-weight:700; color:#1f2937;">${t('settingsTitle', lang)}</h1>
            <p data-i18n="settingsSubtitle" style="color:#6b7280; font-size:14px; margin:0;">${t('settingsSubtitle', lang)}</p>
        </div>

        <div class="card" style="padding:24px;">

            <!-- Language -->
            <div style="margin-bottom:24px;">
                <label data-i18n="languageLabel" style="font-weight:600; font-size:15px; display:block; margin-bottom:6px;">${t('languageLabel', lang)}</label>
                <select id="settingsLanguage" style="padding:8px 12px; border-radius:8px; border:1px solid #e5e7eb; width:100%; max-width:280px; font-size:14px;">
                    ${languageOptions.map(opt =>
                        `<option value="${opt.code}" ${lang === opt.code ? 'selected' : ''}>${opt.label}</option>`
                    ).join('')}
                </select>
                <p data-i18n="languageHint" style="font-size:12px; color:#9ca3af; margin-top:4px;">${t('languageHint', lang)}</p>
            </div>

            <!-- Theme Color -->
            <div style="margin-bottom:24px;">
                <label data-i18n="themeLabel" style="font-weight:600; font-size:15px; display:block; margin-bottom:6px;">${t('themeLabel', lang)}</label>
                <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
                    ${themeColors.map(color => `
                        <button class="theme-color-btn" data-color="${color}" style="
                            width:36px; height:36px; border-radius:50%; border:3px solid ${settings.themeColor === color ? '#1f2937' : 'transparent'};
                            background:${color}; cursor:pointer; transition: transform 0.15s;
                        " onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'"></button>
                    `).join('')}
                    <input type="color" id="customThemeColor" value="${settings.themeColor}" style="width:40px; height:40px; border:none; padding:0; cursor:pointer; background:none;">
                </div>
                <p data-i18n="themeHint" style="font-size:12px; color:#9ca3af; margin-top:4px;">${t('themeHint', lang)}</p>
            </div>

            <!-- ADB Path -->
            <div style="margin-bottom:24px;">
                <label data-i18n="adbLabel" style="font-weight:600; font-size:15px; display:block; margin-bottom:6px;">${t('adbLabel', lang)}</label>
                <input id="settingsAdbPath" type="text" value="${settings.adbPath || ''}" placeholder="e.g. C:\\adb\\adb.exe" style="padding:8px 12px; border-radius:8px; border:1px solid #e5e7eb; width:100%; max-width:400px; font-size:14px;">
                <p data-i18n="adbHint" style="font-size:12px; color:#9ca3af; margin-top:4px;">${t('adbHint', lang)}</p>
            </div>

            <!-- Auto‑refresh interval -->
            <div style="margin-bottom:24px;">
                <label data-i18n="refreshLabel" style="font-weight:600; font-size:15px; display:block; margin-bottom:6px;">${t('refreshLabel', lang)}</label>
                <input id="settingsAutoRefresh" type="number" value="${settings.autoRefresh || 3}" min="1" max="30" style="padding:8px 12px; border-radius:8px; border:1px solid #e5e7eb; width:100%; max-width:120px; font-size:14px;">
                <p data-i18n="refreshHint" style="font-size:12px; color:#9ca3af; margin-top:4px;">${t('refreshHint', lang)}</p>
            </div>

            <!-- Reset to defaults -->
            <div style="border-top:1px solid #e5e7eb; padding-top:20px; display:flex; gap:12px; flex-wrap:wrap;">
                <button id="saveSettingsBtn" data-i18n="saveBtn" class="btn-primary" style="padding:10px 28px; font-size:14px; border-radius:10px; border:none; background:#0d6efd; color:white; cursor:pointer; font-weight:600;">${t('saveBtn', lang)}</button>
                <button id="resetSettingsBtn" data-i18n="resetBtn" class="btn-secondary" style="padding:10px 28px; font-size:14px; border-radius:10px; border:1px solid #e5e7eb; background:white; color:#374151; cursor:pointer;">${t('resetBtn', lang)}</button>
            </div>

            <!-- Feedback -->
            <div id="settingsFeedback" style="margin-top:16px; font-size:14px;"></div>
        </div>
    `;

    container.innerHTML = html;

    // Apply saved theme + language immediately so the page reflects them on load
    applyThemeColor(settings.themeColor);
    applyLanguage(lang);

    // ---- Event listeners ----

    document.querySelectorAll('.theme-color-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const color = this.dataset.color;
            document.querySelectorAll('.theme-color-btn').forEach(b => b.style.borderColor = 'transparent');
            this.style.borderColor = '#1f2937';
            document.getElementById('customThemeColor').value = color;
            applyThemeColor(color);
        });
    });

    document.getElementById('customThemeColor').addEventListener('input', function() {
        const color = this.value;
        document.querySelectorAll('.theme-color-btn').forEach(b => b.style.borderColor = 'transparent');
        applyThemeColor(color);
    });

    // Live-preview language while picking, before Save is clicked
    document.getElementById('settingsLanguage').addEventListener('change', function() {
        applyLanguage(this.value);
    });

    // Save
    document.getElementById('saveSettingsBtn').addEventListener('click', function() {
        const language = document.getElementById('settingsLanguage').value;
        const themeColor = document.getElementById('customThemeColor').value;
        const adbPath = document.getElementById('settingsAdbPath').value.trim();
        const autoRefresh = parseInt(document.getElementById('settingsAutoRefresh').value) || 3;

        const newSettings = { language, themeColor, adbPath, autoRefresh };
        localStorage.setItem('smartHubSettings', JSON.stringify(newSettings));
        applyThemeColor(themeColor);
        applyLanguage(language);

        const feedback = document.getElementById('settingsFeedback');
        feedback.innerHTML = `<span style="color:#16a34a;">${t('savedMsg', language)}</span>`;
        setTimeout(() => feedback.innerHTML = '', 3000);
    });

    // Reset
    document.getElementById('resetSettingsBtn').addEventListener('click', function() {
        const defaults = { language: 'en', themeColor: '#0d6efd', adbPath: '', autoRefresh: 3 };
        localStorage.setItem('smartHubSettings', JSON.stringify(defaults));
        renderSettings();
        applyThemeColor(defaults.themeColor);
        applyLanguage(defaults.language);
        const feedback = document.getElementById('settingsFeedback');
        feedback.innerHTML = `<span style="color:#16a34a;">${t('resetMsg', defaults.language)}</span>`;
        setTimeout(() => feedback.innerHTML = '', 3000);
    });
}

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

function applyThemeColor(color) {
    window._activeThemeColor = color;
    const darker = adjustColor(color, -20);

    document.documentElement.style.setProperty('--primary-color', color);
    document.documentElement.style.setProperty('--primary-color-dark', darker);

    sweepThemeColors(document.body, color, darker);
}

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

// Re-apply the active theme color whenever #pageContent's content changes
// (i.e. every time the user navigates to a page rendered with the default blue).
document.addEventListener('DOMContentLoaded', () => {
    const pageContent = document.getElementById('pageContent');
    if (!pageContent) return;

    const observer = new MutationObserver(() => {
        if (window._activeThemeColor && window._activeThemeColor.toLowerCase() !== DEFAULT_PRIMARY) {
            sweepThemeColors(pageContent, window._activeThemeColor, adjustColor(window._activeThemeColor, -20));
        }
        if (window._activeLang && window._activeLang !== 'en') {
            applyLanguage(window._activeLang);
        }
    });
    observer.observe(pageContent, { childList: true, subtree: true });

    // Apply whatever was saved before any page renders, in case Settings
    // wasn't the first page visited this session.
    const saved = JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en","themeColor":"#0d6efd"}');
    applyThemeColor(saved.themeColor || DEFAULT_PRIMARY);
    applyLanguage(saved.language || 'en');
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
// ==================== CONNECTION TROUBLESHOOT ====================
async function renderConnectionTroubleshoot() {
    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `<div class="card">No device connected.</div>`;
        return;
    }

    // ---- fetch with timeout so a dropped device can't hang the UI forever ----
    async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    }

    async function runAdb(command, timeoutMs = 8000) {
        const response = await fetchWithTimeout(`${BACKEND_URL}/adb-shell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: currentDeviceId, command })
        }, timeoutMs);
        if (!response.ok) throw new Error(`ADB command failed: ${response.status}`);
        const data = await response.json();
        return data.output;
    }

    // ---- Poll a radio's state instead of guessing a fixed delay ----
    // getStateFn should return true once the radio is actually ready.
    async function waitUntil(getStateFn, { intervalMs = 500, timeoutMs = 6000 } = {}) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try {
                if (await getStateFn()) return true;
            } catch { /* keep polling */ }
            await new Promise(r => setTimeout(r, intervalMs));
        }
        return false; // timed out — caller should still proceed and let diagnose report the real failure
    }

    async function isWifiEnabled() {
        const out = await runAdb('settings get global wifi_on');
        return out.trim() === '1';
    }

    async function isDataEnabled() {
        const out = await runAdb('settings get global mobile_data');
        return out.trim() === '1';
    }

    async function isBluetoothEnabled() {
        const out = await runAdb('settings get global bluetooth_on');
        return out.trim() === '1';
    }

    let isRunning = false;
    let testResults = {};
    // ---- Remember the radio state as we found it, so we can restore it after an isolation test ----
    let radioSnapshot = null;

    // ---- Load saved results from localStorage ----
    const savedData = loadConnectionResults();
    if (savedData && savedData.results) {
        testResults = savedData.results;
        window._connectionTestResults = testResults;
    }

    const testCards = [
        { id: 'wifi', title: 'WiFi', desc: 'Test WiFi connectivity', status: 'Pending' },
        { id: 'bluetooth', title: 'Bluetooth', desc: 'Test Bluetooth file transfer', status: 'Pending' },
        { id: 'mobile', title: 'Mobile Data', desc: 'Test mobile data connectivity', status: 'Pending' },
    ];

    let cardsHtml = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px;">`;
    for (const card of testCards) {
        const saved = testResults[card.id];
        let statusText = '⏳ Pending';
        let color = '#6B7280';
        if (saved) {
            statusText = saved.passed ? '✅ Passed' : '❌ Failed';
            color = saved.passed ? '#2e7d32' : '#d32f2f';
        }
        cardsHtml += `
            <div class="test-card" id="conn-card-${card.id}" style="background: white; padding: 16px 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); display: flex; flex-direction: column; justify-content: space-between; border-left: 4px solid ${saved && saved.passed ? '#2e7d32' : '#6B7280'};">
                <div>
                    <h3 style="margin: 0 0 4px 0; font-size: 16px;">${card.title}</h3>
                    <p style="margin: 0 0 12px 0; color: #6B7280; font-size: 13px;">${card.desc}</p>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                    <span class="status-text" id="conn-status-${card.id}" style="font-weight: 600; color: ${color}; font-size: 14px;">${statusText}</span>
                    <button class="btn-primary run-conn-test" data-test="${card.id}" style="font-size: 12px; padding: 4px 16px;">Test</button>
                </div>
            </div>
        `;
    }
    cardsHtml += `</div>`;

    const fixOptionsHtml = `
        <div id="fixOptionsSection" style="margin-top: 24px;">
            <h3 style="margin-bottom: 12px;">🛠️ Fix Options</h3>
            <div id="fixCardsContainer" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px;"></div>
            <div id="fixWarning" style="margin-top: 8px; font-size: 13px; color: #6B7280; display: none;">
                ⚠️ All services seem healthy. Fixes may temporarily disrupt connectivity.
            </div>
        </div>
    `;

    document.getElementById('pageContent').innerHTML = `
        <h1 style="margin-bottom: 20px;">🔌 Connection Troubleshoot</h1>
        <div id="radioRestoreNotice" style="display:none; margin-bottom:16px; padding:10px 14px; background:#eff6ff; border-left:4px solid #3b82f6; border-radius:6px; font-size:13px; color:#1e3a8a;"></div>
        ${cardsHtml}
        <div id="testResult" style="margin-top: 20px; display: none;"></div>
        ${fixOptionsHtml}
    `;

    function buildAllFixCards() {
        const allServices = ['wifi', 'bluetooth', 'mobile'];
        const fixContainer = document.getElementById('fixCardsContainer');
        let html = '';
        for (const service of allServices) {
            const actions = getFixActions(service);
            const serviceTitle = service.charAt(0).toUpperCase() + service.slice(1);
            let buttonsHtml = actions.map(a =>
                `<button class="${a.primary ? 'btn-primary' : 'btn-secondary'} fix-btn" data-service="${service}" data-action="${a.action}" style="font-size: 12px; padding: 4px 12px;">${a.label}</button>`
            ).join('');
            html += `
                <div class="fix-card" style="background: white; padding: 16px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-left: 4px solid #6B7280;">
                    <h4 style="margin: 0 0 8px 0; font-size: 15px;">${serviceTitle}</h4>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${buttonsHtml}
                    </div>
                </div>
            `;
        }
        fixContainer.innerHTML = html;

        document.querySelectorAll('.fix-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;
                const service = btn.dataset.service;
                const allPass = Object.values(testResults).every(r => r && r.passed === true);
                if (allPass && Object.keys(testResults).length > 0) {
                    if (!confirm(`⚠️ All services are currently working. Are you sure you want to apply the fix "${action}"? This may temporarily disrupt connectivity.`)) {
                        return;
                    }
                }
                btn.disabled = true;
                const originalLabel = btn.textContent;
                btn.textContent = '⏳ Applying...';
                try {
                    const fixResp = await fetchWithTimeout(`${BACKEND_URL}/android-connectivity/fix/${currentDeviceId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action })
                    }, 10000);
                    const fixData = await fixResp.json();
                    alert(fixData.message || 'Fix applied');
                    await runConnectionTest(service);
                } catch (err) {
                    alert('Fix failed: ' + (err.name === 'AbortError' ? 'Request timed out.' : err.message));
                } finally {
                    btn.disabled = false;
                    btn.textContent = originalLabel;
                }
            });
        });
    }

    function getFixActions(service) {
        const actions = {
            wifi: [
                { action: 'wifi_reset', label: '🔄 Reset WiFi', primary: true },
                { action: 'wifi_scan', label: '📡 Scan', primary: false },
            ],
            bluetooth: [
                { action: 'bluetooth_reset', label: '🔄 Reset Bluetooth', primary: true },
                { action: 'bluetooth_force_stop', label: '⏹️ Force Stop', primary: false },
                { action: 'bluetooth_clear_cache', label: '🧹 Clear Cache', primary: false },
            ],
            mobile: [
                { action: 'mobile_data_reset', label: '🔄 Reset Mobile Data', primary: true },
                { action: 'set_lte', label: '📶 Force LTE', primary: false },
            ]
        };
        return actions[service] || [];
    }

    async function runConnectionTest(testId) {
        if (isRunning) return;
        isRunning = true;

        const card = document.getElementById(`conn-card-${testId}`);
        const statusSpan = document.getElementById(`conn-status-${testId}`);
        const btn = card.querySelector('.run-conn-test');
        const resultDiv = document.getElementById('testResult');
        const warningDiv = document.getElementById('fixWarning');
        const restoreNotice = document.getElementById('radioRestoreNotice');

        document.querySelectorAll('.run-conn-test').forEach(b => b.disabled = true);
        btn.disabled = true;
        btn.textContent = '⏳ Running...';
        statusSpan.style.color = '#f59e0b';
        statusSpan.textContent = '⏳ Running...';
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `<p>🔄 Testing ${testId}...</p>`;
        restoreNotice.style.display = 'none';

        try {
            // ---- Snapshot current radio state BEFORE we touch anything, so we can restore it ----
            radioSnapshot = {
                wifi: await isWifiEnabled().catch(() => null),
                data: await isDataEnabled().catch(() => null),
                bluetooth: await isBluetoothEnabled().catch(() => null),
            };

            // ---- Toggle radios for isolation, then POLL for the radio to actually be ready ----
            if (testId === 'wifi') {
                await runAdb('svc wifi enable');
                await runAdb('svc data disable');
                await waitUntil(isWifiEnabled, { timeoutMs: 6000 });
            } else if (testId === 'mobile') {
                await runAdb('svc data enable');
                await runAdb('svc wifi disable');
                await waitUntil(isDataEnabled, { timeoutMs: 8000 }); // data attach can be slower than wifi
            } else if (testId === 'bluetooth') {
                // Correct primary method first (svc has no "bluetooth" service in AOSP).
                try {
                    await runAdb('cmd bluetooth_manager enable');
                } catch {
                    await runAdb('settings put global bluetooth_on 1');
                }
                await waitUntil(isBluetoothEnabled, { timeoutMs: 5000 });
            }

            // ---- Call diagnostic ----
            const endpoint = `/connectivity/diagnose/${testId}/${currentDeviceId}`;
            const resp = await fetchWithTimeout(`${BACKEND_URL}${endpoint}`, {}, 10000);
            const data = await resp.json();
            const pass = data.ok === true;
            testResults[testId] = { passed: pass, status: pass ? 'pass' : 'fail', message: data.message || '' };

            // ---- SAVE THIS TEST ----
            saveConnectionResults(testId, testResults[testId]);

            const icon = pass ? '✅' : '❌';
            const color = pass ? '#2e7d32' : '#d32f2f';
            let msg = pass ? data.message : (data.error || 'Failed');
            if (testId === 'bluetooth' && pass) {
                msg += ` | Paired: ${data.pairedCount || 0} | OPP: ${data.oppSupported ? '✅' : '❌'}`;
            }
            if (testId === 'mobile' && data.signalStrength) {
                msg += ` | Signal: ${data.signalStrength}`;
            }

            statusSpan.style.color = color;
            statusSpan.textContent = `${icon} ${pass ? 'Passed' : 'Failed'}`;
            btn.textContent = pass ? 'Rerun' : 'Retry';
            btn.disabled = false;
            resultDiv.innerHTML = `<div style="background: ${pass ? '#e8f5e9' : '#ffebee'}; padding: 12px; border-radius: 8px; color: ${color};">${icon} ${msg}</div>`;

            card.style.borderLeftColor = color;

            const allPass = Object.values(testResults).every(r => r && r.passed === true);
            warningDiv.style.display = allPass ? 'block' : 'none';

        } catch (err) {
            const timedOut = err.name === 'AbortError';
            statusSpan.style.color = '#d32f2f';
            statusSpan.textContent = '❌ Error';
            btn.textContent = 'Retry';
            btn.disabled = false;
            resultDiv.innerHTML = `<div style="background: #ffebee; padding: 12px; border-radius: 8px; color: #d32f2f;">❌ Error: ${timedOut ? 'Device did not respond in time.' : err.message}</div>`;
        } finally {
            // ---- Restore the radios we changed to isolate this test ----
            // We only touch the *other* radios back to what they were before —
            // the radio we were actually testing stays as the diagnose result found it.
            if (radioSnapshot) {
                const restoreCmds = [];
                if (testId === 'wifi' && radioSnapshot.data === true) {
                    restoreCmds.push('svc data enable');
                }
                if (testId === 'mobile' && radioSnapshot.wifi === true) {
                    restoreCmds.push('svc wifi enable');
                }
                if (restoreCmds.length) {
                    restoreNotice.style.display = 'block';
                    restoreNotice.textContent = 'ℹ️ Restoring the radio state you had before this test...';
                    for (const cmd of restoreCmds) {
                        try { await runAdb(cmd); } catch { /* best effort restore */ }
                    }
                    restoreNotice.textContent = '✅ Original radio settings restored.';
                    setTimeout(() => { restoreNotice.style.display = 'none'; }, 4000);
                }
            }
            isRunning = false;
            document.querySelectorAll('.run-conn-test').forEach(b => b.disabled = false);
        }
    }

    buildAllFixCards();

    document.querySelectorAll('.run-conn-test').forEach(btn => {
        btn.addEventListener('click', () => {
            const testId = btn.dataset.test;
            runConnectionTest(testId);
        });
    });

    // ---- Restore previous results on mount ----
    for (const [id, result] of Object.entries(testResults)) {
        const card = document.getElementById(`conn-card-${id}`);
        if (card) {
            card.style.borderLeftColor = result.passed ? '#2e7d32' : '#d32f2f';
        }
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
async function renderBsodDiagnosis() {
    const container = document.getElementById('pageContent');

    // ---- Get the existing warning modal from HTML ----
    const modal = document.getElementById('bsodWarningModal');
    if (!modal) {
        // Fallback: create modal if missing
        const modalHtml = `
            <div id="bsodWarningModal" class="modal" style="display: none; z-index: 99999; background: rgba(0,0,0,0.6); backdrop-filter: blur(6px); align-items: center; justify-content: center;">
                <div class="modal-content acrylic" style="max-width: 560px; padding: 0; border-radius: 20px; box-shadow: 0 30px 80px rgba(0,0,0,0.4); overflow: hidden;">
                    <!-- Header -->
                    <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 20px 28px 16px 28px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                        <div style="display: flex; align-items: center; gap: 14px;">
                            <span style="font-size: 36px;">⚠️</span>
                            <div>
                                <h3 style="margin: 0; font-size: 22px; font-weight: 700; color: #92400e;">BSOD Diagnostic</h3>
                                <p style="margin: 2px 0 0 0; font-size: 14px; color: #78350f; opacity: 0.8;">Boot failure analysis tool</p>
                            </div>
                            <button id="bsodWarningClose" style="margin-left: auto; background: transparent; border: none; font-size: 28px; color: #78350f; cursor: pointer; opacity: 0.6; transition: opacity 0.2s; padding: 0 8px;">&times;</button>
                        </div>
                    </div>
                    <!-- Body -->
                    <div style="padding: 24px 28px 28px 28px;">
                        <p style="font-size: 16px; font-weight: 500; color: #1e293b; margin: 0 0 16px 0; line-height: 1.5;">
                            This diagnostic is specifically for phones that <strong>cannot boot</strong> or are stuck in a <strong>boot loop / black screen</strong>.
                        </p>
                        <div style="background: #f8fafc; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px;">
                            <ul style="margin: 0; padding: 0; list-style: none; color: #334155; font-size: 14px; line-height: 2;">
                                <li style="display: flex; align-items: center; gap: 10px;"><span style="font-size: 18px;">⚠️</span> Only use this if your phone <strong>won't start normally</strong></li>
                                <li style="display: flex; align-items: center; gap: 10px;"><span style="font-size: 18px;">🔌</span> Requires a USB connection – <strong>no ADB needed</strong></li>
                                <li style="display: flex; align-items: center; gap: 10px;"><span style="font-size: 18px;">📱</span> Detects Download Mode, Fastboot, Recovery, EDL, Preloader, and MTP</li>
                                <li style="display: flex; align-items: center; gap: 10px;"><span style="font-size: 18px;">🔄</span> If your phone <strong>is booting normally</strong>, use the <strong>Advanced Diagnostic</strong> or <strong>Hardware Tests</strong></li>
                            </ul>
                        </div>
                        <div style="display: flex; gap: 12px; justify-content: flex-end; padding-top: 4px;">
                            <button id="bsodWarningBack" class="btn-secondary" style="padding: 10px 28px; font-size: 14px; border-radius: 10px; font-weight: 500;">Back</button>
                            <button id="bsodWarningContinue" class="btn-primary" style="padding: 10px 32px; font-size: 14px; border-radius: 10px; font-weight: 600; background: #dc2626; border-color: #dc2626; box-shadow: 0 4px 12px rgba(220,38,38,0.3);">Continue</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    // Re-fetch modal and buttons after potential creation
    const modalEl = document.getElementById('bsodWarningModal');
    if (!modalEl) {
        console.error('BSOD warning modal not found');
        return;
    }

    // Ensure modal is hidden initially
    modalEl.style.display = 'none';

    // ---- Show modal and wait for user choice ----
    modalEl.style.display = 'flex';

    const userChoice = await new Promise((resolve) => {
        const backBtn = document.getElementById('bsodWarningBack');
        const continueBtn = document.getElementById('bsodWarningContinue');
        const closeBtn = document.getElementById('bsodWarningClose');

        if (!backBtn || !continueBtn || !closeBtn) {
            console.warn('BSOD warning buttons missing; resolving as "back"');
            modalEl.style.display = 'none';
            resolve('back');
            return;
        }

        const resolveWith = (choice) => {
            modalEl.style.display = 'none';
            resolve(choice);
        };

        // Attach listeners (once to auto-cleanup)
        backBtn.addEventListener('click', () => resolveWith('back'), { once: true });
        continueBtn.addEventListener('click', () => resolveWith('continue'), { once: true });
        closeBtn.addEventListener('click', () => resolveWith('back'), { once: true });

        // Close on outside click
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) {
                resolveWith('back');
            }
        }, { once: true });
    });

    // ---- If user clicked Back, Close, or outside: navigate to Dashboard ----
    if (userChoice === 'back') {
        // Clean up any polling (just in case)
        if (window._bsodCleanup) window._bsodCleanup();
        // Navigate to Dashboard via click simulation
        const dashboardNav = document.querySelector('.nav-item[data-page="dashboard"]');
        if (dashboardNav) {
            dashboardNav.click();
        } else {
            // Fallback: manually render dashboard and update highlight
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            if (dashboardNav) dashboardNav.classList.add('active');
            renderDashboard();
        }
        return;
    }

    // ---- User clicked Continue: show loading and render diagnostics ----
    showLoading();

    // ---- Render the page content ----
    const html = `
        <div style="margin-bottom:24px;">
            <h1 style="margin-bottom:8px;">🔍 BSOD / Boot Failure Analysis</h1>
            <p style="color: #6B7280;">Detects device state and runs appropriate diagnostics – no ADB required.</p>
        </div>
        <div id="bsodStateContainer">
            <div style="text-align:center; padding:40px; color:#6B7280;">
                <i class="fas fa-spinner fa-spin" style="font-size:32px;"></i>
                <p>Detecting device...</p>
            </div>
        </div>
        <div id="bsodResult" style="margin-top:20px; display:none;"></div>
    `;

    container.innerHTML = html;

    // ---- State detection and rendering (rest of the code remains the same) ----
    async function detectDeviceState() {
        try {
            const resp = await fetch(`${BACKEND_URL}/api/device-state`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return await resp.json();
        } catch (err) {
            console.warn('[BSOD] State detection failed:', err);
            return { state: 'no_response', details: 'Error checking device' };
        }
    }

    function renderStateUI(stateData) {
        const stateContainer = document.getElementById('bsodStateContainer');
        if (!stateContainer) return;

        const { state, details } = stateData;

        const stateLabels = {
            'adb_ready': { icon: '✅', color: '#2e7d32', label: 'ADB Ready – Device Booted' },
            'adb_unauthorized': { icon: '⚠️', color: '#ed6c02', label: 'ADB Unauthorized' },
            'recovery': { icon: '🔧', color: '#ed6c02', label: 'Recovery Mode' },
            'sideload': { icon: '🔧', color: '#ed6c02', label: 'Sideload Mode' },
            'mtp_normal': { icon: '📁', color: '#107c10', label: 'MTP Mode – OS Booted Successfully' },
            'bootloader': { icon: '🔧', color: '#ed6c02', label: 'Fastboot / Bootloader' },
            'samsung_download': { icon: '📥', color: '#ed6c02', label: 'Samsung Download Mode (Odin)' },
            'edl_qualcomm': { icon: '🔴', color: '#c62828', label: 'Qualcomm EDL (9008)' },
            'preloader_mediatek': { icon: '🔴', color: '#c62828', label: 'MediaTek Preloader' },
            'unknown_enumeration': { icon: '❓', color: '#6B7280', label: 'Unknown USB Device' },
            'generic_usb_detected': { icon: '🔌', color: '#6B7280', label: 'USB Detected (unclassified)' },
            'no_response': { icon: '📴', color: '#6B7280', label: 'No Device Detected' }
        };

        const info = stateLabels[state] || { icon: '❓', color: '#6B7280', label: state || 'Unknown' };
        const shortDetails = details && details.length > 60 ? details.substring(0, 60) + '…' : details;

        let actionsHtml = '';
        let diagnosisHtml = '';

        // ---- BSOD DIAGNOSIS LOGIC BASED ON STATE ----
        if (state === 'mtp_normal') {
            diagnosisHtml = `
                <div style="margin-top:12px; padding:16px; background:#e8f5e9; border-radius:8px; border-left:4px solid #2e7d32;">
                    <strong style="color:#2e7d32;">✅ Device booted successfully</strong>
                    <p style="margin:6px 0 0 0; color:#1e293b; font-size:14px;">
                        The OS is alive. Any BSOD symptom is likely <strong>app/UI-level</strong>, not a boot failure.
                    </p>
                    <p style="margin:6px 0 0 0; color:#475569; font-size:13px;">
                        <strong>🔧 Next steps:</strong>
                    </p>
                    <ul style="margin:4px 0 0 18px; color:#475569; font-size:13px;">
                        <li>Enable USB debugging in Developer Options to unlock full ADB diagnostics</li>
                        <li>Check for recently installed apps or system updates</li>
                        <li>Boot into Safe Mode to isolate third-party apps</li>
                    </ul>
                </div>
            `;
        } else if (state === 'samsung_download' || state === 'bootloader' || state === 'edl_qualcomm' || state === 'preloader_mediatek') {
            let cause = 'OS corruption';
            let detailsText = 'The device is stuck at bootloader/firmware level – OS failed to load.';
            if (state === 'samsung_download') {
                cause = 'OS corruption (Samsung Download Mode)';
                detailsText = 'Device is in Download Mode – firmware flash required.';
            } else if (state === 'bootloader') {
                cause = 'OS corruption (Fastboot)';
                detailsText = 'Device is in Fastboot mode – OS partition may be damaged.';
            } else if (state === 'edl_qualcomm') {
                cause = 'Firmware corruption (EDL)';
                detailsText = 'Bootloader failed to load – requires QFIL/QPST flash.';
            } else if (state === 'preloader_mediatek') {
                cause = 'Firmware corruption (Preloader)';
                detailsText = 'OS did not load – requires SP Flash Tool.';
            }
            diagnosisHtml = `
                <div style="margin-top:12px; padding:16px; background:#ffebee; border-radius:8px; border-left:4px solid #c62828;">
                    <strong style="color:#c62828;">🔴 BSOD Detected – ${cause}</strong>
                    <p style="margin:6px 0 0 0; color:#1e293b; font-size:14px;">${detailsText}</p>
                    <p style="margin:6px 0 0 0; color:#475569; font-size:13px;">
                        <strong>🔧 Recommended actions:</strong>
                    </p>
                    <ul style="margin:4px 0 0 18px; color:#475569; font-size:13px;">
                        <li>Flash stock firmware via Odin (Samsung) / Fastboot / SP Flash Tool</li>
                        <li>Ensure correct firmware for your exact model</li>
                        <li>Back up data if possible before flashing</li>
                    </ul>
                </div>
            `;
        } else if (state === 'recovery') {
            diagnosisHtml = `
                <div style="margin-top:12px; padding:16px; background:#fff3cd; border-radius:8px; border-left:4px solid #ed6c02;">
                    <strong style="color:#ed6c02;">🟡 Recovery Mode – Boot partition intact</strong>
                    <p style="margin:6px 0 0 0; color:#1e293b; font-size:14px;">
                        System partition may be corrupted. You can try:
                    </p>
                    <ul style="margin:4px 0 0 18px; color:#475569; font-size:13px;">
                        <li>Wipe cache partition from recovery</li>
                        <li>Sideload an OTA update via ADB</li>
                        <li>Factory reset as last resort</li>
                    </ul>
                </div>
            `;
        } else if (state === 'adb_ready') {
            actionsHtml = `
                <button id="startBsodBtn" class="btn-primary" style="margin-top:12px; font-size:16px; padding:10px 28px;">
                    <i class="fas fa-play"></i> Diagnose Now (ADB)
                </button>
                <div id="bsodDiagResult" style="margin-top:16px;"></div>
            `;
        } else if (state === 'no_response') {
            diagnosisHtml = `
                <div style="margin-top:12px; padding:16px; background:#f1f5f9; border-radius:8px; border-left:4px solid #6B7280;">
                    <strong style="color:#6B7280;">📴 No device detected</strong>
                    <p style="margin:6px 0 0 0; color:#1e293b; font-size:14px;">
                        Possible hardware failure or completely dead board.
                    </p>
                    <ul style="margin:4px 0 0 18px; color:#475569; font-size:13px;">
                        <li>Check USB cable and port</li>
                        <li>Try forcing EDL (vol+/‑ combo during plug‑in)</li>
                        <li>If device is completely dead, check charging LED / vibration</li>
                        <li>Probable cause: <strong>Hardware failure or overheating</strong></li>
                    </ul>
                </div>
            `;
        } else if (state === 'adb_unauthorized') {
            diagnosisHtml = `
                <div style="margin-top:12px; padding:16px; background:#fff3cd; border-radius:8px; border-left:4px solid #ed6c02;">
                    <strong style="color:#ed6c02;">⚠️ USB debugging not authorized</strong>
                    <p style="margin:6px 0 0 0; color:#1e293b; font-size:14px;">
                        Unlock the phone and approve the RSA fingerprint.
                    </p>
                </div>
            `;
        } else {
            diagnosisHtml = `
                <div style="margin-top:12px; padding:16px; background:#f1f5f9; border-radius:8px; border-left:4px solid #6B7280;">
                    <strong style="color:#6B7280;">ℹ️ Unknown or unclassified state</strong>
                    <p style="margin:6px 0 0 0; color:#1e293b; font-size:14px;">
                        ${escapeHtml(details || 'No additional information available.')}
                    </p>
                </div>
            `;
        }

        stateContainer.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; margin:16px 0; padding:12px; background:${info.color}10; border-radius:8px; border-left:4px solid ${info.color};">
                <span style="font-size:24px;">${info.icon}</span>
                <div>
                    <strong style="color:${info.color};">${info.label}</strong>
                    <span style="font-size:13px; color:#6B7280; margin-left:8px;">${escapeHtml(shortDetails)}</span>
                </div>
            </div>
            ${diagnosisHtml}
            ${actionsHtml}
        `;

        const runBtn = document.getElementById('startBsodBtn');
        if (runBtn) {
            runBtn.addEventListener('click', runBsodDiagnosis);
        }
    }

    async function runBsodDiagnosis() {
        const resultDiv = document.getElementById('bsodDiagResult') || document.getElementById('bsodResult');
        if (!resultDiv) return;

        resultDiv.style.display = 'block';
        resultDiv.innerHTML = getModernSpinnerHTML('Analyzing system logs for crash signatures...');
        showLoading();

        try {
            const response = await fetch(`${BACKEND_URL}/api/bsod/diagnose`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adbDeviceId: currentDeviceId })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }
            const data = await response.json();
            const diag = data.diagnosis || {};

            const cause = diag.cause || 'No cause identified';
            const confidence = diag.confidence || 'Unknown';
            const score = diag.score || 0;
            const signals = diag.signals || [];

            let severityColor = '#2e7d32';
            let icon = 'fa-check-circle';
            if (score >= 60) { severityColor = '#c62828'; icon = 'fa-exclamation-triangle'; }
            else if (score >= 30) { severityColor = '#ed6c02'; icon = 'fa-exclamation-circle'; }

            let signalsHtml = '';
            if (signals.length > 0) {
                signalsHtml = `<div class="card-header"><i class="fas fa-list"></i> Detected Signals</div><div class="card-content"><ul style="margin:0; padding-left:20px;">` +
                    signals.map(s => `<li><strong>${escapeHtml(s.title)}</strong> (${s.severity}) – ${s.points} pts</li>`).join('') +
                    `</ul></div>`;
            }

            const html = `
                <div class="info-card" style="border-left:4px solid ${severityColor}; margin-top:12px;">
                    <div class="card-header"><i class="fas ${icon}" style="color:${severityColor}"></i> Diagnosis Result</div>
                    <div class="card-content">
                        <div class="card-item"><span class="item-label">Conclusion</span><span class="item-value">${escapeHtml(cause)}</span></div>
                        <div class="card-item"><span class="item-label">Confidence</span><span class="item-value">${escapeHtml(confidence)} (Score: ${score}/100)</span></div>
                        ${diag.detail ? `<div class="card-item"><span class="item-label">Details</span><span class="item-value">${escapeHtml(diag.detail)}</span></div>` : ''}
                    </div>
                </div>
                ${signalsHtml}
                <div class="info-card">
                    <div class="card-header"><i class="fas fa-lightbulb"></i> Next Steps</div>
                    <div class="card-content"><p>${getRecommendation(cause)}</p></div>
                </div>
            `;

            resultDiv.innerHTML = html;

        } catch (err) {
            resultDiv.innerHTML = `<div style="color:#d32f2f; padding:16px; background:#ffebee; border-radius:8px;">Error: ${escapeHtml(err.message)}</div>`;
        } finally {
            hideLoading();
        }
    }

    // ---- Poll device state ----
    let pollInterval = null;
    async function updateState() {
        const stateData = await detectDeviceState();
        renderStateUI(stateData);
    }

    if (window._bsodPollInterval) {
        clearInterval(window._bsodPollInterval);
        window._bsodPollInterval = null;
    }

    await updateState();
    window._bsodPollInterval = setInterval(updateState, 2000);

    window._bsodCleanup = () => {
        if (window._bsodPollInterval) {
            clearInterval(window._bsodPollInterval);
            window._bsodPollInterval = null;
        }
    };

    // ---- Hide loading overlay now that page is ready ----
    hideLoading();
}
// ---- Actual BSOD page rendering (separate) ----
async function renderBsodPage(container) {
    // Show loading overlay
    showLoading();

    // Build the page HTML
    const html = `
        <div style="margin-bottom:24px;">
            <h1 style="margin-bottom:8px;">🔍 BSOD / Boot Failure Analysis</h1>
            <p style="color: #6B7280;">Detects device state and runs appropriate diagnostics – no ADB required.</p>
        </div>
        <div id="bsodStateContainer">
            <div style="text-align:center; padding:40px; color:#6B7280;">
                <i class="fas fa-spinner fa-spin" style="font-size:32px;"></i>
                <p>Detecting device...</p>
            </div>
        </div>
        <div id="bsodResult" style="margin-top:20px; display:none;"></div>
    `;

    container.innerHTML = html;

    // ---- State detection via /api/device-state ----
    async function detectDeviceState() {
        try {
            const resp = await fetch(`${BACKEND_URL}/api/device-state`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return await resp.json();
        } catch (err) {
            console.warn('[BSOD] State detection failed:', err);
            return { state: 'no_response', details: 'Error checking device' };
        }
    }

    // ---- Render state UI ----
    function renderStateUI(stateData) {
        const container = document.getElementById('bsodStateContainer');
        if (!container) return;

        const { state, details } = stateData;

        const stateLabels = {
            'adb_ready': { icon: '✅', color: '#2e7d32', label: 'ADB Ready – Device Booted' },
            'adb_unauthorized': { icon: '⚠️', color: '#ed6c02', label: 'ADB Unauthorized' },
            'recovery': { icon: '🔧', color: '#ed6c02', label: 'Recovery Mode' },
            'sideload': { icon: '🔧', color: '#ed6c02', label: 'Sideload Mode' },
            'mtp_normal': { icon: '📁', color: '#2e7d32', label: 'MTP Mode – OS Booted Successfully' },
            'bootloader': { icon: '🔧', color: '#ed6c02', label: 'Fastboot / Bootloader' },
            'samsung_download': { icon: '📥', color: '#ed6c02', label: 'Samsung Download Mode (Odin)' },
            'edl_qualcomm': { icon: '🔴', color: '#c62828', label: 'Qualcomm EDL (9008)' },
            'preloader_mediatek': { icon: '🔴', color: '#c62828', label: 'MediaTek Preloader' },
            'unknown_enumeration': { icon: '❓', color: '#6B7280', label: 'Unknown USB Device' },
            'generic_usb_detected': { icon: '🔌', color: '#6B7280', label: 'USB Detected (unclassified)' },
            'no_response': { icon: '📴', color: '#6B7280', label: 'No Device Detected' }
        };

        const info = stateLabels[state] || { icon: '❓', color: '#6B7280', label: state || 'Unknown' };

        let actionsHtml = '';
        let verdictHtml = '';

        // ---- Verdict based on state ----
        if (state === 'samsung_download' || state === 'edl_qualcomm' || state === 'preloader_mediatek' || state === 'bootloader') {
            verdictHtml = `
                <div style="margin-top:12px; padding:12px; background:#ffebee; border-radius:6px; border-left:4px solid #c62828;">
                    <strong>⚠️ BSOD Detected – OS Corruption / Boot Failure</strong>
                    <p style="margin:6px 0 0 0; font-size:14px; color:#333;">
                        The device is stuck in a boot loop or bootloader mode. The OS failed to load – likely due to corruption.
                        ${state === 'samsung_download' ? 'Flash stock firmware via Odin.' : ''}
                        ${state === 'edl_qualcomm' ? 'Requires QFIL/QPST + matching firehose loader.' : ''}
                        ${state === 'preloader_mediatek' ? 'Requires SP Flash Tool + matching scatter file.' : ''}
                        ${state === 'bootloader' ? 'Try fastboot reboot or flash firmware.' : ''}
                    </p>
                </div>
            `;
        } else if (state === 'mtp_normal') {
            verdictHtml = `
                <div style="margin-top:12px; padding:12px; background:#e8f5e9; border-radius:6px; border-left:4px solid #2e7d32;">
                    <strong>✅ Device booted successfully — MTP/file-transfer mode detected.</strong>
                    <p style="margin:6px 0 0 0; font-size:14px; color:#333;">
                        The OS is alive. Any BSOD symptom is likely app/UI-level, not a boot failure.
                    </p>
                    <p style="margin:4px 0 0 0; font-size:13px; color:#555;">
                        Enable USB debugging in Developer Options to unlock full ADB diagnostics.
                    </p>
                </div>
            `;
        } else if (state === 'adb_ready') {
            verdictHtml = `
                <div style="margin-top:12px; padding:12px; background:#e8f5e9; border-radius:6px; border-left:4px solid #2e7d32;">
                    <strong>✅ ADB Ready — Device is booted.</strong>
                    <p style="margin:6px 0 0 0; font-size:14px; color:#333;">
                        The device is fully booted. No boot failure detected.
                    </p>
                </div>
            `;
        } else if (state === 'recovery') {
            verdictHtml = `
                <div style="margin-top:12px; padding:12px; background:#fff3cd; border-radius:6px; border-left:4px solid #ffc107;">
                    <strong>⚠️ Recovery Mode — OS may be corrupted.</strong>
                    <p style="margin:6px 0 0 0; font-size:14px; color:#333;">
                        Device booted into recovery. Try clearing cache or performing a factory reset.
                        Or flash a custom recovery/firmware.
                    </p>
                </div>
            `;
        } else if (state === 'no_response' || state === 'unknown_enumeration') {
            verdictHtml = `
                <div style="margin-top:12px; padding:12px; background:#f1f5f9; border-radius:6px; border-left:4px solid #6B7280;">
                    <strong>⚠️ No Device Detected — Possible Hardware Failure</strong>
                    <p style="margin:6px 0 0 0; font-size:14px; color:#333;">
                        The phone is not responding. This could be a <strong>hardware problem</strong> (dead battery, PMIC failure, blown charging IC) or overheating.
                    </p>
                    <p style="margin:4px 0 0 0; font-size:13px; color:#555;">
                        Check charging LED, vibration on power button hold, and try a different USB port/cable.
                    </p>
                </div>
            `;
        }

        // ---- Actions ----
        if (state === 'adb_ready') {
            actionsHtml = `
                <button id="startBsodBtn" class="btn-primary" style="margin-top:12px; font-size:16px; padding:10px 28px;">
                    <i class="fas fa-play"></i> Diagnose Now (ADB)
                </button>
                <div id="bsodDiagResult" style="margin-top:16px;"></div>
            `;
        } else if (state === 'samsung_download') {
            actionsHtml = `
                <div style="margin-top:12px; padding:12px; background:#fff3cd; border-radius:6px; border-left:4px solid #ed6c02;">
                    <strong>📥 Samsung Download Mode (Odin) detected.</strong>
                    <p style="margin:8px 0;">Device is ready to receive firmware via Odin.</p>
                    <ul style="margin:4px 0 0 18px;">
                        <li>Flash stock firmware using Odin (AP, BL, CP, CSC files)</li>
                        <li>Use <code>Heimdall</code> on Linux/macOS</li>
                        <li>Ensure the correct firmware for your model</li>
                    </ul>
                </div>
            `;
        } else if (state === 'bootloader') {
            actionsHtml = `
                <div style="margin-top:12px; padding:12px; background:#fef3c7; border-radius:6px;">
                    <strong>Device in bootloader mode.</strong> You can try:
                    <ul style="margin:8px 0 0 18px;">
                        <li><code>fastboot reboot</code> – attempt to boot to system</li>
                        <li><code>fastboot boot recovery.img</code> – test recovery</li>
                        <li>Flash stock firmware via fastboot</li>
                    </ul>
                </div>
            `;
        } else if (state === 'edl_qualcomm') {
            actionsHtml = `
                <div style="margin-top:12px; padding:12px; background:#ffebee; border-radius:6px; border-left:4px solid #c62828;">
                    <strong>⚠️ Qualcomm EDL mode – Bootloader is corrupted.</strong>
                    <p style="margin:8px 0;">Requires QFIL/QPST + matching firehose loader for this model.</p>
                    <p style="font-size:13px; color:#6B7280;">Not fixable without proper firmware files.</p>
                </div>
            `;
        } else if (state === 'preloader_mediatek') {
            actionsHtml = `
                <div style="margin-top:12px; padding:12px; background:#ffebee; border-radius:6px; border-left:4px solid #c62828;">
                    <strong>⚠️ MediaTek Preloader mode – OS did not load.</strong>
                    <p style="margin:8px 0;">Requires SP Flash Tool + matching scatter file.</p>
                </div>
            `;
        } else if (state === 'adb_unauthorized') {
            actionsHtml = `
                <div style="margin-top:12px; padding:12px; background:#fff3cd; border-radius:6px;">
                    <strong>USB debugging not authorized.</strong>
                    <p>Unlock the phone and approve the RSA fingerprint.</p>
                </div>
            `;
        } else if (state === 'recovery') {
            actionsHtml = `
                <div style="margin-top:12px; padding:12px; background:#fef3c7; border-radius:6px;">
                    <strong>Recovery mode detected.</strong> You can:
                    <ul style="margin:8px 0 0 18px;">
                        <li>Wipe cache partition</li>
                        <li>Factory reset (if backup available)</li>
                        <li>Install update via ADB sideload</li>
                    </ul>
                </div>
            `;
        } else if (state === 'mtp_normal') {
            actionsHtml = `
                <div style="margin-top:12px; padding:12px; background:#e8f5e9; border-radius:6px;">
                    <strong>Device is booted normally (MTP mode).</strong>
                    <p style="margin:6px 0 0 0;">For BSOD issues, check if it's an app or driver problem. Use Advanced Diagnostic for deeper analysis.</p>
                </div>
            `;
        } else {
            actionsHtml = `
                <div style="margin-top:12px; padding:12px; background:#f1f5f9; border-radius:6px; color:#475569;">
                    <strong>No responsive device found.</strong>
                    <ul style="margin:8px 0 0 18px;">
                        <li>Check USB cable and port</li>
                        <li>Try forcing EDL (vol+/‑ combo during plug‑in)</li>
                        <li>If device is completely dead, check charging LED / vibration</li>
                    </ul>
                </div>
            `;
        }

        container.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; margin:16px 0; padding:12px; background:${info.color}10; border-radius:8px; border-left:4px solid ${info.color};">
                <span style="font-size:24px;">${info.icon}</span>
                <div>
                    <strong style="color:${info.color};">${info.label}</strong>
                    <span style="font-size:13px; color:#6B7280; margin-left:8px;">${details || ''}</span>
                </div>
            </div>
            ${verdictHtml}
            ${actionsHtml}
        `;

        const runBtn = document.getElementById('startBsodBtn');
        if (runBtn) {
            runBtn.addEventListener('click', runBsodDiagnosis);
        }
    }

    // ---- ADB-based diagnosis (original logic) ----
    async function runBsodDiagnosis() {
        const resultDiv = document.getElementById('bsodDiagResult') || document.getElementById('bsodResult');
        if (!resultDiv) return;

        resultDiv.style.display = 'block';
        resultDiv.innerHTML = getModernSpinnerHTML('Analyzing system logs for crash signatures...');
        showLoading();

        try {
            const response = await fetch(`${BACKEND_URL}/api/bsod/diagnose`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adbDeviceId: currentDeviceId })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }
            const data = await response.json();
            const diag = data.diagnosis || {};

            const cause = diag.cause || 'No cause identified';
            const confidence = diag.confidence || 'Unknown';
            const score = diag.score || 0;
            const signals = diag.signals || [];

            let severityColor = '#2e7d32';
            let icon = 'fa-check-circle';
            if (score >= 60) { severityColor = '#c62828'; icon = 'fa-exclamation-triangle'; }
            else if (score >= 30) { severityColor = '#ed6c02'; icon = 'fa-exclamation-circle'; }

            let signalsHtml = '';
            if (signals.length > 0) {
                signalsHtml = `<div class="card-header"><i class="fas fa-list"></i> Detected Signals</div><div class="card-content"><ul style="margin:0; padding-left:20px;">` +
                    signals.map(s => `<li><strong>${escapeHtml(s.title)}</strong> (${s.severity}) – ${s.points} pts</li>`).join('') +
                    `</ul></div>`;
            }

            const html = `
                <div class="info-card" style="border-left:4px solid ${severityColor};">
                    <div class="card-header"><i class="fas ${icon}" style="color:${severityColor}"></i> Diagnosis Result</div>
                    <div class="card-content">
                        <div class="card-item"><span class="item-label">Conclusion</span><span class="item-value">${escapeHtml(cause)}</span></div>
                        <div class="card-item"><span class="item-label">Confidence</span><span class="item-value">${escapeHtml(confidence)} (Score: ${score}/100)</span></div>
                        ${diag.detail ? `<div class="card-item"><span class="item-label">Details</span><span class="item-value">${escapeHtml(diag.detail)}</span></div>` : ''}
                    </div>
                </div>
                ${signalsHtml}
                <div class="info-card">
                    <div class="card-header"><i class="fas fa-lightbulb"></i> Next Steps</div>
                    <div class="card-content"><p>${getRecommendation(cause)}</p></div>
                </div>
            `;

            resultDiv.innerHTML = html;

        } catch (err) {
            resultDiv.innerHTML = `<div style="color:#d32f2f; padding:16px; background:#ffebee; border-radius:8px;">Error: ${escapeHtml(err.message)}</div>`;
        } finally {
            hideLoading();
        }
    }

    // ---- Poll device state every 2 seconds ----
    let pollInterval = null;

    async function updateState() {
        const stateData = await detectDeviceState();
        renderStateUI(stateData);
    }

    if (window._bsodPollInterval) {
        clearInterval(window._bsodPollInterval);
        window._bsodPollInterval = null;
    }

    await updateState();
    window._bsodPollInterval = setInterval(updateState, 2000);

    window._bsodCleanup = () => {
        if (window._bsodPollInterval) {
            clearInterval(window._bsodPollInterval);
            window._bsodPollInterval = null;
        }
    };

    // Hide loading after first render
    hideLoading();
}

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