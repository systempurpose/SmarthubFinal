// js/advanceDiagnostic.js – Advanced Diagnostics (no hardware tests)
// Combines the module (window.SmartHub.advanceDiagnostic) and page renderer
(function() {
    'use strict';

    let currentDeviceId = null;
    let diagResults = null;
    let _currentContainerId = null;
    let _lastRenderResults = null;
    let _isRendering = false;

    // ---- I18N helpers ----
    function _getLang() {
        return window._activeLang
            || (window.SmartHubI18n && window.SmartHubI18n.getCurrentLang ? window.SmartHubI18n.getCurrentLang() : 'en');
    }

    function _t(key, fallback) {
        const lang = _getLang();
        let result = null;
        if (window.SmartHubI18n && typeof window.SmartHubI18n.t === 'function') {
            result = window.SmartHubI18n.t(key, lang);
        }
        if (!result && typeof t === 'function') {
            result = t(key, lang);
        }
        return result || fallback || key;
    }

    // ---- ADB & API helpers ----
    async function adb(command) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        try {
            const resp = await fetch('/adb-shell', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId: currentDeviceId, command }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!resp.ok) {
                let errorMessage = `ADB command failed: ${resp.status}`;
                try {
                    const errorData = await resp.json();
                    if (errorData.error) errorMessage += ` – ${errorData.error}`;
                    else if (errorData.message) errorMessage += ` – ${errorData.message}`;
                } catch (_) {
                    try {
                        const text = await resp.text();
                        if (text) errorMessage += ` – ${text}`;
                    } catch (_) {}
                }
                throw new Error(errorMessage);
            }
            return await resp.json();
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') throw new Error('ADB command timed out after 30 seconds');
            throw err;
        }
    }

    async function apiCall(endpoint) {
        const resp = await fetch(`/api${endpoint}?deviceId=${currentDeviceId}`);
        if (!resp.ok) throw new Error(`API call failed: ${resp.status}`);
        return resp.json();
    }

    async function getDeviceUptimeSeconds() {
        try {
            const result = await adb('cat /proc/uptime | cut -d. -f1');
            return parseInt(result.output.trim()) || 0;
        } catch { return 0; }
    }

    async function getCurrentTimeSeconds() {
        try {
            const result = await adb('date +%s');
            return parseInt(result.output.trim()) || 0;
        } catch { return 0; }
    }

    function parseLogcatTimestamp(line) {
        const match = line.match(/(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
        if (!match) return null;
        const [, month, day, hour, min, sec] = match.map(Number);
        const now = new Date();
        const date = new Date(now.getFullYear(), month - 1, day, hour, min, sec);
        return Math.floor(date.getTime() / 1000);
    }

    // ====== SOFTWARE-ONLY TESTS (no hardware / companion app) ======
    // (All hardware tests removed – they are handled in the Hardware Tests page)

    async function testAppCrashes() {
        const name = _t('adv.test.appCrashes.name', 'App Crashes');
        try {
            const uptime = await getDeviceUptimeSeconds();
            if (uptime < 60) {
                return {
                    name,
                    passed: true,
                    message: _t('adv.test.appCrashes.message.justBooted', 'Device just booted, ignoring boot-time logs'),
                    fix: ''
                };
            }
            const result = await adb('logcat -v time -b crash -t 200');
            const lines = result.output.split('\n').filter(l => l.includes('FATAL EXCEPTION'));
            if (lines.length === 0) {
                return {
                    name,
                    passed: true,
                    message: _t('adv.test.appCrashes.message.noCrashes', 'No recent crashes'),
                    fix: ''
                };
            }
            const now = await getCurrentTimeSeconds();
            const crashPackages = new Set();
            for (const line of lines) {
                const ts = parseLogcatTimestamp(line);
                if (ts && (now - ts) < 900) {
                    const pkgMatch = line.match(/FATAL EXCEPTION:\s+(\S+)/);
                    if (pkgMatch) {
                        const pkg = pkgMatch[1];
                        if (!pkg.includes('android.process.acore') && !pkg.includes('com.android.phone')) {
                            crashPackages.add(pkg);
                        }
                    }
                }
            }
            const uniqueCount = crashPackages.size;
            const passed = uniqueCount < 3;
            const msg = passed
                ? `${uniqueCount} minor crash(es) (ignored)`
                : `${uniqueCount} unique apps crashed recently: ${Array.from(crashPackages).slice(0,3).join(', ')}...`;
            return {
                name,
                passed,
                message: msg,
                fix: passed ? '' : _t('adv.test.appCrashes.fix', 'Clear app data: `adb shell pm clear <package>` or uninstall.')
            };
        } catch (e) {
            return {
                name,
                passed: false,
                message: _t('adv.common.error', 'Error: ') + e.message,
                fix: _t('adv.test.appCrashes.fixError', 'Check ADB connection.')
            };
        }
    }

    async function testANR() {
        const name = _t('adv.test.anr.name', 'ANR (App Freezes)');
        try {
            const uptime = await getDeviceUptimeSeconds();
            const result = await adb('dumpsys anr');
            const output = result.output;
            const anrMatches = output.match(/ANR in ([^\n]+)/g) || [];
            if (anrMatches.length === 0) {
                return {
                    name,
                    passed: true,
                    message: _t('adv.test.anr.message.noAnr', 'No ANR detected'),
                    fix: ''
                };
            }
            const recentAnrs = anrMatches.filter(match => uptime < 3600);
            const passed = recentAnrs.length === 0;
            return {
                name,
                passed,
                message: passed ? _t('adv.test.anr.message.noRecent', 'No recent ANR') : `${recentAnrs.length} ANR event(s) found (last ${Math.round(uptime/60)} min)`,
                fix: passed ? '' : _t('adv.test.anr.fix', 'Clear data of the app listed in the ANR, or uninstall it.')
            };
        } catch (e) {
            return {
                name,
                passed: false,
                message: _t('adv.common.error', 'Error: ') + e.message,
                fix: _t('adv.test.anr.fixError', 'Restart ADB.')
            };
        }
    }

    async function testKernelPanic() {
        const name = _t('adv.test.kernelPanic.name', 'Kernel Panic');
        try {
            const uptime = await getDeviceUptimeSeconds();
            if (uptime > 86400) {
                return {
                    name,
                    passed: true,
                    message: _t('adv.test.kernelPanic.message.uptimeOk', 'Uptime >24h, ignoring old panic logs'),
                    fix: ''
                };
            }
            const result = await adb('cat /proc/last_kmsg 2>/dev/null || echo "no_last_kmsg"');
            const hasPanic = result.output.includes('panic') || result.output.includes('Oops');
            const passed = !hasPanic || uptime > 86400;
            return {
                name,
                passed,
                message: hasPanic && uptime < 86400 ? _t('adv.test.kernelPanic.message.detected', 'Kernel panic detected in current boot') : _t('adv.test.kernelPanic.message.none', 'No kernel panic'),
                fix: hasPanic && uptime < 86400 ? _t('adv.test.kernelPanic.fix', 'Reflash boot.img via fastboot. If persists, factory reset.') : ''
            };
        } catch (e) {
            return {
                name,
                passed: false,
                message: _t('adv.common.error', 'Error: ') + e.message,
                fix: _t('adv.test.kernelPanic.fixError', 'Check if device supports last_kmsg.')
            };
        }
    }

    async function testSystemServiceCrashes() {
        const name = _t('adv.test.systemService.name', 'System Service Stability');
        try {
            const result = await adb('logcat -b system -t 200');
            const lines = result.output.split('\n').filter(l => l.includes('Service death') || l.includes('Crash'));
            const serviceCounts = {};
            for (const line of lines) {
                const match = line.match(/Service death.*?([\w.]+)/);
                if (match) {
                    const svc = match[1];
                    serviceCounts[svc] = (serviceCounts[svc] || 0) + 1;
                }
            }
            const problematic = Object.entries(serviceCounts).filter(([_, count]) => count > 2);
            const passed = problematic.length === 0;
            const msg = passed ? _t('adv.test.systemService.message.stable', 'Stable') : `${problematic.length} service(s) crashed repeatedly: ${problematic.map(([s]) => s).join(', ')}`;
            return {
                name,
                passed,
                message: msg,
                fix: passed ? '' : _t('adv.test.systemService.fix', 'Restart SystemUI: `adb shell pkill -f com.android.systemui`. If persists, factory reset.')
            };
        } catch (e) {
            return {
                name,
                passed: false,
                message: _t('adv.common.error', 'Error: ') + e.message,
                fix: _t('adv.test.systemService.fixError', 'Check ADB permissions.')
            };
        }
    }

    async function testStorageHealth() {
        const name = _t('adv.test.storageFull.name', 'Storage Full');
        try {
            const data = await apiCall('/hardware/storage');
            const usedPct = data.percent || 0;
            const passed = usedPct < 92;
            return {
                name,
                passed,
                message: `${usedPct.toFixed(1)}% used`,
                fix: passed ? '' : _t('adv.test.storageFull.fix', 'Free up space: `adb shell pm trim-caches`. Delete large files in `/sdcard/Download`.')
            };
        } catch (e) {
            return {
                name,
                passed: false,
                message: _t('adv.common.error', 'Error: ') + e.message,
                fix: _t('adv.test.storageFull.fixError', 'Check device connection.')
            };
        }
    }

    async function testBackgroundWakeups() {
        const name = _t('adv.test.wakeups.name', 'Excessive Wakeups (Battery Drain)');
        try {
            const result = await adb('dumpsys deviceidle');
            const lines = result.output.split('\n').filter(l => l.includes('Wakeup') || l.includes('wakeup'));
            const count = lines.length;
            const passed = count < 30;
            return {
                name,
                passed,
                message: `${count} wakeup events logged (threshold: 30)`,
                fix: passed ? '' : _t('adv.test.wakeups.fix', 'Find culprit: `adb shell dumpsys deviceidle`. Disable with `adb shell pm disable <package>`.')
            };
        } catch (e) {
            return {
                name,
                passed: false,
                message: _t('adv.common.error', 'Error: ') + e.message,
                fix: _t('adv.test.wakeups.fixError', 'Restart ADB.')
            };
        }
    }

    async function testUIJank() {
        const name = _t('adv.test.uiJank.name', 'UI Jank');
        try {
            const windowDump = await adb('dumpsys window');
            const output = windowDump.output;
            const focusMatch = output.match(/mCurrentFocus=([^\n]+)/);
            let fgPkg = 'com.android.systemui';
            if (focusMatch) {
                let focusLine = focusMatch[1].trim();
                const pkgMatch = focusLine.match(/([a-zA-Z0-9_.]+)\//);
                if (pkgMatch) {
                    fgPkg = pkgMatch[1];
                } else {
                    const simpleMatch = focusLine.match(/^([a-zA-Z0-9_.]+)$/);
                    if (simpleMatch) fgPkg = simpleMatch[1];
                }
            }
            const ramData = await apiCall('/hardware/ram');
            const totalRamGB = parseFloat(ramData.total) || 4;
            const threshold = totalRamGB < 3 ? 10 : 5;
            const gfxResult = await adb(`dumpsys gfxinfo ${fgPkg}`);
            const gfxOutput = gfxResult.output;
            const totalMatch = gfxOutput.match(/Total frames rendered:\s*(\d+)/i);
            const jankMatch = gfxOutput.match(/Janky frames:\s*(\d+)/i);
            if (totalMatch && jankMatch) {
                const total = parseInt(totalMatch[1]);
                const jank = parseInt(jankMatch[1]);
                const percent = total > 0 ? (jank / total) * 100 : 0;
                const passed = percent < threshold;
                return {
                    name: name + ` (${fgPkg.split('.').pop()})`,
                    passed,
                    message: `${percent.toFixed(1)}% janky frames (threshold ${threshold}%)`,
                    fix: passed ? '' : _t('adv.test.uiJank.fix', 'Reduce animations: `adb shell settings put global window_animation_scale 0.5`. Disable bloatware.')
                };
            } else {
                return {
                    name,
                    passed: true,
                    message: _t('adv.test.uiJank.message.noData', 'No frame data available (app may be idle)'),
                    fix: ''
                };
            }
        } catch (e) {
            return {
                name,
                passed: false,
                message: _t('adv.common.error', 'Error: ') + e.message,
                fix: _t('adv.test.uiJank.fixError', 'Ensure screen is on and an app is active.')
            };
        }
    }

    async function testNetworkStack() {
        const name = _t('adv.test.networkStack.name', 'WiFi/Bluetooth Stack Stability');
        try {
            const result = await adb('logcat -b system -t 200 | grep -i "wifi.*crash\\|bluetooth.*crash" || echo ""');
            const lines = result.output.split('\n').filter(l => l.trim() && !l.includes('grep'));
            const count = lines.length;
            const passed = count <= 2;
            return {
                name,
                passed,
                message: passed ? _t('adv.test.networkStack.message.stable', 'Stable') : `${count} stack restarts detected`,
                fix: passed ? '' : _t('adv.test.networkStack.fix', 'Reset network: `adb shell settings put global wifi_on 0` then `1`. Clear BT cache: `adb shell pm clear com.android.bluetooth`.')
            };
        } catch (e) {
            return {
                name,
                passed: false,
                message: _t('adv.common.error', 'Error: ') + e.message,
                fix: _t('adv.test.networkStack.fixError', 'Check device connection.')
            };
        }
    }

    async function testThermalThrottling() {
        const name = _t('adv.test.thermal.name', 'Thermal Throttling');
        try {
            const battery = await apiCall('/hardware/battery');
            const isCharging = battery.charging === true;
            const temp = parseFloat(battery.temperature) || 0;
            const passed = temp < 45 || isCharging;
            return {
                name,
                passed,
                message: passed ? `${temp}°C (${isCharging ? 'charging, normal' : 'normal'})` : `${temp}°C (overheating while idle)`,
                fix: passed ? '' : _t('adv.test.thermal.fix', 'Disable heavy background apps. Wipe cache partition from recovery.')
            };
        } catch (e) {
            try {
                const result = await adb('logcat -b events -t 50 | grep thermal');
                const lines = result.output.split('\n').filter(l => l.includes('thermal'));
                const passed = lines.length < 2;
                return {
                    name,
                    passed,
                    message: passed ? _t('adv.test.thermal.message.noEvents', 'No throttling') : `${lines.length} thermal events`,
                    fix: passed ? '' : _t('adv.test.thermal.fix', 'Check for rogue apps causing high CPU load.')
                };
            } catch (e2) {
                return {
                    name,
                    passed: false,
                    message: _t('adv.common.error', 'Error: ') + e2.message,
                    fix: _t('adv.test.thermal.fixError', 'Restart ADB.')
                };
            }
        }
    }

    async function testGhostTouch() {
        const name = _t('adv.test.ghostTouch.name', 'Ghost Touch');
        try {
            let isScreenOn = false;
            try {
                const policyDump = await adb('dumpsys window policy');
                const policyOutput = policyDump.output;
                isScreenOn = policyOutput.includes('mDreamingLockscreen=false');
            } catch (_) {
                isScreenOn = true;
            }
            if (isScreenOn) {
                return {
                    name,
                    passed: true,
                    message: _t('adv.test.ghostTouch.message.skipped', 'Skipped (screen is on – cannot test accurately)'),
                    fix: ''
                };
            }
            let run1, run2;
            try {
                run1 = await adb('getevent -t -c 100');
                await new Promise(r => setTimeout(r, 2000));
                run2 = await adb('getevent -t -c 100');
            } catch (e) {
                const dump = await adb('dumpsys input');
                const touchEvents = dump.output.match(/TOUCH: /g) || [];
                const count = touchEvents.length;
                const passed = count < 10;
                return {
                    name,
                    passed,
                    message: passed ? `No ghost touch (${count} recent events)` : `Possible ghost touch (${count} events)`,
                    fix: passed ? '' : _t('adv.test.ghostTouch.fix', 'Try recalibration via `*#*#2664#*#*`. Disable "High touch sensitivity".')
                };
            }
            const count1 = run1.output.split('\n')
                .filter(l => l.trim() && !l.includes('SYN_REPORT') && !l.includes('0000 0000')).length;
            const count2 = run2.output.split('\n')
                .filter(l => l.trim() && !l.includes('SYN_REPORT') && !l.includes('0000 0000')).length;
            const passed = !(count1 > 3 && count2 > 3);
            const avgCount = Math.round((count1 + count2) / 2);
            return {
                name,
                passed,
                message: passed ? `No ghost touch (avg ${avgCount} events)` : `Possible ghost touch (avg ${avgCount} events)`,
                fix: passed ? '' : _t('adv.test.ghostTouch.fix', 'Try recalibration via `*#*#2664#*#*`. Disable "High touch sensitivity". Reflash touch firmware.')
            };
        } catch (e) {
            return {
                name,
                passed: false,
                message: _t('adv.common.error', 'Error: ') + e.message,
                fix: _t('adv.test.ghostTouch.fixError', 'Check ADB and touch driver.')
            };
        }
    }

    async function testCPUTemperature() {
        const name = _t('adv.test.cpuTemp.name', 'CPU Temperature');
        try {
            let cpuTemp = null;
            let zoneName = '';
            const candidates = [];

            for (let i = 0; i < 20; i++) {
                try {
                    const typeResult = await adb(`cat /sys/class/thermal/thermal_zone${i}/type 2>/dev/null`);
                    const type = (typeResult.output || '').trim().toLowerCase();
                    if (!type) continue;

                    const tempResult = await adb(`cat /sys/class/thermal/thermal_zone${i}/temp 2>/dev/null`);
                    const raw = (tempResult.output || '').trim();
                    if (!raw) continue;
                    let temp = parseFloat(raw);
                    if (isNaN(temp)) continue;
                    if (temp > 1000) temp /= 1000;
                    if (temp <= 0 || temp > 150) continue;

                    candidates.push({ type, temp });
                    if (/cpu|soc|tsens|apu|cluster|cpuss|pm8|msm.*thermal|little|big|silver|gold/.test(type)) {
                        cpuTemp = temp;
                        zoneName = type;
                        break;
                    }
                } catch (_) {}
            }

            if (cpuTemp === null && candidates.length > 0) {
                candidates.sort((a, b) => b.temp - a.temp);
                cpuTemp = candidates[0].temp;
                zoneName = candidates[0].type + ' (best guess)';
            }

            const passed = cpuTemp === null || cpuTemp < 48;
            return {
                name,
                passed,
                message: cpuTemp !== null ? `${cpuTemp.toFixed(1)}°C (${zoneName})` : _t('adv.test.cpuTemp.message.unavailable', 'Unable to read (thermal zones not accessible on this device)'),
                fix: (!passed && cpuTemp !== null) ? _t('adv.test.cpuTemp.fix', 'CPU running hot. Reduce load or check cooling.') : ''
            };
        } catch (e) {
            return {
                name,
                passed: true,
                message: _t('adv.test.cpuTemp.message.unavailable', 'Unable to read (thermal zones not accessible on this device)'),
                fix: ''
            };
        }
    }

    async function testBatteryVoltage() {
        const name = _t('adv.test.batteryVoltage.name', 'Battery Voltage');
        try {
            const bat = await apiCall('/hardware/battery');
            let voltage = bat.voltage ? parseFloat(bat.voltage) : 0;
            if (voltage > 0 && voltage < 20) {
                voltage = voltage * 1000;
            }
            const passed = voltage === 0 || (voltage >= 3200 && voltage <= 4400);
            return {
                name,
                passed,
                message: voltage > 0 ? `${Math.round(voltage)} mV` : _t('adv.common.notAvailable', 'Not available'),
                fix: passed ? '' : _t('adv.test.batteryVoltage.fix', 'Voltage outside normal range – consider battery replacement.')
            };
        } catch (e) {
            return {
                name,
                passed: true,
                message: _t('adv.common.notAvailable', 'Not available'),
                fix: ''
            };
        }
    }

    async function testBatteryHealth() {
        const name = _t('adv.test.batteryHealth.name', 'Battery Health');
        try {
            const bat = await apiCall('/hardware/battery');
            const health = (bat.health || '').toLowerCase();
            const cycle = bat.cycle_count || bat.cycleCount || 0;
            let passed = true;
            let msg = 'Good';
            if (health === 'overheat' || health === 'dead' || health === 'over_voltage' || health === 'failure' || health === 'cold') {
                passed = false;
                msg = health;
            }
            if (cycle > 500) {
                passed = false;
                msg = `${cycle} cycles (wear high)`;
            } else if (cycle > 0) {
                msg = `${cycle} cycles`;
            }
            if (!passed && cycle > 0) msg += `, ${health}`;
            else if (!passed) msg = `${health}`;
            return {
                name,
                passed,
                message: msg,
                fix: passed ? '' : _t('adv.test.batteryHealth.fix', 'Battery may need replacement. Run battery calibration or replace.')
            };
        } catch (e) {
            return {
                name,
                passed: true,
                message: _t('adv.common.notAvailable', 'Not available'),
                fix: ''
            };
        }
    }

    async function testSignalStrength() {
        const name = _t('adv.test.signalStrength.name', 'Signal Strength');
        try {
            const result = await adb('dumpsys telephony.registry');
            const output = result.output || '';
            let level = null;
            let passed = true;
            let msg = _t('adv.test.signalStrength.message.unavailable', 'Unable to read signal');

            const lteMatch = output.match(/mLte=CellSignalStrengthLte[^}]*?level=(\d+)/);
            if (lteMatch) {
                level = parseInt(lteMatch[1]);
                if (level >= 0 && level <= 4) {
                    const levels = [
                        _t('adv.test.signalStrength.level.unknown', 'Unknown'),
                        _t('adv.test.signalStrength.level.poor', 'Poor'),
                        _t('adv.test.signalStrength.level.moderate', 'Moderate'),
                        _t('adv.test.signalStrength.level.good', 'Good'),
                        _t('adv.test.signalStrength.level.excellent', 'Excellent')
                    ];
                    msg = `LTE level ${level}/4 (${levels[level] || 'Unknown'})`;
                    passed = level >= 2;
                }
            } else {
                const anyMatch = output.match(/level=(\d+)/);
                if (anyMatch) {
                    const lvl = parseInt(anyMatch[1]);
                    if (lvl >= 0 && lvl <= 4) {
                        level = lvl;
                        const levels = [
                            _t('adv.test.signalStrength.level.unknown', 'Unknown'),
                            _t('adv.test.signalStrength.level.poor', 'Poor'),
                            _t('adv.test.signalStrength.level.moderate', 'Moderate'),
                            _t('adv.test.signalStrength.level.good', 'Good'),
                            _t('adv.test.signalStrength.level.excellent', 'Excellent')
                        ];
                        msg = `Signal level ${level}/4 (${levels[level] || 'Unknown'})`;
                        passed = level >= 2;
                    }
                }
            }

            return {
                name,
                passed,
                message: msg,
                fix: passed ? '' : _t('adv.test.signalStrength.fix', 'Move to an area with better coverage or check antenna.')
            };
        } catch (e) {
            return {
                name,
                passed: true,
                message: _t('adv.test.signalStrength.message.unavailable', 'Unable to read signal'),
                fix: ''
            };
        }
    }

    async function testStorageIOErrors() {
        const name = _t('adv.test.storageIO.name', 'Storage I/O Errors');
        try {
            let foundErrors = [];
            let usedMethod = 'logcat';
            const buffers = ['main', 'system', 'kernel', 'events'];
            const rawLines = [];
            for (const buffer of buffers) {
                try {
                    const result = await adb(`logcat -d -b ${buffer} -t 3000`);
                    const lines = (result.output || '').split('\n');
                    rawLines.push(...lines);
                } catch (_) {}
            }
            const patterns = [
                /EXT4-fs error/i,
                /F2FS-fs.*error/i,
                /blk_update_request.*I\/O error/i,
                /Buffer I\/O error on device/i,
                /mmcblk.*I\/O error/i,
                /ufshcd.*error/i,
                /critical target error/i
            ];
            for (const line of rawLines) {
                if (line.includes('adbd service requested')) continue;
                if (line.includes('logcat -d')) continue;
                for (const pattern of patterns) {
                    if (pattern.test(line)) {
                        foundErrors.push(line.trim());
                        break;
                    }
                }
            }
            foundErrors = [...new Set(foundErrors)];
            if (foundErrors.length === 0) {
                try {
                    const dmesg = await adb('dmesg 2>/dev/null');
                    const lines = (dmesg.output || '').split('\n');
                    for (const line of lines) {
                        if (/mmc.*error|ufs.*error|Buffer I\/O error/i.test(line)) {
                            foundErrors.push(line.trim());
                            usedMethod = 'dmesg';
                        }
                    }
                } catch (_) {}
            }
            const hasErrors = foundErrors.length > 0;
            return {
                name,
                passed: !hasErrors,
                message: hasErrors
                    ? `${foundErrors.length} I/O error(s) detected (${usedMethod})`
                    : _t('adv.test.storageIO.message.none', 'No storage I/O errors found'),
                fix: hasErrors
                    ? _t('adv.test.storageIO.fix', 'Storage corruption detected. Backup data immediately and replace storage.')
                    : ''
            };
        } catch (e) {
            return {
                name,
                passed: false,
                message: _t('adv.common.error', 'Error: ') + e.message,
                fix: _t('adv.test.storageIO.fixError', 'Check storage health.')
            };
        }
    }

    async function testStorageSpeed() {
        const name = _t('adv.test.storageSpeed.name', 'Storage Speed');
        try {
            let result = await adb('dd if=/dev/zero of=/sdcard/speedtest.tmp bs=1m count=100 2>&1');
            const output = result.output || '';
            const match = output.match(/(\d+(?:\.\d+)?)\s*bytes\/sec/);
            let mbps = null;
            if (match) {
                const bytesPerSec = parseFloat(match[1]);
                mbps = bytesPerSec / (1024 * 1024);
            } else {
                try {
                    const start = Date.now();
                    await adb('head -c 100M /dev/zero > /sdcard/speedtest.tmp 2>/dev/null');
                    const elapsed = (Date.now() - start) / 1000;
                    if (elapsed > 0) mbps = 100 / elapsed;
                } catch (_) {}
            }
            try { await adb('rm -f /sdcard/speedtest.tmp'); } catch (_) {}
            const passed = mbps !== null && mbps >= 10;
            return {
                name,
                passed,
                message: mbps !== null ? `${mbps.toFixed(1)} MB/s` : _t('adv.test.storageSpeed.message.unable', 'Unable to measure'),
                fix: passed ? '' : _t('adv.test.storageSpeed.fix', 'Storage may be failing or nearly full. Free up space or replace storage.')
            };
        } catch (e) {
            try {
                const start = Date.now();
                await adb('cat /dev/zero | head -c 100M > /sdcard/speedtest.tmp 2>/dev/null');
                const elapsed = (Date.now() - start) / 1000;
                let mbps = elapsed > 0 ? 100 / elapsed : null;
                try { await adb('rm -f /sdcard/speedtest.tmp'); } catch (_) {}
                const passed = mbps !== null && mbps >= 10;
                return {
                    name,
                    passed,
                    message: mbps !== null ? `${mbps.toFixed(1)} MB/s` : _t('adv.test.storageSpeed.message.unable', 'Unable to measure'),
                    fix: passed ? '' : _t('adv.test.storageSpeed.fix', 'Storage may be failing or nearly full. Free up space or replace storage.')
                };
            } catch (e2) {
                return {
                    name,
                    passed: false,
                    message: _t('adv.common.error', 'Error: ') + e2.message,
                    fix: _t('adv.test.storageSpeed.fixError', 'Check device storage health.')
                };
            }
        }
    }

    async function testMemoryLeaks() {
        const name = _t('adv.test.memoryLeak.name', 'Memory Leak');
        try {
            const fgResult = await adb('dumpsys window | grep mCurrentFocus | head -1');
            const focusLine = fgResult.output || '';
            let pkg = null;
            const pkgMatch = focusLine.match(/u0\s+([\w.]+)/);
            if (pkgMatch) {
                pkg = pkgMatch[1];
            } else {
                try {
                    const topResult = await adb('dumpsys activity activities | grep "TaskRecord" | head -1');
                    const topMatch = topResult.output.match(/TaskRecord.*?([\w.]+)\//);
                    if (topMatch) pkg = topMatch[1];
                } catch (_) {}
            }
            if (!pkg || pkg === 'NotificationShade' || pkg === 'SystemUI' || pkg.includes('launcher')) {
                return {
                    name,
                    passed: true,
                    message: _t('adv.test.memoryLeak.message.skipped', 'Skipped (no foreground app detected)'),
                    fix: ''
                };
            }
            const samples = [];
            const sampleCount = 3;
            const intervalMs = 5000;
            for (let i = 0; i < sampleCount; i++) {
                const memResult = await adb(`dumpsys meminfo ${pkg} | grep TOTAL`);
                const memMatch = memResult.output.match(/TOTAL\s+(\d+)/);
                samples.push(memMatch ? parseInt(memMatch[1]) : 0);
                if (i < sampleCount - 1) await new Promise(r => setTimeout(r, intervalMs));
            }
            let leaking = false;
            if (samples.length >= 2) {
                let increasing = true;
                for (let i = 1; i < samples.length; i++) {
                    if (samples[i] <= samples[i-1]) { increasing = false; break; }
                }
                leaking = increasing && (samples[samples.length-1] - samples[0] > 5000);
            }
            const current = samples[samples.length-1] || 0;
            return {
                name,
                passed: !leaking,
                message: leaking ? `PSS grew from ${samples[0]}KB to ${current}KB (possible leak)` : `PSS: ${current}KB (stable)`,
                fix: leaking ? _t('adv.test.memoryLeak.fix', 'Restart the app or device. If persistent, app has memory leak.') : ''
            };
        } catch (e) {
            return {
                name,
                passed: false,
                message: _t('adv.common.error', 'Error: ') + e.message,
                fix: _t('adv.test.memoryLeak.fixError', 'Check app memory usage.')
            };
        }
    }

    async function testSensors() {
        const name = _t('adv.test.sensors.name', 'Sensor Health');
        try {
            let output = '';
            let usedService = '';
            try {
                const result = await adb('dumpsys sensorservice');
                output = result.output;
                usedService = 'sensorservice';
            } catch (_) {
                try {
                    const result2 = await adb('dumpsys sensors');
                    output = result2.output;
                    usedService = 'sensors';
                } catch (_) {
                    return { name, passed: true, message: _t('adv.test.sensors.message.notAccessible', 'Sensor service not accessible'), fix: '' };
                }
            }
            if (output.includes("Can't find service") || output.includes("No such service")) {
                if (usedService === 'sensorservice') {
                    try {
                        const result3 = await adb('dumpsys sensors');
                        output = result3.output;
                        usedService = 'sensors';
                    } catch (_) {
                        return { name, passed: true, message: _t('adv.test.sensors.message.notAvailable', 'Sensor service not available'), fix: '' };
                    }
                } else {
                    try {
                        const result3 = await adb('dumpsys sensorservice');
                        output = result3.output;
                        usedService = 'sensorservice';
                    } catch (_) {
                        return { name, passed: true, message: _t('adv.test.sensors.message.notAvailable', 'Sensor service not available'), fix: '' };
                    }
                }
            }
            const lower = output.toLowerCase();
            const hasAccel = lower.includes('accelerometer') || lower.includes('sc7a20e');
            const hasGyro = lower.includes('gyroscope') || lower.includes('gyro');
            const hasProx = lower.includes('proximity') || lower.includes('prox');
            const hasLight = lower.includes('light') || lower.includes('als');
            const hasMag = lower.includes('magnetic') || lower.includes('mmc5603');
            const hasStep = lower.includes('step counter') || lower.includes('step detector');
            const present = [];
            if (hasAccel) present.push('Accel');
            if (hasGyro) present.push('Gyro');
            if (hasProx) present.push('Prox');
            if (hasLight) present.push('Light');
            if (hasMag) present.push('Magnetometer');
            if (hasStep) present.push('Step');
            const passed = present.length > 0;
            const msg = present.length ? `${present.join(', ')} detected` : _t('adv.test.sensors.message.none', 'No sensors detected (unexpected)');
            return {
                name,
                passed,
                message: msg + (usedService ? ` (via ${usedService})` : ''),
                fix: passed ? '' : _t('adv.test.sensors.fix', 'Sensors may be disabled or hardware issue. Check `dumpsys sensorservice` for details.')
            };
        } catch (e) {
            return { name, passed: true, message: _t('adv.common.error', 'Error: ') + e.message, fix: '' };
        }
    }

    async function testRootStatus() {
        const name = _t('adv.test.rootStatus.name', 'Bootloader/Security Status');
        try {
            const result = await adb('getprop ro.boot.verifiedbootstate');
            const state = result.output.trim();
            let passed = true;
            let msg = state || _t('adv.common.unknown', 'Unknown');
            if (state === 'orange' || state === 'yellow') passed = false;
            return {
                name,
                passed,
                message: msg,
                fix: passed ? '' : _t('adv.test.rootStatus.fix', 'Bootloader unlocked or tampered – relock if possible, reflash stock firmware.')
            };
        } catch (e) {
            return { name, passed: true, message: _t('adv.common.unknown', 'Unknown'), fix: '' };
        }
    }

    async function testSecurityPatch() {
        const name = _t('adv.test.securityPatch.name', 'Security Patch Level');
        try {
            const result = await adb('getprop ro.build.version.security_patch');
            const patch = result.output.trim();
            let passed = true;
            let msg = patch || _t('adv.common.unknown', 'Unknown');
            if (patch && patch !== 'unknown') {
                const parts = patch.split('-');
                if (parts.length === 3) {
                    const year = parseInt(parts[0]);
                    const month = parseInt(parts[1]);
                    const now = new Date();
                    const patchDate = new Date(year, month - 1, 1);
                    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
                    if (patchDate < sixMonthsAgo) passed = false;
                }
            }
            return {
                name,
                passed,
                message: msg,
                fix: passed ? '' : _t('adv.test.securityPatch.fix', 'Update your device via system settings to get the latest security fixes.')
            };
        } catch (e) {
            return { name, passed: true, message: _t('adv.common.notAvailable', 'Not available'), fix: '' };
        }
    }

    async function testNetworkType() {
        const name = _t('adv.test.networkType.name', 'Network Type');
        try {
            try { await adb('svc wifi disable'); } catch (_) {}
            try { await adb('settings put global wifi_on 0'); } catch (_) {}
            try { await adb('cmd wifi set-wifi-enabled disabled'); } catch (_) {}
            try { await adb('svc data enable'); } catch (_) {}
            try { await adb('settings put global mobile_data 1'); } catch (_) {}
            await new Promise(r => setTimeout(r, 2500));
            let dataEnabled = false;
            try {
                const dataCheck = await adb('settings get global mobile_data');
                dataEnabled = (dataCheck.output || '').trim() === '1';
            } catch (_) {}
            const result = await adb('dumpsys telephony.registry');
            const output = result.output || '';
            let tech = null;
            const psMatch = output.match(/domain=PS\s+transportType=WWAN.*?accessNetworkTechnology=(\w+).*?availableServices=\[DATA\]/i);
            if (psMatch) tech = psMatch[1].toUpperCase();
            if (!tech) {
                const anyMatch = output.match(/accessNetworkTechnology=(\w+)/i);
                if (anyMatch) tech = anyMatch[1].toUpperCase();
            }
            let simState = '';
            try {
                const simResult = await adb('getprop gsm.sim.state');
                simState = (simResult.output || '').trim().toLowerCase();
            } catch (_) {}
            if (!tech) {
                if (simState.includes('absent') || simState.includes('unknown')) {
                    return { name, passed: true, message: _t('adv.test.networkType.message.noSim', 'No SIM installed — mobile data not applicable'), fix: '' };
                }
                return {
                    name,
                    passed: false,
                    message: dataEnabled ? _t('adv.test.networkType.message.notRegistered', 'Not available (radio not registered)') : _t('adv.test.networkType.message.toggleFailed', 'Mobile data off — toggle failed'),
                    fix: dataEnabled ? _t('adv.test.networkType.fix.simApn', 'Check SIM or APN settings.') : _t('adv.test.networkType.fix.manual', 'Failed to enable mobile data. Try manually.')
                };
            }
            const isModern = tech !== 'UNKNOWN' && tech !== 'GPRS' && tech !== 'EDGE' && tech !== 'GSM';
            return {
                name,
                passed: isModern,
                message: tech,
                fix: isModern ? '' : _t('adv.test.networkType.fix.slow', 'Slow network – upgrade plan or change location.')
            };
        } catch (e) {
            return {
                name,
                passed: false,
                message: _t('adv.common.error', 'Error: ') + e.message,
                fix: _t('adv.test.networkType.fix.radio', 'Check radio status.')
            };
        }
    }

    async function testImeiPresent() {
    const name = _t('adv.test.imei.name', 'IMEI Present');
    let imei = null;
    let method = '';

    // ---- Reliable methods only (no service call) ----
    const attempts = [
        // 1. getprop
        async () => {
            const props = ['ro.imei', 'gsm.imei', 'persist.radio.imei', 'ro.ril.imei'];
            for (const prop of props) {
                try {
                    const result = await adb(`getprop ${prop}`);
                    const val = result.output.trim();
                    if (val && val.length >= 14) {
                        imei = val;
                        method = `getprop ${prop}`;
                        return true;
                    }
                } catch (_) {}
            }
            return false;
        },
        // 2. dumpsys telephony.registry
        async () => {
            try {
                const result = await adb('dumpsys telephony.registry | grep -i "imei"');
                const output = result.output || '';
                const match = output.match(/imei[:=]\s*(\d{14,17})/i);
                if (match) {
                    imei = match[1];
                    method = 'dumpsys telephony.registry';
                    return true;
                }
            } catch (_) {}
            return false;
        },
        // 3. dumpsys iphonesubinfo
        async () => {
            try {
                const result = await adb('dumpsys iphonesubinfo 2>&1');
                const output = result.output || '';
                const match = output.match(/Device ID[:=]\s*(\d{14,17})/i);
                if (match) {
                    imei = match[1];
                    method = 'dumpsys iphonesubinfo';
                    return true;
                }
            } catch (_) {}
            return false;
        },
        // 4. dumpsys phone
        async () => {
            try {
                const result = await adb('dumpsys phone 2>/dev/null | grep -i "imei"');
                const output = result.output || '';
                const match = output.match(/imei[:=]\s*(\d{14,17})/i);
                if (match) {
                    imei = match[1];
                    method = 'dumpsys phone';
                    return true;
                }
            } catch (_) {}
            return false;
        }
    ];

    // Run attempts with a timeout per attempt (15 seconds total)
    const timeout = 15000;
    const start = Date.now();

    for (const attempt of attempts) {
        if (Date.now() - start > timeout) break;
        try {
            if (await attempt()) break;
        } catch (_) {
            // Continue to next method
        }
    }

    const passed = imei !== null && imei.length >= 14;
    const message = passed
        ? `IMEI present (${method})`
        : _t('adv.test.imei.message.fallback', 'IMEI not accessible — try dialing `*#06#` manually');
    const fix = passed
        ? ''
        : _t('adv.test.imei.fix', 'IMEI read requires privileged ADB context or root. This is expected on Android 10+. You can view it manually by dialing `*#06#`.');

    return { name, passed, message, fix };
}

    async function testChargingCurrent() {
        const name = _t('adv.test.chargingCurrent.name', 'Charging Current');
        try {
            let current = 0;
            try {
                const bat = await apiCall('/hardware/battery');
                if (bat.maxChargingCurrent) current = parseFloat(bat.maxChargingCurrent);
                else if (bat.max_current) current = parseFloat(bat.max_current);
            } catch (_) {}
            if (current === 0) {
                const dump = await adb('dumpsys battery');
                const match = dump.output.match(/Max charging current:\s*(\d+)/);
                if (match) {
                    current = parseInt(match[1]);
                    if (current > 10000) current = Math.round(current / 1000);
                }
            }
            if (current === 0) {
                try {
                    const sys = await adb('cat /sys/class/power_supply/battery/current_now 2>/dev/null');
                    const raw = sys.output.trim();
                    if (raw) {
                        const val = parseInt(raw);
                        if (!isNaN(val) && val !== 0) current = Math.round(Math.abs(val) / 1000);
                    }
                } catch (_) {}
            }
            if (current === 0) {
                return { name, passed: true, message: _t('adv.test.chargingCurrent.message.notReported', 'Not reported by this device'), fix: '' };
            }
            const passed = current >= 400;
            return {
                name,
                passed,
                message: `${current} mA`,
                fix: passed ? '' : _t('adv.test.chargingCurrent.fix', 'Low charging current detected – check cable, charger, or USB port.')
            };
        } catch (e) {
            return { name, passed: true, message: _t('adv.common.notAvailable', 'Not available'), fix: '' };
        }
    }

    async function testBatteryCycleCount() {
        const name = _t('adv.test.batteryCycle.name', 'Battery Cycle Count');
        try {
            const result = await adb('cat /sys/class/power_supply/battery/cycle_count 2>/dev/null || echo "unavailable"');
            const output = (result.output || '').trim();
            let count = parseInt(output);
            const available = !isNaN(count) && output !== 'unavailable';
            const plausible = available && count >= 0 && count <= 3000;
            if (available && !plausible) {
                return {
                    name,
                    passed: true,
                    message: _t('adv.test.batteryCycle.message.invalid', `Reported value (${count}) is not a valid cycle count on this device`),
                    fix: ''
                };
            }
            const passed = !available || count < 500;
            return {
                name,
                passed,
                message: available ? `${count} cycles` : _t('adv.common.notAvailable', 'Not available'),
                fix: passed ? '' : _t('adv.test.batteryCycle.fix', 'Battery has high cycle count (>500). Consider replacement.')
            };
        } catch (e) {
            return { name, passed: true, message: _t('adv.common.notAvailable', 'Not available'), fix: '' };
        }
    }

    async function testChargingType() {
        const name = _t('adv.test.chargingType.name', 'Charging Type');
        try {
            const battery = await apiCall('/hardware/battery');
            const plugged = battery.plugged || 0;
            const map = {
                0: _t('adv.test.chargingType.type.notCharging', 'Not charging'),
                1: _t('adv.test.chargingType.type.ac', 'AC (wired)'),
                2: _t('adv.test.chargingType.type.usb', 'USB'),
                4: _t('adv.test.chargingType.type.wireless', 'Wireless')
            };
            const type = map[plugged] || _t('adv.common.unknown', 'Unknown');
            const passed = plugged !== 0;
            return {
                name,
                passed,
                message: type,
                fix: passed ? '' : _t('adv.test.chargingType.fix', 'Device is not charging. Check cable, charger, or port.')
            };
        } catch (e) {
            return {
                name,
                passed: false,
                message: _t('adv.common.error', 'Error: ') + e.message,
                fix: _t('adv.test.chargingType.fixError', 'Check charging hardware.')
            };
        }
    }

    // ====== RUN SOFTWARE TESTS (no hardware) ======
    async function runSoftwareDiagnostics() {
        const tests = [
            testAppCrashes,
            testANR,
            testKernelPanic,
            testSystemServiceCrashes,
            testStorageHealth,
            testBackgroundWakeups,
            testUIJank,
            testNetworkStack,
            testThermalThrottling,
            testGhostTouch,
            testCPUTemperature,
            testBatteryVoltage,
            testBatteryHealth,
            testSignalStrength,
            testNetworkType,
            testStorageSpeed,
            testStorageIOErrors,
            testMemoryLeaks,
            testSensors,
            testRootStatus,
            testSecurityPatch,
            testImeiPresent,
            testChargingCurrent,
            testBatteryCycleCount,
            testChargingType
        ];
        const results = [];
        for (const testFn of tests) {
            try {
                const res = await testFn();
                if (res && typeof res === 'object' && res.name && typeof res.passed !== 'undefined') {
                    results.push(res);
                } else {
                    results.push({
                        name: testFn.name || 'Unknown',
                        passed: false,
                        message: 'Test returned invalid result',
                        fix: 'Check test implementation.'
                    });
                }
            } catch (e) {
                results.push({
                    name: testFn.name || 'Unknown Test',
                    passed: false,
                    message: `Error: ${e.message}`,
                    fix: 'Check device connectivity.'
                });
            }
        }
        return results;
    }

    // ---- Deep & Rootkit scans ----
    async function performDeepScan(deviceId) {
        const urls = [
            `/deep-scan/${deviceId}/full?raw=0`,
            `/deep-scan?deviceId=${deviceId}`,
            `/api/deep-scan?deviceId=${deviceId}`
        ];
        let lastError;
        for (const url of urls) {
            try {
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    let summary = 'No issues found';
                    if (data.health?.summary) summary = data.health.summary;
                    else if (data.findings?.length) summary = `${data.findings.length} findings`;
                    else if (data.summary) summary = data.summary;
                    else if (data.message) summary = data.message;
                    return { summary };
                }
                lastError = `HTTP ${res.status}: ${res.statusText}`;
            } catch (e) {
                lastError = e.message;
            }
        }
        return { summary: `Deep scan unavailable: ${lastError}` };
    }

    async function performRootkitScan(deviceId, lang = _getLang()) {
    const primaryUrl = `/api/rootkit-scan?deviceId=${encodeURIComponent(deviceId)}&lang=${encodeURIComponent(lang)}`;
    try {
        const res = await fetch(primaryUrl);
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            let summary = data.summary || 'Rootkit scan completed';
            let summaryKey = data.summaryKey || null;
            // If summaryKey is provided, we will use it for translation
            return { summary, summaryKey };
        }
        let errorDetail = `HTTP ${res.status}`;
        if (data.error) errorDetail = data.error;
        else if (data.message) errorDetail = data.message;
        return { summary: `Rootkit scan unavailable: ${errorDetail}`, summaryKey: 'rootkit.unavailable' };
    } catch (e) {
        return { summary: `Rootkit scan unavailable: ${e.message}`, summaryKey: 'rootkit.unavailable' };
    }
}

    // ---- AI Root Cause Analysis ----
    async function runAIAnalysis(deviceId, softwareResults, deep, rootkit) {
        try {
            const diagStages = { software: softwareResults, deep, rootkit };
            const total = softwareResults.length;
            const passed = softwareResults.filter(t => t.passed).length;
            const healthScore = total > 0 ? Math.round((passed / total) * 100) : 0;
            const failingTests = softwareResults.filter(t => !t.passed).map(t => t.name).join(', ');

            const response = await fetch('/ai-adb-conclude', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    deviceId: deviceId,
                    diagStages: diagStages,
                    diagDetails: {
                        selectedReports: ['software', 'deep', 'rootkit'],
                        healthScore: healthScore,
                        failingTests: failingTests || 'None',
                        totalChecks: total,
                        passedChecks: passed
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`AI request failed (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            if (!data.ok || !data.conclusion) {
                throw new Error('AI returned no conclusion');
            }

            return {
                summary: data.conclusion.humanSummary || data.conclusion.likelyCause || 'No clear cause identified.',
                actions: data.conclusion.actions || ['Review the test results above for clues.'],
                nextStep: data.conclusion.nextStep || null,
                confidence: data.conclusion.confidence || 'Medium'
            };
        } catch (error) {
            console.error('[AIAnalysis] Error:', error);
            return {
                summary: 'AI analysis temporarily unavailable. Please review the test results manually.',
                actions: ['Check the test results above for failing checks.'],
                nextStep: null,
                confidence: 'Unknown'
            };
        }
    }

   // ---- Public API ----
window.SmartHub = window.SmartHub || {};
window.SmartHub.advanceDiagnostic = {
    runFullSuite: async function(deviceId, onProgress) {
        currentDeviceId = deviceId;
        if (typeof onProgress === 'function') onProgress(_t('adv.progress.software', 'Running software diagnostics...'));

        const softwareResults = await runSoftwareDiagnostics();

        if (typeof onProgress === 'function') onProgress(_t('adv.progress.deep', 'Running deep & rootkit scans...'));
        const [deep, rootkit] = await Promise.all([
            performDeepScan(deviceId),
            performRootkitScan(deviceId)
        ]);

        if (typeof onProgress === 'function') onProgress(_t('adv.progress.ai', 'Analyzing with AI...'));
        const aiConclusion = await runAIAnalysis(deviceId, softwareResults, deep, rootkit);

        diagResults = { software: softwareResults, deep, rootkit, ai: aiConclusion };
        if (typeof onProgress === 'function') onProgress(_t('adv.progress.done', 'Done'));
        return diagResults;
    },

    getResults: function() { return diagResults; },

    // 👇 NEW: Load external data and render full results
    loadAndRender: function(data, containerId) {
        if (!data) return;
        diagResults = data;
        _currentContainerId = containerId || 'advancedDiagContainer';
        _lastRenderResults = data;
        this._doRender(_currentContainerId);
    },

    renderResults: function(containerId) {
        _currentContainerId = containerId;
        _lastRenderResults = diagResults;
        this._doRender(containerId);
    },

    _doRender: function(containerId) {
    if (_isRendering) return;
    _isRendering = true;
    try {
        const container = document.getElementById(containerId);
        if (!container || !diagResults) return;

        const { software, deep, rootkit, ai } = diagResults;
        let html = '';

        const validSoftware = (software || []).filter(t => t && typeof t.passed !== 'undefined');
        const total = validSoftware.length;
        const passed = validSoftware.filter(t => t.passed).length;
        const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
        const color = pct >= 80 ? '#2e7d32' : pct >= 50 ? '#ed6c02' : '#d32f2f';
        const icon = pct >= 80 ? '✅' : pct >= 50 ? '⚠️' : '❌';

        html += `
            <div style="margin-bottom:16px; padding:16px; background:${color}10; border-radius:12px; border:1px solid ${color}30; display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
                <div style="font-size:32px;">${icon}</div>
                <div>
                    <strong style="font-size:20px; color:${color};">${pct}%</strong>
                    <span style="color:#6B7280; font-size:14px; margin-left:8px;">${passed}/${total} ${_t('adv.checksPassed', 'checks passed')}</span>
                </div>
                <div style="flex:1; min-width:100px;">
                    <div style="background:#e5e7eb; border-radius:8px; height:8px; overflow:hidden;">
                        <div style="width:${pct}%; background:${color}; height:100%; border-radius:8px;"></div>
                    </div>
                </div>
            </div>
        `;

        // ---- Deep & Rootkit summaries ----
        if (deep || rootkit) {
            html += `<div style="display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; font-size: 14px; color: #374151;">`;
            if (deep) {
                let deepText = deep.summary || 'No issues';
                const match = deepText.match(/(\d+)\s+findings/);
                const displayText = match 
                    ? `${match[1]} ${_t('adv.deepScan.issues', 'issues')}` 
                    : deepText;
                html += `
                    <span style="background: #e8f5e9; padding: 4px 14px; border-radius: 16px; display: inline-flex; align-items: center; gap: 6px;">
                        🔬 ${_t('adv.result.deepScan', 'Deep Scan')}: <strong>${escapeHtml(displayText)}</strong>
                    </span>
                `;
            }
            if (rootkit) {
                let summaryText = rootkit.summary || 'Clean';
                if (rootkit.summaryKey) {
                    summaryText = _t('adv.rootkit.' + rootkit.summaryKey, summaryText);
                }
                const isOk = !rootkit.summary?.toLowerCase().includes('unavailable') && !rootkit.summary?.toLowerCase().includes('error');
                const iconRoot = isOk ? '✅' : '⚠️';
                html += `
                    <span style="background: ${isOk ? '#e8f5e9' : '#ffebee'}; padding: 4px 14px; border-radius: 16px; display: inline-flex; align-items: center; gap: 6px;">
                        🛡️ ${_t('adv.result.rootkit', 'Rootkit')}: <strong>${escapeHtml(summaryText)}</strong> ${iconRoot}
                    </span>
                `;
            }
            html += `</div>`;
        }

        // ---- Individual tests (with translation) ----
        if (validSoftware.length > 0) {
            // --- Translation maps (defined ONCE, before the loop) ---
            const messageMap = {
                'No recent crashes': _t('adv.test.appCrashes.message.noCrashes', 'No recent crashes'),
                'No ANR detected': _t('adv.test.anr.message.noAnr', 'No ANR detected'),
                'Uptime >24h, ignoring old panic logs': _t('adv.test.kernelPanic.message.uptimeOk', 'Uptime >24h, ignoring old panic logs'),
                'Stable': _t('adv.test.systemService.message.stable', 'Stable'),
                'No storage I/O errors found': _t('adv.test.storageIO.message.none', 'No storage I/O errors found'),
                'No frame data available (app may be idle)': _t('adv.test.uiJank.message.noData', 'No frame data available (app may be idle)'),
                'No ghost touch (0 recent events)': _t('adv.test.ghostTouch.message.none', 'No ghost touch (0 recent events)'),
                'Unable to read (thermal zones not accessible on this device)': _t('adv.test.cpuTemp.message.unavailable', 'Unable to read (thermal zones not accessible on this device)'),
                'Good': _t('adv.test.batteryHealth.message.good', 'Good'),
                'LTE level 3/4 (Good)': _t('adv.test.signalStrength.message.lteGood', 'LTE level 3/4 (Good)'),
                'PSS grew from {old}KB to {new}KB (possible leak)': _t('adv.test.memoryLeak.message.leak', 'PSS grew from {old}KB to {new}KB (possible leak)'),
                'Reported value ({count}) is not a valid cycle count on this device': _t('adv.test.batteryCycle.message.invalid', 'Reported value ({count}) is not a valid cycle count on this device'),
            };

            const fixMap = {
                'Restart the app or device. If persistent, app has memory leak.': _t('adv.test.memoryLeak.fix', 'Restart the app or device. If persistent, app has memory leak.'),
                'Update your device via system settings to get the latest security fixes.': _t('adv.test.securityPatch.fix', 'Update your device via system settings to get the latest security fixes.'),
                'IMEI read requires privileged ADB context or root. This is expected on Android 10+. You can view it manually by dialing `*#06#`.': _t('adv.test.imei.fix', 'IMEI read requires privileged ADB context or root. This is expected on Android 10+. You can view it manually by dialing `*#06#`.'),
                'Try recalibration via `*#*#2664#*#*`. Disable "High touch sensitivity". Reflash touch firmware.': _t('adv.test.ghostTouch.fix', 'Try recalibration via `*#*#2664#*#*`. Disable "High touch sensitivity". Reflash touch firmware.'),
            };

            html += `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px,1fr)); gap:12px;">`;
            for (const test of validSoftware) {
                const cardColor = test.passed ? '#2e7d32' : '#d32f2f';
                const bgColor = test.passed ? '#e8f5e9' : '#ffebee';
                const iconTest = test.passed ? '✅' : '❌';

                // ---- Translate message ----
                let messageText = test.message || '';
                if (messageMap[messageText]) {
                    messageText = messageMap[messageText];
                    // Handle dynamic placeholders
                    if (test.message && test.message.includes('{old}')) {
                        const match = test.message.match(/PSS grew from (\d+)KB to (\d+)KB/);
                        if (match) {
                            messageText = messageText.replace('{old}', match[1]).replace('{new}', match[2]);
                        }
                    }
                    if (test.message && test.message.includes('{count}')) {
                        const match = test.message.match(/Reported value \((\d+)\)/);
                        if (match) {
                            messageText = messageText.replace('{count}', match[1]);
                        }
                    }
                } else {
                    // Fallback: try key-based translation if test.key exists
                    if (test.key) {
                        const keyMsg = `adv.test.${test.key}.message`;
                        const translated = _t(keyMsg, null);
                        if (translated !== keyMsg) {
                            messageText = translated;
                        }
                    }
                }

                // ---- Translate fix ----
                let fixText = test.fix || '';
                if (fixMap[fixText]) {
                    fixText = fixMap[fixText];
                } else {
                    if (test.key) {
                        const keyFix = `adv.test.${test.key}.fix`;
                        const translated = _t(keyFix, null);
                        if (translated !== keyFix) {
                            fixText = translated;
                        }
                    }
                }

                let fixHtml = '';
                if (!test.passed && fixText) {
                    fixHtml = `<div style="font-size:12px; margin-top:6px; background:#f5f5f5; padding:6px 10px; border-radius:4px; color:#333;">
                        <strong>🔧 ${_t('adv.result.fix', 'Fix')}:</strong> ${escapeHtml(fixText)}
                    </div>`;
                }

                html += `
                    <div style="background:${bgColor}; border-radius:8px; padding:12px; border-left:4px solid ${cardColor};">
                        <div style="font-weight:600; font-size:14px;">${iconTest} ${escapeHtml(test.name)}</div>
                        <div style="font-size:13px; color:#555; margin-top:4px;">${escapeHtml(messageText)}</div>
                        ${fixHtml}
                    </div>
                `;
            }
            html += `</div>`;
        } else {
            html += `<div style="padding:12px; background:#fef3c7; border-radius:8px; color:#92400e;">${_t('adv.result.noResults', 'No test results available.')}</div>`;
        }

        // ---- AI Conclusion (keep existing code) ----
        if (ai) {
            // Placeholder – replace with your actual AI rendering logic
            html += `
                <div style="margin-top:24px; padding:16px; background:#f0f4ff; border-radius:12px; border:1px solid #c7d2fe;">
                    <h4 style="margin:0 0 8px 0; color:#1e3a8a;">🧠 ${_t('adv.result.conclusion', 'AI Diagnosis')}</h4>
                    <p>${escapeHtml(ai.summary || '')}</p>
                    ${ai.actions ? `<ul>${ai.actions.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>` : ''}
                    ${ai.nextStep ? `<p><strong>📌 ${_t('adv.result.nextStep', 'Next Step')}:</strong> ${escapeHtml(ai.nextStep)}</p>` : ''}
                    <p style="font-size:12px; color:#6B7280;">${_t('adv.result.confidence', 'Confidence')}: ${escapeHtml(ai.confidence || 'Medium')}</p>
                </div>
            `;
        }

        container.innerHTML = html;
    } finally {
        _isRendering = false;
    }
}
};

    // ---- Language change listener (safe, non-looping) ----
    let _languageChangeHandler = function(e) {
        const lang = e.detail.lang;
        // Only re-render if we have a container and stored results, and we are not already rendering
        if (_currentContainerId && _lastRenderResults && !_isRendering) {
            diagResults = _lastRenderResults;
            window.SmartHub.advanceDiagnostic._doRender(_currentContainerId);
        }
    };
    document.removeEventListener('languageChanged', _languageChangeHandler);
    document.addEventListener('languageChanged', _languageChangeHandler);

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    // ---- Helper: get device ID from status bar ----
    function getDeviceIdFromStatusBar() {
        const statusSpan = document.querySelector('#connectionStatus span');
        if (statusSpan) {
            const text = statusSpan.textContent;
            const match = text.match(/ADB:\s*([A-Fa-f0-9]+)/);
            if (match) return match[1];
        }
        return null;
    }

    // ---- Expose the page renderer as a global function ----
    window.renderAdvancedDiagnostic = async function() {
    const container = document.getElementById('pageContent');

    function getCurrentDeviceId() {
        if (window.currentDeviceId) return window.currentDeviceId;
        const statusSpan = document.querySelector('#connectionStatus span');
        if (statusSpan) {
            const text = statusSpan.textContent;
            const match = text.match(/ADB:\s*([A-Fa-f0-9]+)/);
            if (match) return match[1];
        }
        return null;
    }

    let deviceId = getCurrentDeviceId();

    // ---- No device: show loading spinner ----
    if (!deviceId) {
        container.innerHTML = `
            <div style="margin-bottom: 24px;">
                <h1 style="margin-bottom: 6px; font-size: 24px; font-weight: 700; color: #1f2937;" data-i18n="adv.page.title">${_t('adv.page.title', '🔍 Advanced Diagnostics')}</h1>
                <p style="color: #6b7280; font-size: 14px; margin: 0;" data-i18n="adv.page.subtitle">${_t('adv.page.subtitle', 'A deeper pass across software behavior, installed apps, and rootkit indicators.')}</p>
            </div>
            <div class="card" style="text-align: center; padding: 40px; background: #f8fafc; border: 1px solid #e5e7eb;">
                <div style="position: relative; width: 60px; height: 60px; margin: 0 auto 16px;">
                    <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; border: 4px solid transparent; border-top-color: #3b82f6; border-right-color: #60a5fa; border-bottom-color: #93c5fd; animation: spin 0.9s cubic-bezier(0.65, 0, 0.35, 1) infinite;"></div>
                    <div style="position: absolute; width: 80%; height: 80%; top: 10%; left: 10%; border-radius: 50%; border: 4px solid transparent; border-top-color: #7c3aed; border-right-color: #a78bfa; border-bottom-color: #c4b5fd; animation: spin 1.1s cubic-bezier(0.65, 0, 0.35, 1) infinite reverse;"></div>
                    <div style="position: absolute; width: 60%; height: 60%; top: 20%; left: 20%; border-radius: 50%; border: 4px solid transparent; border-top-color: #10b981; border-right-color: #34d399; border-bottom-color: #6ee7b7; animation: spin 1.3s cubic-bezier(0.65, 0, 0.35, 1) infinite;"></div>
                </div>
                <h2 style="color: #1f2937; font-size: 18px; font-weight: 600; margin-bottom: 8px;" data-i18n="adv.page.waitingDevice">${_t('adv.page.waitingDevice', 'Waiting for device…')}</h2>
                <p style="color: #6b7280; font-size: 14px; margin: 0;" data-i18n="adv.page.connectHint">${_t('adv.page.connectHint', 'Connect your Android phone via USB and enable USB debugging. The page will refresh automatically.')}</p>
                <div style="margin-top: 16px;">
                    <button id="retryDeviceCheckBtn" class="btn-secondary" style="padding: 8px 24px; font-size: 13px; border-radius: 8px;" data-i18n="adv.page.retryCheck">${_t('adv.page.retryCheck', '🔄 Check Now')}</button>
                </div>
            </div>
            <div id="advancedDiagContainer" style="margin-top: 20px;"></div>
        `;
        if (typeof applyLanguage === 'function') applyLanguage(_getLang());

        document.getElementById('retryDeviceCheckBtn')?.addEventListener('click', function() {
            window.renderAdvancedDiagnostic();
        });
        return;
    }

    // ---- Device connected – render full UI ----
    const pageHtml = `
        <div style="margin-bottom: 24px;">
            <h1 style="margin-bottom: 6px; font-size: 24px; font-weight: 700; color: #1f2937;" data-i18n="adv.page.title">${_t('adv.page.title', '🔍 Advanced Diagnostics')}</h1>
            <p style="color: #6b7280; font-size: 14px; margin: 0;" data-i18n="adv.page.subtitle">${_t('adv.page.subtitle', 'A deeper pass across software behavior, installed apps, and rootkit indicators.')}</p>
        </div>

        <div style="background: white; border-radius: 16px; padding: 28px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid #f1f3f5;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px;">
                <div style="display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: #f8fafc; border-radius: 10px;">
                    <div style="width: 32px; height: 32px; border-radius: 8px; background: #eff6ff; color: #0d6efd; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="fas fa-heart-pulse" style="font-size: 13px;"></i>
                    </div>
                    <div>
                        <div style="font-size: 13px; font-weight: 600; color: #1f2937;" data-i18n="adv.page.softwareHealthLabel">${_t('adv.page.softwareHealthLabel', 'Software Health')}</div>
                        <div style="font-size: 11px; color: #9ca3af;" data-i18n="adv.page.softwareHealthDesc">${_t('adv.page.softwareHealthDesc', '26 system checks')}</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: #f8fafc; border-radius: 10px;">
                    <div style="width: 32px; height: 32px; border-radius: 8px; background: #f0fdf4; color: #16a34a; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="fas fa-magnifying-glass" style="font-size: 13px;"></i>
                    </div>
                    <div>
                        <div style="font-size: 13px; font-weight: 600; color: #1f2937;" data-i18n="adv.page.deepScanLabel">${_t('adv.page.deepScanLabel', 'Deep App Scan')}</div>
                        <div style="font-size: 11px; color: #9ca3af;" data-i18n="adv.page.deepScanDesc">${_t('adv.page.deepScanDesc', 'Installed apps & behavior')}</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: #f8fafc; border-radius: 10px;">
                    <div style="width: 32px; height: 32px; border-radius: 8px; background: #fef2f2; color: #dc2626; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="fas fa-shield-halved" style="font-size: 13px;"></i>
                    </div>
                    <div>
                        <div style="font-size: 13px; font-weight: 600; color: #1f2937;" data-i18n="adv.page.rootkitLabel">${_t('adv.page.rootkitLabel', 'Rootkit Check')}</div>
                        <div style="font-size: 11px; color: #9ca3af;" data-i18n="adv.page.rootkitDesc">${_t('adv.page.rootkitDesc', 'Kernel & process anomalies')}</div>
                    </div>
                </div>
            </div>

            <div style="text-align: center; padding: 8px 0 4px 0;">
                <button id="runAdvancedDiagBtn" style="
                    border: none; cursor: pointer;
                    background: linear-gradient(135deg, #0d6efd 0%, #0b5ed7 100%);
                    color: white; font-size: 15px; font-weight: 600;
                    padding: 13px 40px; border-radius: 12px;
                    box-shadow: 0 4px 14px rgba(13,110,253,0.3);
                    transition: transform 0.15s ease, box-shadow 0.15s ease;
                " onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 6px 18px rgba(13,110,253,0.38)'"
                   onmouseout="this.style.transform='none'; this.style.boxShadow='0 4px 14px rgba(13,110,253,0.3)'">
                    <i class="fas fa-play"></i> <span data-i18n="adv.page.runBtn">${_t('adv.page.runBtn', 'Run Advanced Scan')}</span>
                </button>
                <div style="font-size: 12px; color: #9ca3af; margin-top: 10px;" data-i18n="adv.page.runHint">${_t('adv.page.runHint', 'Takes a couple of minutes — the phone stays usable during the scan.')}</div>
            </div>
        </div>

        <div id="advancedDiagContainer" style="margin-top: 20px;"></div>
    `;

    container.innerHTML = pageHtml;

    if (typeof applyLanguage === 'function') applyLanguage(_getLang());

    // ---- 👇 NEW: Load saved results from Supabase (or localStorage) ----
    const diagContainer = document.getElementById('advancedDiagContainer');

    async function loadAndRenderResults() {
    let results = null;
    let source = 'localStorage';

    // ---- Show loading spinner in the container ----
    if (diagContainer) {
        diagContainer.innerHTML = `
            <div style="text-align: center; padding: 30px 0;">
                <div style="position: relative; width: 40px; height: 40px; margin: 0 auto;">
                    <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; border: 4px solid transparent; border-top-color: #3b82f6; border-right-color: #60a5fa; border-bottom-color: #93c5fd; animation: spin 0.9s cubic-bezier(0.65, 0, 0.35, 1) infinite;"></div>
                </div>
                <p style="margin-top: 12px; color: #6B7280; font-size: 14px;">${_t('adv.loading.results', 'Loading diagnostic results...')}</p>
            </div>
        `;
    }

    try {
        const { getCurrentUserId } = await import('./sb-utils.js');
        const userId = getCurrentUserId();
        if (userId && deviceId) {
            const { fetchLatestAdvancedScan } = await import('./sb-loader.js');
            const supabaseData = await fetchLatestAdvancedScan(userId, deviceId);
            if (supabaseData) {
                results = supabaseData;
                source = 'Supabase';
                console.log('[Advanced] Loaded from Supabase');
            }
        }
    } catch (e) {
        console.warn('[Advanced] Supabase load failed, using localStorage:', e);
    }

    if (!results) {
        results = loadAdvancedResults();
        if (results) console.log('[Advanced] Loaded from localStorage');
    }

    if (results) {
        // ---- Try to render full cards using the public API ----
        if (window.SmartHub && window.SmartHub.advanceDiagnostic && typeof window.SmartHub.advanceDiagnostic.loadAndRender === 'function') {
            try {
                window.SmartHub.advanceDiagnostic.loadAndRender(results, 'advancedDiagContainer');
                console.log('[Advanced] Full results rendered (source:', source + ')');
                return; // Success – exit early
            } catch (renderErr) {
                console.warn('[Advanced] Full render failed, falling back to summary:', renderErr);
            }
        }

        // ---- Fallback: summary only (if full render fails or method missing) ----
        const total = results.software ? results.software.length : 0;
        const passed = results.software ? results.software.filter(r => r.passed).length : 0;
        const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
        const color = pct >= 80 ? '#2e7d32' : pct >= 50 ? '#ed6c02' : '#d32f2f';

        if (diagContainer) {
            diagContainer.innerHTML = `
                <div style="margin-top: 20px; border-left: 4px solid ${color}; padding: 12px 16px; background: #f8fafc; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                        <span><i class="fas fa-microchip"></i> ${_t('adv.lastScanSummary', 'Last Scan Summary')}</span>
                        <span style="color: ${color};">${passed}/${total} ${_t('adv.checksPassed', 'checks passed')}</span>
                        <span style="color: #6b7280; font-size: 12px;">${results.scanTime || ''}</span>
                    </div>
                    <div style="margin-top: 4px;">
                        <div style="background:#e5e7eb; border-radius:8px; height:6px; overflow:hidden; width:100%;">
                            <div style="width:${pct}%; background:${color}; height:100%; border-radius:8px;"></div>
                        </div>
                    </div>
                    <div style="font-size:12px; color:#6b7280; margin-top:4px;">
                        ${pct === 100 ? '✅ All checks passed' : pct >= 80 ? '⚠️ Most checks passed' : '❌ Many checks failed'}
                        <span style="font-size:11px; color:#9ca3af; margin-left:8px;">(source: ${source})</span>
                    </div>
                </div>
            `;
        }
    } else {
        // ---- No results at all – show a friendly message ----
        if (diagContainer) {
            diagContainer.innerHTML = `
                <div style="margin-top: 20px; padding: 16px; background: #fef3c7; border-radius: 8px; color: #92400e; text-align: center; border-left: 4px solid #f59e0b;">
                    <span>${_t('adv.noResultsFound', 'No diagnostic results found. Run a scan to see them here.')}</span>
                </div>
            `;
        }
    }
}

    // Run the load immediately
    await loadAndRenderResults();

    // ---- Event handlers (unchanged) ----
    const runBtn = document.getElementById('runAdvancedDiagBtn');

    async function runAdbWithDevice(command) {
        const currentDevice = getCurrentDeviceId();
        if (!currentDevice) throw new Error('No device connected.');
        const resp = await fetch('/adb-shell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: currentDevice, command })
        });
        if (!resp.ok) throw new Error(`ADB command failed: ${resp.status}`);
        const data = await resp.json();
        return data.output;
    }

    function ensureScanModal() {
        let modal = document.getElementById('advancedDiagModal');
        if (!modal) {
            const modalHTML = `
                <div id="advancedDiagModal" class="modal" style="display: none; z-index: 99999;">
                    <div class="modal-content" style="max-width: 1100px; width: 95vw; max-height: 85vh; display: flex; flex-direction: column; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3); background: #ffffff;">
                        <div class="modal-header" style="padding: 16px 24px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                            <h3 id="advancedDiagModalTitle" data-i18n="adv.modal.title" style="margin: 0; font-size: 18px; font-weight: 600; color: #1f2937;">${_t('adv.modal.title', 'Advanced Diagnostics')}</h3>
                            <span class="close-button" id="closeAdvancedDiagModal" style="cursor: pointer; font-size: 24px; color: #9ca3af; line-height: 1; padding: 0 4px;">&times;</span>
                        </div>
                        <div id="advancedDiagModalBody" class="modal-body" style="flex: 1; overflow-y: auto; padding: 20px 24px; background: #ffffff;"></div>
                        <div class="modal-footer" style="padding: 12px 24px; background: #f8fafc; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end;">
                            <button id="closeAdvancedDiagModalBtn" class="btn-secondary" style="padding: 8px 24px; border-radius: 8px; font-weight: 500; font-size: 14px; cursor: pointer; background: #f1f3f5; border: 1px solid #e5e7eb; color: #374151;" data-i18n="adv.modal.close">${_t('adv.modal.close', 'Close')}</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            modal = document.getElementById('advancedDiagModal');
            document.getElementById('closeAdvancedDiagModal').addEventListener('click', () => modal.style.display = 'none');
            document.getElementById('closeAdvancedDiagModalBtn').addEventListener('click', () => modal.style.display = 'none');
            window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
            if (typeof applyLanguage === 'function') applyLanguage(_getLang());
        }
        return modal;
    }

    runBtn.addEventListener('click', async function() {
    const btn = this;
    const currentDeviceId = getCurrentDeviceId();
    if (!currentDeviceId) {
        showAlert(_t('adv.scan.noDevice', 'No device connected. Please connect your phone and try again.'));
        return;
    }

    btn.disabled = true;
    btn.style.opacity = '0.75';
    btn.style.cursor = 'not-allowed';
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span data-i18n="adv.scan.scanningBtn">' + _t('adv.scan.scanningBtn', 'Scanning...') + '</span>';

    try {
        try {
            await runAdbWithDevice('am start -n com.smarthub.diagnostics/.MainActivity');
        } catch (e) {
            console.warn('[Advanced] Could not launch Android app:', e);
        }

        const modal = ensureScanModal();
        const modalTitle = document.getElementById('advancedDiagModalTitle');
        const modalBody = document.getElementById('advancedDiagModalBody');
        modalTitle.textContent = _t('adv.modal.title', 'Advanced Diagnostics');
        modalBody.innerHTML = window.getModernSpinnerHTML(_t('adv.scan.runningModal', 'Running advanced diagnostics... This may take 2-3 minutes.'));
        modal.style.display = 'flex';

        diagContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: #6b7280;" data-i18n="adv.scan.inProgress">${_t('adv.scan.inProgress', '⏳ Scan in progress... See modal for details.')}</div>`;

        const results = await window.SmartHub.advanceDiagnostic.runFullSuite(
            currentDeviceId,
            (msg) => {
                const textEl = modalBody.querySelector('.loading-text');
                if (textEl) textEl.textContent = msg;
            }
        );

        if (results && results.ai) {
            delete results.ai;
        }

        modal.style.display = 'none';
        window.SmartHub.advanceDiagnostic.renderResults('advancedDiagContainer');

        // ---- 👇 FIXED: Save FULL results with message & fix for Supabase ----
        // 1. For dashboard summary (localStorage) – keep lightweight
        const advancedResults = {
            software: results.software ? results.software.map(r => ({
                name: r.name,
                passed: r.passed,
                message: r.message || '',
                fix: r.fix || ''
            })) : [],
            scanTime: new Date().toLocaleString()
        };
        saveAdvancedResults(advancedResults);

        // 2. For Supabase – save the FULL original results (with message & fix)
        const supabasePayload = {
            software: results.software || [],   // Full objects with message and fix
            deep: results.deep || null,
            rootkit: results.rootkit || null,
            scanTime: new Date().toISOString()
        };
        try {
            const { saveAdvancedDiagnosticResults } = await import('./advanceDiagnostic_sb.js');
            await saveAdvancedDiagnosticResults(supabasePayload, currentDeviceId);
            console.log('[Advanced] Full results saved to Supabase (with details)');
        } catch (e) {
            console.warn('[Advanced] Could not save to Supabase:', e);
        }

        // Reload the results to show the newly saved data
        await loadAndRenderResults();

    } catch (err) {
        modal.style.display = 'none';
        diagContainer.innerHTML = `
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px; color: #b91c1c;">
                <div style="display: flex; align-items: center; gap: 8px; font-weight: 600; margin-bottom: 6px;">
                    <i class="fas fa-triangle-exclamation"></i> <span data-i18n="adv.scan.failedTitle">${_t('adv.scan.failedTitle', 'Scan failed')}</span>
                </div>
                <div style="font-size: 13px; color: #991b1b; margin-bottom: 12px;">${escapeHtml(err.message)}</div>
                <button onclick="renderAdvancedDiagnostic()" style="border: 1px solid #fca5a5; background: white; color: #b91c1c; padding: 6px 16px; border-radius: 8px; font-size: 13px; cursor: pointer;" data-i18n="adv.scan.retryBtn">
                    ${_t('adv.scan.retryBtn', '🔄 Retry')}
                </button>
            </div>
        `;
        if (typeof applyLanguage === 'function') applyLanguage(_getLang());
    } finally {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.innerHTML = '<i class="fas fa-play"></i> <span data-i18n="adv.page.runBtn">' + _t('adv.page.runBtn', 'Run Advanced Scan') + '</span>';
    }
});

    // The savedAdv from localStorage is already handled by loadAndRenderResults()
};
})();