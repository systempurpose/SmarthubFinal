// ==================== GLOBALS ====================
let currentDeviceId = null;
let wizardStep = 0;

// ==================== API HELPER ====================
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

// ==================== CONNECTION STATUS ====================
async function updateConnectionStatus() {
    const statusSpan = document.querySelector('#connectionStatus span');
    if (!statusSpan) return;
    try {
        // First try /api/devices
        let data = await apiCall('/devices');
        if (!data.devices || data.devices.length === 0) {
            // Fallback: try /api/device/list (if your backend provides it)
            try {
                const listData = await apiCall('/device/list');
                if (listData.devices && listData.devices.length) {
                    data = { devices: listData.devices.map(d => d.id) };
                }
            } catch (e2) { /* ignore */ }
        }
        if (data.devices && data.devices.length) {
            currentDeviceId = data.devices[0];
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

    // Fetch health data from new hardware routes
    try {
        const battery = await apiCall('/hardware/battery');
        const storage = await apiCall('/hardware/storage');
        const ram = await apiCall('/hardware/ram');
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
        const res = await apiCall('/hardware/battery');
        document.getElementById('testResults').innerHTML = `<pre>${JSON.stringify(res, null, 2)}</pre>`;
    });
    document.getElementById('testStorage')?.addEventListener('click', async () => {
        const res = await apiCall('/hardware/storage');
        document.getElementById('testResults').innerHTML = `<pre>${JSON.stringify(res, null, 2)}</pre>`;
    });
    document.getElementById('testSensors')?.addEventListener('click', async () => {
        const res = await apiCall('/hardware/sensors');
        document.getElementById('testResults').innerHTML = `<pre>${JSON.stringify(res, null, 2)}</pre>`;
    });
}
async function renderBsodDiagnosis() {
    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `<div class="card">No device connected. Please connect an Android phone with USB debugging enabled.</div>`;
        return;
    }
    try {
        // Call the backend's BSOD test endpoint – adjust the path as needed.
        // Based on your server.ts, you have registerBlueTestRoutes(app), which likely provides /api/blue-test/run.
        const result = await apiCall(`/blue-test/run/${currentDeviceId}`);
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
// ==================== REPAIRS PAGE ====================
async function renderRepairs() {
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

// ==================== OTHER PAGES (Placeholders) ====================
async function renderDeviceInfo() {
    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `<div class="card">No device connected. Please connect an Android phone with USB debugging enabled.</div>`;
        return;
    }
    try {
        const info = await apiCall(`/device/info/${currentDeviceId}`);
        document.getElementById('pageContent').innerHTML = `<div class="card"><pre>${JSON.stringify(info, null, 2)}</pre></div>`;
    } catch (err) {
        document.getElementById('pageContent').innerHTML = `<div class="card">Error loading device info: ${err.message}</div>`;
    }
}

async function renderNetwork() {
    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `<div class="card">No device connected. Please connect an Android phone with USB debugging enabled.</div>`;
        return;
    }
    try {
        const net = await apiCall(`/network/status/${currentDeviceId}`);
        document.getElementById('pageContent').innerHTML = `<div class="card"><pre>${JSON.stringify(net, null, 2)}</pre></div>`;
    } catch (err) {
        document.getElementById('pageContent').innerHTML = `<div class="card">Network check failed: ${err.message}</div>`;
    }
}

async function renderAIDiagnosis() {
    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `<div class="card">No device connected. Please connect an Android phone with USB debugging enabled.</div>`;
        return;
    }
    try {
        const ai = await apiCall(`/ai/quick-diagnose/${currentDeviceId}`);
        document.getElementById('pageContent').innerHTML = `<div class="card"><h3>AI Suggestion</h3><p>${ai.suggestion || 'Run diagnostics first.'}</p></div>`;
    } catch (err) {
        document.getElementById('pageContent').innerHTML = `<div class="card">AI diagnosis unavailable: ${err.message}</div>`;
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

