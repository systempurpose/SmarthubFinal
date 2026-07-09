async function renderBsodDiagnosis() {
    const container = document.getElementById('pageContent');

    // ---- Helper: get current language ----
    function _getLang() {
        return window._activeLang
            || (window.SmartHubI18n && window.SmartHubI18n.getCurrentLang ? window.SmartHubI18n.getCurrentLang() : 'en');
    }

    function _t(key, fallback) {
        const lang = _getLang();
        let result = null;
        if (window.SmartHubI18n && typeof window.SmartHubI18n.t === 'function') {
            result = window.SmartHubI18n.t(key, lang);
        }
        if (!result && typeof t === 'function') {
            result = t(key, lang);
        }
        return result || fallback || key;
    }

    // ---- One-time style injection (scoped to this page, safe to call repeatedly) ----
    function injectBsodStyles() {
        if (document.getElementById('bsodStyleSheet')) return;
        const style = document.createElement('style');
        style.id = 'bsodStyleSheet';
        style.textContent = `
            .bsod-page { --bs-critical:#c62828; --bs-critical-bg:#fef2f2; --bs-critical-border:#f8c9c9;
                         --bs-warn:#ed6c02; --bs-warn-bg:#fff7ed; --bs-warn-border:#fde3c0;
                         --bs-good:#2e7d32; --bs-good-bg:#f0fdf4; --bs-good-border:#bfe6c4;
                         --bs-neutral:#6b7280; --bs-neutral-bg:#f1f5f9; --bs-neutral-border:#e2e8f0;
                         --bs-ink:#1e293b; --bs-muted:#64748b; }

            .bsod-hero { margin-bottom:20px; }
            .bsod-hero h1 { margin:0 0 6px; font-size:23px; font-weight:700; color:var(--bs-ink); }
            .bsod-hero p { margin:0; color:var(--bs-muted); font-size:14px; }

            .bsod-live { display:inline-flex; align-items:center; gap:7px; margin-top:12px; padding:5px 12px;
                         border-radius:999px; background:#eef2ff; border:1px solid #e0e7ff; font-size:12px;
                         font-weight:600; color:#4338ca; }
            .bsod-live .pulse { width:7px; height:7px; border-radius:50%; background:#4338ca;
                                 animation: bsodPulse 1.6s ease-in-out infinite; }
            @keyframes bsodPulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.35; transform:scale(1.6); } }
            @media (prefers-reduced-motion: reduce) { .bsod-live .pulse { animation:none; } }

            .bsod-state-banner { display:flex; align-items:center; gap:12px; margin:16px 0; padding:13px 16px;
                                  border-radius:10px; border-left:4px solid var(--c); background:color-mix(in srgb, var(--c) 8%, white); }
            .bsod-state-banner .icon { font-size:22px; flex-shrink:0; }
            .bsod-state-banner .label { font-weight:700; color:var(--c); font-size:14.5px; }
            .bsod-state-banner .detail { font-size:12.5px; color:var(--bs-muted); margin-left:8px; }

            .bsod-verdict { margin-top:14px; border-radius:14px; padding:20px 22px; border:1px solid;
                             background:var(--bg); border-color:var(--bd); border-left:6px solid var(--c); }
            .bsod-verdict-head { display:flex; align-items:flex-start; gap:12px; margin-bottom:4px; }
            .bsod-verdict-head .icon { font-size:26px; line-height:1; margin-top:1px; }
            .bsod-verdict-head h2 { margin:0; font-size:18px; font-weight:800; color:var(--c); }
            .bsod-verdict-head .sub { margin:3px 0 0; font-size:12.5px; font-weight:600; color:var(--bs-muted);
                                       text-transform:uppercase; letter-spacing:0.04em; }
            .bsod-verdict p.detail-text { margin:12px 0 0; font-size:14px; line-height:1.55; color:var(--bs-ink); }

            .bsod-solution { margin-top:16px; padding:15px 18px; background:rgba(255,255,255,0.65);
                              border-radius:10px; border:1px solid rgba(0,0,0,0.06); }
            .bsod-solution h4 { margin:0 0 8px; font-size:12.5px; font-weight:700; text-transform:uppercase;
                                 letter-spacing:0.04em; color:var(--bs-muted); }
            .bsod-solution ol { margin:0; padding-left:20px; }
            .bsod-solution li { font-size:13.5px; color:#334155; line-height:1.9; }

            .bsod-note { margin-top:16px; padding:11px 15px; background:rgba(255,255,255,0.6); border-radius:9px;
                          font-size:13px; color:var(--bs-ink); border:1px solid rgba(0,0,0,0.06); }

            .bsod-signals { margin-top:12px; display:flex; flex-wrap:wrap; gap:8px; }
            .bsod-signal-tag { font-size:12px; font-weight:600; padding:4px 10px; border-radius:999px;
                                background:#f1f5f9; color:#334155; border:1px solid #e2e8f0; }

            .bsod-btn { display:inline-flex; align-items:center; gap:8px; padding:10px 26px; border-radius:10px;
                        font-size:14px; font-weight:600; cursor:pointer; border:1px solid transparent; }
            .bsod-btn-ghost { background:#f8fafc; color:#374151; border-color:#e5e7eb; }
            .bsod-btn-ghost:hover { background:#f1f5f9; }

            .bsod-spinner-wrap { text-align:center; padding:36px 20px; color:var(--bs-muted); }
            .bsod-spinner-wrap .spin { font-size:30px; display:inline-block; animation: bsodSpin 1s linear infinite; }
            @keyframes bsodSpin { to { transform:rotate(360deg); } }
            @media (prefers-reduced-motion: reduce) { .bsod-spinner-wrap .spin { animation:none; } }
            .bsod-spinner-wrap p { margin:10px 0 0; font-size:13.5px; }

            .bsod-modal-overlay { z-index:99999; background:rgba(15,23,42,0.55); backdrop-filter:blur(6px);
                                   align-items:center; justify-content:center; }
            .bsod-modal-box { max-width:560px; padding:0; border-radius:20px; box-shadow:0 30px 80px rgba(0,0,0,0.35); overflow:hidden; }
        `;
        document.head.appendChild(style);
    }
    injectBsodStyles();

    // ---- Get the existing warning modal from HTML ----
    const modal = document.getElementById('bsodWarningModal');
    if (!modal) {
        // Fallback: create modal if missing
        const modalHtml = `
            <div id="bsodWarningModal" class="modal bsod-modal-overlay" style="display: none;">
                <div class="modal-content acrylic bsod-modal-box">
                    <!-- Header -->
                    <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 20px 28px 16px 28px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                        <div style="display: flex; align-items: center; gap: 14px;">
                            <span style="font-size: 36px;">⚠️</span>
                            <div>
                                <h3 style="margin: 0; font-size: 22px; font-weight: 700; color: #92400e;" data-i18n="bsodWarning.title">${_t('bsodWarning.title', 'BSOD Diagnostic')}</h3>
                                <p style="margin: 2px 0 0 0; font-size: 14px; color: #78350f; opacity: 0.8;" data-i18n="bsodWarning.subtitle">${_t('bsodWarning.subtitle', 'Boot failure analysis tool')}</p>
                            </div>
                            <button id="bsodWarningClose" style="margin-left: auto; background: transparent; border: none; font-size: 28px; color: #78350f; cursor: pointer; opacity: 0.6; transition: opacity 0.2s; padding: 0 8px;">&times;</button>
                        </div>
                    </div>
                    <!-- Body -->
                    <div style="padding: 24px 28px 28px 28px;">
                        <p style="font-size: 16px; font-weight: 500; color: #1e293b; margin: 0 0 16px 0; line-height: 1.5;" data-i18n-html="bsodWarning.body">
                            ${_t('bsodWarning.body', 'This diagnostic is specifically for phones that <strong>cannot boot</strong> or are stuck in a <strong>boot loop / black screen</strong>.')}
                        </p>
                        <div style="background: #f8fafc; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px;">
                            <ul style="margin: 0; padding: 0; list-style: none; color: #334155; font-size: 14px; line-height: 2;">
                                <li style="display: flex; align-items: center; gap: 10px;" data-i18n-html="bsodWarning.list.item1">
                                    <span style="font-size: 18px;">⚠️</span> ${_t('bsodWarning.list.item1', 'Only use this if your phone <strong>won\'t start normally</strong>')}
                                </li>
                                <li style="display: flex; align-items: center; gap: 10px;" data-i18n-html="bsodWarning.list.item2">
                                    <span style="font-size: 18px;">🔌</span> ${_t('bsodWarning.list.item2', 'Requires a USB connection – <strong>no ADB needed</strong>')}
                                </li>
                                <li style="display: flex; align-items: center; gap: 10px;" data-i18n-html="bsodWarning.list.item3">
                                    <span style="font-size: 18px;">📱</span> ${_t('bsodWarning.list.item3', 'Detects Download Mode, Fastboot, Recovery, EDL, Preloader, and MTP')}
                                </li>
                                <li style="display: flex; align-items: center; gap: 10px;" data-i18n-html="bsodWarning.list.item4">
                                    <span style="font-size: 18px;">🔄</span> ${_t('bsodWarning.list.item4', 'If your phone <strong>is booting normally</strong>, use the <strong>Advanced Diagnostic</strong> or <strong>Hardware Tests</strong>')}
                                </li>
                            </ul>
                        </div>
                        <div style="display: flex; gap: 12px; justify-content: flex-end; padding-top: 4px;">
                            <button id="bsodWarningBack" class="btn-secondary" style="padding: 10px 28px; font-size: 14px; border-radius: 10px; font-weight: 500;" data-i18n="bsodWarning.back">${_t('bsodWarning.back', 'Back')}</button>
                            <button id="bsodWarningContinue" class="btn-primary" style="padding: 10px 32px; font-size: 14px; border-radius: 10px; font-weight: 600; background: #dc2626; border-color: #dc2626; box-shadow: 0 4px 12px rgba(220,38,38,0.3);" data-i18n="bsodWarning.continue">${_t('bsodWarning.continue', 'Continue')}</button>
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

    // Apply language to modal
    if (typeof applyLanguage === 'function') {
        const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
        applyLanguage(window._activeLang || savedLang);
    }

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
        <div class="bsod-page">
        <div class="bsod-hero">
            <h1 data-i18n="bsod.page.title">${_t('bsod.page.title', '🔍 BSOD / Boot Failure Analysis')}</h1>
            <p data-i18n="bsod.page.subtitle">${_t('bsod.page.subtitle', 'Detects device state and runs appropriate diagnostics – no ADB required.')}</p>
            <div class="bsod-live"><span class="pulse"></span><span data-i18n="bsod.page.live">${_t('bsod.page.live', 'Live monitoring – rechecking every 2s')}</span></div>
        </div>
        <div id="bsodStateContainer">
            <div class="bsod-spinner-wrap">
                <span class="spin">⏳</span>
                <p data-i18n="bsod.page.detecting">${_t('bsod.page.detecting', 'Detecting device...')}</p>
            </div>
        </div>
        <div id="bsodResult" style="margin-top:20px; display:none;"></div>
        </div>
    `;

    container.innerHTML = html;

    // ---- Apply language to page content ----
    if (typeof applyLanguage === 'function') {
        const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
        applyLanguage(window._activeLang || savedLang);
    }

    // ---- Track whether we've already auto-triggered the ADB diagnosis this session ----
    let autoRunTriggered = false;

    // ---- Helper: render a standardized auto-declared verdict card ----
    function verdictCard({ severity, icon, causeLabel, subLabel, detailText, solutionSteps, note }) {
        // severity: 'critical' | 'warn' | 'good' | 'neutral'
        const colorVar = { critical: '--bs-critical', warn: '--bs-warn', good: '--bs-good', neutral: '--bs-neutral' }[severity];
        const bgVar = { critical: '--bs-critical-bg', warn: '--bs-warn-bg', good: '--bs-good-bg', neutral: '--bs-neutral-bg' }[severity];
        const bdVar = { critical: '--bs-critical-border', warn: '--bs-warn-border', good: '--bs-good-border', neutral: '--bs-neutral-border' }[severity];

        const solutionHtml = (solutionSteps && solutionSteps.length) ? `
            <div class="bsod-solution">
                <h4 data-i18n="bsod.solution.heading">${_t('bsod.solution.heading', 'Recommended Solution')}</h4>
                <ol>${solutionSteps.map(s => `<li>${s}</li>`).join('')}</ol>
            </div>
        ` : '';

        const noteHtml = note ? `<div class="bsod-note">${note}</div>` : '';

        return `
            <div class="bsod-verdict" style="--c:var(${colorVar}); --bg:var(${bgVar}); --bd:var(${bdVar});">
                <div class="bsod-verdict-head">
                    <span class="icon">${icon}</span>
                    <div>
                        <h2>${causeLabel}</h2>
                        <p class="sub">${subLabel}</p>
                    </div>
                </div>
                <p class="detail-text">${detailText}</p>
                ${solutionHtml}
                ${noteHtml}
            </div>
        `;
    }

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
            'adb_ready': { icon: '✅', color: '#2e7d32', label: _t('bsod.state.adbReady', 'ADB Ready – Device Booted') },
            'adb_unauthorized': { icon: '⚠️', color: '#ed6c02', label: _t('bsod.state.adbUnauthorized', 'ADB Unauthorized') },
            'recovery': { icon: '🔧', color: '#ed6c02', label: _t('bsod.state.recovery', 'Recovery Mode') },
            'sideload': { icon: '🔧', color: '#ed6c02', label: _t('bsod.state.sideload', 'Sideload Mode') },
            'mtp_normal': { icon: '📁', color: '#107c10', label: _t('bsod.state.mtpNormal', 'MTP Mode – OS Booted Successfully') },
            'bootloader': { icon: '🔧', color: '#ed6c02', label: _t('bsod.state.bootloader', 'Fastboot / Bootloader') },
            'samsung_download': { icon: '📥', color: '#ed6c02', label: _t('bsod.state.samsungDownload', 'Samsung Download Mode (Odin)') },
            'edl_qualcomm': { icon: '🔴', color: '#c62828', label: _t('bsod.state.edl', 'Qualcomm EDL (9008)') },
            'preloader_mediatek': { icon: '🔴', color: '#c62828', label: _t('bsod.state.preloader', 'MediaTek Preloader') },
            'unknown_enumeration': { icon: '❓', color: '#6B7280', label: _t('bsod.state.unknown', 'Unknown USB Device') },
            'generic_usb_detected': { icon: '🔌', color: '#6B7280', label: _t('bsod.state.genericUsb', 'USB Detected (unclassified)') },
            'no_response': { icon: '📴', color: '#6B7280', label: _t('bsod.state.noResponse', 'No Device Detected') }
        };

        const info = stateLabels[state] || { icon: '❓', color: '#6B7280', label: state || _t('bsod.state.unknown', 'Unknown') };
        const shortDetails = details && details.length > 60 ? details.substring(0, 60) + '…' : details;

        let bodyHtml = '';

        // ==========================================================================
        // AUTO-DECLARED CAUSE LOGIC
        //  - Fastboot / Download / EDL / Preloader / Recovery  -> OS Corruption
        //  - No device detected                                -> Hardware Failure
        //  - MTP (booted fine)                                 -> Third-Party App
        //  - adb_ready                                         -> real diagnosis, auto-run (no button)
        //  - everything else                                   -> plain informational card
        // ==========================================================================

        const osCorruptionSubmodes = {
            'bootloader': {
                sub: _t('bsod.os.sub.bootloader', 'Detected in Fastboot / Bootloader mode'),
                detail: _t('bsod.os.detail.bootloader', 'The device is stuck at bootloader level — the OS partition failed to load.'),
                solution: [
                    _t('bsod.os.sol.flash', 'Flash stock firmware via Fastboot for your exact model.'),
                    _t('bsod.os.sol.matchModel', 'Confirm the firmware build matches the device model and region.'),
                    _t('bsod.os.sol.backup', 'Back up any accessible data before flashing.')
                ]
            },
            'samsung_download': {
                sub: _t('bsod.os.sub.samsung', 'Detected in Samsung Download Mode (Odin)'),
                detail: _t('bsod.os.detail.samsung', 'The device dropped into Download Mode — a firmware flash is required to recover it.'),
                solution: [
                    _t('bsod.os.sol.odin', 'Flash stock firmware using Odin.'),
                    _t('bsod.os.sol.matchModel', 'Confirm the firmware build matches the device model and region.'),
                    _t('bsod.os.sol.backup', 'Back up any accessible data before flashing.')
                ]
            },
            'edl_qualcomm': {
                sub: _t('bsod.os.sub.edl', 'Detected in Qualcomm EDL (9008)'),
                detail: _t('bsod.os.detail.edl', 'The bootloader failed to load — this typically requires a QFIL/QPST flash to recover.'),
                solution: [
                    _t('bsod.os.sol.qfil', 'Use QFIL/QPST with the correct firehose loader for the chipset.'),
                    _t('bsod.os.sol.matchModel', 'Confirm the firmware build matches the device model and region.'),
                    _t('bsod.os.sol.backup', 'Back up any accessible data before flashing.')
                ]
            },
            'preloader_mediatek': {
                sub: _t('bsod.os.sub.preloader', 'Detected in MediaTek Preloader mode'),
                detail: _t('bsod.os.detail.preloader', 'The OS did not load — this typically requires SP Flash Tool to recover.'),
                solution: [
                    _t('bsod.os.sol.spft', 'Use SP Flash Tool with the correct scatter file for the model.'),
                    _t('bsod.os.sol.matchModel', 'Confirm the firmware build matches the device model and region.'),
                    _t('bsod.os.sol.backup', 'Back up any accessible data before flashing.')
                ]
            },
            'recovery': {
                sub: _t('bsod.os.sub.recovery', 'Detected in Recovery Mode'),
                detail: _t('bsod.os.detail.recovery', 'The boot partition is intact, but the system partition looks corrupted.'),
                solution: [
                    _t('bsod.os.sol.wipeCache', 'Wipe the cache partition from recovery first (least destructive).'),
                    _t('bsod.os.sol.sideload', 'Sideload an OTA update via ADB if wiping cache doesn\'t help.'),
                    _t('bsod.os.sol.factoryReset', 'Factory reset as a last resort if the system still won\'t boot.')
                ]
            }
        };

        if (osCorruptionSubmodes[state]) {
            const sub = osCorruptionSubmodes[state];
            bodyHtml = verdictCard({
                severity: 'critical',
                icon: '🔴',
                causeLabel: _t('bsod.verdict.osCorruption', 'BSOD Detected — Cause: OS Corruption'),
                subLabel: sub.sub,
                detailText: sub.detail,
                solutionSteps: sub.solution
            });

        } else if (state === 'no_response') {
            bodyHtml = verdictCard({
                severity: 'critical',
                icon: '📴',
                causeLabel: _t('bsod.verdict.hardwareFailure', 'BSOD Detected — Cause: Hardware Failure'),
                subLabel: _t('bsod.hw.sub', 'No device detected on USB'),
                detailText: _t('bsod.hw.detail', 'The board isn\'t responding to any known USB enumeration. This points to a hardware fault or a completely dead board rather than a software issue.'),
                solutionSteps: [
                    _t('bsod.hw.sol.cable', 'Try a different USB cable and a different port.'),
                    _t('bsod.hw.sol.edl', 'Try forcing EDL mode (Volume Up + Volume Down while plugging in, model-dependent).'),
                    _t('bsod.hw.sol.power', 'Check for a charging LED or vibration to confirm the board still has power.'),
                    _t('bsod.hw.sol.repair', 'If completely unresponsive, the motherboard or power IC likely needs hardware-level repair.')
                ]
            });

        } else if (state === 'mtp_normal') {
            bodyHtml = verdictCard({
                severity: 'warn',
                icon: '⚠️',
                causeLabel: _t('bsod.verdict.thirdPartyApp', 'Freezing Detected — Cause: Third-Party App'),
                subLabel: _t('bsod.app.sub', 'Device booted successfully (MTP mode)'),
                detailText: _t('bsod.app.detail', 'The OS is alive and booted normally, so the freeze or BSOD-like symptom you saw is most likely coming from an app or a UI-level issue — not a boot failure.'),
                solutionSteps: [
                    _t('bsod.app.sol.safeMode', 'Boot into Safe Mode to confirm the issue disappears (rules out third-party apps).'),
                    _t('bsod.app.sol.uninstall', 'Uninstall or disable recently installed apps.'),
                    _t('bsod.app.sol.clearCache', 'Clear cache/data for the app that was active when it froze.'),
                    _t('bsod.app.sol.update', 'Check for a pending system update.'),
                    _t('bsod.app.sol.adb', 'Enable USB debugging in Developer Options to unlock full ADB diagnostics.')
                ]
            });

        } else if (state === 'adb_ready') {
            // Real diagnosis path: auto-runs, no button required.
            bodyHtml = `<div id="bsodDiagResult"></div>`;

        } else if (state === 'adb_unauthorized') {
            bodyHtml = verdictCard({
                severity: 'warn',
                icon: '⚠️',
                causeLabel: _t('bsod.verdict.adbUnauthorized', 'USB Debugging Not Authorized'),
                subLabel: _t('bsod.unauth.sub', 'Waiting for authorization on the device'),
                detailText: _t('bsod.unauth.detail', 'Unlock the phone and tap Allow on the USB debugging prompt to continue. This page will pick it up automatically.')
            });

        } else if (state === 'sideload') {
            bodyHtml = verdictCard({
                severity: 'neutral',
                icon: '🔧',
                causeLabel: _t('bsod.verdict.sideload', 'ADB Sideload Mode'),
                subLabel: _t('bsod.sideload.sub', 'Waiting for a sideload package'),
                detailText: _t('bsod.sideload.detail', 'The device is in ADB sideload mode, waiting to receive an OTA package. This is usually intentional rather than a failure state.')
            });

        } else {
            bodyHtml = verdictCard({
                severity: 'neutral',
                icon: 'ℹ️',
                causeLabel: _t('bsod.verdict.unknown', 'Unclassified State'),
                subLabel: state || _t('bsod.state.unknown', 'Unknown'),
                detailText: escapeHtml(details || _t('bsod.verdict.noInfo', 'No additional information available. Try reconnecting the cable, or try another port.'))
            });
        }

        stateContainer.innerHTML = `
            <div class="bsod-state-banner" style="--c:${info.color};">
                <span class="icon">${info.icon}</span>
                <div>
                    <span class="label">${info.label}</span>
                    <span class="detail">${escapeHtml(shortDetails || '')}</span>
                </div>
            </div>
            ${bodyHtml}
        `;

        // Apply language to the newly rendered content
        if (typeof applyLanguage === 'function') {
            const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
            applyLanguage(window._activeLang || savedLang);
        }

        // ---- Auto-run the real ADB diagnosis the first time we see adb_ready ----
        if (state === 'adb_ready' && !autoRunTriggered) {
            autoRunTriggered = true;
            runBsodDiagnosis();
        }
    }

    async function runBsodDiagnosis() {
        const resultDiv = document.getElementById('bsodDiagResult') || document.getElementById('bsodResult');
        if (!resultDiv) return;

        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `
            <div class="bsod-spinner-wrap">
                <span class="spin">⏳</span>
                <p>${_t('bsod.diagnosing', 'Analyzing system logs for crash signatures...')}</p>
            </div>
        `;
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

            const cause = diag.cause || _t('bsod.result.noCause', 'No cause identified');
            const confidence = diag.confidence || _t('bsod.result.unknown', 'Unknown');
            const score = diag.score || 0;
            const signals = diag.signals || [];

            let severity = 'good';
            let icon = '✅';
            if (score >= 60) { severity = 'critical'; icon = '🔴'; }
            else if (score >= 30) { severity = 'warn'; icon = '⚠️'; }

            let signalsHtml = '';
            if (signals.length > 0) {
                signalsHtml = `
                    <div class="bsod-signals">
                        ${signals.map(s => `<span class="bsod-signal-tag">${escapeHtml(s.title)} · ${escapeHtml(String(s.severity))} · ${s.points}pt</span>`).join('')}
                    </div>
                `;
            }

            const recommendation = (typeof getRecommendation === 'function') ? getRecommendation(cause) : '';

            resultDiv.innerHTML = verdictCard({
                severity,
                icon,
                causeLabel: `${_t('bsod.result.diagnosis', 'Diagnosis Result')} — ${escapeHtml(cause)}`,
                subLabel: `${_t('bsod.result.confidence', 'Confidence')}: ${escapeHtml(confidence)} · ${_t('bsod.result.score', 'Score')}: ${score}/100`,
                detailText: diag.detail ? escapeHtml(diag.detail) : '',
                solutionSteps: recommendation ? [recommendation] : []
            }) + signalsHtml + `
                <button id="bsodRerunBtn" class="bsod-btn bsod-btn-ghost" style="margin-top:14px;">
                    <span data-i18n="bsod.btn.rerun">${_t('bsod.btn.rerun', '🔄 Re-run diagnostic')}</span>
                </button>
            `;

            document.getElementById('bsodRerunBtn')?.addEventListener('click', runBsodDiagnosis);

        } catch (err) {
            resultDiv.innerHTML = verdictCard({
                severity: 'critical',
                icon: '❌',
                causeLabel: _t('bsod.result.error', 'Error'),
                subLabel: '',
                detailText: escapeHtml(err.message)
            }) + `
                <button id="bsodRerunBtn" class="bsod-btn bsod-btn-ghost" style="margin-top:14px;">
                    <span data-i18n="bsod.btn.rerun">${_t('bsod.btn.rerun', '🔄 Re-run diagnostic')}</span>
                </button>
            `;
            document.getElementById('bsodRerunBtn')?.addEventListener('click', runBsodDiagnosis);
        } finally {
            hideLoading();
            if (typeof applyLanguage === 'function') {
                const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
                applyLanguage(window._activeLang || savedLang);
            }
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