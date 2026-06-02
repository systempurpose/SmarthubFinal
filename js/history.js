const pendingResults = {};
const currentRuns = {};
// Holds per-device app security scan summaries until the main diagnostic
// result is assembled. Populated by the /apps scan handler.
const securityScanByDevice = {};

const HISTORY_BSOD_DEFAULT_KEY = 'bsod-usb-only';
const BSOD_HISTORY_KEYS_STORAGE = 'smarthub.bsod.history.deviceKeys';
const PHONE_NAME_MAP_STORAGE = 'smarthub.history.phoneNameByDeviceId';
const HISTORY_MODAL_STATE = {
  filter: 'all',
  runs: [],
};

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeHistoryType(value) {
  const v = String(value || '').toLowerCase().trim();
  if (v === 'bsod') return 'bsod';
  if (v === 'adb') return 'adb';
  if (v.includes('bsod')) return 'bsod';
  if (v.includes('usb_only')) return 'bsod';
  if (v.includes('usb-only')) return 'bsod';
  if (v.includes('adb')) return 'adb';
  return '';
}

function getHistoryTypeForRun(run) {
  if (!run || typeof run !== 'object') return 'adb';

  const fromField = normalizeHistoryType(run.historyType);
  if (fromField) return fromField;

  const stages = run.diagStages && typeof run.diagStages === 'object' ? run.diagStages : null;
  if (stages && (stages.usbOnlyBsod || stages.bsodUsbOnly || stages.bsod_only)) {
    return 'bsod';
  }

  const details = run.diagDetails && typeof run.diagDetails === 'object' ? run.diagDetails : null;
  if (details && (details.usbOnlyBsod || details.bsodUsbOnly || details.bsod_only)) {
    return 'bsod';
  }

  const report = String(run.textReport || '').toLowerCase();
  if (report.includes('usb-only bsod') || (report.includes('bsod') && report.includes('usb-only'))) {
    return 'bsod';
  }

  return 'adb';
}

function getHistoryTypeLabel(type) {
  return type === 'bsod' ? 'BSOD' : 'ADB';
}

function rememberBsodHistoryKey(deviceId) {
  const key = String(deviceId || '').trim();
  if (!key) return;
  try {
    const raw = localStorage.getItem(BSOD_HISTORY_KEYS_STORAGE);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed)
      ? parsed.map(v => String(v || '').trim()).filter(Boolean)
      : [];
    if (!list.includes(key)) {
      list.unshift(key);
    }
    localStorage.setItem(BSOD_HISTORY_KEYS_STORAGE, JSON.stringify(list.slice(0, 30)));
  } catch {
    // ignore
  }
}

function getRememberedBsodHistoryKeys() {
  try {
    const raw = localStorage.getItem(BSOD_HISTORY_KEYS_STORAGE);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(v => String(v || '').trim())
      .filter(Boolean)
      .slice(0, 30);
  } catch {
    return [];
  }
}

function getDeviceLabelFromEl(deviceEl) {
  if (!deviceEl) return 'Phone connected';

  const sourceId = deviceEl && deviceEl.dataset ? String(deviceEl.dataset.id || '').trim() : '';
  const remember = (name) => {
    const n = String(name || '').trim();
    if (!sourceId || !n || isGenericPhoneLabel(n) || looksLikeDeviceSerial(n)) return;
    rememberPhoneNameByDeviceId(sourceId, n);
  };

  try {
    const modelValueEl = sourceId ? document.getElementById(`spec-misc-model-${sourceId}`) : null;
    const modelValue = modelValueEl && modelValueEl.textContent ? String(modelValueEl.textContent).trim() : '';
    if (modelValue && modelValue !== '–' && !isGenericPhoneLabel(modelValue) && !looksLikeDeviceSerial(modelValue)) {
      remember(modelValue);
      return modelValue;
    }
  } catch {
    // ignore
  }

  const h3 = deviceEl.querySelector('.device-title h3') || deviceEl.querySelector('h3');
  const heading = h3 && h3.textContent ? String(h3.textContent).trim() : '';
  const normalizedHeading = normalizePhoneName(heading);
  if (normalizedHeading && !isGenericPhoneLabel(normalizedHeading) && !looksLikeDeviceSerial(normalizedHeading)) {
    remember(normalizedHeading);
    return normalizedHeading;
  }

  const cached = sourceId ? getStoredPhoneNameByDeviceId(sourceId) : '';
  if (cached) return cached;

  return 'Phone connected';
}

