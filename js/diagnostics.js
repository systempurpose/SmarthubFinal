const DIAGNOSTIC_SEQUENCE = [
  {
    key: 'battery',
    title: 'Battery Health/Stress Test',
    desc: 'Evaluates level, temperature and basic health indicators.',
    automated: true,
    icon: '🔋',
  },
  {
    key: 'display',
    title: 'Display & Touchscreen',
    desc: 'Checks display pipeline and resolution from system dumps.',
    automated: true,
    icon: '🖥️',
  },
  {
    key: 'touch',
    title: 'Touch / Ghost touch',
    desc: 'Looks for touch-driver errors and ghost-touch hints in logs.',
    automated: true,
    icon: '👆',
  },
  {
    key: 'sensors',
    title: 'Sensors',
    desc: 'Reads sensor service and lists accelerometer, gyro and others.',
    automated: true,
    icon: '📡',
  },
  {
    key: 'camera',
    title: 'Camera & Microphone',
    desc: 'Checks camera service metadata exposed by the system.',
    automated: true,
    icon: '🎥',
  },
  {
    key: 'connectivity',
    title: 'Connectivity',
    desc: 'Verifies connectivity stacks like Wi‑Fi and mobile data.',
    automated: true,
    icon: '📶',
  },
  {
    key: 'hardware',
    title: 'Hardware Components',
    desc: 'Reads advertised hardware capabilities such as fingerprint and NFC.',
    automated: true,
    icon: '⚙️',
  },
  {
    key: 'system',
    title: 'System & Performance',
    desc: 'CPU, RAM and storage health snapshot from the device.',
    automated: true,
    icon: '🚀',
  },
  {
    key: 'os',
    title: 'OS / Filesystem Health',
    desc: 'Checks logs for signs of OS or filesystem corruption.',
    automated: true,
    icon: '🧩',
  },
  {
    key: 'security',
    title: 'Apps & Security',
    desc: 'Scans installed apps and permissions for threats.',
    automated: true,
    icon: '🛡️',
  },
];

const adbAiConclusionCache = new Map();
const adbAiRememberedCache = new Set();
const adbHistoryFinalizedCache = new Set();

function readSmartHubOnlineAiStatus() {
  try {
    const s = window.__smartHubOnlineAiStatus;
    if (s && typeof s === 'object' && typeof s.state === 'string') {
      return {
        online: s.state === 'on' || !!s.online,
      };
    }
  } catch {
    // ignore
  }
  return { online: false };
}

function renderSmartHubAiTitle(i18n, escapeHtml, sourceHint) {
  const base = escapeHtml(i18n.t('ai.offline.title'));
  const status = readSmartHubOnlineAiStatus();
  const online = sourceHint === 'online'
    ? true
    : sourceHint === 'offline'
      ? false
      : !!status.online;
  const statusText = online ? 'Online' : 'Built-in';
  const statusClass = online ? 'ai-online-chip-on' : 'ai-online-chip-off';
  return `<strong class="ai-title-wrap"><span class="ai-title-text">🧠 ${base}</span><span class="ai-online-chip ${statusClass}"><span class="ai-online-chip-dot"></span>${statusText}</span></strong>`;
}

function friendlyOnlineFallbackMessage(rawError) {
  const text = String(rawError || '').trim();
  const lower = text.toLowerCase();

  if (!text) {
    return 'Online AI is unavailable. Showing built-in AI result.';
  }

  if (lower.includes('insufficient_quota') || lower.includes('quota') || lower.includes('rate limit') || lower.includes('429')) {
    return 'Online AI is temporarily unavailable because API quota or rate limits were reached. Showing built-in AI result.';
  }

  if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized') || lower.includes('authentication')) {
    return 'Online AI authentication failed on this PC. Showing built-in AI result.';
  }

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('network') || lower.includes('enotfound') || lower.includes('eai_again')) {
    return 'Online AI is temporarily unreachable (network/timeout). Showing built-in AI result.';
  }

  return 'Online AI is unavailable. Showing built-in AI result.';
}

function stripOnlineCitationFooter(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const markerIndex = raw.search(/\n\s*web references\s*:\s*\n/i);
  if (markerIndex >= 0) {
    return raw.slice(0, markerIndex).trim();
  }
  return raw;
}

function parseAdbOnlineAiText(rawText) {
  const clean = stripOnlineCitationFooter(rawText);
  const out = {
    likelyCause: '',
    why: '',
    doFirst: '',
    evidenceUsed: '',
    confidence: '',
    nextSteps: [],
    fallbackSummary: '',
  };

  if (!clean) return out;

  // Some providers return all labeled sections in one paragraph.
  // Insert virtual line breaks before known section labels so rendering stays aligned.
  const normalized = clean
    .replace(/\s+(?=(?:Likely\s*cause|Why|Do\s*this\s*first|Next\s*steps|Evidence\s*used|Confidence|Summary)\s*:)/gi, '\n');

  const lines = normalized
    .split(/\r?\n/)
    .map(line => String(line || '').trim())
    .filter(Boolean);

  const pushNextStepsFromText = (text) => {
    const raw = String(text || '').trim();
    if (!raw) return;

    // Normalize inline numbering like "1. ... 2. ..." into separate lines.
    const numbered = raw.replace(/\s+(?=\d+[\.)]\s+)/g, '\n');
    const bits = numbered
      .split(/\r?\n/)
      .map(s => String(s || '').trim())
      .filter(Boolean);

    bits.forEach((bit) => {
      const bullet = bit.match(/^(?:\d+[\.)]|[-*])\s*(.+)$/);
      const value = (bullet ? String(bullet[1] || '').trim() : bit).replace(/\s+/g, ' ').trim();
      if (value) out.nextSteps.push(value);
    });
  };

  let inNextSteps = false;
  const fallbackLines = [];

  lines.forEach(line => {
    if (/^likely\s*cause\s*:/i.test(line)) {
      out.likelyCause = line.replace(/^likely\s*cause\s*:/i, '').trim();
      inNextSteps = false;
      return;
    }
    if (/^why\s*:/i.test(line)) {
      out.why = line.replace(/^why\s*:/i, '').trim();
      inNextSteps = false;
      return;
    }
    if (/^do\s*this\s*first\s*:/i.test(line)) {
      out.doFirst = line.replace(/^do\s*this\s*first\s*:/i, '').trim();
      inNextSteps = false;
      return;
    }
    if (/^evidence\s*used\s*:/i.test(line)) {
      out.evidenceUsed = line.replace(/^evidence\s*used\s*:/i, '').trim();
      inNextSteps = false;
      return;
    }
    if (/^confidence\s*:/i.test(line)) {
      out.confidence = line.replace(/^confidence\s*:/i, '').trim();
      inNextSteps = false;
      return;
    }
    if (/^next\s*steps\s*:/i.test(line)) {
      const inline = line.replace(/^next\s*steps\s*:/i, '').trim();
      if (inline) pushNextStepsFromText(inline);
      inNextSteps = true;
      return;
    }
    if (/^summary\s*:/i.test(line)) {
      const value = line.replace(/^summary\s*:/i, '').trim();
      if (value) fallbackLines.push(value);
      inNextSteps = false;
      return;
    }
    if (/^web\s*references\s*:/i.test(line)) {
      inNextSteps = false;
      return;
    }

    if (inNextSteps) {
      pushNextStepsFromText(line);
      return;
    }

    fallbackLines.push(line);
  });

  out.nextSteps = out.nextSteps
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 6);

  out.fallbackSummary = fallbackLines.join(' ').trim();
  return out;
}

async function renderAdbAiConclusion(deviceId, record, inProgress) {
  const hostEl = document.getElementById('modal-ai-conclusion');
  if (!hostEl) return;

  const i18n = (() => {
    try {
      return window.SmartHubI18n || { t: k => k, getCurrentLang: () => 'en' };
    } catch {
      return { t: k => k, getCurrentLang: () => 'en' };
    }
  })();

  if (inProgress) {
    hostEl.classList.add('hidden');
    hostEl.innerHTML = '';
    return;
  }

  const cacheKey = `${String(deviceId)}:${String(record && record.timestamp ? record.timestamp : '')}`;
  if (adbAiConclusionCache.has(cacheKey)) {
    const cached = adbAiConclusionCache.get(cacheKey);
    hostEl.classList.toggle('hidden', !cached || !cached.html);
    if (cached && cached.html) hostEl.innerHTML = cached.html;
    return;
  }

  const escapeHtml = str =>
    String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  hostEl.classList.remove('hidden');
  hostEl.innerHTML = `
    <div class="ai-result-box ui-fade-in">
      <div class="ai-result-title">
        ${renderSmartHubAiTitle(i18n, escapeHtml)}
        <span class="ai-result-meta" style="margin-top: 0;">${i18n.t('ai.state.working')}</span>
      </div>
      <div class="ai-result-meta">${i18n.t('ai.offline.summarizing')}</div>
    </div>`;

  try {
    const lang = i18n.getCurrentLang ? i18n.getCurrentLang() : 'en';
    const payload = {
      deviceId: String(deviceId),
      deviceLabel: record && record.deviceLabel ? record.deviceLabel : undefined,
      timestamp: record && record.timestamp ? record.timestamp : undefined,
      counts: record && record.counts ? record.counts : undefined,
      diagStages: record && record.diagStages ? record.diagStages : undefined,
      diagDetails: record && record.diagDetails ? record.diagDetails : undefined,
      userProblem: record && record.userProblem ? String(record.userProblem || '').trim() : '',
      lang,
    };

    const onlineStatus = readSmartHubOnlineAiStatus();
    let shouldTryOnline = !!onlineStatus.online;
    let onlineError = '';

    if (!shouldTryOnline) {
      try {
        const statusRes = await fetch('http://localhost:3333/online-ai/status', { cache: 'no-store' });
        const statusBody = await statusRes.json().catch(() => null);
        shouldTryOnline = !!(
          statusRes.ok
          && statusBody
          && statusBody.ok === true
          && statusBody.enabled
          && statusBody.configured
        );
      } catch {
        shouldTryOnline = false;
      }
    }

    if (shouldTryOnline) {
      try {
        const onlinePayload = {
          kind: 'adb_full_diagnostic',
          features: {
            lang,
            userProblem: payload.userProblem,
            deviceId: payload.deviceId,
            deviceLabel: payload.deviceLabel,
            counts: payload.counts,
            diagStages: payload.diagStages,
            diagDetails: payload.diagDetails,
            onDeviceReport: record && record.onDeviceReport ? record.onDeviceReport : undefined,
          },
        };

        const onlineRes = await fetch('http://localhost:3333/ai-online-suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(onlinePayload),
        });

        const onlineRaw = await onlineRes.text();
        let onlineBody = null;
        try {
          onlineBody = onlineRaw ? JSON.parse(onlineRaw) : null;
        } catch {
          onlineBody = null;
        }

        if (onlineRes.ok && onlineBody && onlineBody.ok && typeof onlineBody.text === 'string' && onlineBody.text.trim()) {
          const normalizedCitations = Array.isArray(onlineBody.citations)
            ? onlineBody.citations
              .map((it) => {
                if (!it || typeof it !== 'object') return null;
                const title = typeof it.title === 'string' ? it.title.trim() : '';
                const url = typeof it.url === 'string' ? it.url.trim() : '';
                const snippet = typeof it.snippet === 'string' ? it.snippet.trim() : '';
                const source = typeof it.source === 'string' ? it.source.trim() : '';
                if (!/^https?:\/\//i.test(url)) return null;
                return { title, url, snippet, source };
              })
              .filter(Boolean)
              .slice(0, 8)
            : [];

          const parsedOnline = parseAdbOnlineAiText(onlineBody.text);
          const likelyCause = parsedOnline.likelyCause || parsedOnline.fallbackSummary || 'No conclusion returned.';
          const why = parsedOnline.why;
          const doFirst = parsedOnline.doFirst;
          const summary = parsedOnline.fallbackSummary;
          const evidenceUsed = parsedOnline.evidenceUsed;
          const confidence = parsedOnline.confidence;
          const nextSteps = parsedOnline.nextSteps;

          const nextStepsHtml = nextSteps.length
            ? `<ul style="margin: 6px 0 0; padding-left: 18px;">${nextSteps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ul>`
            : '<div class="ai-result-meta" style="margin-top: 8px;">No suggested fix steps were returned.</div>';

          const citationHtml = normalizedCitations.length
            ? `
              <div class="ai-result-meta" style="margin-top: 8px;"><strong>Web evidence citations:</strong></div>
              <ul style="margin: 6px 0 0; padding-left: 18px;">
                ${normalizedCitations.map((c, idx) => {
                  const title = c.title || c.source || `Source ${idx + 1}`;
                  const snippet = c.snippet ? ` — ${escapeHtml(c.snippet)}` : '';
                  return `<li><a href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>${snippet}</li>`;
                }).join('')}
              </ul>`
            : '';

          const html = `
            <div class="ai-result-box ui-fade-in">
              <div class="ai-result-title">
                ${renderSmartHubAiTitle(i18n, escapeHtml, 'online')}
                <span class="ai-result-meta" style="margin-top: 0;">${confidence ? `Confidence: ${escapeHtml(confidence)}` : ''}</span>
              </div>
              <div class="ai-result-meta"><strong>${i18n.t('ai.label.likelyCause')}</strong> ${escapeHtml(likelyCause)}</div>
              ${why ? `<div class="ai-result-meta" style="margin-top: 8px;"><strong>${i18n.t('ai.label.why')}</strong> ${escapeHtml(why)}</div>` : ''}
              ${doFirst ? `<div class="ai-result-meta" style="margin-top: 8px;"><strong>${i18n.t('ai.label.doFirst')}</strong> ${escapeHtml(doFirst)}</div>` : ''}
              ${evidenceUsed ? `<div class="ai-result-meta" style="margin-top: 8px;"><strong>Evidence used:</strong> ${escapeHtml(evidenceUsed)}</div>` : ''}
              ${summary && summary !== why && summary !== likelyCause ? `<div class="ai-result-meta" style="margin-top: 8px;"><strong>${i18n.t('ai.label.summary')}</strong> ${escapeHtml(summary)}</div>` : ''}
              <div class="ai-result-meta" style="margin-top: 8px;"><strong>${i18n.t('ai.label.nextSteps')}</strong></div>
              ${nextStepsHtml}
              ${citationHtml}
            </div>`;

          adbAiConclusionCache.set(cacheKey, { html });
          hostEl.innerHTML = html;
          return;
        }

        const onlineBodyError = onlineBody && typeof onlineBody.error === 'string' ? onlineBody.error.trim() : '';
        onlineError = onlineBodyError || `Online AI HTTP ${onlineRes.status}`;
      } catch (onlineErr) {
        onlineError = onlineErr && onlineErr.message ? String(onlineErr.message) : 'Online AI request failed';
      }
    }

    const res = await fetch('http://localhost:3333/ai-adb-conclude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok !== true) {
      const msg = data && data.error ? String(data.error) : `AI helper HTTP ${res.status}`;
      const lower = msg.toLowerCase();
      const scriptMissing = lower.includes('helper script is missing') || lower.includes('ai_adb_conclude.py');
      const pythonMissing =
        lower.includes('python') ||
        lower.includes('spawn') ||
        lower.includes('enoent') ||
        lower.includes('opencv') ||
        lower.includes('numpy');
      const enableHint = scriptMissing
        ? 'To enable: update/reinstall SmartHub Diagnostics (missing AI support script in the install folder).'
        : pythonMissing
          ? 'To enable: install Python 3 on this PC and see AI support/README.md.'
          : '';
      const html = `
        <div class="ai-result-box ui-fade-in">
          <div class="ai-result-title">
            ${renderSmartHubAiTitle(i18n, escapeHtml, 'offline')}
            <span class="ai-result-meta" style="margin-top: 0;">${i18n.t('ai.state.unavailable')}</span>
          </div>
          <div class="ai-result-meta">${escapeHtml(msg)}</div>
          ${enableHint ? `<div class="ai-result-meta" style="margin-top: 6px;">${escapeHtml(enableHint)}</div>` : ''}
        </div>`;
      adbAiConclusionCache.set(cacheKey, { html });
      hostEl.innerHTML = html;
      return;
    }

    const label = data.conclusion && data.conclusion.label ? String(data.conclusion.label) : 'No conclusion returned.';
    const conf = typeof (data.conclusion && data.conclusion.confidence) === 'number'
      ? Math.max(0, Math.min(1, data.conclusion.confidence))
      : null;
    const reason = data.conclusion && data.conclusion.reason ? String(data.conclusion.reason) : (data.conclusion && data.conclusion.summary ? String(data.conclusion.summary) : '');
    const likelyCause = data.conclusion && data.conclusion.likelyCause ? String(data.conclusion.likelyCause) : label;
    const why = data.conclusion && data.conclusion.why ? String(data.conclusion.why) : reason;
    const nextStep = data.conclusion && data.conclusion.nextStep ? String(data.conclusion.nextStep) : '';
    const actions = Array.isArray(data.conclusion && data.conclusion.howToFix)
      ? data.conclusion.howToFix
      : (Array.isArray(data.conclusion && data.conclusion.actions) ? data.conclusion.actions : []);

    const remainingActions = nextStep
      ? actions.filter(action => String(action || '').trim() !== nextStep)
      : actions;

    const actionsHtml = remainingActions.length
      ? `<ul style="margin: 6px 0 0; padding-left: 18px;">${remainingActions.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>`
      : `<div class="ai-result-meta" style="margin-top: 8px;">No suggested fix steps were returned.</div>`;

    const html = `
      <div class="ai-result-box ui-fade-in">
        <div class="ai-result-title">
          ${renderSmartHubAiTitle(i18n, escapeHtml, 'offline')}
          <span class="ai-result-meta" style="margin-top: 0;">${conf != null ? `Confidence: ${escapeHtml(String(Math.round(conf * 100)))}%` : ''}</span>
        </div>
        <div class="ai-result-meta"><strong>${i18n.t('ai.label.likelyCause')}</strong> ${escapeHtml(likelyCause || label)}</div>
        ${why ? `<div class="ai-result-meta" style="margin-top: 8px;"><strong>${i18n.t('ai.label.why')}</strong> ${escapeHtml(why)}</div>` : ''}
        ${nextStep ? `<div class="ai-result-meta" style="margin-top: 8px;"><strong>${i18n.t('ai.label.doFirst')}</strong> ${escapeHtml(nextStep)}</div>` : ''}
        ${reason && why !== reason ? `<div class="ai-result-meta" style="margin-top: 8px;"><strong>${i18n.t('ai.label.summary')}</strong> ${escapeHtml(reason)}</div>` : ''}
        ${onlineError ? `<div class="ai-result-meta" style="margin-top: 8px;"><strong>AI fallback:</strong> ${escapeHtml(friendlyOnlineFallbackMessage(onlineError))}</div>` : ''}
        <div class="ai-result-meta" style="margin-top: 8px;"><strong>${i18n.t('ai.label.nextSteps')}</strong></div>
        ${actionsHtml}
      </div>`;

    adbAiConclusionCache.set(cacheKey, { html });
    hostEl.innerHTML = html;
  } catch (e) {
    const msg = e && e.message ? e.message : 'AI helper unavailable on this PC.';
    const html = `
      <div class="ai-result-box ui-fade-in">
        <div class="ai-result-title">
          ${renderSmartHubAiTitle(i18n, escapeHtml, 'offline')}
          <span class="ai-result-meta" style="margin-top: 0;">${i18n.t('ai.state.unavailable')}</span>
        </div>
        <div class="ai-result-meta">${escapeHtml(String(msg))}</div>
      </div>`;
    adbAiConclusionCache.set(cacheKey, { html });
    hostEl.innerHTML = html;
  }
}

