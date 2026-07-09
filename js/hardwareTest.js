// ==================== HARDWARE TESTS PAGE (FULLY LOCALIZED) ====================
async function renderHardwareTests() {
    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `<div class="card" data-i18n="hw.noDevice">${t('hw.noDevice', _getLang())}</div>`;
        if (typeof applyLanguage === 'function') {
            const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
            applyLanguage(window._activeLang || savedLang);
        }
        return;
    }

    // ========== HELPERS ==========
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

    async function launchAndroidApp() {
        await runAdb('am start -n com.smarthub.diagnostics/.MainActivity');
    }

    async function launchTestRunner(testType) {
        await runAdb(`am start -n com.smarthub.diagnostics/.TestRunnerActivity --es test ${testType}`);
    }

    async function launchExtraHardwareTest(mode) {
        await runAdb(`am start -n com.smarthub.diagnostics/.ExtraHardwareTestActivity --es mode ${mode}`);
    }

    async function returnToMainApp() {
        await runAdb('input keyevent KEYCODE_BACK');
        await new Promise(r => setTimeout(r, 500));
        await launchAndroidApp();
    }

    // ---- Hardware feature detection ----
    let hardwareFeaturesCache = null;

    async function getHardwareFeatures() {
        if (hardwareFeaturesCache) return hardwareFeaturesCache;
        try {
            const out = await runAdb('pm list features');
            const features = out.split('\n')
                .filter(line => line.includes('feature:'))
                .map(line => line.replace(/^feature:/, '').trim());
            hardwareFeaturesCache = features;
            return features;
        } catch {
            return [];
        }
    }

    async function hasFeature(feature) {
        const features = await getHardwareFeatures();
        return features.some(f => f === feature);
    }

    async function hasSensor(sensorType) {
        try {
            const out = await runAdb(`dumpsys sensorservice | grep -i "${sensorType}"`);
            return out.trim().length > 0;
        } catch {
            return false;
        }
    }

    // ---- Modal helpers ----
    let modal, modalTitle, modalBody, yesBtn, noBtn, closeBtn;
    let currentResolver = null;

    function initModal() {
        modal = document.getElementById('hwTestModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'hwTestModal';
            modal.className = 'modal';
            modal.style.display = 'none';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 500px; width: 90%; background: white; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
                    <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
                        <h3 id="hwModalTitle" data-i18n="hw.modal.title" style="margin: 0; font-size: 18px;">${t('hw.modal.title', _getLang())}</h3>
                        <span class="close-button" id="hwCloseModalBtn" style="cursor: pointer; font-size: 24px; color: #6B7280;">&times;</span>
                    </div>
                    <div class="modal-body" id="hwModalBody" style="padding: 20px; text-align: center; min-height: 150px;"></div>
                    <div class="modal-footer" id="hwModalFooter" style="padding: 16px 20px; border-top: 1px solid #e5e7eb; text-align: center;">
                        <button id="hwYesBtn" class="btn-primary" style="display: none; margin: 0 8px;" data-i18n="hw.modal.yes">${t('hw.modal.yes', _getLang())}</button>
                        <button id="hwNoBtn" class="btn-secondary" style="display: none; margin: 0 8px;" data-i18n="hw.modal.no">${t('hw.modal.no', _getLang())}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        modalTitle = document.getElementById('hwModalTitle');
        modalBody = document.getElementById('hwModalBody');
        yesBtn = document.getElementById('hwYesBtn');
        noBtn = document.getElementById('hwNoBtn');
        closeBtn = document.getElementById('hwCloseModalBtn');

        closeBtn.addEventListener('click', closeModal);
        window.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    }

    function showModal(title, message) {
        if (!modal) initModal();
        modalTitle.textContent = title;
        modalBody.innerHTML = message;
        modal.style.display = 'flex';
        yesBtn.style.display = 'none';
        noBtn.style.display = 'none';
        // Apply translations to modal if needed
        if (typeof applyLanguage === 'function') {
            const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
            applyLanguage(window._activeLang || savedLang);
        }
    }

    function closeModal() {
        if (modal) modal.style.display = 'none';
        if (currentResolver) {
            currentResolver('no');
            currentResolver = null;
        }
    }

    function waitForUserConfirmation() {
        return new Promise((resolve) => {
            currentResolver = resolve;
            yesBtn.style.display = 'inline-block';
            noBtn.style.display = 'inline-block';
            // Update button texts with current language
            const lang = _getLang();
            yesBtn.textContent = t('hw.modal.yes', lang);
            noBtn.textContent = t('hw.modal.no', lang);
            const onYes = () => { cleanup(); resolve('yes'); };
            const onNo = () => { cleanup(); resolve('no'); };
            const cleanup = () => {
                yesBtn.removeEventListener('click', onYes);
                noBtn.removeEventListener('click', onNo);
                yesBtn.style.display = 'none';
                noBtn.style.display = 'none';
                currentResolver = null;
                closeModal();
            };
            yesBtn.addEventListener('click', onYes);
            noBtn.addEventListener('click', onNo);
        });
    }

    initModal();

    // ========== TEST DEFINITIONS (with i18n) ==========
    const testDefs = {
        battery: {
            titleKey: 'hw.test.battery.title',
            descKey: 'hw.test.battery.desc',
            run: async () => {
                const data = await apiCall(`/hardware/battery?deviceId=${currentDeviceId}`);
                const level = data.level || 0;
                const health = data.health || 'unknown';
                const passed = (level >= 20 && health === 'good');
                const message = passed ? `Level: ${level}%, health: ${health}` : (level < 20 ? 'Low battery (<20%)' : 'Poor battery health');
                return { passed, message };
            }
        },
        storage: {
            titleKey: 'hw.test.storage.title',
            descKey: 'hw.test.storage.desc',
            run: async () => {
                const data = await apiCall(`/hardware/storage?deviceId=${currentDeviceId}`);
                const free = data.free || '0';
                let freeGB = 0;
                const match = String(free).match(/(\d+(?:\.\d+)?)/);
                if (match) freeGB = parseFloat(match[1]);
                const passed = freeGB > 1.0;
                const message = `Free space: ${free}`;
                return { passed, message };
            }
        },
        sensors: {
            titleKey: 'hw.test.sensors.title',
            descKey: 'hw.test.sensors.desc',
            run: async () => {
                try {
                    const res = await apiCall(`/hardware/sensors?deviceId=${currentDeviceId}`);
                    const sensors = res.sensors || [];
                    const types = sensors.map(s => s.type.toLowerCase());
                    const hasAccel = types.some(t => t.includes('accelerometer'));
                    const hasGyro = types.some(t => t.includes('gyroscope'));
                    const hasProx = types.some(t => t.includes('proximity'));
                    const hasLight = types.some(t => t.includes('light'));
                    const passed = hasAccel && hasProx && hasLight;
                    const missing = [];
                    if (!hasAccel) missing.push('accelerometer');
                    if (!hasProx) missing.push('proximity');
                    if (!hasLight) missing.push('light');
                    let message = passed
                        ? `All core sensors detected (Gyro: ${hasGyro ? '✅' : '❌ optional'})`
                        : `Missing required: ${missing.join(', ')}`;
                    return { passed, message };
                } catch (err) {
                    return { passed: false, message: 'Failed to read sensors' };
                }
            }
        },
        display: {
            titleKey: 'hw.test.display.title',
            descKey: 'hw.test.display.desc',
            run: async () => {
                const deviceRes = await fetch(`${BACKEND_URL}/device/${currentDeviceId}`);
                let raw = await deviceRes.text();
                try { const p = JSON.parse(raw); if (typeof p === 'string') raw = p; } catch(e) {}
                const width = raw.match(/\[sys.logical.width\]:\s*\[(\d+)\]/)?.[1];
                const height = raw.match(/\[sys.logical.height\]:\s*\[(\d+)\]/)?.[1];
                const passed = width && height;
                const message = passed ? `${width} x ${height}` : 'Could not read resolution';
                return { passed, message };
            }
        },
        proximity: {
            titleKey: 'hw.test.proximity.title',
            descKey: 'hw.test.proximity.desc',
            run: async () => {
                const features = await getHardwareFeatures();
                const hasProx = features.some(f => f === 'android.hardware.sensor.proximity');
                if (!hasProx) {
                    return { passed: true, message: t('hw.test.proximity.notSupported', _getLang()) };
                }
                return { passed: true, message: t('hw.test.proximity.present', _getLang()) };
            }
        },
        gyro: {
            titleKey: 'hw.test.gyro.title',
            descKey: 'hw.test.gyro.desc',
            run: async () => {
                const features = await getHardwareFeatures();
                const hasGyro = features.some(f => f === 'android.hardware.sensor.gyroscope');
                const hasAccel = features.some(f => f === 'android.hardware.sensor.accelerometer');
                if (!hasGyro && !hasAccel) {
                    return { passed: true, message: t('hw.test.gyro.notSupported', _getLang()) };
                }
                return { passed: true, message: `Motion sensors present (Gyro: ${hasGyro}, Accel: ${hasAccel})` };
            }
        },
        gps: {
            titleKey: 'hw.test.gps.title',
            descKey: 'hw.test.gps.desc',
            run: async () => {
                try {
                    await runAdb('settings put secure location_mode 3');
                    await new Promise(r => setTimeout(r, 1000));
                    const mode = await runAdb('settings get secure location_mode');
                    const enabled = mode.trim() === '3';
                    if (!enabled) {
                        return { passed: false, message: 'GPS could not be enabled' };
                    }
                    const dump = await runAdb('dumpsys location');
                    const hasFix = dump.includes('mLocation') && dump.includes('latitude') && !dump.includes('mLocation=null');
                    const passed = hasFix;
                    const message = hasFix ? 'GPS locked successfully' : 'GPS enabled but no fix (move outdoors)';
                    return { passed, message };
                } catch (e) {
                    return { passed: false, message: 'Failed to check GPS: ' + e.message };
                }
            }
        },
        fingerprint: {
            titleKey: 'hw.test.fingerprint.title',
            descKey: 'hw.test.fingerprint.desc',
            run: async () => {
                const features = await getHardwareFeatures();
                const hasFingerprint = features.some(f => f === 'android.hardware.fingerprint');
                return { passed: true, message: hasFingerprint ? t('hw.test.fingerprint.present', _getLang()) : t('hw.test.fingerprint.notSupported', _getLang()) };
            }
        },
        nfc: {
            titleKey: 'hw.test.nfc.title',
            descKey: 'hw.test.nfc.desc',
            run: async () => {
                const features = await getHardwareFeatures();
                const hasNfc = features.some(f => f === 'android.hardware.nfc');
                return { passed: true, message: hasNfc ? t('hw.test.nfc.present', _getLang()) : t('hw.test.nfc.notSupported', _getLang()) };
            }
        },
        microphone: {
            titleKey: 'hw.test.microphone.title',
            descKey: 'hw.test.microphone.desc',
            run: async () => {
                await launchTestRunner('microphone');
                showModal(t('hw.test.microphone.modalTitle', _getLang()), t('hw.test.microphone.modalBody', _getLang()));
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? t('hw.test.microphone.passed', _getLang()) : t('hw.test.microphone.failed', _getLang());
                return { passed, message };
            }
        },
        vibration: {
            titleKey: 'hw.test.vibration.title',
            descKey: 'hw.test.vibration.desc',
            run: async () => {
                try { await runAdb('cmd vibrator_manager synced oneshot 500'); } catch(e) {}
                showModal(t('hw.test.vibration.modalTitle', _getLang()), t('hw.test.vibration.modalBody', _getLang()));
                const result = await waitForUserConfirmation();
                closeModal();
                const passed = (result === 'yes');
                const message = passed ? t('hw.test.vibration.passed', _getLang()) : t('hw.test.vibration.failed', _getLang());
                return { passed, message };
            }
        },
        flashlight: {
            titleKey: 'hw.test.flashlight.title',
            descKey: 'hw.test.flashlight.desc',
            run: async () => {
                await launchTestRunner('flash');
                showModal(t('hw.test.flashlight.modalTitle', _getLang()), t('hw.test.flashlight.modalBody', _getLang()));
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? t('hw.test.flashlight.passed', _getLang()) : t('hw.test.flashlight.failed', _getLang());
                return { passed, message };
            }
        },
        speaker: {
            titleKey: 'hw.test.speaker.title',
            descKey: 'hw.test.speaker.desc',
            run: async () => {
                await launchTestRunner('sound');
                showModal(t('hw.test.speaker.modalTitle', _getLang()), t('hw.test.speaker.modalBody', _getLang()));
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? t('hw.test.speaker.passed', _getLang()) : t('hw.test.speaker.failed', _getLang());
                return { passed, message };
            }
        },
        headphone: {
            titleKey: 'hw.test.headphone.title',
            descKey: 'hw.test.headphone.desc',
            run: async () => {
                await launchTestRunner('headphone');
                showModal(t('hw.test.headphone.modalTitle', _getLang()), t('hw.test.headphone.modalBody', _getLang()));
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? t('hw.test.headphone.passed', _getLang()) : t('hw.test.headphone.failed', _getLang());
                return { passed, message };
            }
        },
        touch: {
            titleKey: 'hw.test.touch.title',
            descKey: 'hw.test.touch.desc',
            run: async () => {
                await launchTestRunner('touch');
                showModal(t('hw.test.touch.modalTitle', _getLang()), t('hw.test.touch.modalBody', _getLang()));
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? t('hw.test.touch.passed', _getLang()) : t('hw.test.touch.failed', _getLang());
                return { passed, message };
            }
        },
        multitouch: {
            titleKey: 'hw.test.multitouch.title',
            descKey: 'hw.test.multitouch.desc',
            run: async () => {
                await launchExtraHardwareTest('multitouch');
                showModal(t('hw.test.multitouch.modalTitle', _getLang()), t('hw.test.multitouch.modalBody', _getLang()));
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? t('hw.test.multitouch.passed', _getLang()) : t('hw.test.multitouch.failed', _getLang());
                return { passed, message };
            }
        },
        buttons: {
            titleKey: 'hw.test.buttons.title',
            descKey: 'hw.test.buttons.desc',
            run: async () => {
                await launchExtraHardwareTest('buttons');
                showModal(t('hw.test.buttons.modalTitle', _getLang()), t('hw.test.buttons.modalBody', _getLang()));
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? t('hw.test.buttons.passed', _getLang()) : t('hw.test.buttons.failed', _getLang());
                return { passed, message };
            }
        },
        colorsweep: {
            titleKey: 'hw.test.colorsweep.title',
            descKey: 'hw.test.colorsweep.desc',
            run: async () => {
                await launchExtraHardwareTest('colorsweep');
                showModal(t('hw.test.colorsweep.modalTitle', _getLang()), t('hw.test.colorsweep.modalBody', _getLang()));
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? t('hw.test.colorsweep.passed', _getLang()) : t('hw.test.colorsweep.failed', _getLang());
                return { passed, message };
            }
        },
        camerafront: {
            titleKey: 'hw.test.camerafront.title',
            descKey: 'hw.test.camerafront.desc',
            run: async () => {
                const hasFrontCam = await hasFeature('android.hardware.camera.front');
                if (!hasFrontCam) {
                    return { passed: true, message: t('hw.test.camerafront.notSupported', _getLang()) };
                }
                await launchExtraHardwareTest('camera_front');
                showModal(t('hw.test.camerafront.modalTitle', _getLang()), t('hw.test.camerafront.modalBody', _getLang()));
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? t('hw.test.camerafront.passed', _getLang()) : t('hw.test.camerafront.failed', _getLang());
                return { passed, message };
            }
        },
        camerarear: {
            titleKey: 'hw.test.camerarear.title',
            descKey: 'hw.test.camerarear.desc',
            run: async () => {
                const hasRearCam = await hasFeature('android.hardware.camera');
                if (!hasRearCam) {
                    return { passed: true, message: t('hw.test.camerarear.notSupported', _getLang()) };
                }
                await launchExtraHardwareTest('camera_rear');
                showModal(t('hw.test.camerarear.modalTitle', _getLang()), t('hw.test.camerarear.modalBody', _getLang()));
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? t('hw.test.camerarear.passed', _getLang()) : t('hw.test.camerarear.failed', _getLang());
                return { passed, message };
            }
        },
        magnetometer: {
            titleKey: 'hw.test.magnetometer.title',
            descKey: 'hw.test.magnetometer.desc',
            run: async () => {
                const hasMag = await hasSensor('Magnetic field');
                if (!hasMag) {
                    return { passed: true, message: t('hw.test.magnetometer.notSupported', _getLang()) };
                }
                await launchExtraHardwareTest('magnetometer');
                showModal(t('hw.test.magnetometer.modalTitle', _getLang()), t('hw.test.magnetometer.modalBody', _getLang()));
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? t('hw.test.magnetometer.passed', _getLang()) : t('hw.test.magnetometer.failed', _getLang());
                return { passed, message };
            }
        },
        barometer: {
            titleKey: 'hw.test.barometer.title',
            descKey: 'hw.test.barometer.desc',
            run: async () => {
                const hasBaro = await hasSensor('Pressure');
                if (!hasBaro) {
                    return { passed: true, message: t('hw.test.barometer.notSupported', _getLang()) };
                }
                await launchExtraHardwareTest('barometer');
                showModal(t('hw.test.barometer.modalTitle', _getLang()), t('hw.test.barometer.modalBody', _getLang()));
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? t('hw.test.barometer.passed', _getLang()) : t('hw.test.barometer.failed', _getLang());
                return { passed, message };
            }
        },
        irblaster: {
            titleKey: 'hw.test.irblaster.title',
            descKey: 'hw.test.irblaster.desc',
            run: async () => {
                const hasIr = await hasFeature('android.hardware.consumerir');
                if (!hasIr) {
                    return { passed: true, message: t('hw.test.irblaster.notSupported', _getLang()) };
                }
                await launchExtraHardwareTest('ir_blaster');
                showModal(t('hw.test.irblaster.modalTitle', _getLang()), t('hw.test.irblaster.modalBody', _getLang()));
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? t('hw.test.irblaster.passed', _getLang()) : t('hw.test.irblaster.failed', _getLang());
                return { passed, message };
            }
        },
        faceunlock: {
            titleKey: 'hw.test.faceunlock.title',
            descKey: 'hw.test.faceunlock.desc',
            run: async () => {
                const hasFace = await hasFeature('android.hardware.biometrics.face');
                if (!hasFace) {
                    return { passed: true, message: t('hw.test.faceunlock.notSupported', _getLang()) };
                }
                await launchExtraHardwareTest('face_unlock');
                showModal(t('hw.test.faceunlock.modalTitle', _getLang()), t('hw.test.faceunlock.modalBody', _getLang()));
                const result = await waitForUserConfirmation();
                closeModal();
                await returnToMainApp();
                const passed = (result === 'yes');
                const message = passed ? t('hw.test.faceunlock.passed', _getLang()) : t('hw.test.faceunlock.failed', _getLang());
                return { passed, message };
            }
        }
    };

    // ========== BUILD UI ==========
    const testIds = Object.keys(testDefs);
    let cardsHtml = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px;">`;
    for (const id of testIds) {
        const def = testDefs[id];
        const title = t(def.titleKey, _getLang());
        const desc = t(def.descKey, _getLang());
        cardsHtml += `
            <div class="test-card" id="card-${id}" style="background: white; padding: 16px 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); display: flex; flex-direction: column; justify-content: space-between; border-left: 4px solid #6B7280;">
                <div>
                    <h3 style="margin: 0 0 4px 0; font-size: 16px;" data-i18n="${def.titleKey}">${title}</h3>
                    <p style="margin: 0 0 12px 0; color: #6B7280; font-size: 13px;" data-i18n="${def.descKey}">${desc}</p>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                    <span class="status-text" data-i18n="hw.status.pending" style="font-weight: 600; color: #6B7280; font-size: 14px;">${t('hw.status.pending', _getLang())}</span>
                    <button class="btn-secondary run-single-test" data-test="${id}" data-i18n="hw.btn.start" style="font-size: 12px; padding: 4px 16px;">${t('hw.btn.start', _getLang())}</button>
                </div>
                <div class="result-message" style="font-size: 12px; color: #6B7280; margin-top: 4px; word-break: break-word; display: none;"></div>
            </div>
        `;
    }
    cardsHtml += `</div>`;

    const fullHtml = `
        <div class="info-card" style="text-align: center; margin-bottom: 24px;">
            <div class="card-header"><i class="fas fa-microscope"></i> <span data-i18n="hw.page.title">${t('hw.page.title', _getLang())}</span></div>
            <div class="card-content">
                <p data-i18n="hw.page.subtitle">${t('hw.page.subtitle', _getLang())}</p>
                <button id="startHwTestBtn" class="btn-primary" style="font-size: 16px;" data-i18n="hw.btn.fullSuite">${t('hw.btn.fullSuite', _getLang())}</button>
            </div>
        </div>
        ${cardsHtml}
        <div id="hwResults" style="display: none;">
            <div class="cards-container" id="hwCardsContainer"></div>
            <div id="hwSummaryCard" class="info-card" style="margin-top: 24px;"></div>
        </div>
    `;

    document.getElementById('pageContent').innerHTML = fullHtml;

    // ---- APPLY LANGUAGE ----
    if (typeof applyLanguage === 'function') {
        const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
        applyLanguage(window._activeLang || savedLang);
    }

    // ========== RESTORE SAVED RESULTS ON MOUNT ==========
    const saved = loadHardwareResults();
    if (saved && saved.results) {
        window._hardwareTestResults = saved.results;
        Object.entries(saved.results).forEach(([id, r]) => {
            const card = document.getElementById(`card-${id}`);
            if (!card) return;
            const statusSpan = card.querySelector('.status-text');
            const msgSpan = card.querySelector('.result-message');
            const btn = card.querySelector('.run-single-test');
            const color = r.passed ? '#2e7d32' : '#d32f2f';
            statusSpan.style.color = color;
            statusSpan.textContent = r.passed ? t('hw.status.passed', _getLang()) : t('hw.status.failed', _getLang());
            msgSpan.textContent = r.message || '';
            msgSpan.style.display = 'block';
            msgSpan.style.color = color;
            if (btn) btn.textContent = r.passed ? t('hw.btn.rerun', _getLang()) : t('hw.btn.details', _getLang());
        });
        if (saved.summary) {
            const summaryDiv = document.getElementById('hwSummaryCard');
            if (summaryDiv) {
                const { total, passed, percentage } = saved.summary;
                summaryDiv.innerHTML = `
                    <div class="card-header"><i class="fas fa-clipboard-list"></i> <span data-i18n="hw.summary.title">${t('hw.summary.title', _getLang())}</span></div>
                    <div class="card-content">
                        <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 20px; flex-wrap: wrap;">
                            <div style="position: relative; width: 80px; height: 80px; flex-shrink: 0;">
                                <svg viewBox="0 0 36 36" style="width: 100%; height: 100%; transform: rotate(-90deg);">
                                    <circle cx="18" cy="18" r="16" fill="none" stroke="#e6e6e6" stroke-width="3"/>
                                    <circle cx="18" cy="18" r="16" fill="none" stroke="${percentage >= 80 ? '#2e7d32' : percentage >= 60 ? '#ed6c02' : '#d32f2f'}" stroke-width="3"
                                        stroke-dasharray="${percentage} 100" stroke-linecap="round"/>
                                </svg>
                                <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 16px; font-weight: bold;">${percentage}%</span>
                            </div>
                            <div>
                                <h3 style="margin: 0; font-size: 20px;">${passed}/${total} ${t('hw.summary.testsPassed', _getLang())}</h3>
                                <p style="margin: 4px 0 0; color: #6B7280;">${percentage === 100 ? t('hw.summary.allPassed', _getLang()) : percentage >= 80 ? t('hw.summary.mostPassed', _getLang()) : t('hw.summary.multipleFailures', _getLang())}</p>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
    }

    // ========== SINGLE TEST HANDLER (with per‑test save) ==========
    document.querySelectorAll('.run-single-test').forEach(btn => {
        btn.addEventListener('click', async function() {
            const testId = this.dataset.test;
            const card = document.getElementById(`card-${testId}`);
            const statusSpan = card.querySelector('.status-text');
            const msgSpan = card.querySelector('.result-message');
            const btn = card.querySelector('.run-single-test');
            const def = testDefs[testId];
            if (!def) return;

            btn.disabled = true;
            btn.textContent = t('hw.btn.running', _getLang());
            statusSpan.style.color = '#f59e0b';
            statusSpan.textContent = t('hw.status.running', _getLang());
            msgSpan.style.display = 'none';

            try {
                const result = await def.run();
                const passed = result.passed;
                const icon = passed ? '✅' : '❌';
                const color = passed ? '#2e7d32' : '#d32f2f';
                statusSpan.style.color = color;
                statusSpan.textContent = `${icon} ${passed ? t('hw.status.passed', _getLang()) : t('hw.status.failed', _getLang())}`;
                msgSpan.textContent = result.message || '';
                msgSpan.style.display = 'block';
                msgSpan.style.color = color;
                btn.textContent = passed ? t('hw.btn.rerun', _getLang()) : t('hw.btn.details', _getLang());

                window._hardwareTestResults[testId] = { name: t(def.titleKey, _getLang()), passed, message: result.message };
                saveHardwareResults(null);
            } catch (err) {
                statusSpan.style.color = '#d32f2f';
                statusSpan.textContent = t('hw.status.error', _getLang());
                msgSpan.textContent = err.message || '';
                msgSpan.style.display = 'block';
                msgSpan.style.color = '#d32f2f';
                btn.textContent = t('hw.btn.retry', _getLang());

                window._hardwareTestResults[testId] = { name: t(def.titleKey, _getLang()), passed: false, message: err.message };
                saveHardwareResults(null);
            } finally {
                btn.disabled = false;
            }
        });
    });

    // ========== FULL SUITE HANDLER (with summary save) ==========
    document.getElementById('startHwTestBtn').addEventListener('click', async function() {
        const resultsContainer = document.getElementById('hwResults');
        resultsContainer.style.display = 'block';
        const cardsContainer = document.getElementById('hwCardsContainer');
        cardsContainer.innerHTML = '';
        const results = {};

        try {
            await launchAndroidApp();
        } catch (e) {
            alert(t('hw.alert.companionMissing', _getLang()));
        }

        for (const id of testIds) {
            const def = testDefs[id];
            const card = document.getElementById(`card-${id}`);
            const statusSpan = card.querySelector('.status-text');
            const msgSpan = card.querySelector('.result-message');
            const btn = card.querySelector('.run-single-test');
            btn.disabled = true;
            btn.textContent = t('hw.btn.running', _getLang());
            statusSpan.style.color = '#f59e0b';
            statusSpan.textContent = t('hw.status.running', _getLang());
            msgSpan.style.display = 'none';

            try {
                const result = await def.run();
                results[id] = { name: t(def.titleKey, _getLang()), passed: result.passed, message: result.message };
                const passed = result.passed;
                const icon = passed ? '✅' : '❌';
                const color = passed ? '#2e7d32' : '#d32f2f';
                statusSpan.style.color = color;
                statusSpan.textContent = `${icon} ${passed ? t('hw.status.passed', _getLang()) : t('hw.status.failed', _getLang())}`;
                msgSpan.textContent = result.message || '';
                msgSpan.style.display = 'block';
                msgSpan.style.color = color;
                btn.textContent = passed ? t('hw.btn.rerun', _getLang()) : t('hw.btn.details', _getLang());
                btn.disabled = false;
            } catch (err) {
                results[id] = { name: t(def.titleKey, _getLang()), passed: false, message: err.message };
                statusSpan.style.color = '#d32f2f';
                statusSpan.textContent = t('hw.status.error', _getLang());
                msgSpan.textContent = err.message || '';
                msgSpan.style.display = 'block';
                msgSpan.style.color = '#d32f2f';
                btn.textContent = t('hw.btn.retry', _getLang());
                btn.disabled = false;
            }
            await new Promise(r => setTimeout(r, 500));
        }

        const passedCount = Object.values(results).filter(r => r.passed).length;
        const total = testIds.length;
        const percentage = Math.round((passedCount / total) * 100);

        const summaryDiv = document.getElementById('hwSummaryCard');
        summaryDiv.innerHTML = `
            <div class="card-header"><i class="fas fa-clipboard-list"></i> <span data-i18n="hw.summary.title">${t('hw.summary.title', _getLang())}</span></div>
            <div class="card-content">
                <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 20px; flex-wrap: wrap;">
                    <div style="position: relative; width: 80px; height: 80px; flex-shrink: 0;">
                        <svg viewBox="0 0 36 36" style="width: 100%; height: 100%; transform: rotate(-90deg);">
                            <circle cx="18" cy="18" r="16" fill="none" stroke="#e6e6e6" stroke-width="3"/>
                            <circle cx="18" cy="18" r="16" fill="none" stroke="${percentage >= 80 ? '#2e7d32' : percentage >= 60 ? '#ed6c02' : '#d32f2f'}" stroke-width="3"
                                stroke-dasharray="${percentage} 100" stroke-linecap="round"/>
                        </svg>
                        <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 16px; font-weight: bold;">${percentage}%</span>
                    </div>
                    <div>
                        <h3 style="margin: 0; font-size: 20px;">${passedCount}/${total} ${t('hw.summary.testsPassed', _getLang())}</h3>
                        <p style="margin: 4px 0 0; color: #6B7280;">${percentage === 100 ? t('hw.summary.allPassed', _getLang()) : percentage >= 80 ? t('hw.summary.mostPassed', _getLang()) : t('hw.summary.multipleFailures', _getLang())}</p>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;">
                    ${Object.values(results).map(r => `
                        <div style="background: ${r.passed ? '#e8f5e9' : '#ffebee'}; border-radius: 8px; padding: 10px 14px; display: flex; align-items: center; gap: 10px; border-left: 4px solid ${r.passed ? '#2e7d32' : '#d32f2f'};">
                            <span style="font-size: 20px;">${r.passed ? '✅' : '❌'}</span>
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: 600; font-size: 14px;">${escapeHtml(r.name)}</div>
                                <div style="font-size: 12px; color: #555; word-break: break-word;">${escapeHtml(r.message)}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        resultsContainer.scrollIntoView({ behavior: 'smooth' });

        // ---- SAVE FULL SUITE SUMMARY ----
        const summary = { total, passed: passedCount, percentage };
        window._hardwareTestResults = results;
        saveHardwareResults(summary);
    });
}

// ---- Helper to get current language ----
function _getLang() {
    return window._activeLang
        || (window.SmartHubI18n && window.SmartHubI18n.getCurrentLang ? window.SmartHubI18n.getCurrentLang() : 'en');
}