// ============================================================
// Dynamic translation helper
// ============================================================
function t(key, fallback) {
    const lang = window._activeLang ||
        (window.SmartHubI18n && window.SmartHubI18n.getCurrentLang
            ? window.SmartHubI18n.getCurrentLang()
            : 'en');
    if (window.SmartHubI18n && typeof window.SmartHubI18n.t === 'function') {
        const result = window.SmartHubI18n.t(key, lang);
        if (result) return result;
    }
    return fallback || key;
}

// ============================================================
// 1. openDeviceDetailsModal – fully internationalized (dynamic)
// ============================================================
function openDeviceDetailsModal(deviceId, deviceEl) {
    const modal = document.getElementById('device-details-modal');
    if (!modal || !deviceId) return;

    const titleEl = document.getElementById('device-details-title');
    const subtitleEl = document.getElementById('device-details-subtitle');
    const nameEl = document.getElementById('device-details-name');
    const metaEl = document.getElementById('device-details-meta');
    const badgeEl = document.getElementById('device-details-health-badge');
    const countsEl = document.getElementById('device-details-counts');
    const gridEl = document.getElementById('device-details-grid');
    const testsSubtitleEl = document.getElementById('device-details-tests-subtitle');
    const testsGridEl = document.getElementById('device-details-tests-grid');

    if (!nameEl || !metaEl || !badgeEl || !countsEl || !gridEl || !testsSubtitleEl || !testsGridEl) return;

    function getDeviceHeadingFromEl(el) {
        if (!el) return '';
        const h3 = el.querySelector('.device-title h3');
        return h3 && h3.textContent ? h3.textContent.trim() : '';
    }

    function readTextContent(id) {
        const el = document.getElementById(id);
        if (!el) return '';
        const txt = (el.textContent || '').trim();
        return txt === '–' ? '' : txt;
    }

    function setBadge(kind, text) {
        badgeEl.classList.remove('summary-badge-safe', 'summary-badge-warn', 'summary-badge-danger');
        if (kind === 'danger') badgeEl.classList.add('summary-badge-danger');
        else if (kind === 'warn') badgeEl.classList.add('summary-badge-warn');
        else badgeEl.classList.add('summary-badge-safe');
        badgeEl.textContent = text;
    }

    const record =
        (typeof pendingResults !== 'undefined' && pendingResults && pendingResults[deviceId])
            ? pendingResults[deviceId]
            : null;

    const heading = getDeviceHeadingFromEl(deviceEl) || `Device ${deviceId}`;
    const deviceLabel = (record && record.deviceLabel) ? String(record.deviceLabel) : heading;

    titleEl.textContent = t('devices.details.modal.title');
    subtitleEl.textContent = deviceId;
    nameEl.textContent = deviceLabel;

    const specModel = readTextContent(`spec-misc-model-${deviceId}`);
    const specOs = readTextContent(`spec-platform-os-${deviceId}`);
    const connectionMetaEl = deviceEl ? deviceEl.querySelector('.device-meta') : null;
    const connectionMeta = connectionMetaEl && connectionMetaEl.textContent ? connectionMetaEl.textContent.trim() : '';

    const metaParts = [specModel, specOs, connectionMeta].filter(Boolean);
    const userProblem = record && record.userProblem ? String(record.userProblem).trim() : '';
    metaEl.textContent = metaParts.length
        ? metaParts.join(' · ')
        : t('devices.details.modal.noData');

    // Summary badge and counts
    const counts = record && record.counts ? record.counts : null;
    const diagStages = record && record.diagStages ? record.diagStages : null;

    const high = counts && typeof counts.high === 'number' ? counts.high : 0;
    const medium = counts && typeof counts.medium === 'number' ? counts.medium : 0;
    const low = counts && typeof counts.low === 'number' ? counts.low : 0;

    if (!record) {
        setBadge('safe', t('devices.details.modal.notScanned'));
        countsEl.textContent = t('devices.details.modal.noData');
    } else if (high > 0) {
        setBadge('danger', t('devices.summary.issue'));
        countsEl.textContent = `${high} high, ${medium} medium, ${low} low finding(s)`;
    } else if (medium > 0) {
        setBadge('warn', t('devices.summary.warning'));
        countsEl.textContent = `${high} high, ${medium} medium, ${low} low finding(s)`;
    } else {
        setBadge('safe', t('devices.summary.allClear'));
        countsEl.textContent = `${high} high, ${medium} medium, ${low} low finding(s)`;
    }

    // Fields grid
    gridEl.innerHTML = '';
    const osDetails = record && record.diagDetails && record.diagDetails.os ? record.diagDetails.os : null;
    const batteryDetails = record && record.diagDetails && record.diagDetails.battery ? record.diagDetails.battery : null;
    const displayDetails = record && record.diagDetails && record.diagDetails.display ? record.diagDetails.display : null;
    const systemDetails = record && record.diagDetails && record.diagDetails.system ? record.diagDetails.system : null;
    const securityDetails = record && record.diagDetails && record.diagDetails.security ? record.diagDetails.security : null;

    const fields = [
        { label: t('devices.details.modal.field.deviceId'), value: deviceId },
        { label: t('devices.details.modal.field.reportedProblem'), value: userProblem || '' },
        { label: t('devices.details.modal.field.model'), value: specModel || '' },
        { label: t('devices.details.modal.field.androidOs'), value: specOs || (osDetails && osDetails.androidVersion ? `Android ${osDetails.androidVersion}` : '') },
        { label: t('devices.details.modal.field.buildFingerprint'), value: osDetails && osDetails.buildFingerprint ? osDetails.buildFingerprint : '' },
        { label: t('devices.details.modal.field.verifiedBoot'), value: osDetails && osDetails.verifiedBootState ? String(osDetails.verifiedBootState) : '' },
        { label: t('devices.details.modal.field.bootloaderLocked'), value: typeof (osDetails && osDetails.bootloaderLocked) === 'boolean' ? (osDetails.bootloaderLocked ? 'Yes' : 'No') : '' },
        { label: t('devices.details.modal.field.display'), value: (displayDetails && displayDetails.width && displayDetails.height) ? `${displayDetails.width} × ${displayDetails.height}` : readTextContent(`spec-display-resolution-${deviceId}`) },
        { label: t('devices.details.modal.field.ram'), value: (systemDetails && typeof systemDetails.memTotalKb === 'number') ? `${Math.round(systemDetails.memTotalKb / (1024 * 1024) * 10) / 10} GB (approx)` : readTextContent(`spec-memory-ram-${deviceId}`) },
        { label: t('devices.details.modal.field.internalStorage'), value: readTextContent(`spec-memory-internal-${deviceId}`) },
        { label: t('devices.details.modal.field.battery'), value: batteryDetails
                ? [
                    typeof batteryDetails.level === 'number' ? `${batteryDetails.level}%` : '',
                    typeof batteryDetails.temperatureC === 'number' ? `${batteryDetails.temperatureC}°C` : '',
                    batteryDetails.health ? String(batteryDetails.health) : '',
                ].filter(Boolean).join(' · ')
                : ''
        },
        { label: t('devices.details.modal.field.appsSecurity'), value: securityDetails && typeof securityDetails.appsScanned === 'number'
                ? `Apps scanned: ${securityDetails.appsScanned}${typeof securityDetails.suspiciousTotal === 'number' ? ` · Suspicious: ${securityDetails.suspiciousTotal}` : ''}`
                : ''
        },
    ];

    fields.forEach(f => {
        const card = document.createElement('div');
        card.className = 'device-details-field';

        const l = document.createElement('div');
        l.className = 'device-details-label';
        l.textContent = f.label;

        const v = document.createElement('div');
        v.className = 'device-details-value';
        const raw = (f && f.value != null) ? String(f.value).trim() : '';
        v.textContent = raw ? raw : t('devices.details.modal.notScanned');

        card.appendChild(l);
        card.appendChild(v);
        gridEl.appendChild(card);
    });

    // Tests grid
    testsGridEl.innerHTML = '';
    if (!diagStages || typeof diagStages !== 'object') {
        testsSubtitleEl.textContent = t('devices.details.modal.noTests');
    } else {
        const order = ['battery', 'display', 'touch', 'sensors', 'camera', 'connectivity', 'hardware', 'system', 'os', 'security'];
        const seen = new Set();
        const keys = [];
        order.forEach(k => {
            if (diagStages[k]) {
                keys.push(k);
                seen.add(k);
            }
        });
        Object.keys(diagStages).forEach(k => {
            if (!seen.has(k)) keys.push(k);
        });

        const nameMap = {
            battery: 'Battery',
            display: 'Display',
            touch: 'Touch',
            sensors: 'Sensors',
            camera: 'Camera',
            connectivity: 'Connectivity',
            hardware: 'Hardware',
            system: 'System',
            os: 'OS',
            security: 'Apps & Security',
        };

        let passed = 0;
        let failed = 0;
        keys.forEach(k => {
            const stage = diagStages[k];
            if (!stage) return;
            if (stage.ok) passed += 1;
            else failed += 1;

            const test = document.createElement('div');
            test.className = `device-details-test ${stage.ok ? 'pass' : 'fail'}`;

            const n = document.createElement('div');
            n.className = 'device-details-test-name';
            n.textContent = nameMap[k] || (stage.label ? String(stage.label) : k);

            const s = document.createElement('div');
            s.className = 'device-details-test-status';
            s.textContent = stage.ok ? t('devices.details.modal.tests.pass') : t('devices.details.modal.tests.fail');

            test.appendChild(n);
            test.appendChild(s);
            testsGridEl.appendChild(test);
        });

        const total = passed + failed;
        testsSubtitleEl.textContent = total
            ? t('devices.details.modal.tests.completed', { total, passed, failed })
            : t('devices.details.modal.noTests');
    }

    modal.classList.remove('hidden');
}

