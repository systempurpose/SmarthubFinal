// ==================== GLOBALS ====================
let currentDeviceId = null;
let wizardStep = 0;
let lastUsbState = null; // Track last USB state for dashboard re-render
// ---- Persistent test results ----
window._hardwareTestResults = {};   // { testId: { status, message, passed } }
window._connectionTestResults = {}; // { testId: { status, message, passed } }
function openTutorial() {
    // Replace the URL with your actual tutorial video
 
    window.open('https://www.youtube.com/watch?v=6KbKqQVJXcQ', '_blank');
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
    'repairs': true,
    // bsod and advanced don't require ADB
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
                <div id="alertModal" class="modal" style="display: none;">
                    <div class="modal-content" style="max-width: 420px;">
                        <div class="modal-header">
                            <h3 id="alertModalTitle">Notice</h3>
                            <span class="close-button" id="alertModalClose">&times;</span>
                        </div>
                        <div class="modal-body" id="alertModalBody" style="padding: 16px 0;">
                            <p id="alertModalMessage">Message</p>
                        </div>
                        <div class="modal-footer" style="justify-content: center;">
                            <button id="alertModalOkBtn" class="btn-primary">OK</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modal = document.getElementById('alertModal');
        }
        document.getElementById('alertModalTitle').textContent = title || 'Notice';
        document.getElementById('alertModalMessage').textContent = message || '';
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

