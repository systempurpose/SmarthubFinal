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
        const res = await fetch(`${BACKEND_URL}/device/${currentDeviceId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let rawText = await res.text();

        // Unwrap JSON string if needed
        try {
            const parsedJson = JSON.parse(rawText);
            if (typeof parsedJson === 'string') rawText = parsedJson;
        } catch (e) { /* not JSON, use as is */ }

        const lines = rawText.split(/\r?\n/);
        const props = {};
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const match = trimmed.match(/^\[(.*?)\]:\s*\[(.*?)\]$/);
            if (match) props[match[1]] = match[2];
        }

        if (Object.keys(props).length === 0) {
            document.getElementById('pageContent').innerHTML = `
                <div class="card">
                    <h3>Device Properties</h3>
                    <p>No properties could be parsed.</p>
                    <details><summary>Debug: raw response</summary><pre>${escapeHtml(rawText.substring(0, 1000))}</pre></details>
                </div>
            `;
            return;
        }

        // Helper to get property with fallback
        const get = (key, fallback = '?') => props[key] || fallback;

        // -------- Build Summary Cards ----------
        const cards = [];

        // 1. Device Overview (already existing)
        cards.push(`
            <div class="info-card">
                <div class="card-header"><i class="fas fa-info-circle"></i> Device Overview</div>
                <div class="card-grid">
                    <div class="card-item"><span class="item-label">Model</span><span class="item-value">${escapeHtml(get('ro.product.model', 'Unknown'))}</span></div>
                    <div class="card-item"><span class="item-label">Manufacturer</span><span class="item-value">${escapeHtml(get('ro.product.manufacturer', 'Unknown'))}</span></div>
                    <div class="card-item"><span class="item-label">Android</span><span class="item-value">${escapeHtml(get('ro.build.version.release'))} (SDK ${escapeHtml(get('ro.build.version.sdk'))})</span></div>
                    <div class="card-item"><span class="item-label">Security Patch</span><span class="item-value">${escapeHtml(get('ro.build.version.security_patch'))}</span></div>
                    <div class="card-item"><span class="item-label">Board / CPU</span><span class="item-value">${escapeHtml(get('ro.product.board'))} / ${escapeHtml(get('ro.product.cpu.abi'))}</span></div>
                    <div class="card-item"><span class="item-label">Serial</span><span class="item-value">${escapeHtml(get('ro.serialno'))}</span></div>
                    <div class="card-item"><span class="item-label">Display</span><span class="item-value">${escapeHtml(get('sys.logical.width', '?'))} x ${escapeHtml(get('sys.logical.height', '?'))}</span></div>
                </div>
            </div>
        `);

        // 2. Bluetooth Status
        const bluetoothEnabled = get('bluetooth.profile.a2dp.source.enabled') === 'true';
        const bluetoothProfiles = [
            'a2dp.source', 'avrcp.target', 'bas.client', 'gatt', 'hfp.ag', 'hid.device',
            'hid.host', 'map.server', 'opp', 'pan.nap', 'pan.panu', 'pbap.server'
        ].filter(p => get(`bluetooth.profile.${p}.enabled`) === 'true').length;
        cards.push(`
            <div class="info-card">
                <div class="card-header"><i class="fab fa-bluetooth"></i> Bluetooth</div>
                <div class="card-grid">
                    <div class="card-item"><span class="item-label">Enabled</span><span class="item-value">${bluetoothEnabled ? '✅ Yes' : '❌ No'}</span></div>
                    <div class="card-item"><span class="item-label">Active Profiles</span><span class="item-value">${bluetoothProfiles} / 12</span></div>
                    <div class="card-item"><span class="item-label">Adapter State</span><span class="item-value">${escapeHtml(get('cache_key.bluetooth.bluetooth_adapter_get_state', 'N/A'))}</span></div>
                </div>
            </div>
        `);

        // 3. Network & Telephony
        const operator = get('gsm.operator.alpha', 'Unknown');
        const networkType = get('gsm.network.type', 'Unknown');
        const simState = get('gsm.sim.state', 'Unknown');
        cards.push(`
            <div class="info-card">
                <div class="card-header"><i class="fas fa-network-wired"></i> Network & SIM</div>
                <div class="card-grid">
                    <div class="card-item"><span class="item-label">Operator</span><span class="item-value">${escapeHtml(operator)}</span></div>
                    <div class="card-item"><span class="item-label">Network Type</span><span class="item-value">${escapeHtml(networkType)}</span></div>
                    <div class="card-item"><span class="item-label">SIM State</span><span class="item-value">${escapeHtml(simState)}</span></div>
                    <div class="card-item"><span class="item-label">VoLTE / VoWiFi</span><span class="item-value">${get('gsm.sys.volte.state') === '1' ? 'VoLTE On' : 'VoLTE Off'} / ${get('gsm.sys.vowifi.state') === '1' ? 'VoWiFi On' : 'VoWiFi Off'}</span></div>
                </div>
            </div>
        `);

        // 4. System & Build
        cards.push(`
            <div class="info-card">
                <div class="card-header"><i class="fas fa-code-branch"></i> System & Build</div>
                <div class="card-grid">
                    <div class="card-item"><span class="item-label">Fingerprint</span><span class="item-value" style="font-family: monospace;">${escapeHtml(get('ro.build.fingerprint', 'N/A').substring(0, 60))}...</span></div>
                    <div class="card-item"><span class="item-label">Build Date</span><span class="item-value">${escapeHtml(get('ro.build.date', 'N/A'))}</span></div>
                    <div class="card-item"><span class="item-label">Bootloader</span><span class="item-value">${escapeHtml(get('ro.bootloader', 'locked'))}</span></div>
                    <div class="card-item"><span class="item-label">Encryption</span><span class="item-value">${get('ro.crypto.state') === 'encrypted' ? '🔒 Encrypted' : 'Unencrypted'}</span></div>
                </div>
            </div>
        `);

        // 5. Hardware & Sensors
        cards.push(`
            <div class="info-card">
                <div class="card-header"><i class="fas fa-microchip"></i> Hardware</div>
                <div class="card-grid">
                    <div class="card-item"><span class="item-label">SoC</span><span class="item-value">${escapeHtml(get('ro.soc.model', 'N/A'))} (${escapeHtml(get('ro.board.platform', 'N/A'))})</span></div>
                    <div class="card-item"><span class="item-label">GPU</span><span class="item-value">${escapeHtml(get('ro.hardware.egl', 'N/A'))}</span></div>
                    <div class="card-item"><span class="item-label">RAM</span><span class="item-value">${escapeHtml(get('ro.boot.ddrsize', 'N/A'))}</span></div>
                    <div class="card-item"><span class="item-label">Display Density</span><span class="item-value">${escapeHtml(get('ro.sf.lcd_density', 'N/A'))} dpi</span></div>
                </div>
            </div>
        `);

        // 6. Features (gestures, game mode, etc.)
        const gestures = get('ro.os_gesture_support') === '1' ? '✅' : '❌';
        const gameMode = get('ro.os_gamemode_support') === '1' ? '✅' : '❌';
        const faceUnlock = get('ro.faceid.support') === '1' ? '✅' : '❌';
        cards.push(`
            <div class="info-card">
                <div class="card-header"><i class="fas fa-star"></i> Special Features</div>
                <div class="card-grid">
                    <div class="card-item"><span class="item-label">Gesture Support</span><span class="item-value">${gestures}</span></div>
                    <div class="card-item"><span class="item-label">Game Mode</span><span class="item-value">${gameMode}</span></div>
                    <div class="card-item"><span class="item-label">Face Unlock</span><span class="item-value">${faceUnlock}</span></div>
                    <div class="card-item"><span class="item-label">Fingerprint Sensor</span><span class="item-value">${get('ro.fingerprint_support') === '1' ? '✅' : '❌'}</span></div>
                </div>
            </div>
        `);

        // Collapsible raw properties (hidden by default)
        const tableRows = [];
        for (const [k, v] of Object.entries(props)) {
            tableRows.push(`<tr><td class="key">${escapeHtml(k)}</td><td class="value">${escapeHtml(v)}</td></tr>`);
        }
        const rawHtml = `
            <button id="toggleRawBtn" class="btn-secondary" style="margin-top: 16px;">Show all raw properties (${Object.keys(props).length} entries)</button>
            <div id="rawPropertiesPanel" style="display: none; margin-top: 16px;">
                <div class="table-container">
                    <table class="device-info-table"><tbody>${tableRows.join('')}</tbody></table>
                </div>
            </div>
        `;

        const finalHtml = `<div class="cards-container">${cards.join('')}</div>${rawHtml}`;
        document.getElementById('pageContent').innerHTML = finalHtml;

        // Toggle for raw properties
        const toggleBtn = document.getElementById('toggleRawBtn');
        const panel = document.getElementById('rawPropertiesPanel');
        if (toggleBtn && panel) {
            let expanded = false;
            toggleBtn.addEventListener('click', () => {
                expanded = !expanded;
                panel.style.display = expanded ? 'block' : 'none';
                toggleBtn.textContent = expanded ? 'Hide all raw properties' : `Show all raw properties (${Object.keys(props).length} entries)`;
            });
        }
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