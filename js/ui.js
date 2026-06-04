// ==================== GLOBALS ====================
let currentDeviceId = null;
let wizardStep = 0;

// ==================== API HELPER ====================
const BACKEND_URL = 'http://127.0.0.1:3333';
async function apiCall(endpoint, options = {}) {
    const res = await fetch(`${BACKEND_URL}/api${endpoint}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// Helper to escape HTML special characters
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ==================== CONNECTION STATUS ====================
async function updateConnectionStatus() {
    const statusSpan = document.querySelector('#connectionStatus span');
    if (!statusSpan) return;
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
        statusSpan.innerText = 'ADB error';
        statusSpan.style.color = '#d83b01';
    }
}

// ==================== DASHBOARD ====================
async function renderDashboard() {
    const container = document.getElementById('pageContent');
    container.innerHTML = `
        <h1 style="margin-bottom: 24px;">Dashboard</h1>
        <div class="dashboard-grid" id="healthCards">
            <div class="status-card"><i class="fas fa-spinner fa-spin"></i> Loading battery...</div>
            <div class="status-card"><i class="fas fa-spinner fa-spin"></i> Loading storage...</div>
            <div class="status-card"><i class="fas fa-spinner fa-spin"></i> Loading RAM...</div>
        </div>
        <div class="card">
            <div class="card-title"><i class="fas fa-chart-line"></i> Quick Actions</div>
            <button id="runFullDiagnostic" class="btn-primary">Run Full Diagnostic</button>
            <button id="openWizard" class="btn-secondary" style="margin-left: 12px;">USB Debugging Wizard</button>
        </div>
    `;

    if (!currentDeviceId) {
        const healthDiv = document.getElementById('healthCards');
        if (healthDiv) healthDiv.innerHTML = `<div class="status-card">No device connected</div>`;
        return;
    }

    try {
        const battery = await apiCall(`/hardware/battery?deviceId=${currentDeviceId}`);
        const storage = await apiCall(`/hardware/storage?deviceId=${currentDeviceId}`);
        const ram = await apiCall(`/hardware/ram?deviceId=${currentDeviceId}`);
        const healthDiv = document.getElementById('healthCards');
        if (healthDiv) {
            healthDiv.innerHTML = `
                <div class="status-card"><i class="fas fa-battery-full"></i> Battery: ${battery.level || '?'}% (${battery.health || 'unknown'})</div>
                <div class="status-card"><i class="fas fa-hdd"></i> Storage: Free ${storage.free || '?'} / ${storage.total || '?'}</div>
                <div class="status-card"><i class="fas fa-memory"></i> RAM: Used ${ram.used || '?'} / ${ram.total || '?'}</div>
            `;
        }
    } catch (err) {
        console.error('Failed to load health data', err);
    }

    document.getElementById('runFullDiagnostic')?.addEventListener('click', () => {
        alert('Full diagnostic will run all hardware + software checks.');
    });
    document.getElementById('openWizard')?.addEventListener('click', openWizard);
}

// ==================== HARDWARE TESTS PAGE ====================
async function renderHardwareTests() {
    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `<div class="card">No device connected. Please connect an Android phone with USB debugging enabled.</div>`;
        return;
    }
    const container = document.getElementById('pageContent');
    container.innerHTML = `
        <h1>Hardware Tests</h1>
        <div class="card">
            <button id="testBattery" class="btn-primary">Test Battery Health</button>
            <button id="testStorage" class="btn-primary">Test Storage Speed</button>
            <button id="testSensors" class="btn-primary">List Sensors</button>
        </div>
        <div id="testResults" class="card"><pre>Click a button to run test</pre></div>
    `;
    document.getElementById('testBattery')?.addEventListener('click', async () => {
        const res = await apiCall(`/hardware/battery?deviceId=${currentDeviceId}`);
        document.getElementById('testResults').innerHTML = `<pre>${JSON.stringify(res, null, 2)}</pre>`;
    });
    document.getElementById('testStorage')?.addEventListener('click', async () => {
        const res = await apiCall(`/hardware/storage?deviceId=${currentDeviceId}`);
        document.getElementById('testResults').innerHTML = `<pre>${JSON.stringify(res, null, 2)}</pre>`;
    });
    document.getElementById('testSensors')?.addEventListener('click', async () => {
        const res = await apiCall(`/hardware/sensors?deviceId=${currentDeviceId}`);
        document.getElementById('testResults').innerHTML = `<pre>${JSON.stringify(res, null, 2)}</pre>`;
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

// ==================== DEVICE INFO (FORMATTED TABLE) ====================
async function renderDeviceInfo() {
    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `<div class="card">No device connected.</div>`;
        return;
    }
    try {
        // 1. Fetch static device properties
        const res = await fetch(`${BACKEND_URL}/device/${currentDeviceId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let rawText = await res.text();
        try {
            const parsedJson = JSON.parse(rawText);
            if (typeof parsedJson === 'string') rawText = parsedJson;
        } catch (e) { /* not JSON */ }
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

        // 2. Fetch WiFi status dynamically
        let wifiStatus = null;
        try {
            const wifiRes = await fetch(`${BACKEND_URL}/wifi/status/${currentDeviceId}`);
            if (wifiRes.ok) wifiStatus = await wifiRes.json();
        } catch (err) {
            console.warn('Could not fetch WiFi status:', err);
        }

        // Helper to get property with fallback
        const get = (key, fallback = '?') => (props[key] !== undefined ? props[key] : fallback);

        // Helper to build a card (reused)
        const makeCard = (title, icon, items) => `
            <div class="info-card">
                <div class="card-header"><i class="${icon}"></i> ${title}</div>
                <div class="card-grid">
                    ${items.map(item => `<div class="card-item"><span class="item-label">${item.label}</span><span class="item-value">${escapeHtml(item.value)}</span></div>`).join('')}
                </div>
            </div>
        `;

        const cards = [];

        // ----- Device Overview -----
        cards.push(makeCard('Device Overview', 'fas fa-info-circle', [
            { label: 'Model', value: get('ro.product.model', 'Unknown') },
            { label: 'Manufacturer', value: get('ro.product.manufacturer', 'Unknown') },
            { label: 'Android', value: `${get('ro.build.version.release')} (SDK ${get('ro.build.version.sdk')})` },
            { label: 'Security Patch', value: get('ro.build.version.security_patch') },
            { label: 'Board / CPU', value: `${get('ro.product.board')} / ${get('ro.product.cpu.abi')}` },
            { label: 'Serial', value: get('ro.serialno') },
            { label: 'Display', value: `${get('sys.logical.width', '?')} x ${get('sys.logical.height', '?')}` }
        ]));

        // ----- Bluetooth -----
        const bluetoothEnabled = get('bluetooth.profile.a2dp.source.enabled') === 'true';
        const bluetoothProfiles = ['a2dp.source', 'avrcp.target', 'bas.client', 'gatt', 'hfp.ag', 'hid.device',
            'hid.host', 'map.server', 'opp', 'pan.nap', 'pan.panu', 'pbap.server'
        ].filter(p => get(`bluetooth.profile.${p}.enabled`) === 'true').length;
        cards.push(makeCard('Bluetooth', 'fab fa-bluetooth', [
            { label: 'Enabled', value: bluetoothEnabled ? '✅ Yes' : '❌ No' },
            { label: 'Active Profiles', value: `${bluetoothProfiles} / 12` },
            { label: 'Adapter State', value: get('cache_key.bluetooth.bluetooth_adapter_get_state', 'N/A') }
        ]));

        // ----- WiFi (dynamic) -----
        let wifiItems = [];
        if (wifiStatus && wifiStatus.wifi) {
            const wifi = wifiStatus.wifi;
            wifiItems = [
                { label: 'SSID', value: wifi.ssid || 'Not connected' },
                { label: 'Signal Strength', value: wifi.rssi !== undefined ? `${wifi.rssi} dBm` : 'N/A' },
                { label: 'IP Address', value: wifi.ipAddress || 'N/A' },
                { label: 'Link Speed', value: wifi.linkSpeed ? `${wifi.linkSpeed} Mbps` : 'N/A' },
                { label: 'Frequency', value: wifi.frequency ? `${wifi.frequency} MHz` : 'N/A' }
            ];
        } else {
            wifiItems = [{ label: 'Status', value: 'Unable to fetch WiFi info' }];
        }
        cards.push(makeCard('WiFi', 'fas fa-wifi', wifiItems));

        // ----- Network & SIM (enhanced) -----
        const volteState = get('gsm.sys.volte.state') === '1' ? 'On' : 'Off';
        const vowifiState = get('gsm.sys.vowifi.state') === '1' ? 'On' : 'Off';
        const mobileDataEnabled = get('gsm.data.setenabled') === 'true' ? '✅ Yes' : '❌ No';
        const vonr0 = get('persist.radio.is_vonr_enabled_0') === 'true' ? 'Yes' : 'No';
        const defaultNet = get('ro.telephony.default_network', 'N/A');
        cards.push(makeCard('Network & SIM', 'fas fa-network-wired', [
            { label: 'Operator', value: get('gsm.operator.alpha', 'Unknown') },
            { label: 'Network Type', value: get('gsm.network.type', 'Unknown') },
            { label: 'SIM State', value: get('gsm.sim.state', 'Unknown') },
            { label: 'Mobile Data', value: mobileDataEnabled },
            { label: 'VoLTE / VoWiFi', value: `VoLTE ${volteState} / VoWiFi ${vowifiState}` },
            { label: 'VoNR (5G Voice)', value: vonr0 },
            { label: 'Default Network', value: defaultNet }
        ]));

        // ----- System & Build -----
        cards.push(makeCard('System & Build', 'fas fa-code-branch', [
            { label: 'Fingerprint', value: get('ro.build.fingerprint', 'N/A').substring(0, 60) + '...' },
            { label: 'Build Date', value: get('ro.build.date', 'N/A') },
            { label: 'Bootloader', value: get('ro.bootloader', 'locked') },
            { label: 'Encryption', value: get('ro.crypto.state') === 'encrypted' ? '🔒 Encrypted' : 'Unencrypted' }
        ]));

        // ----- Hardware -----
        cards.push(makeCard('Hardware', 'fas fa-microchip', [
            { label: 'SoC', value: `${get('ro.soc.model', 'N/A')} (${get('ro.board.platform', 'N/A')})` },
            { label: 'GPU', value: get('ro.hardware.egl', 'N/A') },
            { label: 'RAM', value: get('ro.boot.ddrsize', 'N/A') },
            { label: 'Display Density', value: `${get('ro.sf.lcd_density', 'N/A')} dpi` }
        ]));

        // ----- Special Features -----
        cards.push(makeCard('Special Features', 'fas fa-star', [
            { label: 'Gesture Support', value: get('ro.os_gesture_support') === '1' ? '✅' : '❌' },
            { label: 'Game Mode', value: get('ro.os_gamemode_support') === '1' ? '✅' : '❌' },
            { label: 'Face Unlock', value: get('ro.faceid.support') === '1' ? '✅' : '❌' },
            { label: 'Fingerprint Sensor', value: get('ro.fingerprint_support') === '1' ? '✅' : '❌' }
        ]));

        // ----- Security & Boot -----
        const verifiedBootState = get('ro.boot.verifiedbootstate', 'unknown');
        const flashLocked = get('ro.boot.flash.locked') === '1' ? '🔒 Locked' : '🔓 Unlocked';
        const verityMode = get('ro.boot.veritymode', 'unknown');
        const adbSecure = get('ro.adb.secure') === '1' ? 'Yes' : 'No';
        const secureBuild = get('ro.secure') === '1' ? 'Production' : 'Debug';
        cards.push(makeCard('Security & Boot', 'fas fa-shield-alt', [
            { label: 'Verified Boot', value: verifiedBootState },
            { label: 'Bootloader', value: flashLocked },
            { label: 'dm‑verity', value: verityMode },
            { label: 'ADB Secure', value: adbSecure },
            { label: 'Build Type', value: secureBuild }
        ]));

        // ----- Camera -----
        const manualFocus = get('persist.sys.cam.manual.focus') === 'true' ? '✅' : '❌';
        const manualShutter = get('persist.sys.cam.manual.shutter') === 'true' ? '✅' : '❌';
        const beautyMode = get('persist.sys.cam.beauty.fullfuc') === 'true' ? '✅' : '❌';
        const wideCamera = get('persist.sys.cam.wide.8M') === 'true' ? '✅ (8MP)' : '❌';
        const zslDisabled = get('camera.disable_zsl_mode') === '1' ? 'Disabled' : 'Enabled';
        cards.push(makeCard('Camera', 'fas fa-camera', [
            { label: 'Manual Focus', value: manualFocus },
            { label: 'Manual Shutter', value: manualShutter },
            { label: 'Beauty Mode', value: beautyMode },
            { label: 'Wide Camera', value: wideCamera },
            { label: 'Zero‑Shutter‑Lag', value: zslDisabled }
        ]));

        // ----- Audio -----
        const audioDriver = get('ro.hardware.audio.primary', 'N/A');
        const callVolSteps = get('ro.config.vc_call_vol_steps', 'N/A');
        const callVolDefault = get('ro.config.vc_call_vol_default', 'N/A');
        const highVolumeWarning = get('persist.sys.hight_volume_switch') === 'true' ? 'On' : 'Off';
        cards.push(makeCard('Audio', 'fas fa-headphones', [
            { label: 'Audio Driver', value: audioDriver },
            { label: 'Call Volume Steps', value: callVolSteps },
            { label: 'Default Call Vol.', value: callVolDefault },
            { label: 'High Volume Warn', value: highVolumeWarning }
        ]));

        // ----- Sensors & Extras -----
        const sensorHub = get('ro.hardware.sensors', 'N/A');
        const nfc = get('nfc.initialized') === 'true' ? '✅' : '❌';
        const quickCharge = get('ro.quick_charge_support') === '1' ? '✅' : '❌';
        const iotCard = get('ro.iot_card_support') === '1' ? '✅' : '❌';
        const childMode = get('ro.childmode.support') === '1' ? '✅' : '❌';
        cards.push(makeCard('Sensors & Extras', 'fas fa-microchip', [
            { label: 'Sensor Hub', value: sensorHub },
            { label: 'NFC', value: nfc },
            { label: 'Quick Charge', value: quickCharge },
            { label: 'IoT/eSIM Support', value: iotCard },
            { label: 'Child Mode', value: childMode }
        ]));

        // ----- Final output (no raw properties section) -----
        const finalHtml = `<div class="cards-container">${cards.join('')}</div>`;
        document.getElementById('pageContent').innerHTML = finalHtml;
    } catch (err) {
        document.getElementById('pageContent').innerHTML = `<div class="card">Error loading device info: ${err.message}</div>`;
    }
}
// ==================== NETWORK CHECK (STRUCTURED CARD) ====================
async function renderNetwork() {
    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `<div class="card">No device connected.</div>`;
        return;
    }
    try {
        const res = await fetch(`${BACKEND_URL}/wifi/status/${currentDeviceId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        let html = '<div class="card"><h3>Network Status</h3>';
        if (data.wifi && data.wifi.ssid) {
            html += `<p><strong>WiFi SSID:</strong> ${escapeHtml(data.wifi.ssid)}</p>`;
            html += `<p><strong>Signal Strength:</strong> ${data.wifi.rssi !== undefined ? data.wifi.rssi + ' dBm' : 'N/A'}</p>`;
            if (data.wifi.ipAddress) html += `<p><strong>IP Address:</strong> ${escapeHtml(data.wifi.ipAddress)}</p>`;
        } else {
            html += '<p>No WiFi information available.</p>';
        }
        if (data.cellular) {
            html += `<p><strong>Cellular Operator:</strong> ${escapeHtml(data.cellular.operator || 'N/A')}</p>`;
            html += `<p><strong>Signal Level:</strong> ${data.cellular.signalStrength || 'N/A'}</p>`;
        }
        html += `<details><summary>Full JSON Response</summary><pre>${JSON.stringify(data, null, 2)}</pre></details>`;
        html += '</div>';
        document.getElementById('pageContent').innerHTML = html;
    } catch (err) {
        document.getElementById('pageContent').innerHTML = `<div class="card">Network check failed: ${err.message}</div>`;
    }
}

// ==================== AI DIAGNOSIS ====================
async function renderAIDiagnosis() {
    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `<div class="card">No device connected.</div>`;
        return;
    }
    try {
        const response = await fetch(`${BACKEND_URL}/ai-no-debug-suggest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connection: { deviceId: currentDeviceId } })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const suggestion = data.humanSummary || data.top?.label || 'Run a full diagnostic for personalized insights.';
        document.getElementById('pageContent').innerHTML = `<div class="card"><h3>AI Suggestion</h3><p>${escapeHtml(suggestion)}</p></div>`;
    } catch (err) {
        document.getElementById('pageContent').innerHTML = `<div class="card">AI diagnosis unavailable: ${err.message}</div>`;
    }
}

