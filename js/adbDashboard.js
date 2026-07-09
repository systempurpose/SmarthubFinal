async function renderAdbDashboard(container) {
    container.innerHTML = `
        <h1 data-i18n="dashboard.title" style="margin-bottom: 24px;">Dashboard</h1>
        <div class="action-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px;">
            <div class="action-card" data-action="storage-analysis" style="background: white; border-radius: 16px; padding: 20px 16px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; border: 1px solid #e5e7eb;">
                <div style="font-size: 32px; margin-bottom: 8px;">💾</div>
                <div data-i18n="action.storageAnalysis.title" style="font-weight: 600; font-size: 15px;">Storage Analysis</div>
                <div data-i18n="action.storageAnalysis.desc" style="font-size: 12px; color: #6B7280; margin-top: 4px;">Check storage usage & large files</div>
            </div>
            <div class="action-card" data-action="app-security" style="background: white; border-radius: 16px; padding: 20px 16px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; border: 1px solid #e5e7eb;">
                <div style="font-size: 32px; margin-bottom: 8px;">🛡️</div>
                <div data-i18n="action.appSecurity.title" style="font-weight: 600; font-size: 15px;">App Security Scan</div>
                <div data-i18n="action.appSecurity.desc" style="font-size: 12px; color: #6B7280; margin-top: 4px;">Detect suspicious & risky apps</div>
            </div>
            <div class="action-card" data-action="install" style="background: white; border-radius: 16px; padding: 20px 16px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; border: 1px solid #e5e7eb;">
                <div style="font-size: 32px; margin-bottom: 8px;">📱</div>
                <div data-i18n="action.install.title" style="font-weight: 600; font-size: 15px;">Install Android App</div>
                <div data-i18n="action.install.desc" style="font-size: 12px; color: #6B7280; margin-top: 4px;">Deploy companion app</div>
            </div>
            <div class="action-card" data-action="wizard" style="background: white; border-radius: 16px; padding: 20px 16px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; border: 1px solid #e5e7eb;">
                <div style="font-size: 32px; margin-bottom: 8px;">🔌</div>
                <div data-i18n="action.wizard.title" style="font-weight: 600; font-size: 15px;">USB Debugging Wizard</div>
                <div data-i18n="action.wizard.desc" style="font-size: 12px; color: #6B7280; margin-top: 4px;">Connect your phone</div>
            </div>
            <div class="action-card" data-action="help" style="background: white; border-radius: 16px; padding: 20px 16px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; border: 1px solid #e5e7eb;">
                <div style="font-size: 32px; margin-bottom: 8px;">❓</div>
                <div data-i18n="action.help.title" style="font-weight: 600; font-size: 15px;">Help</div>
                <div data-i18n="action.help.desc" style="font-size: 12px; color: #6B7280; margin-top: 4px;">Guides & support</div>
            </div>
        </div>

        <div class="card" id="softwareSafetyCard">
            <div class="card-title"><i class="fas fa-shield-alt"></i> <span data-i18n="safety.title">Software Safety</span></div>
            <div id="safetyContent" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px;">
                <div style="background: #f8f9fa; border-radius: 8px; padding: 10px; text-align: center;">
                    <div data-i18n="safety.patch" style="font-size: 12px; color: #6B7280;">Security Patch</div>
                    <div id="safetyPatch" style="font-weight: 600;">---</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 10px; text-align: center;">
                    <div data-i18n="safety.root" style="font-size: 12px; color: #6B7280;">Root Status</div>
                    <div id="safetyRoot" style="font-weight: 600;">---</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 10px; text-align: center;">
                    <div data-i18n="safety.playProtect" style="font-size: 12px; color: #6B7280;">Play Protect</div>
                    <div id="safetyPlayProtect" style="font-weight: 600;">---</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 10px; text-align: center;">
                    <div data-i18n="safety.unknown" style="font-size: 12px; color: #6B7280;">Unknown Sources</div>
                    <div id="safetyUnknown" style="font-weight: 600;">---</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 10px; text-align: center;">
                    <div data-i18n="safety.adb" style="font-size: 12px; color: #6B7280;">USB Debugging</div>
                    <div id="safetyAdb" style="font-weight: 600;">---</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 10px; text-align: center;">
                    <div data-i18n="safety.suspicious" style="font-size: 12px; color: #6B7280;">Suspicious Apps</div>
                    <div id="safetySuspicious" style="font-weight: 600;">---</div>
                </div>
            </div>
        </div>

        <!-- ===== SCAN RESULTS SECTION (UPDATED) ===== -->
        <div id="scanResultsSection" style="margin-top: 24px;">
            <div id="appScanResults" style="display: none; margin-bottom: 16px;"></div>
            <div id="storageResults" style="display: none; margin-bottom: 16px;"></div>
            <div id="hardwareResults" style="display: none; margin-bottom: 16px;"></div>
            <div id="connectionResults" style="display: none; margin-bottom: 16px;"></div>
            <div id="advancedResults" style="display: none; margin-bottom: 16px;"></div>
        </div>

        <div id="deviceOverview" class="card" style="display: none;"></div>
        <div id="networkStatus" class="card" style="display: none;"></div>
        <div id="phoneSummary" class="card" style="display: none;">
            <div class="card-title"><i class="fas fa-mobile-alt"></i> Phone Summary</div>
            <div class="phone-summary-grid"></div>
        </div>
        <div id="alertsCard" class="card" style="display: none;"></div>
        <div id="diagnosticResult" class="card" style="display: none;"></div>
    `;

    // FIX: this render call was wiping out any previously-applied translations
    // (this innerHTML has zero data-i18n coverage before this fix, and nothing
    // ever re-ran applyLanguage after building it). Now that every static
    // label above has a data-i18n key, re-apply the active language right
    // after building the markup so it renders correctly regardless of which
    // language is selected.
    if (typeof applyLanguage === 'function') {
        const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
        applyLanguage(window._activeLang || savedLang);
    }

    loadSavedScanResults();

    // Attach event listeners (unchanged)
    const storageCard = container.querySelector('.action-card[data-action="storage-analysis"]');
    if (storageCard) storageCard.addEventListener('click', runStorageAnalysis);

    const appSecurityCard = container.querySelector('.action-card[data-action="app-security"]');
    if (appSecurityCard) {
        appSecurityCard.addEventListener('click', function(e) {
            try {
                if (typeof window.runAppScan === 'function') {
                    window.runAppScan();
                } else {
                    const script = document.createElement('script');
                    script.src = '../js/appScan.js';
                    script.onload = () => {
                        if (typeof window.runAppScan === 'function') {
                            window.runAppScan();
                        } else {
                            alert('AppScan module loaded but function not found. Refresh the page.');
                        }
                    };
                    script.onerror = () => {
                        console.error('Failed to load appScan.js');
                        alert('Failed to load AppScan module. Please refresh the page.');
                    };
                    document.head.appendChild(script);
                }
            } catch (err) {
                console.error('[Dashboard] Error running app scan:', err);
                alert('Error: ' + err.message);
            }
        });
    }

    const installCard = container.querySelector('.action-card[data-action="install"]');
    if (installCard) {
        installCard.addEventListener('click', async () => {
            if (!currentDeviceId) {
                await showAlert('No Device', 'No device connected. Please connect a phone first.');
                return;
            }
            const btn = installCard;
            const descEl = btn.querySelector('div:last-child');
            const originalText = descEl?.innerHTML || 'Deploy companion app';
            if (descEl) descEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Installing...';
            try {
                const response = await fetch(`${BACKEND_URL}/api/install-apk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deviceId: currentDeviceId })
                });
                const data = await response.json();
                if (response.ok) {
                    await showAlert('Success', 'Android app installed successfully!');
                } else {
                    await showAlert('Error', 'Installation failed: ' + data.error);
                }
            } catch (err) {
                await showAlert('Error', 'Error: ' + err.message);
            } finally {
                if (descEl) descEl.innerHTML = originalText;
            }
        });
    }

    const wizardCard = container.querySelector('.action-card[data-action="wizard"]');
    if (wizardCard) wizardCard.addEventListener('click', openWizard);

    const helpCard = container.querySelector('.action-card[data-action="help"]');
    if (helpCard) helpCard.addEventListener('click', showHelpModal);

    // Fetch hardware data (unchanged)
    console.log('[Dashboard] Fetching hardware data for device:', currentDeviceId);
    try {
        const [battery, storage, ram, deviceText, wifiStatus, tempData, safetyData] = await Promise.all([
            apiCall(`/hardware/battery?deviceId=${currentDeviceId}`).catch(e => {
                console.error('[Dashboard] Battery API error:', e);
                return { level: '?', health: 'unknown' };
            }),
            apiCall(`/hardware/storage?deviceId=${currentDeviceId}`).catch(e => {
                console.error('[Dashboard] Storage API error:', e);
                return { total: '?', used: '?', free: '?' };
            }),
            apiCall(`/hardware/ram?deviceId=${currentDeviceId}`).catch(e => {
                console.error('[Dashboard] RAM API error:', e);
                return { total: '?', used: '?' };
            }),
            fetchWithTimeout(`${BACKEND_URL}/device/${currentDeviceId}`, {}, 7000)
                .then(r => r.text())
                .catch(e => {
                    console.error('[Dashboard] Device props error:', e);
                    return '';
                }),
            fetchWithTimeout(`${BACKEND_URL}/wifi/status/${currentDeviceId}`, {}, 7000)
                .then(r => r.json())
                .catch(e => {
                    console.error('[Dashboard] WiFi status error:', e);
                    return null;
                }),
            apiCall(`/hardware/temperature?deviceId=${currentDeviceId}`).catch(e => {
                console.error('[Dashboard] Temperature error:', e);
                return { temperature: 'Unknown' };
            }),
            fetch(`${BACKEND_URL}/api/software-safety?deviceId=${currentDeviceId}`)
                .then(r => r.ok ? r.json() : null)
                .catch(e => {
                    console.error('[Dashboard] Software safety error:', e);
                    return null;
                })
        ]);

        console.log('[Dashboard] Battery data:', battery);
        console.log('[Dashboard] Storage data:', storage);
        console.log('[Dashboard] RAM data:', ram);

        await updateStatusBar();

        if (safetyData) {
            document.getElementById('safetyPatch').textContent = safetyData.patchDate || 'Unknown';
            document.getElementById('safetyRoot').textContent = safetyData.isRooted ? '⚠️ Rooted' : '✅ Safe';
            document.getElementById('safetyPlayProtect').textContent = safetyData.playProtectEnabled ? '✅ On' : '⚠️ Off';
            document.getElementById('safetyUnknown').textContent = safetyData.unknownSourcesEnabled ? '⚠️ Allowed' : '✅ Disabled';
            document.getElementById('safetyAdb').textContent = safetyData.adbDebugging ? '⚠️ Enabled' : '✅ Disabled';
            const suspCount = (window._appSecurityResults && window._appSecurityResults[currentDeviceId]) 
                ? window._appSecurityResults[currentDeviceId].length 
                : 0;
            document.getElementById('safetySuspicious').textContent = suspCount > 0 ? `⚠️ ${suspCount}` : '✅ 0';
        }
    } catch (err) {
        console.error('[Dashboard] Error fetching data:', err);
    }

    document.getElementById('testScanBtn')?.addEventListener('click', testSuspiciousScan);
    
}