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
                if (currentTestResolver) {
                    cleanup();
                    resolve('no');
                }
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

    // Test definitions
    const tests = [
        {
            id: 'battery',
            name: 'Battery',
            run: async () => {
                const data = await apiCall(`/hardware/battery?deviceId=${currentDeviceId}`);
                const level = data.level || 0;
                const health = data.health || 'unknown';
                const passed = (level >= 20 && health === 'good');
                const message = passed ? `Level: ${level}%, health: ${health}` : (level < 20 ? 'Low battery (<20%)' : 'Poor battery health');
                return { passed, message };
            }
        },
        {
            id: 'storage',
            name: 'Storage',
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
        {
            id: 'sensors',
            name: 'Sensors',
            run: async () => {
                try {
                    const res = await apiCall(`/hardware/sensors?deviceId=${currentDeviceId}`);
                    const sensors = res.sensors || [];
                    const sensorTypes = sensors.map(s => s.type.toLowerCase());
                    const hasAccel = sensorTypes.some(t => t.includes('accelerometer'));
                    const hasGyro = sensorTypes.some(t => t.includes('gyroscope'));
                    const hasProx = sensorTypes.some(t => t.includes('proximity'));
                    const hasLight = sensorTypes.some(t => t.includes('light'));
                    const passed = hasAccel && hasGyro && hasProx && hasLight;
                    const missing = [];
                    if (!hasAccel) missing.push('accelerometer');
                    if (!hasGyro) missing.push('gyroscope');
                    if (!hasProx) missing.push('proximity');
                    if (!hasLight) missing.push('light');
                    const message = passed ? 'All core sensors detected' : `Missing: ${missing.join(', ')}`;
                    return { passed, message };
                } catch (err) {
                    return { passed: false, message: 'Failed to read sensors' };
                }
            }
        },
        {
            id: 'display',
            name: 'Display',
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
        {
            id: 'touch',
            name: 'Touch Screen',
            run: async () => {
                await launchAndroidTest('touch');
                modalTitle.textContent = 'Touch Screen Test';
                modalBody.innerHTML = `
                    <p>📱 The phone is now in touch test mode.</p>
                    <p>Please tap the screen several times. Does the screen register your touches?</p>
                    <p>(You will see a counter increase on the phone.)</p>
                `;
                modal.style.display = 'flex';
                const result = await waitForUserConfirmation(30000);
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? 'User confirmed touch working' : 'User reported touch issues';
                return { passed, message };
            }
        },
        {
            id: 'vibration',
            name: 'Vibration',
            run: async () => {
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
            }
        },
        {
            id: 'flashlight',
            name: 'Flashlight',
            run: async () => {
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
            }
        },
        {
            id: 'speaker',
            name: 'Speaker',
            run: async () => {
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
            }
        },
        {
            id: 'camera',
            name: 'Camera',
            run: async () => {
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
            }
        }
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

// Helper to call a fix action (e.g., bluetooth_reset, mobile_data_reset)
async function callFix(service, action) {
    try {
        const response = await fetch(`${BACKEND_URL}/android-connectivity/fix/${currentDeviceId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        return result;
    } catch (err) {
        console.error(`Fix failed for ${service}:`, err);
        throw err;
    }
}
async function renderConnectionTroubleshoot() {
    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `<div class="card">No device connected. Please connect an Android phone with USB debugging enabled.</div>`;
        return;
    }

    // Show loading state
    document.getElementById('pageContent').innerHTML = `<div class="card">Loading connection status...</div>`;

    try {
        // Fetch WiFi status
        const wifiRes = await fetch(`${BACKEND_URL}/wifi/status/${currentDeviceId}`);
        let wifiStatus = null;
        if (wifiRes.ok) wifiStatus = await wifiRes.json();

        // Fetch Bluetooth diagnosis
        const btRes = await fetch(`${BACKEND_URL}/android-connectivity/diagnose/${currentDeviceId}?target=bluetooth`);
        let btStatus = null;
        if (btRes.ok) btStatus = await btRes.json();

        // For mobile data, we can read from device properties or use a simple ADB command
        // We'll use the existing `/device/${currentDeviceId}` to get gsm.data.setenabled
        const deviceRes = await fetch(`${BACKEND_URL}/device/${currentDeviceId}`);
        let mobileDataEnabled = 'Unknown';
        if (deviceRes.ok) {
            let rawText = await deviceRes.text();
            try {
                const parsed = JSON.parse(rawText);
                if (typeof parsed === 'string') rawText = parsed;
            } catch (e) {}
            const lines = rawText.split(/\r?\n/);
            for (const line of lines) {
                const match = line.match(/^\[gsm.data.setenabled\]:\s*\[(.*?)\]$/);
                if (match) {
                    mobileDataEnabled = match[1] === 'true' ? 'Enabled' : 'Disabled';
                    break;
                }
            }
        }

        // Build WiFi card
        let wifiHtml = '';
        if (wifiStatus && wifiStatus.wifi) {
            const w = wifiStatus.wifi;
            wifiHtml = `
                <div class="info-card">
                    <div class="card-header"><i class="fas fa-wifi"></i> WiFi</div>
                    <div class="card-grid">
                        <div class="card-item"><span class="item-label">SSID</span><span class="item-value">${escapeHtml(w.ssid || 'Not connected')}</span></div>
                        <div class="card-item"><span class="item-label">Signal</span><span class="item-value">${w.rssi !== undefined ? w.rssi + ' dBm' : 'N/A'}</span></div>
                        <div class="card-item"><span class="item-label">IP Address</span><span class="item-value">${escapeHtml(w.ipAddress || 'N/A')}</span></div>
                        <div class="card-item"><span class="item-label">Link Speed</span><span class="item-value">${w.linkSpeed ? w.linkSpeed + ' Mbps' : 'N/A'}</span></div>
                    </div>
                    <div class="card-actions">
                        <button class="btn-primary fix-wifi" data-action="wifi_reset">Reset WiFi</button>
                        <button class="btn-secondary fix-wifi" data-action="wifi_forget">Forget current network (not implemented)</button>
                    </div>
                </div>
            `;
        } else {
            wifiHtml = `<div class="info-card"><div class="card-header"><i class="fas fa-wifi"></i> WiFi</div><div class="card-grid"><div class="card-item">Unable to fetch WiFi status</div></div></div>`;
        }

        // Build Bluetooth card
        let btHtml = '';
        if (btStatus && btStatus.bluetooth) {
            const bt = btStatus.bluetooth;
            const enabled = bt.enabled ? '✅ Yes' : '❌ No';
            const bondedCount = bt.summary?.bondedCount || 0;
            const connectedCount = bt.summary?.connectedCount || 0;
            btHtml = `
                <div class="info-card">
                    <div class="card-header"><i class="fab fa-bluetooth"></i> Bluetooth</div>
                    <div class="card-grid">
                        <div class="card-item"><span class="item-label">Enabled</span><span class="item-value">${enabled}</span></div>
                        <div class="card-item"><span class="item-label">Paired Devices</span><span class="item-value">${bondedCount}</span></div>
                        <div class="card-item"><span class="item-label">Connected</span><span class="item-value">${connectedCount}</span></div>
                    </div>
                    <div class="card-actions">
                        <button class="btn-primary fix-bluetooth" data-action="bluetooth_reset">Reset Bluetooth (off/on)</button>
                        <button class="btn-secondary fix-bluetooth" data-action="bluetooth_force_stop">Force Stop & Reset</button>
                        <button class="btn-secondary fix-bluetooth" data-action="bluetooth_clear_cache">Clear Cache & Reset</button>
                    </div>
                </div>
            `;
        } else {
            btHtml = `<div class="info-card"><div class="card-header"><i class="fab fa-bluetooth"></i> Bluetooth</div><div class="card-grid"><div class="card-item">Unable to fetch Bluetooth status</div></div></div>`;
        }

        // Build Mobile Data card
        let mobileHtml = `
            <div class="info-card">
                <div class="card-header"><i class="fas fa-mobile-alt"></i> Mobile Data</div>
                <div class="card-grid">
                    <div class="card-item"><span class="item-label">Status</span><span class="item-value">${escapeHtml(mobileDataEnabled)}</span></div>
                </div>
                <div class="card-actions">
                    <button class="btn-primary fix-mobile" data-action="mobile_data_reset">Reset Mobile Data (off/on)</button>
                </div>
            </div>
        `;

        // Combine everything
        const html = `
            <div class="cards-container">
                ${wifiHtml}
                ${btHtml}
                ${mobileHtml}
            </div>
            <div id="fixResult" class="card" style="display: none; margin-top: 20px;"></div>
        `;
        document.getElementById('pageContent').innerHTML = html;

        // Attach event listeners for WiFi fixes (note: WiFi reset not yet implemented in backend; we'll add a simple toggle using svc wifi)
        document.querySelectorAll('.fix-wifi').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.getAttribute('data-action');
                if (action === 'wifi_reset') {
                    try {
                        // Simple WiFi toggle via ADB (not in existing routes)
                        const res = await fetch(`${BACKEND_URL}/wifi/toggle`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ deviceId: currentDeviceId, enable: false })
                        });
                        await res.json();
                        await new Promise(r => setTimeout(r, 1000));
                        await fetch(`${BACKEND_URL}/wifi/toggle`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ deviceId: currentDeviceId, enable: true })
                        });
                        showFixResult('WiFi reset completed. Refresh status to see changes.');
                    } catch (err) {
                        showFixResult(`WiFi reset failed: ${err.message}`, true);
                    }
                } else {
                    showFixResult('Action not yet implemented', true);
                }
            });
        });

        // Bluetooth fixes using existing endpoint
        document.querySelectorAll('.fix-bluetooth').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.getAttribute('data-action');
                try {
                    const result = await callFix('bluetooth', action);
                    showFixResult(`Bluetooth fix '${action}' completed. Steps: ${JSON.stringify(result.steps)}`);
                    // Refresh Bluetooth status after 2 seconds
                    setTimeout(() => renderConnectionTroubleshoot(), 2000);
                } catch (err) {
                    showFixResult(`Bluetooth fix failed: ${err.message}`, true);
                }
            });
        });

        // Mobile data fix
        document.querySelectorAll('.fix-mobile').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.getAttribute('data-action');
                try {
                    const result = await callFix('mobile', action);
                    showFixResult(`Mobile data reset completed. Steps: ${JSON.stringify(result.steps)}`);
                    setTimeout(() => renderConnectionTroubleshoot(), 2000);
                } catch (err) {
                    showFixResult(`Mobile data reset failed: ${err.message}`, true);
                }
            });
        });

        function showFixResult(message, isError = false) {
            const resultDiv = document.getElementById('fixResult');
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = `<div style="color: ${isError ? '#d32f2f' : '#2e7d32'};">${escapeHtml(message)}</div>`;
            setTimeout(() => {
                resultDiv.style.display = 'none';
            }, 5000);
        }

    } catch (err) {
        document.getElementById('pageContent').innerHTML = `<div class="card">Error loading troubleshoot page: ${err.message}</div>`;
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
// In js/ui.js
async function renderBsodDiagnosis() {
    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `<div class="card">No device connected.</div>`;
        return;
    }

    // Initial UI with a button
    const startHtml = `
        <div class="info-card" style="text-align: center;">
            <div class="card-header"><i class="fas fa-skull-crosswalk"></i> BSOD / Black Screen Analysis</div>
            <div class="card-content">
                <p>Click the button below to start a full diagnostic. This will check for OS corruption, unexpected reboots, kernel panics, and other crash indicators.</p>
                <button id="startBsodBtn" class="btn-primary" style="font-size: 18px;">🔍 Diagnose Now</button>
            </div>
        </div>
        <div id="bsodResult" style="display: none;"></div>
    `;
    document.getElementById('pageContent').innerHTML = startHtml;

    const startBtn = document.getElementById('startBsodBtn');
    const resultDiv = document.getElementById('bsodResult');

    startBtn?.addEventListener('click', async () => {
        // Show loading state
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `<div class="info-card"><div class="card-header"><i class="fas fa-spinner fa-pulse"></i> Analyzing...</div><div class="card-content"><p>Please wait while we check for crash signatures and instability signs.</p></div></div>`;

        try {
            const response = await fetch(`${BACKEND_URL}/api/bsod/diagnose`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adbDeviceId: currentDeviceId })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            const diag = data.diagnosis;
            const cause = diag.cause;
            let severityColor = '#2e7d32'; // green for normal
            let icon = 'fa-check-circle';
            if (cause.includes("corruption") || cause.includes("crash")) {
                severityColor = '#c62828';
                icon = 'fa-exclamation-triangle';
            } else if (cause.includes("instability")) {
                severityColor = '#ed6c02';
                icon = 'fa-exclamation-circle';
            }

            // Build signals list
            let signalsHtml = '';
            if (diag.signals && diag.signals.length > 0) {
                signalsHtml = `<div class="card-header"><i class="fas fa-list"></i> Detected Signals</div><div class="card-content"><ul style="margin:0; padding-left:20px;">` +
                    diag.signals.map(s => `<li><strong>${s.title}</strong> (${s.severity}) - ${s.points} points</li>`).join('') +
                    `</ul></div>`;
            }

            const html = `
                <div class="info-card">
                    <div class="card-header"><i class="fas ${icon}" style="color:${severityColor}"></i> Diagnosis Result</div>
                    <div class="card-content">
                        <div class="card-item"><span class="item-label">Conclusion</span><span class="item-value">${cause}</span></div>
                        <div class="card-item"><span class="item-label">Confidence</span><span class="item-value">${diag.confidence} (Score: ${diag.score}/100)</span></div>
                        <div class="card-item"><span class="item-label">Details</span><span class="item-value">${diag.detail || 'No additional details.'}</span></div>
                    </div>
                </div>
                ${signalsHtml}
                <div class="info-card">
                    <div class="card-header"><i class="fas fa-lightbulb"></i> Next Steps</div>
                    <div class="card-content">
                        <p>${getRecommendation(cause)}</p>
                    </div>
                </div>
            `;
            resultDiv.innerHTML = html;
        } catch (err) {
            resultDiv.innerHTML = `<div class="info-card"><div class="card-header"><i class="fas fa-times-circle"></i> Error</div><div class="card-content"><p>Failed to diagnose: ${err.message}</p></div></div>`;
        }
    });
}

function getRecommendation(cause) {
    if (cause.includes("corruption") || cause.includes("crash")) {
        return "📱 Consider re-flashing the stock firmware. Back up your data if possible. If the issue persists, it may point to a hardware problem with the storage chip.";
    } else if (cause.includes("instability")) {
        return "🔧 Boot into Safe Mode (if possible) and uninstall recently added apps. Check for system updates or perform a factory reset as a last resort.";
    }
    return "✅ Your phone shows no clear signs of OS corruption. If the screen remains black, the issue is likely hardware-related (display cable, motherboard, or power).";
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
            else if (page === 'connection-troubleshoot') await renderConnectionTroubleshoot();
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