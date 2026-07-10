// js/hardwareTest.js
// ==================== HARDWARE TESTS PAGE (FULLY LOCALIZED + SUPABASE SYNC + THEME) ====================

// ---- Helper to get current language ----
function _getLang() {
    return window._activeLang
        || (window.SmartHubI18n && window.SmartHubI18n.getCurrentLang ? window.SmartHubI18n.getCurrentLang() : 'en');
}

// Central place to persist results to Supabase
async function persistHardwareResults(results, summary, deviceId) {
    try {
        const { saveHardwareTestResults } = await import('./hardware_sb.js');
        await saveHardwareTestResults(
            { results, summary, scanTime: new Date().toISOString() },
            deviceId
        );
        console.log('[HardwareTests] Saved to Supabase');
    } catch (e) {
        console.warn('[HardwareTests] Failed to save to Supabase:', e);
    }
}

const TEST_ICONS = {
    battery: 'fa-battery-three-quarters',
    storage: 'fa-hard-drive',
    sensors: 'fa-wave-square',
    display: 'fa-display',
    proximity: 'fa-ruler-combined',
    gyro: 'fa-compass',
    gps: 'fa-location-dot',
    fingerprint: 'fa-fingerprint',
    nfc: 'fa-wifi',
    microphone: 'fa-microphone',
    vibration: 'fa-mobile-screen-button',
    flashlight: 'fa-lightbulb',
    speaker: 'fa-volume-high',
    headphone: 'fa-headphones',
    touch: 'fa-hand-pointer',
    multitouch: 'fa-hand-sparkles',
    buttons: 'fa-table-cells',
    colorsweep: 'fa-palette',
    camerafront: 'fa-camera-rotate',
    camerarear: 'fa-camera',
    magnetometer: 'fa-magnet',
    barometer: 'fa-gauge',
    irblaster: 'fa-satellite-dish',
    faceunlock: 'fa-face-smile',
};

function iconFor(testId) {
    return TEST_ICONS[testId] || 'fa-microchip';
}

const STATUS_COLORS = {
    pending: '#6B7280',
    running: '#f59e0b',
    passed: '#2e7d32',
    failed: '#d32f2f',
    error: '#d32f2f',
};

