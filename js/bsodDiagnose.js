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