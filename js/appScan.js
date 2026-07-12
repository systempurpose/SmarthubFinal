// js/appScan.js
(function() {
    'use strict';

    // ===== HELPERS =====
    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    function getDeviceId() {
        return typeof currentDeviceId !== 'undefined' ? currentDeviceId : null;
    }

    // ===== ADB wrapper =====
    async function runAdb(command) {
        const deviceId = getDeviceId();
        if (!deviceId) throw new Error(t('common.noDevice', 'No device connected'));
        const resp = await fetch('/adb-shell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: deviceId, command })
        });
        if (!resp.ok) throw new Error(`ADB command failed: ${resp.status}`);
        const data = await resp.json();
        return data.output;
    }

    // ===== API CALLS =====
    async function fetchAppReport(deviceId) {
        const baseUrl = window.BACKEND_URL || '';
        try {
            const resp = await fetch(`${baseUrl}/on-device-report/${deviceId}`);
            if (!resp.ok) return null;
            return await resp.json();
        } catch (e) {
            console.warn('[AppScan] Failed to fetch app report:', e);
            return null;
        }
    }

    async function fetchDeepScan(deviceId) {
        const baseUrl = window.BACKEND_URL || '';
        const patterns = [
            `${baseUrl}/deep-scan/${deviceId}/full`,
            `${baseUrl}/api/deep-scan/${deviceId}/full`,
        ];
        let lastError = null;
        for (const url of patterns) {
            try {
                const resp = await fetch(url);
                if (resp.ok) return await resp.json();
                lastError = `HTTP ${resp.status}`;
            } catch (e) {
                lastError = e.message;
            }
        }
        throw new Error(`All deep-scan attempts failed: ${lastError}`);
    }

    // ===== MAIN SCAN FUNCTION =====
    window.runAppScan = async function() {
        const deviceId = getDeviceId();
        if (!deviceId) {
            if (window.showAlert) {
                await window.showAlert(
                    t('common.noDevice', 'No Device'),
                    t('common.connectFirst', 'Please connect a device first.')
                );
            } else {
                alert(t('common.connectFirst', 'Please connect a device first.'));
            }
            return;
        }

        // ----- LAUNCH ANDROID ACTIVITY -----
        try {
            await runAdb('am start -n com.smarthub.diagnostics/.AppSecurityScanActivity');
            console.log('[AppScan] Android AppSecurityScanActivity launched');
        } catch (e) {
            console.warn('[AppScan] Could not launch Android activity:', e);
            // Non‑critical – we continue with the desktop scan
        }

        // ---- Create/Show modal ----
        let modal = document.getElementById('appScanModal');
        if (!modal) {
            const modalHTML = `
                <div id="appScanModal" class="modal" style="display: none; z-index: 99999;">
                    <div class="modal-content" style="max-width: 900px; width: 95vw; max-height: 85vh; display: flex; flex-direction: column; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3); background: #ffffff;">
                        <div class="modal-header" style="padding: 16px 24px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                            <h3 id="appScanTitle" style="margin: 0; font-size: 18px; font-weight: 600; color: #1f2937;">🛡️ ${t('action.appSecurity.title', 'App Security Scan')}</h3>
                            <span class="close-button" id="closeAppScanModal" style="cursor: pointer; font-size: 24px; color: #9ca3af; line-height: 1; padding: 0 4px;">&times;</span>
                        </div>
                        <div id="appScanBody" class="modal-body" style="flex: 1; overflow-y: auto; padding: 20px 24px; background: #ffffff;"></div>
                        <div class="modal-footer" style="padding: 12px 24px; background: #f8fafc; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end;">
                            <button id="closeAppScanModalBtn" class="btn-secondary" style="padding: 8px 24px; border-radius: 8px; font-weight: 500; font-size: 14px; cursor: pointer; background: #f1f3f5; border: 1px solid #e5e7eb; color: #374151;">${t('common.close', 'Close')}</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            modal = document.getElementById('appScanModal');
        }

        // Close handlers
        document.getElementById('closeAppScanModal').addEventListener('click', () => { modal.style.display = 'none'; renderDashboard(); });
        document.getElementById('closeAppScanModalBtn').addEventListener('click', () => { modal.style.display = 'none'; renderDashboard(); });

        modal.style.display = 'flex';
        const bodyEl = document.getElementById('appScanBody');
        const titleEl = document.getElementById('appScanTitle');
        titleEl.textContent = '🛡️ ' + t('action.appSecurity.title', 'App Security Scan');
        bodyEl.innerHTML = window.getModernSpinnerHTML(t('appScan.scanning', 'Scanning for suspicious apps...'));

        let scanStillRunning = true;
        const timeoutId = setTimeout(() => {
            if (scanStillRunning) {
                bodyEl.innerHTML = window.getModernSpinnerHTML(t('appScan.stillScanning', 'Still scanning... This may take a moment.'));
            }
        }, 15000);

        try {
            // Fetch app report and deep scan
            const appReport = await fetchAppReport(deviceId);
            let verdictMap = null;
            if (appReport && appReport.appSecurityMeta) {
                verdictMap = {};
                appReport.appSecurityMeta.forEach(app => {
                    verdictMap[app.packageName] = app.securityVerdict || 'unknown';
                });
            }

            const scanData = await fetchDeepScan(deviceId);
            const appSecurity = scanData.appSecurity || {};
            let suspiciousApps = appSecurity.suspiciousApps || [];

            // Filter out safe apps based on verdict
            if (verdictMap) {
                suspiciousApps = suspiciousApps.filter(app => {
                    const verdict = verdictMap[app.packageName];
                    return verdict !== 'safe';
                });
            }

            // Apply risk score threshold
            suspiciousApps = suspiciousApps.filter(app => (app.riskScore || 0) >= 30);

            // Build results object
            const results = {
                suspiciousApps: suspiciousApps,
                scanTime: new Date().toLocaleString()
            };

            // Save to Supabase
            try {
                const { saveAppScanToSupabase } = await import('./app_scan_sb.js');
                await saveAppScanToSupabase(results, deviceId);
                console.log('[AppScan] Results saved to Supabase');
            } catch (saveErr) {
                console.warn('[AppScan] Could not save results to Supabase:', saveErr);
            }

            // Save to localStorage (existing behavior)
            if (typeof saveAppScanResults === 'function') {
                saveAppScanResults(results);
            } else {
                localStorage.setItem('smartHubAppScanResults', JSON.stringify(results));
            }

            // Close modal and refresh dashboard
            scanStillRunning = false;
            clearTimeout(timeoutId);
            modal.style.display = 'none';
            renderDashboard();

        } catch (err) {
            console.error('[AppScan] Error:', err);
            scanStillRunning = false;
            clearTimeout(timeoutId);
            bodyEl.innerHTML = `
                <div style="color: #d32f2d; padding: 20px; text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
                    <strong>${t('appScan.failed', 'Scan Failed')}</strong>
                    <p>${escapeHtml(err.message)}</p>
                    <button id="retryAppScan" class="btn-primary" style="padding: 8px 24px; font-size: 14px;">🔄 ${t('common.retry', 'Retry')}</button>
                </div>
            `;
            document.getElementById('retryAppScan')?.addEventListener('click', window.runAppScan);
        }
    };

    // Ensure the function is globally accessible
    window.runAppScan = window.runAppScan;

})();