function showConfirm(title, message) {
    return new Promise((resolve) => {
        let modal = document.getElementById('confirmModal');
        if (!modal) {
            const modalHtml = `
                <div id="confirmModal" class="modal" style="display: none;">
                    <div class="modal-content" style="max-width: 420px;">
                        <div class="modal-header">
                            <h3 id="confirmModalTitle">Confirm</h3>
                            <span class="close-button" id="confirmModalClose">&times;</span>
                        </div>
                        <div class="modal-body" id="confirmModalBody" style="padding: 16px 0;">
                            <p id="confirmModalMessage">Are you sure?</p>
                        </div>
                        <div class="modal-footer" style="justify-content: center; gap: 12px;">
                            <button id="confirmModalNoBtn" class="btn-secondary">No</button>
                            <button id="confirmModalYesBtn" class="btn-primary">Yes</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modal = document.getElementById('confirmModal');
        }
        document.getElementById('confirmModalTitle').textContent = title || 'Confirm';
        document.getElementById('confirmModalMessage').textContent = message || 'Are you sure?';
        modal.style.display = 'flex';
        const resolveAndClose = (result) => {
            modal.style.display = 'none';
            resolve(result);
        };
        const yesBtn = document.getElementById('confirmModalYesBtn');
        const noBtn = document.getElementById('confirmModalNoBtn');
        const closeBtn = document.getElementById('confirmModalClose');
        const newYes = yesBtn.cloneNode(true);
        const newNo = noBtn.cloneNode(true);
        const newClose = closeBtn.cloneNode(true);
        yesBtn.parentNode.replaceChild(newYes, yesBtn);
        noBtn.parentNode.replaceChild(newNo, noBtn);
        closeBtn.parentNode.replaceChild(newClose, closeBtn);
        newYes.addEventListener('click', () => resolveAndClose(true));
        newNo.addEventListener('click', () => resolveAndClose(false));
        newClose.addEventListener('click', () => resolveAndClose(false));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) resolveAndClose(false);
        }, { once: true });
    });
}

function showConfirm(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        if (!modal) {
            const modalHtml = `
                <div id="confirmModal" class="modal" style="display: none;">
                    <div class="modal-content" style="max-width: 420px;">
                        <div class="modal-header">
                            <h3 id="confirmModalTitle">Confirm</h3>
                            <span class="close-button" id="confirmModalClose">&times;</span>
                        </div>
                        <div class="modal-body" id="confirmModalBody" style="padding: 16px 0;">
                            <p id="confirmModalMessage">Are you sure?</p>
                        </div>
                        <div class="modal-footer" style="justify-content: center; gap: 12px;">
                            <button id="confirmModalNoBtn" class="btn-secondary">No</button>
                            <button id="confirmModalYesBtn" class="btn-primary">Yes</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }
        const modalEl = document.getElementById('confirmModal');
        document.getElementById('confirmModalTitle').textContent = title || 'Confirm';
        document.getElementById('confirmModalMessage').textContent = message || 'Are you sure?';
        modalEl.style.display = 'flex';
        const resolveAndClose = (result) => {
            modalEl.style.display = 'none';
            resolve(result);
        };
        const yesBtn = document.getElementById('confirmModalYesBtn');
        const noBtn = document.getElementById('confirmModalNoBtn');
        const closeBtn = document.getElementById('confirmModalClose');
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

    const pageHtml = `
        <div style="margin-bottom:24px;">
            <h1 style="margin-bottom:8px;">🔍 Advanced Diagnostics</h1>
            <p style="color: #6B7280;">Deep‑scan apps and check for rootkits on the selected device.</p>
        </div>
        <button id="runAdvancedDiagBtn" class="btn-primary" style="font-size:18px; padding:12px 36px; border-radius:30px; box-shadow:0 4px 12px rgba(59,130,246,0.3);">
            <i class="fas fa-play"></i> Run Advanced Scan
        </button>
        <div id="advancedDiagContainer" style="margin-top:24px;">
            <div style="padding:40px; text-align:center; color:#6B7280; border:2px dashed #e5e7eb; border-radius:12px;">
                <i class="fas fa-microchip" style="font-size:48px; display:block; margin-bottom:12px; opacity:0.5;"></i>
                <span style="font-size:16px;">Click the button above to start the scan.</span>
            </div>
        </div>
    `;

    container.innerHTML = pageHtml;

    const runBtn = document.getElementById('runAdvancedDiagBtn');
    const diagContainer = document.getElementById('advancedDiagContainer');

    runBtn.addEventListener('click', async function() {
        const btn = this;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';
        diagContainer.innerHTML = getModernSpinnerHTML('Initializing advanced diagnostics...');
        showLoading();

        try {
            const results = await window.SmartHub.advanceDiagnostic.runFullSuite(
                currentDeviceId,
                (msg) => {
                    const textEl = diagContainer.querySelector('.loading-text');
                    if (textEl) textEl.textContent = msg;
                }
            );
            hideLoading();
            window.SmartHub.advanceDiagnostic.renderResults('advancedDiagContainer');
        } catch (err) {
            hideLoading();
            diagContainer.innerHTML = `
                <div style="color:#d32f2f; padding:20px; background:#ffebee; border-radius:8px; border-left:4px solid #d32f2f;">
                    <strong>❌ Error:</strong> ${escapeHtml(err.message)}
                    <br><br>
                    <button onclick="renderAdvancedDiagnostic()" class="btn-secondary">🔄 Retry</button>
                </div>
            `;
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-play"></i> Run Advanced Scan';
        }
    });
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
        <div class="card" style="text-align: center; padding: 40px;">
            <i class="fas fa-plug" style="font-size: 48px; color: #d83b01;"></i>
            <h2>No Device Connected</h2>
            <p>Please connect your Android phone via USB and enable USB debugging.</p>
            <button id="openWizardFromDashboard" class="btn-primary">Open USB Debugging Wizard</button>
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
                <div style="font-size: 32px; margin-bottom: 8px;">🔬</div>
                <div style="font-weight: 600; font-size: 15px;">Deep Diagnostic</div>
                <div style="font-size: 12px; color: #6B7280; margin-top: 4px;">Full system & app scan</div>
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

        <div id="deviceOverview" class="card" style="display: none;"></div>
        <div id="networkStatus" class="card" style="display: none;"></div>
        <div id="phoneSummary" class="card" style="display: none;">
            <div class="card-title"><i class="fas fa-mobile-alt"></i> Phone Summary</div>
            <div class="phone-summary-grid"></div>
        </div>
        <div id="alertsCard" class="card" style="display: none;"></div>
        <div id="diagnosticResult" class="card" style="display: none;"></div>
    `;

    // ---- Attach event listeners ----
    const storageCard = container.querySelector('.action-card[data-action="storage-analysis"]');
    if (storageCard) storageCard.addEventListener('click', runStorageAnalysis);

    const appSecurityCard = container.querySelector('.action-card[data-action="app-security"]');
    if (appSecurityCard) {
        appSecurityCard.addEventListener('click', function(e) {
            try {
                runDeepDiagnostic();
            } catch (err) {
                console.error('[Dashboard] Error running deep diagnostic:', err);
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

    // ---- Fetch and display hardware data ----
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
        const usedBytes = Number(b.used?.bytes) || 0;
        const free = b.free?.human || '?';
        const freeBytes = Number(b.free?.bytes) || 0;
        const apps = b.apps || { percent: 0, human: '0 KB', bytes: 0 };
        const media = b.media || { percent: 0, human: '0 KB', bytes: 0 };
        const system = b.system || { percent: 0, human: '0 KB', bytes: 0 };
        const other = b.other || { percent: 0, human: '0 KB', bytes: 0 };

        // Include "Free" as a separate slice
        const segments = [
            { label: 'Apps', percent: apps.percent, bytes: apps.bytes, human: apps.human, color: '#0d6efd', icon: '📱' },
            { label: 'Media', percent: media.percent, bytes: media.bytes, human: media.human, color: '#198754', icon: '🎬' },
            { label: 'System', percent: system.percent, bytes: system.bytes, human: system.human, color: '#0dcaf0', icon: '⚙️' },
            { label: 'Other', percent: other.percent, bytes: other.bytes, human: other.human, color: '#6c757d', icon: '📦' },
            { label: 'Free', percent: 0, bytes: freeBytes, human: free, color: '#e9ecef', icon: '🟩' }
        ];

        // Calculate actual percentages based on total bytes
        const totalBytesAll = segments.reduce((sum, s) => sum + (s.bytes || 0), 0);
        if (totalBytesAll > 0) {
            for (const seg of segments) {
                seg.percent = (seg.bytes / totalBytesAll) * 100;
            }
        }

        // Sort: used categories first, then free at the end
        const usedSegments = segments.filter(s => s.label !== 'Free');
        const freeSegment = segments.find(s => s.label === 'Free');
        const sortedSegments = [...usedSegments, freeSegment];

        // Build HTML with improved layout
        const html = `
            <div style="display: flex; flex-wrap: wrap; gap: 24px; justify-content: center; padding: 8px 0;">
                <!-- Left: Pie chart -->
                <div style="flex: 0 0 auto; text-align: center;">
                    <canvas id="storagePieCanvas" width="240" height="240" style="max-width: 100%; height: auto;"></canvas>
                </div>
                <!-- Right: Legend & Overview -->
                <div style="flex: 1; min-width: 200px;">
                    <!-- Overview cards -->
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px;">
                        <div style="background: #f8f9fa; border-radius: 8px; padding: 8px; text-align: center;">
                            <div style="font-size: 11px; color: #6B7280;">Total</div>
                            <div style="font-size: 18px; font-weight: 600;">${escapeHtml(total)}</div>
                        </div>
                        <div style="background: #f8f9fa; border-radius: 8px; padding: 8px; text-align: center;">
                            <div style="font-size: 11px; color: #6B7280;">Used</div>
                            <div style="font-size: 18px; font-weight: 600;">${escapeHtml(used)}</div>
                        </div>
                        <div style="background: #f8f9fa; border-radius: 8px; padding: 8px; text-align: center;">
                            <div style="font-size: 11px; color: #6B7280;">Free</div>
                            <div style="font-size: 18px; font-weight: 600;">${escapeHtml(free)}</div>
                        </div>
                    </div>

                    <!-- Legend with progress bars -->
                    <div style="background: #f8f9fa; border-radius: 8px; padding: 12px;">
                        <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px;">Detailed Usage</div>
                        ${sortedSegments.map(segment => `
                            <div style="margin-bottom: 8px;">
                                <div style="display: flex; justify-content: space-between; font-size: 13px;">
                                    <span>${segment.icon} ${segment.label}</span>
                                    <span>${escapeHtml(segment.human)} (${segment.percent.toFixed(1)}%)</span>
                                </div>
                                <div style="background: #e9ecef; border-radius: 4px; height: 6px; overflow: hidden;">
                                    <div style="width: ${Math.max(0.5, segment.percent)}%; background: ${segment.color}; height: 100%;"></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        body.innerHTML = html;

        // Draw the pie chart
        const canvas = document.getElementById('storagePieCanvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            const w = 240, h = 240, cx = 120, cy = 120, r = 90;
            const innerRadius = 50; // for donut style
            ctx.clearRect(0, 0, w, h);

            let start = -0.5 * Math.PI;
            const usedTotal = sortedSegments.filter(s => s.label !== 'Free').reduce((sum, s) => sum + s.percent, 0);
            // Ensure free is last slice
            const sortedForPie = [...sortedSegments.filter(s => s.label !== 'Free'), sortedSegments.find(s => s.label === 'Free')];

            for (const segment of sortedForPie) {
                const angle = (segment.percent / 100) * 2 * Math.PI;
                if (angle <= 0) continue;
                const end = start + angle;
                // Draw donut slice
                ctx.beginPath();
                ctx.arc(cx, cy, r, start, end);
                ctx.arc(cx, cy, innerRadius, end, start, true);
                ctx.closePath();
                ctx.fillStyle = segment.color;
                ctx.fill();
                // Draw white stroke between slices
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Draw percentage label in the middle of the slice
                const midAngle = start + angle / 2;
                const labelRadius = (r + innerRadius) / 2;
                const labelX = cx + labelRadius * Math.cos(midAngle);
                const labelY = cy + labelRadius * Math.sin(midAngle);
                ctx.fillStyle = '#1f1f1f';
                ctx.font = 'bold 11px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                if (segment.percent > 5) { // only show if slice is large enough
                    ctx.fillText(segment.percent.toFixed(0) + '%', labelX, labelY);
                }

                start = end;
            }

            // Inner circle text
            ctx.beginPath();
            ctx.arc(cx, cy, innerRadius - 2, 0, 2 * Math.PI);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.fillStyle = '#1f1f1f';
            ctx.font = 'bold 14px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Storage', cx, cy - 10);
            ctx.font = '13px "Segoe UI", sans-serif';
            ctx.fillStyle = '#555';
            ctx.fillText(`${total}`, cx, cy + 12);
        }
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
async function runStorageAnalysis() {
    if (!currentDeviceId) {
        await showAlert('No Device', 'Please connect a device first.');
        return;
    }

    // Create modal
    let modal = document.getElementById('storageAnalysisModal');
    if (!modal) {
        const modalHTML = `
            <div id="storageAnalysisModal" class="modal" style="display: none;">
                <div class="modal-content" style="max-width: 1100px; width: 95vw; max-height: 85vh; display: flex; flex-direction: column;">
                    <div class="modal-header" style="padding: 12px 20px;">
                        <h3 id="storageAnalysisTitle">Storage Analysis</h3>
                        <span class="close-button" id="closeStorageModal">&times;</span>
                    </div>
                    <div id="storageAnalysisBody" class="modal-body" style="flex: 1; overflow-y: auto; padding: 16px 20px;"></div>
                    <div class="modal-footer" style="padding: 8px 20px;">
                        <button id="closeStorageModalBtn" class="btn-secondary">Close</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById('storageAnalysisModal');
        document.getElementById('closeStorageModal').addEventListener('click', () => modal.style.display = 'none');
        document.getElementById('closeStorageModalBtn').addEventListener('click', () => modal.style.display = 'none');
        window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    }

    modal.style.display = 'flex';
    const modalBody = document.getElementById('storageAnalysisBody');
    const modalTitle = document.getElementById('storageAnalysisTitle');
    modalTitle.textContent = 'Storage Analysis';
    modalBody.innerHTML = getModernSpinnerHTML('Analyzing storage...');

    try {
        // ---- Fetch storage data ----
        const storage = await apiCall(`/hardware/storage?deviceId=${currentDeviceId}`).catch(() => ({ total: '0', used: '0', free: '0' }));
        let storageDetails = null;
        try {
            const detailsRes = await fetchWithTimeout(`${BACKEND_URL}/api/hardware/storage-details?deviceId=${currentDeviceId}`, {}, 15000);
            if (detailsRes.ok) storageDetails = await detailsRes.json();
        } catch (e) { console.warn('Could not fetch storage details:', e); }

        let largeFiles = [];
        let largeFilesError = null;
        try {
            const filesRes = await fetch(`${BACKEND_URL}/api/large-files?deviceId=${encodeURIComponent(currentDeviceId)}&minSize=0.5`);
            if (filesRes.ok) {
                const filesData = await filesRes.json();
                largeFiles = filesData.files || [];
            } else {
                largeFilesError = `Failed to load large files: ${filesRes.status} ${filesRes.statusText}`;
            }
        } catch (e) {
            largeFilesError = `Could not fetch large files: ${e.message}`;
        }

        // ---- Helpers ----
        function formatSize(bytes) {
            if (!bytes || bytes === '0') return '0 B';
            const num = parseFloat(bytes);
            if (isNaN(num)) return bytes;
            if (num >= 1024 * 1024 * 1024) return (num / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
            if (num >= 1024 * 1024) return (num / (1024 * 1024)).toFixed(1) + ' MB';
            if (num >= 1024) return (num / 1024).toFixed(1) + ' KB';
            return num + ' B';
        }

        function parseSize(str) {
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

        const storageTotalBytes = parseSize(storage.total);
        const storageUsedBytes = parseSize(storage.used);
        const storagePercent = storageTotalBytes > 0 ? (storageUsedBytes / storageTotalBytes) * 100 : 0;

        // ---- Build HTML ----
        let html = `
            <div style="margin-bottom: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; font-size: 14px;">
                    <span><strong>💾 Storage</strong> ${formatSize(storageUsedBytes)} / ${formatSize(storageTotalBytes)}</span>
                    <span style="color: ${storagePercent > 90 ? '#dc3545' : '#28a745'};">${storagePercent.toFixed(1)}% used</span>
                </div>
                ${storagePercent > 90 ? `<div style="color: #d32f2f; font-size: 13px; margin-top: 4px;">⚠️ Storage is nearly full.</div>` : ''}
            </div>
        `;

        // ---- Storage breakdown ----
        if (storageDetails && storageDetails.breakdown) {
            const b = storageDetails.breakdown;
            const categories = [
                { key: 'apps', label: '📱 Apps' },
                { key: 'media', label: '🎬 Media' },
                { key: 'system', label: '⚙️ System' },
                { key: 'other', label: '📦 Other' }
            ];
            let breakdownHtml = `
                <div class="storage-section" style="margin-top: 8px; padding: 12px; background: #fff; border-radius: 8px; border: 1px solid #e5e7eb;">
                    <h4 style="margin: 0 0 8px 0; font-size: 15px;">📂 Storage Breakdown</h4>
                    <div style="display: grid; gap: 6px;">
            `;
            for (const cat of categories) {
                const data = b[cat.key] || { percent: 0, human: '0 KB', bytes: 0 };
                breakdownHtml += `
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px; padding: 6px 8px; border-bottom: 1px solid #f1f3f5; background: #fafbfc; border-radius: 6px;">
                        <span>${cat.label}</span>
                        <span style="color: #6c757d; font-size: 12px;">${data.human}</span>
                    </div>
                `;
            }
            breakdownHtml += `</div></div>`;
            html += breakdownHtml;
        }

        // ---- Large files ----
        if (largeFilesError) {
            html += `
                <div style="margin-top: 12px; padding: 12px; background: #fff3cd; border-radius: 8px; border: 1px solid #ffeeba; color: #856404;">
                    <strong>⚠️ Large files unavailable.</strong><br>
                    ${escapeHtml(largeFilesError)}
                </div>
            `;
        } else if (largeFiles.length > 0) {
            html += `
                <div style="margin-top: 12px; padding: 12px; background: #fff; border-radius: 8px; border: 1px solid #e5e7eb;">
                    <h4 style="margin: 0 0 8px 0; font-size: 15px;">📁 Large Files (≥500MB)</h4>
                    <div style="font-size: 12px; color: #6c757d; margin-bottom: 8px;">Combined scan across available storage roots.</div>
                    <div style="max-height: 300px; overflow-y: auto;">
                        ${largeFiles.map(file => {
                            const isApp = file.type === 'app';
                            const actionArg = JSON.stringify(file.packageName || file.path);
                            return `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #f1f3f5; font-size: 13px;">
                                <span style="word-break: break-all; flex: 1; margin-right: 10px;">${escapeHtml(file.path)}</span>
                                <span style="white-space: nowrap; margin-right: 10px; color: #555;">${escapeHtml(file.size)}</span>
                                ${isApp
                                    ? `<button onclick='uninstallPackage(${actionArg})' style="background: #dc3545; color: white; border: none; border-radius: 12px; padding: 2px 10px; font-size: 11px; cursor: pointer;">🗑️ Uninstall</button>`
                                    : `<button onclick='deleteFile(${actionArg})' style="background: #dc3545; color: white; border: none; border-radius: 12px; padding: 2px 10px; font-size: 11px; cursor: pointer;">🗑️ Delete</button>`}
                            </div>
                        `}).join('')}
                    </div>
                    <div style="font-size: 12px; color: #6c757d; margin-top: 4px;">Total: ${largeFiles.length} large files</div>
                </div>
            `;
        } else {
            html += `
                <div style="margin-top: 12px; font-size: 13px; color: #28a745; padding: 8px; background: #e8f5e9; border-radius: 6px;">
                    ✅ No large files (≥500MB) found.
                </div>
            `;
        }

        modalBody.innerHTML = html;
    } catch (err) {
        modalBody.innerHTML = `<div style="color: #d32f2f;">Error: ${escapeHtml(err.message)}</div>`;
    }
}

// ==================== APP SECURITY SCAN (standalone) ====================
async function runDeepDiagnostic() {
    // ---- Create modal if it doesn't exist ----
    let modal = document.getElementById('quickDiagModal');
    if (!modal) {
        const modalHTML = `
            <div id="quickDiagModal" class="modal" style="display: none;">
                <div class="modal-content" style="max-width: 1100px; width: 95vw; max-height: 85vh; display: flex; flex-direction: column;">
                    <div class="modal-header" style="padding: 12px 20px;">
                        <h3 id="quickDiagModalTitle">Deep Diagnostic Result</h3>
                        <span class="close-button" id="closeQuickDiagModal">&times;</span>
                    </div>
                    <div id="quickDiagModalBody" class="modal-body" style="flex: 1; overflow-y: auto; padding: 16px 20px;">
                        <div class="spinner"></div>
                        <p style="text-align: center;">Analyzing system...</p>
                    </div>
                    <div class="modal-footer" style="padding: 8px 20px;">
                        <button id="closeQuickDiagModalBtn" class="btn-secondary">Close</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById('quickDiagModal');
    }

    modal.style.display = 'flex';
    const modalTitle = document.getElementById('quickDiagModalTitle');
    const modalBody = document.getElementById('quickDiagModalBody');
    modalTitle.textContent = 'Running Deep Diagnostic';
    modalBody.innerHTML = getModernSpinnerHTML('Analyzing system... this can take several minutes.');

    let scanStillRunning = true;
    const slowScanHintTimer = setTimeout(() => {
        if (!scanStillRunning) return;
        modalBody.innerHTML = getModernSpinnerHTML('Still analyzing... large scans can take several minutes.');
    }, 30000);

    const closeModal = () => { modal.style.display = 'none'; };
    document.getElementById('closeQuickDiagModal')?.addEventListener('click', closeModal);
    document.getElementById('closeQuickDiagModalBtn')?.addEventListener('click', closeModal);
    window.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // ========== ANDROID APP HELPER (Robust) ==========
    async function ensureAndroidAppOpen() {
        const pkg = 'com.smarthub.diagnostics';
        const activity = '.MainActivity';

        try {
            let installed = false;
            try {
                const pmList = await fetch(`${BACKEND_URL}/adb-shell`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        deviceId: currentDeviceId,
                        command: `pm list packages | grep ${pkg}`
                    })
                });
                const data = await pmList.json();
                installed = data.output && data.output.includes(pkg);
            } catch (e) {
                try {
                    const stateRes = await fetch(`${BACKEND_URL}/mobile-app-state/${currentDeviceId}`);
                    const state = await stateRes.json();
                    installed = state.installed === true;
                } catch { installed = false; }
            }

            if (!installed) {
                const confirm = await showConfirm('App Required', 'The SmartHub Diagnostics app is not installed. Would you like to install it now?');
                if (!confirm) return false;
                modalBody.innerHTML = getModernSpinnerHTML('Installing SmartHub Diagnostics app...');
                try {
                    const installRes = await fetch(`${BACKEND_URL}/api/install-apk`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ deviceId: currentDeviceId })
                    });
                    const installData = await installRes.json();
                    if (!installRes.ok) {
                        alert('Installation failed: ' + (installData.error || 'Unknown error'));
                        return false;
                    }
                    await new Promise(r => setTimeout(r, 2000));
                    const pmList2 = await fetch(`${BACKEND_URL}/adb-shell`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            deviceId: currentDeviceId,
                            command: `pm list packages | grep ${pkg}`
                        })
                    });
                    const data2 = await pmList2.json();
                    if (!data2.output || !data2.output.includes(pkg)) {
                        alert('App installed but not detected. Please open it manually.');
                        return false;
                    }
                    installed = true;
                } catch (err) {
                    alert('Failed to install app: ' + err.message);
                    return false;
                }
            }

            let launched = false;
            try {
                const amRes = await fetch(`${BACKEND_URL}/adb-shell`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        deviceId: currentDeviceId,
                        command: `am start -n ${pkg}/${activity}`
                    })
                });
                const amData = await amRes.json();
                if (amData.output && !amData.output.includes('Error')) {
                    launched = true;
                    console.log('[ensureAndroidAppOpen] Launched via am start');
                }
            } catch (e) { /* ignore */ }

            if (!launched) {
                try {
                    const monkeyRes = await fetch(`${BACKEND_URL}/adb-shell`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            deviceId: currentDeviceId,
                            command: `monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`
                        })
                    });
                    const monkeyData = await monkeyRes.json();
                    if (monkeyData.output && !monkeyData.output.includes('Error')) {
                        launched = true;
                        console.log('[ensureAndroidAppOpen] Launched via monkey');
                    }
                } catch (e) { /* ignore */ }
            }

            if (!launched) {
                alert('Failed to open the SmartHub Diagnostics app. Please open it manually.');
                return false;
            }

            await new Promise(r => setTimeout(r, 3000));
            return true;

        } catch (err) {
            console.error('ensureAndroidAppOpen error:', err);
            alert('Error communicating with the device. Make sure USB debugging is enabled.');
            return false;
        }
    }

    const appReady = await ensureAndroidAppOpen();
    if (!appReady) {
        modalTitle.textContent = 'Diagnostic Failed';
        modalBody.innerHTML = '<div style="color: #d32f2f; text-align: center;">SmartHub Diagnostics app is required. Please install it and try again.</div>';
        return;
    }

    try {
        // ---- Use the full deep-scan endpoint with 180s timeout ----
        const fullScanUrl = `${BACKEND_URL}/deep-scan/${currentDeviceId}/full?raw=0`;
        const scanRes = await fetchWithTimeout(fullScanUrl, {}, 600000);
        if (!scanRes.ok) throw new Error(`HTTP ${scanRes.status}`);
        const scanData = await scanRes.json();

        // ---- Extract data ----
        const hardwareFindings = scanData.findings || [];
        const health = scanData.health || {};
        const appSecurity = scanData.appSecurity || {};
        let suspiciousApps = appSecurity.suspiciousApps || [];
        const deepAnalysis = appSecurity.deepAnalysis || [];

        suspiciousApps = suspiciousApps.filter(app => (app.riskScore || 0) >= 30);

        if (suspiciousApps.length === 0) {
            modalBody.innerHTML = `<div style="padding: 20px;"><h3 style="color: #2e7d32;">✅ No Suspicious Apps Found</h3><p>All apps are safe or have no clear risk indicators.</p></div>`;
            modalTitle.textContent = 'Deep Diagnostic Complete';
            return;
        }

        // ---- Summary bar ----
        const critical = suspiciousApps.filter(a => a.riskScore >= 80).length;
        const high = suspiciousApps.filter(a => a.riskScore >= 60 && a.riskScore < 80).length;
        const medium = suspiciousApps.filter(a => a.riskScore >= 35 && a.riskScore < 60).length;
        const low = suspiciousApps.filter(a => a.riskScore < 35).length;

        let summaryBarHtml = `
            <div id="summaryBar" style="display: flex; gap: 16px; padding: 12px 16px; background: #f8f9fa; border-radius: 8px; margin-bottom: 16px; flex-wrap: wrap;">
                <span><span style="color: #c62828; font-weight: bold;">🔴 ${critical}</span> Critical</span>
                <span><span style="color: #e65100; font-weight: bold;">🟠 ${high}</span> High</span>
                <span><span style="color: #e67e22; font-weight: bold;">🟡 ${medium}</span> Medium</span>
                ${low > 0 ? `<span><span style="color: #2e7d32; font-weight: bold;">🟢 ${low}</span> Low</span>` : ''}
                <span style="margin-left: auto; color: #888;">Total: ${suspiciousApps.length} apps</span>
            </div>
        `;

        // ---- Build app cards ----
        const escape = (str) => escapeHtml(str);
        let appsHtml = `<div><h3 id="suspiciousAppsHeading" style="color: #ed6c02; margin-bottom: 8px;">⚠️ Suspicious Apps Found (${suspiciousApps.length})</h3>${summaryBarHtml}<div id="appsContainer" style="display: flex; flex-direction: column; gap: 12px;">`;

        for (const app of suspiciousApps) {
            const riskScore = app.riskScore || 0;
            const threat = getThreatLevel(riskScore);
            const threatIcon = threat.icon || (riskScore >= 80 ? '🔴' : riskScore >= 60 ? '🟠' : '🟡');
            const malwareCapabilities = getHumanReadableThreats(app.threatTypes || [], []);

            // ---- Deep analysis data (if available) ----
            const deep = deepAnalysis.find(d => d.packageName === app.packageName) || {};
            let techDetails = '';
            if (deep.entropy) {
                techDetails += `<div>Entropy: ${deep.entropy.toFixed(3)} ${deep.entropy > 0.85 ? '⚠️ (high → possible packing/obfuscation)' : ''}</div>`;
            }
            if (deep.yaraMatches && deep.yaraMatches.length) {
                techDetails += `<div>YARA matches: ${deep.yaraMatches.length}</div>`;
            }

            // ---- Human-friendly reasons ----
            const humanReasons = getHumanFriendlyRiskReasons(app);

            // ---- Risk factors (from app fields) ----
            let riskFactors = [];
            if (app.isSideloaded) riskFactors.push('📦 Sideloaded (not from Play Store)');
            if (app.installer && app.installer.toLowerCase().includes('unknown')) riskFactors.push('❓ Unknown installer');
            if (app.installer && app.installer.toLowerCase().includes('transsnet')) riskFactors.push('🏪 Installed via third‑party store (Transsnet)');
            if (app.dangerousPermissions && app.dangerousPermissions.length > 5) riskFactors.push('🔓 Requests many dangerous permissions');
            if (deep.entropy > 0.85) riskFactors.push('🧩 High code entropy (possible obfuscation/packing)');

            let factorsHtml = riskFactors.length ? `
                <div style="margin-top:6px; font-size:13px; color:#555; background:#f8f9fa; padding:6px 10px; border-radius:6px;">
                    <strong>⚠️ Risk factors:</strong> ${riskFactors.join(' • ')}
                </div>
            ` : '';

            // ---- Build card ----
            appsHtml += `
                <div id="app-card-${escape(app.packageName)}" class="app-card-item" data-package="${escape(app.packageName)}"
                     style="margin-bottom: 12px; padding: 16px; border-radius: 12px;
                            border-left: 6px solid ${threat.color};
                            background: ${threat.bg};
                            box-shadow: 0 2px 8px rgba(0,0,0,0.06);">

                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                            <span style="font-size: 20px;">${threatIcon}</span>
                            <strong style="font-size: 15px;">${escape(app.displayName)}</strong>
                            <span style="font-size: 12px; color: #888; font-family: monospace;">${escape(app.packageName)}</span>
                        </div>
                        <button onclick="uninstallPackage('${escape(app.packageName)}')"
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

                    ${app.reason ? `<div style="font-size: 13px; color: #555; margin-top: 6px;">${escape(app.reason)}</div>` : ''}

                    ${humanReasons.length ? `<div style="font-size: 13px; margin-top: 4px; color: #424242; background: rgba(255,255,255,0.5); padding: 6px 10px; border-radius: 6px;">${humanReasons.join('; ')}</div>` : ''}

                    ${malwareCapabilities.length ? `<div style="font-size: 13px; margin-top: 4px; color: #4a148c; background: rgba(255,255,255,0.65); padding: 6px 10px; border-radius: 6px;"><strong>What this malware can do:</strong><ul style="margin: 4px 0 0 18px; padding: 0;">${malwareCapabilities.map(item => `<li>${escape(item)}</li>`).join('')}</ul></div>` : ''}

                    ${factorsHtml}
                    ${techDetails ? `<div style="font-size: 12px; color: #666; margin-top: 8px; background: #f5f5f5; padding: 6px 10px; border-radius: 6px;">${techDetails}</div>` : ''}

                    <div style="display: flex; gap: 16px; margin-top: 8px; font-size: 12px; color: #666; flex-wrap: wrap;">
                        ${app.installer ? `<span>📦 Installed via: ${escape(app.installer)}</span>` : ''}
                        ${app.installDate ? `<span>📅 Installed: ${escape(app.installDate)}</span>` : ''}
                    </div>

                    <div style="margin-top: 10px; font-size: 13px; border-top: 1px dashed #ddd; padding-top: 10px;">
                        <span style="background: ${threat.bg}; color: ${threat.color}; padding: 2px 10px; border-radius: 12px; font-weight: 600; font-size: 12px;">${threat.label}</span>
                        &nbsp; Risk Score: <strong>${riskScore}/100</strong>
                    </div>
                </div>
            `;
        }
        appsHtml += `</div></div>`;

        const finalHtml = appsHtml;
        modalBody.innerHTML = finalHtml;
        modalTitle.textContent = 'Deep Diagnostic Complete';

    } catch (err) {
        console.error('[DeepDiag] Error:', err);
        modalTitle.textContent = 'Diagnostic Failed';
        let errorMessage = 'Unknown error';
        if (err instanceof Error) {
            errorMessage = err.message;
        } else if (err && typeof err === 'object' && err.message) {
            errorMessage = err.message;
        } else if (typeof err === 'string') {
            errorMessage = err;
        } else {
            errorMessage = String(err);
        }
        modalBody.innerHTML = `<div style="color: #d32f2f; text-align: center;">Error: ${escapeHtml(errorMessage)}</div>`;
    } finally {
        scanStillRunning = false;
        clearTimeout(slowScanHintTimer);
    }
}

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
async function deleteFile(filePath) {
    if (!confirm(`Are you sure you want to delete:\n${filePath}?`)) return;
    try {
        const response = await fetch(`${BACKEND_URL}/api/delete-file`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: currentDeviceId, filePath })
        });
        const data = await response.json();
        if (response.ok) {
            alert('File deleted successfully.');
            // Refresh the details view if a category is open
            const activeCategory = document.querySelector('.storage-category.active');
            if (activeCategory) {
                showCategoryDetails(activeCategory.dataset.category);
            } else {
                runDeepDiagnostic(); // fallback
            }
        } else {
            alert('Failed to delete: ' + data.error);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// ---- Uninstall an app ----
async function uninstallPackage(packageName) {
    if (!confirm(`Are you sure you want to uninstall ${packageName}?`)) return;
    try {
        const response = await fetch(`${BACKEND_URL}/api/uninstall-package`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: currentDeviceId, packageName })
        });
        const data = await response.json();
        if (response.ok) {
            alert(`Successfully uninstalled ${packageName}`);
            // Refresh the details view if a category is open
            const activeCategory = document.querySelector('.storage-category.active');
            if (activeCategory) {
                showCategoryDetails(activeCategory.dataset.category);
            } else {
                runDeepDiagnostic();
            }
        } else {
            alert(`Failed to uninstall: ${data.error}`);
        }
    } catch (err) {
        alert(`Error: ${err.message}`);
    }
}

// ---- Open app manager (placeholder) ----
function openAppManager() {
    alert('App Manager – you can uninstall apps from the Device Info page.');
    // Optionally navigate to Device Info page
    // document.querySelector('.nav-item[data-page="device-info"]')?.click();
}

// ==================== HELP MODAL ====================
function showHelpModal() {
    const modal = document.getElementById('helpModal');
    if (!modal) createHelpModal();
    else modal.style.display = 'flex';
}

function createHelpModal() {
    const modalHTML = `
        <div id="helpModal" class="modal" style="display: none;">
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h3><i class="fas fa-question-circle"></i> SmartHub Help Guide</h3>
                    <span class="close-button" id="closeHelpModalBtn">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="help-tabs">
                        <button class="help-tab active" data-tab="adb">ADB Setup</button>
                        <button class="help-tab" data-tab="ui">UI Fields</button>
                    </div>
                    <div id="helpTabAdb" class="help-tab-content active">
                        <h4>How to Enable USB Debugging</h4>
                        <ol>
                            <li>Go to Settings → About Phone → Tap "Build Number" 7 times.</li>
                            <li>Return to Settings → Developer Options → Enable USB Debugging.</li>
                            <li>Connect your phone via USB and accept the RSA key fingerprint.</li>
                            <li>Your device should appear as "Connected" in the sidebar.</li>
                        </ol>
                    </div>
                    <div id="helpTabUi" class="help-tab-content">
                        <h4>UI Sections Overview</h4>
                        <ul>
                            <li><strong>Dashboard:</strong> Shows battery, storage, RAM, network status, and quick actions.</li>
                            <li><strong>Device Info:</strong> Displays detailed hardware and software properties.</li>
                            <li><strong>Hardware Tests:</strong> Runs diagnostic tests on components.</li>
                            <li><strong>Connection Troubleshoot:</strong> Reset Wi-Fi, Bluetooth, and mobile data.</li>
                            <li><strong>AI Conclusion:</strong> Analyzes test results and suggests fixes.</li>
                            <li><strong>Repairs:</strong> Debloating tools.</li>
                            <li><strong>BSOD Diagnosis:</strong> Analyzes boot failures.</li>
                        </ul>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="closeHelpModalBtnFooter" class="btn-secondary">Close</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.querySelectorAll('.help-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.help-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.help-tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`helpTab${tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1)}`).classList.add('active');
        });
    });
    const closeModal = () => document.getElementById('helpModal').style.display = 'none';
    document.getElementById('closeHelpModalBtn')?.addEventListener('click', closeModal);
    document.getElementById('closeHelpModalBtnFooter')?.addEventListener('click', closeModal);
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

    // ========== TEST DEFINITIONS ==========
    // Map test IDs to display info and the actual run function.
    // The run functions are the same as in the existing tests array.
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
        microphone: {
            title: 'Microphone',
            desc: 'Record and playback test',
            run: async () => {
                await launchAndroidTest('microphone');
                modalTitle.textContent = 'Microphone Test';
                modalBody.innerHTML = `<p>🎤 The phone is recording and then playing back your voice.</p><p>After the recording, the sound will loop.</p><p>Did you hear your voice clearly?</p>`;
                modal.style.display = 'flex';
                const result = await waitForUserConfirmation();
                closeModal();
                await runAdb('input keyevent KEYCODE_BACK');
                await new Promise(r => setTimeout(r, 500));
                await launchAndroidApp();
                const passed = (result === 'yes');
                const message = passed ? 'User confirmed microphone working' : 'Microphone issue reported';
                return { passed, message };
            }
        },
        gps: {
            title: 'GPS',
            desc: 'Enable GPS and check lock',
            run: async () => {
                await prepareDeviceForTest('gps');
                let passed = false;
                let message = 'GPS did not lock';
                try {
                    await runAdb('cmd location set-location-enabled true');
                    await new Promise(r => setTimeout(r, 1000));
                    let isEnabled = false;
                    try {
                        const output = await runAdb('cmd location is-location-enabled');
                        isEnabled = output.trim().toLowerCase() === 'true';
                    } catch (e) {
                        const mode = await runAdb('settings get secure location_mode');
                        if (mode.trim() === '3') isEnabled = true;
                    }
                    if (!isEnabled) {
                        await runAdb('settings put secure location_mode 3');
                        await new Promise(r => setTimeout(r, 1000));
                        const mode = await runAdb('settings get secure location_mode');
                        if (mode.trim() === '3') isEnabled = true;
                    }
                    if (isEnabled) {
                        passed = true;
                        message = 'GPS enabled (high accuracy)';
                        try {
                            const dump = await runAdb('dumpsys location');
                            if (dump.includes('mLocation') && dump.includes('latitude') && !dump.includes('mLocation=null')) {
                                message = 'GPS locked successfully';
                            }
                        } catch (e) {}
                    } else {
                        message = 'GPS could not be enabled';
                    }
                } catch (e) {
                    message = 'Failed to check GPS status: ' + e.message;
                }
                return { passed, message };
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
                await prepareDeviceForTest('nfc');
                const features = await getHardwareFeatures();
                const hasNfc = features.some(f => f === 'android.hardware.nfc');
                return { passed: true, message: hasNfc ? 'NFC hardware present' : 'Not supported (no NFC)' };
            }
        },
        vibration: {
            title: 'Vibration',
            desc: 'Test vibration motor',
            run: async () => {
                let vibrated = false;
                try {
                    await runAdb('cmd vibrator_manager synced oneshot 500');
                    vibrated = true;
                } catch (e) {
                    try { await runAdb('cmd vibrator vibrate 500'); vibrated = true; } catch (e2) {
                        try { await runAdb('input vibrate 500'); vibrated = true; } catch (e3) {
                            try { await runAdb('service call vibrator 1'); vibrated = true; } catch (e4) {}
                        }
                    }
                }
                if (!vibrated) {
                    return { passed: false, message: 'Failed to trigger vibration' };
                }
                modalTitle.textContent = 'Vibration Test';
                modalBody.innerHTML = `<p>📳 The phone should vibrate for a moment.</p><p>Did you feel the vibration?</p>`;
                modal.style.display = 'flex';
                const result = await waitForUserConfirmation();
                closeModal();
                const passed = (result === 'yes');
                const message = passed ? 'User confirmed vibration' : 'User did not feel vibration';
                return { passed, message };
            }
        },
        flashlight: {
            title: 'Flashlight',
            desc: 'Test rear flashlight',
            run: async () => {
                const features = await getHardwareFeatures();
                if (!features.some(f => f === 'android.hardware.camera.flash')) {
                    return { passed: true, message: 'Not supported (no flashlight hardware)' };
                }
                await launchAndroidTest('flash');
                modalTitle.textContent = 'Flashlight Test';
                modalBody.innerHTML = `<p>🔦 The rear flashlight should turn on briefly.</p><p>Did you see the light?</p>`;
                modal.style.display = 'flex';
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? 'User confirmed flashlight' : 'User did not see light';
                return { passed, message };
            }
        },
        speaker: {
            title: 'Speaker',
            desc: 'Play test tone',
            run: async () => {
                const features = await getHardwareFeatures();
                if (!features.some(f => f === 'android.hardware.audio.output')) {
                    return { passed: true, message: 'Not supported (no audio output hardware)' };
                }
                await prepareDeviceForTest('speaker');
                await launchAndroidTest('sound');
                modalTitle.textContent = 'Speaker Test';
                modalBody.innerHTML = `<p>🔊 The phone should play a short test tone at medium volume.</p><p>Did you hear the sound clearly?</p>`;
                modal.style.display = 'flex';
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? 'User confirmed speaker' : 'User did not hear sound';
                return { passed, message };
            }
        },
        camera: {
            title: 'Camera',
            desc: 'Open camera and preview',
            run: async () => {
                await runAdb('am start -a android.media.action.STILL_IMAGE_CAMERA');
                modalTitle.textContent = 'Camera Test';
                modalBody.innerHTML = `<p>📸 The phone's camera app should have opened.</p><p>Does the camera viewfinder appear and work normally?</p>`;
                modal.style.display = 'flex';
                const result = await waitForUserConfirmation();
                closeModal();
                await runAdb('input keyevent KEYCODE_HOME');
                await new Promise(r => setTimeout(r, 500));
                await launchAndroidApp();
                const passed = (result === 'yes');
                const message = passed ? 'User confirmed camera working' : 'User reported camera issues';
                return { passed, message };
            }
        },
        headphone: {
            title: 'Headphone',
            desc: 'Test headphone audio',
            run: async () => {
                await prepareDeviceForTest('headphone');
                await launchAndroidTest('headphone');
                modalTitle.textContent = 'Headphone Test';
                modalBody.innerHTML = `<p>🎧 Please plug in headphones.</p><p>The phone will play a sound through the headphones.</p><p>Did you hear the sound clearly?</p>`;
                modal.style.display = 'flex';
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
                const features = await getHardwareFeatures();
                if (!features.some(f => f === 'android.hardware.touchscreen')) {
                    return { passed: true, message: 'Not supported (no touchscreen hardware)' };
                }
                await launchAndroidTest('touch');
                modalTitle.textContent = 'Touch Screen Test';
                modalBody.innerHTML = `<p>📱 The phone is now in touch test mode.</p><p>Draw inside the square guide on the phone.</p><p>Does the screen register your touches and draw smoothly?</p>`;
                modal.style.display = 'flex';
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? 'User confirmed touch working' : 'User reported touch issues';
                return { passed, message };
            }
        }
    };

    // ========== CARD UI ==========
    // Build card HTML from testDefs
    const testIds = Object.keys(testDefs);
    let cardsHtml = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px;">`;
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
        <div id="hwTestModal" class="modal" style="display: none;">
            <div class="modal-content" style="max-width: 500px; width: 90%;">
                <div class="modal-header">
                    <h3 id="hwModalTitle">Hardware Test</h3>
                    <span class="close-button" id="hwCloseModalBtn">&times;</span>
                </div>
                <div class="modal-body" id="hwModalBody" style="text-align: center; min-height: 200px;"></div>
                <div class="modal-footer" id="hwModalFooter">
                    <button id="hwYesBtn" class="btn-primary" style="display: none;">✅ Yes, it worked</button>
                    <button id="hwNoBtn" class="btn-secondary" style="display: none;">❌ No, it failed</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('pageContent').innerHTML = fullHtml;

    // ========== MODAL HELPERS ==========
    const modal = document.getElementById('hwTestModal');
    const modalTitle = document.getElementById('hwModalTitle');
    const modalBody = document.getElementById('hwModalBody');
    const yesBtn = document.getElementById('hwYesBtn');
    const noBtn = document.getElementById('hwNoBtn');
    const closeBtn = document.getElementById('hwCloseModalBtn');

    let currentTestResolver = null;

    function closeModal() {
        modal.style.display = 'none';
        if (currentTestResolver) {
            currentTestResolver('no');
            currentTestResolver = null;
        }
        yesBtn.style.display = 'none';
        noBtn.style.display = 'none';
    }
    closeBtn.addEventListener('click', closeModal);
    window.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    function waitForUserConfirmation() {
        return new Promise((resolve) => {
            currentTestResolver = resolve;
            yesBtn.style.display = 'inline-block';
            noBtn.style.display = 'inline-block';
            const onYes = () => { cleanup(); resolve('yes'); };
            const onNo = () => { cleanup(); resolve('no'); };
            const cleanup = () => {
                yesBtn.removeEventListener('click', onYes);
                noBtn.removeEventListener('click', onNo);
                yesBtn.style.display = 'none';
                noBtn.style.display = 'none';
                currentTestResolver = null;
            };
            yesBtn.addEventListener('click', onYes);
            noBtn.addEventListener('click', onNo);
        });
    }

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

    async function launchAndroidApp() {
        await runAdb('am start -n com.smarthub.diagnostics/.MainActivity');
    }

    async function launchAndroidTest(testType) {
        await runAdb(`am start -n com.smarthub.diagnostics/.TestRunnerActivity --es test ${testType}`);
    }

    async function returnToMainApp() {
        await runAdb('input keyevent KEYCODE_BACK');
        await new Promise(r => setTimeout(r, 500));
        await launchAndroidApp();
    }

    async function prepareDeviceForTest(testType) {
    try {
        await runAdb('settings put global zen_mode 0');
        if (testType === 'gps') {
            await runAdb('settings put secure location_mode 3');
        }
        if (testType === 'nfc') {
            await runAdb('svc nfc enable');
            await runAdb('settings put global nfc_on 1');
        }
       if (testType === 'speaker' || testType === 'headphone' || testType === 'sound') {
    try {
        await runAdb('cmd media_session volume --stream 3 --set 8 --show');
    } catch (e) {
        await runAdb('settings put system volume_music 8');
    }
}
    } catch (e) {
        console.warn('Device preparation failed:', e);
    }
}

    // ========== RUN A SINGLE TEST ==========
    async function runSingleHardwareTest(testId) {
        const card = document.getElementById(`card-${testId}`);
        const statusSpan = card.querySelector('.status-text');
        const btn = card.querySelector('.run-single-test');
        btn.disabled = true;
        btn.textContent = '⏳ Running...';

        statusSpan.style.color = '#f59e0b';
        statusSpan.textContent = '⏳ Running...';

        try {
            const def = testDefs[testId];
            if (!def) throw new Error('Test not found');
            const result = await def.run();
            const passed = result.passed;
            const icon = passed ? '✅' : '❌';
            const color = passed ? '#2e7d32' : '#d32f2f';
            const statusText = passed ? 'Passed' : 'Failed';
            statusSpan.style.color = color;
            statusSpan.textContent = `${icon} ${statusText}`;
            // Show message in a small tooltip or below? We'll just show an alert for now.
            alert(`${def.title}: ${result.message}`);
            btn.textContent = passed ? 'Rerun' : 'Details';
            btn.disabled = false;
        } catch (err) {
            statusSpan.style.color = '#d32f2f';
            statusSpan.textContent = '❌ Error';
            alert(`Error running test: ${err.message}`);
            btn.textContent = 'Retry';
            btn.disabled = false;
        }
    }

    // ========== RUN ALL TESTS (full suite) ==========
    async function runAllTests() {
        // This is the same as the original runAllTests but we'll update card statuses as we go.
        const resultsContainer = document.getElementById('hwResults');
        resultsContainer.style.display = 'block';
        const cardsContainer = document.getElementById('hwCardsContainer');
        cardsContainer.innerHTML = '';
        const results = {};

        await launchAndroidApp();
        for (const id of testIds) {
            const def = testDefs[id];
            const card = document.getElementById(`card-${id}`);
            const statusSpan = card.querySelector('.status-text');
            const btn = card.querySelector('.run-single-test');
            btn.disabled = true;
            btn.textContent = '⏳ Running...';
            statusSpan.style.color = '#f59e0b';
            statusSpan.textContent = '⏳ Running...';

            try {
                const result = await def.run();
                results[id] = { name: def.title, passed: result.passed, message: result.message };
                const passed = result.passed;
                const icon = passed ? '✅' : '❌';
                const color = passed ? '#2e7d32' : '#d32f2f';
                const statusText = passed ? 'Passed' : 'Failed';
                statusSpan.style.color = color;
                statusSpan.textContent = `${icon} ${statusText}`;
                btn.textContent = passed ? 'Rerun' : 'Details';
                btn.disabled = false;
            } catch (err) {
                results[id] = { name: def.title, passed: false, message: err.message };
                statusSpan.style.color = '#d32f2f';
                statusSpan.textContent = '❌ Error';
                btn.textContent = 'Retry';
                btn.disabled = false;
            }
            await new Promise(r => setTimeout(r, 500));
        }

        // Show summary (same as before)
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
    }

    // ========== ATTACH EVENT LISTENERS ==========
    // Single test buttons
    document.querySelectorAll('.run-single-test').forEach(btn => {
        btn.addEventListener('click', () => {
            const testId = btn.dataset.test;
            runSingleHardwareTest(testId);
        });
    });

    // Full suite button
    document.getElementById('startHwTestBtn').addEventListener('click', runAllTests);
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
async function renderRepairs() {
    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `<div class="card">No device connected. Please connect an Android phone with USB debugging enabled.</div>`;
        return;
    }
    const container = document.getElementById('pageContent');
    container.innerHTML = `
        <h1>Repair Tools</h1>
        <div class="card">
            <h3>Debloat (Remove Bloatware)</h3>
            <button id="listPackages" class="btn-secondary">List Installed Packages</button>
            <button id="runDebloat" class="btn-primary" disabled>Remove Selected</button>
            <select id="packageSelect" multiple size="5" style="width:100%; margin-top:12px;"></select>
        </div>
        <div class="card">
            <h3>Firmware Fix (Experimental)</h3>
            <button id="flashRecovery" class="btn-secondary">Flash Recovery Image</button>
            <input type="file" id="recoveryFile" accept=".img" />
        </div>
        <div id="repairOutput" class="card"></div>
    `;
    const listBtn = document.getElementById('listPackages');
    const runBtn = document.getElementById('runDebloat');
    const packageSelect = document.getElementById('packageSelect');
    listBtn?.addEventListener('click', async () => {
        const packages = await apiCall('/repair/list-packages');
        packageSelect.innerHTML = packages.map(p => `<option value="${p}">${p}</option>`).join('');
        runBtn.disabled = false;
    });
    runBtn?.addEventListener('click', async () => {
        const selected = Array.from(packageSelect.selectedOptions).map(opt => opt.value);
        const result = await apiCall('/repair/uninstall', { method: 'POST', body: JSON.stringify({ packages: selected }) });
        document.getElementById('repairOutput').innerHTML = `<pre>${JSON.stringify(result, null, 2)}</pre>`;
    });
    document.getElementById('flashRecovery')?.addEventListener('click', () => {
        alert('Firmware flashing not fully implemented. Use with caution.');
    });
}

// ==================== DEVICE INFO ====================
async function renderDeviceInfo() {
    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `<div class="card">No device connected.</div>`;
        return;
    }
    try {
        const [infoRes, wifiRes] = await Promise.all([
            fetch(`${BACKEND_URL}/api/device/info/${currentDeviceId}`),
            fetch(`${BACKEND_URL}/wifi/status/${currentDeviceId}`).catch(() => null)
        ]);

        if (!infoRes.ok) throw new Error(`HTTP ${infoRes.status}`);
        const infoData = await infoRes.json();
        const props = infoData;

        const wifiData = wifiRes && wifiRes.ok ? await wifiRes.json() : null;

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

        // ---- Sensors (extra) ----
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

        // ---- Bluetooth (with Show Paired button) ----
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
        document.getElementById('pageContent').innerHTML = finalHtml;

        // Store paired devices globally for the modal
        window._pairedDevices = pairedDevices;
    } catch (err) {
        document.getElementById('pageContent').innerHTML = `<div class="card">Error loading device info: ${err.message}</div>`;
    }
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
    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `<div class="card">No device connected.</div>`;
        return;
    }
    const storedResults = JSON.parse(localStorage.getItem('smartHubDiagnostics') || '{}');
    const reports = [];
    if (storedResults.hardwareTests) reports.push({ id: 'hardware', name: 'Hardware Tests', data: storedResults.hardwareTests });
    if (storedResults.bsod) reports.push({ id: 'bsod', name: 'BSOD Diagnosis', data: storedResults.bsod });
    if (storedResults.network) reports.push({ id: 'network', name: 'Network Troubleshoot', data: storedResults.network });
    if (storedResults.deviceInfo) reports.push({ id: 'device', name: 'Device Info', data: storedResults.deviceInfo });
    const reportsHtml = reports.map(r => `<label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;"><input type="checkbox" value="${r.id}" data-report='${JSON.stringify(r.data)}'> ${r.name}</label>`).join('');

    const html = `
        <div class="cards-container">
            <div class="info-card">
                <div class="card-header"><i class="fas fa-brain"></i> AI Conclusion</div>
                <div class="card-content">
                    <p>Select which diagnostic results you want the AI to analyze:</p>
                    <div id="reportsList">${reportsHtml || '<p>No diagnostic results yet. Run some tests first.</p>'}</div>
                    <button id="runAIConclusion" class="btn-primary" style="margin-top: 16px;">🔍 Get AI Conclusion</button>
                </div>
            </div>
            <div id="aiResult" class="info-card" style="display: none;">
                <div class="card-header"><i class="fas fa-comment-dots"></i> AI Analysis</div>
                <div class="card-content" id="aiResultContent"></div>
            </div>
        </div>
    `;
    document.getElementById('pageContent').innerHTML = html;

    document.getElementById('runAIConclusion')?.addEventListener('click', async () => {
        const selected = [];
        document.querySelectorAll('#reportsList input:checked').forEach(cb => {
            const reportData = JSON.parse(cb.getAttribute('data-report') || '{}');
            selected.push(reportData);
        });
        if (selected.length === 0) { alert('Please select at least one diagnostic result.'); return; }
        const resultDiv = document.getElementById('aiResult');
        const resultContent = document.getElementById('aiResultContent');
        resultDiv.style.display = 'block';
        resultContent.innerHTML = '<div class="spinner"></div><p>AI is analyzing...</p>';
        try {
            const diagStages = { hardware: selected.find(s => s.hardwareTests)?.hardwareTests || null, bsod: selected.find(s => s.bsod)?.bsod || null, network: selected.find(s => s.network)?.network || null };
            const response = await fetch(`${BACKEND_URL}/ai-adb-conclude`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId: currentDeviceId, diagStages, diagDetails: { selectedReports: selected.map(s => s.type) } })
            });
            const data = await response.json();
            if (data.ok && data.conclusion) {
                const conclusion = data.conclusion;
                resultContent.innerHTML = `<div><strong>Conclusion:</strong> ${escapeHtml(conclusion.humanSummary || conclusion.likelyCause || 'No clear cause')}</div>
                    <div style="margin-top:12px;"><strong>Recommended Fixes:</strong></div>
                    <ul>${(conclusion.actions || ['Run full hardware test']).map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
                    ${conclusion.nextStep ? `<div><strong>Next Step:</strong> ${escapeHtml(conclusion.nextStep)}</div>` : ''}`;
            } else {
                resultContent.innerHTML = '<p>AI could not generate a conclusion. Please try again later.</p>';
            }
        } catch (err) {
            resultContent.innerHTML = `<p style="color: red;">Error: ${err.message}</p>`;
        }
    });
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

    // ---- Helper to run ADB commands ----
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

    // ---- Test state ----
    let isRunning = false;
    let testResults = {};

    // ---- Card definitions ----
    const testCards = [
        { id: 'wifi', title: 'WiFi', desc: 'Test WiFi connectivity', status: 'Pending' },
        { id: 'bluetooth', title: 'Bluetooth', desc: 'Test Bluetooth file transfer', status: 'Pending' },
        { id: 'mobile', title: 'Mobile Data', desc: 'Test mobile data connectivity', status: 'Pending' },
    ];

    // ---- Build test cards ----
    let cardsHtml = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px;">`;
    for (const card of testCards) {
        cardsHtml += `
            <div class="test-card" id="conn-card-${card.id}" style="background: white; padding: 16px 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); display: flex; flex-direction: column; justify-content: space-between; border-left: 4px solid #6B7280;">
                <div>
                    <h3 style="margin: 0 0 4px 0; font-size: 16px;">${card.title}</h3>
                    <p style="margin: 0 0 12px 0; color: #6B7280; font-size: 13px;">${card.desc}</p>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                    <span class="status-text" id="conn-status-${card.id}" style="font-weight: 600; color: #6B7280; font-size: 14px;">⏳ Pending</span>
                    <button class="btn-primary run-conn-test" data-test="${card.id}" style="font-size: 12px; padding: 4px 16px;">Test</button>
                </div>
            </div>
        `;
    }
    cardsHtml += `</div>`;

    // ---- Fix Options section (always visible) ----
    const fixOptionsHtml = `
        <div id="fixOptionsSection" style="margin-top: 24px;">
            <h3 style="margin-bottom: 12px;">🛠️ Fix Options</h3>
            <div id="fixCardsContainer" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px;">
                <!-- Built dynamically -->
            </div>
            <div id="fixWarning" style="margin-top: 8px; font-size: 13px; color: #6B7280; display: none;">
                ⚠️ All services seem healthy. Fixes may temporarily disrupt connectivity.
            </div>
        </div>
    `;

    document.getElementById('pageContent').innerHTML = `
        <h1 style="margin-bottom: 20px;">🔌 Connection Troubleshoot</h1>
        ${cardsHtml}
        <div id="testResult" style="margin-top: 20px; display: none;"></div>
        ${fixOptionsHtml}
    `;

    // ---- Build fix cards for all services ----
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

        // ---- Attach fix button listeners ----
        document.querySelectorAll('.fix-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;
                const service = btn.dataset.service;

                // ---- Warning if all services are healthy ----
                const allPass = Object.values(testResults).every(r => r === true);
                if (allPass && Object.keys(testResults).length > 0) {
                    if (!confirm(`⚠️ All services are currently working. Are you sure you want to apply the fix "${action}"? This may temporarily disrupt connectivity.`)) {
                        return;
                    }
                }

                try {
                    const fixResp = await fetch(`${BACKEND_URL}/android-connectivity/fix/${currentDeviceId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action })
                    });
                    const fixData = await fixResp.json();
                    alert(fixData.message || 'Fix applied');
                    // Re-run the test for this service
                    await runConnectionTest(service);
                } catch (err) {
                    alert('Fix failed: ' + err.message);
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

    // ---- Run a connection test ----
    async function runConnectionTest(testId) {
        if (isRunning) return;
        isRunning = true;

        const card = document.getElementById(`conn-card-${testId}`);
        const statusSpan = document.getElementById(`conn-status-${testId}`);
        const btn = card.querySelector('.run-conn-test');
        const resultDiv = document.getElementById('testResult');
        const warningDiv = document.getElementById('fixWarning');

        // Disable all test buttons
        document.querySelectorAll('.run-conn-test').forEach(b => b.disabled = true);

        btn.disabled = true;
        btn.textContent = '⏳ Running...';
        statusSpan.style.color = '#f59e0b';
        statusSpan.textContent = '⏳ Running...';
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `<p>🔄 Testing ${testId}...</p>`;

        try {
            // ---- Toggle radios ----
            if (testId === 'wifi') {
                await runAdb('svc wifi enable');
                await runAdb('svc data disable');
                await new Promise(r => setTimeout(r, 1500));
            } else if (testId === 'mobile') {
                await runAdb('svc data enable');
                await runAdb('svc wifi disable');
                await new Promise(r => setTimeout(r, 1500));
            } else if (testId === 'bluetooth') {
                try {
                    await runAdb('svc bluetooth enable');
                } catch {
                    await runAdb('settings put global bluetooth_on 1');
                }
                await new Promise(r => setTimeout(r, 1000));
            }

            // ---- Call diagnostic ----
            const endpoint = `/connectivity/diagnose/${testId}/${currentDeviceId}`;
            const resp = await fetch(`${BACKEND_URL}${endpoint}`);
            const data = await resp.json();
            const pass = data.ok === true;
            testResults[testId] = pass;

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

            // ---- Show warning if all tests passed ----
            const allPass = Object.values(testResults).every(r => r === true);
            warningDiv.style.display = allPass ? 'block' : 'none';

        } catch (err) {
            statusSpan.style.color = '#d32f2f';
            statusSpan.textContent = '❌ Error';
            btn.textContent = 'Retry';
            btn.disabled = false;
            resultDiv.innerHTML = `<div style="background: #ffebee; padding: 12px; border-radius: 8px; color: #d32f2f;">❌ Error: ${err.message}</div>`;
        } finally {
            isRunning = false;
            document.querySelectorAll('.run-conn-test').forEach(b => b.disabled = false);
        }
    }

    // ---- Build fix cards on load ----
    buildAllFixCards();

    // ---- Attach test listeners ----
    document.querySelectorAll('.run-conn-test').forEach(btn => {
        btn.addEventListener('click', () => {
            const testId = btn.dataset.test;
            runConnectionTest(testId);
        });
    });

    // ---- initialise results ----
    testResults = {};
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

            // ---- ADB Required Check ----
            const adbRequiredPages = [
                'device-info',
                'hardware-tests',
                'connection-troubleshoot',
                'ai-conclusion',
                'repairs',
                'advanced'
                // Add any other pages that need ADB
            ];
            if (adbRequiredPages.includes(page) && !currentDeviceId) {
                showAdbRequiredModal();
                return; // Stop navigation
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