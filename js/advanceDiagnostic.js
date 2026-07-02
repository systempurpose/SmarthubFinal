// js/advanceDiagnostic.js
(function() {
    'use strict';

    let currentDeviceId = null;
    let diagResults = null;

    // ---- Private helpers ----
    async function adb(command) {
        const resp = await fetch('/adb-shell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: currentDeviceId, command })
        });
        if (!resp.ok) throw new Error(`ADB command failed: ${resp.status}`);
        return await resp.json();
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

    // ---- Individual software-fixable tests (with anti-false-positive) ----

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
            const recentCrashes = [];

            for (const line of lines) {
                const ts = parseLogcatTimestamp(line);
                if (ts && (now - ts) < 900) {
                    const pkgMatch = line.match(/FATAL EXCEPTION:\s+(\S+)/);
                    if (pkgMatch) {
                        const pkg = pkgMatch[1];
                        if (!pkg.includes('android.process.acore') && !pkg.includes('com.android.phone')) {
                            crashPackages.add(pkg);
                            recentCrashes.push(pkg);
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
        } catch {
            return { name: 'App Crashes', passed: false, message: 'Failed to read logs', fix: 'Check ADB connection.' };
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
        } catch {
            return { name: 'ANR', passed: false, message: 'Failed to check ANR', fix: 'Restart ADB.' };
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
            return {
                name: 'Kernel Panic',
                passed: !hasPanic || uptime > 86400,
                message: hasPanic && uptime < 86400 ? 'Kernel panic detected in current boot' : 'No kernel panic',
                fix: hasPanic && uptime < 86400 ? 'Reflash boot.img via fastboot. If persists, factory reset.' : ''
            };
        } catch {
            return { name: 'Kernel Panic', passed: false, message: 'Failed to read kernel log', fix: 'Check if device supports last_kmsg.' };
        }
    }

    async function testGhostTouch() {
        try {
            // Check if screen is on – if on, test is invalid
            const screenState = await adb('dumpsys window policy | grep mDreamingLockscreen');
            const isScreenOn = screenState.output.includes('mDreamingLockscreen=false');
            if (isScreenOn) {
                return { name: 'Ghost Touch', passed: true, message: 'Skipped (screen is on – cannot test accurately)', fix: '' };
            }

            // Try getevent – may fail on some devices
            let run1, run2;
            try {
                run1 = await adb('getevent -t -c 100');
                await new Promise(r => setTimeout(r, 2000));
                run2 = await adb('getevent -t -c 100');
            } catch (e) {
                // Fallback: try dumpsys input to see if there are recent touches
                const dump = await adb('dumpsys input');
                const touchEvents = dump.output.match(/TOUCH: /g) || [];
                const count = touchEvents.length;
                const passed = count < 10; // threshold
                return {
                    name: 'Ghost Touch',
                    passed,
                    message: passed ? `No ghost touch (${count} recent events)` : `Possible ghost touch (${count} events)`,
                    fix: passed ? '' : 'Try recalibration via `*#*#2664#*#*`. Disable "High touch sensitivity".'
                };
            }

            const count1 = run1.output.split('\n').filter(l => l.trim() && !l.includes('SYN_REPORT')).length;
            const count2 = run2.output.split('\n').filter(l => l.trim() && !l.includes('SYN_REPORT')).length;
            const passed = !(count1 > 3 && count2 > 3);
            const avgCount = Math.round((count1 + count2) / 2);

            return {
                name: 'Ghost Touch',
                passed,
                message: passed ? `No ghost touch (avg ${avgCount} events)` : `Possible ghost touch (avg ${avgCount} events)`,
                fix: passed ? '' : 'Try recalibration via `*#*#2664#*#*`. Disable "High touch sensitivity". Reflash touch firmware.'
            };
        } catch (err) {
            return { name: 'Ghost Touch', passed: false, message: 'Failed to read touch events', fix: 'Check ADB and touch driver.' };
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
        } catch {
            return { name: 'Storage Full', passed: false, message: 'Failed to get storage info', fix: 'Check device connection.' };
        }
    }

    async function testSystemServiceCrashes() {
        try {
            const result = await adb('logcat -b system -t 200');
            const lines = result.output.split('\n').filter(l => 
                l.includes('Service death') || l.includes('Crash')
            );

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
        } catch {
            return { name: 'System Service Stability', passed: false, message: 'Failed to read system logs', fix: 'Check ADB permissions.' };
        }
    }

    async function testUIJank() {
        try {
            const ramData = await apiCall('/hardware/ram');
            const totalRamGB = parseFloat(ramData.total) || 4;
            const threshold = totalRamGB < 3 ? 10 : 5;

            const fgResult = await adb('dumpsys window | grep mCurrentFocus | cut -d/ -f2 | cut -d} -f1');
            const fgPkg = fgResult.output.trim() || 'com.android.systemui';

            const gfxResult = await adb(`dumpsys gfxinfo ${fgPkg}`);
            const totalMatch = gfxResult.output.match(/Total frames rendered: (\d+)/);
            const jankMatch = gfxResult.output.match(/Janky frames: (\d+)/);

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
                return { name: 'UI Jank', passed: true, message: 'No frame data available', fix: '' };
            }
        } catch {
            return { name: 'UI Jank', passed: false, message: 'Failed to get gfxinfo', fix: 'Ensure app is active.' };
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
        } catch {
            return { name: 'Excessive Wakeups', passed: false, message: 'Failed to check wakelocks', fix: 'Restart ADB.' };
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
        } catch {
            return { name: 'Network Stack', passed: false, message: 'Failed to check', fix: 'Check device connection.' };
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
        } catch {
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
            } catch {
                return { name: 'Thermal Throttling', passed: false, message: 'Failed to check temperature', fix: 'Restart ADB.' };
            }
        }
    }

    // ---- Run all software-fixable tests ----
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
            testGhostTouch
        ];
        const results = [];
        for (const testFn of tests) {
            try {
                const res = await testFn();
                results.push(res);
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

    // ---- Deep & Rootkit (keep existing) ----
    async function performDeepScan(deviceId) {
        try {
            const res = await fetch(`/deep-scan?deviceId=${deviceId}`);
            if (!res.ok) throw new Error('Deep scan failed');
            return await res.json();
        } catch { return { summary: 'Deep scan unavailable' }; }
    }

    async function performRootkitScan(deviceId) {
        try {
            const res = await fetch(`/rootkit-scan?deviceId=${deviceId}`);
            if (!res.ok) throw new Error('Rootkit scan failed');
            return await res.json();
        } catch { return { summary: 'Rootkit scan unavailable' }; }
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

            diagResults = { software: softwareResults, deep, rootkit };
            if (typeof onProgress === 'function') onProgress('Done');
            return diagResults;
        },

        getResults: function() { return diagResults; },

        renderResults: function(containerId) {
            const container = document.getElementById(containerId);
            if (!container || !diagResults) return;

            const { software, deep, rootkit } = diagResults;
            let html = '';

            // Overall score
            const total = software.length;
            const passed = software.filter(t => t.passed).length;
            const pct = total > 0 ? Math.round((passed/total)*100) : 0;
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

            // Software cards
            if (software && software.length) {
                html += `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px,1fr)); gap:12px;">`;
                for (const test of software) {
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
            }

            // Deep & Rootkit summaries
            if (deep) {
                html += `<div style="margin-top:16px; padding:12px; background:#f8f9fa; border-radius:8px;"><h4 style="margin:0 0 4px 0;">🔬 Deep Scan</h4><p style="margin:0;">${escapeHtml(deep.summary || 'No issues found')}</p></div>`;
            }
            if (rootkit) {
                html += `<div style="margin-top:8px; padding:12px; background:#f8f9fa; border-radius:8px;"><h4 style="margin:0 0 4px 0;">🛡️ Rootkit Scan</h4><p style="margin:0;">${escapeHtml(rootkit.summary || 'Clean')}</p></div>`;
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