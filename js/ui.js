// ==================== GLOBALS ====================
let currentDeviceId = null;
let wizardStep = 0;

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
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeoutId);
    }
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
    try {
        console.log('[updateConnectionStatus] fetching devices');
        const data = await fetchDevices();
        console.log('[updateConnectionStatus] device data:', data);
        const devices = Array.isArray(data.devices) ? data.devices : Array.isArray(data) ? data : [];
        if (devices.length) {
            const firstDevice = devices[0];
            currentDeviceId = typeof firstDevice === 'string' ? firstDevice : (firstDevice.id || firstDevice.serial || firstDevice.device || String(firstDevice));
            console.log('[updateConnectionStatus] currentDeviceId set to:', currentDeviceId);
            statusSpan.innerText = `Connected: ${currentDeviceId}`;
            statusSpan.style.color = '#107c10';
            try {
                await updateDeviceInfo();
            } catch (deviceInfoErr) {
                console.warn('[updateConnectionStatus] updateDeviceInfo failed', deviceInfoErr);
            }
        } else {
            currentDeviceId = null;
            statusSpan.innerText = 'No device found';
            statusSpan.style.color = '#d83b01';
        }
    } catch (err) {
        console.error('[updateConnectionStatus] error:', err);
        currentDeviceId = null;
        statusSpan.innerText = 'ADB error';
        statusSpan.style.color = '#d83b01';
    }

    const activePage = document.querySelector('.nav-item.active')?.dataset.page;
    if (activePage === 'dashboard' && currentDeviceId && currentDeviceId !== previousDeviceId) {
        console.log('[updateConnectionStatus] re-rendering dashboard');
        await renderDashboard();
    }
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
            let html = `<p>Found ${apps.length} suspicious app(s):</p><ul style="list-style: none; padding-left: 0;">`;
            for (const app of apps) {
                html += `
                    <li style="margin-bottom: 16px; padding: 12px; background: #fff3e0; border-radius: 12px;">
                        <strong>${escapeHtml(app.displayName)}</strong> (${escapeHtml(app.packageName)})<br>
                        <span style="font-size: 12px;">Reason: ${escapeHtml(app.reason)}</span><br>
                        <span style="font-size: 12px;">Threat Level: ${app.threatLevel}</span><br>
                        ${app.threatTypes && app.threatTypes.length > 0 ? `<span style="font-size: 12px;">Threat Types: ${app.threatTypes.map(t => t.type).join(', ')}</span><br>` : ''}
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

// ==================== DASHBOARD ====================
async function renderDashboard() {
    const container = document.getElementById('pageContent');
    if (!container) return;

    if (!currentDeviceId) {
        container.innerHTML = `<div class="card" style="text-align: center; padding: 40px;">
            <i class="fas fa-plug" style="font-size: 48px; color: #d83b01;"></i>
            <h2>No Device Connected</h2>
            <p>Please connect your Android phone via USB and enable USB debugging.</p>
            <button id="openWizardFromDashboard" class="btn-primary">Open USB Debugging Wizard</button>
        </div>`;
        document.getElementById('openWizardFromDashboard')?.addEventListener('click', openWizard);
        return;
    }

    // ---- Quick Actions (cards) ----
    container.innerHTML = `
        <h1 style="margin-bottom: 24px;">Dashboard</h1>
        <div class="action-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px;">
            <div class="action-card" data-action="diagnostic" style="background: white; border-radius: 16px; padding: 20px 16px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; border: 1px solid #e5e7eb;">
                <div style="font-size: 32px; margin-bottom: 8px;">🔬</div>
                <div style="font-weight: 600; font-size: 15px;">Deep Diagnostic</div>
                <div style="font-size: 12px; color: #6B7280; margin-top: 4px;">Full system scan</div>
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
        <div id="deviceOverview" class="card" style="display: none;"></div>
        <div id="networkStatus" class="card" style="display: none;"></div>
        <div id="phoneSummary" class="card" style="display: none;">
            <div class="card-title"><i class="fas fa-mobile-alt"></i> Phone Summary</div>
            <div class="phone-summary-grid"></div>
        </div>
        <div id="alertsCard" class="card" style="display: none;"></div>
        <div id="diagnosticResult" class="card" style="display: none;"></div>
    `;

    // ---- Attach event listeners to the new action cards ----
    document.querySelector('.action-card[data-action="diagnostic"]')?.addEventListener('click', runDeepDiagnostic);
    document.querySelector('.action-card[data-action="install"]')?.addEventListener('click', async () => {
        if (!currentDeviceId) {
            alert('No device connected. Please connect a phone first.');
            return;
        }
        const btn = document.querySelector('.action-card[data-action="install"]');
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
            if (response.ok) alert('Android app installed successfully!');
            else alert('Installation failed: ' + data.error);
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            if (descEl) descEl.innerHTML = originalText;
        }
    });
    document.querySelector('.action-card[data-action="wizard"]')?.addEventListener('click', openWizard);
    document.querySelector('.action-card[data-action="help"]')?.addEventListener('click', showHelpModal);

    // ---- Fetch and display the rest of the dashboard data ----
    await new Promise(r => setTimeout(r, 50));

    try {
        const [battery, storage, ram, deviceText, wifiStatus, tempData] = await Promise.all([
            apiCall(`/hardware/battery?deviceId=${currentDeviceId}`, { timeoutMs: 8000 }).catch(() => ({ level: '?', health: 'unknown' })),
            apiCall(`/hardware/storage?deviceId=${currentDeviceId}`, { timeoutMs: 8000 }).catch(() => ({ total: '?', used: '?', free: '?' })),
            apiCall(`/hardware/ram?deviceId=${currentDeviceId}`, { timeoutMs: 8000 }).catch(() => ({ total: '?', used: '?' })),
            fetchWithTimeout(`${BACKEND_URL}/device/${currentDeviceId}`, {}, 7000).then(r => r.text()).catch(() => ''),
            fetchWithTimeout(`${BACKEND_URL}/wifi/status/${currentDeviceId}`, {}, 7000).then(r => r.json()).catch(() => null),
            apiCall(`/hardware/temperature?deviceId=${currentDeviceId}`, { timeoutMs: 8000 }).catch(() => ({ temperature: 'Unknown' }))
        ]);

        let model = 'Unknown', androidVer = '?', securityPatch = '?';
        if (deviceText) {
            let raw = deviceText;
            try { const parsed = JSON.parse(raw); if (typeof parsed === 'string') raw = parsed; } catch(e) {}
            const lines = raw.split(/\r?\n/);
            const props = {};
            for (const line of lines) {
                const match = line.match(/^\[(.*?)\]:\s*\[(.*?)\]$/);
                if (match) props[match[1]] = match[2];
            }
            model = props['ro.product.model'] || props['ro.product.name'] || 'Unknown';
            androidVer = props['ro.build.version.release'] || '?';
            securityPatch = props['ro.build.version.security_patch'] || '?';
        }

        // Alerts
        let alerts = [];
        if (battery.level && battery.level < 15) alerts.push('⚠️ Battery level critically low (<15%)');
        else if (battery.level && battery.level < 30) alerts.push('⚠️ Battery level low (<30%)');
        if (alerts.length) {
            document.getElementById('alertsCard').innerHTML = `
                <div class="card-title"><i class="fas fa-exclamation-triangle"></i> Alerts</div>
                <ul>${alerts.map(a => `<li>${a}</li>`).join('')}</ul>
            `;
            document.getElementById('alertsCard').style.display = 'block';
        }
    } catch (err) {
        console.error('Dashboard data error:', err);
    }

    // (Optional: if you still have a test scan button, re‑attach it)
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
    body.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <div class="spinner"></div>
            <p>Loading data...</p>
        </div>
    `;
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
    body.innerHTML = '<div class="modal-loading"><div class="spinner"></div><p>Loading storage...</p></div>';
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
    body.innerHTML = '<div class="modal-loading"><div class="spinner"></div><p>Loading RAM usage...</p></div>';
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
    body.innerHTML = '<div class="modal-loading"><div class="spinner"></div><p>Loading security status...</p></div>';
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
        'Spyware': '📷 Accesses your camera, microphone, location, or messages without your knowledge.',
        'Ransomware': '💰 Can lock your device or encrypt your files and demand payment.',
        'Adware': '📢 Displays aggressive ads and may redirect you to malicious websites.',
        'Banking Trojan': '🏦 Targets banking/financial apps to steal your login credentials.',
        'Data Stealer': '📁 Extracts your personal files, messages, or photos and sends them to a remote server.',
        'Backdoor': '🚪 Allows remote control of your device without your permission.',
        'Fake App': '🎭 Pretends to be a legitimate app but may steal your information.',
        'Riskware': '⚠️ Legitimate app that can be exploited by malware — review its behavior.',
        'Information Stealer': '🔐 Collects your passwords, emails, and personal data.',
        'Premium Dialer': '💸 Can send SMS or make calls to premium numbers, causing unexpected charges.',
        'Trojan': '🐴 Disguised as a normal app; performs malicious actions in the background.'
    };
    // Handle both array of strings and array of objects with .type
    const types = Array.isArray(malwareTypes) ? malwareTypes.map(t => typeof t === 'string' ? t : t.type) : [];
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
async function runDeepDiagnostic() {
    // Get or create modal
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

    modal.style.display = 'none';
    const modalTitle = document.getElementById('quickDiagModalTitle');
    const modalBody = document.getElementById('quickDiagModalBody');
    modalTitle.textContent = 'Running Deep Diagnostic';
    modalBody.innerHTML = '<div class="spinner"></div><p style="text-align: center;">Analyzing system...</p>';
    modal.style.display = 'flex';

    const closeModal = () => { modal.style.display = 'none'; };
    document.getElementById('closeQuickDiagModal')?.addEventListener('click', closeModal);
    document.getElementById('closeQuickDiagModalBtn')?.addEventListener('click', closeModal);
    window.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // ========== ANDROID APP HELPER ==========
    async function ensureAndroidAppOpen() {
        try {
            const stateRes = await fetch(`${BACKEND_URL}/mobile-app-state/${currentDeviceId}`);
            const state = await stateRes.json();
            if (!state.installed) {
                const modal = document.createElement('div');
                modal.className = 'modal';
                modal.style.display = 'flex';
                modal.innerHTML = `
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>SmartHub Diagnostics App Required</h3>
                            <span class="close-button">&times;</span>
                        </div>
                        <div class="modal-body">
                            <p>The SmartHub Diagnostics app is not installed on your phone.</p>
                            <p>Please install it using one of these methods:</p>
                            <ul>
                                <li>Click the "Install Android App" button in the SmartHub dashboard.</li>
                                <li>Or manually install the APK from the SmartHub installation folder.</li>
                            </ul>
                            <button id="installAppBtn" class="btn-primary">Go to Install</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
                modal.querySelector('.close-button').onclick = () => modal.remove();
                modal.querySelector('#installAppBtn').onclick = () => {
                    modal.remove();
                    document.getElementById('installAppBtn')?.click();
                };
                return false;
            }
            if (state.running) return true;
            const openRes = await fetch(`${BACKEND_URL}/mobile-app-open`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: currentDeviceId })
            });
            const openData = await openRes.json();
            if (openData.ok) {
                await new Promise(r => setTimeout(r, 3000));
                return true;
            }
            alert('Failed to open the SmartHub Diagnostics app. Please open it manually.');
            return false;
        } catch (err) {
            console.error('ensureAndroidAppOpen error:', err);
            alert('Error communicating with the device. Make sure USB debugging is enabled.');
            return false;
        }
    }

    // ========== ENSURE ANDROID APP IS READY (abort if not) ==========
    const appReady = await ensureAndroidAppOpen();
    if (!appReady) {
        modalTitle.textContent = 'Diagnostic Failed';
        modalBody.innerHTML = '<div style="color: #d32f2f; text-align: center;">SmartHub Diagnostics app is required. Please install it and try again.</div>';
        return;
    }

    // ========== OVERLAY MONITORING HELPERS ==========
    let overlayEvents = [];
    async function startOverlayMonitoring() {
        try {
            await fetch(`${BACKEND_URL}/api/overlay-monitor/start-timeout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId: currentDeviceId, durationMs: 60000 })
            });
            console.log('Overlay monitoring started');
        } catch (err) { console.warn('Could not start overlay monitoring:', err); }
    }
    async function stopAndFetchOverlayEvents() {
        try {
            await fetch(`${BACKEND_URL}/api/overlay-monitor/stop`, { method: 'POST' });
            const res = await fetch(`${BACKEND_URL}/api/overlay-monitor/events?deviceId=${currentDeviceId}`);
            const data = await res.json();
            overlayEvents = data.events || [];
        } catch (err) { console.warn('Could not fetch overlay events:', err); }
    }

    // ========== FRIDA DYNAMIC ANALYSIS HELPER ==========
    async function runFridaOnPackage(packageName, timeoutMs = 300000) {
        try {
            const response = await fetch(`${BACKEND_URL}/api/frida/scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    deviceId: currentDeviceId,
                    packageName,
                    timeoutMs,
                    stealth: true,
                    scriptName: 'full_monitor.js'
                })
            });
            const data = await response.json();
            return data.events || [];
        } catch (err) {
            console.warn('Frida scan failed:', err);
            return [];
        }
    }

    // ========== REAL‑TIME SYNC ==========
    let realTimeWs = null;
    let realTimeEvents = [];

    async function setupAdbForward(deviceId) {
        const res = await fetch(`${BACKEND_URL}/api/adb-forward`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId })
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`ADB forward failed: ${res.status} ${text}`);
        }
        return res.json();
    }

    async function connectRealTime(deviceId) {
        try {
            await setupAdbForward(deviceId);
        } catch (err) {
            throw new Error(`ADB forward failed: ${err.message}`);
        }
        return new Promise((resolve, reject) => {
            const ws = new WebSocket('ws://localhost:12345');
            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error('WebSocket connection timeout (5s)'));
            }, 5000);
            ws.onopen = () => {
                clearTimeout(timeout);
                console.log('Real‑time WebSocket connected');
                realTimeWs = ws;
                resolve();
            };
            ws.onerror = () => {
                clearTimeout(timeout);
                reject(new Error('WebSocket connection failed. Is the Android app running?'));
            };
            ws.onmessage = (msg) => {
                try {
                    const event = JSON.parse(msg.data);
                    if (event.type !== 'heartbeat') {
                        realTimeEvents.push(event);
                        console.log('[RealTime]', event);
                    }
                } catch (e) {}
            };
        });
    }

    try {
        // ---- REAL‑TIME SYNC (optional) ----
        try {
            await connectRealTime(currentDeviceId);
            console.log('Real‑time sync active');
        } catch (err) {
            console.warn('Real‑time sync unavailable:', err.message);
        }

        startOverlayMonitoring();

        // 1. Hardware checks – fetch data (only used for storage summary)
        const battery = await apiCall(`/hardware/battery?deviceId=${currentDeviceId}`).catch(() => ({ level: 0, health: 'unknown' }));
        const storage = await apiCall(`/hardware/storage?deviceId=${currentDeviceId}`).catch(() => ({ total: '0', used: '0', free: '0' }));
        const ram = await apiCall(`/hardware/ram?deviceId=${currentDeviceId}`).catch(() => ({ total: '0', used: '0' }));

        // Fetch storage details for breakdown
        let storageDetails = null;
        try {
            const detailsRes = await fetchWithTimeout(`${BACKEND_URL}/api/hardware/storage-details?deviceId=${currentDeviceId}`, {}, 15000);
            if (detailsRes.ok) storageDetails = await detailsRes.json();
        } catch (e) { console.warn('Could not fetch storage details:', e); }

        // ---- Fetch large files (>= 500MB) ----
        let largeFiles = [];
        let largeFilesError = null;
        try {
            const filesRes = await fetch(`${BACKEND_URL}/api/large-files?deviceId=${encodeURIComponent(currentDeviceId)}&minSize=0.5`);
            if (filesRes.ok) {
                const filesData = await filesRes.json();
                largeFiles = filesData.files || [];
            } else {
                largeFilesError = `Failed to load large files: ${filesRes.status} ${filesRes.statusText}`;
                console.warn('Large files request failed:', filesRes.status, filesRes.statusText);
            }
        } catch (e) {
            largeFilesError = `Could not fetch large files: ${e.message}`;
            console.warn('Could not fetch large files:', e);
        }

        // ---- Helper functions ----
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

        // ---- Build storage summary (no bars) ----
        let storageHtml = `
            <div style="margin-bottom: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; font-size: 14px;">
                    <span><strong>💾 Storage</strong> ${formatSize(storageUsedBytes)} / ${formatSize(storageTotalBytes)}</span>
                    <span style="color: ${storagePercent > 90 ? '#dc3545' : '#28a745'};">${storagePercent.toFixed(1)}% used</span>
                </div>
                ${storagePercent > 90 ? `<div style="color: #d32f2f; font-size: 13px; margin-top: 4px;">⚠️ Storage is nearly full.</div>` : ''}
            </div>
        `;

        // ---- Storage breakdown (clickable categories) ----
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
                    <div style="font-size: 13px; color: #555; margin-bottom: 10px;">Showing a combined list of all files ≥500MB. Category buttons are hidden to simplify analysis.</div>
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
            storageHtml += breakdownHtml;
        }

        // ---- Large files list ----
        let largeFilesHtml = '';
        if (largeFilesError) {
            largeFilesHtml = `
                <div style="margin-top: 12px; padding: 12px; background: #fff3cd; border-radius: 8px; border: 1px solid #ffeeba; color: #856404;">
                    <strong>⚠️ Large files unavailable.</strong><br>
                    ${escapeHtml(largeFilesError)}
                </div>
            `;
        } else if (largeFiles.length > 0) {
            largeFilesHtml = `
                <div style="margin-top: 12px; padding: 12px; background: #fff; border-radius: 8px; border: 1px solid #e5e7eb;">
                    <h4 style="margin: 0 0 8px 0; font-size: 15px;">📁 Large Files (≥500MB)</h4>
                    <div style="font-size: 12px; color: #6c757d; margin-bottom: 8px;">Combined scan across available storage roots. Duplicates are filtered.</div>
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
            largeFilesHtml = `
                <div style="margin-top: 12px; font-size: 13px; color: #28a745; padding: 8px; background: #e8f5e9; border-radius: 6px;">
                    ✅ No large files (≥500MB) found.
                </div>
            `;
        }
        storageHtml += largeFilesHtml;

        // ---- Fetch suspicious apps ----
        let suspiciousAppsList = [];
        try {
            const appsResponse = await fetch(`/api/suspicious-apps?deviceId=${currentDeviceId}`);
            if (appsResponse.ok) {
                const appsData = await appsResponse.json();
                suspiciousAppsList = appsData.suspiciousApps || [];
            }
        } catch (err) { console.error('Failed to fetch suspicious apps:', err); }

        // ===== SORT APPS BY RISK (HIGHEST FIRST) =====
        suspiciousAppsList.sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));

        // ===== DEDUPLICATE APPS =====
        const seen = new Set();
        suspiciousAppsList = suspiciousAppsList.filter(app => {
            const key = app.packageName;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // ===== BUILD SUMMARY BAR =====
        const initialCritical = suspiciousAppsList.filter(a => (a.riskScore || 0) >= 80).length;
        const initialHigh = suspiciousAppsList.filter(a => (a.riskScore || 0) >= 60 && (a.riskScore || 0) < 80).length;
        const initialMedium = suspiciousAppsList.filter(a => (a.riskScore || 0) >= 35 && (a.riskScore || 0) < 60).length;
        const initialLow = suspiciousAppsList.filter(a => (a.riskScore || 0) < 35).length;

        let summaryBarHtml = `
            <div id="summaryBar" style="display: flex; gap: 16px; padding: 12px 16px; background: #f8f9fa; border-radius: 8px; margin-bottom: 16px; flex-wrap: wrap;">
                <span><span style="color: #c62828; font-weight: bold;">🔴 ${initialCritical}</span> Critical</span>
                <span><span style="color: #e65100; font-weight: bold;">🟠 ${initialHigh}</span> High</span>
                <span><span style="color: #e67e22; font-weight: bold;">🟡 ${initialMedium}</span> Medium</span>
                <span><span style="color: #2e7d32; font-weight: bold;">🟢 ${initialLow}</span> Low</span>
                <span style="margin-left: auto; color: #888;">Total: ${suspiciousAppsList.length} apps</span>
            </div>
        `;

        // ===== BUILD APP CARDS =====
        const escape = (str) => escapeHtml(str);
        let appsHtml = '';
        if (suspiciousAppsList.length === 0) {
            appsHtml = `<div><h3 style="color: #2e7d32;">✅ No Suspicious Apps Found</h3><p>No known dangerous apps detected.</p></div>`;
        } else {
            appsHtml = `<div><h3 id="suspiciousAppsHeading" style="color: #ed6c02; margin-bottom: 8px;">⚠️ Suspicious Apps Found (${suspiciousAppsList.length})</h3>${summaryBarHtml}<div id="appsContainer" style="display: flex; flex-direction: column; gap: 12px;">`;

            for (const app of suspiciousAppsList) {
                const threat = getThreatLevel(app.riskScore || 0);
                const threatIcon = app.riskScore >= 80 ? '🔴' : app.riskScore >= 60 ? '🟠' : app.riskScore >= 35 ? '🟡' : '🟢';
                const humanReasons = getHumanFriendlyRiskReasons(app);
                const threatSummary = (app.threatTypes || []).length > 0 || (app.suspiciousIndicators && app.suspiciousIndicators.length > 0)
                    ? getHumanReadableThreats(app.threatTypes || [], app.suspiciousIndicators || [])
                    : [];

                let summaryBullets = '';
                if (threatSummary.length > 0) {
                    summaryBullets = `<ul style="margin: 4px 0 8px 0; padding-left: 20px; font-size: 13px;">`;
                    for (const t of threatSummary.slice(0, 3)) {
                        summaryBullets += `<li>${t}</li>`;
                    }
                    if (threatSummary.length > 3) {
                        summaryBullets += `<li>... and ${threatSummary.length - 3} more concerns</li>`;
                    }
                    summaryBullets += `</ul>`;
                }

                const riskLabel = threat.label;
                const riskColor = threat.color;
                const riskBg = threat.bg;

                appsHtml += `
                    <div id="app-card-${escape(app.packageName)}" class="app-card-item" data-package="${escape(app.packageName)}"
                         style="margin-bottom: 12px; padding: 16px; border-radius: 12px;
                                border-left: 6px solid ${riskColor};
                                background: ${riskBg};
                                box-shadow: 0 2px 8px rgba(0,0,0,0.06);
                                transition: transform 0.15s ease, box-shadow 0.15s ease;
                                cursor: default;">

                        <!-- Header: Threat Icon + App Name -->
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
                            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                <span id="icon-${escape(app.packageName)}" style="font-size: 20px;">${threatIcon}</span>
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

                        <!-- Reason -->
                        <div style="font-size: 13px; color: #555; margin-top: 6px;">
                            ${escape(app.reason || '')}
                        </div>

                        <!-- Human-Friendly Risk Reasons -->
                        ${humanReasons.length > 0 ? `
                            <div style="font-size: 13px; margin-top: 6px; color: #424242;
                                        background: rgba(255,255,255,0.5); padding: 6px 10px;
                                        border-radius: 6px;">
                                ${humanReasons.join('; ')}
                            </div>
                        ` : ''}

                        <!-- Threat Summary Bullets -->
                        ${summaryBullets}

                        <!-- Meta Info -->
                        <div style="display: flex; gap: 16px; margin-top: 8px; font-size: 12px; color: #666; flex-wrap: wrap;">
                            ${app.installer ? `<span>📦 Installed via: ${escape(app.installer)}</span>` : ''}
                            ${app.installDate ? `<span>📅 Installed: ${escape(app.installDate)}</span>` : ''}
                        </div>

                        <!-- Deep Scan Area -->
                        <div id="deep-${escape(app.packageName)}" style="margin-top: 10px; font-size: 13px; border-top: 1px dashed #ddd; padding-top: 10px;">
                            <div class="spinner" style="width: 18px; height: 18px; margin: 0; display: inline-block;"></div>
                            <span style="font-size: 12px; margin-left: 8px; color: #888;">Running deep scan...</span>
                        </div>
                    </div>
                `;
            }
            appsHtml += `</div></div>`;
        }

        // Combine storage and apps
        modalBody.innerHTML = storageHtml + appsHtml;

        // 3. Perform deep scans (unchanged)
        const appRiskMap = new Map();
        const scanPromises = suspiciousAppsList.map(async (app) => {
            try {
                const response = await fetch(`${BACKEND_URL}/api/scan-apk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deviceId: currentDeviceId, packageName: app.packageName })
                });
                const data = await response.json();
                const container = document.getElementById(`deep-${app.packageName}`);
                const appCard = document.getElementById(`app-card-${app.packageName}`);
                if (!container || !appCard) return;

                if (data.ok) {
                    const analysis = data.staticAnalysis;
                    const riskScore = analysis.risk_score || 0;
                    appRiskMap.set(app.packageName, { riskScore, displayName: app.displayName });

                    if (riskScore <= 29) {
                        appCard.remove();
                        const remainingCards = document.querySelectorAll('.app-card-item').length;
                        const heading = document.getElementById('suspiciousAppsHeading');
                        if (heading) {
                            heading.textContent = `⚠️ Suspicious Apps Found (${remainingCards})`;
                            if (remainingCards === 0) heading.outerHTML = '<h3 style="color: #2e7d32;">✅ No Suspicious Apps Found</h3><p>All apps are safe (score ≤29).</p>';
                        }
                        return;
                    }

                    // Update card appearance
                    const newThreat = getThreatLevel(riskScore);
                    const newIcon = riskScore >= 80 ? '🔴' : riskScore >= 60 ? '🟠' : riskScore >= 35 ? '🟡' : '🟢';

                    appCard.style.borderLeftColor = newThreat.color;
                    const iconSpan = document.getElementById(`icon-${app.packageName}`);
                    if (iconSpan) iconSpan.textContent = newIcon;
                    appCard.style.background = newThreat.bg;

                    // Deep scan details
                    const threat = getThreatLevel(riskScore);
                    const threatTypes = analysis.malware_types || [];
                    const suspiciousIndicators = analysis.suspicious_indicators || [];
                    const humanThreats = getHumanReadableThreats(threatTypes, suspiciousIndicators);

                    let humanSummary = '';
                    if (humanThreats.length > 0) {
                        humanSummary = `<ul style="margin: 4px 0 8px 0; padding-left: 18px; font-size: 12px;">`;
                        for (const t of humanThreats) {
                            humanSummary += `<li>${t}</li>`;
                        }
                        humanSummary += `</ul>`;
                    }

                    const riskBadge = `<span style="background: ${threat.bg}; color: ${threat.color}; padding: 2px 10px; border-radius: 12px; font-weight: 600; font-size: 12px;">${threat.label}</span>`;

                    let html = `
                        <div style="margin-top: 8px;">
                            ${riskBadge} &nbsp; Risk Score: <strong>${riskScore}/100</strong>
                            ${humanSummary}
                            <details style="font-size: 12px; color: #666; margin-top: 4px;">
                                <summary style="cursor: pointer;">🔍 Technical details</summary>
                                <div style="margin-top: 4px; padding: 8px; background: #f5f5f5; border-radius: 6px;">
                                    <strong>Permissions:</strong> ${analysis.dangerous_permissions?.length || 0} dangerous<br>
                                    ${analysis.isPacked ? '⚠️ Packed/obfuscated code detected<br>' : ''}
                                    ${analysis.isPolymorphic ? '⚠️ Advanced evasion techniques detected<br>' : ''}
                                    ${analysis.yara_matches && analysis.yara_matches.length > 0 ? `YARA matches: ${analysis.yara_matches.length}<br>` : ''}
                                    ${analysis.suspicious_indicators && analysis.suspicious_indicators.length ? `Suspicious: ${escapeHtml(analysis.suspicious_indicators.join(', '))}` : ''}
                                </div>
                            </details>
                        </div>
                    `;
                    container.innerHTML = html;
                } else {
                    container.innerHTML = `<span style="color: #d32f2f;">Deep scan failed: ${data.error}</span>`;
                }
            } catch (err) {
                const container = document.getElementById(`deep-${app.packageName}`);
                if (container) container.innerHTML = `<span style="color: #d32f2f;">Deep scan error: ${err.message}</span>`;
            }
        });
        await Promise.all(scanPromises);

        // ===== UPDATE SUMMARY BAR =====
        const remainingCards = document.querySelectorAll('.app-card-item');
        let finalCritical = 0, finalHigh = 0, finalMedium = 0, finalLow = 0;
        for (const card of remainingCards) {
            const pkg = card.dataset.package;
            const info = appRiskMap.get(pkg);
            if (info) {
                const score = info.riskScore;
                if (score >= 80) finalCritical++;
                else if (score >= 60) finalHigh++;
                else if (score >= 35) finalMedium++;
                else finalLow++;
            }
        }

        const summaryBar = document.getElementById('summaryBar');
        if (summaryBar) {
            summaryBar.innerHTML = `
                <span><span style="color: #c62828; font-weight: bold;">🔴 ${finalCritical}</span> Critical</span>
                <span><span style="color: #e65100; font-weight: bold;">🟠 ${finalHigh}</span> High</span>
                <span><span style="color: #e67e22; font-weight: bold;">🟡 ${finalMedium}</span> Medium</span>
                <span><span style="color: #2e7d32; font-weight: bold;">🟢 ${finalLow}</span> Low</span>
                <span style="margin-left: auto; color: #888;">Total: ${remainingCards.length} apps</span>
            `;
        }

        await stopAndFetchOverlayEvents();

        // ---- Frida on high-risk apps ----
        const highRiskApps = suspiciousAppsList
            .map(app => ({ ...app, riskScore: appRiskMap.get(app.packageName)?.riskScore || 0 }))
            .filter(app => app.riskScore >= 40)
            .sort((a, b) => b.riskScore - a.riskScore);
        let allFridaEvents = [];
        if (highRiskApps.length) {
            modalBody.insertAdjacentHTML('beforeend', '<div style="margin-top:20px;"><div class="spinner"></div><p>Running dynamic analysis on high-risk apps...</p></div>');
            for (const app of highRiskApps) {
                const events = await runFridaOnPackage(app.packageName, 300000);
                if (events.length) allFridaEvents.push({ package: app.packageName, displayName: app.displayName, events });
            }
            const loadingDiv = modalBody.querySelector('.spinner')?.parentElement;
            if (loadingDiv) loadingDiv.remove();
            if (allFridaEvents.length) {
                let fridaHtml = `<div style="margin-top:20px; border-top:1px solid #ddd; padding-top:15px;"><h3>🔬 Dynamic Analysis (Frida)</h3>`;
                for (const appEv of allFridaEvents) {
                    fridaHtml += `<h4>📱 ${escapeHtml(appEv.displayName)} (${escapeHtml(appEv.package)})</h4><ul>`;
                    for (const ev of appEv.events.slice(0,15)) fridaHtml += `<li>${escapeHtml(JSON.stringify(ev))}</li>`;
                    if (appEv.events.length > 15) fridaHtml += `<li>... and ${appEv.events.length-15} more</li>`;
                    fridaHtml += `</ul>`;
                }
                fridaHtml += '<p class="text-muted" style="font-size:12px;">API calls detected at runtime.</p></div>';
                modalBody.insertAdjacentHTML('beforeend', fridaHtml);
            }
        }

        if (overlayEvents.length) {
            let overlayHtml = '<div style="margin-top:20px; border-top:1px solid #ddd; padding-top:15px;"><h3>🕵️ Overlay / Popup Events Detected</h3><ul>';
            for (const ev of overlayEvents.slice(0,15)) overlayHtml += `<li><strong>${new Date(ev.timestamp).toLocaleTimeString()}</strong> - Package: ${escapeHtml(ev.package)}</li>`;
            if (overlayEvents.length > 15) overlayHtml += `<li>... and ${overlayEvents.length-15} more</li>`;
            overlayHtml += '</ul><p class="text-muted" style="font-size:12px;">Apps that draw overlays during the scan are often adware or malicious.</p></div>';
            modalBody.insertAdjacentHTML('beforeend', overlayHtml);
        }

        // ========== ROOTKIT / KERNEL DETECTION ==========
        try {
            const rootkitRes = await fetch(`${BACKEND_URL}/api/rootkit-scan?deviceId=${currentDeviceId}`);
            const rootkitData = await rootkitRes.json();
            if (rootkitData.rootkitIndicators) {
                let rootkitHtml = '<div style="margin-top: 20px; border-top: 1px solid #ddd; padding-top: 15px;"><h3>🔒 Rootkit / Kernel Anomalies Detected</h3>';
                if (rootkitData.dmesgAnomalies?.length) {
                    rootkitHtml += '<div><strong>⚠️ Kernel log anomalies:</strong><ul>';
                    for (const line of rootkitData.dmesgAnomalies.slice(0, 5)) {
                        rootkitHtml += `<li>${escapeHtml(line)}</li>`;
                    }
                    if (rootkitData.dmesgAnomalies.length > 5) rootkitHtml += `<li>... and ${rootkitData.dmesgAnomalies.length - 5} more</li>`;
                    rootkitHtml += '</ul></div>';
                }
                if (rootkitData.suspiciousModules?.length) {
                    rootkitHtml += '<div><strong>⚠️ Suspicious kernel modules loaded:</strong><ul>';
                    for (const mod of rootkitData.suspiciousModules.slice(0, 10)) {
                        rootkitHtml += `<li>${escapeHtml(mod)}</li>`;
                    }
                    rootkitHtml += '</ul></div>';
                }
                if (rootkitData.hiddenProcesses?.length) {
                    rootkitHtml += `<div><strong>⚠️ Hidden processes (PID not in ps):</strong> ${rootkitData.hiddenProcesses.join(', ')}</div>`;
                }
                rootkitHtml += '<p class="text-muted" style="font-size:12px;">Possible kernel‑level compromise – requires advanced removal.</p></div>';
                modalBody.insertAdjacentHTML('beforeend', rootkitHtml);
            }
        } catch (err) {
            console.warn('Rootkit scan failed:', err);
        }

        // ========== FILE SYSTEM MONITORING ==========
        try {
            const filesRes = await fetch(`${BACKEND_URL}/api/recent-files?deviceId=${currentDeviceId}&minutes=10`);
            const filesData = await filesRes.json();
            if (filesData.suspicious && filesData.suspicious.length > 0) {
                let fileHtml = '<div style="margin-top:20px; border-top:1px solid #ddd; padding-top:15px;"><h3>📁 Suspicious File Activity Detected</h3><ul>';
                for (const f of filesData.suspicious.slice(0, 20)) {
                    fileHtml += `<li>${escapeHtml(f)}</li>`;
                }
                if (filesData.suspicious.length > 20) fileHtml += `<li>... and ${filesData.suspicious.length - 20} more</li>`;
                fileHtml += '</ul><p class="text-muted" style="font-size:12px;">Recently created or modified files with suspicious extensions (APK, DEX, SO, etc.) – possible payload drop.</p></div>';
                modalBody.insertAdjacentHTML('beforeend', fileHtml);
            }
        } catch (err) {
            console.warn('File monitor failed:', err);
        }

        // ========== REAL‑TIME EVENTS ==========
        const filteredEvents = realTimeEvents.filter(ev => ev.type !== 'heartbeat');
        if (filteredEvents.length > 0) {
            let realTimeHtml = '<div style="margin-top:20px; border-top:1px solid #ddd; padding-top:15px;"><h3>📡 Real‑time Events (from Android app)</h3><ul>';
            for (const ev of filteredEvents.slice(0, 20)) {
                const time = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : '';
                realTimeHtml += `<li>[${time}] ${ev.type}: ${escapeHtml(JSON.stringify(ev))}</li>`;
            }
            if (filteredEvents.length > 20) realTimeHtml += `<li>... and ${filteredEvents.length - 20} more</li>`;
            realTimeHtml += '</ul><p class="text-muted">Live events captured during the diagnostic – proves real‑time synchronization.</p></div>';
            modalBody.insertAdjacentHTML('beforeend', realTimeHtml);
        }

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
        if (realTimeWs && realTimeWs.readyState === WebSocket.OPEN) {
            realTimeWs.close();
        }
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

    // Helper to prepare device for specific tests
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
            if (testType === 'speaker' || testType === 'earpiece' || testType === 'sound') {
                // Set media volume to comfortable level using the working command
                try {
                    await runAdb('cmd media_session volume --stream 3 --set 7');
                } catch (e) {
                    await runAdb('settings put system volume_music 7');
                }
            }
        } catch (e) {
            console.warn('Device preparation failed:', e);
        }
    }

    // ---- HTML TEMPLATE ----
    const html = `
        <div class="info-card" style="text-align: center;">
            <div class="card-header"><i class="fas fa-microscope"></i> Hardware Diagnostics</div>
            <div class="card-content">
                <p>Run a complete hardware test suite. The phone will perform actions automatically. Follow the instructions in the popup.</p>
                <button id="startHwTestBtn" class="btn-primary" style="font-size: 18px;">🔍 Start Full Hardware Test</button>
            </div>
        </div>
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
    document.getElementById('pageContent').innerHTML = html;

    // ---- Modal and helpers ----
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

    // waitForUserConfirmation – no timeout (waits forever)
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

    // ===== TESTS ARRAY =====
    const tests = [
        // ---- AUTOMATIC TESTS ----
        { id: 'battery', name: 'Battery', run: async () => {
            const data = await apiCall(`/hardware/battery?deviceId=${currentDeviceId}`);
            const level = data.level || 0;
            const health = data.health || 'unknown';
            const passed = (level >= 20 && health === 'good');
            const message = passed ? `Level: ${level}%, health: ${health}` : (level < 20 ? 'Low battery (<20%)' : 'Poor battery health');
            return { passed, message };
        }},
        { id: 'storage', name: 'Storage', run: async () => {
            const data = await apiCall(`/hardware/storage?deviceId=${currentDeviceId}`);
            const free = data.free || '0';
            let freeGB = 0;
            const match = String(free).match(/(\d+(?:\.\d+)?)/);
            if (match) freeGB = parseFloat(match[1]);
            const passed = freeGB > 1.0;
            const message = `Free space: ${free}`;
            return { passed, message };
        }},
        { id: 'sensors', name: 'Sensors', run: async () => {
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
        }},
        { id: 'display', name: 'Display', run: async () => {
            const deviceRes = await fetch(`${BACKEND_URL}/device/${currentDeviceId}`);
            let raw = await deviceRes.text();
            try { const p = JSON.parse(raw); if (typeof p === 'string') raw = p; } catch(e) {}
            const width = raw.match(/\[sys.logical.width\]:\s*\[(\d+)\]/)?.[1];
            const height = raw.match(/\[sys.logical.height\]:\s*\[(\d+)\]/)?.[1];
            const passed = width && height;
            const message = passed ? `${width} x ${height}` : 'Could not read resolution';
            return { passed, message };
        }},
        // ---- PROXIMITY (automatic) ----
        { id: 'proximity', name: 'Proximity Sensor', run: async () => {
            const features = await getHardwareFeatures();
            const hasProx = features.some(f => f === 'android.hardware.sensor.proximity');
            if (!hasProx) {
                return { passed: true, message: 'Not supported (no proximity sensor)' };
            }
            return { passed: true, message: 'Proximity sensor present' };
        }},
        // ---- GYROSCOPE (automatic) ----
        { id: 'gyro', name: 'Gyroscope/Accelerometer', run: async () => {
            const features = await getHardwareFeatures();
            const hasGyro = features.some(f => f === 'android.hardware.sensor.gyroscope');
            const hasAccel = features.some(f => f === 'android.hardware.sensor.accelerometer');
            if (!hasGyro && !hasAccel) {
                return { passed: true, message: 'Not supported (no motion sensors)' };
            }
            return { passed: true, message: `Motion sensors present (Gyro: ${hasGyro}, Accel: ${hasAccel})` };
        }},
        // ---- MICROPHONE (automatic with visualizer) ----
        { id: 'microphone', name: 'Microphone', run: async () => {
    await launchAndroidTest('microphone');
    modalTitle.textContent = 'Microphone Test';
    modalBody.innerHTML = `<p>🎤 The phone is recording and then playing back your voice.</p><p>After the recording, the sound will loop.</p><p>Did you hear your voice clearly?</p>`;
    modal.style.display = 'flex';
    const result = await waitForUserConfirmation(); // no timeout
    closeModal();
    await runAdb('input keyevent KEYCODE_BACK');
    await new Promise(r => setTimeout(r, 500));
    await launchAndroidApp();
    const passed = (result === 'yes');
    const message = passed ? 'User confirmed microphone working' : 'Microphone issue reported';
    return { passed, message };
}},
        // ---- GPS (automatic with enable and longer wait) ----
        { id: 'gps', name: 'GPS', run: async () => {
    await prepareDeviceForTest('gps');
    let passed = false;
    let message = 'GPS did not lock';
    try {
        // 1. Enable location using modern Android command
        await runAdb('cmd location set-location-enabled true');
        await new Promise(r => setTimeout(r, 1000));

        // 2. Check if location is enabled
        let isEnabled = false;
        try {
            const output = await runAdb('cmd location is-location-enabled');
            isEnabled = output.trim().toLowerCase() === 'true';
        } catch (e) {
            // Fallback: check location_mode
            const mode = await runAdb('settings get secure location_mode');
            if (mode.trim() === '3') isEnabled = true;
        }

        // 3. If not enabled, force via settings
        if (!isEnabled) {
            await runAdb('settings put secure location_mode 3');
            await new Promise(r => setTimeout(r, 1000));
            const mode = await runAdb('settings get secure location_mode');
            if (mode.trim() === '3') isEnabled = true;
        }

        // 4. Report result
        if (isEnabled) {
            passed = true;
            message = 'GPS enabled (high accuracy)';
            // Optionally check for a fix (no need to fail if no fix)
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
}},
        // ---- FINGERPRINT (automatic) ----
        { id: 'fingerprint', name: 'Fingerprint', run: async () => {
            const features = await getHardwareFeatures();
            const hasFingerprint = features.some(f => f === 'android.hardware.fingerprint');
            return { passed: true, message: hasFingerprint ? 'Fingerprint hardware present' : 'Not supported (no fingerprint sensor)' };
        }},
        // ---- NFC (automatic) ----
        { id: 'nfc', name: 'NFC', run: async () => {
            await prepareDeviceForTest('nfc');
            const features = await getHardwareFeatures();
            const hasNfc = features.some(f => f === 'android.hardware.nfc');
            return { passed: true, message: hasNfc ? 'NFC hardware present' : 'Not supported (no NFC)' };
        }},

        // ---- MANUAL TESTS (no timeout) ----
        // ---- VIBRATION ----
        { id: 'vibration', name: 'Vibration', run: async () => {
    // Always try the working command – skip hardware feature check
    let vibrated = false;
    try {
        await runAdb('cmd vibrator_manager synced oneshot 500');
        vibrated = true;
    } catch (e) {
        // Fallbacks
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
}},
        // ---- FLASHLIGHT ----
        { id: 'flashlight', name: 'Flashlight', run: async () => {
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
        }},
        // ---- SPEAKER ----
        { id: 'speaker', name: 'Speaker', run: async () => {
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
        }},
        // ---- CAMERA ----
        { id: 'camera', name: 'Camera', run: async () => {
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
        }},
        // ---- EARPIECE ----
        { id: 'headphone', name: 'Headphone', run: async () => {
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
}},
        // ---- TOUCH (manual with drawing UI) ----
        { id: 'touch', name: 'Touch Screen', run: async () => {
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
        }}
    ];

    // ---- Run all tests with delays ----
    async function runAllTests() {
    const resultsContainer = document.getElementById('hwResults');
    resultsContainer.style.display = 'block';
    const cardsContainer = document.getElementById('hwCardsContainer');
    cardsContainer.innerHTML = '';
    const results = {};

    await launchAndroidApp();
    for (const test of tests) {
        const card = document.createElement('div');
        card.className = 'info-card';
        card.id = `test-card-${test.id}`;
        card.innerHTML = `<div class="card-header"><i class="fas fa-sync-alt fa-spin"></i> ${test.name}</div><div class="card-content"><p>Running test...</p></div>`;
        cardsContainer.appendChild(card);
        try {
            const result = await test.run();
            results[test.id] = { name: test.name, passed: result.passed, message: result.message };
            const icon = result.passed ? 'fas fa-check-circle' : 'fas fa-times-circle';
            const color = result.passed ? '#2e7d32' : '#d32f2f';
            card.querySelector('.card-header').innerHTML = `<i class="${icon}" style="color:${color}"></i> ${test.name}`;
            card.querySelector('.card-content').innerHTML = `<p>${escapeHtml(result.message)}</p>`;
        } catch (err) {
            results[test.id] = { name: test.name, passed: false, message: err.message };
            card.querySelector('.card-header').innerHTML = `<i class="fas fa-times-circle" style="color:#d32f2f"></i> ${test.name}`;
            card.querySelector('.card-content').innerHTML = `<p>Error: ${escapeHtml(err.message)}</p>`;
        }
        await new Promise(r => setTimeout(r, 1500));
    }

    // ---- SUMMARY CARD (improved UI) ----
    const passedCount = Object.values(results).filter(r => r.passed).length;
    const total = tests.length;
    const percentage = Math.round((passedCount / total) * 100);

    const summaryDiv = document.getElementById('hwSummaryCard');
    summaryDiv.innerHTML = `
        <div class="card-header"><i class="fas fa-clipboard-list"></i> Test Summary</div>
        <div class="card-content">
            <!-- Overall score -->
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

            <!-- Individual test results as cards -->
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;">
                ${Object.values(results).map(r => `
                    <div style="background: ${r.passed ? '#e8f5e9' : '#ffebee'}; border-radius: 8px; padding: 10px 14px; display: flex; align-items: center; gap: 10px; border-left: 4px solid ${r.passed ? '#2e7d32' : '#d32f2f'}; transition: transform 0.15s ease, box-shadow 0.15s ease; cursor: default;">
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

    localStorage.setItem('smartHubDiagnostics', JSON.stringify({ hardwareTests: { results, timestamp: Date.now() } }));
}

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
        // Fetch all data in parallel – use the unified endpoint for device info
        const [infoRes, wifiRes] = await Promise.all([
            fetch(`${BACKEND_URL}/api/device/info/${currentDeviceId}`),
            fetch(`${BACKEND_URL}/wifi/status/${currentDeviceId}`).catch(() => null)
        ]);

        if (!infoRes.ok) throw new Error(`HTTP ${infoRes.status}`);
        const infoData = await infoRes.json();
        // infoData contains all getprop properties plus bluetoothOn, mobileDataToggle, mobileDataConnected
        const props = infoData; // since infoData already includes all props

        const wifiData = wifiRes && wifiRes.ok ? await wifiRes.json() : null;

        // Helper to get prop with fallback
        const get = (key, fallback = '?') => props[key] !== undefined ? props[key] : fallback;

        // Define all variables before using them in the cards
        const volteState = get('gsm.sys.volte.state') === '1' ? 'On' : 'Off';
        const vowifiState = get('gsm.sys.vowifi.state') === '1' ? 'On' : 'Off';

        // Extract Bluetooth and mobile data from the unified response
        const bluetoothOn = infoData.bluetoothOn !== undefined ? infoData.bluetoothOn : false;
        const mobileDataToggle = infoData.mobileDataToggle !== undefined ? infoData.mobileDataToggle : false;
        const mobileDataConnected = infoData.mobileDataConnected !== undefined ? infoData.mobileDataConnected : false;

        // For Bluetooth, we can also get paired devices count from props or from a separate endpoint if needed
        // We'll keep it simple: just show enabled/disabled.
        const btPaired = get('bluetooth.paired.count', '?'); // may not exist

        const makeCard = (title, icon, items) => `
            <div class="info-card">
                <div class="card-header"><i class="${icon}"></i> ${title}</div>
                <div class="card-grid">
                    ${items.map(item => `<div class="card-item"><span class="item-label">${item.label}</span><span class="item-value">${escapeHtml(item.value)}</span></div>`).join('')}
                </div>
            </div>
        `;

        const cards = [];

        // Device Overview
        cards.push(makeCard('Device Overview', 'fas fa-info-circle', [
            { label: 'Model', value: get('ro.product.model', 'Unknown') },
            { label: 'Manufacturer', value: get('ro.product.manufacturer', 'Unknown') },
            { label: 'Android', value: `${get('ro.build.version.release')} (SDK ${get('ro.build.version.sdk')})` },
            { label: 'Security Patch', value: get('ro.build.version.security_patch') },
            { label: 'Board / CPU', value: `${get('ro.product.board')} / ${get('ro.product.cpu.abi')}` },
            { label: 'Serial', value: get('ro.serialno') },
            { label: 'Display', value: `${get('sys.logical.width', '?')} x ${get('sys.logical.height', '?')}` }
        ]));

        // Bluetooth – using the new boolean
        cards.push(makeCard('Bluetooth', 'fab fa-bluetooth', [
            { label: 'Enabled', value: bluetoothOn ? '✅ Yes' : '❌ No' },
            { label: 'Adapter State', value: bluetoothOn ? 'ON' : 'OFF' },
            { label: 'Paired Devices', value: btPaired } // might be '?' if not available
        ]));

        // WiFi
        let wifiItems = [];
        if (wifiData && wifiData.wifi) {
            const info = formatWifiStatus(wifiData.wifi);
            wifiItems = [
                { label: 'SSID', value: info.ssid },
                { label: 'Status', value: info.status },
                { label: 'Signal', value: info.signal },
                { label: 'Link Speed', value: info.linkSpeed },
                { label: 'Frequency', value: info.frequency }
            ];
        } else {
            wifiItems = [{ label: 'Status', value: 'Unable to fetch WiFi info' }];
        }
        cards.push(makeCard('WiFi', 'fas fa-wifi', wifiItems));

        // Network & SIM – using the new mobile data booleans
        const networkType = get('gsm.network.type', 'Unknown');
        const operator = get('gsm.operator.alpha', 'Unknown');
        const simState = get('gsm.sim.state', 'Unknown');

        cards.push(makeCard('Network & SIM', 'fas fa-network-wired', [
            { label: 'Operator', value: operator },
            { label: 'Network Type', value: networkType },
            { label: 'SIM State', value: simState },
            { label: 'Mobile Data (Toggle)', value: mobileDataToggle ? '✅ On' : '❌ Off' },
            { label: 'Mobile Data (Connected)', value: mobileDataConnected ? '✅ Connected' : '❌ Not Connected' },
            { label: 'VoLTE / VoWiFi', value: `VoLTE ${volteState} / VoWiFi ${vowifiState}` }
        ]));

        // System & Build
        cards.push(makeCard('System & Build', 'fas fa-code-branch', [
            { label: 'Fingerprint', value: get('ro.build.fingerprint', 'N/A').substring(0,60)+'...' },
            { label: 'Build Date', value: get('ro.build.date', 'N/A') },
            { label: 'Bootloader', value: get('ro.bootloader', 'locked') },
            { label: 'Encryption', value: get('ro.crypto.state') === 'encrypted' ? '🔒 Encrypted' : 'Unencrypted' }
        ]));

        // Hardware
        cards.push(makeCard('Hardware', 'fas fa-microchip', [
            { label: 'SoC', value: `${get('ro.soc.model', 'N/A')} (${get('ro.board.platform', 'N/A')})` },
            { label: 'GPU', value: get('ro.hardware.egl', 'N/A') },
            { label: 'RAM', value: get('ro.boot.ddrsize', 'N/A') },
            { label: 'Display Density', value: `${get('ro.sf.lcd_density', 'N/A')} dpi` }
        ]));

        // Special Features
        cards.push(makeCard('Special Features', 'fas fa-star', [
            { label: 'Gesture Support', value: get('ro.os_gesture_support') === '1' ? '✅' : '❌' },
            { label: 'Game Mode', value: get('ro.os_gamemode_support') === '1' ? '✅' : '❌' },
            { label: 'Face Unlock', value: get('ro.faceid.support') === '1' ? '✅' : '❌' },
            { label: 'Fingerprint Sensor', value: get('ro.fingerprint_support') === '1' ? '✅' : '❌' }
        ]));

        // Security & Boot
        cards.push(makeCard('Security & Boot', 'fas fa-shield-alt', [
            { label: 'Verified Boot', value: get('ro.boot.verifiedbootstate', 'unknown') },
            { label: 'Bootloader Lock', value: get('ro.boot.flash.locked') === '1' ? '🔒 Locked' : '🔓 Unlocked' },
            { label: 'dm‑verity', value: get('ro.boot.veritymode', 'unknown') },
            { label: 'ADB Secure', value: get('ro.adb.secure') === '1' ? 'Yes' : 'No' }
        ]));

        const finalHtml = `<div class="cards-container">${cards.join('')}</div>`;
        document.getElementById('pageContent').innerHTML = finalHtml;
    } catch (err) {
        document.getElementById('pageContent').innerHTML = `<div class="card">Error loading device info: ${err.message}</div>`;
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

async function renderConnectionTroubleshoot() {
    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `<div class="card">No device connected. Please connect an Android phone with USB debugging enabled.</div>`;
        return;
    }
    document.getElementById('pageContent').innerHTML = `<div class="card">Loading connection status...</div>`;
    try {
        // Fetch WiFi, Bluetooth, and mobile data using unified endpoints
        const [wifiRes, btRes, infoRes] = await Promise.all([
            fetch(`${BACKEND_URL}/wifi/status/${currentDeviceId}`).catch(() => null),
            fetch(`${BACKEND_URL}/api/device/info/${currentDeviceId}`).catch(() => null), // includes bluetoothOn and mobile data
            fetch(`${BACKEND_URL}/api/device/info/${currentDeviceId}`).catch(() => null) // reuse same data
        ]);

        // Bluetooth and mobile data from infoRes
        let bluetoothOn = false;
        let mobileDataToggle = false;
        let mobileDataConnected = false;
        if (infoRes && infoRes.ok) {
            const infoData = await infoRes.json();
            bluetoothOn = infoData.bluetoothOn !== undefined ? infoData.bluetoothOn : false;
            mobileDataToggle = infoData.mobileDataToggle !== undefined ? infoData.mobileDataToggle : false;
            mobileDataConnected = infoData.mobileDataConnected !== undefined ? infoData.mobileDataConnected : false;
        }

        // WiFi
        let wifiHtml = '';
        if (wifiRes && wifiRes.ok) {
            const wifiData = await wifiRes.json();
            if (wifiData.wifi) {
                const w = wifiData.wifi;
                const info = formatWifiStatus(w);
                wifiHtml = `<div class="info-card"><div class="card-header"><i class="fas fa-wifi"></i> WiFi</div><div class="card-grid">
                    <div class="card-item"><span class="item-label">SSID</span><span class="item-value">${escapeHtml(info.ssid)}</span></div>
                    <div class="card-item"><span class="item-label">Status</span><span class="item-value">${escapeHtml(info.status)}</span></div>
                    <div class="card-item"><span class="item-label">Signal</span><span class="item-value">${escapeHtml(info.signal)}</span></div>
                    <div class="card-item"><span class="item-label">Link Speed</span><span class="item-value">${escapeHtml(info.linkSpeed)}</span></div>
                </div><div class="card-actions"><button class="btn-primary fix-wifi" data-action="wifi_reset">Reset WiFi</button></div></div>`;
            } else {
                wifiHtml = `<div class="info-card"><div class="card-header"><i class="fas fa-wifi"></i> WiFi</div><div class="card-grid"><div class="card-item">Unable to fetch WiFi status</div></div></div>`;
            }
        } else {
            wifiHtml = `<div class="info-card"><div class="card-header"><i class="fas fa-wifi"></i> WiFi</div><div class="card-grid"><div class="card-item">Unable to fetch WiFi status</div></div></div>`;
        }

        // Bluetooth
        const btHtml = `<div class="info-card"><div class="card-header"><i class="fab fa-bluetooth"></i> Bluetooth</div><div class="card-grid">
            <div class="card-item"><span class="item-label">Enabled</span><span class="item-value">${bluetoothOn ? '✅ Yes' : '❌ No'}</span></div>
            <div class="card-item"><span class="item-label">Paired Devices</span><span class="item-value">${'?'}</span></div>
            <div class="card-item"><span class="item-label">Connected</span><span class="item-value">${'?'}</span></div>
        </div><div class="card-actions">
            <button class="btn-primary fix-bluetooth" data-action="bluetooth_reset">Reset Bluetooth</button>
            <button class="btn-secondary fix-bluetooth" data-action="bluetooth_force_stop">Force Stop & Reset</button>
            <button class="btn-secondary fix-bluetooth" data-action="bluetooth_clear_cache">Clear Cache</button>
        </div></div>`;

        // Mobile Data
        const mobileHtml = `<div class="info-card"><div class="card-header"><i class="fas fa-mobile-alt"></i> Mobile Data</div><div class="card-grid">
            <div class="card-item"><span class="item-label">Toggle</span><span class="item-value">${mobileDataToggle ? '✅ On' : '❌ Off'}</span></div>
            <div class="card-item"><span class="item-label">Connection</span><span class="item-value">${mobileDataConnected ? '✅ Connected' : '❌ Not Connected'}</span></div>
        </div><div class="card-actions"><button class="btn-primary fix-mobile" data-action="mobile_data_reset">Reset Mobile Data</button></div></div>`;

        const html = `<div class="cards-container">${wifiHtml}${btHtml}${mobileHtml}</div><div id="fixResult" class="card" style="display: none; margin-top: 20px;"></div>`;
        document.getElementById('pageContent').innerHTML = html;

        // Fix function
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

        // Attach event listeners for all fix buttons
        document.querySelectorAll('.fix-wifi').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.getAttribute('data-action');
                try {
                    await callFix('wifi', action);
                    showFixResult(`WiFi fix '${action}' completed.`);
                    setTimeout(() => renderConnectionTroubleshoot(), 2000);
                } catch (err) {
                    showFixResult(`WiFi fix failed: ${err.message}`, true);
                }
            });
        });

        document.querySelectorAll('.fix-bluetooth').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.getAttribute('data-action');
                try {
                    await callFix('bluetooth', action);
                    showFixResult(`Bluetooth fix '${action}' completed.`);
                    setTimeout(() => renderConnectionTroubleshoot(), 2000);
                } catch (err) {
                    showFixResult(`Bluetooth fix failed: ${err.message}`, true);
                }
            });
        });

        document.querySelectorAll('.fix-mobile').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.getAttribute('data-action');
                try {
                    await callFix('mobile', action);
                    showFixResult(`Mobile data fix '${action}' completed.`);
                    setTimeout(() => renderConnectionTroubleshoot(), 2000);
                } catch (err) {
                    showFixResult(`Mobile data fix failed: ${err.message}`, true);
                }
            });
        });
    } catch (err) {
        document.getElementById('pageContent').innerHTML = `<div class="card">Error loading troubleshoot page: ${err.message}</div>`;
    }
}

