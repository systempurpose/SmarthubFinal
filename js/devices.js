const finalizedHistoryRuns = new Set();

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

  if (!nameEl || !metaEl || !badgeEl || !countsEl || !gridEl || !testsSubtitleEl || !testsGridEl) {
    return;
  }

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

  titleEl.textContent = 'Device Details';
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
    : 'No diagnostic data captured yet.';

  // Summary badge and counts
  const counts = record && record.counts ? record.counts : null;
  const diagStages = record && record.diagStages ? record.diagStages : null;

  const high = counts && typeof counts.high === 'number' ? counts.high : 0;
  const medium = counts && typeof counts.medium === 'number' ? counts.medium : 0;
  const low = counts && typeof counts.low === 'number' ? counts.low : 0;

  if (!record) {
    setBadge('safe', 'Not scanned');
    countsEl.textContent = 'Run a diagnostic to populate device details and tests.';
  } else if (high > 0) {
    setBadge('danger', 'Attention');
    countsEl.textContent = `${high} high, ${medium} medium, ${low} low finding(s)`;
  } else if (medium > 0) {
    setBadge('warn', 'Review');
    countsEl.textContent = `${high} high, ${medium} medium, ${low} low finding(s)`;
  } else {
    setBadge('safe', 'All clear');
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
    { label: 'Device ID', value: deviceId },
    { label: 'Reported problem', value: userProblem || '' },
    { label: 'Model', value: specModel || '' },
    { label: 'Android / OS', value: specOs || (osDetails && osDetails.androidVersion ? `Android ${osDetails.androidVersion}` : '') },
    { label: 'Build fingerprint', value: osDetails && osDetails.buildFingerprint ? osDetails.buildFingerprint : '' },
    { label: 'Verified Boot', value: osDetails && osDetails.verifiedBootState ? String(osDetails.verifiedBootState) : '' },
    { label: 'Bootloader locked', value: typeof (osDetails && osDetails.bootloaderLocked) === 'boolean' ? (osDetails.bootloaderLocked ? 'Yes' : 'No') : '' },
    { label: 'Display', value: (displayDetails && displayDetails.width && displayDetails.height) ? `${displayDetails.width} × ${displayDetails.height}` : readTextContent(`spec-display-resolution-${deviceId}`) },
    { label: 'RAM', value: (systemDetails && typeof systemDetails.memTotalKb === 'number') ? `${Math.round(systemDetails.memTotalKb / (1024 * 1024) * 10) / 10} GB (approx)` : readTextContent(`spec-memory-ram-${deviceId}`) },
    { label: 'Internal storage', value: readTextContent(`spec-memory-internal-${deviceId}`) },
    { label: 'Battery', value: batteryDetails
      ? [
        typeof batteryDetails.level === 'number' ? `${batteryDetails.level}%` : '',
        typeof batteryDetails.temperatureC === 'number' ? `${batteryDetails.temperatureC}°C` : '',
        batteryDetails.health ? String(batteryDetails.health) : '',
      ].filter(Boolean).join(' · ')
      : ''
    },
    { label: 'Apps & Security', value: securityDetails && typeof securityDetails.appsScanned === 'number'
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
    v.textContent = raw ? raw : 'Not reported';

    card.appendChild(l);
    card.appendChild(v);
    gridEl.appendChild(card);
  });

  // Tests grid
  testsGridEl.innerHTML = '';
  if (!diagStages || typeof diagStages !== 'object') {
    testsSubtitleEl.textContent = 'No test results yet.';
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
      s.textContent = stage.ok ? 'Pass' : 'Fail';

      test.appendChild(n);
      test.appendChild(s);
      testsGridEl.appendChild(test);
    });

    const total = passed + failed;
    testsSubtitleEl.textContent = total
      ? `Tests completed: ${total}/${total} · Passed: ${passed} · Failed: ${failed}`
      : 'No test results yet.';
  }

  modal.classList.remove('hidden');
}

function isLikelyDeviceDisconnectedError(msg) {
  const m = String(msg || '').toLowerCase();
  return (
    m.includes('device offline') ||
    m.includes('offline') ||
    m.includes('not found') ||
    m.includes('closed') ||
    m.includes('connection reset') ||
    m.includes('protocol fault') ||
    m.includes('cannot connect')
  );
}

function recordSecurityScanFailure(deviceId, message) {
  const summary = String(message || 'Apps & Security scan failed.').trim();

  if (typeof securityScanByDevice !== 'undefined') {
    securityScanByDevice[deviceId] = {
      appsScanned: 0,
      riskyCount: 0,
      moderateCount: 0,
      safeCount: 0,
      filesScanned: null,
      suspiciousFiles: null,
      suspiciousSamples: [],
      touchSummary: null,
      appsByRisk: { risky: [], moderate: [], safe: [] },
      suspiciousApps: [],
      suspiciousHigh: 0,
      suspiciousMedium: 0,
      suspiciousLow: 0,
      suspiciousTotal: 0,
      lines: [],
      summary,
      scanOk: false,
      error: summary,
    };
  }

  if (typeof pendingResults !== 'undefined') {
    const record = pendingResults[deviceId];
    if (record) {
      record.diagDetails = record.diagDetails || {};
      record.diagDetails.security = {
        ...(record.diagDetails.security || {}),
        appsScanned: 0,
        error: summary,
      };

      record.diagStages = record.diagStages || {};
      record.diagStages.security = {
        ok: false,
        label: 'Apps scan failed',
        details: summary,
      };

      // If the device likely disconnected, also hint under Connectivity.
      if (isLikelyDeviceDisconnectedError(summary)) {
        const existingConn = record.diagStages.connectivity;
        if (existingConn) {
          const hint = 'Device disconnected/shut down during scan (plug in power + retry)';
          record.diagStages.connectivity = {
            ...existingConn,
            ok: false,
            label: 'Possible USB/connection instability',
            details: existingConn.details ? `${existingConn.details} · ${hint}` : hint,
          };
        }
      }

      if (typeof updateDiagStagesFromSummary === 'function') {
        updateDiagStagesFromSummary(deviceId, record.diagStages);
      }
      if (typeof window.updateLiveDiagnosticModal === 'function') {
        window.updateLiveDiagnosticModal(deviceId);
      }
    }
  }
}

// Expose as a global so other scripts (or the host shell) can open the modal if needed.
try {
  window.openDeviceDetailsModal = openDeviceDetailsModal;
} catch {
  // ignore
}

function i18n() {
  try {
    if (window.SmartHubI18n) return window.SmartHubI18n;
  } catch {
    // ignore
  }
  return { t: (k, _p) => k };
}

