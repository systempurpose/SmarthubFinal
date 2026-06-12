// ==================== GLOBALS ====================
let currentDeviceId = null;
let wizardStep = 0;

// ==================== API HELPER ====================
const BACKEND_URL = 'http://127.0.0.1:3333';

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
async function updateConnectionStatus() {
    const statusSpan = document.querySelector('#connectionStatus span');
    if (!statusSpan) return;
    const previousDeviceId = currentDeviceId;
    try {
        const data = await apiCall('/devices');
        if (data.devices && data.devices.length) {
            const firstDevice = data.devices[0];
            currentDeviceId = typeof firstDevice === 'string' ? firstDevice : (firstDevice.id || firstDevice.serial || String(firstDevice));
            statusSpan.innerText = `Connected: ${currentDeviceId}`;
            statusSpan.style.color = '#107c10';
        } else {
            currentDeviceId = null;
            statusSpan.innerText = 'No device found';
            statusSpan.style.color = '#d83b01';
        }
    } catch (err) {
        currentDeviceId = null;
        statusSpan.innerText = 'ADB error';
        statusSpan.style.color = '#d83b01';
    }

    const activePage = document.querySelector('.nav-item.active')?.dataset.page;
    if (activePage === 'dashboard' && currentDeviceId && currentDeviceId !== previousDeviceId) {
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

    container.innerHTML = `
        <h1 style="margin-bottom: 24px;">Dashboard</h1>
        <div class="dashboard-grid" id="healthCards">
            <div class="status-card"><i class="fas fa-spinner fa-spin"></i> Loading battery...</div>
            <div class="status-card"><i class="fas fa-spinner fa-spin"></i> Loading storage...</div>
            <div class="status-card"><i class="fas fa-spinner fa-spin"></i> Loading RAM...</div>
            <div class="status-card"><i class="fas fa-spinner fa-spin"></i> Loading temperature...</div>
        </div>
        <div class="card">
            <div class="card-title"><i class="fas fa-chart-line"></i> Quick Actions</div>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                <button id="startDiagnosticBtn" class="btn-primary">🔬 Deep Diagnostic</button>
                <button id="installAppBtn" class="btn-secondary">📱 Install Android App</button>
                <button id="openWizard" class="btn-secondary">🔌 USB Debugging Wizard</button>
                <button id="helpBtn" class="btn-secondary">❓ Help</button>
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

    // Wait a tiny bit for DOM to update
    await new Promise(r => setTimeout(r, 50));

    try {
        // Fetch all data with timeouts so one slow device call does not block the whole dashboard.
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

        const healthDiv = document.getElementById('healthCards');
        const temperatureValue = tempData && typeof tempData.temperature !== 'undefined' ? tempData.temperature : 'Unknown';
        if (healthDiv) {
            healthDiv.innerHTML = `
                <div class="status-card clickable" data-card="battery">
                    <i class="fas fa-battery-full"></i> Battery: ${battery.level || '?'}% (${battery.health || 'unknown'})
                </div>
                <div class="status-card clickable" data-card="storage">
                    <i class="fas fa-hdd"></i> Storage: Free ${storage.free || '?'} / ${storage.total || '?'}
                </div>
                <div class="status-card clickable" data-card="ram">
                    <i class="fas fa-memory"></i> RAM: Used ${ram.used || '?'} / ${ram.total || '?'}
                </div>
                <div class="status-card clickable" data-card="temperature">
                    <i class="fas fa-thermometer-half"></i> Temp: ${temperatureValue}
                </div>
            `;

            document.querySelectorAll('.status-card.clickable').forEach(card => {
                card.addEventListener('click', () => {
                    const type = card.dataset.card;
                    if (type === 'battery') showBatteryModal();
                    else if (type === 'storage') showStorageModal();
                    else if (type === 'ram') showRamModal();
                    else if (type === 'temperature') showTemperatureModal();
                });
            });
        } else {
            console.error('healthCards element not found');
        }

        document.getElementById('deviceOverview').innerHTML = `
            <div class="card-title"><i class="fas fa-info-circle"></i> Device Overview</div>
            <div><strong>Model:</strong> ${escapeHtml(model)}</div>
            <div><strong>Android:</strong> ${escapeHtml(androidVer)}</div>
            <div><strong>Security Patch:</strong> ${escapeHtml(securityPatch)}</div>
        `;
        document.getElementById('deviceOverview').style.display = 'block';

        const wifiInfo = formatWifiStatus(wifiStatus?.wifi);
        document.getElementById('networkStatus').innerHTML = `
            <div class="card-title"><i class="fas fa-wifi"></i> Network Status</div>
            <div><strong>WiFi SSID:</strong> ${escapeHtml(wifiInfo.ssid)}</div>
            <div><strong>Status:</strong> ${escapeHtml(wifiInfo.status)}</div>
            <div><strong>Signal:</strong> ${escapeHtml(wifiInfo.signal)}</div>
            <div><strong>Link Speed:</strong> ${escapeHtml(wifiInfo.linkSpeed)}</div>
            <div><strong>Frequency:</strong> ${escapeHtml(wifiInfo.frequency)}</div>
        `;
        document.getElementById('networkStatus').style.display = 'block';

        const summaryGrid = document.querySelector('#phoneSummary .phone-summary-grid');
        if (summaryGrid) {
            summaryGrid.innerHTML = `
                <div><span class="item-label">Phone Name</span><span class="item-value">${escapeHtml(model)}</span></div>
                <div><span class="item-label">Android Version</span><span class="item-value">${escapeHtml(androidVer)}</span></div>
                <div><span class="item-label">ADB Active</span><span class="item-value">${currentDeviceId ? '✅ Active' : '❌ Inactive'}</span></div>
            `;
            document.getElementById('phoneSummary').style.display = 'block';
        }

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
        const healthDiv = document.getElementById('healthCards');
        if (healthDiv) {
            healthDiv.innerHTML = `<div class="status-card">⚠️ Failed to load hardware data</div>`;
        }
    }

    document.getElementById('startDiagnosticBtn')?.addEventListener('click', runDeepDiagnostic);
    document.getElementById('installAppBtn')?.addEventListener('click', async () => {
        if (!currentDeviceId) {
            alert('No device connected. Please connect a phone first.');
            return;
        }
        const btn = document.getElementById('installAppBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Installing...';
        btn.disabled = true;
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
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
    document.getElementById('openWizard')?.addEventListener('click', openWizard);
    document.getElementById('helpBtn')?.addEventListener('click', showHelpModal);
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
    const modal = ensureInfoModal('batteryModal', '🔋 Battery Usage by App & System');
    const body = document.getElementById('batteryModalBody');
    body.innerHTML = '<div class="modal-loading"><div class="spinner"></div><p>Loading battery stats...</p></div>';
    modal.style.display = 'flex';
    try {
        const response = await fetchWithTimeout(`${BACKEND_URL}/api/hardware/battery-usage?deviceId=${currentDeviceId}`, {}, 15000);
        const data = await response.json();
        const usage = data.usage || [];
        
        if (!usage.length) {
            body.innerHTML = `
                <div class="alert alert-warning" style="text-align:center;">
                    <strong>No battery usage data available.</strong><br>
                    Please use the phone for a while, then reset battery stats:<br>
                    <code>adb shell dumpsys batterystats --reset</code>
                </div>
            `;
            return;
        }
        
        // Calculate total drain for percentage
        const totalDrain = usage.reduce((sum, item) => sum + item.drain, 0);
        
        const html = `
            <div style="margin-bottom: 16px;">
                <input type="text" id="batterySearchInput" placeholder="🔍 Filter items..." style="width:100%; padding:8px 12px; border:1px solid #ddd; border-radius:24px; font-size:13px; outline:none;">
            </div>
            <div id="batteryProcessList" class="battery-process-list-container" style="max-height: 380px; overflow-y: auto; padding-right: 6px;">
                ${usage.map(item => {
                    const percent = (item.drain / totalDrain) * 100;
                    const icon = item.type === 'app' ? '📱' : '🔧';
                    const name = item.type === 'app' ? simplifyAppName(item.name) : item.name;
                    return `
                        <div class="battery-process-item" data-name="${escapeHtml(item.name.toLowerCase())}" style="margin-bottom: 12px; background: #ffffff; border-radius: 10px; padding: 8px 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span style="font-weight: 600; font-size: 13px;">${icon} ${escapeHtml(name)}</span>
                                <span style="font-size: 12px; color: #555;">${item.drain.toFixed(1)} mAh (${percent.toFixed(1)}%)</span>
                            </div>
                            <div style="background: #e9ecef; border-radius: 4px; height: 4px; overflow: hidden;">
                                <div style="width: ${percent}%; background: #dc3545; height: 100%; border-radius: 4px;"></div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            <div style="margin-top: 8px; font-size: 11px; color: #6c757d; text-align: center;">
                Percentages are based on estimated power drain (mAh).  
                System components (screen, Wi‑Fi, cellular) are shown when available.
            </div>
        `;
        
        body.innerHTML = html;
        
        // Search filter
        const searchInput = document.getElementById('batterySearchInput');
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
        body.innerHTML = `<div class="alert alert-danger">Error: ${escapeHtml(err.message)}</div>`;
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
        const response = await fetchWithTimeout(url, {}, 15000);
        const data = await response.json();
        console.log('Storage details response:', data);
        const b = data.breakdown || {};
        const total = b.total?.human || '?';
        const used = b.used?.human || '?';
        const usedBytes = Number(b.used?.bytes) || 0;
        const free = b.free?.human || '?';
        const apps = b.apps || { percent: 0, human: '0 KB', bytes: 0 };
        const media = b.media || { percent: 0, human: '0 KB', bytes: 0 };
        const system = b.system || { percent: 0, human: '0 KB', bytes: 0 };
        const other = b.other || { percent: 0, human: '0 KB', bytes: 0 };
        const segments = [
            { label: 'Apps', percent: apps.percent, bytes: apps.bytes, human: apps.human, color: '#0d6efd', icon: '📱' },
            { label: 'Media', percent: media.percent, bytes: media.bytes, human: media.human, color: '#198754', icon: '🎬' },
            { label: 'System', percent: system.percent, bytes: system.bytes, human: system.human, color: '#0dcaf0', icon: '⚙️' },
            { label: 'Other', percent: other.percent, bytes: other.bytes, human: other.human, color: '#6c757d', icon: '📦' }
        ].map(segment => {
            const rawValue = Number(segment.percent) || 0;
            const computedValue = rawValue > 0 ? rawValue : (usedBytes > 0 ? (Number(segment.bytes) / usedBytes) * 100 : 0);
            return { ...segment, value: computedValue };
        });

        // Build HTML with explicit width styles
        const html = `
            <div style="display: flex; flex-wrap: wrap; gap: 20px;">
                <!-- Left column: Pie chart + legend -->
                <div style="flex: 1; min-width: 220px;">
                    <div style="text-align: center;">
                        <canvas id="storagePieCanvas" width="220" height="220"></canvas>
                    </div>
                    <div style="margin-top: 16px;">
                        ${segments.map(segment => `
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                <span style="width: 16px; height: 16px; background: ${segment.color}; border-radius: 4px;"></span>
                                <div style="flex:1;">
                                    <strong>${segment.icon} ${segment.label}</strong><br>
                                    <span style="font-size:12px; color:#666;">${escapeHtml(segment.human)} (${segment.value.toFixed(1)}%)</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Right column: Overview + Detailed Usage -->
                <div style="flex: 2; min-width: 280px;">
                    <!-- Overview card -->
                    <div style="background: #f8f9fa; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                        <h4 style="margin-top:0; margin-bottom:12px;">Overview</h4>
                        <div style="display: flex; justify-content: space-between; gap: 16px;">
                            <div style="flex:1; text-align:center; background:white; border-radius:8px; padding:12px;">
                                <div style="font-size:13px; color:#666;">Total</div>
                                <div style="font-size:20px; font-weight:bold;">${escapeHtml(total)}</div>
                            </div>
                            <div style="flex:1; text-align:center; background:white; border-radius:8px; padding:12px;">
                                <div style="font-size:13px; color:#666;">Used</div>
                                <div style="font-size:20px; font-weight:bold;">${escapeHtml(used)}</div>
                            </div>
                            <div style="flex:1; text-align:center; background:white; border-radius:8px; padding:12px;">
                                <div style="font-size:13px; color:#666;">Free</div>
                                <div style="font-size:20px; font-weight:bold;">${escapeHtml(free)}</div>
                            </div>
                        </div>
                    </div>

                    <!-- Detailed Usage -->
                    <div style="background: #f8f9fa; border-radius: 12px; padding: 16px;">
                        <h4 style="margin-top:0; margin-bottom:12px;">Detailed Usage</h4>
                        ${segments.map(segment => `
                            <div style="margin-bottom: 12px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                    <span><strong>${segment.icon} ${segment.label}</strong></span>
                                    <span>${escapeHtml(segment.human)} (${segment.value.toFixed(1)}%)</span>
                                </div>
                                <div style="background: #e0e0e0; border-radius: 10px; height: 8px; overflow: hidden;">
                                    <div style="width: ${Math.max(1, segment.value)}%; background: ${segment.color}; height: 100%;"></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        body.innerHTML = html;

        // Draw pie chart
        const canvas = document.getElementById('storagePieCanvas');
        const totalPercent = segments.reduce((sum, segment) => sum + segment.value, 0);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            const w = 220, h = 220, cx = 110, cy = 110, r = 90;
            ctx.clearRect(0, 0, w, h);
            
            if (totalPercent > 0.05) {
                let start = -0.5 * Math.PI;
                for (const segment of segments) {
                    const angle = (segment.value / 100) * 2 * Math.PI;
                    if (angle <= 0) continue;
                    const end = start + angle;
                    ctx.beginPath();
                    ctx.fillStyle = segment.color;
                    ctx.moveTo(cx, cy);
                    ctx.arc(cx, cy, r, start, end);
                    ctx.fill();
                    start = end;
                }
                // Inner circle for donut style
                ctx.beginPath();
                ctx.fillStyle = '#ffffff';
                ctx.arc(cx, cy, 45, 0, 2 * Math.PI);
                ctx.fill();
                ctx.fillStyle = '#1f1f1f';
                ctx.font = 'bold 14px "Segoe UI"';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('Storage', cx, cy - 8);
                ctx.font = '13px "Segoe UI"';
                ctx.fillStyle = '#555';
                ctx.fillText(`${total}`, cx, cy + 10);
            } else {
                // Fallback: gray circle with message
                ctx.fillStyle = '#e5e7eb';
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, 2 * Math.PI);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(cx, cy, 60, 0, 2 * Math.PI);
                ctx.fill();
                ctx.fillStyle = '#9ca3af';
                ctx.font = '12px "Segoe UI"';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('No breakdown', cx, cy - 5);
                ctx.fillText('data yet', cx, cy + 10);
            }
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

// ==================== QUICK DIAGNOSTIC ====================
async function runDeepDiagnostic() {
    // Get or create modal
    let modal = document.getElementById('quickDiagModal');
    if (!modal) {
        const modalHTML = `
            <div id="quickDiagModal" class="modal" style="display: none;">
                <div class="modal-content" style="max-width: 750px;">
                    <div class="modal-header">
                        <h3 id="quickDiagModalTitle">Deep Diagnostic Result</h3>
                        <span class="close-button" id="closeQuickDiagModal">&times;</span>
                    </div>
                    <div class="modal-body" id="quickDiagModalBody" style="max-height: 600px; overflow-y: auto;">
                        <div class="spinner"></div>
                        <p style="text-align: center;">Analyzing system...</p>
                    </div>
                    <div class="modal-footer">
                        <button id="closeQuickDiagModalBtn" class="btn-secondary">Close</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById('quickDiagModal');
    }

    const modalTitle = document.getElementById('quickDiagModalTitle');
    const modalBody = document.getElementById('quickDiagModalBody');
    
    modalTitle.textContent = 'Running Deep Diagnostic';
    modalBody.innerHTML = '<div class="spinner"></div><p style="text-align: center;">Analyzing system...</p>';
    modal.style.display = 'flex';

    const closeModal = () => modal.style.display = 'none';
    document.getElementById('closeQuickDiagModal')?.addEventListener('click', closeModal);
    document.getElementById('closeQuickDiagModalBtn')?.addEventListener('click', closeModal);
    window.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    try {
        // 1. Hardware checks
        const battery = await apiCall(`/hardware/battery?deviceId=${currentDeviceId}`).catch(() => ({ level: 0, health: 'unknown' }));
        const storage = await apiCall(`/hardware/storage?deviceId=${currentDeviceId}`).catch(() => ({ total: '0', used: '0', free: '0' }));
        const ram = await apiCall(`/hardware/ram?deviceId=${currentDeviceId}`).catch(() => ({ total: '0', used: '0' }));

        const totalGB = parseFloat(storage.total) || 0;
        const usedGB = parseFloat(storage.used) || 0;
        const storagePercent = totalGB > 0 ? (usedGB / totalGB) * 100 : 0;
        const ramPercent = parseFloat(ram.total) > 0 ? (parseFloat(ram.used) / parseFloat(ram.total)) * 100 : 0;

        const issues = [];
        if (battery.level < 20) issues.push('Battery level is low.');
        if (battery.health !== 'good') issues.push('Battery health is not optimal.');
        if (storagePercent > 90) issues.push('Storage is nearly full.');
        if (ramPercent > 85) issues.push('RAM usage is very high.');

        let hardwareHtml = issues.length > 0
            ? `<div style="margin-bottom: 20px;"><h3 style="color: #d32f2f;">⚠️ Hardware Issues</h3><ul>${issues.map(i => `<li>${i}</li>`).join('')}</ul></div>`
            : `<div style="margin-bottom: 20px;"><h3 style="color: #2e7d32;">✅ Hardware Check Passed</h3><p>All hardware metrics are within normal ranges.</p></div>`;

        // 2. Fetch suspicious apps
        let suspiciousAppsList = [];
        try {
            const appsResponse = await fetch(`/api/suspicious-apps?deviceId=${currentDeviceId}`);
            if (appsResponse.ok) {
                const appsData = await appsResponse.json();
                suspiciousAppsList = appsData.suspiciousApps || [];
            }
        } catch (err) {
            console.error('Failed to fetch suspicious apps:', err);
        }

        const escape = (str) => escapeHtml(str);

        // Build initial apps HTML with loading placeholders
        let appsHtml = '';
        if (suspiciousAppsList.length === 0) {
            appsHtml = `<div><h3 style="color: #2e7d32;">✅ No Suspicious Apps Found</h3><p>No known dangerous apps detected.</p></div>`;
        } else {
            appsHtml = `<div><h3 id="suspiciousAppsHeading" style="color: #ed6c02;">⚠️ Suspicious Apps Found (${suspiciousAppsList.length})</h3><div id="appsContainer">`;
            for (const app of suspiciousAppsList) {
                appsHtml += `
                    <div id="app-card-${escape(app.packageName)}" class="app-card-item" style="margin-bottom: 20px; padding: 16px; background: #fff3e0; border-radius: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap;">
                            <div>
                                <strong>${escape(app.displayName)}</strong> (${escape(app.packageName)})
                                <br><span id="risk-text-${escape(app.packageName)}" style="font-size: 12px;">Risk: ${escape(app.threatLevel)} - ${escape(app.reason)}</span>
                            </div>
                            <button onclick="uninstallPackage('${escape(app.packageName)}')" 
                                    style="background: #d32f2f; color: white; border: none; border-radius: 20px; padding: 6px 16px; cursor: pointer;">
                                Delete
                            </button>
                        </div>
                        <div id="deep-${escape(app.packageName)}" style="margin-top: 12px;">
                            <div class="spinner" style="width: 20px; height: 20px; margin: 0;"></div> <span style="font-size: 12px;">Running deep scan...</span>
                        </div>
                    </div>
                `;
            }
            appsHtml += `</div></div>`;
        }

        modalBody.innerHTML = hardwareHtml + appsHtml;

        // 3. Perform deep scans and REMOVE safe apps (riskScore <= 29)
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

                    // If riskScore <= 29, remove the entire app card from UI
                    if (riskScore <= 29) {
                        appCard.remove();
                        // Update the heading count
                        const remainingCards = document.querySelectorAll('.app-card-item').length;
                        const heading = document.getElementById('suspiciousAppsHeading');
                        if (heading) {
                            heading.textContent = `⚠️ Suspicious Apps Found (${remainingCards})`;
                            if (remainingCards === 0) {
                                heading.outerHTML = '<h3 style="color: #2e7d32;">✅ No Suspicious Apps Found</h3><p>All apps are safe (score ≤29).</p>';
                            }
                        }
                        return; // No need to show deep scan results for removed app
                    }

                    // --- Malware type descriptions (full explanations) ---
                    const malwareDescriptions = {
                        'Spyware': '📷 Can read contacts, location, camera, microphone, or SMS without your knowledge.',
                        'Ransomware': '💰 Can lock your device or encrypt files and demand payment to unlock them.',
                        'Adware': '📢 Displays aggressive ads, may redirect you to malicious websites.',
                        'Banking Trojan': '🏦 Targets banking/financial apps to steal login credentials and money.',
                        'Data Stealer': '📁 Extracts personal files, messages, or photos and sends them to a remote server.',
                        'Backdoor': '🚪 Allows remote control of your device without your permission.',
                        'Fake App': '🎭 Pretends to be a legitimate app but may steal info or display ads.',
                        'Riskware': '⚠️ Legitimate but can be exploited by malware; review its behavior.',
                        'Information Stealer': '🔐 Collects passwords, emails, and personal data for theft.',
                        'Premium Dialer': '💸 Can send SMS or make calls to premium numbers, causing unexpected charges.',
                        'Trojan': '🐴 Disguised as a normal app; performs malicious actions like data theft or backdoor.'
                    };

                    // Build malware display with full descriptions
                    let malwareHtml = '';
                    if (analysis.malware_types && analysis.malware_types.length > 0) {
                        const typeDescriptions = analysis.malware_types.map(type => {
                            const desc = malwareDescriptions[type] || 'Potentially harmful behavior detected.';
                            return `<div style="font-size:12px;"><strong>${escapeHtml(type)}</strong> – ${escapeHtml(desc)}</div>`;
                        }).join('');
                        malwareHtml = `<div style="color: #c62828; margin-top: 8px;"><strong>⚠️ Why it may be malicious:</strong>${typeDescriptions}</div>`;
                    }

                    // Build deep scan results HTML (no behavior section)
                    let html = `
                        <strong>Deep Scan Results:</strong><br>
                        <span style="font-size: 12px;">Risk Score: ${riskScore}/100</span><br>
                        <span style="font-size: 12px;">Dangerous Permissions: ${analysis.dangerous_permissions?.length || 0}</span><br>
                        ${malwareHtml}
                        ${analysis.suspicious_indicators && analysis.suspicious_indicators.length ? `<span style="font-size: 12px;">Suspicious: ${escapeHtml(analysis.suspicious_indicators.join(', '))}</span><br>` : ''}
                        ${data.virusTotal && data.virusTotal.malicious > 0 ? `<span style="color: red; font-size: 12px;">⚠️ VirusTotal: ${data.virusTotal.malicious} engines flagged malicious</span>` : ''}
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
        modalTitle.textContent = 'Deep Diagnostic Complete';
    } catch (err) {
        console.error('[DeepDiag] Error:', err);
        modalTitle.textContent = 'Diagnostic Failed';
        modalBody.innerHTML = `<div style="color: #d32f2f; text-align: center;">Error: ${escapeHtml(err.message)}</div>`;
    }
}

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
            runDeepDiagnostic();
        } else {
            alert(`Failed to uninstall: ${data.error}`);
        }
    } catch (err) {
        alert(`Error: ${err.message}`);
    }
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
async function renderHardwareTests() {
    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `<div class="card">No device connected. Please connect an Android phone with USB debugging enabled.</div>`;
        return;
    }

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

    const modal = document.getElementById('hwTestModal');
    const modalTitle = document.getElementById('hwModalTitle');
    const modalBody = document.getElementById('hwModalBody');
    const yesBtn = document.getElementById('hwYesBtn');
    const noBtn = document.getElementById('hwNoBtn');
    const closeBtn = document.getElementById('hwCloseModalBtn');

    let currentTestResolver = null;
    let autoCloseTimeout = null;

    function closeModal() {
        if (autoCloseTimeout) clearTimeout(autoCloseTimeout);
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

    function waitForUserConfirmation(timeoutMs = 30000) {
        return new Promise((resolve) => {
            currentTestResolver = resolve;
            yesBtn.style.display = 'inline-block';
            noBtn.style.display = 'inline-block';
            const onYes = () => { cleanup(); resolve('yes'); };
            const onNo = () => { cleanup(); resolve('no'); };
            const cleanup = () => {
                if (autoCloseTimeout) clearTimeout(autoCloseTimeout);
                yesBtn.removeEventListener('click', onYes);
                noBtn.removeEventListener('click', onNo);
                yesBtn.style.display = 'none';
                noBtn.style.display = 'none';
                currentTestResolver = null;
            };
            yesBtn.addEventListener('click', onYes);
            noBtn.addEventListener('click', onNo);
            autoCloseTimeout = setTimeout(() => {
                if (currentTestResolver) cleanup(), resolve('no');
            }, timeoutMs);
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

    const tests = [
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
                const passed = types.some(t => t.includes('accelerometer')) && types.some(t => t.includes('gyroscope')) &&
                              types.some(t => t.includes('proximity')) && types.some(t => t.includes('light'));
                const missing = [];
                if (!types.some(t => t.includes('accelerometer'))) missing.push('accelerometer');
                if (!types.some(t => t.includes('gyroscope'))) missing.push('gyroscope');
                if (!types.some(t => t.includes('proximity'))) missing.push('proximity');
                if (!types.some(t => t.includes('light'))) missing.push('light');
                const message = passed ? 'All core sensors detected' : `Missing: ${missing.join(', ')}`;
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
        { id: 'touch', name: 'Touch Screen', run: async () => {
            await launchAndroidTest('touch');
            modalTitle.textContent = 'Touch Screen Test';
            modalBody.innerHTML = `<p>📱 The phone is now in touch test mode.</p><p>Please tap the screen several times. Does the screen register your touches?</p><p>(You will see a counter increase on the phone.)</p>`;
            modal.style.display = 'flex';
            const result = await waitForUserConfirmation(30000);
            closeModal();
            await returnToMainApp();
            const passed = (result === 'yes');
            const message = passed ? 'User confirmed touch working' : 'User reported touch issues';
            return { passed, message };
        }},
        { id: 'vibration', name: 'Vibration', run: async () => {
            await launchAndroidTest('vibrate');
            modalTitle.textContent = 'Vibration Test';
            modalBody.innerHTML = `<p>📳 The phone should vibrate for a moment.</p><p>Did you feel the vibration?</p>`;
            modal.style.display = 'flex';
            const result = await waitForUserConfirmation(5000);
            closeModal();
            await returnToMainApp();
            const passed = (result === 'yes');
            const message = passed ? 'User confirmed vibration' : 'User did not feel vibration';
            return { passed, message };
        }},
        { id: 'flashlight', name: 'Flashlight', run: async () => {
            await launchAndroidTest('flash');
            modalTitle.textContent = 'Flashlight Test';
            modalBody.innerHTML = `<p>🔦 The rear flashlight should turn on briefly.</p><p>Did you see the light?</p>`;
            modal.style.display = 'flex';
            const result = await waitForUserConfirmation(5000);
            closeModal();
            await returnToMainApp();
            const passed = (result === 'yes');
            const message = passed ? 'User confirmed flashlight' : 'User did not see light';
            return { passed, message };
        }},
        { id: 'speaker', name: 'Speaker', run: async () => {
            await launchAndroidTest('sound');
            modalTitle.textContent = 'Speaker Test';
            modalBody.innerHTML = `<p>🔊 The phone should play a short test tone at medium volume.</p><p>Did you hear the sound clearly?</p>`;
            modal.style.display = 'flex';
            const result = await waitForUserConfirmation(5000);
            closeModal();
            await returnToMainApp();
            const passed = (result === 'yes');
            const message = passed ? 'User confirmed speaker' : 'User did not hear sound';
            return { passed, message };
        }},
        { id: 'camera', name: 'Camera', run: async () => {
            await runAdb('am start -a android.media.action.STILL_IMAGE_CAMERA');
            modalTitle.textContent = 'Camera Test';
            modalBody.innerHTML = `<p>📸 The phone's camera app should have opened.</p><p>Does the camera viewfinder appear and work normally?</p>`;
            modal.style.display = 'flex';
            const result = await waitForUserConfirmation(5000);
            closeModal();
            await runAdb('input keyevent KEYCODE_HOME');
            await new Promise(r => setTimeout(r, 500));
            await launchAndroidApp();
            const passed = (result === 'yes');
            const message = passed ? 'User confirmed camera working' : 'User reported camera issues';
            return { passed, message };
        }}
    ];

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
            await new Promise(r => setTimeout(r, 500));
        }
        const passedCount = Object.values(results).filter(r => r.passed).length;
        const total = tests.length;
        const summaryDiv = document.getElementById('hwSummaryCard');
        summaryDiv.innerHTML = `
            <div class="card-header"><i class="fas fa-clipboard-list"></i> Test Summary</div>
            <div class="card-content">
                <div style="background: ${passedCount === total ? '#e8f5e9' : '#ffebee'}; padding: 16px; border-radius: 16px;">
                    <i class="fas ${passedCount === total ? 'fa-check-circle' : 'fa-exclamation-triangle'}" style="font-size: 32px; color: ${passedCount === total ? '#2e7d32' : '#c62828'};"></i>
                    <h3>${passedCount}/${total} tests passed</h3>
                    <ul>${Object.values(results).map(r => `<li><strong>${r.name}</strong>: ${r.passed ? '✅ Pass' : '❌ Fail'}${r.message ? ` (${escapeHtml(r.message)})` : ''}</li>`).join('')}</ul>
                </div>
            </div>
        `;
        localStorage.setItem('smartHubDiagnostics', JSON.stringify({ hardwareTests: { results, timestamp: Date.now() } }));
    }
    document.getElementById('startHwTestBtn').addEventListener('click', runAllTests);
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
        if (Object.keys(props).length === 0) {
            document.getElementById('pageContent').innerHTML = `<div class="card">No properties found.</div>`;
            return;
        }

        let wifiStatus = null;
        try {
            const wifiRes = await fetch(`${BACKEND_URL}/wifi/status/${currentDeviceId}`);
            if (wifiRes.ok) wifiStatus = await wifiRes.json();
        } catch (err) {}

        const get = (key, fallback = '?') => props[key] !== undefined ? props[key] : fallback;
        const makeCard = (title, icon, items) => `
            <div class="info-card">
                <div class="card-header"><i class="${icon}"></i> ${title}</div>
                <div class="card-grid">
                    ${items.map(item => `<div class="card-item"><span class="item-label">${item.label}</span><span class="item-value">${escapeHtml(item.value)}</span></div>`).join('')}
                </div>
            </div>
        `;

        const cards = [];
        cards.push(makeCard('Device Overview', 'fas fa-info-circle', [
            { label: 'Model', value: get('ro.product.model', 'Unknown') },
            { label: 'Manufacturer', value: get('ro.product.manufacturer', 'Unknown') },
            { label: 'Android', value: `${get('ro.build.version.release')} (SDK ${get('ro.build.version.sdk')})` },
            { label: 'Security Patch', value: get('ro.build.version.security_patch') },
            { label: 'Board / CPU', value: `${get('ro.product.board')} / ${get('ro.product.cpu.abi')}` },
            { label: 'Serial', value: get('ro.serialno') },
            { label: 'Display', value: `${get('sys.logical.width', '?')} x ${get('sys.logical.height', '?')}` }
        ]));

        const bluetoothEnabled = get('bluetooth.profile.a2dp.source.enabled') === 'true';
        const bluetoothProfiles = ['a2dp.source', 'avrcp.target', 'bas.client', 'gatt', 'hfp.ag', 'hid.device', 'hid.host', 'map.server', 'opp', 'pan.nap', 'pan.panu', 'pbap.server'].filter(p => get(`bluetooth.profile.${p}.enabled`) === 'true').length;
        cards.push(makeCard('Bluetooth', 'fab fa-bluetooth', [
            { label: 'Enabled', value: bluetoothEnabled ? '✅ Yes' : '❌ No' },
            { label: 'Active Profiles', value: `${bluetoothProfiles} / 12` },
            { label: 'Adapter State', value: get('cache_key.bluetooth.bluetooth_adapter_get_state', 'N/A') }
        ]));

        let wifiItems = [];
        if (wifiStatus && wifiStatus.wifi) {
            const info = formatWifiStatus(wifiStatus.wifi);
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

        const volteState = get('gsm.sys.volte.state') === '1' ? 'On' : 'Off';
        const vowifiState = get('gsm.sys.vowifi.state') === '1' ? 'On' : 'Off';
        const mobileDataEnabled = get('gsm.data.setenabled') === 'true' ? '✅ Yes' : '❌ No';
        cards.push(makeCard('Network & SIM', 'fas fa-network-wired', [
            { label: 'Operator', value: get('gsm.operator.alpha', 'Unknown') },
            { label: 'Network Type', value: get('gsm.network.type', 'Unknown') },
            { label: 'SIM State', value: get('gsm.sim.state', 'Unknown') },
            { label: 'Mobile Data', value: mobileDataEnabled },
            { label: 'VoLTE / VoWiFi', value: `VoLTE ${volteState} / VoWiFi ${vowifiState}` }
        ]));

        cards.push(makeCard('System & Build', 'fas fa-code-branch', [
            { label: 'Fingerprint', value: get('ro.build.fingerprint', 'N/A').substring(0,60)+'...' },
            { label: 'Build Date', value: get('ro.build.date', 'N/A') },
            { label: 'Bootloader', value: get('ro.bootloader', 'locked') },
            { label: 'Encryption', value: get('ro.crypto.state') === 'encrypted' ? '🔒 Encrypted' : 'Unencrypted' }
        ]));

        cards.push(makeCard('Hardware', 'fas fa-microchip', [
            { label: 'SoC', value: `${get('ro.soc.model', 'N/A')} (${get('ro.board.platform', 'N/A')})` },
            { label: 'GPU', value: get('ro.hardware.egl', 'N/A') },
            { label: 'RAM', value: get('ro.boot.ddrsize', 'N/A') },
            { label: 'Display Density', value: `${get('ro.sf.lcd_density', 'N/A')} dpi` }
        ]));

        cards.push(makeCard('Special Features', 'fas fa-star', [
            { label: 'Gesture Support', value: get('ro.os_gesture_support') === '1' ? '✅' : '❌' },
            { label: 'Game Mode', value: get('ro.os_gamemode_support') === '1' ? '✅' : '❌' },
            { label: 'Face Unlock', value: get('ro.faceid.support') === '1' ? '✅' : '❌' },
            { label: 'Fingerprint Sensor', value: get('ro.fingerprint_support') === '1' ? '✅' : '❌' }
        ]));

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
        const wifiRes = await fetch(`${BACKEND_URL}/wifi/status/${currentDeviceId}`);
        let wifiStatus = wifiRes.ok ? await wifiRes.json() : null;
        const btRes = await fetch(`${BACKEND_URL}/android-connectivity/diagnose/${currentDeviceId}?target=bluetooth`);
        let btStatus = btRes.ok ? await btRes.json() : null;
        const deviceRes = await fetch(`${BACKEND_URL}/device/${currentDeviceId}`);
        let mobileDataEnabled = 'Unknown';
        if (deviceRes.ok) {
            let rawText = await deviceRes.text();
            try { const parsed = JSON.parse(rawText); if (typeof parsed === 'string') rawText = parsed; } catch(e) {}
            const lines = rawText.split(/\r?\n/);
            for (const line of lines) {
                const match = line.match(/^\[gsm.data.setenabled\]:\s*\[(.*?)\]$/);
                if (match) { mobileDataEnabled = match[1] === 'true' ? 'Enabled' : 'Disabled'; break; }
            }
        }

        let wifiHtml = '';
        if (wifiStatus && wifiStatus.wifi) {
            const w = wifiStatus.wifi;
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

        let btHtml = '';
        if (btStatus && btStatus.bluetooth) {
            const bt = btStatus.bluetooth;
            btHtml = `<div class="info-card"><div class="card-header"><i class="fab fa-bluetooth"></i> Bluetooth</div><div class="card-grid">
                <div class="card-item"><span class="item-label">Enabled</span><span class="item-value">${bt.enabled ? '✅ Yes' : '❌ No'}</span></div>
                <div class="card-item"><span class="item-label">Paired Devices</span><span class="item-value">${bt.summary?.bondedCount || 0}</span></div>
                <div class="card-item"><span class="item-label">Connected</span><span class="item-value">${bt.summary?.connectedCount || 0}</span></div>
            </div><div class="card-actions"><button class="btn-primary fix-bluetooth" data-action="bluetooth_reset">Reset Bluetooth</button><button class="btn-secondary fix-bluetooth" data-action="bluetooth_force_stop">Force Stop & Reset</button><button class="btn-secondary fix-bluetooth" data-action="bluetooth_clear_cache">Clear Cache</button></div></div>`;
        } else {
            btHtml = `<div class="info-card"><div class="card-header"><i class="fab fa-bluetooth"></i> Bluetooth</div><div class="card-grid"><div class="card-item">Unable to fetch Bluetooth status</div></div></div>`;
        }

        const mobileHtml = `<div class="info-card"><div class="card-header"><i class="fas fa-mobile-alt"></i> Mobile Data</div><div class="card-grid"><div class="card-item"><span class="item-label">Status</span><span class="item-value">${escapeHtml(mobileDataEnabled)}</span></div></div><div class="card-actions"><button class="btn-primary fix-mobile" data-action="mobile_data_reset">Reset Mobile Data</button></div></div>`;

        const html = `<div class="cards-container">${wifiHtml}${btHtml}${mobileHtml}</div><div id="fixResult" class="card" style="display: none; margin-top: 20px;"></div>`;
        document.getElementById('pageContent').innerHTML = html;

        function showFixResult(message, isError = false) {
            const resultDiv = document.getElementById('fixResult');
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = `<div style="color: ${isError ? '#d32f2f' : '#2e7d32'};">${escapeHtml(message)}</div>`;
            setTimeout(() => resultDiv.style.display = 'none', 5000);
        }

        document.querySelectorAll('.fix-wifi').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (btn.getAttribute('data-action') === 'wifi_reset') {
                    try {
                        await fetch(`${BACKEND_URL}/wifi/toggle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: currentDeviceId, enable: false }) });
                        await new Promise(r => setTimeout(r, 1000));
                        await fetch(`${BACKEND_URL}/wifi/toggle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: currentDeviceId, enable: true }) });
                        showFixResult('WiFi reset completed. Refresh status to see changes.');
                    } catch (err) { showFixResult(`WiFi reset failed: ${err.message}`, true); }
                } else showFixResult('Action not yet implemented', true);
            });
        });
        document.querySelectorAll('.fix-bluetooth').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.getAttribute('data-action');
                try {
                    await callFix('bluetooth', action);
                    showFixResult(`Bluetooth fix '${action}' completed.`);
                    setTimeout(() => renderConnectionTroubleshoot(), 2000);
                } catch (err) { showFixResult(`Bluetooth fix failed: ${err.message}`, true); }
            });
        });
        document.querySelectorAll('.fix-mobile').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    await callFix('mobile', 'mobile_data_reset');
                    showFixResult('Mobile data reset completed.');
                    setTimeout(() => renderConnectionTroubleshoot(), 2000);
                } catch (err) { showFixResult(`Mobile data reset failed: ${err.message}`, true); }
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