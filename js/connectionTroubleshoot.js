// ==================== CONNECTION TROUBLESHOOT ====================
async function renderConnectionTroubleshoot() {
    // ---- current language (kept in sync by applyLanguage()) ----
    const lang = window._activeLang
        || (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language
        || 'en';

    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `<div class="card" data-i18n="conn.noDevice">${t('conn.noDevice', lang)}</div>`;
        if (typeof applyLanguage === 'function') applyLanguage(lang);
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

    // NOTE: titles/descs below are looked up at build time via t(). Since this
    // whole block is rebuilt from scratch every time the page is opened, a
    // stale translation here just means the user hasn't switched language
    // since the last time they opened this page — the data-i18n attributes we
    // stamp onto the cards let the applyLanguage() sweep at the bottom (and any
    // later language switch while this page is open) correct it live.
    const testCards = [
        { id: 'wifi', titleKey: 'conn.wifi.title', descKey: 'conn.wifi.desc' },
        { id: 'bluetooth', titleKey: 'conn.bluetooth.title', descKey: 'conn.bluetooth.desc' },
        { id: 'mobile', titleKey: 'conn.mobile.title', descKey: 'conn.mobile.desc' },
    ];

    let cardsHtml = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px;">`;
    for (const card of testCards) {
        const saved = testResults[card.id];
        let statusKey = 'conn.status.pending';
        let color = '#6B7280';
        if (saved) {
            statusKey = saved.passed ? 'conn.status.passed' : 'conn.status.failed';
            color = saved.passed ? '#2e7d32' : '#d32f2f';
        }
        cardsHtml += `
            <div class="test-card" id="conn-card-${card.id}" style="background: white; padding: 16px 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); display: flex; flex-direction: column; justify-content: space-between; border-left: 4px solid ${saved && saved.passed ? '#2e7d32' : '#6B7280'};">
                <div>
                    <h3 data-i18n="${card.titleKey}" style="margin: 0 0 4px 0; font-size: 16px;">${t(card.titleKey, lang)}</h3>
                    <p data-i18n="${card.descKey}" style="margin: 0 0 12px 0; color: #6B7280; font-size: 13px;">${t(card.descKey, lang)}</p>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                    <span class="status-text" id="conn-status-${card.id}" ${saved ? '' : `data-i18n="${statusKey}"`} style="font-weight: 600; color: ${color}; font-size: 14px;">${t(statusKey, lang)}</span>
                    <button class="btn-primary run-conn-test" data-test="${card.id}" data-i18n="conn.btn.test" style="font-size: 12px; padding: 4px 16px;">${t('conn.btn.test', lang)}</button>
                </div>
            </div>
        `;
    }
    cardsHtml += `</div>`;

    const fixOptionsHtml = `
        <div id="fixOptionsSection" style="margin-top: 24px;">
            <h3 data-i18n="conn.fixOptions.title" style="margin-bottom: 12px;">${t('conn.fixOptions.title', lang)}</h3>
            <div id="fixCardsContainer" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px;"></div>
            <div id="fixWarning" data-i18n="conn.fixOptions.warning" style="margin-top: 8px; font-size: 13px; color: #6B7280; display: none;">
                ${t('conn.fixOptions.warning', lang)}
            </div>
        </div>
    `;

    document.getElementById('pageContent').innerHTML = `
        <h1 data-i18n="conn.title" style="margin-bottom: 20px;">${t('conn.title', lang)}</h1>
        <div id="radioRestoreNotice" style="display:none; margin-bottom:16px; padding:10px 14px; background:#eff6ff; border-left:4px solid #3b82f6; border-radius:6px; font-size:13px; color:#1e3a8a;"></div>
        ${cardsHtml}
        <div id="testResult" style="margin-top: 20px; display: none;"></div>
        ${fixOptionsHtml}
    `;

    // ---- Re-apply the active language across the freshly-built markup.
    // The card titles/descs/buttons above were already rendered in `lang` at
    // template time, but this sweep is what keeps them correct if the user
    // switches languages *while this page is open* (data-i18n is the hook the
    // global applyLanguage() sweep needs — without it this page would be
    // frozen in whatever language it happened to be built in, same bug the
    // dashboard had). ----
    if (typeof applyLanguage === 'function') {
        applyLanguage(window._activeLang || lang);
    }

    // ---- Per-service fix action definitions, now translation-aware.
    // Re-reads t() each time it's called (rather than being built once at
    // module scope) so it always reflects window._activeLang, even if the
    // language changed after this page loaded. ----
    function getFixActions(service) {
        const curLang = window._activeLang || lang;
        const actions = {
            wifi: [
                { action: 'wifi_reset', label: t('conn.fix.wifi.reset', curLang), primary: true },
                { action: 'wifi_scan', label: t('conn.fix.wifi.scan', curLang), primary: false },
            ],
            bluetooth: [
                { action: 'bluetooth_reset', label: t('conn.fix.bluetooth.reset', curLang), primary: true },
                { action: 'bluetooth_force_stop', label: t('conn.fix.bluetooth.forceStop', curLang), primary: false },
                { action: 'bluetooth_clear_cache', label: t('conn.fix.bluetooth.clearCache', curLang), primary: false },
            ],
            mobile: [
                { action: 'mobile_data_reset', label: t('conn.fix.mobile.reset', curLang), primary: true },
                { action: 'set_lte', label: t('conn.fix.mobile.lte', curLang), primary: false },
            ]
        };
        return actions[service] || [];
    }

    function buildAllFixCards() {
        const curLang = window._activeLang || lang;
        const allServices = ['wifi', 'bluetooth', 'mobile'];
        const serviceTitleKeys = { wifi: 'conn.service.wifi', bluetooth: 'conn.service.bluetooth', mobile: 'conn.service.mobile' };
        const fixContainer = document.getElementById('fixCardsContainer');
        let html = '';
        for (const service of allServices) {
            const actions = getFixActions(service);
            const serviceTitle = t(serviceTitleKeys[service], curLang);
            let buttonsHtml = actions.map(a =>
                `<button class="${a.primary ? 'btn-primary' : 'btn-secondary'} fix-btn" data-service="${service}" data-action="${a.action}" style="font-size: 12px; padding: 4px 12px;">${a.label}</button>`
            ).join('');
            html += `
                <div class="fix-card" style="background: white; padding: 16px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-left: 4px solid #6B7280;">
                    <h4 data-i18n="${serviceTitleKeys[service]}" style="margin: 0 0 8px 0; font-size: 15px;">${serviceTitle}</h4>
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
                const curLang2 = window._activeLang || lang;
                const allPass = Object.values(testResults).every(r => r && r.passed === true);
                if (allPass && Object.keys(testResults).length > 0) {
                    const confirmMsg = t('conn.fixConfirm', curLang2).replace('{action}', action);
                    if (!confirm(confirmMsg)) {
                        return;
                    }
                }
                btn.disabled = true;
                const originalLabel = btn.textContent;
                btn.textContent = t('conn.btn.applying', curLang2);
                try {
                    const fixResp = await fetchWithTimeout(`${BACKEND_URL}/android-connectivity/fix/${currentDeviceId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action })
                    }, 10000);
                    const fixData = await fixResp.json();
                    alert(fixData.message || t('conn.fixApplied.default', curLang2));
                    await runConnectionTest(service);
                } catch (err) {
                    alert(t('conn.fixFailed.prefix', curLang2) + (err.name === 'AbortError' ? t('conn.error.timeout', curLang2) : err.message));
                } finally {
                    btn.disabled = false;
                    btn.textContent = originalLabel;
                }
            });
        });
    }

    async function runConnectionTest(testId) {
        if (isRunning) return;
        isRunning = true;
        const curLang = window._activeLang || lang;

        const card = document.getElementById(`conn-card-${testId}`);
        const statusSpan = document.getElementById(`conn-status-${testId}`);
        const btn = card.querySelector('.run-conn-test');
        const resultDiv = document.getElementById('testResult');
        const warningDiv = document.getElementById('fixWarning');
        const restoreNotice = document.getElementById('radioRestoreNotice');

        document.querySelectorAll('.run-conn-test').forEach(b => b.disabled = true);
        btn.disabled = true;
        btn.textContent = t('conn.btn.running', curLang);
        // This card's status is now driven by live test state, not the
        // static list — remove data-i18n so a later applyLanguage() sweep
        // (which runs on a snapshot of the DOM, not the live test) doesn't
        // clobber it back to "Pending".
        statusSpan.removeAttribute('data-i18n');
        statusSpan.style.color = '#f59e0b';
        statusSpan.textContent = t('conn.status.running', curLang);
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `<p>${t('conn.testing', curLang).replace('{service}', testId)}</p>`;
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
            // `message`/`error` come from the backend and are left as-is
            // (not translated) since we don't control their language server-side.
            let msg = pass ? data.message : (data.error || t('conn.status.failed', curLang));
            if (testId === 'bluetooth' && pass) {
                msg += ` | ${t('conn.paired', curLang)}: ${data.pairedCount || 0} | ${t('conn.opp', curLang)}: ${data.oppSupported ? '✅' : '❌'}`;
            }
            if (testId === 'mobile' && data.signalStrength) {
                msg += ` | ${t('conn.signal', curLang)}: ${data.signalStrength}`;
            }

            // conn.status.passed/failed already include their own icon, so use
            // them directly rather than re-prefixing with a separate `icon` var.
            statusSpan.style.color = color;
            statusSpan.textContent = pass ? t('conn.status.passed', curLang) : t('conn.status.failed', curLang);
            btn.textContent = pass ? t('conn.btn.rerun', curLang) : t('conn.btn.retry', curLang);
            btn.disabled = false;
            resultDiv.innerHTML = `<div style="background: ${pass ? '#e8f5e9' : '#ffebee'}; padding: 12px; border-radius: 8px; color: ${color};">${icon} ${msg}</div>`;

            card.style.borderLeftColor = color;

            const allPass = Object.values(testResults).every(r => r && r.passed === true);
            warningDiv.style.display = allPass ? 'block' : 'none';

        } catch (err) {
            const timedOut = err.name === 'AbortError';
            statusSpan.style.color = '#d32f2f';
            statusSpan.textContent = t('conn.status.error', curLang);
            btn.textContent = t('conn.btn.retry', curLang);
            btn.disabled = false;
            resultDiv.innerHTML = `<div style="background: #ffebee; padding: 12px; border-radius: 8px; color: #d32f2f;">${t('conn.error.prefix', curLang)}${timedOut ? t('conn.error.timeout', curLang) : err.message}</div>`;
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
                    const curLang2 = window._activeLang || lang;
                    restoreNotice.style.display = 'block';
                    restoreNotice.textContent = t('conn.restoreNotice.restoring', curLang2);
                    for (const cmd of restoreCmds) {
                        try { await runAdb(cmd); } catch { /* best effort restore */ }
                    }
                    restoreNotice.textContent = t('conn.restoreNotice.restored', curLang2);
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