// ==================== BSOD DIAGNOSIS ====================
async function renderBsodDiagnosis() {
    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `<div class="card">No device connected.</div>`;
        return;
    }
    try {
        const res = await fetch(`${BACKEND_URL}/blue-test/run/${currentDeviceId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();
        document.getElementById('pageContent').innerHTML = `
            <div class="card">
                <h3>BSOD / Black Screen Analysis</h3>
                <pre>${JSON.stringify(result, null, 2)}</pre>
            </div>
        `;
    } catch (err) {
        document.getElementById('pageContent').innerHTML = `<div class="card">BSOD diagnosis failed: ${err.message}</div>`;
    }
}

// ==================== USB DEBUGGING WIZARD ====================
const modal = document.getElementById('wizardModal');
const closeModal = document.querySelector('.close-button');
const prevBtn = document.getElementById('wizardPrevBtn');
const nextBtn = document.getElementById('wizardNextBtn');
const cancelBtn = document.getElementById('wizardCancelBtn');

function openWizard() {
    wizardStep = 0;
    modal.style.display = 'flex';
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
    body.innerHTML = `
        <div class="progress-step">Step ${wizardStep+1} of ${steps.length}</div>
        <h4>${steps[wizardStep].title}</h4>
        <p>${steps[wizardStep].content}</p>
        ${wizardStep === 3 ? '<button id="testConnBtn" class="btn-primary">Test Connection</button><div id="connResult"></div>' : ''}
    `;
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

nextBtn.onclick = () => {
    if (wizardStep < 3) {
        wizardStep++;
        updateWizardUI();
    } else {
        modal.style.display = 'none';
    }
};
prevBtn.onclick = () => {
    if (wizardStep > 0) {
        wizardStep--;
        updateWizardUI();
    }
};
cancelBtn.onclick = () => modal.style.display = 'none';
if (closeModal) closeModal.onclick = () => modal.style.display = 'none';

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
            else if (page === 'network') await renderNetwork();
            else if (page === 'ai-diagnosis') await renderAIDiagnosis();
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