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