// ---- Helper: get Android SDK version (via ADB) ----
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

// ---- Fallback: fetch storage details via ADB (version‑aware) ----
async function getStorageDetailsViaAdb() {
    const sdk = await getAndroidVersion() || 0;
    const isNew = sdk >= 26; // Android 8+ has better `df` output

    // 1. Get total/used/free from `df` (works on all versions)
    let dfCmd = isNew ? 'df -k /data' : 'df /data';
    let dfOutput;
    try {
        const resp = await fetch(`${BACKEND_URL}/adb-shell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: currentDeviceId, command: dfCmd })
        });
        const data = await resp.json();
        dfOutput = data.output;
    } catch { throw new Error('Unable to fetch storage via ADB'); }

    // Parse df output
    const lines = dfOutput.split('\n').filter(line => line.trim() && (line.includes('/data') || line.includes('/storage')));
    let totalKB = 0, usedKB = 0, freeKB = 0;
    for (const line of lines) {
        // Typical df output: Filesystem     1K-blocks    Used Available Use% Mounted on
        // For older Android: /dev/block/...  ...  /data
        const parts = line.trim().split(/\s+/);
        if (parts.length < 4) continue;
        // Try to find the mount point column
        const mountIndex = parts.indexOf('/data') !== -1 ? parts.indexOf('/data') : parts.indexOf('/storage');
        if (mountIndex === -1) continue;
        // Assume columns: [fs, total, used, available, use%, mount]
        // But for older versions, columns may differ: e.g., [fs, size, used, avail, capacity, mounted]
        // We'll try to detect
        let totalIdx = 1, usedIdx = 2, freeIdx = 3;
        // If the line starts with 'Filesystem', skip
        if (parts[0].toLowerCase().includes('filesystem')) continue;
        // Check if the second column is a number (total)
        const totalTest = parseFloat(parts[1]);
        if (isNaN(totalTest)) {
            // Try different column arrangement: maybe [fs, used, avail, capacity, mount]
            // For older Android, e.g., /dev/block/dm-0  4.2G  2.8G  1.4G  67%  /data
            // That's [fs, total, used, avail, capacity, mount]
            // Actually, older df without -k: /dev/block/dm-0   4325376  2838416  1486960  67%  /data
            // So it's [fs, total, used, avail, capacity, mount] if there is no Filesystem header.
            // We'll parse by the last column being mount point.
            // We'll just take the last 5 parts: size, used, avail, capacity, mount
            if (parts.length >= 6) {
                const size = parseFloat(parts[1]);
                const used = parseFloat(parts[2]);
                const avail = parseFloat(parts[3]);
                // The unit is in the header? Actually df without -k uses blocks of 1K? Usually in 1K blocks.
                // We'll treat them as KB.
                if (!isNaN(size) && !isNaN(used) && !isNaN(avail)) {
                    totalKB = size;
                    usedKB = used;
                    freeKB = avail;
                }
            }
        } else {
            // Newer df -k: columns: filesystem, 1K-blocks, Used, Available, Use%, Mounted on
            totalKB = parseFloat(parts[1]);
            usedKB = parseFloat(parts[2]);
            freeKB = parseFloat(parts[3]);
        }
    }

    // Convert KB to human readable
    const totalHuman = formatSize(totalKB * 1024);
    const usedHuman = formatSize(usedKB * 1024);
    const freeHuman = formatSize(freeKB * 1024);

    // 2. Get app sizes (for categories) – only on Android 8+ where `du` works reliably
    let appsBytes = 0;
    let mediaBytes = 0;
    let systemBytes = 0;
    let otherBytes = 0;

    if (sdk >= 26) {
        try {
            // List all packages and get their private data size using `du` (this is approximate)
            const pkgList = await fetch(`${BACKEND_URL}/adb-shell`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId: currentDeviceId, command: 'pm list packages' })
            });
            const pkgData = await pkgList.json();
            const packages = pkgData.output.split('\n')
                .filter(line => line.startsWith('package:'))
                .map(line => line.replace('package:', '').trim());

            // Limit to first 50 packages to avoid timeout
            let totalAppSize = 0;
            for (const pkg of packages.slice(0, 50)) {
                try {
                    // Get the size of /data/data/<pkg>
                    const duResp = await fetch(`${BACKEND_URL}/adb-shell`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ deviceId: currentDeviceId, command: `du -sk /data/data/${pkg} 2>/dev/null` })
                    });
                    const duData = await duResp.json();
                    const duOut = duData.output;
                    const match = duOut.match(/^(\d+)/);
                    if (match) {
                        totalAppSize += parseInt(match[1], 10) * 1024; // convert KB to bytes
                    }
                } catch { /* ignore */ }
            }
            appsBytes = totalAppSize;
        } catch { /* ignore */ }
    }

    // Attempt to get media size (DCIM, Movies, Music, Pictures) via `du`
    if (sdk >= 26) {
        const mediaDirs = ['/sdcard/DCIM', '/sdcard/Movies', '/sdcard/Music', '/sdcard/Pictures'];
        let mediaTotal = 0;
        for (const dir of mediaDirs) {
            try {
                const duResp = await fetch(`${BACKEND_URL}/adb-shell`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deviceId: currentDeviceId, command: `du -sk ${dir} 2>/dev/null` })
                });
                const duData = await duResp.json();
                const duOut = duData.output;
                const match = duOut.match(/^(\d+)/);
                if (match) {
                    mediaTotal += parseInt(match[1], 10) * 1024;
                }
            } catch { /* ignore */ }
        }
        mediaBytes = mediaTotal;
    }

    // System = total - (apps + media + other)
    const totalBytes = totalKB * 1024;
    const usedBytes = usedKB * 1024;
    const freeBytes = freeKB * 1024;
    otherBytes = usedBytes - (appsBytes + mediaBytes);
    if (otherBytes < 0) otherBytes = 0;

    return {
        total: totalBytes,
        used: usedBytes,
        free: freeBytes,
        breakdown: {
            apps: { bytes: appsBytes, human: formatSize(appsBytes) },
            media: { bytes: mediaBytes, human: formatSize(mediaBytes) },
            other: { bytes: otherBytes, human: formatSize(otherBytes) },
            // system not separately available; we can put the remaining difference as system?
            // but we'll combine system with other for simplicity.
            system: { bytes: 0, human: '0 B' } // we don't have system partition size
        }
    };
}

// ---- Updated showStorageModal ----
async function showStorageModal() {
    const modal = ensureInfoModal('storageModal', '💾 Storage Details');
    const body = document.getElementById('storageModalBody');
    body.innerHTML = getModernSpinnerHTML('Loading storage...');
    modal.style.display = 'flex';

    let data = null;
    let usedFallback = false;

    // 1. Try the API first
    try {
        const url = `${BACKEND_URL}/api/hardware/storage-details?deviceId=${currentDeviceId}`;
        console.log('Fetching storage details from:', url);
        const response = await fetchWithTimeout(url, {}, 120000);
        data = await response.json();
        console.log('Storage details response (API):', data);
    } catch (err) {
        console.warn('API storage fetch failed, falling back to ADB:', err);
        usedFallback = true;
        try {
            data = await getStorageDetailsViaAdb();
            // Wrap in the expected structure
            data = {
                breakdown: {
                    total: { bytes: data.total, human: formatSize(data.total) },
                    used: { bytes: data.used, human: formatSize(data.used) },
                    free: { bytes: data.free, human: formatSize(data.free) },
                    apps: data.breakdown.apps,
                    media: data.breakdown.media,
                    other: data.breakdown.other,
                    system: data.breakdown.system
                }
            };
            usedFallback = true;
        } catch (fallbackErr) {
            console.error('ADB fallback also failed:', fallbackErr);
            body.innerHTML = `<div class="alert alert-danger">Error loading storage: ${escapeHtml(fallbackErr.message)}</div>`;
            return;
        }
    }

    // 2. Render the UI (same as before, but using data from either source)
    try {
        const b = data.breakdown || {};
        const total = b.total?.human || '?';
        const used = b.used?.human || '?';
        const free = b.free?.human || '?';
        const freeBytes = Number(b.free?.bytes) || 0;

        const categories = [
            { key: 'apps', label: 'Apps', icon: '📱', color: '#0d6efd', data: b.apps },
            { key: 'media', label: 'Media', icon: '🎬', color: '#198754', data: b.media },
            { key: 'system', label: 'System', icon: '⚙️', color: '#0dcaf0', data: b.system },
            { key: 'other', label: 'Other', icon: '📦', color: '#6c757d', data: b.other }
        ].map(cat => ({
            ...cat,
            bytes: Number(cat.data?.bytes) || 0,
            human: cat.data?.human || '0 KB'
        }));

        const totalBytesAll = categories.reduce((sum, c) => sum + c.bytes, 0) + freeBytes;
        const segments = totalBytesAll > 0
            ? [...categories, { key: 'free', label: 'Free', icon: '🟩', color: '#e5e7eb', bytes: freeBytes, human: free }]
                .map(s => ({ ...s, percent: (s.bytes / totalBytesAll) * 100 }))
            : [];

        const sortedCategories = [...categories].sort((a, b2) => b2.bytes - a.bytes);
        const freeSegment = segments.find(s => s.key === 'free');
        const freePercent = freeSegment ? freeSegment.percent : 0;
        const freeStatusColor = freePercent < 10 ? '#dc3545' : freePercent < 20 ? '#f59e0b' : '#198754';
        const freeStatusLabel = freePercent < 10 ? 'Low' : freePercent < 20 ? 'Getting full' : 'Healthy';

        let fallbackNote = '';
        if (usedFallback) {
            fallbackNote = `<div style="margin-top: 8px; font-size: 12px; color: #f59e0b; background: #fffbeb; padding: 6px 12px; border-radius: 6px; border-left: 3px solid #f59e0b;">
                ⚠️ Using ADB fallback – some categories may be approximate.
            </div>`;
        }

        const html = `
            <div style="padding: 4px 0;">
                <!-- Headline numbers -->
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 32px; font-weight: 700; color: #1f2937; line-height: 1.1;">
                        ${escapeHtml(total)} <span style="font-size: 16px; font-weight: 500; color: #9ca3af;">total</span>
                    </div>
                    <div style="font-size: 14px; color: #6b7280; margin-top: 6px;">
                        <strong style="color: #374151;">${escapeHtml(used)}</strong> used ·
                        <strong style="color: #374151;">${escapeHtml(free)}</strong> free
                        <span style="display: inline-block; margin-left: 8px; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; background: ${freeStatusColor}18; color: ${freeStatusColor};">
                            ${freeStatusLabel}
                        </span>
                    </div>
                </div>

                <!-- Segmented storage bar -->
                <div style="display: flex; width: 100%; height: 14px; border-radius: 8px; overflow: hidden; background: #f1f3f5; margin-bottom: 20px; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.04);">
                    ${segments.map(s => `
                        <div title="${escapeHtml(s.label)}: ${escapeHtml(s.human)}"
                             style="width: ${Math.max(s.percent, s.bytes > 0 ? 0.6 : 0)}%; background: ${s.color}; transition: width 0.3s ease;">
                        </div>
                    `).join('')}
                </div>

                <!-- Category legend -->
                <div style="display: flex; flex-direction: column; gap: 2px;">
                    ${sortedCategories.map(cat => {
                        const pct = segments.find(s => s.key === cat.key)?.percent || 0;
                        return `
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 4px; border-bottom: 1px solid #f1f3f5;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="width: 10px; height: 10px; border-radius: 3px; background: ${cat.color}; flex-shrink: 0;"></span>
                                <span style="font-size: 14px; color: #374151;">${cat.icon} ${escapeHtml(cat.label)}</span>
                            </div>
                            <div style="text-align: right;">
                                <span style="font-size: 14px; font-weight: 600; color: #1f2937;">${escapeHtml(cat.human)}</span>
                                <span style="font-size: 12px; color: #9ca3af; margin-left: 6px;">${pct.toFixed(1)}%</span>
                            </div>
                        </div>
                    `;
                    }).join('')}
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 4px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="width: 10px; height: 10px; border-radius: 3px; background: #e5e7eb; flex-shrink: 0;"></span>
                            <span style="font-size: 14px; color: #9ca3af;">🟩 Free</span>
                        </div>
                        <div style="text-align: right;">
                            <span style="font-size: 14px; font-weight: 600; color: #6b7280;">${escapeHtml(free)}</span>
                            <span style="font-size: 12px; color: #9ca3af; margin-left: 6px;">${freePercent.toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
                ${fallbackNote}
            </div>
        `;

        body.innerHTML = html;
    } catch (renderErr) {
        console.error('Render error:', renderErr);
        body.innerHTML = `<div class="alert alert-danger">Error rendering storage: ${escapeHtml(renderErr.message)}</div>`;
    }
}