function ensureDiagStepsContainer(deviceId) {
  const container = document.getElementById(`diag-steps-${deviceId}`);
  if (!container) return null;
  if (container.dataset.initialised === 'true') {
    return container;
  }

  const items = DIAGNOSTIC_SEQUENCE.map(step => {
    return `
      <div class="diag-step" data-step="${step.key}">
        <div class="diag-step-main">
          <div class="diag-step-title"><span class="diag-step-icon">${step.icon || ''}</span>${step.title}</div>
          <div class="diag-step-desc">${step.desc}</div>
        </div>
        <div class="diag-step-status diag-status-pending" id="diag-status-${step.key}-${deviceId}">
          <span class="diag-dot"></span>
          <span class="diag-status-label">Pending</span>
        </div>
      </div>`;
  });

  container.innerHTML = items.join('');
  container.dataset.initialised = 'true';
  return container;
}

function setDiagStatus(deviceId, key, status) {
  const el = document.getElementById(`diag-status-${key}-${deviceId}`);
  if (!el) return;
  el.classList.remove('diag-status-pending', 'diag-status-running', 'diag-status-ok', 'diag-status-issue');
  el.classList.add(`diag-status-${status}`);
  const label = el.querySelector('.diag-status-label');
  if (!label) return;
  if (status === 'running') label.textContent = 'Diagnosting…';
  else if (status === 'ok') label.textContent = 'PASS';
  else if (status === 'issue') label.textContent = 'FAIL';
  else label.textContent = 'Pending';
}

function updateDiagStagesFromSummary(deviceId, summary) {
  if (!summary) return;
  // Ensure UI container exists
  ensureDiagStepsContainer(deviceId);
  Object.keys(summary).forEach(key => {
    const stage = summary[key];
    if (!stage) return;
    const status = stage.ok ? 'ok' : 'issue';
    setDiagStatus(deviceId, key, status);

    if (stage.details) {
      const descEl = document.querySelector(
        `#diag-steps-${deviceId} .diag-step[data-step="${key}"] .diag-step-desc`,
      );
      if (descEl) {
        descEl.textContent = stage.details;
      }
    }
  });
}

function isFullDiagnosticInProgress(deviceId) {
  return (
    typeof window.fullDiagInProgress === 'object' &&
    window.fullDiagInProgress &&
    !!window.fullDiagInProgress[deviceId]
  );
}

const LIVE_CHECKS = [
  // Battery
  {
    id: 'battery-level',
    icon: '🔋',
    title: 'Battery level',
    stage: 'battery',
    get: record => {
      const b = record && record.diagDetails && record.diagDetails.battery;
      if (!b || b.level == null) return null;
      return { text: `${b.level}%` };
    },
  },
  {
    id: 'battery-temp',
    icon: '🔋',
    title: 'Battery temperature',
    stage: 'battery',
    get: record => {
      const b = record && record.diagDetails && record.diagDetails.battery;
      if (!b || b.temperatureC == null) return null;
      const temp = Number(b.temperatureC);
      const issue = Number.isFinite(temp) && temp >= 45;
      return { text: `${temp.toFixed(1)}°C`, issue };
    },
  },
  {
    id: 'battery-health',
    icon: '🔋',
    title: 'Battery health',
    stage: 'battery',
    get: record => {
      const b = record && record.diagDetails && record.diagDetails.battery;
      if (!b || b.health == null || b.health === '') return null;
      const health = String(b.health);
      const issue = /overheat|dead|failure|bad|over.?voltage|unspecified/i.test(health);
      return { text: health, issue };
    },
  },
  {
    id: 'battery-cycles',
    icon: '🔋',
    title: 'Battery cycle count',
    stage: 'battery',
    get: record => {
      const b = record && record.diagDetails && record.diagDetails.battery;
      if (!b || b.cycleCount == null) return null;
      return { text: String(b.cycleCount) };
    },
  },

  // Display
  {
    id: 'display-resolution',
    icon: '🖥️',
    title: 'Display resolution',
    stage: 'display',
    get: record => {
      const d = record && record.diagDetails && record.diagDetails.display;
      if (!d || !d.width || !d.height) return null;
      return { text: `${d.width} x ${d.height} px` };
    },
  },
  {
    id: 'display-diagonal',
    icon: '🖥️',
    title: 'Screen size estimate',
    stage: 'display',
    get: record => {
      const d = record && record.diagDetails && record.diagDetails.display;
      if (!d || typeof d.diagonalInches !== 'number') return null;
      return { text: `${d.diagonalInches.toFixed(1)}" (approx)` };
    },
  },

  // Touch (heuristics)
  {
    id: 'touch-driver-errors',
    icon: '👆',
    title: 'Touch driver errors in logs',
    stage: 'touch',
    get: record => {
      const t = record && record.diagDetails && record.diagDetails.touch;
      if (!t || t.hasTouchDriverErrors == null) return null;
      return {
        text: t.hasTouchDriverErrors ? 'Present' : 'Not present in recent logs',
        issue: !!t.hasTouchDriverErrors,
      };
    },
  },
  {
    id: 'touch-anomalies',
    icon: '👆',
    title: 'Ghost-touch style anomalies',
    stage: 'touch',
    get: record => {
      const t = record && record.diagDetails && record.diagDetails.touch;
      if (!t || t.hasInputAnomalies == null) return null;
      return {
        text: t.hasInputAnomalies ? 'Present' : 'Not present in recent logs',
        issue: !!t.hasInputAnomalies,
      };
    },
  },

  // Sensors
  {
    id: 'sensor-count',
    icon: '📡',
    title: 'Sensors reported (approx)',
    stage: 'sensors',
    get: record => {
      const s = record && record.diagDetails && record.diagDetails.sensors;
      if (!s || s.sensorCount == null) return null;
      return { text: `~${s.sensorCount} sensors` };
    },
  },
  {
    id: 'sensor-accelerometer',
    icon: '📡',
    title: 'Accelerometer',
    stage: 'sensors',
    get: record => {
      const s = record && record.diagDetails && record.diagDetails.sensors;
      if (!s || s.hasAccelerometer == null) return null;
      return { text: s.hasAccelerometer ? 'Present' : 'Not present' };
    },
  },
  {
    id: 'sensor-gyroscope',
    icon: '📡',
    title: 'Gyroscope',
    stage: 'sensors',
    get: record => {
      const s = record && record.diagDetails && record.diagDetails.sensors;
      if (!s || s.hasGyroscope == null) return null;
      return { text: s.hasGyroscope ? 'Present' : 'Not present' };
    },
  },
  {
    id: 'sensor-barometer',
    icon: '📡',
    title: 'Barometer',
    stage: 'sensors',
    get: record => {
      const s = record && record.diagDetails && record.diagDetails.sensors;
      if (!s || s.hasBarometer == null) return null;
      return { text: s.hasBarometer ? 'Present' : 'Not present' };
    },
  },
  {
    id: 'sensor-magnetometer',
    icon: '📡',
    title: 'Magnetometer',
    stage: 'sensors',
    get: record => {
      const s = record && record.diagDetails && record.diagDetails.sensors;
      if (!s || s.hasMagnetometer == null) return null;
      return { text: s.hasMagnetometer ? 'Present' : 'Not present' };
    },
  },
  {
    id: 'sensor-proximity',
    icon: '📡',
    title: 'Proximity sensor',
    stage: 'sensors',
    get: record => {
      const s = record && record.diagDetails && record.diagDetails.sensors;
      if (!s || s.hasProximitySensor == null) return null;
      return { text: s.hasProximitySensor ? 'Present' : 'Not present' };
    },
  },

  // Camera
  {
    id: 'camera-descriptors',
    icon: '🎥',
    title: 'Camera descriptors detected (approx)',
    stage: 'camera',
    get: record => {
      const c = record && record.diagDetails && record.diagDetails.camera;
      if (!c || c.descriptorCount == null) return null;
      return { text: `~${c.descriptorCount} camera entries` };
    },
  },

  // Connectivity
  {
    id: 'conn-wifi',
    icon: '📶',
    title: 'Wi‑Fi stack detected',
    stage: 'connectivity',
    get: record => {
      const c = record && record.diagDetails && record.diagDetails.connectivity;
      if (!c || c.hasWifi == null) return null;
      return { text: c.hasWifi ? 'Present' : 'Not present' };
    },
  },
  {
    id: 'conn-bluetooth',
    icon: '📶',
    title: 'Bluetooth stack detected',
    stage: 'connectivity',
    get: record => {
      const c = record && record.diagDetails && record.diagDetails.connectivity;
      if (!c || c.hasBluetooth == null) return null;
      return { text: c.hasBluetooth ? 'Present' : 'Not present' };
    },
  },
  {
    id: 'conn-nfc',
    icon: '📶',
    title: 'NFC detected',
    stage: 'connectivity',
    get: record => {
      const c = record && record.diagDetails && record.diagDetails.connectivity;
      if (!c || c.hasNfc == null) return null;
      return { text: c.hasNfc ? 'Present' : 'Not present' };
    },
  },
  {
    id: 'conn-gps',
    icon: '📶',
    title: 'GPS detected',
    stage: 'connectivity',
    get: record => {
      const c = record && record.diagDetails && record.diagDetails.connectivity;
      if (!c || c.hasGps == null) return null;
      return { text: c.hasGps ? 'Present' : 'Not present' };
    },
  },
  {
    id: 'conn-mobile',
    icon: '📶',
    title: 'Mobile data detected',
    stage: 'connectivity',
    get: record => {
      const c = record && record.diagDetails && record.diagDetails.connectivity;
      if (!c || c.hasMobile == null) return null;
      return { text: c.hasMobile ? 'Present' : 'Not present' };
    },
  },

  // Hardware
  {
    id: 'hw-fingerprint',
    icon: '⚙️',
    title: 'Fingerprint sensor advertised',
    stage: 'hardware',
    get: record => {
      const h = record && record.diagDetails && record.diagDetails.hardware;
      if (!h || h.hasFingerprint == null) return null;
      return { text: h.hasFingerprint ? 'Present' : 'Not present' };
    },
  },
  {
    id: 'hw-microphone',
    icon: '⚙️',
    title: 'Microphone advertised',
    stage: 'hardware',
    get: record => {
      const h = record && record.diagDetails && record.diagDetails.hardware;
      if (!h || h.hasMicrophone == null) return null;
      return { text: h.hasMicrophone ? 'Present' : 'Not present' };
    },
  },
  {
    id: 'hw-speaker',
    icon: '⚙️',
    title: 'Speaker output advertised',
    stage: 'hardware',
    get: record => {
      const h = record && record.diagDetails && record.diagDetails.hardware;
      if (!h || h.hasSpeaker == null) return null;
      return { text: h.hasSpeaker ? 'Present' : 'Not present' };
    },
  },

  // System
  {
    id: 'sys-ram',
    icon: '🚀',
    title: 'RAM total reported',
    stage: 'system',
    get: record => {
      const s = record && record.diagDetails && record.diagDetails.system;
      if (!s || s.memTotalKb == null) return null;
      const gb = s.memTotalKb / (1024 * 1024);
      return { text: `${gb.toFixed(1)} GB (approx)` };
    },
  },
  {
    id: 'sys-storage-warnings',
    icon: '🚀',
    title: 'Storage warnings',
    stage: 'system',
    get: record => {
      const s = record && record.diagDetails && record.diagDetails.system;
      if (!s || s.hasStorageIssue == null) return null;
      return { text: s.hasStorageIssue ? 'Storage near full' : 'None detected', issue: !!s.hasStorageIssue };
    },
  },
  {
    id: 'sys-crash-anr',
    icon: '🚀',
    title: 'Crash / ANR logs',
    stage: 'system',
    get: record => {
      const s = record && record.diagDetails && record.diagDetails.system;
      if (!s || s.hasCrashIssue == null) return null;
      return { text: s.hasCrashIssue ? 'Recent events detected' : 'None detected', issue: !!s.hasCrashIssue };
    },
  },

  // OS
  {
    id: 'os-android-version',
    icon: '🧩',
    title: 'Android version',
    stage: 'os',
    get: record => {
      const o = record && record.diagDetails && record.diagDetails.os;
      if (!o || !o.androidVersion) return null;
      return { text: String(o.androidVersion) };
    },
  },
  {
    id: 'os-custom-build',
    icon: '🧩',
    title: 'Custom / test build',
    stage: 'os',
    get: record => {
      const o = record && record.diagDetails && record.diagDetails.os;
      if (!o || o.isCustomBuild == null) return null;
      return { text: o.isCustomBuild ? 'Yes' : 'No', issue: !!o.isCustomBuild };
    },
  },
  {
    id: 'os-verified-boot',
    icon: '🧩',
    title: 'Verified boot state',
    stage: 'os',
    get: record => {
      const o = record && record.diagDetails && record.diagDetails.os;
      if (!o || !o.verifiedBootState) return null;
      const state = String(o.verifiedBootState);
      const issue = /orange|red|unverified|failed/i.test(state);
      return { text: state, issue };
    },
  },
  {
    id: 'os-bootloader',
    icon: '🧩',
    title: 'Bootloader lock state',
    stage: 'os',
    get: record => {
      const o = record && record.diagDetails && record.diagDetails.os;
      if (!o || o.bootloaderLocked == null) return null;
      return { text: o.bootloaderLocked ? 'Locked' : 'Unlocked', issue: !o.bootloaderLocked };
    },
  },
  {
    id: 'os-fs-errors',
    icon: '🧩',
    title: 'Filesystem errors in logs',
    stage: 'os',
    get: record => {
      const o = record && record.diagDetails && record.diagDetails.os;
      if (!o || o.hasFsError == null) return null;
      return { text: o.hasFsError ? 'Filesystem errors reported' : 'None detected', issue: !!o.hasFsError };
    },
  },
  {
    id: 'os-verity',
    icon: '🧩',
    title: 'dm-verity / integrity warnings',
    stage: 'os',
    get: record => {
      const o = record && record.diagDetails && record.diagDetails.os;
      if (!o || o.hasVerityIssue == null) return null;
      return { text: o.hasVerityIssue ? 'Warnings present' : 'None detected', issue: !!o.hasVerityIssue };
    },
  },
  {
    id: 'os-core-crashes',
    icon: '🧩',
    title: 'Core Android services crashes',
    stage: 'os',
    get: record => {
      const o = record && record.diagDetails && record.diagDetails.os;
      if (!o || o.hasCoreServiceCrashes == null) return null;
      return { text: o.hasCoreServiceCrashes ? 'Crashes detected' : 'None detected', issue: !!o.hasCoreServiceCrashes };
    },
  },
  {
    id: 'os-build-fingerprint',
    icon: '🧩',
    title: 'Build fingerprint',
    stage: 'os',
    get: record => {
      const o = record && record.diagDetails && record.diagDetails.os;
      if (!o || !o.buildFingerprint) return null;
      return { text: String(o.buildFingerprint) };
    },
  },

  // Security
  {
    id: 'sec-apps-scanned',
    icon: '🛡️',
    title: 'Apps scanned',
    stage: 'security',
    get: record => {
      const s = record && record.diagDetails && record.diagDetails.security;
      if (!s || s.appsScanned == null) return null;
      return { text: String(s.appsScanned) };
    },
  },
  {
    id: 'sec-suspicious-apps',
    icon: '🛡️',
    title: 'Suspicious apps',
    stage: 'security',
    get: record => {
      const s = record && record.diagDetails && record.diagDetails.security;
      if (!s) return null;
      const total =
        typeof s.suspiciousTotal === 'number'
          ? s.suspiciousTotal
          : (typeof s.suspiciousHigh === 'number' ? s.suspiciousHigh : 0) +
            (typeof s.suspiciousMedium === 'number' ? s.suspiciousMedium : 0) +
            (typeof s.suspiciousLow === 'number' ? s.suspiciousLow : 0);
      if (typeof total !== 'number') return null;
      return { text: String(total), issue: total > 0 };
    },
  },
  {
    id: 'sec-files-scanned',
    icon: '🛡️',
    title: 'Files scanned',
    stage: 'security',
    get: record => {
      const s = record && record.diagDetails && record.diagDetails.security;
      if (!s || s.filesScanned == null) return null;
      return { text: String(s.filesScanned) };
    },
  },
  {
    id: 'sec-flagged-files',
    icon: '🛡️',
    title: 'Flagged files',
    stage: 'security',
    get: record => {
      const s = record && record.diagDetails && record.diagDetails.security;
      if (!s || s.suspiciousFiles == null) return null;
      const flagged = Number(s.suspiciousFiles);
      return { text: String(flagged), issue: flagged > 0 };
    },
  },
];

