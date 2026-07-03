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

    // ====== EXISTING TESTS (unchanged but verified) ======
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

    // ====== NEW TESTS ======

    async function testCPUTemperature() {
        try {
            const result = await adb('cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | head -1');
            const tempRaw = result.output.trim();
            let temp = 0;
            if (tempRaw) {
                temp = parseFloat(tempRaw);
                if (temp > 1000) temp /= 1000;
            }
            const passed = temp < 45 || temp === 0;
            const msg = temp > 0 ? `${temp.toFixed(1)}°C` : 'Unable to read CPU temp';
            return {
                name: 'CPU Temperature',
                passed,
                message: msg,
                fix: passed ? '' : 'Clean device vents, close background apps, avoid direct sunlight.'
            };
        } catch (e) {
            return { name: 'CPU Temperature', passed: true, message: 'Sensor not available', fix: '' };
        }
    }

    async function testBatteryVoltage() {
        try {
            const bat = await apiCall('/hardware/battery');
            const voltage = bat.voltage ? parseFloat(bat.voltage) : 0;
            const passed = (voltage >= 3200 && voltage <= 4400) || voltage === 0;
            return {
                name: 'Battery Voltage',
                passed,
                message: voltage > 0 ? `${voltage} mV` : 'Not available',
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

    async function testSignalStrength() {
        try {
            const wifi = await adb('dumpsys wifi | grep -i rssi | head -1');
            const rssiMatch = wifi.output.match(/rssi=(-?\d+)/);
            if (rssiMatch) {
                const rssi = parseInt(rssiMatch[1]);
                const passed = rssi > -80;
                return {
                    name: 'WiFi Signal Strength',
                    passed,
                    message: `${rssi} dBm ${passed ? '✅' : '⚠️'}`,
                    fix: passed ? '' : 'Move closer to router, check for interference, restart WiFi.'
                };
            }
            const cell = await adb('dumpsys telephony.registry | grep -i "signalStrength" | head -1');
            const cellMatch = cell.output.match(/signalStrength\s*=\s*([\d]+)/);
            if (cellMatch) {
                const level = parseInt(cellMatch[1]);
                const passed = level > 0;
                return {
                    name: 'Cellular Signal Strength',
                    passed,
                    message: passed ? `Level ${level}/4` : 'No signal',
                    fix: passed ? '' : 'Check SIM, move to coverage area, restart radio.'
                };
            }
            return { name: 'Signal Strength', passed: true, message: 'Unable to read signal', fix: '' };
        } catch (e) {
            return { name: 'Signal Strength', passed: true, message: 'Not available', fix: '' };
        }
    }

    async function testNetworkType() {
        try {
            const data = await adb('dumpsys telephony.registry | grep -i "dataNetworkType" | head -1');
            const match = data.output.match(/dataNetworkType\s*=\s*(\d+)/);
            if (match) {
                const type = parseInt(match[1]);
                const names = {
                    0: 'Unknown', 1: 'GPRS', 2: 'EDGE', 3: 'UMTS', 4: 'CDMA',
                    5: 'EVDO 0', 6: 'EVDO A', 7: '1xRTT', 8: 'HSDPA', 9: 'HSUPA',
                    10: 'HSPA', 11: 'iDen', 12: 'EVDO B', 13: 'LTE', 14: 'eHRPD',
                    15: 'HSPA+', 16: 'GSM', 17: 'TD-SCDMA', 18: 'IWLAN', 19: 'LTE CA',
                    20: 'NR'
                };
                const name = names[type] || `Type ${type}`;
                const isModern = type >= 13;
                return {
                    name: 'Network Type',
                    passed: isModern,
                    message: name,
                    fix: isModern ? '' : 'Slow network – upgrade plan or change location.'
                };
            }
            return { name: 'Network Type', passed: true, message: 'Not available', fix: '' };
        } catch (e) {
            return { name: 'Network Type', passed: true, message: 'Not available', fix: '' };
        }
    }

    async function testDNSResolution() {
        try {
            const result = await adb('ping -c 1 google.com 2>/dev/null | grep -i "1 packets received"');
            const success = result.output.includes('1 received');
            return {
                name: 'DNS Resolution',
                passed: success,
                message: success ? 'Resolves' : 'Failed',
                fix: success ? '' : 'Check network settings, try `adb shell settings put global private_dns_mode opportunistic`.'
            };
        } catch (e) {
            return { name: 'DNS Resolution', passed: true, message: 'Not tested', fix: '' };
        }
    }

    async function testStorageSpeed() {
        try {
            const result = await adb('dd if=/dev/zero of=/sdcard/speedtest bs=1M count=10 2>&1');
            const output = result.output;
            const match = output.match(/(\d+)\s+MB\/s/);
            if (match) {
                const speed = parseFloat(match[1]);
                const passed = speed > 20;
                return {
                    name: 'Storage Write Speed',
                    passed,
                    message: `${speed.toFixed(1)} MB/s`,
                    fix: passed ? '' : 'Slow storage – possibly fragmented or failing. Backup data and consider factory reset.'
                };
            }
            await adb('rm /sdcard/speedtest 2>/dev/null');
            return { name: 'Storage Speed', passed: true, message: 'Unable to benchmark', fix: '' };
        } catch (e) {
            return { name: 'Storage Speed', passed: true, message: 'Not tested', fix: '' };
        }
    }

    async function testStorageIOErrors() {
        try {
            const result = await adb('logcat -b events -t 100 | grep -i "io_error\\|fsck\\|ext4"');
            const lines = result.output.split('\n').filter(l => l.trim());
            const passed = lines.length === 0;
            return {
                name: 'Storage I/O Errors',
                passed,
                message: passed ? 'None' : `${lines.length} errors found`,
                fix: passed ? '' : 'Backup data immediately. Run `fsck` via recovery or replace storage.'
            };
        } catch (e) {
            return { name: 'Storage I/O Errors', passed: true, message: 'Unable to check', fix: '' };
        }
    }

    async function testMemoryLeaks() {
        try {
            const before = await adb('dumpsys meminfo | grep "Total PSS" | head -1');
            await new Promise(r => setTimeout(r, 5000));
            const after = await adb('dumpsys meminfo | grep "Total PSS" | head -1');
            const beforeMatch = before.output.match(/Total PSS\s*:\s*(\d+)/);
            const afterMatch = after.output.match(/Total PSS\s*:\s*(\d+)/);
            if (beforeMatch && afterMatch) {
                const beforeVal = parseInt(beforeMatch[1]);
                const afterVal = parseInt(afterMatch[1]);
                const diff = afterVal - beforeVal;
                const passed = diff < 50;
                return {
                    name: 'Memory Leak Indicator',
                    passed,
                    message: `${diff > 0 ? '+' : ''}${diff} MB change`,
                    fix: passed ? '' : 'Memory usage increasing – likely a memory leak. Restart device or update firmware.'
                };
            }
            return { name: 'Memory Leak', passed: true, message: 'Unable to measure', fix: '' };
        } catch (e) {
            return { name: 'Memory Leak', passed: true, message: 'Not tested', fix: '' };
        }
    }

   async function testSensors() {
    try {
        let output = '';
        let usedService = '';

        // Try sensorservice first (works on most modern devices)
        try {
            const result = await adb('dumpsys sensorservice');
            output = result.output;
            usedService = 'sensorservice';
        } catch (_) {
            // Fallback to sensors
            try {
                const result2 = await adb('dumpsys sensors');
                output = result2.output;
                usedService = 'sensors';
            } catch (_) {
                return {
                    name: 'Sensor Health',
                    passed: true,
                    message: 'Sensor service not accessible',
                    fix: ''
                };
            }
        }

        // If the output still says the service is missing, try the other one (just in case)
        if (output.includes("Can't find service") || output.includes("No such service")) {
            if (usedService === 'sensorservice') {
                try {
                    const result3 = await adb('dumpsys sensors');
                    output = result3.output;
                    usedService = 'sensors';
                } catch (_) {
                    return {
                        name: 'Sensor Health',
                        passed: true,
                        message: 'Sensor service not available on this device',
                        fix: ''
                    };
                }
            } else {
                try {
                    const result3 = await adb('dumpsys sensorservice');
                    output = result3.output;
                    usedService = 'sensorservice';
                } catch (_) {
                    return {
                        name: 'Sensor Health',
                        passed: true,
                        message: 'Sensor service not available on this device',
                        fix: ''
                    };
                }
            }
        }

        const lower = output.toLowerCase();
        // Check for sensor presence using keywords from your actual output
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

    async function testIMEI() {
        try {
            const result = await adb('service call iphonesubinfo 1 | grep -i "android_id"');
            const imei = result.output.trim();
            const passed = imei.length > 0;
            return {
                name: 'IMEI Present',
                passed,
                message: passed ? '✅ IMEI detected' : '❌ No IMEI',
                fix: passed ? '' : 'IMEI missing – contact manufacturer for repair.'
            };
        } catch (e) {
            return { name: 'IMEI Present', passed: true, message: 'Not accessible', fix: '' };
        }
    }

    async function testChargingCurrent() {
    try {
        // First try via API (might have maxChargingCurrent)
        let current = 0;
        try {
            const bat = await apiCall('/hardware/battery');
            if (bat.maxChargingCurrent) current = bat.maxChargingCurrent;
            else if (bat.max_current) current = bat.max_current;
        } catch (_) {}

        // If not found, parse from dumpsys battery
        if (current === 0) {
            const dump = await adb('dumpsys battery');
            const match = dump.output.match(/Max charging current:\s*(\d+)/);
            if (match) {
                current = parseInt(match[1]);
                // If it's > 10000, assume it's in µA, convert to mA
                if (current > 10000) current = Math.round(current / 1000);
            }
        }

        // If still 0, try sysfs
        if (current === 0) {
            try {
                const sys = await adb('cat /sys/class/power_supply/battery/current_now 2>/dev/null');
                const raw = sys.output.trim();
                if (raw) {
                    const val = parseInt(raw);
                    if (!isNaN(val) && val !== 0) {
                        // Usually in µA, convert to mA
                        current = Math.round(Math.abs(val) / 1000);
                    }
                }
            } catch (_) {}
        }

        if (current === 0) {
            return {
                name: 'Charging Current',
                passed: true,
                message: 'Not reported by this device',
                fix: ''
            };
        }

        const passed = current > 500; // threshold in mA
        return {
            name: 'Charging Current',
            passed,
            message: `${current} mA`,
            fix: passed ? '' : 'Low charging current – check cable, charger, or USB port.'
        };
    } catch (e) {
        return { name: 'Charging Current', passed: true, message: 'Not available', fix: '' };
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
            testDNSResolution,
            testStorageSpeed,
            testStorageIOErrors,
            testMemoryLeaks,
            testSensors,
            testRootStatus,
            testSecurityPatch,
            testIMEI,
            testChargingCurrent
        ];
        const results = [];
        for (const testFn of tests) {
            try {
                const res = await testFn();
                // Ensure the result is an object with the required properties
                if (res && typeof res === 'object' && res.name && typeof res.passed !== 'undefined') {
                    results.push(res);
                } else {
                    // Fallback if the test returned something unexpected
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

            // Filter out any undefined or invalid entries
            const validSoftware = (software || []).filter(t => t && typeof t.passed !== 'undefined');

            const total = validSoftware.length;
            const passed = validSoftware.filter(t => t.passed).length;
            const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
            const color = pct >= 80 ? '#2e7d32' : pct >= 50 ? '#ed6c02' : '#d32f2f';
            const icon = pct >= 80 ? '✅' : pct >= 50 ? '⚠️' : '❌';

            html += `
                <div style="margin-bottom:20px; padding:16px; background:${color}10; border-radius:12px; border:1px solid ${color}30; display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
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

            if (deep) {
                html += `<div style="margin-top:16px; padding:12px; background:#f8f9fa; border-radius:8px;">
                    <h4 style="margin:0 0 4px 0;">🔬 Deep Scan</h4>
                    <p style="margin:0;">${escapeHtml(deep.summary || 'No issues found')}</p>
                </div>`;
            }
            if (rootkit) {
                html += `<div style="margin-top:8px; padding:12px; background:#f8f9fa; border-radius:8px;">
                    <h4 style="margin:0 0 4px 0;">🛡️ Rootkit Scan</h4>
                    <p style="margin:0;">${escapeHtml(rootkit.summary || 'Clean')}</p>
                </div>`;
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