// ==================== BSOD DIAGNOSIS ====================
async function renderBsodDiagnosis() {
    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `<div class="card">No device connected.</div>`;
        return;
    }
    const startHtml = `<div class="info-card" style="text-align: center;"><div class="card-header"><i class="fas fa-skull-crosswalk"></i> BSOD / Black Screen Analysis</div><div class="card-content"><p>Click the button below to start a full diagnostic.</p><button id="startBsodBtn" class="btn-primary" style="font-size: 18px;">🔍 Diagnose Now</button></div></div><div id="bsodResult" style="display: none;"></div>`;
    document.getElementById('pageContent').innerHTML = startHtml;
    const startBtn = document.getElementById('startBsodBtn');
    const resultDiv = document.getElementById('bsodResult');
    startBtn?.addEventListener('click', async () => {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `<div class="info-card"><div class="card-header"><i class="fas fa-spinner fa-pulse"></i> Analyzing...</div><div class="card-content"><p>Please wait while we check for crash signatures.</p></div></div>`;
        try {
            const response = await fetch(`${BACKEND_URL}/api/bsod/diagnose`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adbDeviceId: currentDeviceId }) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            const diag = data.diagnosis;
            const cause = diag.cause;
            let severityColor = '#2e7d32', icon = 'fa-check-circle';
            if (cause.includes("corruption") || cause.includes("crash")) { severityColor = '#c62828'; icon = 'fa-exclamation-triangle'; }
            else if (cause.includes("instability")) { severityColor = '#ed6c02'; icon = 'fa-exclamation-circle'; }
            let signalsHtml = '';
            if (diag.signals && diag.signals.length > 0) {
                signalsHtml = `<div class="card-header"><i class="fas fa-list"></i> Detected Signals</div><div class="card-content"><ul style="margin:0; padding-left:20px;">` + diag.signals.map(s => `<li><strong>${s.title}</strong> (${s.severity}) - ${s.points} points</li>`).join('') + `</ul></div>`;
            }
            const html = `<div class="info-card"><div class="card-header"><i class="fas ${icon}" style="color:${severityColor}"></i> Diagnosis Result</div><div class="card-content"><div class="card-item"><span class="item-label">Conclusion</span><span class="item-value">${cause}</span></div><div class="card-item"><span class="item-label">Confidence</span><span class="item-value">${diag.confidence} (Score: ${diag.score}/100)</span></div><div class="card-item"><span class="item-label">Details</span><span class="item-value">${diag.detail || 'No additional details.'}</span></div></div></div>${signalsHtml}<div class="info-card"><div class="card-header"><i class="fas fa-lightbulb"></i> Next Steps</div><div class="card-content"><p>${getRecommendation(cause)}</p></div></div>`;
            resultDiv.innerHTML = html;
        } catch (err) {
            resultDiv.innerHTML = `<div class="info-card"><div class="card-header"><i class="fas fa-times-circle"></i> Error</div><div class="card-content"><p>Failed to diagnose: ${err.message}</p></div></div>`;
        }
    });
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
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            const page = item.dataset.page;
            if (page === 'dashboard') await renderDashboard();
            else if (page === 'device-info') await renderDeviceInfo();
            else if (page === 'hardware-tests') await renderHardwareTests();
            else if (page === 'connection-troubleshoot') await renderConnectionTroubleshoot();
            else if (page === 'ai-conclusion') await renderAIConclusion();
            else if (page === 'repairs') await renderRepairs();
            else if (page === 'bsod') await renderBsodDiagnosis();
            else if (page === 'live-screen') await renderLiveScreen();
            else await renderDashboard();
        });
    });
}

// ==================== INIT ====================
(async () => {
    initNavigation();
    await updateConnectionStatus();
    setInterval(updateConnectionStatus, 5000);
    await renderDashboard();
})();