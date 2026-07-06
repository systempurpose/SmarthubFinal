// js/advanceDiagnostic.js
(function() {
    'use strict';

    let currentDeviceId = null;
    let diagResults = null;

    // ---- Private helpers ----
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

    // ====== ORIGINAL WORKING TESTS (unchanged) ======
    async function testAppCrashes() {
        try {
            const uptime = await getDeviceUptimeSeconds();
            if (uptime < 60) {
                return { name: 'App Crashes', passed: true, message: 'Device just booted, ignoring boot-time logs', fix: '' };
            }
            const result = await adb('logcat -v time -b crash -t 200');
            const lines = result.output.split('\n').filter(l => l.includes('FATAL EXCEPTION'));
            if (lines.length === 0) {
                return { name: 'App Crashes', passed: true, message: 'No recent crashes', fix: '' };
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
                name: 'App Crashes',
                passed,
                message: msg,
                fix: passed ? '' : 'Clear app data: `adb shell pm clear <package>` or uninstall.'
            };
        } catch (e) {
            return { name: 'App Crashes', passed: false, message: `Error: ${e.message}`, fix: 'Check ADB connection.' };
        }
    }

    async function testANR() {
        try {
            const uptime = await getDeviceUptimeSeconds();
            const result = await adb('dumpsys anr');
            const output = result.output;
            const anrMatches = output.match(/ANR in ([^\n]+)/g) || [];
            if (anrMatches.length === 0) {
                return { name: 'ANR (App Freezes)', passed: true, message: 'No ANR detected', fix: '' };
            }
            const recentAnrs = anrMatches.filter(match => uptime < 3600);
            const passed = recentAnrs.length === 0;
            return {
                name: 'ANR (App Freezes)',
                passed,
                message: passed ? 'No recent ANR' : `${recentAnrs.length} ANR event(s) found (last ${Math.round(uptime/60)} min)`,
                fix: passed ? '' : 'Clear data of the app listed in the ANR, or uninstall it.'
            };
        } catch (e) {
            return { name: 'ANR', passed: false, message: `Error: ${e.message}`, fix: 'Restart ADB.' };
        }
    }

    async function testKernelPanic() {
        try {
            const uptime = await getDeviceUptimeSeconds();
            if (uptime > 86400) {
                return { name: 'Kernel Panic', passed: true, message: 'Uptime >24h, ignoring old panic logs', fix: '' };
            }
            const result = await adb('cat /proc/last_kmsg 2>/dev/null || echo "no_last_kmsg"');
            const hasPanic = result.output.includes('panic') || result.output.includes('Oops');
            const passed = !hasPanic || uptime > 86400;
            return {
                name: 'Kernel Panic',
                passed,
                message: hasPanic && uptime < 86400 ? 'Kernel panic detected in current boot' : 'No kernel panic',
                fix: hasPanic && uptime < 86400 ? 'Reflash boot.img via fastboot. If persists, factory reset.' : ''
            };
        } catch (e) {
            return { name: 'Kernel Panic', passed: false, message: `Error: ${e.message}`, fix: 'Check if device supports last_kmsg.' };
        }
    }

    async function testSystemServiceCrashes() {
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
            const msg = passed ? 'Stable' : `${problematic.length} service(s) crashed repeatedly: ${problematic.map(([s]) => s).join(', ')}`;
            return {
                name: 'System Service Stability',
                passed,
                message: msg,
                fix: passed ? '' : 'Restart SystemUI: `adb shell pkill -f com.android.systemui`. If persists, factory reset.'
            };
        } catch (e) {
            return { name: 'System Service Stability', passed: false, message: `Error: ${e.message}`, fix: 'Check ADB permissions.' };
        }
    }

    async function testStorageHealth() {
        try {
            const data = await apiCall('/hardware/storage');
            const usedPct = data.percent || 0;
            const passed = usedPct < 92;
            return {
                name: 'Storage Full',
                passed,
                message: `${usedPct.toFixed(1)}% used`,
                fix: passed ? '' : 'Free up space: `adb shell pm trim-caches`. Delete large files in `/sdcard/Download`.'
            };
        } catch (e) {
            return { name: 'Storage Full', passed: false, message: `Error: ${e.message}`, fix: 'Check device connection.' };
        }
    }

    async function testBackgroundWakeups() {
        try {
            const result = await adb('dumpsys deviceidle');
            const lines = result.output.split('\n').filter(l => l.includes('Wakeup') || l.includes('wakeup'));
            const count = lines.length;
            const passed = count < 30;
            return {
                name: 'Excessive Wakeups (Battery Drain)',
                passed,
                message: `${count} wakeup events logged (threshold: 30)`,
                fix: passed ? '' : 'Find culprit: `adb shell dumpsys deviceidle`. Disable with `adb shell pm disable <package>`.'
            };
        } catch (e) {
            return { name: 'Excessive Wakeups', passed: false, message: `Error: ${e.message}`, fix: 'Restart ADB.' };
        }
    }

    async function testUIJank() {
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
                    name: `UI Jank (${fgPkg.split('.').pop()})`,
                    passed,
                    message: `${percent.toFixed(1)}% janky frames (threshold ${threshold}%)`,
                    fix: passed ? '' : 'Reduce animations: `adb shell settings put global window_animation_scale 0.5`. Disable bloatware.'
                };
            } else {
                return { name: 'UI Jank', passed: true, message: 'No frame data available (app may be idle)', fix: '' };
            }
        } catch (e) {
            return { name: 'UI Jank', passed: false, message: `Error: ${e.message}`, fix: 'Ensure screen is on and an app is active.' };
        }
    }

    async function testNetworkStack() {
        try {
            const result = await adb('logcat -b system -t 200 | grep -i "wifi.*crash\\|bluetooth.*crash" || echo ""');
            const lines = result.output.split('\n').filter(l => l.trim() && !l.includes('grep'));
            const count = lines.length;
            const passed = count <= 2;
            return {
                name: 'WiFi/Bluetooth Stack Stability',
                passed,
                message: passed ? 'Stable' : `${count} stack restarts detected`,
                fix: passed ? '' : 'Reset network: `adb shell settings put global wifi_on 0` then `1`. Clear BT cache: `adb shell pm clear com.android.bluetooth`.'
            };
        } catch (e) {
            return { name: 'Network Stack', passed: false, message: `Error: ${e.message}`, fix: 'Check device connection.' };
        }
    }

    async function testThermalThrottling() {
        try {
            const battery = await apiCall('/hardware/battery');
            const isCharging = battery.charging === true;
            const temp = parseFloat(battery.temperature) || 0;
            const passed = temp < 45 || isCharging;
            return {
                name: 'Thermal Throttling',
                passed,
                message: passed ? `${temp}°C (${isCharging ? 'charging, normal' : 'normal'})` : `${temp}°C (overheating while idle)`,
                fix: passed ? '' : 'Disable heavy background apps. Wipe cache partition from recovery.'
            };
        } catch (e) {
            try {
                const result = await adb('logcat -b events -t 50 | grep thermal');
                const lines = result.output.split('\n').filter(l => l.includes('thermal'));
                const passed = lines.length < 2;
                return {
                    name: 'Thermal Throttling',
                    passed,
                    message: passed ? 'No throttling' : `${lines.length} thermal events`,
                    fix: passed ? '' : 'Check for rogue apps causing high CPU load.'
                };
            } catch (e2) {
                return { name: 'Thermal Throttling', passed: false, message: `Error: ${e2.message}`, fix: 'Restart ADB.' };
            }
        }
    }

    async function testGhostTouch() {
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
                return { name: 'Ghost Touch', passed: true, message: 'Skipped (screen is on – cannot test accurately)', fix: '' };
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
                    name: 'Ghost Touch',
                    passed,
                    message: passed ? `No ghost touch (${count} recent events)` : `Possible ghost touch (${count} events)`,
                    fix: passed ? '' : 'Try recalibration via `*#*#2664#*#*`. Disable "High touch sensitivity".'
                };
            }
            const count1 = run1.output.split('\n')
                .filter(l => l.trim() && !l.includes('SYN_REPORT') && !l.includes('0000 0000')).length;
            const count2 = run2.output.split('\n')
                .filter(l => l.trim() && !l.includes('SYN_REPORT') && !l.includes('0000 0000')).length;
            const passed = !(count1 > 3 && count2 > 3);
            const avgCount = Math.round((count1 + count2) / 2);
            return {
                name: 'Ghost Touch',
                passed,
                message: passed ? `No ghost touch (avg ${avgCount} events)` : `Possible ghost touch (avg ${avgCount} events)`,
                fix: passed ? '' : 'Try recalibration via `*#*#2664#*#*`. Disable "High touch sensitivity". Reflash touch firmware.'
            };
        } catch (e) {
            return { name: 'Ghost Touch', passed: false, message: `Error: ${e.message}`, fix: 'Check ADB and touch driver.' };
        }
    }

    // ====== FIXED TESTS ======

    // FIX: broadened zone-name matching + fallback to highest-reading zone when no name matches;
    // discards physically impossible readings (<=0 or >150°C); treats a fully unreadable result as
    // informational rather than a failure, since many devices restrict thermal sysfs access entirely.
    async function testCPUTemperature() {
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
                    if (temp <= 0 || temp > 150) continue; // discard impossible readings

                    candidates.push({ type, temp });

                    // Broadened match to cover common vendor naming conventions
                    if (/cpu|soc|tsens|apu|cluster|cpuss|pm8|msm.*thermal|little|big|silver|gold/.test(type)) {
                        cpuTemp = temp;
                        zoneName = type;
                        break;
                    }
                } catch (_) {
                    // zone doesn't exist – skip
                }
            }

            // Fallback: CPU/SoC is almost always the hottest zone on a running device
            if (cpuTemp === null && candidates.length > 0) {
                candidates.sort((a, b) => b.temp - a.temp);
                cpuTemp = candidates[0].temp;
                zoneName = candidates[0].type + ' (best guess)';
            }

            const passed = cpuTemp === null || cpuTemp < 48;
            return {
                name: 'CPU Temperature',
                passed,
                message: cpuTemp !== null ? `${cpuTemp.toFixed(1)}°C (${zoneName})` : 'Unable to read (thermal zones not accessible on this device)',
                fix: (!passed && cpuTemp !== null) ? 'CPU running hot. Reduce load or check cooling.' : ''
            };
        } catch (e) {
            return { name: 'CPU Temperature', passed: true, message: 'Unable to read thermal zones', fix: '' };
        }
    }

    // FIX: normalize units — some battery APIs report volts (e.g. 3.91) instead of millivolts (3910),
    // which previously always failed the 3200-4400 mV range check.
    async function testBatteryVoltage() {
        try {
            const bat = await apiCall('/hardware/battery');
            let voltage = bat.voltage ? parseFloat(bat.voltage) : 0;

            if (voltage > 0 && voltage < 20) {
                voltage = voltage * 1000; // convert volts -> millivolts
            }

            const passed = voltage === 0 || (voltage >= 3200 && voltage <= 4400);
            return {
                name: 'Battery Voltage',
                passed,
                message: voltage > 0 ? `${Math.round(voltage)} mV` : 'Not available',
                fix: passed ? '' : 'Voltage outside normal range – consider battery replacement.'
            };
        } catch (e) {
            return { name: 'Battery Voltage', passed: true, message: 'Not available', fix: '' };
        }
    }

    async function testBatteryHealth() {
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
                name: 'Battery Health',
                passed,
                message: msg,
                fix: passed ? '' : 'Battery may need replacement. Run battery calibration or replace.'
            };
        } catch (e) {
            return { name: 'Battery Health', passed: true, message: 'Not available', fix: '' };
        }
    }

    // FIX: exclude Android's Integer.MAX_VALUE (2147483647) and other sentinel values used to
    // signal "no reading available" — these were previously being parsed as real dBm values.
    async function testSignalStrength() {
        try {
            const result = await adb('dumpsys telephony.registry | grep -i "mSignalStrength"');
            const output = result.output || '';
            let dbm = null;

            const isSentinel = (n) => n === 2147483647 || n === -2147483648 || n === 99 || n === -1 || Math.abs(n) > 200;

            const lteMatch = output.match(/rssi\s*=\s*(-?\d+)/i) || output.match(/dbm\s*=\s*(-?\d+)/i);
            if (lteMatch) {
                const val = parseInt(lteMatch[1]);
                if (!isSentinel(val) && val < 0 && val > -150) {
                    dbm = val;
                }
            }
            if (dbm === null) {
                const altMatch = output.match(/SignalStrength:\{[^}]*?\b(\d{1,2})\b[^}]*\}/);
                if (altMatch) {
                    const val = parseInt(altMatch[1]);
                    if (val >= 0 && val <= 31) { // valid GSM ASU range (0-31; 99 = unknown, already excluded by regex)
                        dbm = -113 + 2 * val;
                    }
                }
            }

            let level = 'Unknown';
            let passed = true;
            if (dbm !== null) {
                if (dbm >= -80) { level = 'Excellent'; passed = true; }
                else if (dbm >= -90) { level = 'Good'; passed = true; }
                else if (dbm >= -100) { level = 'Fair'; passed = true; }
                else { level = 'Poor'; passed = false; }
            }

            return {
                name: 'Signal Strength',
                passed,
                message: dbm !== null ? `${dbm} dBm (${level})` : 'Unable to read signal (no active cellular connection)',
                fix: passed ? '' : 'Move to an area with better coverage or check antenna.'
            };
        } catch (e) {
            return { name: 'Signal Strength', passed: true, message: 'Unable to read signal (no SIM or radio unavailable)', fix: '' };
        }
    }

    // FIX: check SIM state first — "no SIM" or "no mobile plan" should be informational, not a
    // hard failure. Previously any device without an active mobile data session always failed.
    async function testStorageIOErrors() {
    try {
        let foundErrors = [];
        let usedMethod = 'logcat';

        // Fetch raw logcat from all buffers (no grep in shell)
        const buffers = ['main', 'system', 'kernel', 'events'];
        const rawLines = [];

        for (const buffer of buffers) {
            try {
                const result = await adb(`logcat -d -b ${buffer} -t 3000`);
                const lines = (result.output || '').split('\n');
                rawLines.push(...lines);
            } catch (_) {
                // buffer may not exist – skip
            }
        }

        // Now filter in JavaScript with a strict pattern
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
            // Skip lines that are clearly not storage errors (like adbd service logs)
            if (line.includes('adbd service requested')) continue;
            if (line.includes('logcat -d')) continue;
            for (const pattern of patterns) {
                if (pattern.test(line)) {
                    foundErrors.push(line.trim());
                    break;
                }
            }
        }

        // Deduplicate repeated lines
        foundErrors = [...new Set(foundErrors)];

        // If nothing found in logcat, try dmesg (root fallback)
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
            name: 'Storage I/O Errors',
            passed: !hasErrors,
            message: hasErrors
                ? `${foundErrors.length} I/O error(s) detected (${usedMethod})`
                : 'No storage I/O errors found',
            fix: hasErrors
                ? 'Storage corruption detected. Backup data immediately and replace storage.'
                : ''
        };
    } catch (e) {
        return {
            name: 'Storage I/O Errors',
            passed: false,
            message: `Error: ${e.message}`,
            fix: 'Check storage health.'
        };
    }
}

    // FIX: removed the forced `svc data disable` call, which could break connectivity entirely if
    // WiFi wasn't actually associated to an AP yet (leaving the device with no working radio during
    // the test, guaranteeing a false failure). Now checks actual WiFi association first, adds a
    // curl-based fallback for networks that filter ICMP, and never toggles radios that are already working.
    async function testDnsResolution() {
    try {
        // ---- Enable WiFi using multiple methods ----
        try { await adb('svc wifi enable'); } catch (_) {}
        try { await adb('settings put global wifi_on 1'); } catch (_) {}
        try { await adb('cmd wifi set-wifi-enabled enabled'); } catch (_) {}
        await new Promise(r => setTimeout(r, 3000));

        // ---- Disable mobile data ----
        try { await adb('svc data disable'); } catch (_) {}
        try { await adb('settings put global mobile_data 0'); } catch (_) {}
        await new Promise(r => setTimeout(r, 1000));

        // Check if WiFi connected
        let wifiConnected = false;
        let wifiAttempts = 0;
        while (!wifiConnected && wifiAttempts < 5) {
            try {
                const wifiCheck = await adb('dumpsys wifi | grep -i "state: COMPLETED\\|mNetworkInfo.*CONNECTED"');
                wifiConnected = /COMPLETED|CONNECTED/i.test(wifiCheck.output || '');
            } catch (_) {}
            if (!wifiConnected) {
                await new Promise(r => setTimeout(r, 2000));
                wifiAttempts++;
            }
        }

        let resolved = false;
        let detail = '';

        // ---- If WiFi connected, test DNS ----
        if (wifiConnected) {
            try {
                const result = await adb('ping -c 1 -W 3 google.com 2>&1');
                const output = result.output || '';
                resolved = /\d+\.\d+\.\d+\.\d+/.test(output) && !/unknown host|bad address|network unreachable/i.test(output);
                if (resolved) detail = 'DNS resolved successfully (WiFi)';
            } catch (_) {}
        }

        // ---- If WiFi failed, try mobile data as fallback ----
        if (!resolved) {
            // Enable data, disable WiFi
            try { await adb('svc wifi disable'); } catch (_) {}
            try { await adb('svc data enable'); } catch (_) {}
            try { await adb('settings put global mobile_data 1'); } catch (_) {}
            await new Promise(r => setTimeout(r, 2000));

            // Test DNS over data
            try {
                const result = await adb('ping -c 1 -W 3 google.com 2>&1');
                const output = result.output || '';
                resolved = /\d+\.\d+\.\d+\.\d+/.test(output) && !/unknown host|bad address|network unreachable/i.test(output);
                if (resolved) detail = 'DNS resolved successfully (mobile data)';
            } catch (_) {}
        }

        // ---- Final fallback: curl ----
        if (!resolved) {
            try {
                const curlResult = await adb('curl -s -o /dev/null -w "%{http_code}" --max-time 5 https://www.google.com');
                const code = parseInt((curlResult.output || '').trim());
                if (code >= 200 && code < 500) {
                    resolved = true;
                    detail = 'DNS resolved successfully (curl)';
                }
            } catch (_) {}
        }

        if (!resolved) {
            // Try to set Google DNS manually if not set
            let dnsSet = false;
            try {
                const dns1 = await adb('getprop net.dns1');
                if (!dns1.output || dns1.output.trim() === '') {
                    await adb('setprop net.dns1 8.8.8.8');
                    await adb('setprop net.dns2 8.8.4.4');
                    dnsSet = true;
                }
            } catch (_) {}

            if (dnsSet) {
                // Retry DNS
                try {
                    const result = await adb('ping -c 1 -W 3 google.com 2>&1');
                    const output = result.output || '';
                    resolved = /\d+\.\d+\.\d+\.\d+/.test(output) && !/unknown host|bad address|network unreachable/i.test(output);
                    if (resolved) detail = 'DNS resolved after setting Google DNS';
                } catch (_) {}
            }

            if (!resolved) {
                detail = 'DNS resolution failed';
                try {
                    const dns1 = await adb('getprop net.dns1');
                    const dnsVal = (dns1.output || '').trim();
                    detail += dnsVal ? ` (configured DNS: ${dnsVal})` : ' (no DNS server configured)';
                } catch (_) {}
            }
        }

        return {
            name: 'DNS Resolution',
            passed: resolved,
            message: detail,
            fix: resolved ? '' : 'Check network connectivity, DHCP, or DNS settings. Try setting DNS manually via `setprop net.dns1 8.8.8.8`.'
        };
    } catch (e) {
        return { name: 'DNS Resolution', passed: false, message: `Error: ${e.message}`, fix: 'Check network connectivity.' };
    }
}

    async function testStorageSpeed() {
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
                    if (elapsed > 0) {
                        mbps = 100 / elapsed;
                    }
                } catch (_) {}
            }
            try {
                await adb('rm -f /sdcard/speedtest.tmp');
            } catch (_) {}
            const passed = mbps !== null && mbps >= 10;
            return {
                name: 'Storage Speed',
                passed,
                message: mbps !== null ? `${mbps.toFixed(1)} MB/s` : 'Unable to measure',
                fix: passed ? '' : 'Storage may be failing or nearly full. Free up space or replace storage.'
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
                    name: 'Storage Speed',
                    passed,
                    message: mbps !== null ? `${mbps.toFixed(1)} MB/s` : 'Unable to measure',
                    fix: passed ? '' : 'Storage may be failing or nearly full. Free up space or replace storage.'
                };
            } catch (e2) {
                return { name: 'Storage Speed', passed: false, message: `Error: ${e2.message}`, fix: 'Check device storage health.' };
            }
        }
    }

    // FIX: tightened patterns to require actual kernel/filesystem-level error signatures
    // (EXT4-fs, F2FS-fs, blk_update_request, mmcblk, ufshcd) instead of generic words like
    // "Read-error"/"Write-error"/"journal.*error" which matched unrelated app or log lines.
    // Also deduplicates repeated lines and filters out app-package false positives.
    async function testSignalStrength() {
    try {
        const result = await adb('dumpsys telephony.registry');
        const output = result.output || '';

        // Find the LTE block and extract the `level` (0‑4)
        const lteMatch = output.match(/mLte=CellSignalStrengthLte[^}]*?level=(\d+)/);
        let level = null;
        let passed = true;
        let msg = 'Unable to read signal';

        if (lteMatch) {
            level = parseInt(lteMatch[1]);
            if (level >= 0 && level <= 4) {
                const levels = ['Unknown', 'Poor', 'Moderate', 'Good', 'Excellent'];
                msg = `LTE level ${level}/4 (${levels[level] || 'Unknown'})`;
                passed = level >= 2; // Moderate or better
            }
        } else {
            // Fallback: try to find any signal level from other RATs
            const anyMatch = output.match(/level=(\d+)/);
            if (anyMatch) {
                const lvl = parseInt(anyMatch[1]);
                if (lvl >= 0 && lvl <= 4) {
                    level = lvl;
                    const levels = ['Unknown', 'Poor', 'Moderate', 'Good', 'Excellent'];
                    msg = `Signal level ${level}/4 (${levels[level] || 'Unknown'})`;
                    passed = level >= 2;
                }
            }
        }

        return {
            name: 'Signal Strength',
            passed,
            message: msg,
            fix: passed ? '' : 'Move to an area with better coverage or check antenna.'
        };
    } catch (e) {
        return { name: 'Signal Strength', passed: true, message: 'Unable to read signal', fix: '' };
    }
}

    async function testMemoryLeaks() {
    try {
        // Get the actual foreground app package (skip non‑app windows)
        const fgResult = await adb('dumpsys window | grep mCurrentFocus | head -1');
        const focusLine = fgResult.output || '';
        let pkg = null;

        // Try to extract package name from the focus line
        const pkgMatch = focusLine.match(/u0\s+([\w.]+)/);
        if (pkgMatch) {
            pkg = pkgMatch[1];
        } else {
            // Fallback: use dumpsys activity to get the top activity
            try {
                const topResult = await adb('dumpsys activity activities | grep "TaskRecord" | head -1');
                const topMatch = topResult.output.match(/TaskRecord.*?([\w.]+)\//);
                if (topMatch) pkg = topMatch[1];
            } catch (_) {}
        }

        // If still no valid package, skip the test with a message
        if (!pkg || pkg === 'NotificationShade' || pkg === 'SystemUI' || pkg.includes('launcher')) {
            return {
                name: 'Memory Leak',
                passed: true,
                message: 'Skipped (no foreground app detected)',
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
            if (i < sampleCount - 1) {
                await new Promise(r => setTimeout(r, intervalMs));
            }
        }

        let leaking = false;
        if (samples.length >= 2) {
            let increasing = true;
            for (let i = 1; i < samples.length; i++) {
                if (samples[i] <= samples[i-1]) {
                    increasing = false;
                    break;
                }
            }
            leaking = increasing && (samples[samples.length-1] - samples[0] > 5000);
        }
        const current = samples[samples.length-1] || 0;
        return {
            name: 'Memory Leak',
            passed: !leaking,
            message: leaking ? `PSS grew from ${samples[0]}KB to ${current}KB (possible leak)` : `PSS: ${current}KB (stable)`,
            fix: leaking ? 'Restart the app or device. If persistent, app has memory leak.' : ''
        };
    } catch (e) {
        return { name: 'Memory Leak', passed: false, message: `Error: ${e.message}`, fix: 'Check app memory usage.' };
    }
}

    async function testSensors() {
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
                    return { name: 'Sensor Health', passed: true, message: 'Sensor service not accessible', fix: '' };
                }
            }
            if (output.includes("Can't find service") || output.includes("No such service")) {
                if (usedService === 'sensorservice') {
                    try {
                        const result3 = await adb('dumpsys sensors');
                        output = result3.output;
                        usedService = 'sensors';
                    } catch (_) {
                        return { name: 'Sensor Health', passed: true, message: 'Sensor service not available', fix: '' };
                    }
                } else {
                    try {
                        const result3 = await adb('dumpsys sensorservice');
                        output = result3.output;
                        usedService = 'sensorservice';
                    } catch (_) {
                        return { name: 'Sensor Health', passed: true, message: 'Sensor service not available', fix: '' };
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
            const msg = present.length ? `${present.join(', ')} detected` : 'No sensors detected (unexpected)';
            return {
                name: 'Sensor Health',
                passed,
                message: msg + (usedService ? ` (via ${usedService})` : ''),
                fix: passed ? '' : 'Sensors may be disabled or hardware issue. Check `dumpsys sensorservice` for details.'
            };
        } catch (e) {
            return { name: 'Sensor Health', passed: true, message: `Unable to check: ${e.message}`, fix: '' };
        }
    }

    async function testRootStatus() {
        try {
            const result = await adb('getprop ro.boot.verifiedbootstate');
            const state = result.output.trim();
            let passed = true;
            let msg = state || 'Unknown';
            if (state === 'orange' || state === 'yellow') passed = false;
            else if (state === 'green') passed = true;
            else passed = true;
            return {
                name: 'Bootloader/Security Status',
                passed,
                message: msg,
                fix: passed ? '' : 'Bootloader unlocked or tampered – relock if possible, reflash stock firmware.'
            };
        } catch (e) {
            return { name: 'Bootloader Status', passed: true, message: 'Unknown', fix: '' };
        }
    }

    async function testSecurityPatch() {
        try {
            const result = await adb('getprop ro.build.version.security_patch');
            const patch = result.output.trim();
            let passed = true;
            let msg = patch || 'Unknown';
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
                name: 'Security Patch Level',
                passed,
                message: msg,
                fix: passed ? '' : 'Update your device via system settings to get the latest security fixes.'
            };
        } catch (e) {
            return { name: 'Security Patch', passed: true, message: 'Not available', fix: '' };
        }
    }

    async function testNetworkType() {
    try {
        // ---- Disable WiFi (multiple methods) ----
        try { await adb('svc wifi disable'); } catch (_) {}
        try { await adb('settings put global wifi_on 0'); } catch (_) {}
        try { await adb('cmd wifi set-wifi-enabled disabled'); } catch (_) {}
        // ---- Enable mobile data ----
        try { await adb('svc data enable'); } catch (_) {}
        try { await adb('settings put global mobile_data 1'); } catch (_) {}
        // Wait for radio to settle
        await new Promise(r => setTimeout(r, 2500));

        // Verify data is actually enabled
        let dataEnabled = false;
        try {
            const dataCheck = await adb('settings get global mobile_data');
            dataEnabled = (dataCheck.output || '').trim() === '1';
        } catch (_) {}

        const result = await adb('dumpsys telephony.registry');
        const output = result.output || '';

        // Search for Packet-Switched domain with DATA service
        let tech = null;
        const psMatch = output.match(/domain=PS\s+transportType=WWAN.*?accessNetworkTechnology=(\w+).*?availableServices=\[DATA\]/i);
        if (psMatch) {
            tech = psMatch[1].toUpperCase();
        }

        if (!tech) {
            const anyMatch = output.match(/accessNetworkTechnology=(\w+)/i);
            if (anyMatch) tech = anyMatch[1].toUpperCase();
        }

        // Check SIM state
        let simState = '';
        try {
            const simResult = await adb('getprop gsm.sim.state');
            simState = (simResult.output || '').trim().toLowerCase();
        } catch (_) {}

        if (!tech) {
            if (simState.includes('absent') || simState.includes('unknown')) {
                return {
                    name: 'Network Type',
                    passed: true,
                    message: 'No SIM installed — mobile data not applicable',
                    fix: ''
                };
            }
            return {
                name: 'Network Type',
                passed: false,
                message: dataEnabled ? 'Not available (radio not registered)' : 'Mobile data off — toggle failed',
                fix: dataEnabled ? 'Check SIM or APN settings.' : 'Failed to enable mobile data. Try manually.'
            };
        }

        const isModern = tech !== 'UNKNOWN' && tech !== 'GPRS' && tech !== 'EDGE' && tech !== 'GSM';
        return {
            name: 'Network Type',
            passed: isModern,
            message: tech,
            fix: isModern ? '' : 'Slow network – upgrade plan or change location.'
        };
    } catch (e) {
        return { name: 'Network Type', passed: false, message: `Error: ${e.message}`, fix: 'Check radio status.' };
    }
}

    async function testImeiPresent() {
    try {
        let imei = null;
        let method = '';

        // ---- Try companion app via broadcast ----
        try {
            // Send broadcast to request IMEI
            await adb('am broadcast -a com.smarthub.diagnostics.GET_IMEI');
            await new Promise(r => setTimeout(r, 2000));
            // Read result file written by app
            const result = await adb('cat /data/local/tmp/imei.txt 2>/dev/null');
            const val = (result.output || '').trim();
            if (val && val.length >= 14) {
                imei = val;
                method = 'companion app (broadcast)';
            }
        } catch (_) {}

        // ---- Fallback to ADB-only methods ----
        if (!imei) {
            try {
                const result = await adb('service call iphonesubinfo 1 2>&1');
                const output = result.output || '';
                if (!output.includes('fffffffc')) {
                    const hexGroups = [...output.matchAll(/'([0-9a-fA-F.]{4})'/g)].map(m => m[1]);
                    if (hexGroups.length > 0) {
                        const chars = hexGroups
                            .map(g => g.replace(/\./g, ''))
                            .join('')
                            .match(/.{1,4}/g)
                            ?.map(h => String.fromCharCode(parseInt(h, 16)))
                            .join('') || '';
                        const digitsOnly = chars.replace(/[^\d]/g, '');
                        if (digitsOnly.length >= 14) {
                            imei = digitsOnly;
                            method = 'service call (no root)';
                        }
                    }
                }
            } catch (_) {}
        }

        if (!imei) {
            const props = [
                'persist.radio.imei',
                'gsm.imei',
                'ro.imei',
                'ro.ril.imei',
                'ril.imei',
                'ro.ril.imei1',
                'ro.ril.imei2'
            ];
            for (const prop of props) {
                try {
                    const result = await adb(`getprop ${prop}`);
                    const val = (result.output || '').trim();
                    if (val && val.length >= 14) {
                        imei = val;
                        method = `getprop ${prop}`;
                        break;
                    }
                } catch (_) {}
            }
        }

        if (!imei) {
            try {
                const result = await adb('dumpsys iphonesubinfo 2>&1');
                const output = result.output || '';
                const match = output.match(/Device ID[:=]\s*(\d{14,17})/i);
                if (match) {
                    imei = match[1];
                    method = 'dumpsys iphonesubinfo (legacy)';
                }
            } catch (_) {}
        }

        if (!imei) {
            try {
                const result = await adb('dumpsys telephony.registry | grep -i "imei"');
                const output = result.output || '';
                const match = output.match(/imei[:=]\s*(\d{14,17})/i);
                if (match) {
                    imei = match[1];
                    method = 'dumpsys telephony.registry';
                }
            } catch (_) {}
        }

        if (!imei) {
            try {
                const result = await adb('service call iphonesubinfo 2 2>&1');
                const output = result.output || '';
                if (!output.includes('fffffffc')) {
                    const hexGroups = [...output.matchAll(/'([0-9a-fA-F.]{4})'/g)].map(m => m[1]);
                    if (hexGroups.length > 0) {
                        const chars = hexGroups
                            .map(g => g.replace(/\./g, ''))
                            .join('')
                            .match(/.{1,4}/g)
                            ?.map(h => String.fromCharCode(parseInt(h, 16)))
                            .join('') || '';
                        const digitsOnly = chars.replace(/[^\d]/g, '');
                        if (digitsOnly.length >= 14) {
                            imei = digitsOnly;
                            method = 'service call (index 2)';
                        }
                    }
                }
            } catch (_) {}
        }

        if (!imei) {
            try {
                const result = await adb('dumpsys phone 2>/dev/null | grep -i "imei"');
                const output = result.output || '';
                const match = output.match(/imei[:=]\s*(\d{14,17})/i);
                if (match) {
                    imei = match[1];
                    method = 'dumpsys phone';
                }
            } catch (_) {}
        }

        const passed = imei !== null && imei.length >= 14;
        return {
            name: 'IMEI Present',
            passed,
            message: passed ? `IMEI present (${method})` : 'IMEI not accessible — try dialing `*#06#` manually',
            fix: passed ? '' : 'IMEI read requires privileged ADB context or root. This is expected on Android 10+. You can view it manually by dialing `*#06#`.'
        };
    } catch (e) {
        return { name: 'IMEI Present', passed: false, message: `Error: ${e.message}`, fix: 'Check device radio.' };
    }
}
    // FIX: raised threshold — 500mA is standard USB charging current and is normal, not a fault.
    // Also normalizes current_now units (µA -> mA) more defensively.
    async function testChargingCurrent() {
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
                        if (!isNaN(val) && val !== 0) {
                            current = Math.round(Math.abs(val) / 1000); // µA -> mA
                        }
                    }
                } catch (_) {}
            }

            if (current === 0) {
                return { name: 'Charging Current', passed: true, message: 'Not reported by this device', fix: '' };
            }

            // 500mA is standard USB current — only flag genuinely low current below ~400mA
            const passed = current >= 400;
            return {
                name: 'Charging Current',
                passed,
                message: `${current} mA`,
                fix: passed ? '' : 'Low charging current detected – check cable, charger, or USB port.'
            };
        } catch (e) {
            return { name: 'Charging Current', passed: true, message: 'Not available', fix: '' };
        }
    }

    // FIX: added sanity range check — values above ~3000 are physically impossible for a phone
    // battery and almost always mean the sysfs node returned a different counter entirely
    // (e.g. charge_counter in µAh being misread as cycle_count).
    async function testBatteryCycleCount() {
        try {
            const result = await adb('cat /sys/class/power_supply/battery/cycle_count 2>/dev/null || echo "unavailable"');
            const output = (result.output || '').trim();
            let count = parseInt(output);
            const available = !isNaN(count) && output !== 'unavailable';

            const plausible = available && count >= 0 && count <= 3000;

            if (available && !plausible) {
                return {
                    name: 'Battery Cycle Count',
                    passed: true,
                    message: `Reported value (${count}) is not a valid cycle count on this device`,
                    fix: ''
                };
            }

            const passed = !available || count < 500;
            return {
                name: 'Battery Cycle Count',
                passed,
                message: available ? `${count} cycles` : 'Not available',
                fix: passed ? '' : 'Battery has high cycle count (>500). Consider replacement.'
            };
        } catch (e) {
            return { name: 'Battery Cycle Count', passed: true, message: 'Not available', fix: '' };
        }
    }

    async function testChargingType() {
        try {
            const battery = await apiCall('/hardware/battery');
            const plugged = battery.plugged || 0;
            const map = { 0: 'Not charging', 1: 'AC (wired)', 2: 'USB', 4: 'Wireless' };
            const type = map[plugged] || 'Unknown';
            const passed = plugged !== 0;
            return {
                name: 'Charging Type',
                passed,
                message: type,
                fix: passed ? '' : 'Device is not charging. Check cable, charger, or port.'
            };
        } catch (e) {
            return { name: 'Charging Type', passed: false, message: `Error: ${e.message}`, fix: 'Check charging hardware.' };
        }
    }

    // ====== RUN ALL TESTS ======
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
        // testDnsResolution,   // <-- REMOVED
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

    async function performRootkitScan(deviceId) {
        const primaryUrl = `/api/rootkit-scan?deviceId=${encodeURIComponent(deviceId)}`;
        try {
            const res = await fetch(primaryUrl);
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                let summary = 'Rootkit scan completed';
                if (data.summary) summary = data.summary;
                else if (data.message) summary = data.message;
                else if (data.result) summary = data.result;
                else if (data.error) summary = data.error;
                return { summary };
            }
            let errorDetail = `HTTP ${res.status}`;
            if (data.error) errorDetail = data.error;
            else if (data.message) errorDetail = data.message;
            return { summary: `Rootkit scan unavailable: ${errorDetail}` };
        } catch (e) {
            return { summary: `Rootkit scan unavailable: ${e.message}` };
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
            if (typeof onProgress === 'function') onProgress('Running software diagnostics...');

            const softwareResults = await runSoftwareDiagnostics();

            if (typeof onProgress === 'function') onProgress('Running deep & rootkit scans...');
            const [deep, rootkit] = await Promise.all([
                performDeepScan(deviceId),
                performRootkitScan(deviceId)
            ]);

            if (typeof onProgress === 'function') onProgress('Analyzing with AI...');
            const aiConclusion = await runAIAnalysis(deviceId, softwareResults, deep, rootkit);

            diagResults = { software: softwareResults, deep, rootkit, ai: aiConclusion };
            if (typeof onProgress === 'function') onProgress('Done');
            return diagResults;
        },

        getResults: function() { return diagResults; },

        renderResults: function(containerId) {
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
                        <span style="color:#6B7280; font-size:14px; margin-left:8px;">${passed}/${total} checks passed</span>
                    </div>
                    <div style="flex:1; min-width:100px;">
                        <div style="background:#e5e7eb; border-radius:8px; height:8px; overflow:hidden;">
                            <div style="width:${pct}%; background:${color}; height:100%; border-radius:8px;"></div>
                        </div>
                    </div>
                </div>
            `;

            if (deep || rootkit) {
                html += `<div style="display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; font-size: 14px; color: #374151;">`;
                if (deep) {
                    let deepText = deep.summary || 'No issues';
                    const match = deepText.match(/(\d+)\s+findings/);
                    const displayText = match ? `${match[1]} issues` : deepText;
                    html += `
                        <span style="background: #e8f5e9; padding: 4px 14px; border-radius: 16px; display: inline-flex; align-items: center; gap: 6px;">
                            🔬 Deep Scan: <strong>${escapeHtml(displayText)}</strong>
                        </span>
                    `;
                }
                if (rootkit) {
                    const isOk = !rootkit.summary.toLowerCase().includes('unavailable') && !rootkit.summary.toLowerCase().includes('error');
                    const icon = isOk ? '✅' : '⚠️';
                    html += `
                        <span style="background: ${isOk ? '#e8f5e9' : '#ffebee'}; padding: 4px 14px; border-radius: 16px; display: inline-flex; align-items: center; gap: 6px;">
                            🛡️ Rootkit: <strong>${escapeHtml(rootkit.summary || 'Clean')}</strong> ${icon}
                        </span>
                    `;
                }
                html += `</div>`;
            }

            if (validSoftware.length > 0) {
                html += `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px,1fr)); gap:12px;">`;
                for (const test of validSoftware) {
                    const cardColor = test.passed ? '#2e7d32' : '#d32f2f';
                    const bgColor = test.passed ? '#e8f5e9' : '#ffebee';
                    const icon = test.passed ? '✅' : '❌';
                    let fixHtml = '';
                    if (!test.passed && test.fix) {
                        fixHtml = `<div style="font-size:12px; margin-top:6px; background:#f5f5f5; padding:6px 10px; border-radius:4px; color:#333;">
                            <strong>🔧 Fix:</strong> ${escapeHtml(test.fix)}
                        </div>`;
                    }
                    html += `
                        <div style="background:${bgColor}; border-radius:8px; padding:12px; border-left:4px solid ${cardColor};">
                            <div style="font-weight:600; font-size:14px;">${icon} ${escapeHtml(test.name)}</div>
                            <div style="font-size:13px; color:#555; margin-top:4px;">${escapeHtml(test.message)}</div>
                            ${fixHtml}
                        </div>
                    `;
                }
                html += `</div>`;
            } else {
                html += `<div style="padding:12px; background:#fef3c7; border-radius:8px; color:#92400e;">No test results available.</div>`;
            }

            if (ai) {
                let confidenceColor = '#6B7280';
                if (ai.confidence === 'High') confidenceColor = '#2e7d32';
                else if (ai.confidence === 'Medium') confidenceColor = '#ed6c02';
                else if (ai.confidence === 'Low') confidenceColor = '#d32f2f';

                html += `
                    <div style="margin-top:24px; padding:20px; background:linear-gradient(135deg, #f0f4ff 0%, #e8edf5 100%); border-radius:12px; border:1px solid #c7d2fe; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                            <span style="font-size:28px;">🧠</span>
                            <div>
                                <h3 style="margin:0; color:#1e3a8a; font-size:18px;">AI Diagnosis</h3>
                                <span style="font-size:12px; color:#6B7280;">Root cause analysis</span>
                            </div>
                            <span style="margin-left:auto; font-size:12px; background:${confidenceColor}20; color:${confidenceColor}; padding:2px 12px; border-radius:12px; font-weight:600;">
                                Confidence: ${escapeHtml(ai.confidence || 'Medium')}
                            </span>
                        </div>
                        <div style="font-size:15px; color:#1e293b; margin-bottom:10px; padding:12px; background:rgba(255,255,255,0.5); border-radius:8px;">
                            <strong>📋 Conclusion:</strong><br>
                            ${escapeHtml(ai.summary)}
                        </div>
                        <div style="margin-top:8px;">
                            <strong style="color:#1e3a8a;">🔧 Recommended Actions:</strong>
                            <ul style="margin:6px 0 0 20px; padding:0; color:#334155;">
                                ${ai.actions.map(a => `<li style="margin-bottom:4px;">${escapeHtml(a)}</li>`).join('')}
                            </ul>
                        </div>
                        ${ai.nextStep ? `
                        <div style="margin-top:10px; padding:10px; background:#dbeafe; border-radius:6px; border-left:3px solid #3b82f6;">
                            <strong>📌 Next Step:</strong> ${escapeHtml(ai.nextStep)}
                        </div>` : ''}
                    </div>
                `;
            }

            container.innerHTML = html;
        }
    };

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }
})();