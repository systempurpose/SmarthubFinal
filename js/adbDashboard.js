// js/adbDashboard.js
// Dashboard rendering – fully translated via t().
// Only shows App Security and Storage Analysis results.
// Hardware, Connection, Advanced are hidden on the dashboard.

async function renderAdbDashboard(container) {
    container.innerHTML = `
        <h1 data-i18n="dashboard.title" style="margin-bottom: 24px;">${t('dashboard.title', 'Dashboard')}</h1>
        <div class="action-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px;">
            <div class="action-card" data-action="storage-analysis" style="background: white; border-radius: 16px; padding: 20px 16px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; border: 1px solid #e5e7eb;">
                <div style="font-size: 32px; margin-bottom: 8px;">💾</div>
                <div data-i18n="action.storageAnalysis.title" style="font-weight: 600; font-size: 15px;">${t('action.storageAnalysis.title', 'Storage Analysis')}</div>
                <div data-i18n="action.storageAnalysis.desc" style="font-size: 12px; color: #6B7280; margin-top: 4px;">${t('action.storageAnalysis.desc', 'Check storage usage & large files')}</div>
            </div>
            <div class="action-card" data-action="app-security" style="background: white; border-radius: 16px; padding: 20px 16px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; border: 1px solid #e5e7eb;">
                <div style="font-size: 32px; margin-bottom: 8px;">🛡️</div>
                <div data-i18n="action.appSecurity.title" style="font-weight: 600; font-size: 15px;">${t('action.appSecurity.title', 'App Security Scan')}</div>
                <div data-i18n="action.appSecurity.desc" style="font-size: 12px; color: #6B7280; margin-top: 4px;">${t('action.appSecurity.desc', 'Detect suspicious & risky apps')}</div>
            </div>
            <div class="action-card" data-action="install" style="background: white; border-radius: 16px; padding: 20px 16px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; border: 1px solid #e5e7eb;">
                <div style="font-size: 32px; margin-bottom: 8px;">📱</div>
                <div data-i18n="action.install.title" style="font-weight: 600; font-size: 15px;">${t('action.install.title', 'Install Android App')}</div>
                <div data-i18n="action.install.desc" style="font-size: 12px; color: #6B7280; margin-top: 4px;">${t('action.install.desc', 'Deploy companion app')}</div>
            </div>
            <div class="action-card" data-action="wizard" style="background: white; border-radius: 16px; padding: 20px 16px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; border: 1px solid #e5e7eb;">
                <div style="font-size: 32px; margin-bottom: 8px;">🔌</div>
                <div data-i18n="action.wizard.title" style="font-weight: 600; font-size: 15px;">${t('action.wizard.title', 'USB Debugging Wizard')}</div>
                <div data-i18n="action.wizard.desc" style="font-size: 12px; color: #6B7280; margin-top: 4px;">${t('action.wizard.desc', 'Connect your phone')}</div>
            </div>
            <div class="action-card" data-action="help" style="background: white; border-radius: 16px; padding: 20px 16px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; border: 1px solid #e5e7eb;">
                <div style="font-size: 32px; margin-bottom: 8px;">❓</div>
                <div data-i18n="action.help.title" style="font-weight: 600; font-size: 15px;">${t('action.help.title', 'Help')}</div>
                <div data-i18n="action.help.desc" style="font-size: 12px; color: #6B7280; margin-top: 4px;">${t('action.help.desc', 'Guides & support')}</div>
            </div>
        </div>

        <div class="card" id="softwareSafetyCard">
            <div class="card-title"><i class="fas fa-shield-alt"></i> <span data-i18n="safety.title">${t('safety.title', 'Software Safety')}</span></div>
            <div id="safetyContent" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px;">
                <div style="background: #f8f9fa; border-radius: 8px; padding: 10px; text-align: center;">
                    <div data-i18n="safety.patch" style="font-size: 12px; color: #6B7280;">${t('safety.patch', 'Security Patch')}</div>
                    <div id="safetyPatch" style="font-weight: 600;">---</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 10px; text-align: center;">
                    <div data-i18n="safety.root" style="font-size: 12px; color: #6B7280;">${t('safety.root', 'Root Status')}</div>
                    <div id="safetyRoot" style="font-weight: 600;">---</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 10px; text-align: center;">
                    <div data-i18n="safety.playProtect" style="font-size: 12px; color: #6B7280;">${t('safety.playProtect', 'Play Protect')}</div>
                    <div id="safetyPlayProtect" style="font-weight: 600;">---</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 10px; text-align: center;">
                    <div data-i18n="safety.unknown" style="font-size: 12px; color: #6B7280;">${t('safety.unknown', 'Unknown Sources')}</div>
                    <div id="safetyUnknown" style="font-weight: 600;">---</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 10px; text-align: center;">
                    <div data-i18n="safety.adb" style="font-size: 12px; color: #6B7280;">${t('safety.adb', 'USB Debugging')}</div>
                    <div id="safetyAdb" style="font-weight: 600;">---</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 10px; text-align: center;">
                    <div data-i18n="safety.suspicious" style="font-size: 12px; color: #6B7280;">${t('safety.suspicious', 'Suspicious Apps')}</div>
                    <div id="safetySuspicious" style="font-weight: 600;">---</div>
                </div>
            </div>
        </div>

        <!-- ===== SCAN RESULTS SECTION – ONLY APP & STORAGE ===== -->
        <div id="scanResultsSection" style="margin-top: 24px;">
            <div id="appScanResults" style="display: none; margin-bottom: 16px;"></div>
            <div id="storageResults" style="display: none; margin-bottom: 16px;"></div>
            <!-- Hardware, Connection, Advanced containers removed entirely -->
        </div>

        <div id="deviceOverview" class="card" style="display: none;"></div>
        <div id="networkStatus" class="card" style="display: none;"></div>
        <div id="phoneSummary" class="card" style="display: none;">
            <div class="card-title"><i class="fas fa-mobile-alt"></i> ${t('dashboard.phoneSummary', 'Phone Summary')}</div>
            <div class="phone-summary-grid"></div>
        </div>
        <div id="alertsCard" class="card" style="display: none;"></div>
        <div id="diagnosticResult" class="card" style="display: none;"></div>
    `;

    // Re‑apply language for any remaining data‑i18n attributes
    if (typeof applyLanguage === 'function') {
        const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
        applyLanguage(window._activeLang || savedLang);
    }

    // ===== Attach event listeners (unchanged) =====
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
                            alert(t('common.error', 'Error') + ': ' + t('appScan.loadError', 'AppScan module loaded but function not found. Refresh the page.'));
                        }
                    };
                    script.onerror = () => {
                        console.error('Failed to load appScan.js');
                        alert(t('common.error', 'Error') + ': ' + t('appScan.loadError', 'Failed to load AppScan module. Please refresh the page.'));
                    };
                    document.head.appendChild(script);
                }
            } catch (err) {
                console.error('[Dashboard] Error running app scan:', err);
                alert(t('common.error', 'Error') + ': ' + err.message);
            }
        });
    }

    const installCard = container.querySelector('.action-card[data-action="install"]');
    if (installCard) {
        installCard.addEventListener('click', async () => {
            if (!currentDeviceId) {
                await (window.showAlert || alert)(
                    t('common.noDevice', 'No Device'),
                    t('common.connectFirst', 'Please connect a device first.')
                );
                return;
            }
            const btn = installCard;
            const descEl = btn.querySelector('div:last-child');
            const originalText = descEl?.innerHTML || t('action.install.desc', 'Deploy companion app');
            if (descEl) descEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + t('action.install.installing', 'Installing...');
            try {
                const response = await fetch(`${BACKEND_URL}/api/install-apk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deviceId: currentDeviceId })
                });
                const data = await response.json();
                if (response.ok) {
                    await (window.showAlert || alert)(
                        t('common.success', 'Success'),
                        t('action.install.success', 'Android app installed successfully!')
                    );
                } else {
                    await (window.showAlert || alert)(
                        t('common.error', 'Error'),
                        t('action.install.failed', 'Installation failed: ') + data.error
                    );
                }
            } catch (err) {
                await (window.showAlert || alert)(
                    t('common.error', 'Error'),
                    t('common.errorPrefix', 'Error: ') + err.message
                );
            } finally {
                if (descEl) descEl.innerHTML = originalText;
            }
        });
    }

    const wizardCard = container.querySelector('.action-card[data-action="wizard"]');
    if (wizardCard) wizardCard.addEventListener('click', openWizard);

    const helpCard = container.querySelector('.action-card[data-action="help"]');
    if (helpCard) helpCard.addEventListener('click', showHelpModal);

    // ===== Fetch hardware data (with increased timeout) =====
    console.log('[Dashboard] Fetching hardware data for device:', currentDeviceId);
    try {
        const TIMEOUT = 15000;
        const [battery, storage, ram, deviceText, wifiStatus, tempData, safetyData] = await Promise.all([
            apiCall(`/hardware/battery?deviceId=${currentDeviceId}`).catch(e => {
                console.error('[Dashboard] Battery API error:', e);
                return { level: '?', health: t('common.unknown', 'unknown') };
            }),
            apiCall(`/hardware/storage?deviceId=${currentDeviceId}`).catch(e => {
                console.error('[Dashboard] Storage API error:', e);
                return { total: '?', used: '?', free: '?' };
            }),
            apiCall(`/hardware/ram?deviceId=${currentDeviceId}`).catch(e => {
                console.error('[Dashboard] RAM API error:', e);
                return { total: '?', used: '?' };
            }),
            fetchWithTimeout(`${BACKEND_URL}/device/${currentDeviceId}`, {}, TIMEOUT)
                .then(r => r.text())
                .catch(e => {
                    console.error('[Dashboard] Device props error:', e);
                    return '';
                }),
            fetchWithTimeout(`${BACKEND_URL}/wifi/status/${currentDeviceId}`, {}, TIMEOUT)
                .then(r => r.json())
                .catch(e => {
                    console.error('[Dashboard] WiFi status error:', e);
                    return null;
                }),
            apiCall(`/hardware/temperature?deviceId=${currentDeviceId}`).catch(e => {
                console.error('[Dashboard] Temperature error:', e);
                return { temperature: t('common.unknown', 'Unknown') };
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
            const patchLabel = safetyData.patchDate || t('common.unknown', 'Unknown');
            const rootLabel = safetyData.isRooted ? t('safety.rooted', '⚠️ Rooted') : t('safety.safe', '✅ Safe');
            const playLabel = safetyData.playProtectEnabled ? t('safety.on', '✅ On') : t('safety.off', '⚠️ Off');
            const unknownLabel = safetyData.unknownSourcesEnabled ? t('safety.allowed', '⚠️ Allowed') : t('safety.disabled', '✅ Disabled');
            const adbLabel = safetyData.adbDebugging ? t('safety.enabled', '⚠️ Enabled') : t('safety.disabled', '✅ Disabled');
            document.getElementById('safetyPatch').textContent = patchLabel;
            document.getElementById('safetyRoot').textContent = rootLabel;
            document.getElementById('safetyPlayProtect').textContent = playLabel;
            document.getElementById('safetyUnknown').textContent = unknownLabel;
            document.getElementById('safetyAdb').textContent = adbLabel;
            const suspCount = (window._appSecurityResults && window._appSecurityResults[currentDeviceId]) 
                ? window._appSecurityResults[currentDeviceId].length 
                : 0;
            document.getElementById('safetySuspicious').textContent = suspCount > 0 ? `⚠️ ${suspCount}` : '✅ 0';
        }
    } catch (err) {
        console.error('[Dashboard] Error fetching data:', err);
    }

    // ===== Load only App and Storage results from Supabase =====
    // We skip hardware, connection, advanced because their containers don't exist.
    if (typeof loadSavedScanResults === 'function') {
        // Option 1: Patch loadSavedScanResults to skip the three.
        // But it already tries to render them, and if containers are missing, they silently fail.
        // So we can still call it – it will attempt to render but no containers = no visual.
        await loadSavedScanResults();
    } else {
        console.warn('[Dashboard] loadSavedScanResults not defined – scan results may not appear.');
    }

    document.getElementById('testScanBtn')?.addEventListener('click', testSuspiciousScan);
}