function setLiveCheckStatus(checkId, status, descText) {
  const statusEl = document.getElementById(`modal-live-status-${checkId}`);
  const descEl = document.getElementById(`modal-live-desc-${checkId}`);
  if (statusEl) {
    statusEl.classList.remove('diag-status-pending', 'diag-status-running', 'diag-status-ok', 'diag-status-issue');
    statusEl.classList.add(`diag-status-${status}`);
    const labelEl = statusEl.querySelector('.diag-status-label');
    if (labelEl) {
      if (status === 'running') labelEl.textContent = 'Diagnosting…';
      else if (status === 'ok') labelEl.textContent = 'PASS';
      else if (status === 'issue') labelEl.textContent = 'FAIL';
      else labelEl.textContent = 'Pending';
    }
  }
  if (descEl && typeof descText === 'string') {
    descEl.textContent = descText;
  }
}

function renderOrUpdateLiveChecksInModal(deviceId, record, isNew) {
  const metaEl = document.getElementById('modal-live-meta');
  const listEl = document.getElementById('modal-live-checks');
  const stepsEl = document.getElementById('modal-steps');
  if (!listEl) return;

  const inProgress = !!isNew && isFullDiagnosticInProgress(deviceId);
  if (metaEl) {
    metaEl.classList.toggle('hidden', !inProgress);
    if (inProgress) metaEl.textContent = 'Live checklist (updates as each check completes)…';
  }

  listEl.classList.toggle('hidden', !inProgress);
  if (stepsEl) {
    stepsEl.classList.toggle('hidden', inProgress);
  }

  if (!inProgress) {
    return;
  }

  if (listEl.dataset.initialised !== 'true') {
    const rows = LIVE_CHECKS.map(check => {
      const initialDesc = 'Pending…';
      return `
        <div class="diag-step" data-live-check="${check.id}">
          <div class="diag-step-main">
            <div class="diag-step-title"><span class="diag-step-icon">${check.icon || ''}</span>${check.title}</div>
            <div class="diag-step-desc" id="modal-live-desc-${check.id}">${initialDesc}</div>
          </div>
          <div class="diag-step-status diag-status-running" id="modal-live-status-${check.id}">
            <span class="diag-dot"></span>
            <span class="diag-status-label">Diagnosting…</span>
          </div>
        </div>`;
    });
    listEl.innerHTML = rows.join('');
    listEl.dataset.initialised = 'true';
  }

  LIVE_CHECKS.forEach(check => {
    const result = check.get(record);
    if (!result) {
      // While running, show a spinner for pending checks.
      setLiveCheckStatus(check.id, 'running', 'Checking…');
      return;
    }
    const status = result.issue ? 'issue' : 'ok';
    setLiveCheckStatus(check.id, status, result.text);
  });
}

