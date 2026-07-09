async function showBatteryModal() {
    const modal = ensureInfoModal('batteryModal', t('batteryModal.title'));
    const body = document.getElementById('batteryModalBody');
    body.innerHTML = getModernSpinnerHTML(t('batteryModal.loading'));
    modal.style.display = 'flex';

    try {
        const [battery, cpuData] = await Promise.all([
            apiCall(`/hardware/battery?deviceId=${currentDeviceId}`).catch(() => ({})),
            apiCall(`/hardware/cpu-usage?deviceId=${currentDeviceId}`).catch(() => ({}))
        ]);

        const topApps = cpuData.topApps || [];

        // ---- Battery Summary (compact) ----
        const level = battery.level !== undefined && battery.level !== null ? battery.level : '?';
        const health = battery.health ?? 'unknown';
        const healthEmoji = health === 'good' ? '✅' : health === 'overheat' ? '🌡️' : health === 'dead' ? '💀' : '⚠️';
        const charging = battery.charging !== undefined ? (battery.charging ? t('batteryModal.charging') : t('batteryModal.notCharging')) : '?';
        const temperature = battery.temperature ?? t('batteryModal.unknown');
        const voltage = battery.voltage ?? t('batteryModal.unknown');
        const technology = battery.technology ?? t('batteryModal.unknown');

        // Compact grid with smaller cards
        let summaryHtml = `
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px;">
                <div style="background: #f8f9fa; border-radius: 8px; padding: 6px 8px; text-align: center;">
                    <div style="font-size: 10px; color: #6B7280;">${t('batteryModal.battery')}</div>
                    <div style="font-size: 18px; font-weight: 600;">${level}%</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 6px 8px; text-align: center;">
                    <div style="font-size: 10px; color: #6B7280;">${t('batteryModal.health')}</div>
                    <div style="font-size: 14px; font-weight: 600;">${healthEmoji} ${health}</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 6px 8px; text-align: center;">
                    <div style="font-size: 10px; color: #6B7280;">${t('batteryModal.status')}</div>
                    <div style="font-size: 13px; font-weight: 600;">${charging}</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 6px 8px; text-align: center;">
                    <div style="font-size: 10px; color: #6B7280;">${t('batteryModal.temp')}</div>
                    <div style="font-size: 14px; font-weight: 600;">${temperature}</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 6px 8px; text-align: center;">
                    <div style="font-size: 10px; color: #6B7280;">${t('batteryModal.voltage')}</div>
                    <div style="font-size: 14px; font-weight: 600;">${voltage}</div>
                </div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 6px 8px; text-align: center;">
                    <div style="font-size: 10px; color: #6B7280;">${t('batteryModal.type')}</div>
                    <div style="font-size: 13px; font-weight: 600;">${technology}</div>
                </div>
            </div>
        `;

        // ---- Apps Section (compact) ----
        let appsHtml = '';
        if (topApps.length === 0) {
            appsHtml = `
                <div style="text-align: center; padding: 16px; background: #fef3c7; border-radius: 8px; font-size: 13px;">
                    <p>📊 ${t('batteryModal.noAppData')}</p>
                    <p style="font-size: 12px; color: #78350f;">${t('batteryModal.runAppsHint')}</p>
                    <button id="refreshCpuBtn" class="btn-primary" style="margin-top: 8px; font-size: 12px; padding: 4px 12px;">🔄 ${t('batteryModal.refresh')}</button>
                </div>
            `;
        } else {
            const itemsHtml = topApps.slice(0, 20).map(app => {
                const cpu = parseFloat(app.cpu);
                return `
                    <div class="battery-process-item" data-name="${escapeHtml(app.name.toLowerCase())}" style="margin-bottom: 6px; background: #ffffff; border-radius: 6px; padding: 4px 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
                            <span style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%;">📱 ${escapeHtml(app.name)}</span>
                            <span style="font-size: 11px; color: #555;">${app.cpu} ${t('batteryModal.cpu')}</span>
                        </div>
                        <div style="background: #e9ecef; border-radius: 2px; height: 3px; margin-top: 2px; overflow: hidden;">
                            <div style="width: ${Math.min(100, cpu)}%; background: #f97316; height: 100%;"></div>
                        </div>
                    </div>
                `;
            }).join('');

            appsHtml = `
                <div style="margin-bottom: 8px;">
                    <input type="text" id="cpuSearchInput" placeholder="${t('batteryModal.filterPlaceholder')}" style="width:100%; padding:4px 10px; border:1px solid #ddd; border-radius:20px; font-size:12px; outline:none;">
                </div>
                <div style="max-height: 220px; overflow-y: auto; padding-right: 4px;">
                    ${itemsHtml}
                </div>
                <div style="margin-top: 6px; font-size: 10px; color: #6c757d; text-align: center;">
                    ${t('batteryModal.cpuProxyNote')}
                </div>
                <div style="margin-top: 8px; text-align: right;">
                    <button id="refreshCpuBtn" class="btn-secondary" style="padding: 2px 10px; font-size: 11px;">🔄 ${t('batteryModal.refresh')}</button>
                </div>
            `;
        }

        body.innerHTML = summaryHtml + appsHtml;

        // ---- Event Listeners ----
        document.getElementById('refreshCpuBtn')?.addEventListener('click', showBatteryModal);
        const searchInput = document.getElementById('cpuSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                const items = document.querySelectorAll('.battery-process-item');
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

    } catch (err) {
        console.error('Battery modal error:', err);
        body.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #d32f2f;">
                <p>❌ ${t('batteryModal.error')}: ${escapeHtml(err.message)}</p>
                <button id="retryBatteryBtn" class="btn-primary" style="margin-top: 12px;">🔄 ${t('batteryModal.retry')}</button>
            </div>
        `;
        document.getElementById('retryBatteryBtn')?.addEventListener('click', showBatteryModal);
    }
}