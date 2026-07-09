async function showRamModal() {
    // ---- Helper: simplify app names (no translations needed) ----
    function simplifyAppName(pkg) {
        let name = pkg
            .replace(/^com\.(android|google|transsion|transsnet|facebook|whatsapp|instagram)\./i, '')
            .replace(/^android\./i, '')
            .replace(/\.android$/, '')
            .replace(/[.:]/g, ' ');
        const map = {
            'chrome': 'Chrome',
            'gms': 'Play Services',
            'messaging': 'Messages',
            'phonemaster': 'Phone Master',
            'phonemanager': 'Phone Manager',
            'launcher': 'Launcher',
            'weathers': 'Weather',
            'store': 'App Store',
            'instagram': 'Instagram',
            'facebook': 'Facebook',
            'whatsapp': 'WhatsApp'
        };
        const lower = name.toLowerCase();
        for (const [key, val] of Object.entries(map)) {
            if (lower.includes(key)) return val;
        }
        return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').substring(0, 25);
    }

    // ---- Helper: get Android SDK version via ADB ----
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

    // ---- Fallback: fetch RAM usage via ADB (version‑aware) ----
    async function getRamUsageViaAdb() {
        const sdk = await getAndroidVersion() || 0;
        const isOld = sdk < 21;   // Android < 5
        const isMid = sdk >= 21 && sdk <= 24; // Android 5-7
        const isNew = sdk >= 26;  // Android 8+

        let totalMemMB = 0;
        let freeMemMB = 0;

        // 1. Get total/free memory from /proc/meminfo
        try {
            const meminfoResp = await fetch(`${BACKEND_URL}/adb-shell`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId: currentDeviceId, command: 'cat /proc/meminfo' })
            });
            const meminfoData = await meminfoResp.json();
            const meminfo = meminfoData.output;
            const totalMatch = meminfo.match(/MemTotal:\s+(\d+)/);
            const freeMatch = meminfo.match(/MemFree:\s+(\d+)/);
            if (totalMatch) totalMemMB = parseInt(totalMatch[1], 10) / 1024;
            if (freeMatch) freeMemMB = parseInt(freeMatch[1], 10) / 1024;
        } catch { /* ignore */ }

        // Fallback: try `free -m`
        if (totalMemMB === 0) {
            try {
                const freeResp = await fetch(`${BACKEND_URL}/adb-shell`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deviceId: currentDeviceId, command: 'free -m' })
                });
                const freeData = await freeResp.json();
                const lines = freeData.output.split('\n');
                for (const line of lines) {
                    if (line.startsWith('Mem:')) {
                        const parts = line.split(/\s+/);
                        if (parts.length >= 4) {
                            totalMemMB = parseFloat(parts[1]);
                            freeMemMB = parseFloat(parts[3]);
                        }
                        break;
                    }
                }
            } catch { /* ignore */ }
        }

        // 2. Get process list with RSS
        let processes = [];
        if (isNew) {
            // Android 8+ : ps -A -o RSS,NAME
            try {
                const psResp = await fetch(`${BACKEND_URL}/adb-shell`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deviceId: currentDeviceId, command: 'ps -A -o RSS,NAME' })
                });
                const psData = await psResp.json();
                const lines = psData.output.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    const parts = trimmed.split(/\s+/);
                    if (parts.length >= 2 && !isNaN(parts[0])) {
                        const rssKB = parseInt(parts[0], 10);
                        const name = parts.slice(1).join(' ').trim();
                        if (name && rssKB > 0) {
                            processes.push({ name, rssMB: rssKB / 1024 });
                        }
                    }
                }
            } catch { /* ignore */ }
        } else if (isMid) {
            // Android 5-7: ps -A (columns: USER PID PPID VSIZE RSS WCHAN PC NAME)
            try {
                const psResp = await fetch(`${BACKEND_URL}/adb-shell`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deviceId: currentDeviceId, command: 'ps -A' })
                });
                const psData = await psResp.json();
                const lines = psData.output.split('\n');
                let headerSkipped = false;
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    if (!headerSkipped) {
                        if (trimmed.includes('USER') || trimmed.includes('PID')) {
                            headerSkipped = true;
                            continue;
                        }
                    }
                    const parts = trimmed.split(/\s+/);
                    if (parts.length >= 6) {
                        const rssKB = parseInt(parts[4], 10);
                        const name = parts.slice(5).join(' ').trim();
                        if (name && !isNaN(rssKB) && rssKB > 0) {
                            processes.push({ name, rssMB: rssKB / 1024 });
                        }
                    }
                }
            } catch { /* ignore */ }
        } else {
            // Android < 5: ps (columns: USER PID PPID VSIZE RSS WCHAN PC NAME)
            try {
                const psResp = await fetch(`${BACKEND_URL}/adb-shell`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deviceId: currentDeviceId, command: 'ps' })
                });
                const psData = await psResp.json();
                const lines = psData.output.split('\n');
                let headerSkipped = false;
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    if (!headerSkipped) {
                        if (trimmed.includes('USER') || trimmed.includes('PID')) {
                            headerSkipped = true;
                            continue;
                        }
                    }
                    const parts = trimmed.split(/\s+/);
                    if (parts.length >= 6) {
                        const rssKB = parseInt(parts[4], 10);
                        const name = parts.slice(5).join(' ').trim();
                        if (name && !isNaN(rssKB) && rssKB > 0) {
                            processes.push({ name, rssMB: rssKB / 1024 });
                        }
                    }
                }
            } catch { /* ignore */ }
        }

        // Filter kernel threads (names starting with '[')
        processes = processes.filter(p => !p.name.startsWith('['));

        // Deduplicate by name (keep highest RSS)
        const nameMap = new Map();
        for (const p of processes) {
            if (!nameMap.has(p.name) || nameMap.get(p.name).rssMB < p.rssMB) {
                nameMap.set(p.name, p);
            }
        }
        processes = Array.from(nameMap.values());

        // Sort descending by RSS
        processes.sort((a, b) => b.rssMB - a.rssMB);

        const totalRSS = processes.reduce((sum, p) => sum + p.rssMB, 0);
        if (totalMemMB === 0) totalMemMB = totalRSS + freeMemMB;

        return {
            totalRam: totalMemMB,
            usedRam: totalRSS,
            processes: processes
        };
    }

    // ======================== MAIN MODAL FUNCTION ========================
    const modal = ensureInfoModal('ramModal', t('ramModal.title'));
    const body = document.getElementById('ramModalBody');
    body.innerHTML = getModernSpinnerHTML(t('ramModal.loading'));
    modal.style.display = 'flex';

    let ramData = null;
    let usedFallback = false;

    // 1. Try API first
    try {
        const [processes, ramInfo] = await Promise.all([
            fetchWithTimeout(`${BACKEND_URL}/api/hardware/ram-usage?deviceId=${currentDeviceId}`, {}, 15000).then(r => r.json()),
            fetchWithTimeout(`${BACKEND_URL}/api/hardware/ram?deviceId=${currentDeviceId}`, {}, 8000).then(r => r.json())
        ]);

        if (processes && Array.isArray(processes) && processes.length > 0 && ramInfo && ramInfo.total) {
            ramData = {
                processes: processes,
                totalRam: ramInfo.total,
                usedRam: ramInfo.used
            };
        } else {
            throw new Error('API returned empty or incomplete data');
        }
    } catch (err) {
        console.warn('API RAM fetch failed, falling back to ADB:', err);
        usedFallback = true;
        try {
            const adbData = await getRamUsageViaAdb();
            ramData = {
                processes: adbData.processes.map(p => ({ name: p.name, rssMB: p.rssMB })),
                totalRam: `${Math.round(adbData.totalRam)} MB`,
                usedRam: `${Math.round(adbData.usedRam)} MB`
            };
        } catch (fallbackErr) {
            console.error('ADB fallback also failed:', fallbackErr);
            body.innerHTML = `<div class="alert alert-danger">${t('common.error')} ${t('ramModal.loadingError')}: ${escapeHtml(fallbackErr.message)}</div>`;
            return;
        }
    }

    // 2. Render UI
    try {
        const processes = ramData.processes || [];
        const totalRam = ramData.totalRam || '?';
        const usedRam = ramData.usedRam || '?';

        let usedMB = 0;
        if (usedRam !== '?') {
            const match = usedRam.match(/(\d+(?:\.\d+)?)/);
            if (match) {
                usedMB = parseFloat(match[1]);
                if (usedRam.includes('GB')) usedMB *= 1024;
            }
        }

        let ramBarHtml = '';
        if (totalRam !== '?' && usedRam !== '?') {
            const usedGB = parseFloat(usedRam);
            const totalGB = parseFloat(totalRam);
            if (!isNaN(usedGB) && !isNaN(totalGB) && totalGB > 0) {
                const percent = (usedGB / totalGB) * 100;
                ramBarHtml = `
                    <div style="background: #f8f9fa; border-radius: 16px; padding: 12px; margin-bottom: 16px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                            <span style="font-weight: 600;">📊 ${t('ramModal.ramUsage')}</span>
                            <span>${escapeHtml(usedRam)} / ${escapeHtml(totalRam)} (${percent.toFixed(1)}%)</span>
                        </div>
                        <div style="background: #e9ecef; border-radius: 10px; height: 8px; overflow: hidden;">
                            <div style="width: ${percent}%; background: #0d6efd; height: 100%; border-radius: 10px;"></div>
                        </div>
                    </div>
                `;
            }
        }

        let processList = processes.map(proc => {
            const mb = parseFloat(proc.rssMB);
            let percentOfUsed = 0;
            if (!isNaN(mb) && usedMB > 0) percentOfUsed = (mb / usedMB) * 100;
            return {
                originalName: proc.name,
                displayName: simplifyAppName(proc.name),
                percent: percentOfUsed,
                mb: mb
            };
        }).filter(p => p.percent > 0.01 || p.mb > 0);

        const accountedPercent = processList.reduce((sum, p) => sum + p.percent, 0);
        const remainingPercent = Math.max(0, 100 - accountedPercent);
        if (remainingPercent > 0.5) {
            processList.push({
                originalName: 'system_kernel',
                displayName: `🖥️ ${t('ramModal.systemKernel')}`,
                percent: remainingPercent,
                mb: (remainingPercent / 100) * usedMB
            });
        }

        processList.sort((a, b) => b.percent - a.percent);

        let fallbackNote = '';
        if (usedFallback) {
            fallbackNote = `<div style="font-size: 12px; color: #f59e0b; background: #fffbeb; padding: 6px 12px; border-radius: 6px; margin-top: 8px; border-left: 3px solid #f59e0b;">
                ⚠️ ${t('ramModal.fallback')}
            </div>`;
        }

        const html = `
            ${ramBarHtml}
            <div style="margin-bottom: 12px;">
                <input type="text" id="ramSearchInput" placeholder="${t('common.filterApps')}..." style="width:100%; padding:8px 12px; border:1px solid #ddd; border-radius:24px; font-size:13px; outline:none;">
            </div>
            <div id="ramProcessList" class="ram-process-list-container" style="max-height: 320px; overflow-y: auto; padding-right: 6px;">
                ${processList.map(proc => `
                    <div class="ram-process-item" data-name="${escapeHtml(proc.originalName.toLowerCase())}" style="margin-bottom: 12px; background: #ffffff; border-radius: 10px; padding: 8px 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <span style="font-weight: 600; font-size: 13px;">${escapeHtml(proc.displayName)}</span>
                            <span style="font-size: 12px; color: #555;">${proc.percent.toFixed(1)}% (${proc.mb.toFixed(0)} MB)</span>
                        </div>
                        <div style="background: #e9ecef; border-radius: 4px; height: 4px; overflow: hidden;">
                            <div style="width: ${proc.percent}%; background: #0d6efd; height: 100%; border-radius: 4px;"></div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div style="margin-top: 8px; font-size: 11px; color: #6c757d; text-align: center;">
                ${t('ramModal.note', { usedRam: escapeHtml(usedRam) })}
            </div>
            ${fallbackNote}
        `;

        body.innerHTML = html;

        // Search filter
        const searchInput = document.getElementById('ramSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                const items = document.querySelectorAll('.ram-process-item');
                items.forEach(item => {
                    const name = item.getAttribute('data-name');
                    if (name && name.includes(query)) {
                        item.style.display = '';
                    } else {
                        item.style.display = 'none';
                    }
                });
            });
        }

    } catch (renderErr) {
        console.error('Render error:', renderErr);
        body.innerHTML = `<div class="alert alert-danger">${t('common.error')} ${t('ramModal.renderError')}: ${escapeHtml(renderErr.message)}</div>`;
    }
}