function updateLiveDiagnosticModal(deviceId) {
  const modal = document.getElementById('diag-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  if (modal.dataset.deviceId !== String(deviceId)) return;
  if (typeof pendingResults === 'undefined') return;
  const record = pendingResults[deviceId];
  if (!record) return;
  const isNew = modal.dataset.isNew === '1';
  renderOrUpdateLiveChecksInModal(deviceId, record, isNew);
}

try {
  if (typeof window !== 'undefined') {
    window.updateLiveDiagnosticModal = updateLiveDiagnosticModal;
  }
} catch (e) {
  // ignore
}

function registerPendingDiagnosticResult(deviceId, deviceEl, payload) {
  const label = getDeviceLabelFromEl(deviceEl);
  const startedAt = Date.now();
  const fullDiagActive = isFullDiagnosticInProgress(deviceId);
  const minDelay = fullDiagActive ? 0 : 10000; // 10s
  const extra = fullDiagActive ? 0 : Math.floor(Math.random() * 20000); // 0-20s
  const revealDelayMs = minDelay + extra;
  // If a previous run exists, clear its stopwatch timer.
  const existingRun = currentRuns[deviceId];
  if (existingRun && existingRun.timerId) {
    clearInterval(existingRun.timerId);
  }

  currentRuns[deviceId] = {
    startedAt,
    revealDelayMs,
    timerId: null,
  };

  const autoSavedHistory =
    payload && payload.data && payload.data.autoSavedHistory
      ? payload.data.autoSavedHistory
      : null;

  const canonicalRunId =
    autoSavedHistory && autoSavedHistory.ok && Number.isFinite(Number(autoSavedHistory.runId))
      ? Number(autoSavedHistory.runId)
      : null;

  const recordTimestamp = canonicalRunId || startedAt;

  // Base diagnostic data from the /collect endpoint
  let counts = payload.counts || { high: 0, medium: 0, low: 0 };
  let diagStages = payload.data.diagStages || {};
  let diagDetails = payload.data.diagDetails || {};
  let textReport = payload.textReport || '';
  const onDeviceReport = payload.data.onDeviceReport || null;

  // Some collectors populate touch diagnostics in diagDetails but do not
  // always set a corresponding diagStages.touch. If we have enough touch
  // detail, synthesize a final stage so the UI doesn't stay stuck on
  // "Diagnosting…" and the completion gate can behave correctly.
  const computeTouchStageFromDetails = (details) => {
    const t = details && details.touch && typeof details.touch === 'object' ? details.touch : null;
    if (!t) return null;
    const hasDriverErrorsKnown = t.hasTouchDriverErrors != null;
    const hasAnomaliesKnown = t.hasInputAnomalies != null;
    if (!hasDriverErrorsKnown && !hasAnomaliesKnown) return null;

    const hasDriverErrors = !!t.hasTouchDriverErrors;
    const hasAnomalies = !!t.hasInputAnomalies;
    const issue = hasDriverErrors || hasAnomalies;

    let detailsText = '';
    if (typeof t.details === 'string' && t.details.trim()) {
      detailsText = t.details.trim();
    } else {
      const parts = [];
      if (hasDriverErrorsKnown) parts.push(hasDriverErrors ? 'Touch-driver errors found' : 'No touch-driver errors');
      if (hasAnomaliesKnown) parts.push(hasAnomalies ? 'Input anomalies found' : 'No input anomalies');
      detailsText = parts.join(' · ');
    }

    return {
      ok: !issue,
      label: !issue ? 'No clear touch-driver or input anomalies' : 'Possible touch / ghost touch issues',
      details: detailsText || undefined,
    };
  };

  try {
    const existingTouchStage = diagStages && diagStages.touch;
    const touchStageFinal =
      !!existingTouchStage &&
      (typeof existingTouchStage.ok === 'boolean' ||
        (typeof existingTouchStage.status === 'string' && /^(ok|issue|pass|fail)$/i.test(existingTouchStage.status)));
    if (!touchStageFinal) {
      const synthesized = computeTouchStageFromDetails(diagDetails);
      if (synthesized) {
        diagStages = { ...diagStages, touch: synthesized };
      }
    }
  } catch (e) {
    // best-effort only
  }

  // If an app security scan has already run for this device, merge its
  // findings into the overall diagnostic result so the Apps & Security
  // section shows real numbers.
  if (typeof securityScanByDevice !== 'undefined') {
    const sec = securityScanByDevice[deviceId];
    if (sec && typeof sec.appsScanned === 'number') {
      const appsScanned = sec.appsScanned;
      const riskyCount = typeof sec.riskyCount === 'number' ? sec.riskyCount : 0;
      const moderateCount = typeof sec.moderateCount === 'number' ? sec.moderateCount : 0;
      const safeCount = typeof sec.safeCount === 'number' ? sec.safeCount : 0;
      const suspiciousHigh = typeof sec.suspiciousHigh === 'number' ? sec.suspiciousHigh : 0;
      const suspiciousMedium = typeof sec.suspiciousMedium === 'number' ? sec.suspiciousMedium : 0;
      const suspiciousLow = typeof sec.suspiciousLow === 'number' ? sec.suspiciousLow : 0;
      const suspiciousTotal =
        typeof sec.suspiciousTotal === 'number'
          ? sec.suspiciousTotal
          : suspiciousHigh + suspiciousMedium + suspiciousLow;

      let secSummary = sec.summary;
      if (!secSummary) {
        if (suspiciousTotal > 0) {
          secSummary = `Apps scanned: ${appsScanned}. ${suspiciousTotal} suspicious app(s): ${suspiciousHigh} high, ${suspiciousMedium} medium, ${suspiciousLow} low risk.`;
        } else {
          secSummary = `Apps scanned: ${appsScanned}. ${riskyCount} risky, ${moderateCount} moderate, ${safeCount} safe.`;
        }
      }

      const scanOk = !(sec && (sec.scanOk === false || sec.error));

      const securityStage = {
        ok: scanOk && suspiciousTotal === 0 && riskyCount === 0 && moderateCount === 0,
        label: scanOk ? 'Apps & Security' : 'Apps scan failed',
        details: secSummary,
      };

      diagStages = {
        ...diagStages,
        security: securityStage,
      };

      diagDetails = {
        ...diagDetails,
        security: {
          appsScanned,
          riskyCount,
          moderateCount,
          safeCount,
          filesScanned: sec.filesScanned,
          suspiciousFiles: sec.suspiciousFiles,
          appsByRisk: sec.appsByRisk || null,
          suspiciousSamples: sec.suspiciousSamples || [],
          suspiciousApps: sec.suspiciousApps || [],
          suspiciousHigh,
          suspiciousMedium,
          suspiciousLow,
          suspiciousTotal,
          lines: sec.lines || [],
          summary: secSummary,
          error: sec && sec.error ? sec.error : undefined,
        },
      };

      counts = {
        high: (counts.high || 0) + riskyCount,
        medium: (counts.medium || 0) + moderateCount,
        low: (counts.low || 0) + safeCount,
      };

      const header = '\n\n=== App security scan ===\n';
      const perApp = sec.lines && sec.lines.length ? '\n' + sec.lines.join('\n') : '';
      textReport = (textReport || '') + header + secSummary + perApp;

      // If the security scan also provided a touchSummary, fold it into
      // the main diagnostic so the Touch / Ghost touch step can move
      // out of the initial "running" state once heuristics are ready.
      if (sec.touchSummary) {
        const ts = sec.touchSummary;
        const touchOk = !!ts.ok;

        diagStages = {
          ...diagStages,
          touch: {
            ok: touchOk,
            label: touchOk
              ? 'No clear touch-driver or input anomalies'
              : 'Possible touch / ghost touch issues',
            details: ts.details || undefined,
          },
        };

        diagDetails = {
          ...diagDetails,
          touch: {
            hasTouchDriverErrors: !!ts.hasTouchDriverErrors,
            hasInputAnomalies: !!ts.hasInputAnomalies,
            isChargingDuringLogs: !!ts.isChargingDuringLogs,
          },
        };
      }
    }
  }

  pendingResults[deviceId] = {
    id: recordTimestamp,
    deviceId,
    deviceLabel: label,
    timestamp: recordTimestamp,
    historyType: 'adb_full',
    counts,
    diagStages,
    diagDetails,
    onDeviceReport,
    textReport,
    autoSavedHistory,
    userProblem: (() => {
      try {
        if (typeof window !== 'undefined' && window.userProblemByDevice && window.userProblemByDevice[deviceId]) {
          return String(window.userProblemByDevice[deviceId] || '').trim();
        }
      } catch (e) {
        // ignore
      }
      return '';
    })(),
  };

  // If backend already auto-saved this run, refresh History tab data now.
  try {
    const autoSaved = payload && payload.data && payload.data.autoSavedHistory;
    if (autoSaved && autoSaved.ok && typeof renderHistoryList === 'function') {
      Promise.resolve(renderHistoryList(deviceId)).catch(() => {});
    }
    if (autoSaved && autoSaved.ok && typeof window !== 'undefined' && typeof window.renderHistoryBrowserModal === 'function') {
      Promise.resolve(window.renderHistoryBrowserModal({ preserveOpen: true })).catch(() => {});
    }
  } catch {
    // best-effort only
  }

  // If the live diagnostic modal is currently open for this device,
  // refresh the live checklist now that /collect has populated
  // diagDetails/diagStages.
  if (typeof window.updateLiveDiagnosticModal === 'function') {
    window.updateLiveDiagnosticModal(deviceId);
  }

  const metaEl = document.getElementById(`diag-meta-${deviceId}`);
  if (metaEl) {
    metaEl.textContent = 'Running full diagnostic… 0s elapsed';
  }

  // Start a simple stopwatch that updates the meta line with
  // elapsed time while diagnostics and app scans are running.
  const run = currentRuns[deviceId];
  if (run) {
    run.timerId = setInterval(() => {
      const meta = document.getElementById(`diag-meta-${deviceId}`);
      if (!meta) return;
      const elapsedMs = Date.now() - run.startedAt;
      const seconds = Math.floor(elapsedMs / 1000);
      meta.textContent = `Running full diagnostic… ${seconds}s elapsed`;
    }, 1000);
  }

  const delayRemaining = () => {
    const run = currentRuns[deviceId];
    if (!run) return 0;
    const elapsed = Date.now() - run.startedAt;
    return Math.max(0, run.revealDelayMs - elapsed);
  };

  const wait = delayRemaining();
  const checkAndOpen = () => {
    const record = pendingResults[deviceId];
    if (!record) return;

    const stages = (record && record.diagStages && typeof record.diagStages === 'object')
      ? record.diagStages
      : {};

    const isStageComplete = (key) => {
      const st = stages && stages[key];
      if (!st) return false;
      if (typeof st.ok === 'boolean') return true;
      if (typeof st.status === 'string') {
        const s = String(st.status).toLowerCase();
        return s === 'ok' || s === 'issue' || s === 'pass' || s === 'fail';
      }
      return false;
    };

    const allStagesComplete = Array.isArray(DIAGNOSTIC_SEQUENCE)
      ? DIAGNOSTIC_SEQUENCE.every(step => step && step.key ? isStageComplete(step.key) : true)
      : true;

    // If Apps & Security data has not yet been populated, wait a bit
    // longer so that the /apps scan has a chance to complete. This
    // prevents showing a modal with all zeros / "Not reported" for
    // security while the scan is still running.
    const sec = record.diagDetails && record.diagDetails.security;
    const hasAppSecurity = sec && (typeof sec.appsScanned === 'number' || (typeof sec.error === 'string' && sec.error.trim()));
    if (!hasAppSecurity) {
      setTimeout(checkAndOpen, 3000);
      return;
    }

    // Some devices return security results earlier than other stages.
    // Wait until all stages report a final state so we don't show
    // partial results as if the diagnostic already finished.
    const runInfo = currentRuns[deviceId];
    const elapsedMs = runInfo ? (Date.now() - runInfo.startedAt) : 0;
    const maxWaitMs = 150000; // 2.5 minutes safety cap
    if (!allStagesComplete && elapsedMs < maxWaitMs) {
      setTimeout(checkAndOpen, 2000);
      return;
    }

    // Stop the stopwatch now that all stages (including Apps &
    // Security) have completed, even though we are only now
    // revealing the results.
    const run = currentRuns[deviceId];
    if (run && run.timerId) {
      clearInterval(run.timerId);
      run.timerId = null;
    }

    // If backend already auto-saved the initial /collect snapshot,
    // persist the merged record now that Apps & Security has completed.
    // This ensures History includes suspicious/unsafe apps.
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

        const cacheKey = `${String(deviceId)}:${String(runId)}`;
        if (!adbHistoryFinalizedCache.has(cacheKey)) {
          adbHistoryFinalizedCache.add(cacheKey);

          let localToken = '';
          try {
            localToken = String(localStorage.getItem('smarthub.auth.localSessionToken') || '').trim();
          } catch {
            localToken = '';
          }

          const headers = { 'Content-Type': 'application/json' };
          if (localToken) {
            headers.Authorization = `Bearer ${localToken}`;
          }

          fetch(`http://localhost:3333/history/${encodeURIComponent(deviceId)}`, {
            method: 'POST',
            headers,
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
                Promise.resolve(renderHistoryList(deviceId)).catch(() => {});
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

    // Remember the reported problem in offline AI memory (best-effort).
    // This runs once per completed record to avoid duplicate inserts.
    try {
      const reported = record && record.userProblem ? String(record.userProblem || '').trim() : '';
      const key = `${String(deviceId)}:${String(record && record.timestamp ? record.timestamp : '')}`;
      if (reported && !adbAiRememberedCache.has(key)) {
        adbAiRememberedCache.add(key);
        const note = `Reported problem: ${reported}`.slice(0, 240);
        const rememberPayload = {
          deviceId: String(deviceId),
          deviceLabel: record && record.deviceLabel ? record.deviceLabel : undefined,
          timestamp: record && record.timestamp ? record.timestamp : undefined,
          counts: record && record.counts ? record.counts : undefined,
          diagStages: record && record.diagStages ? record.diagStages : undefined,
          diagDetails: record && record.diagDetails ? record.diagDetails : undefined,
          userProblem: reported,
          note,
        };

        fetch('http://localhost:3333/ai-adb-conclude-remember', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rememberPayload),
        }).catch(() => {
          // Ignore remember failures (offline helper might not be installed).
        });
      }
    } catch (e) {
      // Ignore remember failures.
    }

    // Full diagnostic is now complete for this device; allow the
    // summary tiles to show the final Security result and update the
    // Security card from the completed security details.
    try {
      if (typeof window.fullDiagInProgress === 'object' && window.fullDiagInProgress) {
        window.fullDiagInProgress[deviceId] = false;
      }

      const secDetails = record.diagDetails && record.diagDetails.security;
      if (secDetails) {
        const securityValueEl = document.getElementById(`security-value-${deviceId}`);
        const securityBadgeEl = document.getElementById(`security-badge-${deviceId}`);
        const securitySubEl = document.getElementById(`security-subtext-${deviceId}`);

        const suspiciousApps = Array.isArray(secDetails.suspiciousApps)
          ? secDetails.suspiciousApps
          : [];
        const highSuspicious =
          typeof secDetails.suspiciousHigh === 'number'
            ? secDetails.suspiciousHigh
            : suspiciousApps.filter(app => (app.threatLevel || '').toLowerCase() === 'high').length;
        const mediumSuspicious =
          typeof secDetails.suspiciousMedium === 'number'
            ? secDetails.suspiciousMedium
            : suspiciousApps.filter(app => (app.threatLevel || '').toLowerCase() === 'medium').length;
        const lowSuspicious =
          typeof secDetails.suspiciousLow === 'number'
            ? secDetails.suspiciousLow
            : suspiciousApps.filter(app => (app.threatLevel || '').toLowerCase() === 'low').length;

        if (securityBadgeEl) {
          securityBadgeEl.classList.remove(
            'summary-badge-safe',
            'summary-badge-warn',
            'summary-badge-danger',
          );
          if (highSuspicious > 0) {
            securityBadgeEl.classList.add('summary-badge-danger');
            securityBadgeEl.textContent = 'Issue';
            if (securityValueEl) securityValueEl.textContent = 'High Risk';
          } else if (mediumSuspicious > 0) {
            securityBadgeEl.classList.add('summary-badge-warn');
            securityBadgeEl.textContent = 'Warning';
            if (securityValueEl) securityValueEl.textContent = 'Moderate';
          } else if (lowSuspicious > 0) {
            securityBadgeEl.classList.add('summary-badge-warn');
            securityBadgeEl.textContent = 'Warning';
            if (securityValueEl) securityValueEl.textContent = 'Low Risk';
          } else {
            securityBadgeEl.classList.add('summary-badge-safe');
            securityBadgeEl.textContent = 'Safe';
            if (securityValueEl) securityValueEl.textContent = 'All Clear';
          }
        }

        if (securitySubEl) {
          const totalSuspicious = highSuspicious + mediumSuspicious + lowSuspicious;
          if (totalSuspicious > 0) {
            securitySubEl.textContent = `${totalSuspicious} suspicious app(s): ${highSuspicious} high, ${mediumSuspicious} medium, ${lowSuspicious} low risk.`;
          } else if (typeof secDetails.appsScanned === 'number') {
            securitySubEl.textContent = `${secDetails.appsScanned} apps scanned. No security threats detected.`;
          }
        }
      }
    } catch (e) {
      // UI updates are best-effort; failures here shouldn't block results.
      // eslint-disable-next-line no-console
      console.error('Failed to update Security summary at end of diagnostic', e);
    }

    openDiagnosticModal(deviceId, record, true);
    updateDiagStagesFromSummary(deviceId, record.diagStages);
  };

  setTimeout(checkAndOpen, wait);
}

function openDiagnosticModal(deviceId, record, isNew) {
  const modal = document.getElementById('diag-modal');
  if (!modal || !record) return;

  const titleEl = document.getElementById('modal-device-title');
  const subtitleEl = document.getElementById('modal-device-subtitle');
  const summaryEl = document.getElementById('modal-summary');
  const userProblemEl = document.getElementById('modal-user-problem');
  const stepsEl = document.getElementById('modal-steps');
  const reportEl = document.getElementById('modal-report');
  const detailEl = document.getElementById('modal-detail');
  const saveBtn = document.getElementById('modal-save-btn');

  const escapeHtml = str =>
    String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const pick = v => (v === null || v === undefined || v === '' ? null : v);
  const formatGbFromKb = kb => {
    const num = Number(kb);
    if (!Number.isFinite(num) || num <= 0) return null;
    return `${(num / (1024 * 1024)).toFixed(1)} GB`;
  };
  const formatC = c => {
    const num = Number(c);
    if (!Number.isFinite(num)) return null;
    return `${num.toFixed(1)}°C`;
  };
  const addKv = (arr, label, value) => {
    const v = pick(value);
    if (v === null) return;
    arr.push({ label, value: String(v) });
  };
  const renderKvList = items => {
    if (!items || !items.length) return '';
    const cards = items
      .map(i => {
        return `
          <div class="av-kv">
            <div class="av-kv-label">${escapeHtml(i.label)}</div>
            <div class="av-kv-value">${escapeHtml(i.value)}</div>
          </div>`;
      })
      .join('');
    return `<div class="av-kv-list">${cards}</div>`;
  };
  const buildInlineDetails = stepKey => {
    const d = (record && record.diagDetails) || {};
    const out = [];

    if (stepKey === 'battery') {
      const b = d.battery || {};
      addKv(out, '❤️ Health', b.health);
      addKv(out, '🔁 Cycle count', b.cycleCount);
      addKv(out, '🔋 Charge', b.level != null ? `${b.level}%` : null);
      addKv(out, '🌡️ Temp', b.temperatureC != null ? formatC(b.temperatureC) : null);
      addKv(out, '🧪 Capacity', b.capacityMah != null ? `${b.capacityMah} mAh` : null);
    } else if (stepKey === 'display') {
      const s = d.display || {};
      if (s.width && s.height) addKv(out, '🧾 Resolution', `${s.width}×${s.height}`);
      if (typeof s.diagonalInches === 'number') addKv(out, '📏 Screen size', `${s.diagonalInches.toFixed(1)}\"`);
      if (s.issueReason) addKv(out, '⚠ Pipeline log signal', s.issueReason);
    } else if (stepKey === 'touch') {
      const t = d.touch || {};
      if (t.hasTouchDriverErrors != null) addKv(out, '🧩 Driver errors', t.hasTouchDriverErrors ? 'Present' : 'Not present');
      if (t.hasInputAnomalies != null) addKv(out, '⚡ Ghost-touch', t.hasInputAnomalies ? 'Present' : 'Not present');
      if (t.isChargingDuringLogs != null) addKv(out, '🔌 Charging', t.isChargingDuringLogs ? 'Yes' : 'No');
    } else if (stepKey === 'sensors') {
      const s = d.sensors || {};
      addKv(out, '📦 Sensors', s.sensorCount != null ? `~${s.sensorCount}` : null);
      if (s.hasAccelerometer != null) addKv(out, '📈 Accelerometer', s.hasAccelerometer ? 'Present' : 'Not present');
      if (s.hasGyroscope != null) addKv(out, '🧭 Gyroscope', s.hasGyroscope ? 'Present' : 'Not present');
    } else if (stepKey === 'connectivity') {
      const c = d.connectivity || {};
      if (c.hasWifi != null) addKv(out, '📶 Wi‑Fi', c.hasWifi ? 'Present' : 'Not present');
      if (c.hasBluetooth != null) addKv(out, '🟦 Bluetooth', c.hasBluetooth ? 'Present' : 'Not present');
      if (c.hasGps != null) addKv(out, '🛰️ GPS', c.hasGps ? 'Present' : 'Not present');
      if (c.hasMobile != null) addKv(out, '📡 Mobile data', c.hasMobile ? 'Present' : 'Not present');
    } else if (stepKey === 'hardware') {
      const h = d.hardware || {};
      if (h.hasFingerprint != null) addKv(out, '🫆 Fingerprint', h.hasFingerprint ? 'Present' : 'Not present');
      if (h.hasNfc != null) addKv(out, '📳 NFC', h.hasNfc ? 'Present' : 'Not present');
      if (h.hasMicrophone != null) addKv(out, '🎙️ Microphone', h.hasMicrophone ? 'Present' : 'Not present');
    } else if (stepKey === 'system') {
      const s = d.system || {};
      const ram = formatGbFromKb(s.memTotalKb);
      addKv(out, '🧠 RAM', ram);
      if (s.hasStorageIssue != null) addKv(out, '💾 Storage', s.hasStorageIssue ? 'Near full' : 'OK');
      if (s.hasCrashIssue != null) addKv(out, '🧾 Crash/ANR', s.hasCrashIssue ? 'Detected' : 'None');
    } else if (stepKey === 'os') {
      const o = d.os || {};
      addKv(out, '🤖 Android', o.androidVersion);
      addKv(out, '🔒 Verified boot', o.verifiedBootState);
      if (o.bootloaderLocked != null) addKv(out, '🔓 Bootloader', o.bootloaderLocked ? 'Locked' : 'Unlocked');
    } else if (stepKey === 'security') {
      const s = d.security || {};
      if (s.suspiciousTotal != null) addKv(out, '🛡️ Suspicious apps', s.suspiciousTotal);
      else if (s.suspiciousHigh != null || s.suspiciousMedium != null || s.suspiciousLow != null) {
        const total = Number(s.suspiciousHigh || 0) + Number(s.suspiciousMedium || 0) + Number(s.suspiciousLow || 0);
        if (Number.isFinite(total)) addKv(out, '🛡️ Suspicious apps', total);
      }
    }

    return out;
  };

  const date = new Date(record.timestamp || Date.now());
  if (titleEl) titleEl.textContent = record.deviceLabel || deviceId;
  if (subtitleEl) subtitleEl.textContent = `${isNew ? 'Live diagnostic' : 'Saved run'} · ${date.toLocaleString()}`;

  modal.dataset.deviceId = String(deviceId);
  modal.dataset.isNew = isNew ? '1' : '0';

  const inProgress = !!isNew && isFullDiagnosticInProgress(deviceId);

  if (userProblemEl) {
    const reported = record && record.userProblem ? String(record.userProblem || '').trim() : '';
    if (reported) {
      userProblemEl.classList.remove('hidden');
      userProblemEl.innerHTML = `
        <div class="ai-result-box ui-fade-in">
          <div class="ai-result-title">
            <strong>📝 Reported problem</strong>
          </div>
          <div class="ai-result-meta">${escapeHtml(reported)}</div>
        </div>`;
    } else {
      userProblemEl.classList.add('hidden');
      userProblemEl.innerHTML = '';
    }
  }

  // Best-effort offline AI: show a single overall conclusion.
  try {
    renderAdbAiConclusion(deviceId, record, inProgress);
  } catch (e) {
    // ignore
  }

  const high = record.counts && record.counts.high ? record.counts.high : 0;
  const medium = record.counts && record.counts.medium ? record.counts.medium : 0;
  const low = record.counts && record.counts.low ? record.counts.low : 0;
  const issues = high + medium;
  if (summaryEl) {
    if (inProgress) {
      summaryEl.textContent = 'Diagnostic running… live checks will update below.';
    } else {
      summaryEl.textContent = issues
        ? `${issues} issue(s) detected · ${high} high, ${medium} medium, ${low} low`
        : 'All categories reported OK.';
    }
  }

  if (stepsEl) {
    const headerTitle = inProgress ? 'Scan in progress' : 'Scan results';
    const headerSub = inProgress
      ? 'Running full diagnostic…'
      : (issues
        ? `${issues} issue(s) detected · ${high} high, ${medium} medium, ${low} low`
        : 'No issues detected');

    const rows = DIAGNOSTIC_SEQUENCE.map(step => {
      const stage = record.diagStages ? record.diagStages[step.key] : null;
      let status = stage && stage.status ? stage.status : null;
      if (!status) {
        if (inProgress) status = 'running';
        else if (stage) status = stage.ok ? 'ok' : 'issue';
        else status = 'pending';
      }

      // Normalize alternate status tokens to keep labels consistent.
      const normalizedStatus = (() => {
        const s = String(status || '').toLowerCase();
        if (s === 'pass') return 'ok';
        if (s === 'fail') return 'issue';
        if (s === 'ok' || s === 'issue' || s === 'running' || s === 'pending') return s;
        return status;
      })();

      const detailsText = stage && stage.details ? stage.details : step.desc;
      const inline = buildInlineDetails(step.key);
      const detailsHtml = inline && inline.length
        ? renderKvList(inline)
        : `<span>${escapeHtml(detailsText)}</span>`;
      const statusClass =
        normalizedStatus === 'running'
          ? 'modal-steps-status-running'
          : normalizedStatus === 'pending'
            ? 'modal-steps-status-pending'
            : normalizedStatus === 'issue'
              ? 'modal-steps-status-issue'
              : 'modal-steps-status-ok';
      const statusLabel =
        normalizedStatus === 'running' ? 'Running…' : normalizedStatus === 'pending' ? '' : normalizedStatus === 'issue' ? 'FAIL' : 'PASS';
      const attentionHint = normalizedStatus === 'issue' ? 'Tap for reason and recommended fix' : '';
      const statusToken = ['ok', 'issue', 'running', 'pending'].includes(String(normalizedStatus))
        ? String(normalizedStatus)
        : 'pending';
      return `
        <div class="modal-steps-row clickable status-${statusToken}" data-step="${step.key}">
          <div class="modal-steps-main">
            <div class="modal-steps-title">${step.icon || ''} ${step.title}</div>
            <div class="modal-steps-desc">${detailsHtml}${attentionHint ? `<div class="av-hint">${escapeHtml(attentionHint)}</div>` : ''}</div>
          </div>
          <div class="${statusClass}">${statusLabel}</div>
        </div>`;
    });
    stepsEl.innerHTML = `
      <div class="av-scan-summary">
        <div class="av-scan-summary-main">
          <div class="av-scan-title">${headerTitle}</div>
          <div class="av-scan-sub">${headerSub}</div>
        </div>
        <div class="av-scan-stats">
          <div class="av-stat">
            <div class="av-stat-value">${high}</div>
            <div class="av-stat-label">High</div>
          </div>
          <div class="av-stat">
            <div class="av-stat-value">${medium}</div>
            <div class="av-stat-label">Medium</div>
          </div>
          <div class="av-stat">
            <div class="av-stat-value">${low}</div>
            <div class="av-stat-label">Low</div>
          </div>
        </div>
      </div>
      <div class="av-result-list">
        ${rows.join('')}
      </div>`;

    // Reset detail view when reopening modal
    if (detailEl) {
      detailEl.classList.add('hidden');
      detailEl.innerHTML = '';
    }

    // Attach click handlers for per-stage details
    stepsEl.querySelectorAll('.modal-steps-row.clickable').forEach(row => {
      const key = row.getAttribute('data-step');
      if (!key) return;
      row.addEventListener('click', () => {
        showModalStepDetail(key, record);
      });
    });
  }

  if (reportEl) {
    reportEl.textContent = record.textReport || '';
  }

  if (saveBtn) {
    const autoSaved = !!(record && record.autoSavedHistory && record.autoSavedHistory.ok);
    saveBtn.disabled = autoSaved || !isNew || inProgress;
    saveBtn.textContent = autoSaved
      ? 'Auto-saved'
      : !isNew
        ? 'Saved'
        : inProgress
          ? 'Save to history'
          : 'Save to history';

    if (isNew && !autoSaved) {
      saveBtn.onclick = async () => {
        try {
          if (!record.historyType) {
            record.historyType = 'adb_full';
          }

          let localToken = '';
          try {
            localToken = String(localStorage.getItem('smarthub.auth.localSessionToken') || '').trim();
          } catch {
            localToken = '';
          }

          const headers = { 'Content-Type': 'application/json' };
          if (localToken) {
            headers.Authorization = `Bearer ${localToken}`;
          }

          const res = await fetch(`http://localhost:3333/history/${encodeURIComponent(deviceId)}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(record),
          });
          const body = await res.json().catch(() => null);
          if (!res.ok) {
            const reason = (body && (body.error || body.message))
              ? String(body.error || body.message)
              : `HTTP ${res.status}`;
            throw new Error(reason);
          }

          renderHistoryList(deviceId);
          if (typeof window !== 'undefined' && typeof window.renderHistoryBrowserModal === 'function') {
            Promise.resolve(window.renderHistoryBrowserModal({ preserveOpen: true })).catch(() => {});
          }
          saveBtn.disabled = true;
          saveBtn.textContent = 'Saved';
        } catch (e) {
          console.error('Failed to save history', e);
          const msg = e && e.message
            ? `Save to history failed: ${e.message}`
            : 'Save to history failed.';
          try {
            alert(msg);
          } catch {
            // ignore
          }
        }
      };
    } else {
      saveBtn.onclick = null;
    }
  }

  // Live checklist section for antivirus-style progress
  try {
    const liveList = document.getElementById('modal-live-checks');
    if (liveList) {
      // Re-render when opening a modal for a new device.
      if (liveList.dataset.deviceId !== String(deviceId)) {
        liveList.dataset.initialised = 'false';
        liveList.dataset.deviceId = String(deviceId);
      }
    }
    renderOrUpdateLiveChecksInModal(deviceId, record, isNew);
  } catch (e) {
    console.error('Failed to render live checklist', e);
  }

  modal.classList.remove('hidden');
}

function showModalStepDetail(stepKey, record) {
  const detailModalEl = document.getElementById('diag-step-detail-modal');
  const detailEl = document.getElementById('diag-step-detail-content');
  if (!detailModalEl || !detailEl) return;

  const diagDetails = (record && record.diagDetails) || {};

  function presenceLabel(stageObj, flag) {
    if (!stageObj) return 'Not reported';
    if (flag == null) return 'Not reported';
    return flag ? 'Present' : 'Not present';
  }

  function valueOrNA(v) {
    if (v === null || v === undefined || v === '') return 'Not reported';
    return String(v);
  }

  let bodyHtml = '';
  if (stepKey === 'battery') {
    const b = diagDetails.battery || {};
    const fields = [
      { icon: '🔋', label: 'Battery name/type', value: b.name || 'Not reported' },
      { icon: '🔌', label: 'Percent', value: b.level != null ? `${b.level}%` : 'Not reported' },
      {
        icon: '🌡️',
        label: 'Temperature',
        value: b.temperatureC != null ? `${b.temperatureC.toFixed(1)}°C` : 'Not reported',
      },
      { icon: '❤️', label: 'Battery health', value: valueOrNA(b.health) },
      {
        icon: '🧪',
        label: 'Estimated capacity',
        value: b.capacityMah != null ? `${b.capacityMah} mAh (approx)` : 'Not reported',
      },
      {
        icon: '🔁',
        label: 'Cycle count',
        value: b.cycleCount != null ? String(b.cycleCount) : 'Not reported',
      },
      {
        icon: '⚡',
        label: 'Charging efficiency',
        value: valueOrNA(b.chargingEfficiency),
      },
    ];

    bodyHtml = `
      <div class="modal-detail-header">
        <div>
          <div class="modal-detail-title">🔋 Battery Health/Stress Test</div>
          <div class="modal-detail-subtitle">Summary of current battery readings from the device.</div>
        </div>
        <button class="modal-detail-back" type="button">← Back to overview</button>
      </div>
      <div class="modal-detail-grid">
        ${fields
          .map(
            f => `
            <div class="modal-detail-item">
              <div class="modal-detail-label">${f.icon ? `<span class=\"modal-detail-icon\">${f.icon}</span>` : ''}${f.label}</div>
              <div class="modal-detail-value">${f.value}</div>
            </div>`
          )
          .join('')}
      </div>
      <ul class="modal-detail-list">
        <li>Monitors charge level, temperature and health codes reported by Android.</li>
        <li>Highlights overheating or unhealthy batteries that may need service.</li>
        <li>If the phone powers off right when unplugged, suspect a loose battery connector, weak battery, or unstable power path/PMIC (even if boot reason shows "watchdog").</li>
      </ul>`;
  } else if (stepKey === 'display') {
    const d = diagDetails.display || {};
    const displayStage = record && record.diagStages && record.diagStages.display
      ? record.diagStages.display
      : null;
    const res = d.width && d.height ? `${d.width} x ${d.height} px` : 'Not reported';
    const diag =
      typeof d.diagonalInches === 'number' ? `${d.diagonalInches.toFixed(1)}" (approx)` : 'Not reported';
    const area =
      typeof d.areaCm2 === 'number' ? `${d.areaCm2.toFixed(1)} cm² (approx)` : 'Not reported';
    const issueReason = (d && typeof d.issueReason === 'string' && d.issueReason.trim())
      ? d.issueReason.trim()
      : ((displayStage && !displayStage.ok && typeof displayStage.details === 'string' && displayStage.details.trim())
          ? displayStage.details.trim()
          : '');
    const pipelineStatus = displayStage
      ? (displayStage.ok
          ? 'No major display pipeline errors found in current logs.'
          : (issueReason || 'Display pipeline warnings were detected in logs.'))
      : 'Not reported';
    const pipelineStatusHtml = String(pipelineStatus)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const existingScreenImage = record && record.screenTestImage ? record.screenTestImage : null;
    let screenPreview = '<span class="modal-detail-value">No screen test capture saved yet.</span>';
    if (existingScreenImage) {
      const isAbsolute = /^https?:\/\//i.test(existingScreenImage);
      const src = isAbsolute ? existingScreenImage : `http://localhost:3333${existingScreenImage}`;
      screenPreview = `<img class="screen-test-preview-img" src="${src}" alt="Screen test capture" />`;
    }

    bodyHtml = `
      <div class="modal-detail-header">
        <div>
          <div class="modal-detail-title">🖥️ Display & Touchscreen</div>
          <div class="modal-detail-subtitle">Resolution and size based on system display diagnostics.</div>
        </div>
        <button class="modal-detail-back" type="button">← Back to overview</button>
      </div>
      <div class="modal-detail-grid">
        <div class="modal-detail-item">
          <div class="modal-detail-label">Resolution</div>
          <div class="modal-detail-value">${res}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Screen size</div>
          <div class="modal-detail-value">${diag}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Approx. area</div>
          <div class="modal-detail-value">${area}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Pipeline log status</div>
          <div class="modal-detail-value">${pipelineStatusHtml}</div>
        </div>
      </div>
      <div class="modal-detail-section">
        <div class="modal-detail-label">Screen test capture</div>
        <div class="modal-detail-value">
          <button type="button" class="screen-test-button">Capture current screen</button>
          <div class="modal-detail-hint">Ask the user to open a solid colour or problem area on the phone, then capture to keep a visual record of cracks, lines, or dead pixels.</div>
          <div class="screen-test-preview">${screenPreview}</div>
        </div>
      </div>
      <ul class="modal-detail-list">
        <li>Checks for dead pixels and display pipeline issues from system logs.</li>
        <li>Helps verify color accuracy (Red, Green, Blue) and basic screen responsiveness.</li>
      </ul>`;
  } else if (stepKey === 'touch') {
    const t = diagDetails.touch || {};
    const driverErrors = t.hasTouchDriverErrors == null
      ? 'Not reported'
      : t.hasTouchDriverErrors
        ? 'Present (driver/controller reported problems)'
        : 'Not present in recent logs';
    const anomalies = t.hasInputAnomalies == null
      ? 'Not reported'
      : t.hasInputAnomalies
        ? 'Present (abnormal touch / pointer behaviour)'
        : 'Not present in recent logs';
    const charging = t.isChargingDuringLogs == null
      ? 'Not reported'
      : t.isChargingDuringLogs
        ? 'Yes (charging during diagnostics)'
        : 'No';

    bodyHtml = `
      <div class="modal-detail-header">
        <div>
          <div class="modal-detail-title">👆 Touch / Ghost touch</div>
          <div class="modal-detail-subtitle">Heuristics from logs to help explain possible ghost touch.</div>
        </div>
        <button class="modal-detail-back" type="button">← Back to overview</button>
      </div>
      <div class="modal-detail-grid">
        <div class="modal-detail-item">
          <div class="modal-detail-label">Touch driver errors in logs</div>
          <div class="modal-detail-value">${driverErrors}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Ghost-touch style anomalies</div>
          <div class="modal-detail-value">${anomalies}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Device charging during logs</div>
          <div class="modal-detail-value">${charging}</div>
        </div>
      </div>
      <ul class="modal-detail-list">
        <li>Ghost touch is usually caused by a faulty digitizer, damaged flex cable, liquid, or poor-quality charger.</li>
        <li>This test cannot see the physical glass, but it checks for driver and input errors that often appear with ghost touch.</li>
        <li>If issues only occur while charging, suspect charger/cable or grounding; if logs show driver faults even on battery, suspect screen/digitizer hardware.</li>
      </ul>`;
  } else if (stepKey === 'sensors') {
    const s = diagDetails.sensors || {};
    bodyHtml = `
      <div class="modal-detail-header">
        <div>
          <div class="modal-detail-title">📡 Sensors</div>
          <div class="modal-detail-subtitle">Sensor service snapshot from the device.</div>
        </div>
        <button class="modal-detail-back" type="button">← Back to overview</button>
      </div>
      <div class="modal-detail-grid">
        <div class="modal-detail-item">
          <div class="modal-detail-label">Sensors reported (approx)</div>
          <div class="modal-detail-value">${
            s.sensorCount != null ? `~${s.sensorCount} sensors` : 'Not reported'
          }</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Accelerometer</div>
          <div class="modal-detail-value">${presenceLabel(s, s.hasAccelerometer)}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Gyroscope</div>
          <div class="modal-detail-value">${presenceLabel(s, s.hasGyroscope)}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Barometer</div>
          <div class="modal-detail-value">${presenceLabel(s, s.hasBarometer)}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Magnetometer</div>
          <div class="modal-detail-value">${presenceLabel(s, s.hasMagnetometer)}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Proximity sensor</div>
          <div class="modal-detail-value">${presenceLabel(s, s.hasProximitySensor)}</div>
        </div>
      </div>
      <ul class="modal-detail-list">
        <li>The count is a rough estimate of entries listed by Android's sensor service (varies by model).</li>
        <li>Tests accelerometer, gyroscope, barometer, and magnetometer for orientation and movement tracking.</li>
      </ul>`;
  } else if (stepKey === 'camera') {
    const c = diagDetails.camera || {};
    bodyHtml = `
      <div class="modal-detail-header">
        <div>
          <div class="modal-detail-title">🎥 Camera & Microphone</div>
          <div class="modal-detail-subtitle">Camera service descriptors from the system.</div>
        </div>
        <button class="modal-detail-back" type="button">← Back to overview</button>
      </div>
      <div class="modal-detail-grid">
        <div class="modal-detail-item">
          <div class="modal-detail-label">Detected camera devices (approx)</div>
          <div class="modal-detail-value">${
            c.descriptorCount != null ? `~${c.descriptorCount} camera entries` : 'Not reported'
          }</div>
        </div>
      </div>
      <ul class="modal-detail-list">
        <li>This is a rough count of camera-related entries returned by Android's camera service.</li>
        <li>Verifies front/rear camera registration and basic flash support through system metadata.</li>
        <li>Ensures microphone paths are available for audio recording.</li>
      </ul>`;
  } else if (stepKey === 'connectivity') {
    const c = diagDetails.connectivity || {};
    bodyHtml = `
      <div class="modal-detail-header">
        <div>
          <div class="modal-detail-title">📶 Connectivity</div>
          <div class="modal-detail-subtitle">Detected connectivity stacks from dumpsys connectivity.</div>
        </div>
        <button class="modal-detail-back" type="button">← Back to overview</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div class="modal-detail-item" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
          <div style="flex: 1 1 auto; min-width: 200px;">
            <div class="modal-detail-label">Wi‑Fi</div>
            <div class="modal-detail-value">${presenceLabel(c, c.hasWifi)}</div>
          </div>
          <div style="flex: 0 0 auto; display:flex; flex-direction:column; gap:6px; min-width: 200px;">
            <button class="btn-collect compact js-wifi-stability" type="button">Run Wi‑Fi stability</button>
            <button class="btn-collect compact js-wifi-fix-phone" type="button">Fix phone Wi‑Fi</button>
            <button class="btn-collect compact js-wifi-channels" type="button">Suggest Wi‑Fi channel</button>
            <button class="btn-collect compact js-wifi-band" type="button">Switch Wi‑Fi band</button>
            <button class="btn-collect compact js-wifi-forget" type="button">Forget this Wi‑Fi</button>
            <button class="btn-collect compact js-wifi-rogue" type="button">Rogue AP check</button>
            <button class="btn-collect compact js-wifi-captive" type="button">Open captive portal</button>
          </div>
        </div>

        <div class="modal-detail-item" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
          <div style="flex: 1 1 auto; min-width: 200px;">
            <div class="modal-detail-label">Bluetooth</div>
            <div class="modal-detail-value">${presenceLabel(c, c.hasBluetooth)}</div>
          </div>
          <div style="flex: 0 0 auto; display:flex; flex-direction:column; gap:6px; min-width: 200px;">
            <button class="btn-collect compact js-bt-reset" type="button">Reset Bluetooth</button>
            <button class="btn-collect compact js-bt-diagnose" type="button">Diagnose Bluetooth</button>
            <button class="btn-collect compact js-bt-force-stop" type="button">Force-stop Bluetooth</button>
            <button class="btn-collect compact js-bt-clear-cache" type="button">Clear Bluetooth cache</button>
          </div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">NFC</div>
          <div class="modal-detail-value">${presenceLabel(c, c.hasNfc)}</div>
        </div>
        <div class="modal-detail-item" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
          <div style="flex: 1 1 auto; min-width: 200px;">
            <div class="modal-detail-label">GPS</div>
            <div class="modal-detail-value">${presenceLabel(c, c.hasGps)}</div>
          </div>
          <div style="flex: 0 0 auto; display:flex; flex-direction:column; gap:6px; min-width: 200px;">
            <button class="btn-collect compact js-gps-reset" type="button">Reset GPS/Location</button>
          </div>
        </div>
        <div class="modal-detail-item" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
          <div style="flex: 1 1 auto; min-width: 200px;">
            <div class="modal-detail-label">Mobile data</div>
            <div class="modal-detail-value">${presenceLabel(c, c.hasMobile)}</div>
          </div>
          <div style="flex: 0 0 auto; display:flex; flex-direction:column; gap:6px; min-width: 200px;">
            <button class="btn-collect compact js-data-reset" type="button">Reset mobile data</button>
          </div>
        </div>
      </div>
      <ul class="modal-detail-list">
        <li>Checks Wi‑Fi, Bluetooth, NFC, and GPS functionality from system connectivity services.</li>
        <li>Manual tools: nothing runs automatically; use buttons if you choose.</li>
      </ul>`;
  } else if (stepKey === 'hardware') {
    const h = diagDetails.hardware || {};
    bodyHtml = `
      <div class="modal-detail-header">
        <div>
          <div class="modal-detail-title">⚙️ Hardware Components</div>
          <div class="modal-detail-subtitle">Advertised hardware features from the device.</div>
        </div>
        <button class="modal-detail-back" type="button">← Back to overview</button>
      </div>
      <div class="modal-detail-grid">
        <div class="modal-detail-item">
          <div class="modal-detail-label">Fingerprint sensor</div>
          <div class="modal-detail-value">${presenceLabel(h, h.hasFingerprint)}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">NFC</div>
          <div class="modal-detail-value">${presenceLabel(h, h.hasNfc)}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Accelerometer</div>
          <div class="modal-detail-value">${presenceLabel(h, h.hasAccelerometer)}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Gyroscope</div>
          <div class="modal-detail-value">${presenceLabel(h, h.hasGyroscope)}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Microphone</div>
          <div class="modal-detail-value">${presenceLabel(h, h.hasMicrophone)}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Speaker output</div>
          <div class="modal-detail-value">${presenceLabel(h, h.hasSpeaker)}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Proximity sensor</div>
          <div class="modal-detail-value">${presenceLabel(h, h.hasProximitySensor)}</div>
        </div>
      </div>
      <ul class="modal-detail-list">
        <li>Tests physical buttons (volume, power), vibration motor, speakers, and fingerprint sensors indirectly via hardware feature flags.</li>
      </ul>`;
  } else if (stepKey === 'system') {
    const s = diagDetails.system || {};
    const memStr =
      typeof s.memTotalKb === 'number'
        ? `${(s.memTotalKb / (1024 * 1024)).toFixed(1)} GB RAM (approx)`
        : 'Not reported';

    bodyHtml = `
      <div class="modal-detail-header">
        <div>
          <div class="modal-detail-title">🚀 System & Performance</div>
          <div class="modal-detail-subtitle">Health snapshot of CPU, RAM and storage.</div>
        </div>
        <button class="modal-detail-back" type="button">← Back to overview</button>
      </div>
      <div class="modal-detail-grid">
        <div class="modal-detail-item">
          <div class="modal-detail-label">RAM</div>
          <div class="modal-detail-value">${memStr}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Storage warnings</div>
          <div class="modal-detail-value">${s.hasStorageIssue ? 'Storage near full' : 'None detected'}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Crash / ANR logs</div>
          <div class="modal-detail-value">${s.hasCrashIssue ? 'Recent events detected' : 'None detected'}</div>
        </div>
      </div>
      <ul class="modal-detail-list">
        <li>Analyzes CPU, RAM usage (via memory totals) and storage health.</li>
        <li>Looks for crash / ANR patterns that may impact performance.</li>
      </ul>`;
  } else if (stepKey === 'os') {
    const o = diagDetails.os || {};
    const androidVersion = o.androidVersion || 'Not reported';
    const buildFp = o.buildFingerprint || 'Not reported';
    const customBuild = o.isCustomBuild ? 'Yes (test-keys or custom image)' : 'No';
    const verifiedBoot = o.verifiedBootState || 'Not reported';
    const bootloaderLocked =
      o.bootloaderLocked === true ? 'Locked' : o.bootloaderLocked === false ? 'Unlocked' : 'Not reported';
    const fsIssues = o.hasFsError ? 'Filesystem errors reported' : 'None detected in logs';
    const verityIssues = o.hasVerityIssue ? 'Integrity / dm-verity warnings present' : 'None detected';
    const coreCrashes = o.hasCoreServiceCrashes
      ? 'Core Android services crashed (system_server / zygote)'
      : 'None detected';

    const onDev = record && record.onDeviceReport && record.onDeviceReport.report;
    let onDeviceHtml = '';
    if (onDev) {
      const onSummary = typeof onDev.summary === 'string' && onDev.summary.trim()
        ? onDev.summary.trim()
        : 'On-device app report available.';
      const generatedAt = typeof onDev.generatedAt === 'number' && onDev.generatedAt > 0
        ? new Date(onDev.generatedAt).toLocaleString()
        : null;
      const sourcePath = record.onDeviceReport.sourcePath || '';

      const metaParts = [];
      if (generatedAt) metaParts.push(`Generated: ${generatedAt}`);
      if (sourcePath) metaParts.push(`Path: ${sourcePath}`);

      const metaText = metaParts.length ? metaParts.join(' · ') : '';

      onDeviceHtml = `
      <div class="modal-detail-section">
        <div class="modal-detail-label">On-device app report</div>
        <div class="modal-detail-value">
          <div class="modal-detail-hint">Summary from SmartHub Mobile Diagnostics (running directly on the phone):</div>
          <div>${onSummary}</div>
          ${metaText ? `<div class="modal-detail-hint">${metaText}</div>` : ''}
        </div>
      </div>`;
    }

    bodyHtml = `
      <div class="modal-detail-header">
        <div>
          <div class="modal-detail-title">🧩 OS / Filesystem Health</div>
          <div class="modal-detail-subtitle">Heuristics from system logs and build information.</div>
        </div>
        <button class="modal-detail-back" type="button">← Back to overview</button>
      </div>
      <div class="modal-detail-grid">
        <div class="modal-detail-item">
          <div class="modal-detail-label">Android version</div>
          <div class="modal-detail-value">${androidVersion}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Custom / test build</div>
          <div class="modal-detail-value">${customBuild}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Verified boot state</div>
          <div class="modal-detail-value">${verifiedBoot}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Bootloader</div>
          <div class="modal-detail-value">${bootloaderLocked}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Filesystem errors</div>
          <div class="modal-detail-value">${fsIssues}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Integrity (dm-verity)</div>
          <div class="modal-detail-value">${verityIssues}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Core service crashes</div>
          <div class="modal-detail-value">${coreCrashes}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Build fingerprint</div>
          <div class="modal-detail-value">${buildFp}</div>
        </div>
      </div>
      ${onDeviceHtml}
      <ul class="modal-detail-list">
        <li>Looks for filesystem and integrity errors in logcat that can indicate corrupted system partitions.</li>
        <li>Highlights repeated crashes of core Android services that often accompany faulty or modified OS images.</li>
      </ul>`;
  } else if (stepKey === 'security') {
    const s = diagDetails.security || {};
    const appsScanned = s.appsScanned != null ? s.appsScanned : 'Not reported';
    const risky = s.riskyCount != null ? s.riskyCount : 0;
    const moderate = s.moderateCount != null ? s.moderateCount : 0;
    const safe = s.safeCount != null ? s.safeCount : 0;
    const filesScanned = s.filesScanned != null ? s.filesScanned : 'Not reported';
    const suspiciousFiles = s.suspiciousFiles != null ? s.suspiciousFiles : 0;

    const appsByRisk = s.appsByRisk || {};
    const suspiciousApps = Array.isArray(s.suspiciousApps) ? s.suspiciousApps : [];

    // Derive visible lists from suspicious apps only so technicians
    // see just the real risk items, not all safe packages.
    const suspiciousListAll = suspiciousApps;
    const riskyList = suspiciousApps.filter(a => (a.threatLevel || '').toLowerCase() === 'high');
    const moderateList = suspiciousApps.filter(
      a => (a.threatLevel || '').toLowerCase() === 'medium',
    );
    const lowList = suspiciousApps.filter(a => (a.threatLevel || '').toLowerCase() === 'low');
    const suspiciousHigh = typeof s.suspiciousHigh === 'number' ? s.suspiciousHigh : 0;
    const suspiciousMedium = typeof s.suspiciousMedium === 'number' ? s.suspiciousMedium : 0;
    const suspiciousLow = typeof s.suspiciousLow === 'number' ? s.suspiciousLow : 0;
    const suspiciousTotal =
      typeof s.suspiciousTotal === 'number'
        ? s.suspiciousTotal
        : suspiciousHigh + suspiciousMedium + suspiciousLow;

    const escapeHtml = str =>
      String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const encodeAttr = v => encodeURIComponent(String(v ?? ''));

    function renderAppList(title, items) {
      if (!items || !items.length) return '';
      const lis = items
        .map(app => {
          const name = app.displayName || app.name || '(unknown app)';
          const pkg = app.packageName || '';
          const score = typeof app.score === 'number' ? app.score : 0;
          const scoreText = score > 0 ? ` · score ${score}/100` : '';
          const pkgText = pkg ? ` (${pkg})` : '';

          const reason = app.reason || '';
          const suggestedAction = app.suggestedAction || '';
          const threat = app.threatLevel || '';

          return `
            <li class="app-list-item">
              <span class="app-list-main">${escapeHtml(name)}${escapeHtml(pkgText)}${escapeHtml(scoreText)}</span>
              <span class="app-list-actions">
                <button
                  class="compact app-view-btn"
                  type="button"
                  data-app-name="${encodeAttr(name)}"
                  data-app-pkg="${encodeAttr(pkg)}"
                  data-app-threat="${encodeAttr(threat)}"
                  data-app-reason="${encodeAttr(reason)}"
                  data-app-action="${encodeAttr(suggestedAction)}"
                  title="View details and uninstall">
                  View
                </button>
              </span>
            </li>`;
        })
        .join('');
      return `
        <div class="modal-detail-section">
          <div class="modal-detail-label">${title}</div>
          <div class="modal-detail-value">
            <ul class="modal-detail-list">${lis}</ul>
          </div>
        </div>`;
    }

    // Only list apps that were actually flagged as suspicious.
    const anyApps = suspiciousListAll.length > 0;

    bodyHtml = `
      <div class="modal-detail-header">
        <div>
          <div class="modal-detail-title">🛡️ Apps & Security</div>
          <div class="modal-detail-subtitle">Summary of installed apps and suspicious behaviour.</div>
        </div>
        <button class="modal-detail-back" type="button">← Back to overview</button>
      </div>
      <div class="modal-detail-grid">
        <div class="modal-detail-item">
          <div class="modal-detail-label"><span class="modal-detail-icon">📦</span>Apps scanned</div>
          <div class="modal-detail-value">${appsScanned}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label"><span class="modal-detail-icon">🛡️</span>Suspicious apps</div>
          <div class="modal-detail-value">${suspiciousTotal}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label"><span class="modal-detail-icon">🔥</span>High-risk apps</div>
          <div class="modal-detail-value">${suspiciousHigh}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label"><span class="modal-detail-icon">⚠️</span>Medium-risk apps</div>
          <div class="modal-detail-value">${suspiciousMedium}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label"><span class="modal-detail-icon">ℹ️</span>Low-risk apps</div>
          <div class="modal-detail-value">${suspiciousLow}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label"><span class="modal-detail-icon">📁</span>Files scanned</div>
          <div class="modal-detail-value">${filesScanned}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label"><span class="modal-detail-icon">🚩</span>Flagged files</div>
          <div class="modal-detail-value">${suspiciousFiles}</div>
        </div>
      </div>
      <div class="modal-detail-item" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div style="flex: 1 1 auto; min-width: 200px;">
          <div class="modal-detail-label">App Behavior Analysis</div>
          <div class="modal-detail-value">Checks battery drain, wake locks, crash patterns, and permissions that affect background behavior.</div>
        </div>
        <div style="flex: 0 0 auto; display:flex; flex-direction:column; gap:6px; min-width: 220px;">
          <button class="btn-collect compact js-app-behavior-scan" type="button">Run app behavior analysis</button>
        </div>
      </div>
      ${anyApps
        ? `
      <div class="modal-detail-section">
        <div class="modal-detail-label">App risk breakdown</div>
        <div class="modal-detail-value modal-detail-hint">Based on suspicious apps only. High and medium-risk apps should be reviewed or removed if not trusted. Low-risk apps are listed for awareness.</div>
      </div>
      ${renderAppList('Suspicious apps (all levels)', suspiciousListAll)}
      ${renderAppList('High-risk apps', riskyList)}
      ${renderAppList('Medium-risk apps', moderateList)}
      ${renderAppList('Low-risk apps', lowList)}`
        : `
      <div class="modal-detail-section">
        <div class="modal-detail-label">App risk breakdown</div>
        <div class="modal-detail-value modal-detail-hint">No app risk data reported yet. Run a full Apps & Security scan for this device to populate this section.</div>
      </div>`}
      <ul class="modal-detail-list">
        <li>Scans installed apps and requested permissions for potentially dangerous behaviour.</li>
        <li>Flags apps with powerful capabilities such as SMS, call control, overlay windows, or full storage access.</li>
        <li>Walks user storage for file names and extensions that commonly indicate risky tools or payloads.</li>
      </ul>`;
  } else {
    return;
  }

  detailEl.innerHTML = bodyHtml;
  detailModalEl.classList.remove('hidden');

  const backBtn = detailEl.querySelector('.modal-detail-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      detailModalEl.classList.add('hidden');
    });
  }

  if (stepKey === 'display') {
    const btn = detailEl.querySelector('.screen-test-button');
    const preview = detailEl.querySelector('.screen-test-preview');
    if (btn && record && record.deviceId) {
      btn.addEventListener('click', async () => {
        if (!record.deviceId) return;
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = 'Capturing…';
        if (preview) {
          preview.innerHTML = '<span class="modal-detail-value">Capturing screen…</span>';
        }
        try {
          const res = await fetch(
            `http://localhost:3333/screen-test/${encodeURIComponent(record.deviceId)}`,
            { method: 'POST' },
          );
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const data = await res.json();
          if (data && (data.imageUrl || data.imagePath)) {
            const imgUrl = data.imageUrl || `http://localhost:3333${data.imagePath}`;
            if (preview) {
              preview.innerHTML = `<img class="screen-test-preview-img" src="${imgUrl}" alt="Screen test capture" />`;
            }
            record.screenTestImage = imgUrl;
          } else if (preview) {
            preview.innerHTML = '<span class="modal-detail-value">Capture completed, but no image path was returned.</span>';
          }
        } catch (err) {
          console.error('Screen test capture failed:', err);
          if (preview) {
            preview.innerHTML = '<span class="modal-detail-value">Screen capture failed. Check that the companion service is running and adb can capture the screen.</span>';
          }
        } finally {
          btn.disabled = false;
          btn.textContent = originalText || 'Capture current screen';
        }
      });
    }
  }

  if (stepKey === 'connectivity') {
    const wifiRunBtn = detailEl.querySelector('.js-wifi-stability');
    const wifiFixPhoneBtn = detailEl.querySelector('.js-wifi-fix-phone');
    const wifiChannelsBtn = detailEl.querySelector('.js-wifi-channels');
    const wifiBandBtn = detailEl.querySelector('.js-wifi-band');
    const wifiForgetBtn = detailEl.querySelector('.js-wifi-forget');
    const wifiRogueBtn = detailEl.querySelector('.js-wifi-rogue');
    const wifiCaptiveBtn = detailEl.querySelector('.js-wifi-captive');
    const btResetBtn = detailEl.querySelector('.js-bt-reset');
    const btDiagnoseBtn = detailEl.querySelector('.js-bt-diagnose');
    const btForceStopBtn = detailEl.querySelector('.js-bt-force-stop');
    const btClearCacheBtn = detailEl.querySelector('.js-bt-clear-cache');
    const gpsResetBtn = detailEl.querySelector('.js-gps-reset');
    const dataResetBtn = detailEl.querySelector('.js-data-reset');

    const currentDeviceId = (() => {
      const fromRecord = record && record.deviceId ? String(record.deviceId).trim() : '';
      if (fromRecord) return fromRecord;
      const diagModal = document.getElementById('diag-modal');
      const fromDataset = diagModal && diagModal.dataset && diagModal.dataset.deviceId ? String(diagModal.dataset.deviceId).trim() : '';
      return fromDataset;
    })();

    const showText = (title, message) => {
      const text = message != null ? String(message) : '';
      try {
        if (typeof window !== 'undefined' && typeof window.showMessageModal === 'function') {
          window.showMessageModal({
            title,
            subtitle: currentDeviceId ? `Device: ${currentDeviceId}` : '',
            message: text,
          });
          return;
        }
      } catch {
        // ignore
      }

      try {
        alert(`${title}\n\n${text}`);
      } catch {
        // ignore
      }
    };

    const summarizeWifiStability = (body) => {
      if (!body || body.ok !== true) return 'Wi‑Fi: Broken';
      const stable = !!(body.stability && body.stability.stable);
      return stable ? 'Wi‑Fi: Working' : 'Wi‑Fi: Broken';
    };

    const summarizeWifiChannels = (body) => {
      if (!body || body.ok !== true) return 'Could not read Wi‑Fi scan results.';
      const w = body.wifi || {};
      const scan = body.scan || {};
      const c24 = scan.congestion && scan.congestion.band24 ? scan.congestion.band24 : null;
      const c5 = scan.congestion && scan.congestion.band5 ? scan.congestion.band5 : null;
      const s = scan.suggestions || {};
      const lines = [];
      if (w.ssid) lines.push(`SSID: ${w.ssid}`);
      if (w.currentBand || w.currentChannel) {
        const ch = w.currentChannel ? `ch ${w.currentChannel}` : 'ch ?';
        const band = w.currentBand || 'band ?';
        const rssi = (typeof w.rssiDbm === 'number') ? `${w.rssiDbm} dBm` : '';
        lines.push(`Current: ${band} ${ch}${rssi ? ` · ${rssi}` : ''}`);
      }
      if (typeof scan.networksObserved === 'number') lines.push(`Nearby networks observed: ${scan.networksObserved}`);

      const fmtTop = (top) => {
        if (!Array.isArray(top) || !top.length) return 'No data';
        return top.slice(0, 5).map(t => `ch ${t.channel}: ${t.count}`).join(', ');
      };

      if (c24) lines.push(`2.4GHz congestion: ${fmtTop(c24.top)}`);
      if (Array.isArray(s.best24) && s.best24.length) lines.push(`Suggested 2.4GHz channel(s): ${s.best24.join(', ')}`);
      if (c5) lines.push(`5GHz congestion: ${fmtTop(c5.top)}`);
      if (Array.isArray(s.best5) && s.best5.length) lines.push(`Suggested 5GHz channel(s): ${s.best5.join(', ')}`);

      lines.push('Note: channel choice is done on the router/AP (phone cannot force it reliably).');
      return lines.join('\n');
    };

    const summarizeRogueApCheck = (body) => {
      if (!body || body.ok !== true) return 'Rogue AP check failed.';
      const wifi = body.wifi || {};
      const verdict = body.verdict && body.verdict.verdict ? body.verdict.verdict : 'Inconclusive';
      const lines = [];
      lines.push(`Result: ${verdict}`);
      if (wifi.ssid) lines.push(`SSID: ${wifi.ssid}`);
      if (wifi.gateway) lines.push(`Gateway: ${wifi.gateway}`);
      if (body.arp && (body.arp.gatewayMacFirst || body.arp.gatewayMacSecond)) {
        const a = body.arp.gatewayMacFirst || '(unknown)';
        const b = body.arp.gatewayMacSecond || '(unknown)';
        lines.push(`Gateway MAC: ${a} → ${b}`);
      }
      const reasons = Array.isArray(body.reasons) ? body.reasons : [];
      reasons.slice(0, 6).forEach(r => lines.push(`- ${r}`));
      return lines.join('\n');
    };

    const summarizeBluetoothDiagnose = (body) => {
      if (!body || body.ok !== true) return 'Bluetooth diagnose failed.';
      const bt = body.bluetooth || {};
      const s = bt.summary || {};
      const lines = [];
      if (bt.state) lines.push(`State: ${bt.state}`);
      if (bt.enabled != null) lines.push(`Enabled: ${bt.enabled ? 'Yes' : 'No'}`);
      if (typeof s.bondedCount === 'number') lines.push(`Paired devices: ${s.bondedCount}`);
      if (typeof s.connectedCount === 'number') lines.push(`Connected devices: ${s.connectedCount}`);

      const devices = Array.isArray(bt.devices) ? bt.devices : [];
      const connected = devices.filter(d => d && d.connected);
      const show = connected.length ? connected : devices;
      show.slice(0, 6).forEach(d => {
        const name = d.name || d.address || 'Device';
        const bits = [];
        if (d.connected) bits.push('connected');
        if (typeof d.batteryLevelPct === 'number') bits.push(`battery ${d.batteryLevelPct}%`);
        if (typeof d.rssiDbm === 'number') bits.push(`rssi ${d.rssiDbm} dBm`);
        lines.push(`- ${name}${bits.length ? ` (${bits.join(', ')})` : ''}`);
      });

      const notes = Array.isArray(bt.notes) ? bt.notes : [];
      if (notes.length) lines.push(`Note: ${notes[0]}`);
      return lines.join('\n');
    };

    const requireDeviceId = () => {
      if (currentDeviceId) return true;
      showText('Wi‑Fi tools', 'No deviceId available for this modal. Close and re-open the diagnostic modal from the device card, then try again.');
      return false;
    };

    const summarizeSteps = (label, body) => {
      if (!body || body.ok !== true) return `${label}: Failed`;
      const steps = Array.isArray(body.steps) ? body.steps : [];
      const lines = [];
      lines.push(`${label}: Done`);
      if (steps.length) {
        steps.slice(0, 8).forEach(s => {
          const name = s && s.label ? String(s.label) : 'Step';
          const ok = s && s.ok === true;
          lines.push(`- ${name}: ${ok ? 'OK' : 'FAIL'}`);
        });
      }
      return lines.join('\n');
    };

    const runWifiFix = async (btn, title, payload) => {
      if (!btn) return;
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'Working…';
      try {
        if (!requireDeviceId()) return;
        const res = await fetch(`http://localhost:3333/wifi/fix/${encodeURIComponent(currentDeviceId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload || {}),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          const reason = body && (body.error || body.message) ? String(body.error || body.message) : `HTTP ${res.status}`;
          throw new Error(reason);
        }
        showText(title, summarizeSteps(title, body));
      } catch (e) {
        showText(`${title} failed`, e && e.message ? String(e.message) : 'Request failed');
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    };

    if (wifiRunBtn) {
      wifiRunBtn.addEventListener('click', async () => {
        if (!requireDeviceId()) return;
        wifiRunBtn.disabled = true;
        const original = wifiRunBtn.textContent;
        wifiRunBtn.textContent = 'Running…';
        try {
          const res = await fetch(`http://localhost:3333/wifi/diagnose/${encodeURIComponent(currentDeviceId)}`, {
            method: 'GET',
            cache: 'no-store',
          });
          const body = await res.json().catch(() => null);
          if (!res.ok) {
            const reason = body && (body.error || body.message) ? String(body.error || body.message) : `HTTP ${res.status}`;
            throw new Error(reason);
          }
          showText('Wi‑Fi stability', summarizeWifiStability(body));
        } catch (e) {
          showText('Wi‑Fi stability failed', e && e.message ? String(e.message) : 'Request failed');
        } finally {
          wifiRunBtn.disabled = false;
          wifiRunBtn.textContent = original;
        }
      });
    }

    if (wifiFixPhoneBtn) {
      wifiFixPhoneBtn.addEventListener('click', async () => {
        if (!requireDeviceId()) return;
        wifiFixPhoneBtn.disabled = true;
        const original = wifiFixPhoneBtn.textContent;
        wifiFixPhoneBtn.textContent = 'Fixing…';
        try {
          const res = await fetch(`http://localhost:3333/wifi/fix/${encodeURIComponent(currentDeviceId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'dhcp_renew' }),
          });
          const body = await res.json().catch(() => null);
          if (!res.ok) {
            const reason = body && (body.error || body.message) ? String(body.error || body.message) : `HTTP ${res.status}`;
            throw new Error(reason);
          }
          showText('Phone Wi‑Fi fix', summarizeSteps('Wi‑Fi fix', body));
        } catch (e) {
          showText('Phone Wi‑Fi fix failed', e && e.message ? String(e.message) : 'Request failed');
        } finally {
          wifiFixPhoneBtn.disabled = false;
          wifiFixPhoneBtn.textContent = original;
        }
      });
    }

    if (wifiChannelsBtn) {
      wifiChannelsBtn.addEventListener('click', async () => {
        if (!requireDeviceId()) return;
        wifiChannelsBtn.disabled = true;
        const original = wifiChannelsBtn.textContent;
        wifiChannelsBtn.textContent = 'Reading…';
        try {
          const res = await fetch(`http://localhost:3333/wifi/channels/${encodeURIComponent(currentDeviceId)}`, {
            method: 'GET',
            cache: 'no-store',
          });
          const body = await res.json().catch(() => null);
          if (!res.ok) {
            const reason = body && (body.error || body.message) ? String(body.error || body.message) : `HTTP ${res.status}`;
            throw new Error(reason);
          }
          showText('Wi‑Fi channel suggestion', summarizeWifiChannels(body));
        } catch (e) {
          showText('Wi‑Fi channel suggestion failed', e && e.message ? String(e.message) : 'Request failed');
        } finally {
          wifiChannelsBtn.disabled = false;
          wifiChannelsBtn.textContent = original;
        }
      });
    }

    if (wifiRogueBtn) {
      wifiRogueBtn.addEventListener('click', async () => {
        if (!requireDeviceId()) return;
        wifiRogueBtn.disabled = true;
        const original = wifiRogueBtn.textContent;
        wifiRogueBtn.textContent = 'Checking…';
        try {
          const res = await fetch(`http://localhost:3333/wifi/rogue-ap-check/${encodeURIComponent(currentDeviceId)}`, {
            method: 'GET',
            cache: 'no-store',
          });
          const body = await res.json().catch(() => null);
          if (!res.ok) {
            const reason = body && (body.error || body.message) ? String(body.error || body.message) : `HTTP ${res.status}`;
            throw new Error(reason);
          }
          showText('Rogue AP check', summarizeRogueApCheck(body));
        } catch (e) {
          showText('Rogue AP check failed', e && e.message ? String(e.message) : 'Request failed');
        } finally {
          wifiRogueBtn.disabled = false;
          wifiRogueBtn.textContent = original;
        }
      });
    }

    if (wifiCaptiveBtn) {
      wifiCaptiveBtn.addEventListener('click', () => {
        runWifiFix(wifiCaptiveBtn, 'Open captive portal', { action: 'open_captive_portal' });
      });
    }

    if (wifiForgetBtn) {
      wifiForgetBtn.addEventListener('click', () => {
        const ok = (() => {
          try {
            return confirm('This will forget the currently connected Wi‑Fi network on the phone. You may need to re-enter the password. Continue?');
          } catch {
            return true;
          }
        })();
        if (!ok) return;
        runWifiFix(wifiForgetBtn, 'Forget Wi‑Fi', { action: 'forget_current' });
      });
    }

    if (wifiBandBtn) {
      wifiBandBtn.addEventListener('click', async () => {
        let raw = '';
        try {
          raw = prompt('Prefer Wi‑Fi band: enter 5 for 5GHz, or 2.4 for 2.4GHz', '5') || '';
        } catch {
          raw = '5';
        }
        const v = String(raw || '').trim();
        const band = v === '2.4' || v === '2' ? '2.4' : v === '5' ? '5' : '';
        if (!band) {
          showText('Switch Wi‑Fi band', 'Cancelled (invalid band).');
          return;
        }
        await runWifiFix(wifiBandBtn, 'Switch Wi‑Fi band', { action: 'prefer_band', band });
      });
    }

    const runAndroidFix = async (btn, title, action, label) => {
      if (!btn) return;
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'Fixing…';
      try {
        if (!requireDeviceId()) return;
        const res = await fetch(`http://localhost:3333/android-connectivity/fix/${encodeURIComponent(currentDeviceId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          const reason = body && (body.error || body.message) ? String(body.error || body.message) : `HTTP ${res.status}`;
          throw new Error(reason);
        }
        showText(title, summarizeSteps(label, body));
      } catch (e) {
        showText(`${title} failed`, e && e.message ? String(e.message) : 'Request failed');
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    };

    if (btResetBtn) {
      btResetBtn.addEventListener('click', () => {
        runAndroidFix(btResetBtn, 'Bluetooth reset', 'bluetooth_reset', 'Bluetooth fix');
      });
    }

    if (btDiagnoseBtn) {
      btDiagnoseBtn.addEventListener('click', async () => {
        if (!requireDeviceId()) return;
        btDiagnoseBtn.disabled = true;
        const original = btDiagnoseBtn.textContent;
        btDiagnoseBtn.textContent = 'Reading…';
        try {
          const res = await fetch(`http://localhost:3333/android-connectivity/diagnose/${encodeURIComponent(currentDeviceId)}?target=bluetooth`, {
            method: 'GET',
            cache: 'no-store',
          });
          const body = await res.json().catch(() => null);
          if (!res.ok) {
            const reason = body && (body.error || body.message) ? String(body.error || body.message) : `HTTP ${res.status}`;
            throw new Error(reason);
          }
          showText('Bluetooth diagnose', summarizeBluetoothDiagnose(body));
        } catch (e) {
          showText('Bluetooth diagnose failed', e && e.message ? String(e.message) : 'Request failed');
        } finally {
          btDiagnoseBtn.disabled = false;
          btDiagnoseBtn.textContent = original;
        }
      });
    }

    if (btForceStopBtn) {
      btForceStopBtn.addEventListener('click', () => {
        runAndroidFix(btForceStopBtn, 'Force-stop Bluetooth', 'bluetooth_force_stop', 'Bluetooth fix');
      });
    }

    if (btClearCacheBtn) {
      btClearCacheBtn.addEventListener('click', () => {
        const ok = (() => {
          try {
            return confirm('This will clear Bluetooth app data on the phone (may remove pairings on some devices). Continue?');
          } catch {
            return true;
          }
        })();
        if (!ok) return;
        runAndroidFix(btClearCacheBtn, 'Clear Bluetooth cache', 'bluetooth_clear_cache', 'Bluetooth fix');
      });
    }

    if (gpsResetBtn) {
      gpsResetBtn.addEventListener('click', () => {
        runAndroidFix(gpsResetBtn, 'GPS/Location reset', 'gps_reset', 'GPS/Location fix');
      });
    }

    if (dataResetBtn) {
      dataResetBtn.addEventListener('click', () => {
        runAndroidFix(dataResetBtn, 'Mobile data reset', 'mobile_data_reset', 'Mobile data fix');
      });
    }
  }

  if (stepKey === 'security') {
    const modal = document.getElementById('app-view-modal');
    const behaviorBtn = detailEl.querySelector('.js-app-behavior-scan');
    const closeBtn = document.getElementById('app-view-close-btn');
    const cancelBtn = document.getElementById('app-view-cancel-btn');
    const uninstallBtn = document.getElementById('app-view-uninstall-btn');
    const titleEl = document.getElementById('app-view-modal-title');
    const subtitleEl = document.getElementById('app-view-modal-subtitle');
    const nameEl = document.getElementById('app-view-name');
    const pkgEl = document.getElementById('app-view-pkg');
    const riskEl = document.getElementById('app-view-risk');
    const causeEl = document.getElementById('app-view-cause');
    const actionEl = document.getElementById('app-view-action');
    const statusEl = document.getElementById('app-view-status');

    const deviceId = record && record.deviceId ? String(record.deviceId) : '';

    const setStatus = (kind, msg) => {
      if (!statusEl) return;
      statusEl.classList.remove('hidden');
      statusEl.textContent = msg || '';
      statusEl.style.borderRadius = '12px';
      statusEl.style.border = '1px solid rgba(148, 163, 184, 0.45)';
      statusEl.style.padding = '10px 12px';
      statusEl.style.background =
        kind === 'error'
          ? 'rgba(185, 28, 28, 0.08)'
          : kind === 'ok'
            ? 'rgba(22, 163, 74, 0.08)'
            : 'rgba(14, 165, 233, 0.08)';
      statusEl.style.color = kind === 'error' ? 'var(--danger)' : 'var(--text)';
      statusEl.style.fontSize = '12px';
      statusEl.style.lineHeight = '1.45';
    };

    const hideStatus = () => {
      if (!statusEl) return;
      statusEl.classList.add('hidden');
      statusEl.textContent = '';
    };

    const showBehaviorResult = (title, body) => {
      const msg = body && typeof body.text === 'string' && body.text.trim()
        ? body.text.trim()
        : 'No app behavior details were returned.';
      showText(title, msg);
    };

    const closeModal = () => {
      if (modal) modal.classList.add('hidden');
    };

    if (closeBtn && !closeBtn.__appViewBound) {
      closeBtn.__appViewBound = true;
      closeBtn.addEventListener('click', closeModal);
    }
    if (cancelBtn && !cancelBtn.__appViewBound) {
      cancelBtn.__appViewBound = true;
      cancelBtn.addEventListener('click', closeModal);
    }

    const viewButtons = detailEl.querySelectorAll('.app-view-btn');
    viewButtons.forEach(btn => {
      if (btn.__appViewBound) return;
      btn.__appViewBound = true;
      btn.addEventListener('click', () => {
        if (!modal) return;
        hideStatus();

        const decodeAttr = raw => {
          try {
            return decodeURIComponent(String(raw || ''));
          } catch {
            return String(raw || '');
          }
        };

        const appName = decodeAttr(btn.getAttribute('data-app-name')) || '(unknown app)';
        const appPkg = decodeAttr(btn.getAttribute('data-app-pkg')) || '';
        const threat = decodeAttr(btn.getAttribute('data-app-threat')) || '';
        const reason = decodeAttr(btn.getAttribute('data-app-reason')) || '';
        const action = decodeAttr(btn.getAttribute('data-app-action')) || '';

        if (titleEl) titleEl.textContent = 'App details';
        if (subtitleEl) {
          subtitleEl.textContent = deviceId ? `Device: ${deviceId}` : 'Requires a connected device to uninstall.';
        }
        if (nameEl) nameEl.textContent = appName;
        if (pkgEl) pkgEl.textContent = appPkg ? `Package: ${appPkg}` : 'Package: (not reported)';
        if (riskEl) riskEl.textContent = threat ? `Risk: ${String(threat).toUpperCase()}` : 'Risk: (not reported)';
        if (causeEl) causeEl.textContent = reason || 'No reason text provided for this app.';
        if (actionEl) actionEl.textContent = action || 'No recommended action provided.';

        if (uninstallBtn) {
          uninstallBtn.disabled = !deviceId || !appPkg;
          uninstallBtn.textContent = 'Uninstall';
          uninstallBtn.setAttribute('data-device-id', deviceId);
          uninstallBtn.setAttribute('data-package-name', appPkg);
        }

        modal.classList.remove('hidden');
      });
    });

    if (uninstallBtn && !uninstallBtn.__appViewBound) {
      uninstallBtn.__appViewBound = true;
      uninstallBtn.addEventListener('click', async () => {
        const id = uninstallBtn.getAttribute('data-device-id') || '';
        const pkg = uninstallBtn.getAttribute('data-package-name') || '';
        if (!id || !pkg) {
          setStatus('error', 'Missing device id or package name.');
          return;
        }

        uninstallBtn.disabled = true;
        const original = uninstallBtn.textContent;
        uninstallBtn.textContent = 'Uninstalling…';
        setStatus('info', `Running ADB uninstall for ${pkg}…`);

        try {
          const res = await fetch('http://localhost:3333/adb-uninstall', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: id, packageName: pkg }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data || data.ok === false) {
            const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
            throw new Error(msg);
          }

          const out = data && data.output ? String(data.output) : 'Success';
          setStatus('ok', `Uninstall completed. Device response: ${out}`);
          uninstallBtn.textContent = 'Uninstalled';
        } catch (e) {
          setStatus('error', `Uninstall failed: ${e && e.message ? e.message : String(e)}`);
          uninstallBtn.textContent = original || 'Uninstall';
          uninstallBtn.disabled = false;
        }
      });
    }

    if (behaviorBtn && !behaviorBtn.__appBehaviorBound) {
      behaviorBtn.__appBehaviorBound = true;
      behaviorBtn.addEventListener('click', async () => {
        if (!deviceId) {
          showText('App behavior analysis', 'No device id available for this modal.');
          return;
        }

        behaviorBtn.disabled = true;
        const original = behaviorBtn.textContent;
        behaviorBtn.textContent = 'Analyzing…';
        hideStatus();

        try {
          const res = await fetch(`http://localhost:3333/app-behavior/scan/${encodeURIComponent(deviceId)}`, {
            method: 'GET',
            cache: 'no-store',
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data || data.ok === false) {
            const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
            throw new Error(msg);
          }

          if (record && record.diagDetails && record.diagDetails.security) {
            record.diagDetails.security.appBehavior = data.details || undefined;
          }
          showBehaviorResult('App behavior analysis', data);
        } catch (e) {
          showText('App behavior analysis failed', e && e.message ? String(e.message) : 'Request failed');
        } finally {
          behaviorBtn.disabled = false;
          behaviorBtn.textContent = original || 'Run app behavior analysis';
        }
      });
    }
  }

  // AI suggestions button intentionally hidden (UX request).
}

