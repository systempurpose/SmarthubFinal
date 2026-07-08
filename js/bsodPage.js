async function renderBsodPage(container) {
    // Show loading overlay
    showLoading();

    // Build the page HTML
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

    // ---- State detection via /api/device-state ----
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

    // ---- Render state UI ----
    function renderStateUI(stateData) {
        const container = document.getElementById('bsodStateContainer');
        if (!container) return;

        const { state, details } = stateData;

        const stateLabels = {
            'adb_ready': { icon: '✅', color: '#2e7d32', label: 'ADB Ready – Device Booted' },
            'adb_unauthorized': { icon: '⚠️', color: '#ed6c02', label: 'ADB Unauthorized' },
            'recovery': { icon: '🔧', color: '#ed6c02', label: 'Recovery Mode' },
            'sideload': { icon: '🔧', color: '#ed6c02', label: 'Sideload Mode' },
            'mtp_normal': { icon: '📁', color: '#2e7d32', label: 'MTP Mode – OS Booted Successfully' },
            'bootloader': { icon: '🔧', color: '#ed6c02', label: 'Fastboot / Bootloader' },
            'samsung_download': { icon: '📥', color: '#ed6c02', label: 'Samsung Download Mode (Odin)' },
            'edl_qualcomm': { icon: '🔴', color: '#c62828', label: 'Qualcomm EDL (9008)' },
            'preloader_mediatek': { icon: '🔴', color: '#c62828', label: 'MediaTek Preloader' },
            'unknown_enumeration': { icon: '❓', color: '#6B7280', label: 'Unknown USB Device' },
            'generic_usb_detected': { icon: '🔌', color: '#6B7280', label: 'USB Detected (unclassified)' },
            'no_response': { icon: '📴', color: '#6B7280', label: 'No Device Detected' }
        };

        const info = stateLabels[state] || { icon: '❓', color: '#6B7280', label: state || 'Unknown' };

        let actionsHtml = '';
        let verdictHtml = '';

        // ---- Verdict based on state ----
        if (state === 'samsung_download' || state === 'edl_qualcomm' || state === 'preloader_mediatek' || state === 'bootloader') {
            verdictHtml = `
                <div style="margin-top:12px; padding:12px; background:#ffebee; border-radius:6px; border-left:4px solid #c62828;">
                    <strong>⚠️ BSOD Detected – OS Corruption / Boot Failure</strong>
                    <p style="margin:6px 0 0 0; font-size:14px; color:#333;">
                        The device is stuck in a boot loop or bootloader mode. The OS failed to load – likely due to corruption.
                        ${state === 'samsung_download' ? 'Flash stock firmware via Odin.' : ''}
                        ${state === 'edl_qualcomm' ? 'Requires QFIL/QPST + matching firehose loader.' : ''}
                        ${state === 'preloader_mediatek' ? 'Requires SP Flash Tool + matching scatter file.' : ''}
                        ${state === 'bootloader' ? 'Try fastboot reboot or flash firmware.' : ''}
                    </p>
                </div>
            `;
        } else if (state === 'mtp_normal') {
            verdictHtml = `
                <div style="margin-top:12px; padding:12px; background:#e8f5e9; border-radius:6px; border-left:4px solid #2e7d32;">
                    <strong>✅ Device booted successfully — MTP/file-transfer mode detected.</strong>
                    <p style="margin:6px 0 0 0; font-size:14px; color:#333;">
                        The OS is alive. Any BSOD symptom is likely app/UI-level, not a boot failure.
                    </p>
                    <p style="margin:4px 0 0 0; font-size:13px; color:#555;">
                        Enable USB debugging in Developer Options to unlock full ADB diagnostics.
                    </p>
                </div>
            `;
        } else if (state === 'adb_ready') {
            verdictHtml = `
                <div style="margin-top:12px; padding:12px; background:#e8f5e9; border-radius:6px; border-left:4px solid #2e7d32;">
                    <strong>✅ ADB Ready — Device is booted.</strong>
                    <p style="margin:6px 0 0 0; font-size:14px; color:#333;">
                        The device is fully booted. No boot failure detected.
                    </p>
                </div>
            `;
        } else if (state === 'recovery') {
            verdictHtml = `
                <div style="margin-top:12px; padding:12px; background:#fff3cd; border-radius:6px; border-left:4px solid #ffc107;">
                    <strong>⚠️ Recovery Mode — OS may be corrupted.</strong>
                    <p style="margin:6px 0 0 0; font-size:14px; color:#333;">
                        Device booted into recovery. Try clearing cache or performing a factory reset.
                        Or flash a custom recovery/firmware.
                    </p>
                </div>
            `;
        } else if (state === 'no_response' || state === 'unknown_enumeration') {
            verdictHtml = `
                <div style="margin-top:12px; padding:12px; background:#f1f5f9; border-radius:6px; border-left:4px solid #6B7280;">
                    <strong>⚠️ No Device Detected — Possible Hardware Failure</strong>
                    <p style="margin:6px 0 0 0; font-size:14px; color:#333;">
                        The phone is not responding. This could be a <strong>hardware problem</strong> (dead battery, PMIC failure, blown charging IC) or overheating.
                    </p>
                    <p style="margin:4px 0 0 0; font-size:13px; color:#555;">
                        Check charging LED, vibration on power button hold, and try a different USB port/cable.
                    </p>
                </div>
            `;
        }

        // ---- Actions ----
        if (state === 'adb_ready') {
            actionsHtml = `
                <button id="startBsodBtn" class="btn-primary" style="margin-top:12px; font-size:16px; padding:10px 28px;">
                    <i class="fas fa-play"></i> Diagnose Now (ADB)
                </button>
                <div id="bsodDiagResult" style="margin-top:16px;"></div>
            `;
        } else if (state === 'samsung_download') {
            actionsHtml = `
                <div style="margin-top:12px; padding:12px; background:#fff3cd; border-radius:6px; border-left:4px solid #ed6c02;">
                    <strong>📥 Samsung Download Mode (Odin) detected.</strong>
                    <p style="margin:8px 0;">Device is ready to receive firmware via Odin.</p>
                    <ul style="margin:4px 0 0 18px;">
                        <li>Flash stock firmware using Odin (AP, BL, CP, CSC files)</li>
                        <li>Use <code>Heimdall</code> on Linux/macOS</li>
                        <li>Ensure the correct firmware for your model</li>
                    </ul>
                </div>
            `;
        } else if (state === 'bootloader') {
            actionsHtml = `
                <div style="margin-top:12px; padding:12px; background:#fef3c7; border-radius:6px;">
                    <strong>Device in bootloader mode.</strong> You can try:
                    <ul style="margin:8px 0 0 18px;">
                        <li><code>fastboot reboot</code> – attempt to boot to system</li>
                        <li><code>fastboot boot recovery.img</code> – test recovery</li>
                        <li>Flash stock firmware via fastboot</li>
                    </ul>
                </div>
            `;
        } else if (state === 'edl_qualcomm') {
            actionsHtml = `
                <div style="margin-top:12px; padding:12px; background:#ffebee; border-radius:6px; border-left:4px solid #c62828;">
                    <strong>⚠️ Qualcomm EDL mode – Bootloader is corrupted.</strong>
                    <p style="margin:8px 0;">Requires QFIL/QPST + matching firehose loader for this model.</p>
                    <p style="font-size:13px; color:#6B7280;">Not fixable without proper firmware files.</p>
                </div>
            `;
        } else if (state === 'preloader_mediatek') {
            actionsHtml = `
                <div style="margin-top:12px; padding:12px; background:#ffebee; border-radius:6px; border-left:4px solid #c62828;">
                    <strong>⚠️ MediaTek Preloader mode – OS did not load.</strong>
                    <p style="margin:8px 0;">Requires SP Flash Tool + matching scatter file.</p>
                </div>
            `;
        } else if (state === 'adb_unauthorized') {
            actionsHtml = `
                <div style="margin-top:12px; padding:12px; background:#fff3cd; border-radius:6px;">
                    <strong>USB debugging not authorized.</strong>
                    <p>Unlock the phone and approve the RSA fingerprint.</p>
                </div>
            `;
        } else if (state === 'recovery') {
            actionsHtml = `
                <div style="margin-top:12px; padding:12px; background:#fef3c7; border-radius:6px;">
                    <strong>Recovery mode detected.</strong> You can:
                    <ul style="margin:8px 0 0 18px;">
                        <li>Wipe cache partition</li>
                        <li>Factory reset (if backup available)</li>
                        <li>Install update via ADB sideload</li>
                    </ul>
                </div>
            `;
        } else if (state === 'mtp_normal') {
            actionsHtml = `
                <div style="margin-top:12px; padding:12px; background:#e8f5e9; border-radius:6px;">
                    <strong>Device is booted normally (MTP mode).</strong>
                    <p style="margin:6px 0 0 0;">For BSOD issues, check if it's an app or driver problem. Use Advanced Diagnostic for deeper analysis.</p>
                </div>
            `;
        } else {
            actionsHtml = `
                <div style="margin-top:12px; padding:12px; background:#f1f5f9; border-radius:6px; color:#475569;">
                    <strong>No responsive device found.</strong>
                    <ul style="margin:8px 0 0 18px;">
                        <li>Check USB cable and port</li>
                        <li>Try forcing EDL (vol+/‑ combo during plug‑in)</li>
                        <li>If device is completely dead, check charging LED / vibration</li>
                    </ul>
                </div>
            `;
        }

        container.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; margin:16px 0; padding:12px; background:${info.color}10; border-radius:8px; border-left:4px solid ${info.color};">
                <span style="font-size:24px;">${info.icon}</span>
                <div>
                    <strong style="color:${info.color};">${info.label}</strong>
                    <span style="font-size:13px; color:#6B7280; margin-left:8px;">${details || ''}</span>
                </div>
            </div>
            ${verdictHtml}
            ${actionsHtml}
        `;

        const runBtn = document.getElementById('startBsodBtn');
        if (runBtn) {
            runBtn.addEventListener('click', runBsodDiagnosis);
        }
    }

    // ---- ADB-based diagnosis (original logic) ----
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
                <div class="info-card" style="border-left:4px solid ${severityColor};">
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

    // ---- Poll device state every 2 seconds ----
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

    // Hide loading after first render
    hideLoading();
}