async function refresh() {
  const container = document.getElementById('devices');
  container.innerHTML = `<div class="status-banner"><div class="status-icon spinner" aria-hidden="true"></div><div><strong>${i18n().t(
    'devices.scanning.title',
  )}</strong><br/>${i18n().t('devices.scanning.body')}</div></div>`;
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
        options.push({ value: 'all', label: i18n().t('option.allDevices') });
        devices.forEach(d => {
          if (!d || !d.id) return;
          const label = d.model || d.product || d.deviceCode || d.id;
          const state = d.state ? ` · ${d.state}` : '';
          options.push({ value: String(d.id), label: `${label} (${d.id})${state}` });
        });

        // Preserve a user selection even if that device is currently not detected.
        if (preferred && preferred !== 'all') {
          const exists = devices.some(d => d && String(d.id) === String(preferred));
          if (!exists) {
            options.splice(1, 0, {
              value: String(preferred),
              label: i18n().t('devices.option.notDetected', { id: String(preferred) }),
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

        // Keep previous/stored selection when possible.
        const available = new Set(options.map(o => o.value));
        sel.value = available.has(preferred) ? preferred : 'all';
        sel.disabled = options.length <= 1;

        // Persist changes.
        if (!sel.dataset.bound) {
          sel.dataset.bound = '1';
          sel.addEventListener('change', () => {
            try {
              localStorage.setItem('smarthub.selectedDeviceId', sel.value || 'all');
            } catch {
              // ignore
            }

            // Re-render device cards immediately to match the selection.
            try {
              refresh();
            } catch {
              // ignore
            }
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

        // For the Devices page banner we intentionally accept *any* Portable/WPD
        // device name that isn't an obvious peripheral. Many phones expose
        // generic names when locked/non-debuggable, and the backend already
        // filtered to Portable/WPD class.
        return list.filter(p => p && p.name && !nonPhoneHints.test(p.name));
      }

      // Try a lightweight connection-check so we can distinguish "ADB empty
      // but PC sees the phone as MTP" from "nothing connected at all", and
      // surface the MTP devices directly in the main banner.
      let heading = i18n().t('devices.none.title');
      let guidance = i18n().t('devices.none.guidance');
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
            // Filter out obvious host-side USB infrastructure.
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
                <div class="mtp-summary-title">Detected via Windows USB transport</div>
                <ul>${listItems}</ul>
                <div class="mtp-summary-note">ADB is not available in this mode. Use authorized recovery/firmware repair workflows.</div>
              </div>`;
          }

          if (!adbList.length && portable.length) {
            heading = i18n().t('devices.noAdb.title');
            guidance = i18n().t('devices.noAdb.guidance');

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
                      <div class="mtp-device-adb">${i18n().t('devices.mtp.adbNotDetected')}</div>
                    </div>
                  </div>
                  <div class="mtp-summary-title">${i18n().t('devices.mtp.detectedTitle')}</div>
                  <ul>${listItems}</ul>
                  <div class="mtp-summary-note">${i18n().t('devices.mtp.note')}</div>
                </div>`;
            }
          }

          // If ADB is empty and no MTP banner was shown, still surface low-level
          // transport modes (fastboot / Samsung Download) by using the Device
          // Manager transport name(s).
          if (!adbList.length && !portable.length && transport.length && (looksSamsungDownload || looksFastboot)) {
            if (looksSamsungDownload) {
              heading = 'Device detected (Samsung Download / Odin mode)';
              guidance = 'Windows detects the phone in Samsung Download/Odin mode. Android is not running; ADB will not appear. Use authorized firmware repair tools/workflows.';
              const primary = pickPrimaryTransportDevice(transport, /SAMSUNG\s+Mobile\s+USB\s+CDC\s+Composite\s+Device/i);
              transportSummaryHtml = renderTransportSummary('Samsung Download / Odin mode', primary && primary.name ? String(primary.name) : 'Samsung Download / Odin mode', transport);
            } else {
              heading = 'Device detected (Fastboot / bootloader mode)';
              guidance = 'Windows detects a bootloader/fastboot transport interface. Android is not running normally; ADB may be unavailable. Use authorized recovery/firmware repair steps.';
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

      // Ensure selector is disabled when no ADB devices are available.
      try {
        const sel = document.getElementById('device-select');
        if (sel) {
          sel.innerHTML = `<option value="all">${i18n().t('option.allDevices')}</option>`;
          sel.value = 'all';
          sel.disabled = true;
        }
      } catch {
        // ignore
      }
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
          container.innerHTML = `<div class="status-banner"><div class="status-icon">ℹ️</div><div><strong>${i18n().t(
            'devices.selectedMissing.title',
          )}</strong><br/>${i18n().t('devices.selectedMissing.body', { id: String(selected) })}</div></div>`;
          return;
        }
      }
    } catch {
      // If anything goes wrong, fall back to rendering all devices.
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
          connectionClass = 'tcpip';
        } else if (d.connection.type === 'usb') {
          const path = d.connection.usbPath || d.usbPath;
          connectionText = path ? `Connection: USB (usb path: ${path})` : 'Connection: USB';
          connectionClass = 'usb';
        } else if (d.connection.type === 'emulator') {
          connectionText = 'Connection: Emulator';
          connectionClass = 'emulator';
        }
      }

      div.innerHTML = `
          <div class="device-header">
            <div class="device-title">
              <h3>${heading}</h3>
              ${connectionText ? `<div class="device-meta">${connectionText}</div>` : ''}
            </div>
            ${connectionClass ? `<span class="chip ${connectionClass}">${connectionClass}</span>` : ''}
          </div>
          <div class="device-body">
            <div class="device-summary-row">
              <div class="summary-card" id="status-card-${d.id}">
                <div class="summary-header">
                  <span class="summary-icon">✔</span>
                  <span class="summary-badge summary-badge-safe" id="status-badge-${d.id}">Safe</span>
                </div>
                <div class="summary-label">System Status</div>
                <div class="summary-value" id="status-value-${d.id}">Not scanned</div>
                <div class="summary-subtext" id="status-subtext-${d.id}">Run quick checks to analyse battery, storage and display.</div>
              </div>
              <div class="summary-card" id="security-card-${d.id}">
                <div class="summary-header">
                  <span class="summary-icon">🛡️</span>
                  <span class="summary-badge summary-badge-safe" id="security-badge-${d.id}">Safe</span>
                </div>
                <div class="summary-label">Security</div>
                <div class="summary-value" id="security-value-${d.id}">Not scanned</div>
                <div class="summary-subtext" id="security-subtext-${d.id}">App and log analysis after a scan.</div>
              </div>
              <div class="summary-card">
                <div class="summary-header">
                  <span class="summary-icon">📱</span>
                  <span class="summary-badge summary-badge-safe">Connected</span>
                </div>
                <div class="summary-label">Devices</div>
                <div class="summary-value">1 Active</div>
                <div class="summary-subtext">ID: ${d.id}</div>
              </div>
            </div>

            <div class="device-main">
              <div class="device-tabs">
                <button class="device-tab active" data-tab="details">Details</button>
                <button class="device-tab" data-tab="history">History</button>
              </div>
              <div class="device-tab-panels">
                <div class="device-tab-panel active" data-panel="details">
                  <div class="device-overview-grid">
                    <div class="overview-item">
                      <div class="overview-label"><span class="details-icon">🔋</span>Battery</div>
                      <div class="overview-value" id="detail-battery-${d.id}">Awaiting scan…</div>
                    </div>
                    <div class="overview-item">
                      <div class="overview-label"><span class="details-icon">💾</span>Storage</div>
                      <div class="overview-value" id="detail-storage-${d.id}">Awaiting scan…</div>
                    </div>
                    <div class="overview-item">
                      <div class="overview-label"><span class="details-icon">🖥️</span>Display pipeline</div>
                      <div class="overview-value" id="detail-display-${d.id}">Awaiting scan…</div>
                    </div>
                  </div>
                  <div class="diag-meta" id="diag-meta-${d.id}"></div>
                  <div class="diag-steps" id="diag-steps-${d.id}"></div>
                  <div class="details-spec">
                    <div class="details-spec-section">
                      <div class="details-spec-title">Display</div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">Size</div>
                        <div class="details-spec-value" id="spec-display-size-${d.id}">–</div>
                      </div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">Resolution</div>
                        <div class="details-spec-value" id="spec-display-resolution-${d.id}">–</div>
                      </div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">Density</div>
                        <div class="details-spec-value" id="spec-display-density-${d.id}">–</div>
                      </div>
                    </div>
                    <div class="details-spec-section">
                      <div class="details-spec-title">Platform</div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">OS</div>
                        <div class="details-spec-value" id="spec-platform-os-${d.id}">–</div>
                      </div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">Chipset</div>
                        <div class="details-spec-value" id="spec-platform-chipset-${d.id}">–</div>
                      </div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">CPU</div>
                        <div class="details-spec-value" id="spec-platform-cpu-${d.id}">–</div>
                      </div>
                    </div>
                    <div class="details-spec-section">
                      <div class="details-spec-title">Memory</div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">RAM</div>
                        <div class="details-spec-value" id="spec-memory-ram-${d.id}">–</div>
                      </div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">Internal</div>
                        <div class="details-spec-value" id="spec-memory-internal-${d.id}">–</div>
                      </div>
                    </div>
                    <div class="details-spec-section">
                      <div class="details-spec-title">Battery</div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">Type</div>
                        <div class="details-spec-value" id="spec-battery-type-${d.id}">–</div>
                      </div>
                    </div>
                    <div class="details-spec-section">
                      <div class="details-spec-title">Misc</div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">Model</div>
                        <div class="details-spec-value" id="spec-misc-model-${d.id}">–</div>
                      </div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">Board</div>
                        <div class="details-spec-value" id="spec-misc-board-${d.id}">–</div>
                      </div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">Manufacturer</div>
                        <div class="details-spec-value" id="spec-misc-manufacturer-${d.id}">–</div>
                      </div>
                      <div class="details-spec-row">
                        <div class="details-spec-label">Device code</div>
                        <div class="details-spec-value" id="spec-misc-device-${d.id}">–</div>
                      </div>
                    </div>
                    </div>
                    <div class="device-actions">
                      <div class="device-actions-row">
                        <button data-id="${d.id}" class="collect btn-collect">🔍 Diagnostic</button>
                        <button data-id="${d.id}" class="wifi btn-collect compact">📶 Wi‑Fi</button>
                        <button data-id="${d.id}" class="deep-scan btn-collect compact">🧪 Deep Scan</button>
                        <button data-id="${d.id}" class="apps btn-apps compact">🛡️ Scan for Threats</button>
                        <button data-id="${d.id}" class="app-risk btn-app-risk compact">Check one app</button>
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

    // Tab switching per device (and auto-run quick checks when entering Details once)
    container.querySelectorAll('.device').forEach(deviceEl => {
      const tabs = deviceEl.querySelectorAll('.device-tab');
      const panels = deviceEl.querySelectorAll('.device-tab-panel');
      const deviceId = deviceEl.dataset.id;

      // Right-click to open the Device Details modal (similar to the reference UI)
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

          // When user first opens Details, automatically run quick checks
          if (target === 'details' && deviceEl.dataset.scanned !== 'true') {
            deviceEl.dataset.scanned = 'true';
            const collectBtn = deviceEl.querySelector('.collect');
            if (collectBtn) {
              collectBtn.click();
            }
          } else if (target === 'history' && deviceId) {
            renderHistoryList(deviceId);
          }
        });
      });
    });

    container.querySelectorAll('.collect').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const deviceEl = btn.closest('.device');

        if (!id || !deviceEl) return;

        // Prefer running the on-device app when available, but do not block
        // diagnostics if it cannot be opened.
        let appInstalled = false;
        let appRunning = false;
        let appOk = false;
        try {
          const stateRes = await fetch(
            `http://localhost:3333/mobile-app-state/${encodeURIComponent(id)}`,
          );
          if (stateRes.ok) {
            const s = await stateRes.json();
            appInstalled = !!(s && s.installed);
            appRunning = !!(s && s.running);
            appOk = !!(appInstalled && appRunning);
          }
        } catch {
          // If the state check fails, continue with host-side checks.
        }

        if (appInstalled && !appRunning) {
          try {
            const openRes = await fetch('http://localhost:3333/mobile-app-open', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ id }),
            });
            if (openRes.ok) {
              const openBody = await openRes.json().catch(() => null);
              appOk = !!(openBody && openBody.ok && (openBody.running || openBody.launchOk));
            }
          } catch {
            // keep host-side fallback behavior
          }
        }

        // Even if the mobile app isn't running, still run the host-side ADB snapshot
        // so we can populate device specs and basic health signals.
        const metaEl = document.getElementById(`diag-meta-${id}`);
        if (!appOk && metaEl) {
          if (appInstalled) {
            metaEl.textContent =
              'Could not confirm SmartHub mobile app is running. Running host-side ADB checks only (device specs + basic signals).';
          } else {
            metaEl.textContent =
              'SmartHub mobile app is not installed. Running host-side ADB checks only (device specs + basic signals).';
          }
        } else if (appOk && metaEl) {
          metaEl.textContent =
            'SmartHub mobile app detected. Running full diagnostics with ADB + on-device checks.';
        }

        const res = await fetch(`http://localhost:3333/collect/${encodeURIComponent(id)}`);
        const data = await res.json();
        const findings = Array.isArray(data.findings) ? data.findings : [];

        // Keep a copy of medium/high findings for the advice tooltip ("Attention needed" info button).
        if (typeof window.attentionFindingsByDevice === 'undefined') {
          window.attentionFindingsByDevice = {};
        }
        window.attentionFindingsByDevice[id] = findings.filter(f => {
          const sev = (f.severity || 'low').toLowerCase();
          return sev === 'high' || sev === 'medium';
        });

        // Build summary stats
        let highCount = 0;
        let mediumCount = 0;
        let lowCount = 0;

        findings.forEach(f => {
          const sev = (f.severity || 'low').toLowerCase();
          if (sev === 'high') highCount += 1;
          else if (sev === 'medium') mediumCount += 1;
          else lowCount += 1;
        });

        // Icon-based textual view inside the log area
        const severityIcons = {
          low: '✓',
          medium: '⚠',
          high: '⛔',
        };

        const categoryIcons = {
          battery: '🔋',
          storage: '💾',
          display: '🖥️',
          logs: '📋',
          generic: '📱',
        };

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
          ]
            .filter(Boolean)
            .join('\n');
        });

        const textReport = blocks.length
          ? blocks.join('\n\n')
          : 'No issues detected in battery, storage or display pipeline.';

        // Update summary tiles and details tab
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
            el.textContent = 'Issue';
          } else if (state === 'warn') {
            el.classList.add('summary-badge-warn');
            el.textContent = 'Warning';
          } else {
            el.classList.add('summary-badge-safe');
            el.textContent = 'Safe';
          }
        }

        if (statusValueEl) {
          statusValueEl.textContent = overallState === 'safe' ? 'All Clear' : 'Attention needed';
        }
        if (statusSubEl) {
          statusSubEl.textContent = `${highCount + mediumCount} issue(s) detected across battery, storage or display.`;
        }
        applyBadge(statusBadgeEl, overallState);

        // Only update the Security summary here when neither a
        // dedicated Apps & Security scan nor a full diagnostic
        // sequence is running. During full diagnostics we keep the
        // Security tile in a neutral "Waiting" state until the
        // completed results are available.
        const secInProgress =
          ((typeof window.securityScanInProgress === 'object' &&
            window.securityScanInProgress &&
            window.securityScanInProgress[id]) ||
            (typeof window.fullDiagInProgress === 'object' &&
              window.fullDiagInProgress &&
              window.fullDiagInProgress[id]));

        if (!secInProgress) {
          if (securityValueEl) {
            securityValueEl.textContent =
              overallState === 'danger' ? 'High Risk' : overallState === 'warn' ? 'Moderate' : 'Safe';
          }
          if (securitySubEl) {
            securitySubEl.textContent = `${highCount} high, ${mediumCount} medium, ${lowCount} low findings.`;
          }
          applyBadge(securityBadgeEl, overallState);
        }

        // Details tab: map specific finding IDs where possible
        const batteryDetailEl = document.getElementById(`detail-battery-${id}`);
        const storageDetailEl = document.getElementById(`detail-storage-${id}`);
        const displayDetailEl = document.getElementById(`detail-display-${id}`);

        const byId = {};
        findings.forEach(f => {
          if (f.id) byId[f.id] = f;
        });

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

        // Spec-style hardware summary: populate sections for Display, Platform, Memory, Battery, Misc
        if (
          data &&
          typeof data === 'object' &&
          ((data.props && typeof data.props === 'object') || typeof data.propsDump === 'string')
        ) {
          function parseGetprop(raw) {
            const out = {};
            const text = typeof raw === 'string' ? raw : '';
            if (!text.trim()) return out;

            text.split(/\r?\n/).forEach(lineRaw => {
              const line = String(lineRaw || '').trim();
              if (!line) return;

              // Standard Android `getprop` format: [key]: [value]
              const m1 = line.match(/^\[([^\]]+)\]:\s*\[(.*)\]$/);
              if (m1) {
                const k = String(m1[1] || '').trim();
                const v = String(m1[2] || '').trim();
                if (k) out[k] = v;
                return;
              }

              // Some environments/tools emit key=value
              const m2 = line.match(/^([a-zA-Z0-9._-]+)=(.*)$/);
              if (m2) {
                const k = String(m2[1] || '').trim();
                const v = String(m2[2] || '').trim();
                if (k) out[k] = v;
              }
            });

            return out;
          }

          const props = (data.props && typeof data.props === 'object') ? data.props : parseGetprop(data.propsDump);

          const manufacturer =
            props['ro.product.manufacturer'] ||
            props['ro.product.system.manufacturer'] ||
            props['ro.product.vendor.manufacturer'] ||
            props['ro.product.odm.manufacturer'] ||
            props['ro.product.brand'];

          const model =
            props['ro.product.model'] ||
            props['ro.product.system.model'] ||
            props['ro.product.vendor.model'] ||
            props['ro.product.odm.model'] ||
            props['ro.product.name'];

          const deviceCode =
            props['ro.product.device'] ||
            props['ro.product.system.device'] ||
            props['ro.product.vendor.device'] ||
            props['ro.product.odm.device'];

          const board =
            props['ro.product.board'] ||
            props['ro.product.system.board'] ||
            props['ro.board.platform'] ||
            props['ro.hardware'];

          const soc =
            props['ro.soc.model'] ||
            props['ro.hardware.chipname'] ||
            props['ro.mediatek.platform'] ||
            props['ro.board.platform'];

          const abiList =
            props['ro.product.cpu.abilist'] ||
            props['ro.product.cpu.abilist64'] ||
            props['ro.product.cpu.abilist32'];
          const abi = props['ro.product.cpu.abi'];

          const android = props['ro.build.version.release'] || props['ro.build.version.release_or_codename'];
          const patch = props['ro.build.version.security_patch'];

          const batteryTech = data.batteryMeta && data.batteryMeta.technology;
          let screenW = data.displayMeta && data.displayMeta.width;
          let screenH = data.displayMeta && data.displayMeta.height;
          const screenDiag = data.displayMeta && data.displayMeta.diagonalInches;
          const screenArea = data.displayMeta && data.displayMeta.areaCm2;

          // Fallback: wm size (Physical size / Override size)
          if ((!screenW || !screenH) && typeof data.wmSizeDump === 'string') {
            const ws = data.wmSizeDump;
            const mm = ws.match(/(?:Physical\s+size|Override\s+size):\s*(\d+)x(\d+)/i);
            if (mm) {
              const w = Number(mm[1]);
              const h = Number(mm[2]);
              if (!Number.isNaN(w) && !Number.isNaN(h) && w > 0 && h > 0) {
                screenW = w;
                screenH = h;
              }
            }
          }

          // Best-effort fallback parsing from dumpsys display if displayMeta is missing.
          if ((!screenW || !screenH) && typeof data.displayDump === 'string') {
            const dd = data.displayDump;
            const m1 = dd.match(/logicalWidth=(\d+),\s*logicalHeight=(\d+)/i);
            const m2 = dd.match(/DisplayDeviceInfo\{".*?".*?width=(\d+),\s*height=(\d+)/i);
            const m3 = dd.match(/mBaseDisplayInfo\s+real\s+(\d+)\s*x\s*(\d+)/i);
            const mm = m1 || m2 || m3;
            if (mm) {
              const w = Number(mm[1]);
              const h = Number(mm[2]);
              if (!Number.isNaN(w) && !Number.isNaN(h) && w > 0 && h > 0) {
                screenW = w;
                screenH = h;
              }
            }
          }

          // RAM from memInfo (MemTotal in kB)
          let ramText;
          if (typeof data.memInfo === 'string') {
            const memMatch = data.memInfo.match(/MemTotal:\s+(\d+) kB/i);
            if (memMatch) {
              const kb = Number(memMatch[1]);
              if (!Number.isNaN(kb) && kb > 0) {
                const gb = kb / (1024 * 1024);
                const rounded = gb >= 1 ? gb.toFixed(1) : (kb / 1024).toFixed(0) + ' MB';
                ramText = typeof rounded === 'string' && rounded.endsWith(' MB') ? rounded : `${rounded} GB`;
              }
            }
          }

          // Internal storage size from df -h (look for /data or /storage/emulated/0)
          let storageText;
          if (typeof data.storageDump === 'string') {
            const lines = data.storageDump.split(/\r?\n/).slice(1);
            let candidate;
            for (const line of lines) {
              if (!line.trim()) continue;
              if (line.includes(' /data') || line.includes(' /storage/emulated/0')) {
                candidate = line;
                break;
              }
            }
            if (!candidate && lines.length) {
              candidate = lines[0];
            }
            if (candidate) {
              const parts = candidate.trim().split(/\s+/);
              if (parts.length >= 2) {
                storageText = parts[1];
              }
            }
          }

          function setSpecValue(el, text, fallback = 'Unknown') {
            if (!el) return;
            const raw = (text === null || typeof text === 'undefined') ? '' : String(text);
            const value = raw.trim() ? raw : fallback;
            el.textContent = value;
          }

          function hideSpecRowIfUnknown(valueEl) {
            if (!valueEl) return;
            const v = String(valueEl.textContent || '').trim();
            const isUnknown = !v || v === 'Unknown' || v === '–' || v === '-';
            const row = valueEl.closest('.details-spec-row');
            if (row) {
              row.classList.toggle('hidden', isUnknown);
            }
          }

          // Look up spec fields in the Details panel
          const displaySizeEl = document.getElementById(`spec-display-size-${id}`);
          const displayResolutionEl = document.getElementById(`spec-display-resolution-${id}`);
          const displayDensityEl = document.getElementById(`spec-display-density-${id}`);

          const platformOsEl = document.getElementById(`spec-platform-os-${id}`);
          const platformChipsetEl = document.getElementById(`spec-platform-chipset-${id}`);
          const platformCpuEl = document.getElementById(`spec-platform-cpu-${id}`);

          const memoryRamEl = document.getElementById(`spec-memory-ram-${id}`);
          const memoryInternalEl = document.getElementById(`spec-memory-internal-${id}`);

          const batteryTypeEl = document.getElementById(`spec-battery-type-${id}`);

          const miscModelEl = document.getElementById(`spec-misc-model-${id}`);
          const miscBoardEl = document.getElementById(`spec-misc-board-${id}`);
          const miscManufacturerEl = document.getElementById(`spec-misc-manufacturer-${id}`);
          const miscDeviceCodeEl = document.getElementById(`spec-misc-device-${id}`);

          // Defaults: ensure every row shows something after a scan.
          setSpecValue(displaySizeEl, '');
          setSpecValue(displayResolutionEl, '');
          setSpecValue(displayDensityEl, '');
          setSpecValue(platformOsEl, '');
          setSpecValue(platformChipsetEl, '');
          setSpecValue(platformCpuEl, '');
          setSpecValue(memoryRamEl, '');
          setSpecValue(memoryInternalEl, '');
          setSpecValue(batteryTypeEl, '');
          setSpecValue(miscModelEl, '');
          setSpecValue(miscBoardEl, '');
          setSpecValue(miscManufacturerEl, '');
          setSpecValue(miscDeviceCodeEl, '');

          // Display section
          if (screenW && screenH) {
            setSpecValue(displayResolutionEl, `${screenW} x ${screenH} pixels`);
          }

          if (typeof screenDiag === 'number' && typeof screenArea === 'number' && screenDiag > 0 && screenArea > 0) {
            const diagStr = screenDiag.toFixed(1);
            const areaStr = screenArea.toFixed(1);
            setSpecValue(displaySizeEl, `${diagStr} inches, ${areaStr} cm² (approx)`);

            if (screenW && screenH) {
              const diagPx = Math.sqrt(screenW * screenW + screenH * screenH);
              const ppi = diagPx / screenDiag;
              if (ppi > 0) {
                const rounded = Math.round(ppi);
                setSpecValue(displayDensityEl, `~${rounded} ppi (approx)`);
              }
            }
          }

          // Density fallback: use logical lcd density when PPI is not computable.
          if (displayDensityEl && (!displayDensityEl.textContent || displayDensityEl.textContent.trim() === 'Unknown')) {
            const lcd = props['ro.sf.lcd_density'] || props['ro.display.lcd_density'] || '';
            const lcdNum = Number(String(lcd).trim());
            if (!Number.isNaN(lcdNum) && lcdNum > 0) {
              setSpecValue(displayDensityEl, `${lcdNum} dpi (logical)`);
            } else if (typeof data.wmDensityDump === 'string') {
              const wd = data.wmDensityDump;
              const mm = wd.match(/(?:Physical\s+density|Override\s+density):\s*(\d+)/i);
              if (mm && mm[1]) {
                const d = Number(mm[1]);
                if (!Number.isNaN(d) && d > 0) {
                  setSpecValue(displayDensityEl, `${d} dpi (logical)`);
                }
              }
            } else if (typeof data.displayDump === 'string') {
              const dm = data.displayDump.match(/(logicalDensityDpi|densityDpi)=(\d+)/i);
              if (dm && dm[2]) {
                const d = Number(dm[2]);
                if (!Number.isNaN(d) && d > 0) {
                  setSpecValue(displayDensityEl, `${d} dpi (logical)`);
                }
              }
            }
          }

          // Size fallback: approximate diagonal using logical density when physical size isn't available.
          if (displaySizeEl && (!displaySizeEl.textContent || displaySizeEl.textContent.trim() === 'Unknown')) {
            const densityText = displayDensityEl ? String(displayDensityEl.textContent || '') : '';
            const dm = densityText.match(/(\d+)\s*dpi/i);
            const dpi = dm ? Number(dm[1]) : NaN;
            if (screenW && screenH && !Number.isNaN(dpi) && dpi > 0) {
              const diagPx = Math.sqrt(screenW * screenW + screenH * screenH);
              const diagIn = diagPx / dpi;
              if (diagIn > 0.1 && diagIn < 20) {
                setSpecValue(displaySizeEl, `${diagIn.toFixed(1)} inches (approx)`);
              }
            }
          }

          // Platform section
          if (android) {
            setSpecValue(platformOsEl, patch ? `Android ${android} (patch ${patch})` : `Android ${android}`);
          }

          const chipsetPieces = [];
          if (soc) chipsetPieces.push(soc);
          if (board && (!soc || soc.indexOf(board) === -1)) chipsetPieces.push(board);
          if (chipsetPieces.length) {
            setSpecValue(platformChipsetEl, chipsetPieces.join(' · '));
          }

          const cpuText = abiList || abi;
          function cpuFromCpuInfo(raw) {
            const text = typeof raw === 'string' ? raw : '';
            if (!text.trim()) return '';
            const lines = text.split(/\r?\n/);
            function find(prefix) {
              for (const line of lines) {
                const m = line.match(new RegExp('^' + prefix + '\\s*:\\s*(.+)$', 'i'));
                if (m && m[1]) return String(m[1]).trim();
              }
              return '';
            }
            return find('Hardware') || find('model name') || find('Processor') || '';
          }

          const cpuHuman = cpuFromCpuInfo(data.cpuInfoDump);
          const cpuFinal = cpuHuman || cpuText;
          if (cpuFinal) {
            setSpecValue(platformCpuEl, cpuFinal);
          }

          // Memory section
          if (ramText) {
            setSpecValue(memoryRamEl, ramText);
          }
          if (storageText) {
            setSpecValue(memoryInternalEl, storageText);
          }

          // Battery section
          if (batteryTech) {
            setSpecValue(batteryTypeEl, batteryTech);
          } else if (typeof data.batteryDump === 'string') {
            const tm = data.batteryDump.match(/technology:\s*(.+)/i);
            if (tm && tm[1]) {
              setSpecValue(batteryTypeEl, tm[1].trim());
            }
          }

          // Misc section
          const modelLabel = [manufacturer, model].filter(Boolean).join(' ');
          if (modelLabel) {
            setSpecValue(miscModelEl, modelLabel);
          }
          if (board) {
            setSpecValue(miscBoardEl, board);
          }
          if (manufacturer) {
            setSpecValue(miscManufacturerEl, manufacturer);
          }
          if (deviceCode) {
            setSpecValue(miscDeviceCodeEl, deviceCode);
          }

          // Hide only the fields the user requested when Unknown.
          hideSpecRowIfUnknown(platformOsEl);
          hideSpecRowIfUnknown(platformChipsetEl);
          hideSpecRowIfUnknown(miscModelEl);
          hideSpecRowIfUnknown(miscBoardEl);
          hideSpecRowIfUnknown(miscManufacturerEl);
          hideSpecRowIfUnknown(miscDeviceCodeEl);
        }

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

    container.querySelectorAll('.deep-scan').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const deviceEl = btn.closest('.device');
        if (!id || !deviceEl) return;

        const outEl = document.getElementById(`out-${id}`);
        if (outEl) {
          outEl.textContent = 'Running Deep Scan… (this can take ~10-20 seconds)';
        }

        // Deep scan still benefits from the on-device app, but it is not
        // strictly required for host-side ADB health checks.
        let data = null;
        try {
          const res = await fetch(`http://localhost:3333/deep-scan/${encodeURIComponent(id)}?raw=0`);
          data = await res.json();
          if (!res.ok || !data || data.ok === false) {
            const msg = (data && (data.error || data.message)) || `Deep scan failed (HTTP ${res.status})`;
            if (outEl) outEl.textContent = msg;
            return;
          }
        } catch (e) {
          if (outEl) outEl.textContent = 'Deep scan failed: could not reach companion service.';
          return;
        }

        const findings = Array.isArray(data.findings) ? data.findings : [];
        const causes = Array.isArray(data.suspectedCauses) ? data.suspectedCauses : [];
        const summary = (data.summary && typeof data.summary === 'string') ? data.summary : 'Deep scan complete.';
        const health = (data.health && typeof data.health === 'object') ? data.health : {};
        const healthHardware = typeof health.hardware === 'string' ? health.hardware : 'unknown';
        const healthSoftware = typeof health.software === 'string' ? health.software : 'unknown';
        const healthOs = typeof health.os === 'string' ? health.os : 'unknown';

        // Keep a copy of medium/high findings for the advice tooltip.
        if (typeof window.attentionFindingsByDevice === 'undefined') {
          window.attentionFindingsByDevice = {};
        }
        window.attentionFindingsByDevice[id] = findings.filter(f => {
          const sev = (f.severity || 'low').toLowerCase();
          return sev === 'high' || sev === 'medium';
        });

        let highCount = 0;
        let mediumCount = 0;
        let lowCount = 0;
        findings.forEach(f => {
          const sev = (f.severity || 'low').toLowerCase();
          if (sev === 'high') highCount += 1;
          else if (sev === 'medium') mediumCount += 1;
          else lowCount += 1;
        });

        const overallState = highCount > 0 ? 'danger' : mediumCount > 0 ? 'warn' : 'safe';

        // Update the main status badge quickly.
        const statusValueEl = document.getElementById(`status-value-${id}`);
        const statusBadgeEl = document.getElementById(`status-badge-${id}`);
        const statusSubEl = document.getElementById(`status-subtext-${id}`);

        function applyBadge(el, state) {
          if (!el) return;
          el.classList.remove('summary-badge-safe', 'summary-badge-warn', 'summary-badge-danger');
          if (state === 'danger') {
            el.classList.add('summary-badge-danger');
            el.textContent = 'Issue';
          } else if (state === 'warn') {
            el.classList.add('summary-badge-warn');
            el.textContent = 'Warning';
          } else {
            el.classList.add('summary-badge-safe');
            el.textContent = 'Safe';
          }
        }

        if (statusValueEl) {
          statusValueEl.textContent = overallState === 'safe' ? 'All Clear' : 'Attention needed';
        }
        if (statusSubEl) {
          statusSubEl.textContent = `Deep scan: ${highCount} high, ${mediumCount} medium, ${lowCount} low findings.`;
        }
        applyBadge(statusBadgeEl, overallState);

        // Render a readable report inside the device output area.
        const severityIcons = { low: '✓', medium: '⚠', high: '⛔' };
        const categoryIcons = {
          battery: '🔋',
          storage: '💾',
          os: '🧩',
          memory: '🧠',
          logs: '📋',
          generic: '📱',
        };

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
      // Prefer existing message modal from ui.js if available; otherwise fallback to alert.
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
      } catch {
        // ignore and fallback
      }
      try {
        alert(`${title || 'Wi‑Fi'}\n\n${message || ''}`);
      } catch {
        // ignore
      }
    }

    container.querySelectorAll('.wifi').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const deviceEl = btn.closest('.device');
        if (!id || !deviceEl) return;

        const outEl = document.getElementById(`out-${id}`);
        const prev = outEl ? outEl.textContent : '';
        if (outEl) outEl.textContent = 'Running Wi‑Fi stability diagnostics…';

        let data = null;
        try {
          const res = await fetch(`http://localhost:3333/wifi/diagnose/${encodeURIComponent(id)}`, { cache: 'no-store' });
          data = await res.json().catch(() => null);
          if (!res.ok || !data || data.ok === false) {
            const msg = (data && (data.error || data.message)) || `Wi‑Fi diagnostics failed (HTTP ${res.status})`;
            if (outEl) outEl.textContent = msg;
            await showWifiModalOrAlert({
              title: '📶 Wi‑Fi',
              subtitle: 'Diagnostics failed',
              message: msg,
            });
            return;
          }
        } catch {
          const msg = 'Wi‑Fi diagnostics failed: could not reach companion service.';
          if (outEl) outEl.textContent = msg;
          await showWifiModalOrAlert({ title: '📶 Wi‑Fi', subtitle: 'Diagnostics failed', message: msg });
          return;
        }

        const report = formatWifiReport(data);
        if (outEl) outEl.textContent = prev || 'Wi‑Fi diagnostics complete.';

        const stable = !!(data && data.stability && data.stability.stable);
        const verdict = (data && data.stability && data.stability.verdict) ? String(data.stability.verdict) : (stable ? 'Stable' : 'Unstable');
        const subtitle = verdict === 'Not connected' ? 'Not connected' : (stable ? 'Stable' : 'Unstable / needs attention');
        await showWifiModalOrAlert({
          title: '📶 Wi‑Fi Stability',
          subtitle,
          message: report,
        });

        // No automatic fixes. Offer explicit user choice if any fix is relevant.
        const tests = (data && data.ping && Array.isArray(data.ping.tests)) ? data.ping.tests : [];
        const tIp1 = tests.find(t => t && t.target === '1.1.1.1');
        const tIp2 = tests.find(t => t && t.target === '8.8.8.8');
        const tDns = tests.find(t => t && t.target === 'dns.google');
        const ipOk = (tIp1 && tIp1.ok === true) || (tIp2 && tIp2.ok === true);
        const dnsBad = tDns && tDns.ok === false;

        const phoneFixAvailable = !stable && verdict !== 'Not connected';
        if (!phoneFixAvailable) return;

        const runPhoneFix = async () => {
          try {
            const fixRes = await fetch(`http://localhost:3333/wifi/fix/${encodeURIComponent(id)}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'dhcp_renew' }),
              },
            );
            const fixData = await fixRes.json().catch(() => null);
            if (!fixRes.ok || !fixData || fixData.ok === false) {
              const msg = (fixData && (fixData.error || fixData.message)) || `Fix failed (HTTP ${fixRes.status})`;
              await showWifiModalOrAlert({ title: '📶 Wi‑Fi Fix', subtitle: 'Failed', message: msg });
              return;
            }
            await showWifiModalOrAlert({
              title: '📶 Wi‑Fi Fix',
              subtitle: 'Done',
              message: 'Renew attempted. Wait ~10 seconds, then run Wi‑Fi diagnostics again.',
            });
          } catch {
            await showWifiModalOrAlert({ title: '📶 Wi‑Fi Fix', subtitle: 'Failed', message: 'Fix failed: could not reach companion service.' });
          }
        };

        let doPhone = false;
        try {
          doPhone = confirm('Run Fix: PHONE Wi‑Fi renew/reconnect (will toggle Wi‑Fi)?');
        } catch {
          doPhone = false;
        }
        if (doPhone) await runPhoneFix();
      });
    });

    container.querySelectorAll('.apps').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const deviceEl = btn.closest('.device');
        if (!id || !deviceEl) return;

        // Mark Apps & Security scan as in progress for this device so
        // the main diagnostic handler doesn't show a partial Security
        // result while the deeper app scan is still running.
        if (typeof window.securityScanInProgress === 'undefined') {
          window.securityScanInProgress = {};
        }
        window.securityScanInProgress[id] = true;

        // Show loading state
        if (typeof ensureDiagStepsContainer === 'function' && typeof setDiagStatus === 'function') {
          ensureDiagStepsContainer(id);
          setDiagStatus(id, 'security', 'running');

          const descEl = document.querySelector(
            `#diag-steps-${id} .diag-step[data-step="security"] .diag-step-desc`,
          );
          if (descEl) {
            descEl.textContent =
              'Scanning installed apps for threats... This usually takes 5-15 seconds.';
          }
        }

        // Outer-scope variable so both fast and deep scan sections can use it
        let suspiciousApps = [];

        // ── STEP 1: Fast suspicious apps scan (5-15 seconds) ──
        // This runs FIRST so the user sees results quickly
        try {
          console.log('[Security] Starting fast suspicious apps scan...');
          const fastRes = await fetch(`http://localhost:3333/suspicious-apps/${id}`);
          const fastData = await fastRes.json();
          suspiciousApps = Array.isArray(fastData.suspiciousApps) ? fastData.suspiciousApps : [];

          // Store suspicious apps globally for advice system
          if (typeof window.suspiciousAppsByDevice === 'undefined') {
            window.suspiciousAppsByDevice = {};
          }
          window.suspiciousAppsByDevice[id] = suspiciousApps;

          console.log(`[Security] Fast scan complete! Found ${suspiciousApps.length} suspicious app(s) out of ${fastData.totalApps || '?'} total.`);
          if (suspiciousApps.length > 0) {
            suspiciousApps.forEach((app, index) => {
              console.log(`  ${index + 1}. ${app.displayName} (${app.packageName}) - ${app.threatLevel} risk`);
            });
          }

          // Update security badge immediately with fast scan results
          // only when a full diagnostic is not currently running.
          const fullDiagActiveFast =
            typeof window.fullDiagInProgress === 'object' &&
            window.fullDiagInProgress &&
            window.fullDiagInProgress[id];

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
                secFastBadgeEl.textContent = 'Issue';
              } else {
                secFastBadgeEl.classList.add('summary-badge-warn');
                secFastBadgeEl.textContent = 'Warning';
              }
            }
            if (secFastValueEl) secFastValueEl.textContent = highSusp > 0 ? 'High Risk' : 'Moderate';
            if (secFastSubEl) secFastSubEl.textContent = `${suspiciousApps.length} suspicious app(s): ${highSusp} high, ${medSusp} medium, ${lowSusp} low risk.`;
          }
        } catch (fastErr) {
          console.error('[Security] Fast suspicious scan failed:', fastErr);
        }

        // ── STEP 2: Full deep scan (slow, runs in background) ──
        const descEl2 = document.querySelector(
          `#diag-steps-${id} .diag-step[data-step="security"] .diag-step-desc`,
        );
        if (descEl2) {
          descEl2.textContent =
            'Suspicious apps identified! Now running deep APK analysis in background...';
        }

        let res;
        let data;
        try {
          res = await fetch(`http://localhost:3333/apps/${id}`);
          data = await res.json().catch(() => ({}));
        } catch (e) {
          const msg = e && e.message ? e.message : String(e);
          const hint = isLikelyDeviceDisconnectedError(msg)
            ? 'Apps scan failed because the device disconnected/shut down. Plug in power and reconnect USB, then retry.'
            : `Apps scan failed: ${msg}`;
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
            ? 'Apps scan failed because the device disconnected/shut down. Plug in power and reconnect USB, then retry.'
            : `Apps scan failed: ${msg}`;
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

        // Update suspicious apps with the full scan results (may have more info)
        const fullSuspicious = Array.isArray(data.suspiciousApps) ? data.suspiciousApps : [];
        if (fullSuspicious.length > 0) {
          window.suspiciousAppsByDevice[id] = fullSuspicious;
          // Prefer the more detailed suspicious-apps list from the full
          // deep scan when available so all summaries stay consistent.
          suspiciousApps = fullSuspicious;
        }

        let safeCount = 0;
        let moderateCount = 0;
        let riskyCount = 0;

        const lines = [];
        let index = 1;

        const riskyAppsList = [];
        const moderateAppsList = [];
        const safeAppsList = [];

        for (const app of apps) {
          const pkgName = app.packageName || '';
          const raw = app.raw || '';

          let risk = pkgName && riskByPkg[pkgName] ? riskByPkg[pkgName] : '';

          if (risk === 'unknown' && pkgName && permsByPkg[pkgName]) {
            const perms = permsByPkg[pkgName] || [];
            const upper = perms.map(p => p.toUpperCase());

            const RISKY_PERMISSIONS = [
              'BIND_ACCESSIBILITY_SERVICE',
              'RECEIVE_SMS',
              'READ_SMS',
              'READ_CALL_LOG',
              'WRITE_SETTINGS',
              'SYSTEM_ALERT_WINDOW',
              'DEVICE_ADMIN',
            ];

            const MODERATE_PERMISSIONS = [
              'READ_CONTACTS',
              'WRITE_CONTACTS',
              'GET_ACCOUNTS',
              'ACCESS_FINE_LOCATION',
              'ACCESS_COARSE_LOCATION',
              'RECORD_AUDIO',
              'CAMERA',
              'READ_CALL_LOG',
              'WRITE_CALL_LOG',
              'READ_PHONE_STATE',
              'CALL_PHONE',
              'READ_EXTERNAL_STORAGE',
              'WRITE_EXTERNAL_STORAGE',
              'MANAGE_EXTERNAL_STORAGE',
            ];

            const hasRisky = upper.some(p => RISKY_PERMISSIONS.some(r => p.indexOf(r) !== -1));
            const hasModerate = upper.some(p => MODERATE_PERMISSIONS.some(m => p.indexOf(m) !== -1));

            if (hasRisky) {
              risk = 'risky';
            } else if (hasModerate) {
              risk = 'moderate';
            } else {
              risk = 'safe';
            }
          }

          if (!risk) {
            risk = 'safe';
          }

          const label =
            risk === 'safe'
              ? 'SAFE'
              : risk === 'moderate'
                ? 'MODERATE'
                : 'RISKY';

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
            displayName = displayName.replace(/\b\w/g, function (c) {
              return c.toUpperCase();
            });
          }

          const score = pkgName && typeof riskScoreByPkg[pkgName] === 'number' ? riskScoreByPkg[pkgName] : 0;

          const entry = {
            name: displayName,
            packageName: pkgName,
            score,
            label,
          };

          if (risk === 'safe') {
            safeCount += 1;
            safeAppsList.push(entry);
          } else if (risk === 'moderate') {
            moderateCount += 1;
            moderateAppsList.push(entry);
          } else if (risk === 'risky') {
            riskyCount += 1;
            riskyAppsList.push(entry);
          }

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

        // Optionally also run a file scan here so that, even if the
        // dedicated background file scan helper is not called, the
        // security summary still includes basic file statistics.
        let fileScan = null;
        try {
          const resFiles = await fetch(`http://localhost:3333/file-scan/${encodeURIComponent(id)}`);
          if (resFiles.ok) {
            fileScan = await resFiles.json();
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('file-scan from apps handler failed:', e);
        }

        const filesScanned = fileScan && typeof fileScan.totalFiles === 'number' ? fileScan.totalFiles : null;
        const suspiciousFiles = fileScan && typeof fileScan.suspiciousFiles === 'number' ? fileScan.suspiciousFiles : null;
        const suspiciousSamples = fileScan && Array.isArray(fileScan.suspiciousSamples)
          ? fileScan.suspiciousSamples
          : [];

        const touchSummary = data.touchSummary || null;

        // Cache security scan summary so the main diagnostic result can
        // merge it once /collect has completed.
        if (typeof securityScanByDevice !== 'undefined') {
          // Build per-level lists from suspicious apps only so the
          // detailed UI does not list hundreds of safe packages.
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
            appsByRisk: {
              risky: suspiciousHighList,
              moderate: suspiciousMediumList,
              safe: suspiciousLowList,
            },
            suspiciousApps: finalSuspicious,
            suspiciousHigh,
            suspiciousMedium,
            suspiciousLow,
            suspiciousTotal,
            lines,
            summary,
          };
        }

        // If a diagnostic record is already pending for this device,
        // update its Apps & Security section so the modal shows real
        // counts and per-risk app lists even if /apps finishes after
        // the main /collect pipeline.
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
              filesScanned:
                existingSec.filesScanned != null ? existingSec.filesScanned : filesScanned,
              suspiciousFiles:
                existingSec.suspiciousFiles != null ? existingSec.suspiciousFiles : suspiciousFiles,
              appsByRisk: {
                risky: riskyAppsList,
                moderate: moderateAppsList,
                safe: safeAppsList,
              },
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
            const secOk =
              riskyCount === 0 &&
              moderateCount === 0 &&
              ((diagDetails.security && diagDetails.security.suspiciousFiles) || 0) === 0 &&
              suspiciousTotal === 0;

            diagStages.security = {
              ok: secOk,
              label: secOk ? 'Apps look clean' : 'Apps need attention',
              details: summary,
            };

            if (touchSummary) {
              const touchOk = !!touchSummary.ok;
              diagStages.touch = {
                ok: touchOk,
                label: touchOk
                  ? 'No clear touch-driver or input anomalies'
                  : 'Possible touch / ghost touch issues',
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

            // If the backend already auto-saved the initial /collect snapshot,
            // persist this merged Apps & Security result back into history so
            // the History tab shows suspicious/unsafe apps.
            try {
              const autoSaved = record && record.autoSavedHistory ? record.autoSavedHistory : null;
              const runId =
                autoSaved && autoSaved.ok && Number.isFinite(Number(autoSaved.runId))
                  ? Number(autoSaved.runId)
                  : null;

              if (runId) {
                if (record.timestamp !== runId) {
                  record.timestamp = runId;
                  record.id = runId;
                }

                const cacheKey = `${String(id)}:${String(runId)}`;
                if (!finalizedHistoryRuns.has(cacheKey)) {
                  finalizedHistoryRuns.add(cacheKey);

                  let localToken = '';
                  try {
                    localToken = String(localStorage.getItem('smarthub.auth.localSessionToken') || '').trim();
                  } catch {
                    localToken = '';
                  }

                  const saveHeaders = { 'Content-Type': 'application/json' };
                  if (localToken) {
                    saveHeaders.Authorization = `Bearer ${localToken}`;
                  }

                  fetch(`http://localhost:3333/history/${encodeURIComponent(id)}`, {
                    method: 'POST',
                    headers: saveHeaders,
                    body: JSON.stringify(record),
                  })
                    .then(async (resp) => {
                      if (!resp.ok) {
                        const body = await resp.json().catch(() => null);
                        const reason = (body && (body.error || body.message))
                          ? String(body.error || body.message)
                          : `HTTP ${resp.status}`;
                        throw new Error(reason);
                      }
                    })
                    .then(() => {
                      if (typeof renderHistoryList === 'function') {
                        Promise.resolve(renderHistoryList(id)).catch(() => {});
                      }
                      if (typeof window !== 'undefined' && typeof window.renderHistoryBrowserModal === 'function') {
                        Promise.resolve(window.renderHistoryBrowserModal({ preserveOpen: true })).catch(() => {});
                      }
                    })
                    .catch((e) => {
                      // eslint-disable-next-line no-console
                      console.error('Failed to finalize auto-saved history run', e);
                    });
                }
              }
            } catch (e) {
              // best-effort only
            }
          }
        }

        // Update security badge to reflect suspicious apps found.
        // When a full diagnostic is running for this device, we defer
        // showing the final Security result until diagnostics finish
        // (handled in diagnostics.js). For standalone Apps & Security
        // scans, we still update immediately.
        const fullDiagActive =
          typeof window.fullDiagInProgress === 'object' &&
          window.fullDiagInProgress &&
          window.fullDiagInProgress[id];

        const securityValueEl = document.getElementById(`security-value-${id}`);
        const securityBadgeEl = document.getElementById(`security-badge-${id}`);
        const securitySubEl = document.getElementById(`security-subtext-${id}`);

        if (!fullDiagActive) {
          if (suspiciousApps.length > 0) {
            const highSuspicious = suspiciousApps.filter(app => app.threatLevel === 'high').length;
            const mediumSuspicious = suspiciousApps.filter(app => app.threatLevel === 'medium').length;
            const lowSuspicious = suspiciousApps.filter(app => app.threatLevel === 'low').length;

            // Update badge based on highest threat level
            if (securityBadgeEl) {
              securityBadgeEl.classList.remove('summary-badge-safe', 'summary-badge-warn', 'summary-badge-danger');
              if (highSuspicious > 0) {
                securityBadgeEl.classList.add('summary-badge-danger');
                securityBadgeEl.textContent = 'Issue';
                if (securityValueEl) securityValueEl.textContent = 'High Risk';
              } else if (mediumSuspicious > 0) {
                securityBadgeEl.classList.add('summary-badge-warn');
                securityBadgeEl.textContent = 'Warning';
                if (securityValueEl) securityValueEl.textContent = 'Moderate';
              } else {
                securityBadgeEl.classList.add('summary-badge-warn');
                securityBadgeEl.textContent = 'Warning';
                if (securityValueEl) securityValueEl.textContent = 'Low Risk';
              }
            }

            // Update subtext to show suspicious app counts
            if (securitySubEl) {
              securitySubEl.textContent = `${suspiciousApps.length} suspicious app(s): ${highSuspicious} high, ${mediumSuspicious} medium, ${lowSuspicious} low risk.`;
            }

            console.log('[Apps Scan] Updated security badge with suspicious apps:', {
              total: suspiciousApps.length,
              high: highSuspicious,
              medium: mediumSuspicious,
              low: lowSuspicious,
              deviceId: id
            });
          } else if (riskyCount > 0 || moderateCount > 0) {
            // No suspicious apps but risky permissions found
            if (securityValueEl) securityValueEl.textContent = riskyCount > 0 ? 'Moderate' : 'Low Risk';
            if (securitySubEl) {
              securitySubEl.textContent = `${apps.length} apps scanned. ${riskyCount} risky, ${moderateCount} moderate permissions detected.`;
            }
          } else {
            // All clear
            if (securityBadgeEl) {
              securityBadgeEl.classList.remove('summary-badge-safe', 'summary-badge-warn', 'summary-badge-danger');
              securityBadgeEl.classList.add('summary-badge-safe');
              securityBadgeEl.textContent = 'Safe';
            }
            if (securityValueEl) securityValueEl.textContent = 'All Clear';
            if (securitySubEl) {
              securitySubEl.textContent = `${apps.length} apps scanned. No security threats detected.`;
            }
          }
        }

        // Apps & Security scan is finished for this device; allow
        // future diagnostics to update the Security summary again.
        if (typeof window.securityScanInProgress === 'object' && window.securityScanInProgress) {
          window.securityScanInProgress[id] = false;
        }
      });
    });

    container.querySelectorAll('.app-risk').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const pkg = prompt('Enter exact package name to check (e.g. com.example.app):');
        if (!pkg) return;
        try {
          const res = await fetch(`http://localhost:3333/app-risk/${id}/${encodeURIComponent(pkg)}`);
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const data = await res.json();
          const risk = data.risk || 'unknown';
          const label =
            risk === 'safe'
              ? 'SAFE'
              : risk === 'moderate'
                ? 'MODERATE'
                : risk === 'dangerous'
                  ? 'DANGEROUS'
                  : 'UNKNOWN';

          const detailsLines = [];
          if (Array.isArray(data.riskyPermissions) && data.riskyPermissions.length) {
            detailsLines.push('Risky permissions: ' + data.riskyPermissions.join(', '));
          }
          if (Array.isArray(data.moderatePermissions) && data.moderatePermissions.length) {
            detailsLines.push('Sensitive permissions: ' + data.moderatePermissions.join(', '));
          }
          // Detailed single-app risk is not rendered in the UI while logs are hidden
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
      container.innerHTML = `<div class="status-banner"><div class="status-icon">⟳</div><div><strong>Loading, please wait…</strong><br/>Trying to refresh device list. If nothing appears after a few seconds, click "Refresh devices".</div></div>`;

      // If we are running inside the Windows companion app (WebView2), ask
      // the host shell to ensure the backend service is running, then retry
      // the device refresh once after a short delay. In a normal browser
      // this is a no-op and the offline banner simply stays visible.
      try {
        if (window.chrome && window.chrome.webview && typeof window.chrome.webview.postMessage === 'function') {
          window.chrome.webview.postMessage({ type: 'ensureBackend' });
          setTimeout(() => {
            try {
              refresh();
            } catch (e2) {
              // eslint-disable-next-line no-console
              console.error('Retrying device refresh after ensureBackend failed:', e2);
            }
          }, 3000);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to request backend start from host shell:', e);
      }
    } else {
      container.innerHTML = `<div class="status-banner error"><div class="status-icon">!</div><div><strong>Could not load devices from backend</strong><br/>${msg}.<br/>Verify that the companion service is running on <strong>http://localhost:3333</strong> and that <code>adb</code> is installed and available on PATH.</div></div>`;
    }
  }
}

// Expose refresh so other scripts (like language switching) can re-render.
try {
  window.refreshDevices = refresh;
} catch {
  // ignore
}