function runSequentialDiagnosticsForDevice(deviceEl) {
  const idAttr = deviceEl.dataset.id;
  if (!idAttr) return;
  const deviceId = idAttr;

  const container = ensureDiagStepsContainer(deviceId);
  if (!container) return;

  const outEl = document.getElementById(`out-${deviceId}`);
  if (outEl) {
    outEl.textContent = 'Running full diagnostic sequence…';
  }

   // Mark a full diagnostic as in progress for this device so that
   // summary tiles (especially Security) can avoid showing a final
   // result while checks are still running.
  if (typeof window.fullDiagInProgress === 'undefined') {
    window.fullDiagInProgress = {};
  }
  window.fullDiagInProgress[deviceId] = true;

  // Intentionally do not open the modal while diagnostics are running.
  // The modal is revealed once Apps & Security finishes, to avoid
  // showing partial/incomplete results during the run.

  // While a full diagnostic is running, keep the Security summary
  // card in a neutral "waiting" state so previous or partial app
  // results are not shown yet.
  const securityValueEl = document.getElementById(`security-value-${deviceId}`);
  const securityBadgeEl = document.getElementById(`security-badge-${deviceId}`);
  const securitySubEl = document.getElementById(`security-subtext-${deviceId}`);

  if (securityBadgeEl) {
    securityBadgeEl.classList.remove('summary-badge-safe', 'summary-badge-warn', 'summary-badge-danger');
    securityBadgeEl.classList.add('summary-badge-safe');
    securityBadgeEl.textContent = 'Waiting…';
  }
  if (securityValueEl) {
    securityValueEl.textContent = 'Waiting for Apps & Security scan…';
  }
  if (securitySubEl) {
    securitySubEl.textContent = 'Apps & Security diagnostic is still running. Results will appear once the scan has finished.';
  }

  const collectBtn = deviceEl.querySelector('.collect');
  const appsBtn = deviceEl.querySelector('.apps');

  // Mark all steps as running immediately while backend work executes
  DIAGNOSTIC_SEQUENCE.forEach(step => setDiagStatus(deviceId, step.key, 'running'));

  // Kick off the automated backend checks
  if (collectBtn) collectBtn.click();
  if (appsBtn) appsBtn.click();

  // Also trigger a background file scan to enrich the Apps & Security
  // stage with file-level heuristics.
  if (typeof runFileScanForDevice === 'function') {
    runFileScanForDevice(deviceId);
  }
}

