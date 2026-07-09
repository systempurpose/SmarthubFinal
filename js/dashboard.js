async function renderDashboard() {
    const container = document.getElementById('pageContent');
    if (!container) return;

    // ---- Verify ADB is actually responsive ----
    if (currentDeviceId) {
        try {
            const resp = await fetch(`${BACKEND_URL}/adb-shell`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId: currentDeviceId, command: 'echo "ping"' })
            });
            if (!resp.ok) {
                console.warn('[Dashboard] ADB ping failed, clearing currentDeviceId');
                currentDeviceId = null;
            }
        } catch (e) {
            console.warn('[Dashboard] ADB ping error, clearing currentDeviceId', e);
            currentDeviceId = null;
        }
    }

    // ---- If ADB is available, render full dashboard ----
    if (currentDeviceId) {
        await renderAdbDashboard(container);

        // Add Storage Analysis button if not already present
        
        return;
    }

    // ---- No ADB – check USB state ----
    try {
        const resp = await fetch(`${BACKEND_URL}/api/device-state`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const stateData = await resp.json();
        const state = stateData.state;
        const details = stateData.details || '';

        const stateLabels = {
            'adb_ready': { icon: '✅', color: '#107c10', label: 'ADB Ready' },
            'adb_unauthorized': { icon: '⚠️', color: '#ed6c02', label: 'ADB Unauthorized' },
            'recovery': { icon: '🔧', color: '#ed6c02', label: 'Recovery Mode' },
            'sideload': { icon: '🔧', color: '#ed6c02', label: 'Sideload Mode' },
            'mtp_normal': { icon: '📁', color: '#107c10', label: 'MTP Mode (OS Booted)' },
            'bootloader': { icon: '🔧', color: '#ed6c02', label: 'Fastboot / Bootloader' },
            'samsung_download': { icon: '📥', color: '#ed6c02', label: 'Download Mode (Odin)' },
            'edl_qualcomm': { icon: '🔴', color: '#c62828', label: 'Qualcomm EDL' },
            'preloader_mediatek': { icon: '🔴', color: '#c62828', label: 'MediaTek Preloader' },
            'unknown_enumeration': { icon: '❓', color: '#6B7280', label: 'Unknown USB' },
            'generic_usb_detected': { icon: '🔌', color: '#6B7280', label: 'USB Detected (unclassified)' },
            'no_response': { icon: '📴', color: '#6B7280', label: 'No Device' }
        };

        const info = stateLabels[state] || { icon: '❓', color: '#6B7280', label: state || 'Unknown' };

        // ---- MTP Mode – OS booted successfully ----
        if (state === 'mtp_normal') {
            container.innerHTML = `
                <div class="info-card" style="text-align: left; padding: 30px; border-left: 4px solid #107c10;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <div>
                            <div style="font-size: 48px; margin-bottom: 4px;">${info.icon}</div>
                            <h2 style="color: #1e293b; margin: 0;">${info.label}</h2>
                        </div>
                        <button onclick="openTutorial()" class="btn-primary" style="font-size: 14px; padding: 10px 20px; border-radius: 8px;">
                            ▶️ Watch Tutorial
                        </button>
                    </div>
                    <p style="color: #6B7280; margin-bottom: 16px;">
                        Your phone is booted and connected in file‑transfer mode.
                    </p>
                    <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
                        <h3 style="margin-top: 0; color: #1e293b; font-size: 16px;">📋 How to Enable USB Debugging</h3>
                        <ol style="margin: 0; padding-left: 20px; color: #334155; line-height: 1.8;">
                            <li>Go to <strong>Settings</strong> → <strong>About Phone</strong></li>
                            <li>Tap <strong>Build Number</strong> 7 times to unlock Developer Options</li>
                            <li>Go back to <strong>Settings</strong> → <strong>Developer Options</strong></li>
                            <li>Toggle <strong>USB Debugging</strong> <span style="color: #dc2626;">ON</span></li>
                            <li>Connect your phone via USB and accept the RSA fingerprint prompt</li>
                        </ol>
                        <p style="margin: 12px 0 0 0; font-size: 13px; color: #64748b;">
                            💡 After enabling, the sidebar will show your device and you'll have full diagnostic access.
                        </p>
                    </div>
                    <p style="color: #94a3b8; font-size: 12px; margin-top: 8px;">
                        OS is alive. Any BSOD symptom is likely app/UI-level, not a boot failure.
                    </p>
                </div>
            `;
            return;
        }

        // ---- Firmware-level modes ----
        if (state === 'samsung_download' || state === 'bootloader' || state === 'edl_qualcomm' || state === 'preloader_mediatek') {
            container.innerHTML = `
                <div class="info-card" style="text-align: center; padding: 30px; border-left: 4px solid #ed6c02;">
                    <div style="font-size: 48px; margin-bottom: 12px;">${info.icon}</div>
                    <h2 style="color: #1e293b;">Device in ${info.label}</h2>
                    <p style="color: #6B7280;">${details}</p>
                    <p style="color: #475569; font-size: 14px; margin-top: 8px;">
                        This device is not booted into Android. Use <strong>BSOD Diagnosis</strong> for troubleshooting.
                    </p>
                    <button onclick="document.querySelector('.nav-item[data-page=\\'bsod\\']')?.click()" class="btn-primary" style="margin-top: 12px;">
                        🔍 Go to BSOD Diagnosis
                    </button>
                </div>
            `;
            return;
        }

        // ---- Recovery mode ----
        if (state === 'recovery' || state === 'sideload') {
            container.innerHTML = `
                <div class="info-card" style="text-align: center; padding: 30px; border-left: 4px solid #ed6c02;">
                    <div style="font-size: 48px; margin-bottom: 12px;">${info.icon}</div>
                    <h2 style="color: #1e293b;">${info.label}</h2>
                    <p style="color: #6B7280;">${details}</p>
                    <p style="color: #475569; font-size: 14px; margin-top: 8px;">
                        Boot partition is intact. System partition may be corrupted.
                    </p>
                    <button onclick="document.querySelector('.nav-item[data-page=\\'bsod\\']')?.click()" class="btn-primary" style="margin-top: 12px;">
                        🔍 Go to BSOD Diagnosis
                    </button>
                </div>
            `;
            return;
        }

        // ---- Generic USB detected ----
        if (state === 'generic_usb_detected' || state === 'unknown_enumeration') {
            container.innerHTML = `
                <div class="info-card" style="text-align: center; padding: 30px; border-left: 4px solid #6B7280;">
                    <div style="font-size: 48px; margin-bottom: 12px;">${info.icon}</div>
                    <h2 style="color: #1e293b;">${info.label}</h2>
                    <p style="color: #6B7280;">${details}</p>
                    <p style="color: #475569; font-size: 14px; margin-top: 8px;">
                        A USB device was detected but could not be classified. Try reconnecting or check drivers.
                    </p>
                </div>
            `;
            return;
        }

        // ---- No response ----
        if (state === 'no_response') {
            // Fall through to "No Device Connected" below
        }
    } catch (err) {
        console.warn('[Dashboard] USB state check failed:', err);
        // Fall through to "No Device Connected"
    }

    // ---- Fallback: No device connected ----
    container.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; text-align: center; min-height: 400px;">
            <div style="position: relative; width: 80px; height: 80px; margin-bottom: 24px;">
                <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; border: 4px solid #e5e7eb;"></div>
                <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; border: 4px solid transparent; border-top-color: #3b82f6; animation: spin 1s linear infinite;"></div>
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 32px; color: #9ca3af;">
                    <i class="fas fa-plug"></i>
                </div>
            </div>
            <h2 style="color: #1e293b; font-size: 24px; font-weight: 600; margin-bottom: 8px;">No Device Detected</h2>
            <p style="color: #6B7280; font-size: 16px; margin-bottom: 4px;">Waiting for phone to be connected...</p>
            <p style="color: #94a3b8; font-size: 14px;">Please connect your Android phone via USB and enable USB debugging.</p>
            <button id="openWizardFromDashboard" class="btn-primary" style="margin-top: 20px; padding: 10px 32px; border-radius: 8px;">
                🔌 Open USB Debugging Wizard
            </button>
        </div>
    `;
    document.getElementById('openWizardFromDashboard')?.addEventListener('click', openWizard);
    
}