function isGenericPhoneLabel(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return true;
  return v === 'phone connected' || v === 'unknown' || v === 'unknown device' || v === 'no phone detected';
}

function looksLikeDeviceSerial(value) {
  const v = String(value || '').trim();
  if (!v) return false;
  if (/^[a-f0-9]{12,}$/i.test(v)) return true;
  if (/^[0-9]{10,}$/.test(v)) return true;
  if (/^[a-z0-9:_-]{14,}$/i.test(v) && !/[\s]/.test(v)) return true;
  return false;
}

function normalizePhoneName(value) {
  let text = String(value || '').trim();
  if (!text) return '';

  text = text.replace(/\s*\((?:[a-z0-9:_-]+\s*,\s*)?(?:device|unauthorized|offline|bootloader)\)\s*$/i, '').trim();
  text = text.replace(/\s*[•·]\s*device\b.*$/i, '').trim();
  text = text.replace(/\((?:[a-z0-9:_-]{8,}|device|unauthorized|offline|bootloader)[^)]*\)\s*$/i, '').trim();
  text = text.replace(/\s+(?:device|unauthorized|offline|bootloader)\s*$/i, '').trim();
  text = text.replace(/\s+[a-z0-9:_-]{12,}\s*$/i, '').trim();

  return text;
}

