// ---- Updated showStorageModal ----
async function showStorageModal() {
    const modal = ensureInfoModal('storageModal', t('storageModal.title'));
    const body = document.getElementById('storageModalBody');
    body.innerHTML = getModernSpinnerHTML(t('storageModal.loading'));
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
            body.innerHTML = `<div class="alert alert-danger">${t('common.error')} ${t('storageModal.loadingError')}: ${escapeHtml(fallbackErr.message)}</div>`;
            return;
        }
    }

    // 2. Render the UI
    try {
        const b = data.breakdown || {};
        const total = b.total?.human || '?';
        const used = b.used?.human || '?';
        const free = b.free?.human || '?';
        const freeBytes = Number(b.free?.bytes) || 0;

        const categories = [
            { key: 'apps', label: t('storageModal.category.apps'), icon: '📱', color: '#0d6efd', data: b.apps },
            { key: 'media', label: t('storageModal.category.media'), icon: '🎬', color: '#198754', data: b.media },
            { key: 'system', label: t('storageModal.category.system'), icon: '⚙️', color: '#0dcaf0', data: b.system },
            { key: 'other', label: t('storageModal.category.other'), icon: '📦', color: '#6c757d', data: b.other }
        ].map(cat => ({
            ...cat,
            bytes: Number(cat.data?.bytes) || 0,
            human: cat.data?.human || '0 KB'
        }));

        const totalBytesAll = categories.reduce((sum, c) => sum + c.bytes, 0) + freeBytes;
        const segments = totalBytesAll > 0
            ? [...categories, { key: 'free', label: t('storageModal.category.free'), icon: '🟩', color: '#e5e7eb', bytes: freeBytes, human: free }]
                .map(s => ({ ...s, percent: (s.bytes / totalBytesAll) * 100 }))
            : [];

        const sortedCategories = [...categories].sort((a, b2) => b2.bytes - a.bytes);
        const freeSegment = segments.find(s => s.key === 'free');
        const freePercent = freeSegment ? freeSegment.percent : 0;
        
        let freeStatusLabel, freeStatusColor;
        if (freePercent < 10) {
            freeStatusLabel = t('storageModal.status.low');
            freeStatusColor = '#dc3545';
        } else if (freePercent < 20) {
            freeStatusLabel = t('storageModal.status.gettingFull');
            freeStatusColor = '#f59e0b';
        } else {
            freeStatusLabel = t('storageModal.status.healthy');
            freeStatusColor = '#198754';
        }

        let fallbackNote = '';
        if (usedFallback) {
            fallbackNote = `<div style="margin-top: 8px; font-size: 12px; color: #f59e0b; background: #fffbeb; padding: 6px 12px; border-radius: 6px; border-left: 3px solid #f59e0b;">
                ⚠️ ${t('storageModal.fallback')}
            </div>`;
        }

        const html = `
            <div style="padding: 4px 0;">
                <!-- Headline numbers -->
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 32px; font-weight: 700; color: #1f2937; line-height: 1.1;">
                        ${escapeHtml(total)} <span style="font-size: 16px; font-weight: 500; color: #9ca3af;">${t('storageModal.total')}</span>
                    </div>
                    <div style="font-size: 14px; color: #6b7280; margin-top: 6px;">
                        <strong style="color: #374151;">${escapeHtml(used)}</strong> ${t('storageModal.used')} ·
                        <strong style="color: #374151;">${escapeHtml(free)}</strong> ${t('storageModal.free')}
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
                            <span style="font-size: 14px; color: #9ca3af;">🟩 ${t('storageModal.category.free')}</span>
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
        body.innerHTML = `<div class="alert alert-danger">${t('common.error')} ${t('storageModal.renderError')}: ${escapeHtml(renderErr.message)}</div>`;
    }
}