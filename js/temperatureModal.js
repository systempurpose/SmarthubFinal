// ---- Helper: get Android SDK version ----
async function getAndroidVersion() {
    try {
        const response = await fetch(`${BACKEND_URL}/adb-shell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: currentDeviceId, command: 'getprop ro.build.version.sdk' })
        });
        const data = await response.json();
        const sdk = parseInt(data.output.trim(), 10);
        return isNaN(sdk) ? null : sdk;
    } catch { return null; }
}

// ---- Fallback: get temperature via ADB ----
async function getTemperatureViaAdb() {
    try {
        // Try to find any thermal zone with a valid temperature
        const resp = await fetch(`${BACKEND_URL}/adb-shell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: currentDeviceId, command: 'cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null' })
        });
        const data = await resp.json();
        const output = data.output || '';
        const lines = output.split('\n').filter(line => line.trim() !== '');
        for (const line of lines) {
            const temp = parseInt(line.trim(), 10);
            if (!isNaN(temp) && temp > 0) {
                // If value > 100, assume millidegrees (divide by 1000)
                return temp > 100 ? (temp / 1000).toFixed(1) + '°C' : temp + '°C';
            }
        }
        return 'Unknown';
    } catch { return 'Unknown'; }
}

// ---- Fallback: get CPU usage via ADB (version‑aware) ----
async function getCpuUsageViaAdb() {
    const sdk = await getAndroidVersion() || 0;
    const isNew = sdk >= 26; // Android 8+ supports `ps -A -o %cpu,NAME`

    let command;
    if (isNew) {
        command = 'ps -A -o %cpu,NAME';
    } else {
        // `top -n 1 -b` works on most older Android
        command = 'top -n 1 -b';
    }

    try {
        const resp = await fetch(`${BACKEND_URL}/adb-shell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: currentDeviceId, command })
        });
        const data = await resp.json();
        const output = data.output || '';
        const lines = output.split('\n');

        let topApps = [];

        if (isNew) {
            // Parse `ps -A -o %cpu,NAME`
            // Output: %CPU NAME
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.includes('CPU') || trimmed.includes('NAME')) continue;
                const parts = trimmed.split(/\s+/);
                if (parts.length >= 2) {
                    const cpu = parseFloat(parts[0]);
                    const name = parts.slice(1).join(' ').trim();
                    if (!isNaN(cpu) && name && cpu > 0) {
                        topApps.push({ name, cpu: cpu.toFixed(1) });
                    }
                }
            }
        } else {
            // Parse `top` output: typically first few lines are headers, then process list.
            // Example:   PID  CPU%  S  #THR     VSS     RSS PCY UID  Name
            // We'll skip lines that don't start with a number.
            let inProcessList = false;
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                // Skip header lines
                if (trimmed.includes('PID') || trimmed.includes('User') || trimmed.includes('Tasks')) continue;
                // Process lines start with PID (a number)
                const firstWord = trimmed.split(/\s+/)[0];
                if (!isNaN(firstWord)) {
                    // This is a process line: columns: PID CPU% S ... Name
                    const parts = trimmed.split(/\s+/);
                    if (parts.length >= 2) {
                        const cpu = parseFloat(parts[1]); // second column is CPU%
                        const name = parts.slice(parts.length - 1)[0]; // last column is name
                        if (!isNaN(cpu) && name && cpu > 0) {
                            topApps.push({ name, cpu: cpu.toFixed(1) });
                        }
                    }
                }
            }
        }

        // Sort descending by CPU
        topApps.sort((a, b) => parseFloat(b.cpu) - parseFloat(a.cpu));
        // Return top 10
        return topApps.slice(0, 10);

    } catch (err) {
        console.warn('CPU usage fallback failed:', err);
        return [];
    }
}

// ---- Updated showTemperatureModal ----
async function showTemperatureModal() {
    const modal = ensureInfoModal('temperatureModal', '🌡️ Phone Temperature & Heat Contributors');
    const body = document.getElementById('temperatureModalBody');
    body.innerHTML = getModernSpinnerHTML('Loading temperature data...');
    modal.style.display = 'flex';

    let currentTemp = 'Unknown';
    let topApps = [];
    let usedFallback = false;

    // 1. Try API first
    try {
        const response = await fetchWithTimeout(`${BACKEND_URL}/api/hardware/cpu-usage?deviceId=${currentDeviceId}`, {}, 15000);
        const data = await response.json();
        if (data.currentTemp || (data.topApps && data.topApps.length > 0)) {
            currentTemp = data.currentTemp || 'Unknown';
            topApps = data.topApps || [];
        } else {
            throw new Error('API returned empty or incomplete data');
        }
    } catch (err) {
        console.warn('API temperature fetch failed, falling back to ADB:', err);
        usedFallback = true;
        try {
            const temp = await getTemperatureViaAdb();
            if (temp) currentTemp = temp;
            const cpuApps = await getCpuUsageViaAdb();
            if (cpuApps && cpuApps.length > 0) topApps = cpuApps;
        } catch (fallbackErr) {
            console.error('ADB fallback also failed:', fallbackErr);
            body.innerHTML = `<div class="alert alert-danger">Error loading temperature: ${escapeHtml(fallbackErr.message)}</div>`;
            return;
        }
    }

    // 2. Render UI
    try {
        let html = `
            <div style="margin-bottom: 16px; background: #f8f9fa; border-radius: 12px; padding: 16px; text-align: center;">
                <h5 style="margin: 0 0 4px 0; font-size: 14px; color: #6B7280;">Current Temperature</h5>
                <p style="margin: 0; font-size: 32px; font-weight: 700; color: ${currentTemp.includes('°C') ? '#1f2937' : '#dc2626'};">${escapeHtml(currentTemp)}</p>
            </div>
        `;

        if (topApps.length > 0) {
            html += `<div style="background: white; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden;">
                <div style="padding: 10px 16px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; font-weight: 600; font-size: 14px;">🔥 Apps consuming CPU</div>
                <div style="padding: 4px 0;">
                    ${topApps.slice(0, 10).map(app => {
                        const displayName = simplifyAppName(app.name);
                        const cpu = parseFloat(app.cpu);
                        const width = Math.min(100, cpu * 2); // scale for visual
                        return `
                        <div style="display: flex; align-items: center; padding: 8px 16px; border-bottom: 1px solid #f1f3f5;">
                            <span style="flex: 1; font-weight: 500; font-size: 13px;">${escapeHtml(displayName)}</span>
                            <span style="font-size: 13px; color: #555; margin-right: 12px;">${escapeHtml(app.cpu)}%</span>
                            <div style="width: 60px; height: 4px; background: #e9ecef; border-radius: 2px; overflow: hidden;">
                                <div style="width: ${width}%; background: #f59e0b; height: 100%;"></div>
                            </div>
                        </div>
                    `;
                    }).join('')}
                </div>
            </div>`;
        } else {
            html += `<p style="color: #6c757d; text-align: center; padding: 20px;">No high CPU usage detected.</p>`;
        }

        if (usedFallback) {
            html += `<div style="margin-top: 12px; font-size: 12px; color: #f59e0b; background: #fffbeb; padding: 6px 12px; border-radius: 6px; border-left: 3px solid #f59e0b;">
                ⚠️ Using ADB fallback – temperature and CPU data may be approximate.
            </div>`;
        }

        body.innerHTML = html;
    } catch (renderErr) {
        console.error('Render error:', renderErr);
        body.innerHTML = `<div class="alert alert-danger">Error rendering temperature: ${escapeHtml(renderErr.message)}</div>`;
    }
}