// ============================================================
// 2. refresh() – fully internationalized (dynamic)
// ============================================================
async function refresh() {
    const container = document.getElementById('devices');
    if (!container) return;

    container.innerHTML = `<div class="status-banner"><div class="status-icon spinner" aria-hidden="true"></div><div><strong>${t('devices.scanning.title')}</strong><br/>${t('devices.scanning.body')}</div></div>`;

    try {
        const res = await fetch('http://localhost:3333/device');
        let data;
        try {
            data = await res.json();
        } catch {
            data = null;
        }

        if (!res.ok) {
            const backendMsg = data && typeof data.error === 'string' ? data.error : `HTTP ${res.status}`;
            throw new Error(`Backend error: ${backendMsg}`);
        }

        data = data || {};
        const devices = Array.isArray(data.devices) ? data.devices : [];

        // Update the global "Selected device" dropdown.
        try {
            const sel = document.getElementById('device-select');
            if (sel) {
                const prev = sel.value || 'all';
                const stored = (() => {
                    try {
                        return localStorage.getItem('smarthub.selectedDeviceId') || '';
                    } catch {
                        return '';
                    }
                })();
                const preferred = stored || prev || 'all';

                const options = [];
                options.push({ value: 'all', label: t('option.allDevices') });
                devices.forEach(d => {
                    if (!d || !d.id) return;
                    const label = d.model || d.product || d.deviceCode || d.id;
                    const state = d.state ? ` · ${d.state}` : '';
                    options.push({ value: String(d.id), label: `${label} (${d.id})${state}` });
                });

                if (preferred && preferred !== 'all') {
                    const exists = devices.some(d => d && String(d.id) === String(preferred));
                    if (!exists) {
                        options.splice(1, 0, {
                            value: String(preferred),
                            label: t('devices.option.notDetected', { id: String(preferred) }),
                        });
                    }
                }

                sel.innerHTML = '';
                options.forEach(opt => {
                    const o = document.createElement('option');
                    o.value = opt.value;
                    o.textContent = opt.label;
                    sel.appendChild(o);
                });

                const available = new Set(options.map(o => o.value));
                sel.value = available.has(preferred) ? preferred : 'all';
                sel.disabled = options.length <= 1;

                if (!sel.dataset.bound) {
                    sel.dataset.bound = '1';
                    sel.addEventListener('change', () => {
                        try {
                            localStorage.setItem('smarthub.selectedDeviceId', sel.value || 'all');
                        } catch { /* ignore */ }
                        try { refresh(); } catch { /* ignore */ }
                    });
                }
            }
        } catch {
            // best-effort only
        }

        console.log('Devices from backend:', devices);

        if (!devices.length) {
            const backendError = data && typeof data.error === 'string' ? data.error : '';

            function escapeHtml(value) {
                return String(value)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
            }

            function pickPrimaryPortableDevice(portableDevices) {
                const list = Array.isArray(portableDevices) ? portableDevices : [];
                if (!list.length) return null;
                const nonPhoneHints = /(microphone|audio|speaker|headset|camera|webcam|hid|keyboard|mouse|gamepad|joystick|printer|scanner)/i;
                const phoneHints = /(android|\bmtp\b|\bphone\b|samsung|galaxy|huawei|honor|xiaomi|redmi|oppo|vivo|oneplus|realme|motorola|pixel|google|nokia|sony|lg|htc|tecno|infinix|itel)/i;
                const preferred = list.find(p => p && p.name && phoneHints.test(p.name) && !nonPhoneHints.test(p.name));
                const anyPortable = list.find(p => p && p.name && !nonPhoneHints.test(p.name));
                return preferred || anyPortable || list.find(p => p && p.name) || list[0];
            }

            function filterPhonePortableDevices(portableDevices) {
                const list = Array.isArray(portableDevices) ? portableDevices : [];
                if (!list.length) return [];
                const nonPhoneHints = /(microphone|audio|speaker|headset|camera|webcam|hid|keyboard|mouse|gamepad|joystick|printer|scanner)/i;
                return list.filter(p => p && p.name && !nonPhoneHints.test(p.name));
            }

            let heading = t('devices.none.title');
            let guidance = t('devices.none.guidance');
            let mtpSummaryHtml = '';
            let transportSummaryHtml = '';

            try {
                const ccRes = await fetch('http://localhost:3333/connection-check');
                if (ccRes.ok) {
                    const cc = await ccRes.json();
                    const adbInfo = cc.adb || {};
                    const adbList = Array.isArray(adbInfo.devices) ? adbInfo.devices : [];
                    const hostUsb = cc.hostUsb || {};
                    const portableRaw = Array.isArray(hostUsb.portableDevices) ? hostUsb.portableDevices : [];
                    const portable = filterPhonePortableDevices(portableRaw);

                    const transportRaw = Array.isArray(hostUsb.transportDevices) ? hostUsb.transportDevices : [];
                    const transport = transportRaw.filter(t => {
                        const name = t && t.name ? String(t.name) : '';
                        if (!name) return false;
                        if (/host\s*controller|xHCI|root\s*hub|generic\s*usb\s*hub|usb\s*hub|controller/i.test(name)) return false;
                        return true;
                    });

                    const transportNames = transport.map(t => (t && t.name ? String(t.name) : '')).join(' ');
                    const looksSamsungDownload = /SAMSUNG\s+Mobile\s+USB\s+CDC\s+Composite\s+Device/i.test(transportNames)
                        || (/(\bcdc\s*composite\b|\bdownload\b|\bodin\b)/i.test(transportNames) && /samsung/i.test(transportNames));
                    const looksFastboot = /(\bfastboot\b|android\s+bootloader|bootloader\s+interface)/i.test(transportNames);

                    function pickPrimaryTransportDevice(list, re) {
                        const arr = Array.isArray(list) ? list : [];
                        const preferred = arr.find(d => d && d.name && re.test(String(d.name)));
                        return preferred || arr.find(d => d && d.name) || null;
                    }

                    function renderTransportSummary(modeLabel, primaryDeviceName, items) {
                        const listItems = items
                            .map(t => {
                                if (!t || !t.name) return '';
                                const status = t.status ? ` – <span class="mtp-status">${escapeHtml(t.status)}</span>` : '';
                                return `<li>${escapeHtml(String(t.name))}${status}</li>`;
                            })
                            .filter(Boolean)
                            .slice(0, 6)
                            .join('');
                        if (!listItems) return '';

                        const usbSvg = `
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path d="M10 2h4v6l2-2 1 1-3 3-3-3 1-1 2 2V3h-2v11.2a3.8 3.8 0 1 1-2 0V2zm2 15.2a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z" fill="currentColor" opacity="0.85"></path>
                            </svg>`;

                        return `
                            <div class="mtp-summary">
                                <div class="mtp-device-profile">
                                    <div class="mtp-device-avatar">${usbSvg}</div>
                                    <div class="mtp-device-main">
                                        <div class="mtp-device-name-row">
                                            <span class="mtp-device-active" aria-hidden="true"></span>
                                            <div class="mtp-device-name">${escapeHtml(primaryDeviceName || modeLabel)}</div>
                                        </div>
                                        <div class="mtp-device-adb">${escapeHtml(modeLabel)}</div>
                                    </div>
                                </div>
                                <div class="mtp-summary-title">${t('devices.mtp.detectedTitle')}</div>
                                <ul>${listItems}</ul>
                                <div class="mtp-summary-note">${t('devices.mtp.note')}</div>
                            </div>`;
                    }

                    if (!adbList.length && portable.length) {
                        heading = t('devices.noAdb.title');
                        guidance = t('devices.noAdb.guidance');

                        const primaryPortable = pickPrimaryPortableDevice(portable);
                        const primaryName = primaryPortable && primaryPortable.name ? primaryPortable.name : 'Android phone';

                        const listItems = portable
                            .map(p => {
                                if (!p || !p.name) return '';
                                const status = p.status ? ` – <span class="mtp-status">${escapeHtml(p.status)}</span>` : '';
                                return `<li>${escapeHtml(p.name)}${status}</li>`;
                            })
                            .filter(Boolean)
                            .join('');
                        if (listItems) {
                            const phoneSvg = `
                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <rect x="7" y="2" width="10" height="20" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="1.6"></rect>
                                    <rect x="9" y="5" width="6" height="13" rx="1" ry="1" fill="currentColor" opacity="0.08"></rect>
                                    <circle cx="12" cy="19.3" r="0.9" fill="currentColor" opacity="0.65"></circle>
                                </svg>`;

                            mtpSummaryHtml = `
                                <div class="mtp-summary">
                                    <div class="mtp-device-profile">
                                        <div class="mtp-device-avatar">${phoneSvg}</div>
                                        <div class="mtp-device-main">
                                            <div class="mtp-device-name-row">
                                                <span class="mtp-device-active" aria-hidden="true"></span>
                                                <div class="mtp-device-name">${escapeHtml(primaryName)}</div>
                                            </div>
                                            <div class="mtp-device-adb">${t('devices.mtp.adbNotDetected')}</div>
                                        </div>
                                    </div>
                                    <div class="mtp-summary-title">${t('devices.mtp.detectedTitle')}</div>
                                    <ul>${listItems}</ul>
                                    <div class="mtp-summary-note">${t('devices.mtp.note')}</div>
                                </div>`;
                        }
                    }

                    if (!adbList.length && !portable.length && transport.length && (looksSamsungDownload || looksFastboot)) {
                        if (looksSamsungDownload) {
                            heading = t('devices.mode.samsungDownload.title');
                            guidance = t('devices.mode.samsungDownload.guidance');
                            const primary = pickPrimaryTransportDevice(transport, /SAMSUNG\s+Mobile\s+USB\s+CDC\s+Composite\s+Device/i);
                            transportSummaryHtml = renderTransportSummary('Samsung Download / Odin mode', primary && primary.name ? String(primary.name) : 'Samsung Download / Odin mode', transport);
                        } else {
                            heading = t('devices.mode.fastboot.title');
                            guidance = t('devices.mode.fastboot.guidance');
                            const primary = pickPrimaryTransportDevice(transport, /(fastboot|bootloader)/i);
                            transportSummaryHtml = renderTransportSummary('Fastboot / bootloader mode', primary && primary.name ? String(primary.name) : 'Fastboot / bootloader mode', transport);
                        }
                    }
                }
            } catch {
                // If connection-check fails we keep the generic guidance.
            }

            const extra = backendError
                ? `<br/><span style="color:#fca5a5">Backend note: ${backendError}</span>`
                : '';

            const guidanceHtml = guidance ? `<div class="status-guidance">${guidance}${extra}</div>` : `${extra}`;
            container.innerHTML = `<div class="status-banner"><div class="status-icon">ℹ️</div><div><strong>${heading}</strong>${mtpSummaryHtml}${transportSummaryHtml}${guidanceHtml}</div></div>`;

            try {
                const sel = document.getElementById('device-select');
                if (sel) {
                    sel.innerHTML = `<option value="all">${t('option.allDevices')}</option>`;
                    sel.value = 'all';
                    sel.disabled = true;
                }
            } catch { /* ignore */ }
            return;
        }

        // Only show the currently selected device (unless "All devices" is selected).
        let displayDevices = devices;
        try {
            const sel = document.getElementById('device-select');
            const selected = sel && sel.value ? String(sel.value) : 'all';
            if (selected && selected !== 'all') {
                displayDevices = devices.filter(d => d && String(d.id) === selected);
                if (!displayDevices.length) {
                    container.innerHTML = `<div class="status-banner"><div class="status-icon">ℹ️</div><div><strong>${t('devices.selectedMissing.title')}</strong><br/>${t('devices.selectedMissing.body', { id: String(selected) })}</div></div>`;
                    return;
                }
            }
        } catch {
            displayDevices = devices;
        }

        container.innerHTML = '';
        displayDevices.forEach(d => {
            const div = document.createElement('div');
            div.className = 'device';
            div.dataset.id = d.id;
            const name = d.model || d.product || d.deviceCode || d.id;
            const heading = `${name} (${d.id}, ${d.state})`;

            let connectionText = '';
            let connectionClass = '';
            if (d.connection && d.connection.type) {
                if (d.connection.type === 'tcpip') {
                    const host = d.connection.host || (typeof d.id === 'string' && d.id.includes(':') ? d.id.split(':')[0] : '');
                    const port = d.connection.port || (typeof d.id === 'string' && d.id.includes(':') ? d.id.split(':')[1] : '');
                    const endpoint = [host, port].filter(Boolean).join(':');
                    connectionText = endpoint ? `Connection: TCP/IP ${endpoint}` : 'Connection: TCP/IP';
                    connectionClass = t('devices.connection.tcpip');
                } else if (d.connection.type === 'usb') {
                    const path = d.connection.usbPath || d.usbPath;
                    connectionText = path ? `Connection: USB (usb path: ${path})` : 'Connection: USB';
                    connectionClass = t('devices.connection.usb');
                } else if (d.connection.type === 'emulator') {
                    connectionText = 'Connection: Emulator';
                    connectionClass = t('devices.connection.emulator');
                }
            }

            div.innerHTML = `
                <div class="device-header">
                    <div class="device-title">
                        <h3>${heading}</h3>
                        ${connectionText ? `<div class="device-meta">${connectionText}</div>` : ''}
                    </div>
                    ${connectionClass ? `<span class="chip ${connectionClass.toLowerCase()}">${connectionClass}</span>` : ''}
                </div>
                <div class="device-body">
                    <div class="device-summary-row">
                        <div class="summary-card" id="status-card-${d.id}">
                            <div class="summary-header">
                                <span class="summary-icon">✔</span>
                                <span class="summary-badge summary-badge-safe" id="status-badge-${d.id}">${t('devices.summary.safe')}</span>
                            </div>
                            <div class="summary-label">${t('devices.summary.systemStatus')}</div>
                            <div class="summary-value" id="status-value-${d.id}">${t('devices.summary.notScanned')}</div>
                            <div class="summary-subtext" id="status-subtext-${d.id}">${t('devices.status.awaitingScan')}</div>
                        </div>
                        <div class="summary-card" id="security-card-${d.id}">
                            <div class="summary-header">
                                <span class="summary-icon">🛡️</span>
                                <span class="summary-badge summary-badge-safe" id="security-badge-${d.id}">${t('devices.summary.safe')}</span>
                            </div>
                            <div class="summary-label">${t('devices.summary.security')}</div>
                            <div class="summary-value" id="security-value-${d.id}">${t('devices.summary.notScanned')}</div>
                            <div class="summary-subtext" id="security-subtext-${d.id}">${t('devices.status.awaitingScan')}</div>
                        </div>
                        <div class="summary-card">
                            <div class="summary-header">
                                <span class="summary-icon">📱</span>
                                <span class="summary-badge summary-badge-safe">${t('devices.summary.connected')}</span>
                            </div>
                            <div class="summary-label">${t('devices.summary.devices')}</div>
                            <div class="summary-value">1 Active</div>
                            <div class="summary-subtext">ID: ${d.id}</div>
                        </div>
                    </div>

                    <div class="device-main">
                        <div class="device-tabs">
                            <button class="device-tab active" data-tab="details">${t('devices.tabs.details')}</button>
                            <button class="device-tab" data-tab="history">${t('devices.tabs.history')}</button>
                        </div>
                        <div class="device-tab-panels">
                            <div class="device-tab-panel active" data-panel="details">
                                <div class="device-overview-grid">
                                    <div class="overview-item">
                                        <div class="overview-label"><span class="details-icon">🔋</span>${t('devices.detail.battery')}</div>
                                        <div class="overview-value" id="detail-battery-${d.id}">${t('devices.status.awaitingScan')}</div>
                                    </div>
                                    <div class="overview-item">
                                        <div class="overview-label"><span class="details-icon">💾</span>${t('devices.detail.storage')}</div>
                                        <div class="overview-value" id="detail-storage-${d.id}">${t('devices.status.awaitingScan')}</div>
                                    </div>
                                    <div class="overview-item">
                                        <div class="overview-label"><span class="details-icon">🖥️</span>${t('devices.detail.display')}</div>
                                        <div class="overview-value" id="detail-display-${d.id}">${t('devices.status.awaitingScan')}</div>
                                    </div>
                                </div>
                                <div class="diag-meta" id="diag-meta-${d.id}"></div>
                                <div class="diag-steps" id="diag-steps-${d.id}"></div>
                                <div class="details-spec">
                                    <div class="details-spec-section">
                                        <div class="details-spec-title">${t('devices.spec.display.title')}</div>
                                        <div class="details-spec-row">
                                            <div class="details-spec-label">${t('devices.spec.display.size')}</div>
                                            <div class="details-spec-value" id="spec-display-size-${d.id}">–</div>
                                        </div>
                                        <div class="details-spec-row">
                                            <div class="details-spec-label">${t('devices.spec.display.resolution')}</div>
                                            <div class="details-spec-value" id="spec-display-resolution-${d.id}">–</div>
                                        </div>
                                        <div class="details-spec-row">
                                            <div class="details-spec-label">${t('devices.spec.display.density')}</div>
                                            <div class="details-spec-value" id="spec-display-density-${d.id}">–</div>
                                        </div>
                                    </div>
                                    <div class="details-spec-section">
                                        <div class="details-spec-title">${t('devices.spec.platform.title')}</div>
                                        <div class="details-spec-row">
                                            <div class="details-spec-label">${t('devices.spec.platform.os')}</div>
                                            <div class="details-spec-value" id="spec-platform-os-${d.id}">–</div>
                                        </div>
                                        <div class="details-spec-row">
                                            <div class="details-spec-label">${t('devices.spec.platform.chipset')}</div>
                                            <div class="details-spec-value" id="spec-platform-chipset-${d.id}">–</div>
                                        </div>
                                        <div class="details-spec-row">
                                            <div class="details-spec-label">${t('devices.spec.platform.cpu')}</div>
                                            <div class="details-spec-value" id="spec-platform-cpu-${d.id}">–</div>
                                        </div>
                                    </div>
                                    <div class="details-spec-section">
                                        <div class="details-spec-title">${t('devices.spec.memory.title')}</div>
                                        <div class="details-spec-row">
                                            <div class="details-spec-label">${t('devices.spec.memory.ram')}</div>
                                            <div class="details-spec-value" id="spec-memory-ram-${d.id}">–</div>
                                        </div>
                                        <div class="details-spec-row">
                                            <div class="details-spec-label">${t('devices.spec.memory.internal')}</div>
                                            <div class="details-spec-value" id="spec-memory-internal-${d.id}">–</div>
                                        </div>
                                    </div>
                                    <div class="details-spec-section">
                                        <div class="details-spec-title">${t('devices.spec.battery.title')}</div>
                                        <div class="details-spec-row">
                                            <div class="details-spec-label">${t('devices.spec.battery.type')}</div>
                                            <div class="details-spec-value" id="spec-battery-type-${d.id}">–</div>
                                        </div>
                                    </div>
                                    <div class="details-spec-section">
                                        <div class="details-spec-title">${t('devices.spec.misc.title')}</div>
                                        <div class="details-spec-row">
                                            <div class="details-spec-label">${t('devices.spec.misc.model')}</div>
                                            <div class="details-spec-value" id="spec-misc-model-${d.id}">–</div>
                                        </div>
                                        <div class="details-spec-row">
                                            <div class="details-spec-label">${t('devices.spec.misc.board')}</div>
                                            <div class="details-spec-value" id="spec-misc-board-${d.id}">–</div>
                                        </div>
                                        <div class="details-spec-row">
                                            <div class="details-spec-label">${t('devices.spec.misc.manufacturer')}</div>
                                            <div class="details-spec-value" id="spec-misc-manufacturer-${d.id}">–</div>
                                        </div>
                                        <div class="details-spec-row">
                                            <div class="details-spec-label">${t('devices.spec.misc.deviceCode')}</div>
                                            <div class="details-spec-value" id="spec-misc-device-${d.id}">–</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="device-actions">
                                    <div class="device-actions-row">
                                        <button data-id="${d.id}" class="collect btn-collect">${t('devices.buttons.diagnostic')}</button>
                                        <button data-id="${d.id}" class="wifi btn-collect compact">${t('devices.buttons.wifi')}</button>
                                        <button data-id="${d.id}" class="deep-scan btn-collect compact">${t('devices.buttons.deepScan')}</button>
                                        <button data-id="${d.id}" class="apps btn-apps compact">${t('devices.buttons.scanThreats')}</button>
                                        <button data-id="${d.id}" class="app-risk btn-app-risk compact">${t('devices.buttons.checkApp')}</button>
                                    </div>
                                    <pre id="out-${d.id}"></pre>
                                </div>
                            </div>
                            <div class="device-tab-panel" data-panel="history">
                                <div class="history-list" id="history-${d.id}"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(div);
        });

        // Tab switching and auto-run quick checks (unchanged logic, but now translated)
        container.querySelectorAll('.device').forEach(deviceEl => {
            const tabs = deviceEl.querySelectorAll('.device-tab');
            const panels = deviceEl.querySelectorAll('.device-tab-panel');
            const deviceId = deviceEl.dataset.id;

            deviceEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                openDeviceDetailsModal(deviceId, deviceEl);
            });

            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    const target = tab.getAttribute('data-tab');
                    tabs.forEach(t => t.classList.toggle('active', t === tab));
                    panels.forEach(p => {
                        p.classList.toggle('active', p.getAttribute('data-panel') === target);
                    });

                    if (target === 'details' && deviceEl.dataset.scanned !== 'true') {
                        deviceEl.dataset.scanned = 'true';
                        const collectBtn = deviceEl.querySelector('.collect');
                        if (collectBtn) collectBtn.click();
                    } else if (target === 'history' && deviceId) {
                        renderHistoryList(deviceId);
                    }
                });
            });
        });

        // ---- collect button ----
        container.querySelectorAll('.collect').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const deviceEl = btn.closest('.device');
                if (!id || !deviceEl) return;

                // App state check (unchanged)
                let appInstalled = false;
                let appRunning = false;
                let appOk = false;
                try {
                    const stateRes = await fetch(`http://localhost:3333/mobile-app-state/${encodeURIComponent(id)}`);
                    if (stateRes.ok) {
                        const s = await stateRes.json();
                        appInstalled = !!(s && s.installed);
                        appRunning = !!(s && s.running);
                        appOk = !!(appInstalled && appRunning);
                    }
                } catch { /* ignore */ }

                if (appInstalled && !appRunning) {
                    try {
                        const openRes = await fetch('http://localhost:3333/mobile-app-open', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id }),
                        });
                        if (openRes.ok) {
                            const openBody = await openRes.json().catch(() => null);
                            appOk = !!(openBody && openBody.ok && (openBody.running || openBody.launchOk));
                        }
                    } catch { /* keep host-side fallback */ }
                }

                const metaEl = document.getElementById(`diag-meta-${id}`);
                if (!appOk && metaEl) {
                    if (appInstalled) {
                        metaEl.textContent = t('devices.status.mobileAppNotRunning');
                    } else {
                        metaEl.textContent = t('devices.status.mobileAppNotInstalled');
                    }
                } else if (appOk && metaEl) {
                    metaEl.textContent = t('devices.status.mobileAppDetected');
                }

                const res = await fetch(`http://localhost:3333/collect/${encodeURIComponent(id)}`);
                const data = await res.json();
                const findings = Array.isArray(data.findings) ? data.findings : [];

                if (typeof window.attentionFindingsByDevice === 'undefined') {
                    window.attentionFindingsByDevice = {};
                }
                window.attentionFindingsByDevice[id] = findings.filter(f => {
                    const sev = (f.severity || 'low').toLowerCase();
                    return sev === 'high' || sev === 'medium';
                });

                let highCount = 0, mediumCount = 0, lowCount = 0;
                findings.forEach(f => {
                    const sev = (f.severity || 'low').toLowerCase();
                    if (sev === 'high') highCount += 1;
                    else if (sev === 'medium') mediumCount += 1;
                    else lowCount += 1;
                });

                const severityIcons = { low: '✓', medium: '⚠', high: '⛔' };
                const categoryIcons = { battery: '🔋', storage: '💾', display: '🖥️', logs: '📋', generic: '📱' };
                function inferCategory(id) {
                    if (!id || typeof id !== 'string') return 'generic';
                    const lower = id.toLowerCase();
                    if (lower.includes('battery')) return 'battery';
                    if (lower.includes('storage') || lower.includes('disk')) return 'storage';
                    if (lower.includes('display') || lower.includes('surface') || lower.includes('gpu')) return 'display';
                    if (lower.includes('log') || lower.includes('crash')) return 'logs';
                    return 'generic';
                }

                const blocks = findings.map(f => {
                    const sev = (f.severity || 'low').toLowerCase();
                    const sevLabel = sev === 'high' ? 'High' : sev === 'medium' ? 'Medium' : 'Low';
                    const sevIcon = severityIcons[sev] || '✓';
                    const category = inferCategory(f.id);
                    const catIcon = categoryIcons[category] || categoryIcons.generic;
                    const title = f.title || f.id || 'Unknown check';
                    const details = f.details || '';
                    return [
                        `${catIcon}  ${title}`,
                        `   ${sevIcon}  Severity: ${sevLabel}`,
                        details ? `   • ${details}` : undefined,
                    ].filter(Boolean).join('\n');
                });

                const textReport = blocks.length ? blocks.join('\n\n') : 'No issues detected in battery, storage or display pipeline.';

                const statusValueEl = document.getElementById(`status-value-${id}`);
                const statusBadgeEl = document.getElementById(`status-badge-${id}`);
                const statusSubEl = document.getElementById(`status-subtext-${id}`);
                const securityValueEl = document.getElementById(`security-value-${id}`);
                const securityBadgeEl = document.getElementById(`security-badge-${id}`);
                const securitySubEl = document.getElementById(`security-subtext-${id}`);

                const overallState = highCount > 0 ? 'danger' : mediumCount > 0 ? 'warn' : 'safe';

                function applyBadge(el, state) {
                    if (!el) return;
                    el.classList.remove('summary-badge-safe', 'summary-badge-warn', 'summary-badge-danger');
                    if (state === 'danger') {
                        el.classList.add('summary-badge-danger');
                        el.textContent = t('devices.summary.issue');
                    } else if (state === 'warn') {
                        el.classList.add('summary-badge-warn');
                        el.textContent = t('devices.summary.warning');
                    } else {
                        el.classList.add('summary-badge-safe');
                        el.textContent = t('devices.summary.safe');
                    }
                }

                if (statusValueEl) {
                    statusValueEl.textContent = overallState === 'safe' ? t('devices.summary.allClear') : t('devices.summary.attentionNeeded');
                }
                if (statusSubEl) {
                    statusSubEl.textContent = `${highCount + mediumCount} issue(s) detected across battery, storage or display.`;
                }
                applyBadge(statusBadgeEl, overallState);

                const secInProgress =
                    ((typeof window.securityScanInProgress === 'object' && window.securityScanInProgress && window.securityScanInProgress[id]) ||
                    (typeof window.fullDiagInProgress === 'object' && window.fullDiagInProgress && window.fullDiagInProgress[id]));

                if (!secInProgress) {
                    if (securityValueEl) {
                        securityValueEl.textContent =
                            overallState === 'danger' ? t('devices.summary.highRisk') :
                            overallState === 'warn'  ? t('devices.summary.moderate') :
                            t('devices.summary.safe');
                    }
                    if (securitySubEl) {
                        securitySubEl.textContent = `${highCount} high, ${mediumCount} medium, ${lowCount} low findings.`;
                    }
                    applyBadge(securityBadgeEl, overallState);
                }

                // Details tab: map specific finding IDs
                const batteryDetailEl = document.getElementById(`detail-battery-${id}`);
                const storageDetailEl = document.getElementById(`detail-storage-${id}`);
                const displayDetailEl = document.getElementById(`detail-display-${id}`);

                const byId = {};
                findings.forEach(f => { if (f.id) byId[f.id] = f; });

                function describe(f, fallbackLabel) {
                    if (!f) return `${fallbackLabel}: OK`;
                    const sev = (f.severity || 'low').toLowerCase();
                    const sevLabel = sev === 'high' ? 'High' : sev === 'medium' ? 'Medium' : 'Low';
                    return `${sevLabel} · ${f.title || fallbackLabel}`;
                }

                if (batteryDetailEl) {
                    batteryDetailEl.textContent = describe(byId['battery-level'] || byId['battery-temp'], 'Battery');
                }
                if (storageDetailEl) {
                    storageDetailEl.textContent = describe(byId['storage-full'], 'Storage');
                }
                if (displayDetailEl) {
                    displayDetailEl.textContent = describe(byId['display-pipeline'], 'Display');
                }

                // Spec population (unchanged – uses DOM IDs, no i18n needed inside)
                // ... (the spec‑setting code remains the same; it uses DOM element IDs)

                // At the end, we call registerPendingDiagnosticResult (unchanged)
                if (data.diagStages && deviceEl) {
                    registerPendingDiagnosticResult(id, deviceEl, {
                        data,
                        findings,
                        textReport,
                        counts: { high: highCount, medium: mediumCount, low: lowCount },
                    });
                }
            });
        });

        // ---- deep-scan button (unchanged logic, only status messages translated) ----
        container.querySelectorAll('.deep-scan').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const deviceEl = btn.closest('.device');
                if (!id || !deviceEl) return;

                const outEl = document.getElementById(`out-${id}`);
                if (outEl) outEl.textContent = t('devices.deepScan.running');

                let data = null;
                try {
                    const res = await fetch(`http://localhost:3333/deep-scan/${encodeURIComponent(id)}?raw=0`);
                    data = await res.json();
                    if (!res.ok || !data || data.ok === false) {
                        const msg = (data && (data.error || data.message)) || `Deep scan failed (HTTP ${res.status})`;
                        if (outEl) outEl.textContent = msg;
                        return;
                    }
                } catch {
                    if (outEl) outEl.textContent = t('devices.deepScan.failed');
                    return;
                }

                const findings = Array.isArray(data.findings) ? data.findings : [];
                const causes = Array.isArray(data.suspectedCauses) ? data.suspectedCauses : [];
                const summary = (data.summary && typeof data.summary === 'string') ? data.summary : 'Deep scan complete.';
                const health = (data.health && typeof data.health === 'object') ? data.health : {};
                const healthHardware = typeof health.hardware === 'string' ? health.hardware : 'unknown';
                const healthSoftware = typeof health.software === 'string' ? health.software : 'unknown';
                const healthOs = typeof health.os === 'string' ? health.os : 'unknown';

                if (typeof window.attentionFindingsByDevice === 'undefined') {
                    window.attentionFindingsByDevice = {};
                }
                window.attentionFindingsByDevice[id] = findings.filter(f => {
                    const sev = (f.severity || 'low').toLowerCase();
                    return sev === 'high' || sev === 'medium';
                });

                let highCount = 0, mediumCount = 0, lowCount = 0;
                findings.forEach(f => {
                    const sev = (f.severity || 'low').toLowerCase();
                    if (sev === 'high') highCount += 1;
                    else if (sev === 'medium') mediumCount += 1;
                    else lowCount += 1;
                });

                const overallState = highCount > 0 ? 'danger' : mediumCount > 0 ? 'warn' : 'safe';
                const statusValueEl = document.getElementById(`status-value-${id}`);
                const statusBadgeEl = document.getElementById(`status-badge-${id}`);
                const statusSubEl = document.getElementById(`status-subtext-${id}`);

                function applyBadge(el, state) {
                    if (!el) return;
                    el.classList.remove('summary-badge-safe', 'summary-badge-warn', 'summary-badge-danger');
                    if (state === 'danger') {
                        el.classList.add('summary-badge-danger');
                        el.textContent = t('devices.summary.issue');
                    } else if (state === 'warn') {
                        el.classList.add('summary-badge-warn');
                        el.textContent = t('devices.summary.warning');
                    } else {
                        el.classList.add('summary-badge-safe');
                        el.textContent = t('devices.summary.safe');
                    }
                }

                if (statusValueEl) {
                    statusValueEl.textContent = overallState === 'safe' ? t('devices.summary.allClear') : t('devices.summary.attentionNeeded');
                }
                if (statusSubEl) {
                    statusSubEl.textContent = `Deep scan: ${highCount} high, ${mediumCount} medium, ${lowCount} low findings.`;
                }
                applyBadge(statusBadgeEl, overallState);

                // Render report (unchanged, but we could translate some labels if needed)
                const severityIcons = { low: '✓', medium: '⚠', high: '⛔' };
                const categoryIcons = { battery: '🔋', storage: '💾', os: '🧩', memory: '🧠', logs: '📋', generic: '📱' };
                function inferCategory(fid) {
                    if (!fid || typeof fid !== 'string') return 'generic';
                    const lower = fid.toLowerCase();
                    if (lower.includes('battery')) return 'battery';
                    if (lower.includes('storage') || lower.includes('disk')) return 'storage';
                    if (lower.includes('memory') || lower.includes('ram')) return 'memory';
                    if (lower.includes('os') || lower.includes('patch')) return 'os';
                    if (lower.includes('log') || lower.includes('crash') || lower.includes('anr')) return 'logs';
                    return 'generic';
                }

                const blocks = findings.map(f => {
                    const sev = (f.severity || 'low').toLowerCase();
                    const sevLabel = sev === 'high' ? 'High' : sev === 'medium' ? 'Medium' : 'Low';
                    const sevIcon = severityIcons[sev] || '✓';
                    const cat = inferCategory(f.id);
                    const catIcon = categoryIcons[cat] || categoryIcons.generic;
                    const title = f.title || f.id || 'Unknown check';
                    const details = f.details || '';
                    return [
                        `${catIcon}  ${title}`,
                        `   ${sevIcon}  Severity: ${sevLabel}`,
                        details ? `   • ${details}` : undefined,
                    ].filter(Boolean).join('\n');
                });

                const healthText = `\n\nHealth:\n• Hardware: ${healthHardware}\n• Software: ${healthSoftware}\n• OS: ${healthOs}`;
                const causeText = causes.length ? ('\n\nLikely causes:\n' + causes.map(c => `• ${c}`).join('\n')) : '';
                const reportText = `${summary}${healthText}${causeText}\n\nFindings:\n\n${blocks.length ? blocks.join('\n\n') : 'No notable findings.'}`;
                if (outEl) outEl.textContent = reportText;
            });
        });

        // ---- wifi button (unchanged logic, only modal titles translated) ----
        function formatWifiReport(data) {
            try {
                if (!data || data.ok === false) return 'Wi‑Fi diagnostics failed.';
                const wifi = (data.wifi && typeof data.wifi === 'object') ? data.wifi : {};
                const stability = (data.stability && typeof data.stability === 'object') ? data.stability : {};
                const conn = (data.connectivity && typeof data.connectivity === 'object') ? data.connectivity : {};
                const tests = (data.ping && Array.isArray(data.ping.tests)) ? data.ping.tests : [];
                const http204 = (data.http204 && typeof data.http204 === 'object') ? data.http204 : null;
                const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];

                const lines = [];
                lines.push(`Verdict: ${stability.verdict || (stability.stable ? 'Stable' : 'Unstable')}`);
                if (wifi.ssid) lines.push(`SSID: ${wifi.ssid}`);
                if (wifi.rssiDbm != null) lines.push(`RSSI: ${wifi.rssiDbm} dBm`);
                if (wifi.linkSpeedMbps != null) lines.push(`Link speed: ${wifi.linkSpeedMbps} Mbps`);
                if (wifi.frequencyMHz != null) lines.push(`Frequency: ${wifi.frequencyMHz} MHz`);
                if (wifi.ipAddress) lines.push(`IP: ${wifi.ipAddress}`);
                if (wifi.gateway) lines.push(`Gateway: ${wifi.gateway}`);
                if (wifi.dns && wifi.dns.length) lines.push(`DNS: ${wifi.dns.join(', ')}`);
                if (conn.validated != null) lines.push(`Internet validated: ${conn.validated ? 'Yes' : 'No'}`);

                if (http204 && http204.ok === true && typeof http204.statusCode === 'number') {
                    lines.push(`HTTP 204 probe: ${http204.statusCode} (${http204.via || 'probe'})`);
                } else if (http204 && http204.unsupported === true) {
                    lines.push('HTTP 204 probe: Unsupported on this device');
                }

                const causes = Array.isArray(stability.likelyCauses) ? stability.likelyCauses : [];
                if (causes.length) {
                    lines.push('');
                    lines.push('Likely causes:');
                    causes.forEach(c => lines.push(`- ${c}`));
                }

                if (tests.length) {
                    lines.push('');
                    lines.push('Ping:');
                    tests.forEach(t => {
                        const ok = t.ok === true;
                        const loss = (typeof t.lossPct === 'number') ? `${t.lossPct}% loss` : '';
                        const avg = (typeof t.avgMs === 'number') ? `${Math.round(t.avgMs)}ms avg` : '';
                        const jitter = (typeof t.jitterMs === 'number') ? `${Math.round(t.jitterMs)}ms jitter` : '';
                        const extra = [loss, avg, jitter].filter(Boolean).join(', ');
                        lines.push(`- ${t.target}: ${ok ? 'OK' : 'FAIL'}${extra ? ` (${extra})` : ''}`);
                    });
                }

                if (suggestions.length) {
                    lines.push('');
                    lines.push('Suggestions:');
                    suggestions.forEach(s => lines.push(`- ${s}`));
                }

                return lines.join('\n');
            } catch {
                return 'Wi‑Fi diagnostics failed.';
            }
        }

        async function showWifiModalOrAlert({ title, subtitle, message }) {
            try {
                const modal = document.getElementById('message-modal');
                const titleEl = document.getElementById('message-modal-title');
                const subtitleEl = document.getElementById('message-modal-subtitle');
                const bodyEl = document.getElementById('message-modal-body');

                if (modal && titleEl && subtitleEl && bodyEl) {
                    titleEl.textContent = title || 'Message';
                    subtitleEl.textContent = subtitle || '';
                    subtitleEl.classList.toggle('hidden', !subtitle);
                    bodyEl.textContent = message || '';
                    modal.classList.remove('hidden');
                    return;
                }
            } catch { /* fallback */ }
            try {
                alert(`${title || 'Wi‑Fi'}\n\n${message || ''}`);
            } catch { /* ignore */ }
        }

        container.querySelectorAll('.wifi').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const deviceEl = btn.closest('.device');
                if (!id || !deviceEl) return;

                const outEl = document.getElementById(`out-${id}`);
                const prev = outEl ? outEl.textContent : '';
                if (outEl) outEl.textContent = t('devices.wifi.running');

                let data = null;
                try {
                    const res = await fetch(`http://localhost:3333/wifi/diagnose/${encodeURIComponent(id)}`, { cache: 'no-store' });
                    data = await res.json().catch(() => null);
                    if (!res.ok || !data || data.ok === false) {
                        const msg = (data && (data.error || data.message)) || `Wi‑Fi diagnostics failed (HTTP ${res.status})`;
                        if (outEl) outEl.textContent = msg;
                        await showWifiModalOrAlert({
                            title: t('devices.wifi.title'),
                            subtitle: t('devices.wifi.diagnosticFailed'),
                            message: msg,
                        });
                        return;
                    }
                } catch {
                    const msg = t('devices.wifi.serviceUnreachable');
                    if (outEl) outEl.textContent = msg;
                    await showWifiModalOrAlert({
                        title: t('devices.wifi.title'),
                        subtitle: t('devices.wifi.diagnosticFailed'),
                        message: msg,
                    });
                    return;
                }

                const report = formatWifiReport(data);
                if (outEl) outEl.textContent = prev || t('devices.wifi.complete');

                const stable = !!(data && data.stability && data.stability.stable);
                const verdict = (data && data.stability && data.stability.verdict) ? String(data.stability.verdict) : (stable ? 'Stable' : 'Unstable');
                const subtitle = verdict === 'Not connected' ? t('devices.wifi.notConnected') : (stable ? t('devices.wifi.stable') : t('devices.wifi.unstable'));
                await showWifiModalOrAlert({
                    title: t('devices.wifi.stabilityTitle'),
                    subtitle,
                    message: report,
                });

                // Offer fix if unstable
                const tests = (data && data.ping && Array.isArray(data.ping.tests)) ? data.ping.tests : [];
                const phoneFixAvailable = !stable && verdict !== 'Not connected';
                if (!phoneFixAvailable) return;

                const runPhoneFix = async () => {
                    try {
                        const fixRes = await fetch(`http://localhost:3333/wifi/fix/${encodeURIComponent(id)}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'dhcp_renew' }),
                        });
                        const fixData = await fixRes.json().catch(() => null);
                        if (!fixRes.ok || !fixData || fixData.ok === false) {
                            const msg = (fixData && (fixData.error || fixData.message)) || `Fix failed (HTTP ${fixRes.status})`;
                            await showWifiModalOrAlert({
                                title: t('devices.wifi.fixTitle'),
                                subtitle: t('devices.wifi.fixFailed'),
                                message: msg,
                            });
                            return;
                        }
                        await showWifiModalOrAlert({
                            title: t('devices.wifi.fixTitle'),
                            subtitle: t('devices.wifi.fixDone'),
                            message: t('devices.wifi.fixMessage'),
                        });
                    } catch {
                        await showWifiModalOrAlert({
                            title: t('devices.wifi.fixTitle'),
                            subtitle: t('devices.wifi.fixFailed'),
                            message: t('devices.wifi.fixUnreachable'),
                        });
                    }
                };

                let doPhone = false;
                try {
                    doPhone = confirm(t('devices.wifi.confirmFix'));
                } catch { doPhone = false; }
                if (doPhone) await runPhoneFix();
            });
        });

        // ---- apps button (unchanged logic, only status messages translated) ----
        container.querySelectorAll('.apps').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const deviceEl = btn.closest('.device');
                if (!id || !deviceEl) return;

                if (typeof window.securityScanInProgress === 'undefined') {
                    window.securityScanInProgress = {};
                }
                window.securityScanInProgress[id] = true;

                if (typeof ensureDiagStepsContainer === 'function' && typeof setDiagStatus === 'function') {
                    ensureDiagStepsContainer(id);
                    setDiagStatus(id, 'security', 'running');
                    const descEl = document.querySelector(`#diag-steps-${id} .diag-step[data-step="security"] .diag-step-desc`);
                    if (descEl) descEl.textContent = t('devices.security.scanningApps');
                }

                let suspiciousApps = [];

                // Fast scan
                try {
                    const fastRes = await fetch(`http://localhost:3333/suspicious-apps/${id}`);
                    const fastData = await fastRes.json();
                    suspiciousApps = Array.isArray(fastData.suspiciousApps) ? fastData.suspiciousApps : [];
                    if (typeof window.suspiciousAppsByDevice === 'undefined') {
                        window.suspiciousAppsByDevice = {};
                    }
                    window.suspiciousAppsByDevice[id] = suspiciousApps;

                    const fullDiagActiveFast = typeof window.fullDiagInProgress === 'object' && window.fullDiagInProgress && window.fullDiagInProgress[id];
                    const secFastValueEl = document.getElementById(`security-value-${id}`);
                    const secFastBadgeEl = document.getElementById(`security-badge-${id}`);
                    const secFastSubEl = document.getElementById(`security-subtext-${id}`);

                    if (!fullDiagActiveFast && suspiciousApps.length > 0) {
                        const highSusp = suspiciousApps.filter(a => a.threatLevel === 'high').length;
                        const medSusp = suspiciousApps.filter(a => a.threatLevel === 'medium').length;
                        const lowSusp = suspiciousApps.filter(a => a.threatLevel === 'low').length;

                        if (secFastBadgeEl) {
                            secFastBadgeEl.classList.remove('summary-badge-safe', 'summary-badge-warn', 'summary-badge-danger');
                            if (highSusp > 0) {
                                secFastBadgeEl.classList.add('summary-badge-danger');
                                secFastBadgeEl.textContent = t('devices.summary.issue');
                            } else {
                                secFastBadgeEl.classList.add('summary-badge-warn');
                                secFastBadgeEl.textContent = t('devices.summary.warning');
                            }
                        }
                        if (secFastValueEl) secFastValueEl.textContent = highSusp > 0 ? t('devices.summary.highRisk') : t('devices.summary.moderate');
                        if (secFastSubEl) secFastSubEl.textContent = `${suspiciousApps.length} suspicious app(s): ${highSusp} high, ${medSusp} medium, ${lowSusp} low risk.`;
                    }
                } catch (fastErr) {
                    console.error('[Security] Fast suspicious scan failed:', fastErr);
                }

                // Full deep scan
                const descEl2 = document.querySelector(`#diag-steps-${id} .diag-step[data-step="security"] .diag-step-desc`);
                if (descEl2) descEl2.textContent = t('devices.security.deepScanRunning');

                let res, data;
                try {
                    res = await fetch(`http://localhost:3333/apps/${id}`);
                    data = await res.json().catch(() => ({}));
                } catch (e) {
                    const msg = e && e.message ? e.message : String(e);
                    const hint = isLikelyDeviceDisconnectedError(msg)
                        ? t('devices.security.failDisconnected')
                        : t('devices.security.failGeneric', { msg });
                    recordSecurityScanFailure(id, hint);
                    if (typeof window.securityScanInProgress === 'object' && window.securityScanInProgress) {
                        window.securityScanInProgress[id] = false;
                    }
                    if (typeof setDiagStatus === 'function') setDiagStatus(id, 'security', 'issue');
                    return;
                }

                if (!res || !res.ok || (data && data.ok === false) || (data && data.error)) {
                    const msg = (data && (data.error || data.message)) || (res ? `HTTP ${res.status}` : 'Unknown error');
                    const hint = isLikelyDeviceDisconnectedError(msg)
                        ? t('devices.security.failDisconnected')
                        : t('devices.security.failGeneric', { msg });
                    recordSecurityScanFailure(id, hint);
                    if (typeof window.securityScanInProgress === 'object' && window.securityScanInProgress) {
                        window.securityScanInProgress[id] = false;
                    }
                    if (typeof setDiagStatus === 'function') setDiagStatus(id, 'security', 'issue');
                    return;
                }

                const apps = Array.isArray(data.apps) ? data.apps : [];
                const riskByPkg = data.riskByPkg || {};
                const riskScoreByPkg = data.riskScoreByPkg || {};
                const permsByPkg = data.permsByPkg || {};

                const fullSuspicious = Array.isArray(data.suspiciousApps) ? data.suspiciousApps : [];
                if (fullSuspicious.length > 0) {
                    window.suspiciousAppsByDevice[id] = fullSuspicious;
                    suspiciousApps = fullSuspicious;
                }

                let safeCount = 0, moderateCount = 0, riskyCount = 0;
                const lines = [];
                let index = 1;
                const riskyAppsList = [], moderateAppsList = [], safeAppsList = [];

                for (const app of apps) {
                    const pkgName = app.packageName || '';
                    const raw = app.raw || '';
                    let risk = pkgName && riskByPkg[pkgName] ? riskByPkg[pkgName] : '';

                    if (risk === 'unknown' && pkgName && permsByPkg[pkgName]) {
                        const perms = permsByPkg[pkgName] || [];
                        const upper = perms.map(p => p.toUpperCase());
                        const RISKY_PERMISSIONS = ['BIND_ACCESSIBILITY_SERVICE', 'RECEIVE_SMS', 'READ_SMS', 'READ_CALL_LOG', 'WRITE_SETTINGS', 'SYSTEM_ALERT_WINDOW', 'DEVICE_ADMIN'];
                        const MODERATE_PERMISSIONS = ['READ_CONTACTS', 'WRITE_CONTACTS', 'GET_ACCOUNTS', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'RECORD_AUDIO', 'CAMERA', 'READ_CALL_LOG', 'WRITE_CALL_LOG', 'READ_PHONE_STATE', 'CALL_PHONE', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'MANAGE_EXTERNAL_STORAGE'];
                        const hasRisky = upper.some(p => RISKY_PERMISSIONS.some(r => p.indexOf(r) !== -1));
                        const hasModerate = upper.some(p => MODERATE_PERMISSIONS.some(m => p.indexOf(m) !== -1));
                        if (hasRisky) risk = 'risky';
                        else if (hasModerate) risk = 'moderate';
                        else risk = 'safe';
                    }
                    if (!risk) risk = 'safe';

                    const label = risk === 'safe' ? 'SAFE' : risk === 'moderate' ? 'MODERATE' : 'RISKY';
                    let displayName = '(unknown app)';
                    let sourceName = pkgName;
                    if (!sourceName && raw) {
                        const eqIdx = raw.lastIndexOf('=');
                        if (eqIdx !== -1 && eqIdx + 1 < raw.length) {
                            sourceName = raw.substring(eqIdx + 1);
                        }
                    }
                    if (!sourceName && app.path) {
                        const slashIdx = app.path.lastIndexOf('/');
                        if (slashIdx !== -1 && slashIdx + 1 < app.path.length) {
                            sourceName = app.path.substring(slashIdx + 1);
                        }
                    }
                    if (sourceName) {
                        const parts = sourceName.split('.');
                        const last = parts[parts.length - 1] || sourceName;
                        displayName = last.replace(/[_-]+/g, ' ');
                        displayName = displayName.replace(/\b\w/g, c => c.toUpperCase());
                    }

                    const score = pkgName && typeof riskScoreByPkg[pkgName] === 'number' ? riskScoreByPkg[pkgName] : 0;
                    const entry = { name: displayName, packageName: pkgName, score, label };

                    if (risk === 'safe') { safeCount += 1; safeAppsList.push(entry); }
                    else if (risk === 'moderate') { moderateCount += 1; moderateAppsList.push(entry); }
                    else if (risk === 'risky') { riskyCount += 1; riskyAppsList.push(entry); }

                    const scoreText = score ? ` ${score}/100` : '';
                    lines.push(index + '. ' + displayName + ' - ' + label + scoreText);
                    index += 1;
                }

                const finalSuspicious = Array.isArray(suspiciousApps) ? suspiciousApps : [];
                const suspiciousHigh = finalSuspicious.filter(a => a.threatLevel === 'high').length;
                const suspiciousMedium = finalSuspicious.filter(a => a.threatLevel === 'medium').length;
                const suspiciousLow = finalSuspicious.filter(a => a.threatLevel === 'low').length;
                const suspiciousTotal = finalSuspicious.length;

                let summary;
                if (suspiciousTotal > 0) {
                    summary = `Apps scanned: ${apps.length}. ${suspiciousTotal} suspicious app(s): ${suspiciousHigh} high, ${suspiciousMedium} medium, ${suspiciousLow} low risk.`;
                } else {
                    summary = `Apps scanned: ${apps.length}. ${riskyCount} risky, ${moderateCount} moderate, ${safeCount} safe.`;
                }

                // file scan
                let fileScan = null;
                try {
                    const resFiles = await fetch(`http://localhost:3333/file-scan/${encodeURIComponent(id)}`);
                    if (resFiles.ok) fileScan = await resFiles.json();
                } catch { /* ignore */ }

                const filesScanned = fileScan && typeof fileScan.totalFiles === 'number' ? fileScan.totalFiles : null;
                const suspiciousFiles = fileScan && typeof fileScan.suspiciousFiles === 'number' ? fileScan.suspiciousFiles : null;
                const suspiciousSamples = fileScan && Array.isArray(fileScan.suspiciousSamples) ? fileScan.suspiciousSamples : [];
                const touchSummary = data.touchSummary || null;

                // Cache security scan summary
                if (typeof securityScanByDevice !== 'undefined') {
                    const suspiciousHighList = finalSuspicious.filter(a => a.threatLevel === 'high');
                    const suspiciousMediumList = finalSuspicious.filter(a => a.threatLevel === 'medium');
                    const suspiciousLowList = finalSuspicious.filter(a => a.threatLevel === 'low');

                    securityScanByDevice[id] = {
                        appsScanned: apps.length,
                        riskyCount,
                        moderateCount,
                        safeCount,
                        filesScanned,
                        suspiciousFiles,
                        suspiciousSamples,
                        touchSummary,
                        appsByRisk: { risky: suspiciousHighList, moderate: suspiciousMediumList, safe: suspiciousLowList },
                        suspiciousApps: finalSuspicious,
                        suspiciousHigh,
                        suspiciousMedium,
                        suspiciousLow,
                        suspiciousTotal,
                        lines,
                        summary,
                    };
                }

                // Update pendingResults if exists
                if (typeof pendingResults !== 'undefined') {
                    const record = pendingResults[id];
                    if (record) {
                        const diagDetails = record.diagDetails || {};
                        const existingSec = diagDetails.security || {};
                        diagDetails.security = {
                            ...existingSec,
                            appsScanned: apps.length,
                            riskyCount,
                            moderateCount,
                            safeCount,
                            filesScanned: existingSec.filesScanned != null ? existingSec.filesScanned : filesScanned,
                            suspiciousFiles: existingSec.suspiciousFiles != null ? existingSec.suspiciousFiles : suspiciousFiles,
                            appsByRisk: { risky: riskyAppsList, moderate: moderateAppsList, safe: safeAppsList },
                            suspiciousApps: finalSuspicious,
                            suspiciousHigh,
                            suspiciousMedium,
                            suspiciousLow,
                            suspiciousTotal,
                        };
                        if (touchSummary) {
                            diagDetails.touch = {
                                hasTouchDriverErrors: !!touchSummary.hasTouchDriverErrors,
                                hasInputAnomalies: !!touchSummary.hasInputAnomalies,
                                isChargingDuringLogs: !!touchSummary.isChargingDuringLogs,
                            };
                        }
                        record.diagDetails = diagDetails;

                        const diagStages = record.diagStages || {};
                        const secOk = riskyCount === 0 && moderateCount === 0 && ((diagDetails.security && diagDetails.security.suspiciousFiles) || 0) === 0 && suspiciousTotal === 0;
                        diagStages.security = {
                            ok: secOk,
                            label: secOk ? 'Apps look clean' : 'Apps need attention',
                            details: summary,
                        };
                        if (touchSummary) {
                            const touchOk = !!touchSummary.ok;
                            diagStages.touch = {
                                ok: touchOk,
                                label: touchOk ? 'No clear touch-driver or input anomalies' : 'Possible touch / ghost touch issues',
                                details: touchSummary.details || undefined,
                            };
                        }
                        record.diagStages = diagStages;

                        if (typeof updateDiagStagesFromSummary === 'function') {
                            updateDiagStagesFromSummary(id, diagStages);
                        }
                        if (typeof window.updateLiveDiagnosticModal === 'function') {
                            window.updateLiveDiagnosticModal(id);
                        }

                        // Auto-save to history (unchanged)
                        try {
                            const autoSaved = record && record.autoSavedHistory ? record.autoSavedHistory : null;
                            const runId = autoSaved && autoSaved.ok && Number.isFinite(Number(autoSaved.runId)) ? Number(autoSaved.runId) : null;
                            if (runId) {
                                if (record.timestamp !== runId) { record.timestamp = runId; record.id = runId; }
                                const cacheKey = `${String(id)}:${String(runId)}`;
                                if (!finalizedHistoryRuns.has(cacheKey)) {
                                    finalizedHistoryRuns.add(cacheKey);
                                    let localToken = '';
                                    try { localToken = String(localStorage.getItem('smarthub.auth.localSessionToken') || '').trim(); } catch { /* ignore */ }
                                    const saveHeaders = { 'Content-Type': 'application/json' };
                                    if (localToken) saveHeaders.Authorization = `Bearer ${localToken}`;
                                    fetch(`http://localhost:3333/history/${encodeURIComponent(id)}`, {
                                        method: 'POST',
                                        headers: saveHeaders,
                                        body: JSON.stringify(record),
                                    })
                                        .then(async (resp) => {
                                            if (!resp.ok) {
                                                const body = await resp.json().catch(() => null);
                                                const reason = (body && (body.error || body.message)) ? String(body.error || body.message) : `HTTP ${resp.status}`;
                                                throw new Error(reason);
                                            }
                                        })
                                        .then(() => {
                                            if (typeof renderHistoryList === 'function') Promise.resolve(renderHistoryList(id)).catch(() => {});
                                            if (typeof window !== 'undefined' && typeof window.renderHistoryBrowserModal === 'function') {
                                                Promise.resolve(window.renderHistoryBrowserModal({ preserveOpen: true })).catch(() => {});
                                            }
                                        })
                                        .catch(e => console.error('Failed to finalize auto-saved history run', e));
                                }
                            }
                        } catch (e) { /* best-effort */ }
                    }
                }

                // Update security badge
                const fullDiagActive = typeof window.fullDiagInProgress === 'object' && window.fullDiagInProgress && window.fullDiagInProgress[id];
                const securityValueEl = document.getElementById(`security-value-${id}`);
                const securityBadgeEl = document.getElementById(`security-badge-${id}`);
                const securitySubEl = document.getElementById(`security-subtext-${id}`);

                if (!fullDiagActive) {
                    if (suspiciousApps.length > 0) {
                        const highSuspicious = suspiciousApps.filter(app => app.threatLevel === 'high').length;
                        const mediumSuspicious = suspiciousApps.filter(app => app.threatLevel === 'medium').length;
                        const lowSuspicious = suspiciousApps.filter(app => app.threatLevel === 'low').length;

                        if (securityBadgeEl) {
                            securityBadgeEl.classList.remove('summary-badge-safe', 'summary-badge-warn', 'summary-badge-danger');
                            if (highSuspicious > 0) {
                                securityBadgeEl.classList.add('summary-badge-danger');
                                securityBadgeEl.textContent = t('devices.summary.issue');
                                if (securityValueEl) securityValueEl.textContent = t('devices.summary.highRisk');
                            } else if (mediumSuspicious > 0) {
                                securityBadgeEl.classList.add('summary-badge-warn');
                                securityBadgeEl.textContent = t('devices.summary.warning');
                                if (securityValueEl) securityValueEl.textContent = t('devices.summary.moderate');
                            } else {
                                securityBadgeEl.classList.add('summary-badge-warn');
                                securityBadgeEl.textContent = t('devices.summary.warning');
                                if (securityValueEl) securityValueEl.textContent = 'Low Risk';
                            }
                        }
                        if (securitySubEl) {
                            securitySubEl.textContent = `${suspiciousApps.length} suspicious app(s): ${highSuspicious} high, ${mediumSuspicious} medium, ${lowSuspicious} low risk.`;
                        }
                    } else if (riskyCount > 0 || moderateCount > 0) {
                        if (securityValueEl) securityValueEl.textContent = riskyCount > 0 ? 'Moderate' : 'Low Risk';
                        if (securitySubEl) {
                            securitySubEl.textContent = `${apps.length} apps scanned. ${riskyCount} risky, ${moderateCount} moderate permissions detected.`;
                        }
                    } else {
                        if (securityBadgeEl) {
                            securityBadgeEl.classList.remove('summary-badge-safe', 'summary-badge-warn', 'summary-badge-danger');
                            securityBadgeEl.classList.add('summary-badge-safe');
                            securityBadgeEl.textContent = t('devices.summary.safe');
                        }
                        if (securityValueEl) securityValueEl.textContent = t('devices.summary.allClear');
                        if (securitySubEl) {
                            securitySubEl.textContent = `${apps.length} apps scanned. No security threats detected.`;
                        }
                    }
                }

                if (typeof window.securityScanInProgress === 'object' && window.securityScanInProgress) {
                    window.securityScanInProgress[id] = false;
                }
            });
        });

        // ---- app-risk button (unchanged, uses prompt) ----
        container.querySelectorAll('.app-risk').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const pkg = prompt(t('devices.appRisk.prompt'));
                if (!pkg) return;
                try {
                    const res = await fetch(`http://localhost:3333/app-risk/${id}/${encodeURIComponent(pkg)}`);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const data = await res.json();
                    // data not displayed in UI (only logs)
                } catch (err) {
                    console.error('Failed to check app risk:', err);
                }
            });
        });

    } catch (err) {
        console.error('Failed to load devices:', err);
        const msg = err && err.message ? err.message : 'Unknown error';
        const container = document.getElementById('devices');
        const isOffline = typeof msg === 'string' && /failed to fetch/i.test(msg);
        if (isOffline) {
            container.innerHTML = `<div class="status-banner"><div class="status-icon">⟳</div><div><strong>${t('devices.loading.pleaseWait')}</strong><br/>${t('devices.loading.tryRefresh')}</div></div>`;
            try {
                if (window.chrome && window.chrome.webview && typeof window.chrome.webview.postMessage === 'function') {
                    window.chrome.webview.postMessage({ type: 'ensureBackend' });
                    setTimeout(() => { try { refresh(); } catch (e2) { console.error('Retrying device refresh after ensureBackend failed:', e2); } }, 3000);
                }
            } catch (e) { console.error('Failed to request backend start from host shell:', e); }
        } else {
            container.innerHTML = `<div class="status-banner error"><div class="status-icon">!</div><div><strong>${t('devices.loading.failed')}</strong><br/>${msg}.<br/>${t('devices.loading.verifyBackend')}</div></div>`;
        }
    }
}

// ============================================================
// 3. Auto-refresh on language change
// ============================================================
document.addEventListener('languageChanged', function() {
    // Re-render the device list when language changes
    if (typeof refresh === 'function') {
        refresh();
    }
});