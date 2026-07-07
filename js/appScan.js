// js/appScan.js
(function() {
    'use strict';

    // Helper: run an ADB command and return output
    async function runAdb(command) {
        const resp = await fetch('/adb-shell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: currentDeviceId, command })
        });
        if (!resp.ok) throw new Error(`ADB command failed: ${resp.status}`);
        const data = await resp.json();
        return data.output;
    }

    // Helper: check if the companion app is installed
    async function isAppInstalled() {
        try {
            const output = await runAdb('pm list packages com.smarthub.diagnostics');
            return output.includes('com.smarthub.diagnostics');
        } catch {
            return false;
        }
    }

    // Helper: launch the Security Scan activity
    async function launchSecurityScanActivity() {
        const cmds = [
            `am start -n com.smarthub.diagnostics/com.smarthub.diagnostics.AppSecurityScanActivity`,
            `am start -n com.smarthub.diagnostics/.AppSecurityScanActivity`,
            `monkey -p com.smarthub.diagnostics -c android.intent.category.LAUNCHER 1`
        ];
        for (const cmd of cmds) {
            try {
                await runAdb(cmd);
                console.log('[AppScan] Android activity launched with:', cmd);
                return true;
            } catch (e) {
                console.warn('[AppScan] Failed with:', cmd, e.message);
            }
        }
        return false;
    }

    // ---- Global function to remove a card from the list ----
    window.removeAppCard = function(packageName) {
        const card = document.querySelector(`.app-card-item[data-package="${packageName}"]`);
        if (card) {
            card.style.transition = 'opacity 0.3s';
            card.style.opacity = '0';
            setTimeout(() => {
                card.remove();
                // Update counts
                const heading = document.getElementById('suspiciousAppsHeading');
                if (heading) {
                    const remaining = document.querySelectorAll('.app-card-item').length;
                    heading.textContent = `⚠️ Suspicious Apps Found (${remaining})`;
                }
                const totalSpan = document.querySelector('#summaryBar span:last-child');
                if (totalSpan) {
                    const remaining = document.querySelectorAll('.app-card-item').length;
                    totalSpan.textContent = `Total: ${remaining} apps`;
                }
                if (remaining === 0) {
                    const container = document.getElementById('appsContainer');
                    if (container) {
                        container.innerHTML = `<div style="padding: 20px; text-align: center; color: #2e7d32;">✅ All suspicious apps have been removed.</div>`;
                    }
                    const heading = document.getElementById('suspiciousAppsHeading');
                    if (heading) {
                        heading.textContent = '✅ All Clear';
                    }
                }
            }, 300);
        }
    };

    window.runAppScan = async function() {
        if (!currentDeviceId) {
            if (window.showAlert) {
                await window.showAlert('No Device', 'Please connect a device first.');
            } else {
                alert('Please connect a device first.');
            }
            return;
        }

        // ---- Create modal if it doesn't exist ----
        let modal = document.getElementById('quickDiagModal');
        if (!modal) {
            const modalHTML = `
                <div id="quickDiagModal" class="modal" style="display: none;">
                    <div class="modal-content" style="max-width: 1100px; width: 95vw; max-height: 85vh; display: flex; flex-direction: column;">
                        <div class="modal-header" style="padding: 12px 20px;">
                            <h3 id="quickDiagModalTitle">App Security Scan</h3>
                            <span class="close-button" id="closeQuickDiagModal">&times;</span>
                        </div>
                        <div id="quickDiagModalBody" class="modal-body" style="flex: 1; overflow-y: auto; padding: 16px 20px;">
                            <div class="spinner"></div>
                            <p style="text-align: center;">Initializing scan...</p>
                        </div>
                        <div class="modal-footer" style="padding: 8px 20px;">
                            <button id="closeQuickDiagModalBtn" class="btn-secondary">Close</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            modal = document.getElementById('quickDiagModal');
        }

        modal.style.display = 'flex';
        const modalTitle = document.getElementById('quickDiagModalTitle');
        const modalBody = document.getElementById('quickDiagModalBody');
        modalTitle.textContent = 'App Security Scan';
        modalBody.innerHTML = window.getModernSpinnerHTML('Scanning for suspicious apps... This may take several minutes.');

        // ---- Launch Android app's Security Scan page ----
        try {
            const installed = await isAppInstalled();
            if (!installed) {
                console.warn('[AppScan] Companion app not installed – skipping launch.');
            } else {
                const launched = await launchSecurityScanActivity();
                if (!launched) {
                    console.warn('[AppScan] Could not launch Android activity – no exported activity found.');
                }
            }
        } catch (e) {
            console.warn('[AppScan] Error launching Android activity:', e);
        }

        // ---- Continue with the scan ----
        let scanStillRunning = true;
        const slowScanHintTimer = setTimeout(() => {
            if (!scanStillRunning) return;
            modalBody.innerHTML = window.getModernSpinnerHTML('Still analyzing... large scans can take several minutes.');
        }, 30000);

        const closeModal = () => { modal.style.display = 'none'; };
        document.getElementById('closeQuickDiagModal')?.addEventListener('click', closeModal);
        document.getElementById('closeQuickDiagModalBtn')?.addEventListener('click', closeModal);
        window.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        // ---- Helper to fetch app report (security verdicts) ----
        async function fetchAppReport(deviceId) {
            const baseUrl = window.BACKEND_URL || '';
            const patterns = [
                `${baseUrl}/on-device-report/${deviceId}`,
                `${baseUrl}/api/on-device-report/${deviceId}`,
                `${baseUrl}/collect/${deviceId}`,
                `${baseUrl}/api/collect/${deviceId}`,
            ];
            for (const url of patterns) {
                try {
                    const resp = await fetch(url);
                    if (resp.ok) {
                        const data = await resp.json();
                        if (data.appSecurityMeta) return data.appSecurityMeta;
                    }
                } catch {}
            }
            return null;
        }

        // ---- Helper to try multiple URL patterns for deep scan ----
        async function fetchDeepScan(deviceId) {
            const baseUrl = window.BACKEND_URL || '';
            const patterns = [
                `${baseUrl}/deep-scan/${deviceId}/full?raw=0`,
                `${baseUrl}/api/deep-scan/${deviceId}/full?raw=0`,
                `${baseUrl}/deep-scan/${deviceId}/full`,
                `${baseUrl}/api/deep-scan/${deviceId}/full`,
            ];

            let lastError = null;
            for (const url of patterns) {
                console.log('[AppScan] Trying URL:', url);
                try {
                    const resp = await fetch(url, { signal: AbortSignal.timeout(300000) });
                    if (resp.ok) {
                        const data = await resp.json();
                        console.log('[AppScan] Success with URL:', url);
                        return data;
                    }
                    lastError = `HTTP ${resp.status}: ${resp.statusText}`;
                    console.warn('[AppScan] Failed with URL:', url, lastError);
                } catch (err) {
                    lastError = err.message;
                    console.warn('[AppScan] Error with URL:', url, err.message);
                }
            }
            throw new Error(`All attempts failed. Last error: ${lastError}`);
        }

        try {
            // ---- Fetch the Android app's security verdicts first ----
            const appReport = await fetchAppReport(currentDeviceId);
            let verdictMap = null;
            if (appReport) {
                verdictMap = {};
                appReport.forEach(item => {
                    verdictMap[item.packageName] = item.securityVerdict || 'unknown';
                });
                console.log('[AppScan] Loaded security verdicts for', Object.keys(verdictMap).length, 'apps');
            } else {
                console.log('[AppScan] No app report available – using ADB-only heuristics');
            }

            // ---- Fetch the deep scan data ----
            const scanData = await fetchDeepScan(currentDeviceId);

            const appSecurity = scanData.appSecurity || {};
            let suspiciousApps = appSecurity.suspiciousApps || [];
            const deepAnalysis = appSecurity.deepAnalysis || [];

            // ---- Filter using the app's verdict if available ----
            if (verdictMap) {
                const before = suspiciousApps.length;
                suspiciousApps = suspiciousApps.filter(app => {
                    const verdict = verdictMap[app.packageName];
                    return verdict !== 'safe';
                });
                console.log('[AppScan] Filtered out', before - suspiciousApps.length, 'apps marked as safe by the Android app');
            }

            // Apply risk score threshold (>= 30)
            suspiciousApps = suspiciousApps.filter(app => (app.riskScore || 0) >= 30);

            if (suspiciousApps.length === 0) {
                modalBody.innerHTML = `<div style="padding: 20px;"><h3 style="color: #2e7d32;">✅ No Suspicious Apps Found</h3><p>All apps are safe or have no clear risk indicators.</p></div>`;
                modalTitle.textContent = 'Scan Complete';
                return;
            }

            // ---- Summary bar ----
            const critical = suspiciousApps.filter(a => a.riskScore >= 80).length;
            const high = suspiciousApps.filter(a => a.riskScore >= 60 && a.riskScore < 80).length;
            const medium = suspiciousApps.filter(a => a.riskScore >= 35 && a.riskScore < 60).length;
            const low = suspiciousApps.filter(a => a.riskScore < 35).length;

            let summaryBarHtml = `
                <div id="summaryBar" style="display: flex; gap: 16px; padding: 12px 16px; background: #f8f9fa; border-radius: 8px; margin-bottom: 16px; flex-wrap: wrap;">
                    <span><span style="color: #c62828; font-weight: bold;">🔴 ${critical}</span> Critical</span>
                    <span><span style="color: #e65100; font-weight: bold;">🟠 ${high}</span> High</span>
                    <span><span style="color: #e67e22; font-weight: bold;">🟡 ${medium}</span> Medium</span>
                    ${low > 0 ? `<span><span style="color: #2e7d32; font-weight: bold;">🟢 ${low}</span> Low</span>` : ''}
                    <span style="margin-left: auto; color: #888;">Total: ${suspiciousApps.length} apps</span>
                </div>
            `;

            const escape = (str) => window.escapeHtml(str);
            let appsHtml = `<div><h3 id="suspiciousAppsHeading" style="color: #ed6c02; margin-bottom: 8px;">⚠️ Suspicious Apps Found (${suspiciousApps.length})</h3>${summaryBarHtml}<div id="appsContainer" style="display: flex; flex-direction: column; gap: 12px;">`;

            // ---- Build cards ----
            for (const app of suspiciousApps) {
                const riskScore = app.riskScore || 0;
                const threat = window.getThreatLevel(riskScore);
                const threatIcon = threat.icon || (riskScore >= 80 ? '🔴' : riskScore >= 60 ? '🟠' : '🟡');
                const malwareCapabilities = window.getHumanReadableThreats(app.threatTypes || [], []);

                const deep = deepAnalysis.find(d => d.packageName === app.packageName) || {};
                let techDetails = '';
                if (deep.entropy) {
                    techDetails += `<div>Entropy: ${deep.entropy.toFixed(3)} ${deep.entropy > 0.85 ? '⚠️ (high → possible packing/obfuscation)' : ''}</div>`;
                }
                if (deep.yaraMatches && deep.yaraMatches.length) {
                    techDetails += `<div>YARA matches: ${deep.yaraMatches.length}</div>`;
                }

                const humanReasons = window.getHumanFriendlyRiskReasons(app);

                let riskFactors = [];
                if (app.isSideloaded) riskFactors.push('📦 Sideloaded (not from Play Store)');
                if (app.installer && app.installer.toLowerCase().includes('unknown')) riskFactors.push('❓ Unknown installer');
                if (app.installer && app.installer.toLowerCase().includes('transsnet')) riskFactors.push('🏪 Installed via third‑party store (Transsnet)');
                if (app.dangerousPermissions && app.dangerousPermissions.length > 5) riskFactors.push('🔓 Requests many dangerous permissions');
                if (deep.entropy > 0.85) riskFactors.push('🧩 High code entropy (possible obfuscation/packing)');

                let factorsHtml = riskFactors.length ? `
                    <div style="margin-top:6px; font-size:13px; color:#555; background:#f8f9fa; padding:6px 10px; border-radius:6px;">
                        <strong>⚠️ Risk factors:</strong> ${riskFactors.join(' • ')}
                    </div>
                ` : '';

                const pkg = app.packageName;
                const onclickHandler = `
                    window.uninstallPackage('${escape(pkg)}', window.removeAppCard);
                `;

                appsHtml += `
                    <div id="app-card-${escape(pkg)}" class="app-card-item" data-package="${escape(pkg)}"
                         style="margin-bottom: 12px; padding: 16px; border-radius: 12px;
                                border-left: 6px solid ${threat.color};
                                background: ${threat.bg};
                                box-shadow: 0 2px 8px rgba(0,0,0,0.06);">

                        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
                            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                <span style="font-size: 20px;">${threatIcon}</span>
                                <strong style="font-size: 15px;">${escape(app.displayName)}</strong>
                                <span style="font-size: 12px; color: #888; font-family: monospace;">${escape(app.packageName)}</span>
                            </div>
                            <button onclick="${onclickHandler}"
                                    class="delete-app"
                                    style="background: #d32f2f; color: white; border: none;
                                           border-radius: 20px; padding: 4px 16px; cursor: pointer;
                                           font-size: 12px; white-space: nowrap;
                                           transition: background 0.2s ease, transform 0.15s ease;"
                                    onmouseover="this.style.background='#b71c1c'; this.style.transform='scale(1.05)'"
                                    onmouseout="this.style.background='#d32f2f'; this.style.transform='scale(1)'">
                                🗑️ Uninstall
                            </button>
                        </div>

                        ${app.reason ? `<div style="font-size: 13px; color: #555; margin-top: 6px;">${escape(app.reason)}</div>` : ''}

                        ${humanReasons.length ? `<div style="font-size: 13px; margin-top: 4px; color: #424242; background: rgba(255,255,255,0.5); padding: 6px 10px; border-radius: 6px;">${humanReasons.join('; ')}</div>` : ''}

                        ${malwareCapabilities.length ? `<div style="font-size: 13px; margin-top: 4px; color: #4a148c; background: rgba(255,255,255,0.65); padding: 6px 10px; border-radius: 6px;"><strong>What this malware can do:</strong><ul style="margin: 4px 0 0 18px; padding: 0;">${malwareCapabilities.map(item => `<li>${escape(item)}</li>`).join('')}</ul></div>` : ''}

                        ${factorsHtml}
                        ${techDetails ? `<div style="font-size: 12px; color: #666; margin-top: 8px; background: #f5f5f5; padding: 6px 10px; border-radius: 6px;">${techDetails}</div>` : ''}

                        <div style="display: flex; gap: 16px; margin-top: 8px; font-size: 12px; color: #666; flex-wrap: wrap;">
                            ${app.installer ? `<span>📦 Installed via: ${escape(app.installer)}</span>` : ''}
                            ${app.installDate ? `<span>📅 Installed: ${escape(app.installDate)}</span>` : ''}
                        </div>

                        <div style="margin-top: 10px; font-size: 13px; border-top: 1px dashed #ddd; padding-top: 10px;">
                            <span style="background: ${threat.bg}; color: ${threat.color}; padding: 2px 10px; border-radius: 12px; font-weight: 600; font-size: 12px;">${threat.label}</span>
                            &nbsp; Risk Score: <strong>${riskScore}/100</strong>
                        </div>
                    </div>
                `;
            }
            appsHtml += `</div></div>`;

            modalBody.innerHTML = appsHtml;
            modalTitle.textContent = 'App Security Scan Complete';

        } catch (err) {
            console.error('[AppScan] Error:', err);
            modalTitle.textContent = 'Scan Failed';
            let errorMessage = err.message || 'Unknown error';
            modalBody.innerHTML = `
                <div style="color: #d32f2d; padding: 20px; text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
                    <strong style="font-size: 16px;">Error: ${window.escapeHtml(errorMessage)}</strong>
                    <br><br>
                    <span style="font-size: 13px; color: #666;">The scan endpoint could not be reached.</span>
                    <br><br>
                    <button onclick="window.runAppScan()" class="btn-primary" style="padding: 8px 24px; font-size: 14px;">
                        🔄 Retry Scan
                    </button>
                </div>
            `;
        } finally {
            scanStillRunning = false;
            clearTimeout(slowScanHintTimer);
        }
    };
})();