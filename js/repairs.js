// js/repairs.js – Repair Tools page (renderRepairs)

async function renderRepairs() {
    const container = document.getElementById('pageContent');

    // ---- Helper: run ADB command ----
    async function runAdb(command) {
        const response = await fetch(`${BACKEND_URL}/adb-shell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: currentDeviceId, command })
        });
        if (!response.ok) throw new Error(`ADB command failed: ${response.status}`);
        const data = await response.json();
        return data.output;
    }

    // ---- Helper: run Fastboot command ----
    async function runFastboot(command) {
        try {
            const response = await fetch(`${BACKEND_URL}/fastboot-shell`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId: currentDeviceId, command })
            });
            if (!response.ok) throw new Error(`Fastboot command failed: ${response.status}`);
            const data = await response.json();
            return data.output;
        } catch (e) {
            console.warn('Fastboot not implemented in backend – falling back to manual guide.');
            return null;
        }
    }

    // ---- Helper: show result modal ----
    function showResultModal(title, message, isSuccess = true) {
        const icon = isSuccess ? '✅' : '❌';
        const color = isSuccess ? '#16a34a' : '#dc2626';
        const modalHtml = `
            <div id="resultModal" class="modal" style="display: none; z-index: 99999; background: rgba(0,0,0,0.6); backdrop-filter: blur(6px); align-items: center; justify-content: center;">
                <div class="modal-content" style="max-width: 480px; padding: 0; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden; background: white;">
                    <div style="background: ${isSuccess ? '#f0fdf4' : '#fef2f2'}; padding: 16px 24px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 28px;">${icon}</span>
                            <div>
                                <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: ${color};">${title}</h3>
                            </div>
                            <button id="resultModalClose" style="margin-left: auto; background: transparent; border: none; font-size: 24px; color: #6B7280; cursor: pointer; padding: 0 8px;">&times;</button>
                        </div>
                    </div>
                    <div style="padding: 24px;">
                        <p style="margin: 0; font-size: 14px; color: #374151; white-space: pre-wrap; word-break: break-word;">${escapeHtml(message)}</p>
                        <button id="resultModalOkBtn" class="btn-primary" style="margin-top: 16px; padding: 8px 24px; border-radius: 8px; font-weight: 500; font-size: 14px; cursor: pointer; background: ${color}; border: none; color: white;">OK</button>
                    </div>
                </div>
            </div>
        `;
        const old = document.getElementById('resultModal');
        if (old) old.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('resultModal');
        modal.style.display = 'flex';
        const close = () => modal.style.display = 'none';
        document.getElementById('resultModalClose').addEventListener('click', close);
        document.getElementById('resultModalOkBtn').addEventListener('click', close);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    }

    // ---- Helper: show confirmation modal for dangerous actions ----
    function showDangerConfirm(title, message, callback) {
        const modalHtml = `
            <div id="dangerConfirmModal" class="modal" style="display: none; z-index: 99999; background: rgba(0,0,0,0.6); backdrop-filter: blur(6px); align-items: center; justify-content: center;">
                <div class="modal-content" style="max-width: 480px; padding: 0; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden; background: white;">
                    <div style="background: #fef2f2; padding: 16px 24px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 28px;">⚠️</span>
                            <div>
                                <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #dc2626;">${title}</h3>
                            </div>
                            <button id="dangerConfirmClose" style="margin-left: auto; background: transparent; border: none; font-size: 24px; color: #6B7280; cursor: pointer; padding: 0 8px;">&times;</button>
                        </div>
                    </div>
                    <div style="padding: 24px;">
                        <p style="margin: 0 0 16px 0; font-size: 14px; color: #374151; white-space: pre-wrap;">${escapeHtml(message)}</p>
                        <div style="display: flex; gap: 12px; justify-content: flex-end;">
                            <button id="dangerConfirmCancel" class="btn-secondary" style="padding: 8px 24px; border-radius: 8px; font-weight: 500; font-size: 14px; cursor: pointer; background: #f1f3f5; border: 1px solid #e5e7eb; color: #374151;">Cancel</button>
                            <button id="dangerConfirmOk" class="btn-primary" style="padding: 8px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; background: #dc2626; border: none; color: white;">Proceed</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        const old = document.getElementById('dangerConfirmModal');
        if (old) old.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('dangerConfirmModal');
        modal.style.display = 'flex';
        const close = () => modal.style.display = 'none';
        document.getElementById('dangerConfirmClose').addEventListener('click', close);
        document.getElementById('dangerConfirmCancel').addEventListener('click', close);
        document.getElementById('dangerConfirmOk').addEventListener('click', () => {
            close();
            if (typeof callback === 'function') callback();
        });
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    }

    // ---- Detect device (for auto-brand selection in Factory Reset) ----
    async function getDeviceBrand() {
        try {
            const resp = await fetch(`${BACKEND_URL}/api/device/info/${currentDeviceId}`);
            if (!resp.ok) return null;
            const data = await resp.json();
            return data['ro.product.manufacturer'] || null;
        } catch (e) {
            console.warn('Could not fetch manufacturer:', e);
            return null;
        }
    }

    const detectedBrand = currentDeviceId ? await getDeviceBrand() : null;

    // ---- Brand logo mapping (for Factory Reset modal) ----
    const brandLogoMap = {
        'alcatel': 'Alcatel-Logo.png',
        'asus': 'Asus-Logo.png',
        'blackberry': 'Blackberry-logo.png',
        'cat': 'CAT-logo.png',
        'doogee': 'Doogee-Logo.png',
        'energizer': 'Energizer-Logo.png',
        'google': 'Google-Logo.png',
        'htc': 'HTC-logo.png',
        'honor': 'Honor-Logo.png',
        'huawei': 'Huawei-Logo.png',
        'infinix': 'Infinix-Logo.png',
        'itel': 'Itel-Logo.png',
        'lg': 'LG-Logo.png',
        'lenovo': 'Lenovo-logo.png',
        'meizu': 'Meizu-Logo.png',
        'nokia': 'Nokia-Logo.png',
        'oneplus': 'OnePlus-Logo.png',
        'oppo': 'Oppo-logo.png',
        'realme': 'Realme-Logo.png',
        'samsung': 'Samsung-Logo-2.png',
        'sharp': 'Sharp-logo.png',
        'sony': 'Sony-logo.png',
        'tcl': 'TCL-Logo.png',
        'tecno': 'Tecno-Mobile-Logo.png',
        'ulefone': 'Ulefone-Logo.png',
        'vivo': 'Vivo-Logo.png',
        'vodafone': 'Vodafone-logo.png',
        'xiaomi': 'Xiaomi-logo.png',
        'zte': 'ZTE-Logo.png'
    };
    const supportedBrands = Object.keys(brandLogoMap).sort();

    // ---- Reset instructions (no bold) ----
    function getResetInstructions(brand) {
        const brandLower = brand.toLowerCase();
        const instructions = {
            samsung: {
                combo: 'Volume Up + Power',
                steps: [
                    'Power off the device.',
                    'Press and hold Volume Up and Power buttons simultaneously.',
                    'When the Samsung logo appears, release the Power button but keep holding Volume Up.',
                    'Use Volume keys to navigate to "Wipe data/factory reset".',
                    'Press Power to confirm.',
                    'Select "Yes" and wait for the reset to complete.',
                    'Select "Reboot system now".'
                ],
                note: 'If you see a warning about custom OS, it is safe to proceed.'
            },
            google: {
                combo: 'Volume Down + Power',
                steps: [
                    'Power off the device.',
                    'Press and hold Volume Down and Power buttons simultaneously.',
                    'When the bootloader menu appears, use Volume keys to select "Recovery mode".',
                    'Press Power to enter Recovery.',
                    'When the Android logo with an exclamation mark appears, press Power + Volume Up briefly.',
                    'Use Volume keys to select "Wipe data/factory reset".',
                    'Press Power to confirm.',
                    'Select "Reboot system now".'
                ],
                note: 'For Pixel devices, the key combo may be Volume Down + Power, then navigate to Recovery.'
            },
            oneplus: {
                combo: 'Volume Down + Power',
                steps: [
                    'Power off the device.',
                    'Press and hold Volume Down and Power buttons simultaneously.',
                    'When the OnePlus logo appears, release the Power button but keep holding Volume Down.',
                    'Use Volume keys to select "English" (if prompted).',
                    'Select "Wipe data and cache".',
                    'Confirm by selecting "Yes".',
                    'After wipe, select "Reboot".'
                ],
                note: 'For newer OnePlus models, you may need to enter Recovery mode first (Volume Down + Power).'
            },
            xiaomi: {
                combo: 'Volume Up + Power',
                steps: [
                    'Power off the device.',
                    'Press and hold Volume Up and Power buttons simultaneously.',
                    'When the Mi logo appears, release the Power button but keep holding Volume Up.',
                    'Use Volume keys to select "Wipe data".',
                    'Press Power to confirm.',
                    'Select "Wipe all data" and confirm.',
                    'Wait for the process to complete, then select "Reboot".'
                ],
                note: 'Some Xiaomi devices may use Volume Down + Power instead.'
            },
            huawei: {
                combo: 'Volume Up + Power',
                steps: [
                    'Power off the device.',
                    'Press and hold Volume Up and Power buttons simultaneously.',
                    'When the Huawei logo appears, release the Power button but keep holding Volume Up.',
                    'Use Volume keys to select "Wipe data/factory reset".',
                    'Press Power to confirm.',
                    'Select "Reset" and wait.',
                    'Select "Reboot" when done.'
                ],
                note: 'For some Huawei models, you may need to connect a USB cable during the process.'
            },
            lg: {
                combo: 'Volume Down + Power (release and press again)',
                steps: [
                    'Power off the device.',
                    'Press and hold Volume Down and Power buttons simultaneously.',
                    'When the LG logo appears, release the Power button for a second, then press it again (while still holding Volume Down).',
                    'A factory reset menu will appear. Use Volume keys to select "Yes".',
                    'Press Power to confirm.',
                    'Select "Yes" again to confirm.',
                    'Wait for reset, then select "Reboot".'
                ],
                note: 'This method works on most LG devices.'
            },
            motorola: {
                combo: 'Volume Down + Power',
                steps: [
                    'Power off the device.',
                    'Press and hold Volume Down and Power buttons simultaneously.',
                    'When the bootloader menu appears, use Volume keys to select "Recovery mode".',
                    'Press Power to enter Recovery.',
                    'When the Android logo appears, press Volume Up for 2 seconds, then release.',
                    'Use Volume keys to select "Wipe data/factory reset".',
                    'Press Power to confirm.',
                    'Select "Reboot system now".'
                ],
                note: 'For Moto devices, the recovery menu may look different.'
            },
            unknown: {
                combo: 'Volume Up + Power (or Volume Down + Power)',
                steps: [
                    'Power off the device.',
                    'Try pressing and holding either Volume Up + Power or Volume Down + Power.',
                    'If you see a menu, navigate to "Wipe data/factory reset".',
                    'Confirm and reboot.',
                    'If neither works, search online for your specific model\'s recovery key combination.'
                ],
                note: 'We couldn\'t detect your brand automatically. Try both combinations.'
            }
        };
        return instructions[brandLower] || instructions.unknown;
    }

    // ---- Legal disclaimer modal ----
    function showLegalDisclaimer(action, callback) {
        const modalHtml = `
            <div id="legalDisclaimerModal" class="modal" style="display: none; z-index: 99999; background: rgba(0,0,0,0.6); backdrop-filter: blur(6px); align-items: center; justify-content: center;">
                <div class="modal-content acrylic" style="max-width: 480px; padding: 0; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden;">
                    <div style="background: #fef3c7; padding: 16px 24px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 28px;">⚠️</span>
                            <div>
                                <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #92400e;">Legal Disclaimer</h3>
                                <p style="margin: 2px 0 0 0; font-size: 13px; color: #78350f;">Please read before proceeding</p>
                            </div>
                            <button id="legalDisclaimerClose" style="margin-left: auto; background: transparent; border: none; font-size: 24px; color: #78350f; cursor: pointer; padding: 0 8px;">&times;</button>
                        </div>
                    </div>
                    <div style="padding: 24px 24px 20px 24px;">
                        <p style="font-size: 14px; color: #1e293b; line-height: 1.6; margin: 0 0 16px 0;">
                            This tool is intended <strong>only for legitimate device recovery</strong> by the rightful owner.
                            Unauthorized use to bypass security on devices you do not own is illegal and unethical.
                        </p>
                        <p style="font-size: 13px; color: #6B7280; margin: 0 0 20px 0;">
                            By proceeding, you confirm that you are the owner of this device or have explicit authorization from the owner.
                        </p>
                        <div style="display: flex; gap: 12px; justify-content: flex-end;">
                            <button id="legalCancelBtn" class="btn-secondary" style="padding: 8px 24px; border-radius: 8px; font-weight: 500; font-size: 14px; cursor: pointer;">Cancel</button>
                            <button id="legalAcceptBtn" class="btn-primary" style="padding: 8px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; background: #0d6efd;">I Understand</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        const old = document.getElementById('legalDisclaimerModal');
        if (old) old.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('legalDisclaimerModal');
        modal.style.display = 'flex';
        const closeModal = (accepted) => {
            modal.style.display = 'none';
            if (accepted && typeof callback === 'function') callback();
        };
        document.getElementById('legalAcceptBtn').addEventListener('click', () => closeModal(true));
        document.getElementById('legalCancelBtn').addEventListener('click', () => closeModal(false));
        document.getElementById('legalDisclaimerClose').addEventListener('click', () => closeModal(false));
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(false); });
    }

    // ---- Factory Reset Modal (guide) ----
    function showFactoryResetModal() {
        let modal = document.getElementById('factoryResetModal');
        if (!modal) {
            const modalHtml = `
                <div id="factoryResetModal" class="modal" style="display: none; z-index: 99999; background: rgba(0,0,0,0.6); backdrop-filter: blur(6px); align-items: center; justify-content: center;">
                    <div class="modal-content" style="max-width: 700px; max-height: 85vh; display: flex; flex-direction: column; padding: 0; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3); background: #ffffff;">
                        <div class="modal-header" style="padding: 16px 24px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
                            <h3 id="factoryResetModalTitle" style="margin: 0; font-size: 18px; font-weight: 600; color: #1f2937;">🗑️ Factory Reset – Select Your Brand</h3>
                            <span class="close-button" id="closeFactoryResetModal" style="cursor: pointer; font-size: 24px; color: #9ca3af; line-height: 1; padding: 0 4px;">&times;</span>
                        </div>
                        <div id="factoryResetModalBody" class="modal-body" style="flex: 1; overflow-y: auto; padding: 20px 24px; background: #ffffff;"></div>
                        <div class="modal-footer" style="padding: 12px 24px; background: #f8fafc; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; flex-shrink: 0;">
                            <button id="closeFactoryResetModalBtn" class="btn-secondary" style="padding: 8px 24px; border-radius: 8px; font-weight: 500; font-size: 14px; cursor: pointer; background: #f1f3f5; border: 1px solid #e5e7eb; color: #374151;">Close</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modal = document.getElementById('factoryResetModal');
            document.getElementById('closeFactoryResetModal').addEventListener('click', () => modal.style.display = 'none');
            document.getElementById('closeFactoryResetModalBtn').addEventListener('click', () => modal.style.display = 'none');
            window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
        }
        const bodyEl = document.getElementById('factoryResetModalBody');
        const titleEl = document.getElementById('factoryResetModalTitle');

        function showBrandGrid() {
            titleEl.textContent = '🗑️ Factory Reset – Select Your Brand';
            let html = `
                <p style="color: #6B7280; margin-bottom: 16px;">Choose your device brand to view the factory reset guide.</p>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px;">
            `;
            for (const brand of supportedBrands) {
                const logoFile = brandLogoMap[brand];
                const displayName = brand.charAt(0).toUpperCase() + brand.slice(1);
                html += `
                    <div class="brand-card" data-brand="${brand}" style="
                        background: white;
                        border: 2px solid #e5e7eb;
                        border-radius: 12px;
                        padding: 16px 8px;
                        text-align: center;
                        cursor: pointer;
                        transition: all 0.15s ease;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
                    " onmouseover="this.style.borderColor='#0d6efd'; this.style.boxShadow='0 4px 12px rgba(13,110,253,0.15)'" onmouseout="this.style.borderColor='#e5e7eb'; this.style.boxShadow='none'">
                        <img src="../android_logo/${logoFile}" alt="${displayName}" style="height: 48px; max-width: 80px; object-fit: contain; margin-bottom: 8px;">
                        <div style="font-size: 13px; font-weight: 500; color: #1f2937;">${displayName}</div>
                    </div>
                `;
            }
            html += `</div>`;
            bodyEl.innerHTML = html;
            document.querySelectorAll('.brand-card').forEach(card => {
                card.addEventListener('click', function() {
                    const brand = this.dataset.brand;
                    showGuideForBrand(brand);
                });
            });
        }

        function showGuideForBrand(brand) {
            const resetInfo = getResetInstructions(brand);
            const displayName = brand.charAt(0).toUpperCase() + brand.slice(1);
            const combo = resetInfo.combo;
            const steps = resetInfo.steps.map((s, i) => `${i+1}. ${s}`).join('<br>');
            const note = resetInfo.note || '';
            const logoFile = brandLogoMap[brand];
            let logoHtml = logoFile ? `<img src="../android_logo/${logoFile}" alt="${displayName}" style="height: 40px; max-width: 120px; object-fit: contain; margin-right: 12px;">` : '';

            titleEl.textContent = `🗑️ Factory Reset – ${displayName}`;
            bodyEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; flex-wrap:wrap;">
                    ${logoHtml}
                    <div>
                        <strong style="font-size: 18px;">${displayName}</strong>
                        <span style="font-size: 13px; color: #6B7280; margin-left: 8px;">— Factory Reset Guide</span>
                    </div>
                </div>
                <p style="margin: 4px 0 12px; font-size: 14px; color: #374151;">
                    <strong>Key combination:</strong> ${combo}
                </p>
                <div style="font-size: 14px; color: #374151; line-height: 1.8; background: #f8fafc; padding: 12px 16px; border-radius: 8px;">
                    ${steps}
                </div>
                ${note ? `<p style="margin: 12px 0 0; font-size: 13px; color: #6B7280;">ℹ️ ${note}</p>` : ''}
                <div style="margin-top: 16px; padding: 10px 14px; background: #fef3c7; border-radius: 6px; font-size: 13px; color: #92400e;">
                    ⚠️ This will erase all data and may trigger Factory Reset Protection (FRP). Have your Google account ready.
                </div>
                <div style="margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap;">
                    <button id="copyResetGuideBtn" class="btn-secondary" style="padding: 6px 18px; font-size: 13px; border-radius: 8px;">📋 Copy Instructions</button>
                    <button id="backToBrandsBtn" class="btn-secondary" style="padding: 6px 18px; font-size: 13px; border-radius: 8px;">⬅️ Back to Brands</button>
                </div>
            `;
            document.getElementById('copyResetGuideBtn')?.addEventListener('click', function() {
                const text = `Factory Reset for ${displayName}:\n\nKey combo: ${combo}\n\nSteps:\n${steps.replace(/<br>/g, '\n')}`;
                navigator.clipboard.writeText(text).then(() => {
                    this.textContent = '✅ Copied!';
                    setTimeout(() => { this.textContent = '📋 Copy Instructions'; }, 2000);
                });
            });
            document.getElementById('backToBrandsBtn')?.addEventListener('click', showBrandGrid);
        }
        showBrandGrid();
        modal.style.display = 'flex';
    }

    // ---- Get Android SDK version ----
    async function getAndroidVersion() {
        try {
            const output = await runAdb('shell getprop ro.build.version.sdk');
            const sdk = parseInt(output.trim(), 10);
            return isNaN(sdk) ? null : sdk;
        } catch { return null; }
    }

    // ---- Internal FRP deactivation with version awareness ----
    async function deactivateFrpInternal(silent = false) {
        const sdk = await getAndroidVersion();
        const version = sdk || 0;
        const result = {
            success: false,
            version: version,
            commands: []
        };

        // Pre-check: Are there any Google accounts?
        try {
            const accounts = await runAdb('shell dumpsys account');
            if (!accounts.includes('com.google')) {
                result.success = true;
                result.commands.push({ cmd: 'precheck', status: '✅ No Google accounts found; FRP already removed.' });
                return result;
            }
        } catch (e) { /* ignore */ }

        // Build command list based on SDK
        let commands = [];

        // Base commands for all versions
        const baseCommands = [
            'pm clear com.google.android.gsf',
            'pm clear com.google.android.gms',
            'content delete --uri content://settings/secure --bind name:s:frp_credential_handle',
            'content delete --uri content://settings/secure --bind name:s:frp_credential_handle_signature',
            'content delete --uri content://settings/secure --bind name:s:frp_credential_handle_signature_sha256',
            'content delete --uri content://settings/secure --bind name:s:frp_credential_handle_sha256',
            'locksettings clear --old 0',
        ];

        // Version-specific commands
        if (version >= 26 && version <= 30) { // Android 8-11
            commands.push(
                'settings delete secure frp_credential_handle',
                'settings delete global frp_credential_handle'
            );
        } else if (version >= 31 && version <= 33) { // Android 12-13
            commands.push(
                'settings delete secure frp_credential_handle',
                'settings delete global frp_credential_handle',
                'cmd account remove-account com.google'
            );
        } else if (version >= 34) { // Android 14-15
            commands.push(
                'settings delete secure frp_credential_handle',
                'settings delete global frp_credential_handle',
                'cmd account remove-account com.google',
                'dumpsys account --remove-all'
            );
        } else {
            // Fallback for older/unknown: try all known variants
            commands.push(
                'settings delete secure frp_credential_handle',
                'settings delete global frp_credential_handle',
                'content delete --uri content://settings/secure --bind name:s:frp_credential_handle',
                'content delete --uri content://settings/global --bind name:s:frp_credential_handle'
            );
        }

        // Broadcast to trigger account cleanup
        commands.push('am broadcast -a android.intent.action.USER_UNLOCKED');

        const allCommands = [...baseCommands, ...commands];
        let successCount = 0;

        for (const cmd of allCommands) {
            try {
                const output = await runAdb(`shell ${cmd}`);
                const status = (output && output.includes('Error')) ? '❌ Failed' : '✅ Succeeded';
                result.commands.push({ cmd, status });
                if (status === '✅ Succeeded') successCount++;
            } catch (e) {
                result.commands.push({ cmd, status: `❌ Error: ${e.message}` });
            }
        }

        // Final check: are there still accounts?
        try {
            const accounts = await runAdb('shell dumpsys account');
            const hasGoogle = accounts.includes('com.google');
            result.success = (!hasGoogle && successCount > 0) || (successCount > 2);
            if (!hasGoogle) {
                result.success = true;
            }
        } catch (e) {
            result.success = successCount > 0;
        }

        return result;
    }

    // ---- Public Deactivate FRP (with UI feedback) ----
    async function deactivateFrp() {
        const resultDiv = document.getElementById('frpResult');
        resultDiv.innerHTML = '⏳ Deactivating FRP... (detecting Android version)';

        const result = await deactivateFrpInternal(false);
        const version = result.version || 'unknown';
        let html = `
            <div style="margin-top:8px; padding:12px; border-radius:6px; border-left:4px solid ${result.success ? '#16a34a' : '#dc2626'}; background: ${result.success ? '#f0fdf4' : '#fef2f2'};">
                <strong>${result.success ? '✅' : '❌'} ${result.success ? 'FRP deactivated' : 'FRP deactivation incomplete'}</strong>
                <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">
                    Android SDK: ${version} &nbsp;|&nbsp; Commands attempted: ${result.commands.length}
                </p>
                <div style="margin-top:6px; max-height:200px; overflow-y:auto; font-size:12px; background:rgba(0,0,0,0.03); padding:6px; border-radius:4px;">
                    ${result.commands.map(c => `<div>${c.status} – ${c.cmd}</div>`).join('')}
                </div>
                ${result.success ? '<p style="margin:4px 0 0; font-size:12px; color:#92400e;">Reboot the device to apply changes.</p>' : '<p style="margin:4px 0 0; font-size:12px; color:#92400e;">Try the manual guide below.</p>'}
            </div>
        `;
        resultDiv.innerHTML = html;
    }

    // ---- Combined FRP deactivation + Factory Reset ----
    async function performFullResetWithFrpRemoval() {
        const resultDiv = document.getElementById('factoryResetResult');
        if (!resultDiv) {
            const card = document.querySelector('.card:has(#factoryResetModalBtn)');
            if (card) {
                const div = document.createElement('div');
                div.id = 'factoryResetResult';
                div.style.marginTop = '12px';
                div.style.fontSize = '13px';
                card.appendChild(div);
            }
        }
        const resultEl = document.getElementById('factoryResetResult');
        if (resultEl) resultEl.innerHTML = '⏳ Removing FRP and accounts...';

        const result = await deactivateFrpInternal(true);
        if (!result.success) {
            if (resultEl) {
                resultEl.innerHTML = `
                    <div style="margin-top:8px; padding:12px; background:#fef2f2; border-radius:6px; border-left:4px solid #dc2626;">
                        <strong>❌ FRP removal failed</strong>
                        <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">
                            Cannot proceed with factory reset because FRP could not be removed.
                            Please try using the "Deactivate FRP" button manually first.
                        </p>
                        <div style="margin-top:6px; max-height:150px; overflow-y:auto; font-size:12px; background:rgba(0,0,0,0.03); padding:6px; border-radius:4px;">
                            ${result.commands.map(c => `<div>${c.status} – ${c.cmd}</div>`).join('')}
                        </div>
                    </div>
                `;
            }
            return;
        }

        if (resultEl) resultEl.innerHTML = '⏳ Sending factory reset command...';

        try {
            const writeCmd = `echo '--wipe_data' > /cache/recovery/command`;
            await runAdb(`shell ${writeCmd}`);
            if (resultEl) resultEl.innerHTML = '⏳ Rebooting to recovery...';
            await runAdb('reboot recovery');
            if (resultEl) {
                resultEl.innerHTML = `
                    <div style="margin-top:8px; padding:12px; background:#f0fdf4; border-radius:6px; border-left:4px solid #16a34a;">
                        <strong>✅ FRP removed and reset triggered</strong>
                        <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">
                            The device is now rebooting into recovery mode and will perform a factory reset automatically.
                            FRP has been cleared.
                        </p>
                    </div>
                `;
            }
        } catch (err) {
            if (resultEl) {
                resultEl.innerHTML = `
                    <div style="margin-top:8px; padding:12px; background:#fef2f2; border-radius:6px; border-left:4px solid #dc2626;">
                        <strong>❌ Reset failed</strong>
                        <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">${escapeHtml(err.message)}</p>
                        <p style="margin:4px 0 0; font-size:12px; color:#92400e;">FRP was removed but reset failed. Try manual guide.</p>
                    </div>
                `;
            }
        }
    }

    // ---- ADB Factory Reset with Confirmation (captcha) ----
    function showAdbFactoryResetModal() {
        const modalId = 'adbFactoryResetModal';
        const existing = document.getElementById(modalId);
        if (existing) existing.remove();

        const modalHtml = `
            <div id="${modalId}" class="modal" style="display: none; z-index: 99999; background: rgba(0,0,0,0.7); backdrop-filter: blur(6px); align-items: center; justify-content: center;">
                <div class="modal-content" style="max-width: 480px; padding: 0; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden; background: #ffffff;">
                    <div style="background: #dc2626; padding: 16px 24px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 28px;">⚠️</span>
                            <div>
                                <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: white;">Factory Reset via ADB</h3>
                                <p style="margin: 2px 0 0 0; font-size: 13px; color: #fca5a5;">This action is irreversible</p>
                            </div>
                            <button id="adbResetModalClose" style="margin-left: auto; background: transparent; border: none; font-size: 24px; color: white; cursor: pointer; padding: 0 8px;">&times;</button>
                        </div>
                    </div>
                    <div style="padding: 24px;">
                        <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px;">
                            <p style="margin: 0; font-size: 14px; color: #991b1b; font-weight: 500;">
                                ⚠️ This will erase <strong>ALL</strong> data and <strong>automatically remove FRP</strong> before wiping.
                                You will need your Google account credentials to set up the device again.
                            </p>
                        </div>
                        <div style="background: #fef9c3; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px;">
                            <p style="margin: 0; font-size: 13px; color: #92400e;">
                                To confirm, type <strong>CONFIRM</strong> in the box below.
                            </p>
                        </div>
                        <div style="margin-bottom: 16px;">
                            <label for="confirmInput" style="font-size: 14px; font-weight: 500; color: #1f2937;">Type "CONFIRM" to proceed</label>
                            <input type="text" id="confirmInput" placeholder="CONFIRM" style="
                                width: 100%;
                                padding: 10px 12px;
                                border: 2px solid #d1d5db;
                                border-radius: 8px;
                                font-size: 14px;
                                margin-top: 4px;
                                transition: border-color 0.2s;
                            " autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false">
                            <div id="confirmError" style="color: #dc2626; font-size: 12px; margin-top: 4px; display: none;">Please type CONFIRM exactly.</div>
                        </div>
                        <div style="display: flex; gap: 12px; justify-content: flex-end;">
                            <button id="adbResetCancel" class="btn-secondary" style="padding: 8px 24px; border-radius: 8px; font-weight: 500; font-size: 14px; cursor: pointer; background: #f1f3f5; border: 1px solid #e5e7eb; color: #374151;">Cancel</button>
                            <button id="adbResetProceed" class="btn-primary" style="padding: 8px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; background: #dc2626; border: none; color: white; opacity: 0.5; pointer-events: none;">Proceed</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById(modalId);
        modal.style.display = 'flex';

        const input = document.getElementById('confirmInput');
        const proceedBtn = document.getElementById('adbResetProceed');
        const errorDiv = document.getElementById('confirmError');
        const closeModal = () => modal.style.display = 'none';

        document.getElementById('adbResetModalClose').addEventListener('click', closeModal);
        document.getElementById('adbResetCancel').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        input.addEventListener('input', function() {
            const val = this.value.trim();
            if (val.toUpperCase() === 'CONFIRM') {
                proceedBtn.style.opacity = '1';
                proceedBtn.style.pointerEvents = 'auto';
                errorDiv.style.display = 'none';
            } else {
                proceedBtn.style.opacity = '0.5';
                proceedBtn.style.pointerEvents = 'none';
                errorDiv.style.display = 'block';
                errorDiv.textContent = 'Please type CONFIRM exactly.';
            }
        });

        proceedBtn.addEventListener('click', function() {
            if (input.value.trim().toUpperCase() === 'CONFIRM') {
                closeModal();
                performFullResetWithFrpRemoval();
            }
        });
    }

    // ---- NEW: Disable Bloatware ----
    function showBloatwareModal() {
        const modalId = 'bloatwareModal';
        const existing = document.getElementById(modalId);
        if (existing) existing.remove();

        // Common bloatware packages (add more as needed)
        const packages = [
            { name: 'Facebook', pkg: 'com.facebook.katana' },
            { name: 'Facebook Messenger', pkg: 'com.facebook.orca' },
            { name: 'Instagram', pkg: 'com.instagram.android' },
            { name: 'TikTok', pkg: 'com.zhiliaoapp.musically' },
            { name: 'LinkedIn', pkg: 'com.linkedin.android' },
            { name: 'Snapchat', pkg: 'com.snapchat.android' },
            { name: 'Twitter', pkg: 'com.twitter.android' },
            { name: 'Chrome', pkg: 'com.android.chrome' },
            { name: 'Google Photos', pkg: 'com.google.android.apps.photos' },
            { name: 'Google Drive', pkg: 'com.google.android.apps.docs' },
            { name: 'YouTube', pkg: 'com.google.android.youtube' },
            { name: 'Play Movies', pkg: 'com.google.android.videos' },
            { name: 'Play Music', pkg: 'com.google.android.music' },
            { name: 'Duo', pkg: 'com.google.android.apps.tachyon' },
            { name: 'Gmail', pkg: 'com.google.android.gm' },
        ];

        let checkboxes = packages.map(p => `
            <div style="display:flex; align-items:center; gap:8px; padding:4px 0;">
                <input type="checkbox" id="pkg_${p.pkg}" value="${p.pkg}" style="width:16px; height:16px;">
                <label for="pkg_${p.pkg}" style="font-size:13px;">${p.name} <span style="color:#6B7280; font-size:11px;">(${p.pkg})</span></label>
            </div>
        `).join('');

        const modalHtml = `
            <div id="${modalId}" class="modal" style="display: none; z-index: 99999; background: rgba(0,0,0,0.6); backdrop-filter: blur(6px); align-items: center; justify-content: center;">
                <div class="modal-content" style="max-width: 480px; padding: 0; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden; background: #ffffff;">
                    <div style="background: #0d6efd; padding: 16px 24px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 28px;">📦</span>
                            <div>
                                <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: white;">Disable Bloatware</h3>
                                <p style="margin: 2px 0 0 0; font-size: 13px; color: #b0d4ff;">Select apps to disable (user‑only)</p>
                            </div>
                            <button id="bloatwareModalClose" style="margin-left: auto; background: transparent; border: none; font-size: 24px; color: white; cursor: pointer; padding: 0 8px;">&times;</button>
                        </div>
                    </div>
                    <div style="padding: 24px; max-height: 400px; overflow-y: auto;">
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            ${checkboxes}
                        </div>
                        <div style="margin-top:12px; font-size:12px; color:#6B7280;">
                            <label><input type="checkbox" id="selectAllBloatware"> Select All</label>
                        </div>
                    </div>
                    <div style="padding: 12px 24px; background: #f8fafc; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; gap: 12px;">
                        <button id="bloatwareCancel" class="btn-secondary" style="padding: 8px 24px; border-radius: 8px; font-weight: 500; font-size: 14px; cursor: pointer; background: #f1f3f5; border: 1px solid #e5e7eb; color: #374151;">Cancel</button>
                        <button id="bloatwareDisable" class="btn-primary" style="padding: 8px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; background: #dc2626; border: none; color: white;">Disable Selected</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById(modalId);
        modal.style.display = 'flex';

        const closeModal = () => modal.style.display = 'none';
        document.getElementById('bloatwareModalClose').addEventListener('click', closeModal);
        document.getElementById('bloatwareCancel').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        // Select All
        document.getElementById('selectAllBloatware').addEventListener('change', function() {
            const checkboxes = modal.querySelectorAll('input[type="checkbox"][value]');
            checkboxes.forEach(cb => cb.checked = this.checked);
        });

        // Disable
        document.getElementById('bloatwareDisable').addEventListener('click', async function() {
            const checked = modal.querySelectorAll('input[type="checkbox"][value]:checked');
            if (checked.length === 0) {
                alert('Please select at least one app to disable.');
                return;
            }
            const packages = Array.from(checked).map(cb => cb.value);
            closeModal();

            // Show progress in the result div
            const resultDiv = document.getElementById('bloatwareResult');
            resultDiv.innerHTML = '⏳ Disabling selected apps...';

            let results = [];
            for (const pkg of packages) {
                try {
                    const output = await runAdb(`shell pm disable-user --user 0 ${pkg}`);
                    const status = output.includes('new state: disabled-user') ? '✅ Disabled' : '⚠️ ' + output.trim();
                    results.push({ pkg, status });
                } catch (e) {
                    results.push({ pkg, status: '❌ Error: ' + e.message });
                }
            }

            const success = results.filter(r => r.status.includes('✅')).length;
            const html = `
                <div style="margin-top:8px; padding:12px; border-radius:6px; border-left:4px solid ${success > 0 ? '#16a34a' : '#dc2626'}; background: ${success > 0 ? '#f0fdf4' : '#fef2f2'};">
                    <strong>${success > 0 ? '✅' : '❌'} ${success > 0 ? `${success} app(s) disabled` : 'No apps disabled'}</strong>
                    <div style="margin-top:6px; max-height:200px; overflow-y:auto; font-size:12px; background:rgba(0,0,0,0.03); padding:6px; border-radius:4px;">
                        ${results.map(r => `<div>${r.status} – ${r.pkg}</div>`).join('')}
                    </div>
                </div>
            `;
            resultDiv.innerHTML = html;
        });
    }

    // ---- NEW: Clear Cache ----
    async function clearCache() {
        const resultDiv = document.getElementById('cacheResult');
        resultDiv.innerHTML = '⏳ Clearing cache...';

        try {
            // First try to trim caches (safe method)
            const output = await runAdb('shell pm trim-caches 9999999999');
            // Also clear app cache for all packages
            const apps = await runAdb('shell pm list packages');
            const packages = apps.split('\n').map(line => line.replace('package:', '').trim()).filter(Boolean);
            let cleared = 0;
            for (const pkg of packages.slice(0, 50)) { // limit to 50 to avoid timeout
                try {
                    await runAdb(`shell pm clear --cache-only ${pkg}`);
                    cleared++;
                } catch (e) { /* ignore */ }
            }
            resultDiv.innerHTML = `
                <div style="margin-top:8px; padding:12px; background:#f0fdf4; border-radius:6px; border-left:4px solid #16a34a;">
                    <strong>✅ Cache cleared</strong>
                    <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">
                        Trimmed caches and cleared cache for ${cleared} apps.
                    </p>
                </div>
            `;
        } catch (err) {
            resultDiv.innerHTML = `
                <div style="margin-top:8px; padding:12px; background:#fef2f2; border-radius:6px; border-left:4px solid #dc2626;">
                    <strong>❌ Clear cache failed</strong>
                    <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">${escapeHtml(err.message)}</p>
                    <p style="margin:4px 0 0; font-size:12px; color:#92400e;">Try using the manual guide below.</p>
                </div>
            `;
        }
    }

    // ---- NEW: Reboot to Recovery / Download ----
    async function rebootToRecovery() {
        const resultDiv = document.getElementById('rebootResult');
        resultDiv.innerHTML = '⏳ Rebooting to Recovery...';
        try {
            await runAdb('reboot recovery');
            resultDiv.innerHTML = `
                <div style="margin-top:8px; padding:12px; background:#f0fdf4; border-radius:6px; border-left:4px solid #16a34a;">
                    <strong>✅ Reboot to Recovery sent</strong>
                    <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">The device should now boot into Recovery mode.</p>
                </div>
            `;
        } catch (err) {
            resultDiv.innerHTML = `
                <div style="margin-top:8px; padding:12px; background:#fef2f2; border-radius:6px; border-left:4px solid #dc2626;">
                    <strong>❌ Failed to reboot</strong>
                    <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">${escapeHtml(err.message)}</p>
                </div>
            `;
        }
    }

    async function rebootToDownload() {
        const resultDiv = document.getElementById('rebootResult');
        resultDiv.innerHTML = '⏳ Rebooting to Download mode...';
        try {
            await runAdb('reboot download');
            resultDiv.innerHTML = `
                <div style="margin-top:8px; padding:12px; background:#f0fdf4; border-radius:6px; border-left:4px solid #16a34a;">
                    <strong>✅ Reboot to Download sent</strong>
                    <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">The device should now boot into Download mode (Samsung).</p>
                </div>
            `;
        } catch (err) {
            resultDiv.innerHTML = `
                <div style="margin-top:8px; padding:12px; background:#fef2f2; border-radius:6px; border-left:4px solid #dc2626;">
                    <strong>❌ Failed to reboot</strong>
                    <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">${escapeHtml(err.message)}</p>
                </div>
            `;
        }
    }

    // ---- Build main UI ----
    let deviceCheckHtml = '';
    if (!currentDeviceId) {
        deviceCheckHtml = `
            <div style="margin-bottom:16px; padding:12px 16px; background:#fef3c7; border-radius:8px; border-left:4px solid #f59e0b; font-size:13px; color:#92400e;">
                ⚠️ No device connected. Some features require ADB, but guides are always available.
            </div>
        `;
    }

    const html = `
        <div style="margin-bottom:24px;">
            <h1 style="margin-bottom:6px; font-size:24px; font-weight:700; color:#1f2937;">🔧 Repair Tools</h1>
            <p style="color:#6b7280; font-size:14px; margin:0;">Recovery and maintenance operations – practical guides & automation.</p>
            <div style="margin-top:8px; padding:8px 12px; background:#fef3c7; border-radius:6px; border-left:4px solid #f59e0b; font-size:13px; color:#92400e;">
                ⚠️ These actions can erase data or void warranties. Proceed with caution.
            </div>
            ${deviceCheckHtml}
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">

            <!-- FRP Card -->
            <div class="card" style="padding:20px;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <span style="font-size:28px;">🚫</span>
                    <h3 style="margin:0; font-size:17px; font-weight:600;">FRP Bypass</h3>
                </div>
                <p style="color:#6B7280; font-size:14px;">Remove Google accounts and deactivate Factory Reset Protection.</p>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <button id="frpDeactivateBtn" class="btn-primary" style="width:100%; padding:6px; border-radius:8px; font-size:13px; background:#dc2626;" ${!currentDeviceId ? 'disabled style="opacity:0.5;"' : ''}>
                        🔓 Deactivate FRP <span style="font-size:11px; color:${!currentDeviceId ? '#fca5a5' : '#fca5a5'};">(ADB required)</span>
                    </button>
                    <button id="frpGuideBtn" class="btn-secondary" style="width:100%; padding:6px; border-radius:8px; font-size:13px;">
                        📋 Guide (no ADB) <span style="font-size:11px; color:#6B7280;">(no ADB)</span>
                    </button>
                </div>
                <div id="frpResult" style="margin-top:8px; font-size:13px;"></div>
            </div>

            <!-- Retrieve Email Card -->
            <div class="card" style="padding:20px;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <span style="font-size:28px;">📧</span>
                    <h3 style="margin:0; font-size:17px; font-weight:600;">Retrieve Email</h3>
                </div>
                <p style="color:#6B7280; font-size:14px;">Recover Google account email – use web guide or ADB retrieval.</p>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <button id="retrieveEmailGuideBtn" class="btn-secondary" style="width:100%; padding:8px; border-radius:8px; font-size:13px;">
                        📋 Show Guide <span style="font-size:11px; color:#6B7280;">(no ADB)</span>
                    </button>
                    <button id="retrieveEmailAdbBtn" class="btn-primary" style="width:100%; padding:8px; border-radius:8px; font-size:13px; background:#0d6efd;" ${!currentDeviceId ? 'disabled style="opacity:0.5;"' : ''}>
                        🔌 Retrieve via ADB <span style="font-size:11px; color:${!currentDeviceId ? '#9ca3af' : '#b0d4ff'};">(ADB required)</span>
                    </button>
                </div>
                <div id="emailResult" style="margin-top:8px; font-size:13px;"></div>
            </div>

            <!-- Factory Reset Card -->
            <div class="card" style="padding:20px; border-left:4px solid #dc2626;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <span style="font-size:28px;">🗑️</span>
                    <h3 style="margin:0; font-size:17px; font-weight:600;">Factory Reset</h3>
                </div>
                <p style="color:#6B7280; font-size:14px;">Wipe all data – FRP will be removed automatically before reset.</p>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <button id="factoryResetModalBtn" class="btn-secondary" style="width:100%; padding:6px; border-radius:8px; font-size:13px;">
                        📋 Show Reset Guide <span style="font-size:11px; color:#6B7280;">(no ADB)</span>
                    </button>
                    <button id="adbFactoryResetBtn" class="btn-primary" style="width:100%; padding:6px; border-radius:8px; font-size:13px; background:#dc2626;" ${!currentDeviceId ? 'disabled style="opacity:0.5;"' : ''}>
                        🔧 Factory Reset via ADB <span style="font-size:11px; color:${!currentDeviceId ? '#fca5a5' : '#fca5a5'};">(ADB required)</span>
                    </button>
                </div>
                <div id="factoryResetResult" style="margin-top:8px; font-size:13px;"></div>
            </div>

            <!-- Bootloader Card -->
            <div class="card" style="padding:20px;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <span style="font-size:28px;">🔓</span>
                    <h3 style="margin:0; font-size:17px; font-weight:600;">Bootloader</h3>
                </div>
                <p style="color:#6B7280; font-size:14px;">Reboot, unlock, or lock the bootloader (wipes data).</p>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <button id="bootloaderRebootBtn" class="btn-secondary" style="width:100%; padding:6px; border-radius:8px; font-size:13px;" ${!currentDeviceId ? 'disabled style="opacity:0.5;"' : ''}>
                        📱 Reboot to Bootloader <span style="font-size:11px; color:${!currentDeviceId ? '#9ca3af' : '#6B7280'};">(ADB required)</span>
                    </button>
                    <button id="bootloaderUnlockBtn" class="btn-primary" style="width:100%; padding:6px; border-radius:8px; font-size:13px; background:#dc2626;" ${!currentDeviceId ? 'disabled style="opacity:0.5;"' : ''}>
                        🔓 Unlock Bootloader <span style="font-size:11px; color:${!currentDeviceId ? '#fca5a5' : '#fca5a5'};">(ADB required)</span>
                    </button>
                    <button id="bootloaderLockBtn" class="btn-primary" style="width:100%; padding:6px; border-radius:8px; font-size:13px; background:#dc2626;" ${!currentDeviceId ? 'disabled style="opacity:0.5;"' : ''}>
                        🔒 Lock Bootloader <span style="font-size:11px; color:${!currentDeviceId ? '#fca5a5' : '#fca5a5'};">(ADB required)</span>
                    </button>
                    <button id="bootloaderCommandsBtn" class="btn-secondary" style="width:100%; padding:6px; border-radius:8px; font-size:13px;">
                        📋 Commands Guide <span style="font-size:11px; color:#6B7280;">(no ADB)</span>
                    </button>
                </div>
                <div id="bootloaderResult" style="margin-top:8px; font-size:13px;"></div>
            </div>

            <!-- NEW: Disable Bloatware Card -->
            <div class="card" style="padding:20px;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <span style="font-size:28px;">📦</span>
                    <h3 style="margin:0; font-size:17px; font-weight:600;">Disable Bloatware</h3>
                </div>
                <p style="color:#6B7280; font-size:14px;">Disable pre‑installed system apps (user‑only).</p>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <button id="bloatwareModalBtn" class="btn-primary" style="width:100%; padding:6px; border-radius:8px; font-size:13px; background:#0d6efd;" ${!currentDeviceId ? 'disabled style="opacity:0.5;"' : ''}>
                        📦 Select Apps to Disable <span style="font-size:11px; color:${!currentDeviceId ? '#9ca3af' : '#b0d4ff'};">(ADB required)</span>
                    </button>
                    <button id="bloatwareGuideBtn" class="btn-secondary" style="width:100%; padding:6px; border-radius:8px; font-size:13px;">
                        📋 Guide (no ADB) <span style="font-size:11px; color:#6B7280;">(no ADB)</span>
                    </button>
                </div>
                <div id="bloatwareResult" style="margin-top:8px; font-size:13px;"></div>
            </div>

            <!-- NEW: Clear Cache Card -->
            <div class="card" style="padding:20px;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <span style="font-size:28px;">🧹</span>
                    <h3 style="margin:0; font-size:17px; font-weight:600;">Clear Cache</h3>
                </div>
                <p style="color:#6B7280; font-size:14px;">Clear app cache and temporary files.</p>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <button id="clearCacheBtn" class="btn-primary" style="width:100%; padding:6px; border-radius:8px; font-size:13px; background:#0d6efd;" ${!currentDeviceId ? 'disabled style="opacity:0.5;"' : ''}>
                        🧹 Clear Cache <span style="font-size:11px; color:${!currentDeviceId ? '#9ca3af' : '#b0d4ff'};">(ADB required)</span>
                    </button>
                    <button id="cacheGuideBtn" class="btn-secondary" style="width:100%; padding:6px; border-radius:8px; font-size:13px;">
                        📋 Guide (no ADB) <span style="font-size:11px; color:#6B7280;">(no ADB)</span>
                    </button>
                </div>
                <div id="cacheResult" style="margin-top:8px; font-size:13px;"></div>
            </div>

            <!-- NEW: Reboot Modes Card -->
            <div class="card" style="padding:20px;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <span style="font-size:28px;">📱</span>
                    <h3 style="margin:0; font-size:17px; font-weight:600;">Reboot Modes</h3>
                </div>
                <p style="color:#6B7280; font-size:14px;">Reboot to Recovery or Download mode.</p>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <button id="rebootRecoveryBtn" class="btn-primary" style="width:100%; padding:6px; border-radius:8px; font-size:13px; background:#0d6efd;" ${!currentDeviceId ? 'disabled style="opacity:0.5;"' : ''}>
                        📱 Reboot to Recovery <span style="font-size:11px; color:${!currentDeviceId ? '#9ca3af' : '#b0d4ff'};">(ADB required)</span>
                    </button>
                    <button id="rebootDownloadBtn" class="btn-primary" style="width:100%; padding:6px; border-radius:8px; font-size:13px; background:#0d6efd;" ${!currentDeviceId ? 'disabled style="opacity:0.5;"' : ''}>
                        📱 Reboot to Download <span style="font-size:11px; color:${!currentDeviceId ? '#9ca3af' : '#b0d4ff'};">(ADB required)</span>
                    </button>
                    <button id="rebootGuideBtn" class="btn-secondary" style="width:100%; padding:6px; border-radius:8px; font-size:13px;">
                        📋 Guide (no ADB) <span style="font-size:11px; color:#6B7280;">(no ADB)</span>
                    </button>
                </div>
                <div id="rebootResult" style="margin-top:8px; font-size:13px;"></div>
            </div>

        </div>
    `;

    container.innerHTML = html;

    // ---- Event Listeners ----

    // ---- FRP Deactivate ----
    document.getElementById('frpDeactivateBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Deactivate FRP', () => {
            showDangerConfirm(
                '⚠️ Remove All Google Accounts & FRP',
                'This will remove all Google accounts and FRP locks from this device.\n\n' +
                'This action is irreversible. You will not be able to restore account information without re-entering credentials.\n\n' +
                'Do you want to proceed?',
                () => {
                    deactivateFrp();
                }
            );
        });
    });

    // ---- FRP Guide ----
    document.getElementById('frpGuideBtn').addEventListener('click', function() {
        const resultDiv = document.getElementById('frpResult');
        const isOpen = resultDiv.querySelector('.guide-close-btn') !== null;
        if (isOpen) {
            resultDiv.innerHTML = '';
            return;
        }
        resultDiv.innerHTML = `
            <div style="position:relative; margin-top:8px; padding:12px; background:#f0f9ff; border-radius:6px; border-left:4px solid #0ea5e9;">
                <button class="guide-close-btn" style="position:absolute; top:4px; right:8px; background:transparent; border:none; font-size:20px; color:#6B7280; cursor:pointer;" title="Close guide">&times;</button>
                <strong>📋 FRP Bypass Guide (no ADB)</strong>
                <p style="margin:6px 0 0; font-size:13px;">
                    If USB Debugging is not available, try these methods:
                </p>
                <ul style="font-size:13px; color:#374151; margin-top:4px; padding-left:20px;">
                    <li><strong>Method 1:</strong> Use the <a href="https://www.google.com/android/find" target="_blank">Find My Device</a> website to remotely lock the device and reset the password.</li>
                    <li><strong>Method 2:</strong> Boot into Recovery Mode and perform a factory reset (this will erase all data).</li>
                    <li><strong>Method 3:</strong> Use third‑party tools like <a href="https://frp2026.github.io/" target="_blank">FRP2026</a> (works on some devices).</li>
                    <li><strong>Method 4:</strong> Try the Emergency Call trick: <code>*#*#4636#*#*</code> might grant access to settings.</li>
                </ul>
                <hr style="margin:12px 0; border:0; border-top:1px solid #e5e7eb;">
                <p style="margin:0; font-size:12px; color:#6B7280;">
                    💡 <strong>Note:</strong> These methods may not work on all devices. The ADB method above is more reliable.
                </p>
            </div>
        `;
        resultDiv.querySelector('.guide-close-btn').addEventListener('click', function() {
            resultDiv.innerHTML = '';
        });
    });

    // ---- Retrieve Email: Guide ----
    document.getElementById('retrieveEmailGuideBtn').addEventListener('click', function() {
        const resultDiv = document.getElementById('emailResult');
        const isOpen = resultDiv.querySelector('.guide-close-btn') !== null;
        if (isOpen) {
            resultDiv.innerHTML = '';
            return;
        }
        resultDiv.innerHTML = `
            <div style="position:relative; margin-top:8px; padding:12px; background:#f0f9ff; border-radius:6px; border-left:4px solid #0ea5e9;">
                <button class="guide-close-btn" style="position:absolute; top:4px; right:8px; background:transparent; border:none; font-size:20px; color:#6B7280; cursor:pointer;" title="Close guide">&times;</button>
                <strong>📧 Account Recovery Guide</strong>
                <p style="margin:6px 0 0; font-size:13px;">
                    Open <a href="https://accounts.google.com/signin/usernamerecovery" target="_blank">Google Account Recovery</a> on any device.
                    If you can access the phone's browser via Emergency Call or Accessibility, visit that URL directly on the phone.
                </p>
                <hr style="margin:12px 0; border:0; border-top:1px solid #e5e7eb;">
                <p style="margin:0; font-size:12px; color:#6B7280;">
                    💡 <strong>Tip:</strong> On the lock screen, try swiping up and tapping "Emergency call", then enter <code>*#*#4636#*#*</code> or similar codes to access settings (varies by device).
                </p>
            </div>
        `;
        resultDiv.querySelector('.guide-close-btn').addEventListener('click', function() {
            resultDiv.innerHTML = '';
        });
    });

    // ---- Retrieve Email: ADB ----
    document.getElementById('retrieveEmailAdbBtn').addEventListener('click', async function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Retrieve Email via ADB', async () => {
            const resultDiv = document.getElementById('emailResult');
            resultDiv.innerHTML = '⏳ Retrieving accounts via ADB...';
            try {
                const output = await runAdb('dumpsys account');
                const emails = output.match(/\[([^\]]+@[^\]]+)\]/g) || [];
                const uniqueEmails = [...new Set(emails.map(e => e.replace(/[\[\]]/g, '')))];
                if (uniqueEmails.length === 0) {
                    resultDiv.innerHTML = `
                        <div style="margin-top:8px; padding:12px; background:#fef2f2; border-radius:6px; border-left:4px solid #dc2626;">
                            <strong>❌ No emails found</strong>
                            <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">No Google accounts were detected on this device.</p>
                        </div>
                    `;
                } else {
                    resultDiv.innerHTML = `
                        <div style="margin-top:8px; padding:12px; background:#f0fdf4; border-radius:6px; border-left:4px solid #16a34a;">
                            <strong>✅ Found ${uniqueEmails.length} account(s)</strong>
                            <div style="margin-top:6px; font-size:13px; color:#374151;">
                                ${uniqueEmails.map(e => `📧 ${e}`).join('<br>')}
                            </div>
                        </div>
                    `;
                }
            } catch (err) {
                resultDiv.innerHTML = `
                    <div style="margin-top:8px; padding:12px; background:#fef2f2; border-radius:6px; border-left:4px solid #dc2626;">
                        <strong>❌ ADB retrieval failed</strong>
                        <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">${escapeHtml(err.message)}</p>
                        <p style="margin:4px 0 0; font-size:12px; color:#92400e;">Make sure USB Debugging is enabled and the device is authorized.</p>
                    </div>
                `;
            }
        });
    });

    // Factory Reset: Guide
    document.getElementById('factoryResetModalBtn').addEventListener('click', function() {
        showLegalDisclaimer('Factory Reset Guide', () => {
            showFactoryResetModal();
        });
    });

    // Factory Reset: ADB
    document.getElementById('adbFactoryResetBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Factory Reset via ADB', () => {
            showAdbFactoryResetModal();
        });
    });

    // Bootloader: Reboot
    document.getElementById('bootloaderRebootBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Reboot to Bootloader', async () => {
            const resultDiv = document.getElementById('bootloaderResult');
            resultDiv.innerHTML = '⏳ Rebooting to bootloader...';
            try {
                await runAdb('reboot bootloader');
                resultDiv.innerHTML = `
                    <div style="margin-top:8px; padding:12px; background:#f0fdf4; border-radius:6px; border-left:4px solid #16a34a;">
                        <strong>✅ Reboot sent</strong>
                        <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">The device should now be in bootloader mode. Use fastboot commands for further actions.</p>
                    </div>
                `;
            } catch (err) {
                resultDiv.innerHTML = `
                    <div style="margin-top:8px; padding:12px; background:#fef2f2; border-radius:6px; border-left:4px solid #dc2626;">
                        <strong>❌ Failed to reboot</strong>
                        <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">${escapeHtml(err.message)}</p>
                        <p style="margin:4px 0 0; font-size:12px; color:#92400e;">Try manually: power off, then press Volume Down + Power to enter bootloader.</p>
                    </div>
                `;
            }
        });
    });

    // Bootloader: Unlock
    document.getElementById('bootloaderUnlockBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showDangerConfirm(
            '🔓 Unlock Bootloader',
            'This will erase ALL data on the device and may void your warranty.\n\nAre you sure you want to proceed?',
            () => {
                showLegalDisclaimer('Unlock Bootloader', async () => {
                    const resultDiv = document.getElementById('bootloaderResult');
                    resultDiv.innerHTML = '⏳ Attempting to unlock bootloader...';
                    try {
                        await runAdb('reboot bootloader').catch(() => {});
                        const output = await runFastboot('flashing unlock');
                        if (output === null) {
                            resultDiv.innerHTML = `
                                <div style="margin-top:8px; padding:12px; background:#fef3c7; border-radius:6px; border-left:4px solid #f59e0b;">
                                    <strong>⚠️ Fastboot not available</strong>
                                    <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">Please run the following command manually in terminal:</p>
                                    <pre style="background:#1e293b; color:#e2e8f0; padding:8px; border-radius:4px; font-size:12px; margin:8px 0 0;">fastboot flashing unlock</pre>
                                    <p style="margin:4px 0 0; font-size:12px; color:#92400e;">Follow the on-screen instructions on your device.</p>
                                </div>
                            `;
                        } else {
                            resultDiv.innerHTML = `
                                <div style="margin-top:8px; padding:12px; background:#f0fdf4; border-radius:6px; border-left:4px solid #16a34a;">
                                    <strong>✅ Bootloader unlocked</strong>
                                    <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">Output: ${escapeHtml(output)}</p>
                                    <p style="margin:4px 0 0; font-size:12px; color:#92400e;">The device will likely reboot and wipe all data.</p>
                                </div>
                            `;
                        }
                    } catch (err) {
                        resultDiv.innerHTML = `
                            <div style="margin-top:8px; padding:12px; background:#fef2f2; border-radius:6px; border-left:4px solid #dc2626;">
                                <strong>❌ Unlock failed</strong>
                                <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">${escapeHtml(err.message)}</p>
                                <p style="margin:4px 0 0; font-size:12px; color:#92400e;">Ensure USB Debugging and OEM unlocking are enabled, and the device is in bootloader mode.</p>
                            </div>
                        `;
                    }
                });
            }
        );
    });

    // Bootloader: Lock
    document.getElementById('bootloaderLockBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showDangerConfirm(
            '🔒 Lock Bootloader',
            'This will erase ALL data on the device and restore factory state.\n\nAre you sure you want to proceed?',
            () => {
                showLegalDisclaimer('Lock Bootloader', async () => {
                    const resultDiv = document.getElementById('bootloaderResult');
                    resultDiv.innerHTML = '⏳ Attempting to lock bootloader...';
                    try {
                        await runAdb('reboot bootloader').catch(() => {});
                        const output = await runFastboot('flashing lock');
                        if (output === null) {
                            resultDiv.innerHTML = `
                                <div style="margin-top:8px; padding:12px; background:#fef3c7; border-radius:6px; border-left:4px solid #f59e0b;">
                                    <strong>⚠️ Fastboot not available</strong>
                                    <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">Please run the following command manually in terminal:</p>
                                    <pre style="background:#1e293b; color:#e2e8f0; padding:8px; border-radius:4px; font-size:12px; margin:8px 0 0;">fastboot flashing lock</pre>
                                    <p style="margin:4px 0 0; font-size:12px; color:#92400e;">Follow the on-screen instructions on your device.</p>
                                </div>
                            `;
                        } else {
                            resultDiv.innerHTML = `
                                <div style="margin-top:8px; padding:12px; background:#f0fdf4; border-radius:6px; border-left:4px solid #16a34a;">
                                    <strong>✅ Bootloader locked</strong>
                                    <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">Output: ${escapeHtml(output)}</p>
                                    <p style="margin:4px 0 0; font-size:12px; color:#92400e;">The device will likely reboot and wipe all data.</p>
                                </div>
                            `;
                        }
                    } catch (err) {
                        resultDiv.innerHTML = `
                            <div style="margin-top:8px; padding:12px; background:#fef2f2; border-radius:6px; border-left:4px solid #dc2626;">
                                <strong>❌ Lock failed</strong>
                                <p style="margin:4px 0 0; font-size:13px; color:#6B7280;">${escapeHtml(err.message)}</p>
                                <p style="margin:4px 0 0; font-size:12px; color:#92400e;">Ensure USB Debugging and OEM unlocking are enabled, and the device is in bootloader mode.</p>
                            </div>
                        `;
                    }
                });
            }
        );
    });

    // Bootloader: Commands Guide
    document.getElementById('bootloaderCommandsBtn').addEventListener('click', function() {
        const resultDiv = document.getElementById('bootloaderResult');
        const isOpen = resultDiv.querySelector('.guide-close-btn') !== null;
        if (isOpen) {
            resultDiv.innerHTML = '';
            return;
        }
        const commands = `
# Reboot to bootloader (if ADB available)
adb reboot bootloader

# Check fastboot connection
fastboot devices

# Unlock bootloader (wipes data)
fastboot flashing unlock   # or fastboot oem unlock

# Lock bootloader (wipes data)
fastboot flashing lock     # or fastboot oem lock
        `;
        resultDiv.innerHTML = `
            <div style="position:relative; margin-top:12px; padding:16px; background:#f0f4ff; border-radius:8px; border-left:4px solid #0d6efd;">
                <button class="guide-close-btn" style="position:absolute; top:4px; right:8px; background:transparent; border:none; font-size:20px; color:#6B7280; cursor:pointer;" title="Close guide">&times;</button>
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                    <span style="font-size:20px;">🔓</span>
                    <strong style="font-size:16px;">Bootloader Commands Guide</strong>
                </div>
                <p style="margin:4px 0 8px; font-size:13px; color:#6B7280;">
                    Unlocking the bootloader will wipe all data and may void warranty.
                    Ensure OEM unlocking is enabled in Developer Options.
                </p>
                <pre style="background:#1e293b; color:#e2e8f0; padding:12px; border-radius:6px; font-size:12px; overflow-x:auto; white-space:pre-wrap;">${commands}</pre>
                <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:8px;">
                    <button id="copyBootloaderCommands" class="btn-secondary" style="padding:4px 16px; font-size:12px;">📋 Copy Commands</button>
                </div>
                <div style="margin-top:8px; font-size:12px; color:#6B7280;">
                    <a href="https://developer.android.com/studio/command-line/adb" target="_blank">Official ADB/Fastboot documentation</a>
                </div>
            </div>
        `;
        resultDiv.querySelector('.guide-close-btn').addEventListener('click', function() {
            resultDiv.innerHTML = '';
        });
        document.getElementById('copyBootloaderCommands')?.addEventListener('click', function() {
            navigator.clipboard.writeText(commands).then(() => {
                this.textContent = '✅ Copied!';
                setTimeout(() => { this.textContent = '📋 Copy Commands'; }, 2000);
            });
        });
    });

    // ---- NEW: Disable Bloatware Modal ----
    document.getElementById('bloatwareModalBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Disable Bloatware', () => {
            showBloatwareModal();
        });
    });

    // ---- NEW: Bloatware Guide (toggle) ----
    document.getElementById('bloatwareGuideBtn').addEventListener('click', function() {
        const resultDiv = document.getElementById('bloatwareResult');
        const isOpen = resultDiv.querySelector('.guide-close-btn') !== null;
        if (isOpen) {
            resultDiv.innerHTML = '';
            return;
        }
        resultDiv.innerHTML = `
            <div style="position:relative; margin-top:8px; padding:12px; background:#f0f9ff; border-radius:6px; border-left:4px solid #0ea5e9;">
                <button class="guide-close-btn" style="position:absolute; top:4px; right:8px; background:transparent; border:none; font-size:20px; color:#6B7280; cursor:pointer;" title="Close guide">&times;</button>
                <strong>📋 Disable Bloatware Guide (no ADB)</strong>
                <p style="margin:6px 0 0; font-size:13px;">
                    To disable bloatware without ADB:
                </p>
                <ol style="font-size:13px; color:#374151; margin-top:4px; padding-left:20px;">
                    <li>Go to <strong>Settings → Apps</strong> (or Apps & Notifications).</li>
                    <li>Select the app you want to disable.</li>
                    <li>Tap <strong>Disable</strong> (if available).</li>
                    <li>If "Disable" is greyed out, tap <strong>Force Stop</strong> and then try again.</li>
                    <li>For system apps that cannot be disabled, you may need to use ADB or third‑party tools.</li>
                </ol>
                <hr style="margin:12px 0; border:0; border-top:1px solid #e5e7eb;">
                <p style="margin:0; font-size:12px; color:#6B7280;">
                    💡 <strong>Note:</strong> Some apps may not be disabled without ADB. The ADB method above is more flexible.
                </p>
            </div>
        `;
        resultDiv.querySelector('.guide-close-btn').addEventListener('click', function() {
            resultDiv.innerHTML = '';
        });
    });

    // ---- NEW: Clear Cache ----
    document.getElementById('clearCacheBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Clear Cache', () => {
            clearCache();
        });
    });

    // ---- NEW: Cache Guide (toggle) ----
    document.getElementById('cacheGuideBtn').addEventListener('click', function() {
        const resultDiv = document.getElementById('cacheResult');
        const isOpen = resultDiv.querySelector('.guide-close-btn') !== null;
        if (isOpen) {
            resultDiv.innerHTML = '';
            return;
        }
        resultDiv.innerHTML = `
            <div style="position:relative; margin-top:8px; padding:12px; background:#f0f9ff; border-radius:6px; border-left:4px solid #0ea5e9;">
                <button class="guide-close-btn" style="position:absolute; top:4px; right:8px; background:transparent; border:none; font-size:20px; color:#6B7280; cursor:pointer;" title="Close guide">&times;</button>
                <strong>📋 Clear Cache Guide (no ADB)</strong>
                <p style="margin:6px 0 0; font-size:13px;">
                    To clear cache without ADB:
                </p>
                <ol style="font-size:13px; color:#374151; margin-top:4px; padding-left:20px;">
                    <li>Go to <strong>Settings → Storage</strong>.</li>
                    <li>Tap <strong>Cache data</strong> (or "Clear cache").</li>
                    <li>Alternatively, go to <strong>Settings → Apps</strong>, select each app, and tap <strong>Clear cache</strong>.</li>
                    <li>For a deeper clean, boot into Recovery Mode and select <strong>Wipe cache partition</strong>.</li>
                </ol>
                <hr style="margin:12px 0; border:0; border-top:1px solid #e5e7eb;">
                <p style="margin:0; font-size:12px; color:#6B7280;">
                    💡 <strong>Note:</strong> The ADB method above can clear cache for all apps at once.
                </p>
            </div>
        `;
        resultDiv.querySelector('.guide-close-btn').addEventListener('click', function() {
            resultDiv.innerHTML = '';
        });
    });

    // ---- NEW: Reboot Modes ----
    document.getElementById('rebootRecoveryBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Reboot to Recovery', () => {
            rebootToRecovery();
        });
    });

    document.getElementById('rebootDownloadBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Reboot to Download', () => {
            rebootToDownload();
        });
    });

    // ---- NEW: Reboot Guide (toggle) ----
    document.getElementById('rebootGuideBtn').addEventListener('click', function() {
        const resultDiv = document.getElementById('rebootResult');
        const isOpen = resultDiv.querySelector('.guide-close-btn') !== null;
        if (isOpen) {
            resultDiv.innerHTML = '';
            return;
        }
        // Brand-specific recovery/downoad key combos
        const recoveryCombos = {
            'Samsung': 'Volume Up + Power',
            'Google': 'Volume Down + Power (then select Recovery)',
            'OnePlus': 'Volume Down + Power',
            'Xiaomi': 'Volume Up + Power',
            'Huawei': 'Volume Up + Power',
            'LG': 'Volume Down + Power (release and press again)',
            'Motorola': 'Volume Down + Power (then select Recovery)',
            'generic': 'Volume Up + Power (or Volume Down + Power)'
        };

        let brand = detectedBrand ? detectedBrand.charAt(0).toUpperCase() + detectedBrand.slice(1) : 'Unknown';
        let combo = recoveryCombos[brand] || recoveryCombos.generic;

        resultDiv.innerHTML = `
            <div style="position:relative; margin-top:8px; padding:12px; background:#f0f9ff; border-radius:6px; border-left:4px solid #0ea5e9;">
                <button class="guide-close-btn" style="position:absolute; top:4px; right:8px; background:transparent; border:none; font-size:20px; color:#6B7280; cursor:pointer;" title="Close guide">&times;</button>
                <strong>📋 Reboot Guide (no ADB)</strong>
                <p style="margin:6px 0 0; font-size:13px;">
                    To enter <strong>Recovery Mode</strong> or <strong>Download Mode</strong> without ADB:
                </p>
                <ul style="font-size:13px; color:#374151; margin-top:4px; padding-left:20px;">
                    <li><strong>Power off</strong> the device.</li>
                    <li>Press and hold <strong>${combo}</strong> simultaneously.</li>
                    <li>For Recovery, release when the logo appears and use volume keys to navigate.</li>
                    <li>For Download (Samsung), press Volume Up when prompted.</li>
                    <li>If the combo doesn't work, search online for your specific model.</li>
                </ul>
                <hr style="margin:12px 0; border:0; border-top:1px solid #e5e7eb;">
                <p style="margin:0; font-size:12px; color:#6B7280;">
                    💡 <strong>Detected brand:</strong> ${brand} &nbsp;|&nbsp; Recommended combo: ${combo}
                </p>
            </div>
        `;
        resultDiv.querySelector('.guide-close-btn').addEventListener('click', function() {
            resultDiv.innerHTML = '';
        });
    });
}

// ---- Expose to window ----
window.renderRepairs = renderRepairs;