async function runFileScanForDevice(deviceId) {
  try {
    const res = await fetch(`http://localhost:3333/file-scan/${encodeURIComponent(deviceId)}`);
    if (!res.ok) return;
    const data = await res.json();

    const totalFiles = typeof data.totalFiles === 'number' ? data.totalFiles : null;
    const suspiciousFiles = typeof data.suspiciousFiles === 'number' ? data.suspiciousFiles : null;
    const suspiciousSamples = Array.isArray(data.suspiciousSamples) ? data.suspiciousSamples : [];

    if (typeof securityScanByDevice !== 'undefined') {
      const existing = securityScanByDevice[deviceId] || {};
      securityScanByDevice[deviceId] = {
        ...existing,
        filesScanned: totalFiles,
        suspiciousFiles,
        suspiciousSamples,
      };
    }

    if (typeof pendingResults !== 'undefined') {
      const record = pendingResults[deviceId];
      if (record) {
        const diagDetails = record.diagDetails || {};
        const secDetails = diagDetails.security || {};
        diagDetails.security = {
          ...secDetails,
          filesScanned: totalFiles,
          suspiciousFiles,
        };
        record.diagDetails = diagDetails;

        const diagStages = record.diagStages || {};
        const baseSummary =
          (diagStages.security && diagStages.security.details) ||
          (data.summary || 'File scan completed.');
        diagStages.security = {
          ok: (suspiciousFiles || 0) === 0 && !!(diagStages.security ? diagStages.security.ok : true),
          label: (suspiciousFiles || 0) === 0 ? 'Apps & files look clean' : 'Apps/files need attention',
          details: baseSummary,
        };
        record.diagStages = diagStages;

        const header = '\n\n=== File scan (user storage) ===\n';
        const samples = suspiciousSamples.length
          ? '\nExamples (paths):\n' + suspiciousSamples.join('\n')
          : '';
        record.textReport = (record.textReport || '') + header + (data.summary || '') + samples;

        if (typeof window.updateLiveDiagnosticModal === 'function') {
          window.updateLiveDiagnosticModal(deviceId);
        }
      }
    }
  } catch (err) {
    // Best-effort: file scan failures should not break the main diagnostic.
    // eslint-disable-next-line no-console
    console.error('runFileScanForDevice failed:', err);
  }
}