function readPhoneNameMap() {
  try {
    const raw = localStorage.getItem(PHONE_NAME_MAP_STORAGE);
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return {};
}

function rememberPhoneNameByDeviceId(deviceId, phoneName) {
  const id = String(deviceId || '').trim();
  const name = normalizePhoneName(phoneName);
  if (!id || !name || isGenericPhoneLabel(name) || looksLikeDeviceSerial(name)) return;

  try {
    const map = readPhoneNameMap();
    map[id] = name;
    localStorage.setItem(PHONE_NAME_MAP_STORAGE, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function getStoredPhoneNameByDeviceId(deviceId) {
  const id = String(deviceId || '').trim();
  if (!id) return '';
  const map = readPhoneNameMap();
  const value = map && typeof map[id] === 'string' ? String(map[id]).trim() : '';
  if (!value || isGenericPhoneLabel(value) || looksLikeDeviceSerial(value)) return '';
  return value;
}

function getConnectedPhoneNameByDeviceId(deviceId) {
  const id = String(deviceId || '').trim();
  if (!id) return '';

  try {
    const cards = Array.from(document.querySelectorAll('.device'));
    const card = cards.find(el => el && el.dataset && String(el.dataset.id || '').trim() === id);
    if (!card) return '';

    const modelValueEl = document.getElementById(`spec-misc-model-${id}`);
    const modelValue = modelValueEl && modelValueEl.textContent ? String(modelValueEl.textContent).trim() : '';
    if (modelValue && modelValue !== '–' && !isGenericPhoneLabel(modelValue) && !looksLikeDeviceSerial(modelValue)) {
      rememberPhoneNameByDeviceId(id, modelValue);
      return modelValue;
    }

    const headingEl = card.querySelector('.device-title h3') || card.querySelector('h3');
    const heading = headingEl && headingEl.textContent ? String(headingEl.textContent).trim() : '';
    const normalized = normalizePhoneName(heading);
    if (normalized && !isGenericPhoneLabel(normalized) && !looksLikeDeviceSerial(normalized)) {
      rememberPhoneNameByDeviceId(id, normalized);
      return normalized;
    }
  } catch {
    // ignore
  }

  return '';
}

function getRunPhoneDisplayName(run, sourceDeviceId = '') {
  const details = run && run.diagDetails && run.diagDetails.usbOnlyBsod && typeof run.diagDetails.usbOnlyBsod === 'object'
    ? run.diagDetails.usbOnlyBsod
    : {};

  const candidates = [
    run && run.phoneName,
    details.phoneName,
    run && run.deviceLabel,
    details.phoneDetectedLabel,
  ];

  for (const candidate of candidates) {
    const raw = String(candidate || '').trim();
    if (!raw) continue;
    if (/^(phone connected|no phone detected|unknown)$/i.test(raw)) continue;
    const normalized = normalizePhoneName(raw);
    if (!normalized) continue;
    if (looksLikeDeviceSerial(normalized)) continue;
    if (sourceDeviceId) rememberPhoneNameByDeviceId(sourceDeviceId, normalized);
    return normalized;
  }

  const connected = getConnectedPhoneNameByDeviceId(sourceDeviceId);
  if (connected) return connected;

  const stored = getStoredPhoneNameByDeviceId(sourceDeviceId);
  if (stored) return stored;

  const source = String(sourceDeviceId || '').trim();
  if (source && !looksLikeDeviceSerial(source)) {
    const normalizedSource = normalizePhoneName(source);
    if (normalizedSource) return normalizedSource;
  }

  const fallback = String(details.phoneDetectedLabel || '').trim();
  if (fallback && /^(phone connected|no phone detected)$/i.test(fallback)) {
    return fallback;
  }

  return 'Phone connected';
}

async function fetchHistory(deviceId) {
  let token = '';
  try {
    token = String(localStorage.getItem('smarthub.auth.localSessionToken') || '').trim();
  } catch {
    token = '';
  }

  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`http://localhost:3333/history/${encodeURIComponent(deviceId)}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.runs) ? data.runs : [];
}

function formatHistoryIssueSummary(run) {
  const c = run && run.counts && typeof run.counts === 'object' ? run.counts : {};
  const high = Number(c.high || 0);
  const medium = Number(c.medium || 0);
  if (high + medium > 0) {
    return `${high + medium} issue(s)`;
  }
  return 'All categories OK';
}

function splitRecommendedActions(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  return raw
    .split(/\s*\|\s*/)
    .map(item => String(item || '').trim())
    .filter(Boolean);
}

function parseBsodReportText(reportText) {
  const report = String(reportText || '').trim();
  const out = {
    summary: '',
    phoneDetected: '',
    bsodDetected: '',
    onlineAiUsed: '',
    primaryReason: '',
    reasonDetail: '',
    confidence: '',
    actions: [],
  };

  if (!report) return out;

  const lines = report
    .split(/\r?\n/)
    .map(line => String(line || '').trim())
    .filter(Boolean);

  lines.forEach(line => {
    const lower = line.toLowerCase();
    if (lower.startsWith('summary:')) {
      out.summary = line.slice(8).trim();
      return;
    }
    if (lower.startsWith('phone detected:')) {
      out.phoneDetected = line.slice(15).trim();
      return;
    }
    if (lower.startsWith('bsod detected:')) {
      out.bsodDetected = line.slice(14).trim();
      return;
    }
    if (
      lower.startsWith('online ai used:') ||
      lower.startsWith('built-in ai used:') ||
      lower.startsWith('built in ai used:') ||
      lower.startsWith('builtin ai used:')
    ) {
      out.onlineAiUsed = line.split(':').slice(1).join(':').trim();
      return;
    }
    if (lower.startsWith('primary reason:')) {
      out.primaryReason = line.slice(15).trim();
      return;
    }
    if (lower.startsWith('reason detail:')) {
      out.reasonDetail = line.slice(14).trim();
      return;
    }
    if (lower.startsWith('confidence:')) {
      out.confidence = line.slice(11).trim();
      return;
    }
    if (lower.startsWith('recommended actions:')) {
      out.actions = splitRecommendedActions(line.slice(20));
    }
  });

  if (!out.summary) {
    const fallback = lines.find(line => !/^bsod usb-only diagnostic$/i.test(line));
    out.summary = fallback || '';
  }

  return out;
}

function normalizeConfidence(value) {
  const v = String(value || '').toLowerCase().trim();
  if (v === 'high') return 'high';
  if (v === 'medium') return 'medium';
  if (v === 'low') return 'low';
  return 'unknown';
}

function normalizeOnlineAiUsed(value) {
  if (value === true) return true;
  if (value === false) return false;
  const v = String(value || '').trim().toLowerCase();
  if (!v) return null;
  if (v.startsWith('yes')) return true;
  if (v.startsWith('no')) return false;
  return null;
}

function toTitleCaseWord(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function dedupeLines(items) {
  const seen = new Set();
  const list = [];
  (Array.isArray(items) ? items : []).forEach(item => {
    const value = String(item || '').trim();
    if (!value) return;
    if (seen.has(value)) return;
    seen.add(value);
    list.push(value);
  });
  return list;
}

function normalizeBsodVerdictFromText(value) {
  const v = String(value || '').toLowerCase().trim();
  if (!v) return 'Unknown';
  if (v === 'true' || v.startsWith('yes') || /\bbsod\s*detected\b/.test(v)) return 'Yes';
  if (v === 'false' || v.startsWith('no') || /\bnot bsod\b/.test(v) || /\bno deep boot failure\b/.test(v)) return 'No';
  if (/\bunknown\b/.test(v) || /\binconclusive\b/.test(v)) return 'Unknown';
  return 'Unknown';
}

function inferPhoneDetectedLabel(run, details, parsed) {
  const explicit =
    (details.phoneDetectedLabel && String(details.phoneDetectedLabel).trim())
    || (details.phoneName && String(details.phoneName).trim())
    || (parsed.phoneDetected && String(parsed.phoneDetected).trim());
  if (explicit) {
    const normalized = normalizePhoneName(explicit);
    if (normalized && !looksLikeDeviceSerial(normalized)) return normalized;
    if (/^(phone connected|no phone detected|unknown)$/i.test(String(explicit).trim())) {
      return String(explicit).trim();
    }
  }

  const runLabel = run && run.deviceLabel ? String(run.deviceLabel).trim() : '';
  if (runLabel && !/^bsod usb-only run$/i.test(runLabel)) {
    const normalized = normalizePhoneName(runLabel);
    if (normalized && !looksLikeDeviceSerial(normalized)) return normalized;
  }

  const merged = [
    details.deviceLine || '',
    details.connectionLine || '',
    details.outcomeLine || '',
    parsed.summary || '',
    run && run.textReport ? String(run.textReport) : '',
  ].join(' ').toLowerCase();

  if (/no phone detected|no usb visibility|cannot confirm phone presence|no usable usb signal/.test(merged)) {
    return 'No phone detected';
  }
  if (/phone visible|phone detected|phone connected|mtp|adb|fastboot|portable\/mtp|usb connection is present|device is connected/.test(merged)) {
    return 'Phone connected';
  }
  return 'Unknown';
}

function inferBsodVerdict(run, details, parsed) {
  const statusText = details && typeof details.bsodStatusText === 'string'
    ? String(details.bsodStatusText).trim()
    : '';

  if (details && typeof details.wasBsod === 'boolean') {
    return {
      verdict: details.wasBsod ? 'Yes' : 'No',
      statusText,
    };
  }

  const explicitText =
    (details.bsodVerdict && String(details.bsodVerdict).trim())
    || (parsed.bsodDetected && String(parsed.bsodDetected).trim())
    || '';
  if (explicitText) {
    const verdict = normalizeBsodVerdictFromText(explicitText);
    if (verdict !== 'Unknown') {
      return {
        verdict,
        statusText,
      };
    }
  }

  const merged = [
    statusText,
    details.outcomeLine || '',
    parsed.summary || '',
    run && run.textReport ? String(run.textReport) : '',
  ].join(' ').toLowerCase();

  if (/\bnot bsod\b|\bno deep boot failure\b|\bno symptoms of bsod\b|\blooks normal\b|\bnot seen\b/.test(merged)) {
    return {
      verdict: 'No',
      statusText: statusText || 'No deep boot failure evidence',
    };
  }

  if (/phone visible as storage|mtp but not to adb|device is connected \(mtp\)|adb not enabled\/authorized/.test(merged)) {
    return {
      verdict: 'No',
      statusText: statusText || 'Phone connected over MTP; no direct BSOD signal',
    };
  }

  if (/\bbsod\s*-\s*ui freeze\b|\bbsod\s*detected\b|\bui freeze detected\b/.test(merged)) {
    return {
      verdict: 'Yes',
      statusText: statusText || 'BSOD-style freeze detected',
    };
  }

  if (/\binconclusive\b|\bunknown\b|\bcannot assess\b|\bcannot confirm\b/.test(merged)) {
    return {
      verdict: 'Unknown',
      statusText: statusText || 'Inconclusive',
    };
  }

  return {
    verdict: 'Unknown',
    statusText,
  };
}

function buildBsodHistoryViewModel(run) {
  const details = run && run.diagDetails && run.diagDetails.usbOnlyBsod && typeof run.diagDetails.usbOnlyBsod === 'object'
    ? run.diagDetails.usbOnlyBsod
    : {};
  const parsed = parseBsodReportText(run && run.textReport ? run.textReport : '');
  const phoneDetectedLabel = inferPhoneDetectedLabel(run, details, parsed);
  const bsodVerdictResult = inferBsodVerdict(run, details, parsed);

  const confidence = normalizeConfidence(
    details.confidence || parsed.confidence || ''
  );

  const actions = dedupeLines(
    Array.isArray(details.steps) && details.steps.length ? details.steps : parsed.actions
  );

  const hasHigh = Number(run && run.counts ? run.counts.high || 0 : 0) > 0;
  const hasMedium = Number(run && run.counts ? run.counts.medium || 0 : 0) > 0;

  let severity = 'low';
  if (hasHigh) severity = 'high';
  else if (hasMedium) severity = 'medium';

  const bsodVerdict = bsodVerdictResult && bsodVerdictResult.verdict
    ? String(bsodVerdictResult.verdict)
    : 'Unknown';
  const bsodVerdictClass = bsodVerdict === 'Yes'
    ? 'yes'
    : (bsodVerdict === 'No' ? 'no' : 'unknown');

  const explicitOnlineAiUsed = typeof details.onlineAiUsed === 'boolean' ? details.onlineAiUsed : null;
  const parsedOnlineAiUsed = normalizeOnlineAiUsed(parsed.onlineAiUsed);
  const onlineAiUsed = explicitOnlineAiUsed != null ? explicitOnlineAiUsed : parsedOnlineAiUsed;
  const onlineAiRequired = !!(
    details.onlineAiRequired === true
    || explicitOnlineAiUsed != null
    || parsedOnlineAiUsed != null
  );
  const onlineAiError = typeof details.onlineAiError === 'string' ? details.onlineAiError.trim() : '';
  const onlineAiStatus = (() => {
    if (onlineAiUsed === true) return 'Yes';
    if (onlineAiUsed === false) {
      if (onlineAiError) {
        const compactErr = onlineAiError.replace(/\s+/g, ' ').trim();
        return `No (${compactErr.slice(0, 140)}${compactErr.length > 140 ? '...' : ''})`;
      }
      if (parsed.onlineAiUsed) return String(parsed.onlineAiUsed);
      return 'No';
    }
    if (onlineAiRequired) return 'Required (status unavailable)';
    return 'Not recorded';
  })();

  return {
    summary: details.outcomeLine || parsed.summary || 'No summary available for this saved BSOD run.',
    phoneDetectedLabel,
    bsodVerdict,
    bsodVerdictClass,
    bsodStatusText: bsodVerdictResult && bsodVerdictResult.statusText ? String(bsodVerdictResult.statusText) : '',
    primaryReason: details.primaryReason || parsed.primaryReason || 'Not available',
    reasonDetail: details.firstReason || parsed.reasonDetail || 'Not available',
    confidence,
    confidenceLabel: confidence === 'unknown' ? 'Unknown' : toTitleCaseWord(confidence),
    severity,
    severityLabel: severity === 'high' ? 'Needs attention' : severity === 'medium' ? 'Moderate risk' : 'Low risk',
    onlineAiStatus,
    connectionLine: details.connectionLine || '',
    deviceLine: details.deviceLine || '',
    outcomeLine: details.outcomeLine || '',
    actions,
  };
}

function renderBsodHistoryCardHtml(view, rawReport) {
  const confidenceClass = view.confidence === 'high'
    ? 'high'
    : (view.confidence === 'medium' ? 'medium' : (view.confidence === 'low' ? 'low' : 'unknown'));

  const severityClass = view.severity === 'high'
    ? 'high'
    : (view.severity === 'medium' ? 'medium' : 'low');

  const renderField = (label, value) => `
    <div class="bsod-history-field">
      <div class="bsod-history-field-label">${escapeHtml(label)}</div>
      <div class="bsod-history-field-value">${escapeHtml(value || 'Not available')}</div>
    </div>`;

  const bsodDetectedValue = view.bsodStatusText
    ? `${view.bsodVerdict} (${view.bsodStatusText})`
    : view.bsodVerdict;

  const actionsHtml = view.actions && view.actions.length
    ? `<ul class="bsod-history-actions">${view.actions.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ul>`
    : '<div class="bsod-history-empty">No recommended actions were saved for this run.</div>';

  return `
    <div class="bsod-history-card">
      <div class="bsod-history-top">
        <div class="bsod-history-kicker">USB-only BSOD Diagnostic</div>
        <div class="bsod-history-summary">${escapeHtml(view.summary)}</div>
        <div class="bsod-history-badges">
          <span class="bsod-history-badge bsod ${view.bsodVerdictClass}">BSOD: ${escapeHtml(view.bsodVerdict)}</span>
          <span class="bsod-history-badge severity ${severityClass}">${escapeHtml(view.severityLabel)}</span>
          <span class="bsod-history-badge confidence ${confidenceClass}">Confidence: ${escapeHtml(view.confidenceLabel)}</span>
        </div>
      </div>

      <div class="bsod-history-grid">
        ${renderField('Phone detected', view.phoneDetectedLabel)}
        ${renderField('BSOD detected', bsodDetectedValue)}
        ${renderField('AI used', view.onlineAiStatus)}
        ${renderField('Primary reason', view.primaryReason)}
        ${renderField('Reason detail', view.reasonDetail)}
        ${renderField('Connection status', view.connectionLine || view.deviceLine)}
        ${renderField('Outcome', view.outcomeLine || view.summary)}
      </div>

      <div class="bsod-history-section">
        <div class="bsod-history-section-title">Recommended actions</div>
        ${actionsHtml}
      </div>

      ${rawReport
        ? `<details class="bsod-history-raw"><summary>Raw report</summary><pre>${escapeHtml(rawReport)}</pre></details>`
        : ''}
    </div>`;
}

function openBsodHistoryResultModal(run, sourceDeviceId) {
  const modal = document.getElementById('message-modal');
  const titleEl = document.getElementById('message-modal-title');
  const subtitleEl = document.getElementById('message-modal-subtitle');
  const bodyEl = document.getElementById('message-modal-body');

  const ts = run && run.timestamp ? Number(run.timestamp) : Date.now();
  const when = Number.isFinite(ts) ? new Date(ts).toLocaleString() : new Date().toLocaleString();
  const title = 'BSOD history result';
  const subtitle = `${getRunPhoneDisplayName(run, sourceDeviceId)} · ${when}`;
  const rawReport = (run && run.textReport && String(run.textReport).trim())
    ? String(run.textReport)
    : '';
  const view = buildBsodHistoryViewModel(run || {});
  const bodyHtml = renderBsodHistoryCardHtml(view, rawReport);

  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) {
    subtitleEl.textContent = subtitle;
    subtitleEl.classList.remove('hidden');
  }
  if (bodyEl) {
    bodyEl.classList.add('bsod-history-view');
    bodyEl.innerHTML = bodyHtml;
  }

  if (modal) {
    modal.classList.add('bsod-history-modal');
    modal.classList.remove('hidden');
    return;
  }

  try {
    alert(`${title}\n\n${subtitle}\n\n${rawReport || view.summary}`);
  } catch {
    // ignore
  }
}

function openHistoryResult(run, sourceDeviceId) {
  const historyModal = document.getElementById('history-browser-modal');
  if (historyModal && !historyModal.classList.contains('hidden')) {
    historyModal.classList.add('hidden');
  }

  const type = getHistoryTypeForRun(run);
  if (type === 'bsod') {
    openBsodHistoryResultModal(run, sourceDeviceId);
    return;
  }

  if (typeof openDiagnosticModal === 'function') {
    const displayName = getRunPhoneDisplayName(run, sourceDeviceId);
    const runForModal = (run && typeof run === 'object')
      ? Object.assign({}, run, { deviceLabel: displayName, phoneName: displayName })
      : run;
    openDiagnosticModal(sourceDeviceId, runForModal, false);
  }
}

function buildHistoryFilterRow(activeFilter) {
  const current = activeFilter === 'bsod' || activeFilter === 'adb' ? activeFilter : 'all';
  return `
    <div class="history-filter-row">
      <button type="button" class="history-filter-btn ${current === 'all' ? 'active' : ''}" data-history-filter="all">All</button>
      <button type="button" class="history-filter-btn ${current === 'bsod' ? 'active' : ''}" data-history-filter="bsod">BSOD</button>
      <button type="button" class="history-filter-btn ${current === 'adb' ? 'active' : ''}" data-history-filter="adb">ADB</button>
    </div>`;
}

async function renderHistoryList(deviceId) {
  const list = await fetchHistory(deviceId).catch(() => []);
  const container = document.getElementById(`history-${deviceId}`);
  if (!container) return;
  const sorted = list.slice().sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  const activeFilter = container.dataset.historyFilter || 'all';
  const filtered = sorted
    .map((run, index) => ({ run, index, type: getHistoryTypeForRun(run) }))
    .filter(entry => activeFilter === 'all' || entry.type === activeFilter);

  if (!sorted.length) {
    container.innerHTML = `${buildHistoryFilterRow(activeFilter)}<div class="history-empty">No saved diagnostics yet.</div>`;
  } else if (!filtered.length) {
    container.innerHTML = `${buildHistoryFilterRow(activeFilter)}<div class="history-empty">No ${activeFilter.toUpperCase()} records for this device yet.</div>`;
  } else {
    const items = filtered.map(entry => {
      const run = entry.run;
      const date = new Date(run.timestamp || Date.now());
      const time = date.toLocaleString();
      const issues = formatHistoryIssueSummary(run);
      const phoneName = getRunPhoneDisplayName(run, deviceId);
      return `
        <div class="history-item">
          <div class="history-main">
            <div class="history-title">
              ${escapeHtml(phoneName)}
              <span class="history-type-badge ${entry.type}">${getHistoryTypeLabel(entry.type)}</span>
            </div>
            <div class="history-meta">${escapeHtml(time)} · ${escapeHtml(issues)}</div>
          </div>
          <button class="history-view-btn" data-device="${escapeHtml(deviceId)}" data-run-index="${entry.index}">View result</button>
        </div>`;
    });

    container.innerHTML = `${buildHistoryFilterRow(activeFilter)}${items.join('')}`;
  }

  container.querySelectorAll('.history-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.getAttribute('data-history-filter');
      container.dataset.historyFilter = filter || 'all';
      renderHistoryList(deviceId);
    });
  });

  container.querySelectorAll('.history-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const indexRaw = btn.getAttribute('data-run-index');
      const index = Number(indexRaw);
      if (!Number.isFinite(index) || index < 0 || index >= sorted.length) return;
      openHistoryResult(sorted[index], deviceId);
    });
  });
}

function collectHistoryDeviceKeysFromUi() {
  const keys = new Set([HISTORY_BSOD_DEFAULT_KEY]);

  getRememberedBsodHistoryKeys().forEach(k => keys.add(k));

  try {
    document.querySelectorAll('.device').forEach(el => {
      const id = el && el.dataset ? String(el.dataset.id || '').trim() : '';
      if (id) keys.add(id);
    });
  } catch {
    // ignore
  }

  try {
    const sel = document.getElementById('device-select');
    if (sel && sel.options) {
      Array.from(sel.options).forEach(opt => {
        const value = opt && opt.value ? String(opt.value).trim() : '';
        if (value && value !== 'all') keys.add(value);
      });
    }
  } catch {
    // ignore
  }

  return Array.from(keys).filter(Boolean);
}

async function fetchMergedHistoryForModal() {
  const keys = collectHistoryDeviceKeysFromUi();
  const jobs = keys.map(async key => {
    const runs = await fetchHistory(key).catch(() => []);
    return runs.map(run => ({
      run,
      sourceDeviceId: key,
      type: getHistoryTypeForRun(run),
    }));
  });

  const chunks = await Promise.all(jobs);
  const merged = chunks.flat();
  const dedup = new Map();
  merged.forEach(entry => {
    const run = entry.run || {};
    const key = run.id != null
      ? `${entry.sourceDeviceId}::${run.id}`
      : `${entry.sourceDeviceId}::${run.timestamp || 0}::${entry.type}`;
    if (!dedup.has(key)) dedup.set(key, entry);
  });

  return Array.from(dedup.values()).sort((a, b) => Number(b.run.timestamp || 0) - Number(a.run.timestamp || 0));
}

function renderHistoryBrowserList() {
  const statusEl = document.getElementById('history-browser-status');
  const listEl = document.getElementById('history-browser-list');
  const filterRow = document.getElementById('history-browser-filters');
  if (!listEl || !statusEl || !filterRow) return;

  const activeFilter = HISTORY_MODAL_STATE.filter;
  const rows = HISTORY_MODAL_STATE.runs.filter(entry => activeFilter === 'all' || entry.type === activeFilter);

  filterRow.querySelectorAll('.history-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-history-filter') === activeFilter);
  });

  if (!HISTORY_MODAL_STATE.runs.length) {
    statusEl.textContent = 'No saved diagnostics yet.';
    listEl.innerHTML = '';
    return;
  }

  if (!rows.length) {
    statusEl.textContent = `No ${activeFilter.toUpperCase()} records found.`;
    listEl.innerHTML = '';
    return;
  }

  statusEl.textContent = `${rows.length} record(s) shown.`;
  listEl.innerHTML = rows.map((entry, index) => {
    const run = entry.run;
    const time = new Date(run.timestamp || Date.now()).toLocaleString();
    const issues = formatHistoryIssueSummary(run);
    const phoneName = getRunPhoneDisplayName(run, entry.sourceDeviceId);
    return `
      <div class="history-item">
        <div class="history-main">
          <div class="history-title">
            ${escapeHtml(phoneName)}
            <span class="history-type-badge ${entry.type}">${getHistoryTypeLabel(entry.type)}</span>
          </div>
          <div class="history-meta">
            ${escapeHtml(time)} · ${escapeHtml(issues)}
          </div>
        </div>
        <button class="history-view-btn" data-history-modal-index="${index}">View result</button>
      </div>`;
  }).join('');

  listEl.querySelectorAll('.history-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = Number(btn.getAttribute('data-history-modal-index'));
      if (!Number.isFinite(index) || index < 0 || index >= rows.length) return;
      const entry = rows[index];
      openHistoryResult(entry.run, entry.sourceDeviceId);
    });
  });
}

async function renderHistoryBrowserModal(options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const modal = document.getElementById('history-browser-modal');
  const statusEl = document.getElementById('history-browser-status');
  const filterRow = document.getElementById('history-browser-filters');
  if (!modal || !statusEl || !filterRow) return;

  if (opts.open === true) {
    modal.classList.remove('hidden');
  }

  if (modal.classList.contains('hidden')) {
    return;
  }

  statusEl.textContent = 'Loading history…';
  HISTORY_MODAL_STATE.runs = await fetchMergedHistoryForModal().catch(() => []);
  renderHistoryBrowserList();

  filterRow.querySelectorAll('.history-filter-btn').forEach(btn => {
    btn.onclick = () => {
      const filter = btn.getAttribute('data-history-filter');
      HISTORY_MODAL_STATE.filter = filter === 'bsod' || filter === 'adb' ? filter : 'all';
      renderHistoryBrowserList();
    };
  });
}

function openGlobalHistoryModal() {
  renderHistoryBrowserModal({ open: true });
}

if (typeof window !== 'undefined') {
  window.getHistoryTypeForRun = getHistoryTypeForRun;
  window.renderHistoryList = renderHistoryList;
  window.fetchHistory = fetchHistory;
  window.openGlobalHistoryModal = openGlobalHistoryModal;
  window.renderHistoryBrowserModal = renderHistoryBrowserModal;
  window.rememberBsodHistoryKey = rememberBsodHistoryKey;
}