async function renderHardwareTests() {
    // ========== GET THEME COLORS ==========
    const theme = window._activeTheme || JSON.parse(localStorage.getItem('smartHubSettings') || '{}');
    const textColor = theme.textColor || '#1f2937';
    const cardBg = theme.cardColor || '#ffffff';
    const btnColor = theme.buttonColor || theme.themeColor || '#0d6efd';
    const bgColor = theme.bgColor || '#ffffff';

    // ========== NO DEVICE ==========
    if (!currentDeviceId) {
        document.getElementById('pageContent').innerHTML = `
            <div class="card" data-i18n="hw.noDevice" style="background:${cardBg}; color:${textColor}; padding:20px; border-radius:12px;">
                ${t('hw.noDevice', _getLang())}
            </div>
        `;
        if (typeof applyLanguage === 'function') {
            const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
            applyLanguage(window._activeLang || savedLang);
        }
        return;
    }

    // ========== LOAD FROM SUPABASE ==========
    try {
        const { getCurrentUserId, getCurrentDeviceId } = await import('./sb-utils.js');
        const { fetchLatestHardwareTestResults } = await import('./hardware_sb.js');
        const userId = getCurrentUserId();
        const deviceId = getCurrentDeviceId() || window.currentDeviceId;
        if (userId && deviceId) {
            const supabaseResults = await fetchLatestHardwareTestResults(userId, deviceId);
            if (supabaseResults) {
                window._hardwareTestResults = supabaseResults.results || {};
                saveHardwareResults(supabaseResults.summary || null);
                console.log('[HardwareTests] Loaded from Supabase');
            }
        }
    } catch (e) {
        console.warn('[HardwareTests] Could not load from Supabase, using localStorage:', e);
    }

    // ========== ADB HELPERS ==========
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

    // ========== FEATURE DETECTION ==========
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

    // ========== MODAL SYSTEM ==========
    let modal, modalTitle, modalBody, yesBtn, noBtn, closeBtn;
    let currentResolver = null;

    function initModal() {
        modal = document.getElementById('hwTestModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'hwTestModal';
            modal.className = 'modal';
            modal.style.cssText = 'display:none; z-index:99997; background:rgba(0,0,0,0.6); backdrop-filter:blur(6px); align-items:center; justify-content:center;';
            modal.innerHTML = `
                <div class="modal-content acrylic" style="max-width: 480px; width: 90%; padding: 0; border-radius: 20px; box-shadow: 0 30px 80px rgba(0,0,0,0.4); overflow: hidden; background: ${cardBg};">
                    <div style="background: linear-gradient(135deg, #eef2ff 0%, #dbe4ff 100%); padding: 18px 24px 14px 24px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 26px;"><i class="fas fa-microscope" style="color:#4338ca;"></i></span>
                            <h3 id="hwModalTitle" data-i18n="hw.modal.title" style="margin: 0; font-size: 18px; font-weight: 700; color: #312e81;">${t('hw.modal.title', _getLang())}</h3>
                            <span class="close-button" id="hwCloseModalBtn" style="margin-left: auto; cursor: pointer; font-size: 26px; color: #4338ca; opacity: 0.7;">&times;</span>
                        </div>
                    </div>
                    <div class="modal-body" id="hwModalBody" style="padding: 24px; text-align: center; min-height: 150px; font-size: 14px; color: ${textColor}; line-height: 1.6; background: ${cardBg};"></div>
                    <div class="modal-footer" id="hwModalFooter" style="padding: 16px 24px 24px 24px; display: flex; gap: 12px; justify-content: center; background: ${cardBg};">
                        <button id="hwYesBtn" class="btn-primary" style="display: none; padding: 10px 24px; border-radius: 10px; font-weight: 600; background: ${btnColor}; color: ${textColor}; border: none;">${t('hw.modal.yes', _getLang())}</button>
                        <button id="hwNoBtn" class="btn-secondary" style="display: none; padding: 10px 24px; border-radius: 10px; font-weight: 600; background: transparent; border: 1px solid ${textColor}30; color: ${textColor};">${t('hw.modal.no', _getLang())}</button>
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
            const lang = _getLang();
            yesBtn.textContent = t('hw.modal.yes', lang);
            noBtn.textContent = t('hw.modal.no', lang);
            // Apply button colors again
            yesBtn.style.background = btnColor;
            yesBtn.style.color = textColor;
            noBtn.style.borderColor = textColor + '30';
            noBtn.style.color = textColor;

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

    // ========== TEST DEFINITIONS ==========
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
            <div class="test-card" id="card-${id}" data-status="pending" style="background: ${cardBg}; padding: 16px 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); display: flex; flex-direction: column; justify-content: space-between; border-left: 4px solid ${STATUS_COLORS.pending}; transition: border-color .2s ease, box-shadow .2s ease; color: ${textColor};">
                <div>
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px;">
                        <span style="width:32px; height:32px; flex-shrink:0; border-radius:9px; background:#eef2ff; color:#4338ca; display:flex; align-items:center; justify-content:center; font-size:14px;">
                            <i class="fas ${iconFor(id)}"></i>
                        </span>
                        <h3 style="margin: 0; font-size: 16px; color: ${textColor};" data-i18n="${def.titleKey}">${title}</h3>
                    </div>
                    <p style="margin: 0 0 12px 0; color: ${textColor}80; font-size: 13px;" data-i18n="${def.descKey}">${desc}</p>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                    <span class="status-text" data-i18n="hw.status.pending" style="font-weight: 600; color: ${STATUS_COLORS.pending}; font-size: 13px; padding: 3px 10px; border-radius: 999px; background: #f3f4f6;">${t('hw.status.pending', _getLang())}</span>
                    <button class="btn-secondary run-single-test" data-test="${id}" data-i18n="hw.btn.start" style="font-size: 12px; padding: 5px 16px; border-radius: 8px; background: transparent; border: 1px solid ${textColor}30; color: ${textColor}; cursor: pointer;">${t('hw.btn.start', _getLang())}</button>
                </div>
                <div class="result-message" style="font-size: 12px; color: ${textColor}80; margin-top: 6px; word-break: break-word; display: none;"></div>
            </div>
        `;
    }
    cardsHtml += `</div>`;

    const fullHtml = `
        <div style="background: ${bgColor}; padding: 4px 0;">
            <div class="info-card" style="text-align: center; margin-bottom: 24px; background: ${cardBg}; color: ${textColor}; padding: 20px; border-radius: 12px;">
                <div class="card-header"><i class="fas fa-microscope"></i> <span data-i18n="hw.page.title">${t('hw.page.title', _getLang())}</span></div>
                <div class="card-content">
                    <p data-i18n="hw.page.subtitle">${t('hw.page.subtitle', _getLang())}</p>
    <button id="startHwTestBtn" class="btn-primary" style="font-size: 16px; color: ${textColor} !important;" data-i18n="hw.btn.fullSuite">${t('hw.btn.fullSuite', _getLang())}</button>
            </div>
            ${cardsHtml}
            <div id="hwResults" style="display: none;">
                <div class="cards-container" id="hwCardsContainer"></div>
                <div id="hwSummaryCard" class="info-card" style="margin-top: 24px; background: ${cardBg}; color: ${textColor}; padding: 20px; border-radius: 12px;"></div>
            </div>
        </div>
    `;

    document.getElementById('pageContent').innerHTML = fullHtml;

// ---- APPLY LANGUAGE ----
if (typeof applyLanguage === 'function') {
    const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
    applyLanguage(window._activeLang || savedLang);
}

// ---- RE-APPLY THEME ----
if (window._activeTheme) {
    applyThemeColor(window._activeTheme);
}

// ---- 🆕 FORCE HARDWARE BUTTON TEXT COLOR ----
const hwBtn = document.getElementById('startHwTestBtn');
if (hwBtn) {
    hwBtn.style.setProperty('color', textColor, 'important');
}

    // ---- SET CARD STATUS (helper) ----
    function setCardStatus(card, status, label, message) {
        const statusSpan = card.querySelector('.status-text');
        const msgSpan = card.querySelector('.result-message');
        const color = STATUS_COLORS[status] || STATUS_COLORS.pending;
        card.dataset.status = status;
        card.style.borderLeftColor = color;
        statusSpan.style.color = color;
        statusSpan.style.background = status === 'passed' ? '#e8f5e9'
            : status === 'failed' || status === 'error' ? '#ffebee'
            : status === 'running' ? '#fff7ed'
            : '#f3f4f6';
        statusSpan.textContent = label;
        if (message !== undefined) {
            msgSpan.textContent = message || '';
            msgSpan.style.display = message ? 'block' : 'none';
            msgSpan.style.color = color;
        }
    }

    // ========== RESTORE SAVED RESULTS ==========
    const saved = loadHardwareResults();
    if (saved && saved.results) {
        window._hardwareTestResults = saved.results;
        Object.entries(saved.results).forEach(([id, r]) => {
            const card = document.getElementById(`card-${id}`);
            if (!card) return;
            const btn = card.querySelector('.run-single-test');
            // ✅ FIX: Use translation directly (already contains emoji) – no extra icon
            const label = r.passed ? t('hw.status.passed', _getLang()) : t('hw.status.failed', _getLang());
            setCardStatus(card, r.passed ? 'passed' : 'failed', label, r.message);
            if (btn) btn.textContent = r.passed ? t('hw.btn.rerun', _getLang()) : t('hw.btn.details', _getLang());
        });
        if (saved.summary) {
            renderSummary(saved.summary, Object.values(saved.results));
        }
    }

    // ========== RENDER SUMMARY ==========
    function renderSummary(summary, resultList) {
        const { total, passed, percentage } = summary;
        const summaryDiv = document.getElementById('hwSummaryCard');
        if (!summaryDiv) return;
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
                        <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 16px; font-weight: bold; color: ${textColor};">${percentage}%</span>
                    </div>
                    <div>
                        <h3 style="margin: 0; font-size: 20px; color: ${textColor};">${passed}/${total} ${t('hw.summary.testsPassed', _getLang())}</h3>
                        <p style="margin: 4px 0 0; color: ${textColor}80;">${percentage === 100 ? t('hw.summary.allPassed', _getLang()) : percentage >= 80 ? t('hw.summary.mostPassed', _getLang()) : t('hw.summary.multipleFailures', _getLang())}</p>
                    </div>
                </div>
                ${resultList ? `
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;">
                    ${resultList.map(r => `
                        <div style="background: ${r.passed ? '#e8f5e9' : '#ffebee'}; border-radius: 8px; padding: 10px 14px; display: flex; align-items: center; gap: 10px; border-left: 4px solid ${r.passed ? '#2e7d32' : '#d32f2f'};">
                            <span style="font-size: 20px;">${r.passed ? '✅' : '❌'}</span>
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: 600; font-size: 14px; color: ${textColor};">${escapeHtml(r.name)}</div>
                                <div style="font-size: 12px; color: ${textColor}80; word-break: break-word;">${escapeHtml(r.message)}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>` : ''}
            </div>
        `;
    }

    // ========== SINGLE TEST HANDLER ==========
    document.querySelectorAll('.run-single-test').forEach(btn => {
        btn.addEventListener('click', async function() {
            const testId = this.dataset.test;
            const card = document.getElementById(`card-${testId}`);
            const btnEl = card.querySelector('.run-single-test');
            const def = testDefs[testId];
            if (!def) return;

            btnEl.disabled = true;
            btnEl.textContent = t('hw.btn.running', _getLang());
            setCardStatus(card, 'running', t('hw.status.running', _getLang()), null);

            try {
                const result = await def.run();
                const status = result.passed ? 'passed' : 'failed';
                // ✅ FIX: Use translation directly (already contains emoji)
                const label = result.passed ? t('hw.status.passed', _getLang()) : t('hw.status.failed', _getLang());
                setCardStatus(card, status, label, result.message);
                btnEl.textContent = result.passed ? t('hw.btn.rerun', _getLang()) : t('hw.btn.details', _getLang());

                window._hardwareTestResults[testId] = { name: t(def.titleKey, _getLang()), passed: result.passed, message: result.message };
                saveHardwareResults(null);
                await persistHardwareResults(window._hardwareTestResults, null, currentDeviceId);
            } catch (err) {
                setCardStatus(card, 'error', t('hw.status.error', _getLang()), err.message);
                btnEl.textContent = t('hw.btn.retry', _getLang());

                window._hardwareTestResults[testId] = { name: t(def.titleKey, _getLang()), passed: false, message: err.message };
                saveHardwareResults(null);
                await persistHardwareResults(window._hardwareTestResults, null, currentDeviceId);
            } finally {
                btnEl.disabled = false;
            }
        });
    });

    // ========== FULL SUITE HANDLER ==========
    document.getElementById('startHwTestBtn').addEventListener('click', async function() {
        const resultsContainer = document.getElementById('hwResults');
        resultsContainer.style.display = 'block';
        const results = {};

        try {
            await launchAndroidApp();
        } catch (e) {
            alert(t('hw.alert.companionMissing', _getLang()));
        }

        for (const id of testIds) {
            const def = testDefs[id];
            const card = document.getElementById(`card-${id}`);
            const btn = card.querySelector('.run-single-test');
            btn.disabled = true;
            btn.textContent = t('hw.btn.running', _getLang());
            setCardStatus(card, 'running', t('hw.status.running', _getLang()), null);

            try {
                const result = await def.run();
                results[id] = { name: t(def.titleKey, _getLang()), passed: result.passed, message: result.message };
                // ✅ FIX: Use translation directly
                const label = result.passed ? t('hw.status.passed', _getLang()) : t('hw.status.failed', _getLang());
                setCardStatus(card, result.passed ? 'passed' : 'failed', label, result.message);
                btn.textContent = result.passed ? t('hw.btn.rerun', _getLang()) : t('hw.btn.details', _getLang());
            } catch (err) {
                results[id] = { name: t(def.titleKey, _getLang()), passed: false, message: err.message };
                setCardStatus(card, 'error', t('hw.status.error', _getLang()), err.message);
                btn.textContent = t('hw.btn.retry', _getLang());
            }
            btn.disabled = false;
            await new Promise(r => setTimeout(r, 500));
        }

        const passedCount = Object.values(results).filter(r => r.passed).length;
        const total = testIds.length;
        const percentage = Math.round((passedCount / total) * 100);
        const summary = { total, passed: passedCount, percentage };

        renderSummary(summary, Object.values(results));
        resultsContainer.scrollIntoView({ behavior: 'smooth' });

        window._hardwareTestResults = results;
        saveHardwareResults(summary);
        await persistHardwareResults(results, summary, currentDeviceId);
    });
}

// ---- EXPOSE GLOBALLY ----
window.renderHardwareTests = renderHardwareTests;