// js/aiConclusion.js
// Displays AI conclusion with optional on‑the‑fly translation.

import { translateConclusionLocal, translateTextLocal } from './localTranslator.mjs';

// ---- Helpers ----
function escapeHtml(str) {
    if (str == null) return '';
    if (typeof str !== 'string') str = String(str);
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
}

function t(key, fallback) {
    if (typeof window.t === 'function') {
        const result = window.t(key);
        if (result && result !== key) return result;
    }
    if (window.SmartHubI18n && typeof window.SmartHubI18n.t === 'function') {
        const result = window.SmartHubI18n.t(key, window._activeLang || 'en');
        if (result && result !== key) return result;
    }
    return fallback || key;
}

function timeAgo(iso) {
    if (!iso) return '';
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return t('ai.time.justNow', 'Just now');
    if (mins < 60) return t('ai.time.minutesAgo', '{mins} minutes ago').replace('{mins}', mins);
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t('ai.time.hoursAgo', '{hrs} hours ago').replace('{hrs}', hrs);
    const days = Math.floor(hrs / 24);
    return t('ai.time.daysAgo', '{days} days ago').replace('{days}', days);
}

function cleanSummary(text) {
    if (text == null) return '';
    if (typeof text !== 'string') text = String(text);
    let cleaned = text.trim();
    if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
        try {
            const parsed = JSON.parse(cleaned);
            if (parsed && typeof parsed === 'object') {
                if (parsed.humanSummary) return String(parsed.humanSummary);
                if (parsed.likelyCause) return String(parsed.likelyCause);
            }
        } catch (_) {}
    }
    cleaned = cleaned.replace(/^\{+/, '').replace(/\}+$/, '');
    return cleaned.trim();
}

function tryParseJSON(str) {
    if (typeof str !== 'string') return null;
    const trimmed = str.trim();
    if (!trimmed.startsWith('{')) return null;
    try {
        return JSON.parse(trimmed);
    } catch (e) {
        const match = trimmed.match(/\{[\s\S]*\}/);
        if (match) {
            try { return JSON.parse(match[0]); } catch (e2) { return null; }
        }
        return null;
    }
}

function looksLikeConclusionSchema(obj) {
    return !!(obj && typeof obj === 'object' && (obj.humanSummary || obj.likelyCause || obj.actions || obj.nextStep));
}

function normalizeConclusion(raw) {
    if (!raw || typeof raw !== 'object') return raw;
    let c = { ...raw };

    const candidateFields = ['humanSummary', 'likelyCause', 'details', 'nextStep'];
    for (const field of candidateFields) {
        const val = c[field];
        let inner = null;
        if (typeof val === 'string') {
            inner = tryParseJSON(val);
        } else if (val && typeof val === 'object' && !Array.isArray(val)) {
            inner = val;
        }
        if (looksLikeConclusionSchema(inner)) {
            const merged = { ...inner };
            for (const [k, v] of Object.entries(c)) {
                if (k !== field && v !== undefined && v !== null && merged[k] === undefined) {
                    merged[k] = v;
                }
            }
            c = merged;
            break;
        }
    }

    if (c.details) {
        const innerDetails = typeof c.details === 'string' ? tryParseJSON(c.details) : c.details;
        if (looksLikeConclusionSchema(innerDetails)) {
            delete c.details;
        }
    }

    if (c.humanSummary) c.humanSummary = cleanSummary(c.humanSummary);
    if (c.likelyCause) c.likelyCause = cleanSummary(c.likelyCause);

    return c;
}

function renderRichText(str) {
    if (!str) return '';
    let safe = escapeHtml(str);
    safe = safe.replace(/\*\*(.+?)\*\*/g, '<span class="highlight-important">$1</span>');
    safe = safe.replace(/(^|[^*])\*(?!\*)(.+?)\*(?!\*)/g, '$1<em>$2</em>');

    const lines = safe.split('\n');
    let html = '';
    let inList = false;
    for (const line of lines) {
        const bulletMatch = line.match(/^\s*[-*•]\s+(.+)/);
        if (bulletMatch) {
            if (!inList) { html += '<ul style="margin:6px 0 0 0; padding-left:18px;">'; inList = true; }
            html += `<li style="margin-bottom:3px;">${bulletMatch[1]}</li>`;
        } else {
            if (inList) { html += '</ul>'; inList = false; }
            html += line.trim() ? `<div>${line}</div>` : '<div style="height:6px;"></div>';
        }
    }
    if (inList) html += '</ul>';
    return html;
}

function detailsToDisplayString(details) {
    if (details == null) return '';
    if (typeof details === 'string') return details;
    if (typeof details === 'object') {
        try {
            return JSON.stringify(details, null, 2);
        } catch (e) {
            return '';
        }
    }
    return String(details);
}

function confidenceRing(percent, color) {
    return `
        <div style="position: relative; width: 56px; height: 56px; flex-shrink: 0;">
            <svg viewBox="0 0 36 36" style="width: 100%; height: 100%; transform: rotate(-90deg);">
                <circle cx="18" cy="18" r="16" fill="none" stroke="#e5e7eb" stroke-width="3"/>
                <circle cx="18" cy="18" r="16" fill="none" stroke="${color}" stroke-width="3"
                    stroke-dasharray="${percent} 100" stroke-linecap="round"/>
            </svg>
            <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 13px; font-weight: 700; color: #1f2937;">${percent}%</span>
        </div>
    `;
}

// ---- Provider/model definitions ----
const PROVIDERS = {
    mistral: {
        label: 'Mistral AI',
        icon: '🧠',
        models: [
            { value: 'open-mistral-7b', label: 'Mistral 7B' },
            { value: 'open-mixtral-8x7b', label: 'Mixtral 8x7B' },
            { value: 'mistral-small-latest', label: 'Mistral Small' },
            { value: 'mistral-medium-latest', label: 'Mistral Medium' },
            { value: 'codestral-latest', label: 'Codestral' },
        ]
    },
    gemini: {
        label: 'Google Gemini',
        icon: '✨',
        models: [
            { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
            { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
            { value: 'gemini-2.0-pro', label: 'Gemini 2.0 Pro' },
        ]
    },
    groq: {
        label: 'Groq (Fast)',
        icon: '⚡',
        models: [
            { value: 'llama3-70b-8192', label: 'Llama 3 70B' },
            { value: 'llama3-8b-8192', label: 'Llama 3 8B' },
            { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
            { value: 'gemma2-9b-it', label: 'Gemma 2 9B' },
        ]
    }
};

// ---- Main render function ----
async function renderAIConclusion() {
    const container = document.getElementById('pageContent');
    let isAnalyzing = false;

    async function loadAllData() {
        let reports = [];
        let existingConclusion = null;

        let supabaseData = null;
        try {
            const { fetchAllScanResultsFromSupabase } = await import('./aiConclusion_sb.js');
            supabaseData = await fetchAllScanResultsFromSupabase();
            if (supabaseData) {
                console.log('[AI] Loaded scans from Supabase:', Object.keys(supabaseData).filter(k => supabaseData[k] !== null));
                if (supabaseData.ai) {
                    existingConclusion = supabaseData.ai;
                }
            }
        } catch (e) {
            console.warn('[AI] Supabase load failed, falling back to localStorage.', e);
        }

        if (!existingConclusion) {
            try {
                const stored = localStorage.getItem('smartHubAIConclusion');
                if (stored) {
                    existingConclusion = JSON.parse(stored);
                    console.log('[AI] Loaded conclusion from localStorage fallback.');
                }
            } catch (e) {
                console.warn('[AI] localStorage fallback failed:', e);
            }
        }

        function addReportFromData(data, id, name, icon, summaryFn, timestampGetter) {
            if (!data) return;
            const summary = summaryFn(data);
            const timestamp = timestampGetter(data);
            if (summary) {
                reports.push({ id, name, summary, data, icon, timestamp });
            }
        }

        const appData = supabaseData?.app || (typeof loadAppScanResults === 'function' ? loadAppScanResults() : null);
        addReportFromData(
            appData, 'app', t('ai.report.appSecurity', 'App Security'), '🛡️',
            (d) => {
                if (d && d.suspiciousApps && d.suspiciousApps.length > 0) {
                    return t('ai.report.appSecurity.summary.suspicious', '{count} suspicious apps').replace('{count}', d.suspiciousApps.length);
                }
                return t('ai.report.appSecurity.summary.clean', 'All clear');
            },
            (d) => d?.scanTime || d?.date || d?.timestamp
        );

        const storageData = supabaseData?.storage || (typeof loadStorageResults === 'function' ? loadStorageResults() : null);
        addReportFromData(
            storageData, 'storage', t('ai.report.storage', 'Storage'), '💾',
            (d) => {
                if (d && d.files && d.files.length > 0) {
                    const totalSize = d.files.reduce((s, f) => s + (f.bytes || 0), 0);
                    return t('ai.report.storage.summary.withFiles', '{count} large files ({size})')
                        .replace('{count}', d.files.length)
                        .replace('{size}', formatSize(totalSize));
                }
                return t('ai.report.storage.summary.noLargeFiles', 'No large files');
            },
            (d) => d?.scanTime || d?.date || d?.timestamp
        );

        const hwData = supabaseData?.hardware || (typeof loadHardwareResults === 'function' ? loadHardwareResults() : null);
        addReportFromData(
            hwData, 'hardware', t('ai.report.hardware', 'Hardware'), '🔬',
            (d) => {
                if (d && d.results) {
                    const total = Object.keys(d.results).length;
                    const passed = Object.values(d.results).filter(r => r.passed).length;
                    return t('ai.report.hardware.summary', '{passed}/{total} tests passed')
                        .replace('{passed}', passed).replace('{total}', total);
                }
                return null;
            },
            (d) => d?.scanTime || d?.date || d?.timestamp
        );

        const connData = supabaseData?.connection || (typeof loadConnectionResults === 'function' ? loadConnectionResults() : null);
        addReportFromData(
            connData, 'connection', t('ai.report.connection', 'Connection'), '📶',
            (d) => {
                if (d && d.results) {
                    const total = Object.keys(d.results).length;
                    const passed = Object.values(d.results).filter(r => r.passed).length;
                    return t('ai.report.connection.summary', '{passed}/{total} services healthy')
                        .replace('{passed}', passed).replace('{total}', total);
                }
                return null;
            },
            (d) => d?.scanTime || d?.date || d?.timestamp
        );

        const advData = supabaseData?.advanced || (typeof loadAdvancedResults === 'function' ? loadAdvancedResults() : null);
        addReportFromData(
            advData, 'advanced', t('ai.report.advanced', 'Advanced Diagnostic'), '🔍',
            (d) => {
                if (d && d.software) {
                    const total = d.software.length;
                    const passed = d.software.filter(r => r.passed).length;
                    return t('ai.report.advanced.summary', '{passed}/{total} software checks passed')
                        .replace('{passed}', passed).replace('{total}', total);
                }
                return null;
            },
            (d) => d?.scanTime || d?.date || d?.timestamp
        );

        reports = reports.filter(r => r.summary !== null && r.summary !== undefined);
        return { reports, existingConclusion };
    }

    const { reports: availableReports, existingConclusion } = await loadAllData();

    // ---- Build provider and model dropdowns ----
    let reportsHtml = '';
    if (availableReports.length === 0) {
        reportsHtml = `
            <div style="text-align: center; padding: 48px 20px;">
                <div style="font-size: 44px; margin-bottom: 10px; opacity: 0.6;">📭</div>
                <h3 style="margin: 0; color: #1f2937; font-size: 17px;">${t('ai.empty.title', 'No diagnostic results yet')}</h3>
                <p style="margin: 6px 0 20px; color: #6B7280; font-size: 14px;">${t('ai.empty.desc', 'Run at least one diagnostic below, then come back here for an AI‑powered analysis.')}</p>
                <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
                    <button onclick="navigateTo && navigateTo('hardware')" style="padding: 8px 16px; border-radius: 8px; border: 1px solid #e5e7eb; background: white; color: #374151; font-size: 13px; cursor: pointer;">🔬 ${t('ai.empty.hardwareBtn', 'Hardware Tests')}</button>
                    <button onclick="navigateTo && navigateTo('connection')" style="padding: 8px 16px; border-radius: 8px; border: 1px solid #e5e7eb; background: white; color: #374151; font-size: 13px; cursor: pointer;">📶 ${t('ai.empty.connectionBtn', 'Connection Troubleshoot')}</button>
                    <button onclick="navigateTo && navigateTo('advanced')" style="padding: 8px 16px; border-radius: 8px; border: 1px solid #e5e7eb; background: white; color: #374151; font-size: 13px; cursor: pointer;">🔍 ${t('ai.empty.advancedBtn', 'Advanced Diagnostics')}</button>
                </div>
            </div>
        `;
    } else {
        // Build provider options
        const providerOptions = Object.entries(PROVIDERS).map(([key, p]) =>
            `<option value="${key}">${p.icon} ${p.label}</option>`
        ).join('');

        // Build model options (will be populated dynamically)
        const defaultProvider = 'mistral';
        const defaultModels = PROVIDERS[defaultProvider].models;
        const modelOptions = defaultModels.map(m =>
            `<option value="${m.value}">${m.label}</option>`
        ).join('');

        reportsHtml = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 8px;">
                <p style="color: #6B7280; font-size: 14px; margin: 0;">${t('ai.selectPrompt', 'Select reports to include:')}</p>
                <div style="display: flex; gap: 6px;">
                    <button id="selectAllReportsBtn" style="padding: 5px 12px; border-radius: 7px; border: 1px solid #e5e7eb; background: white; color: #0d6efd; font-size: 12px; font-weight: 600; cursor: pointer;">${t('ai.selectAll', 'Select All')}</button>
                    <button id="clearReportsBtn" style="padding: 5px 12px; border-radius: 7px; border: 1px solid #e5e7eb; background: white; color: #6B7280; font-size: 12px; font-weight: 600; cursor: pointer;">${t('ai.clear', 'Clear')}</button>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;">
                ${availableReports.map(report => `
                    <div class="report-card"
                         data-report-id="${report.id}"
                         role="checkbox"
                         aria-checked="false"
                         tabindex="0"
                         style="background: white; border-radius: 12px; padding: 16px; border: 2px solid #e5e7eb; cursor: pointer; transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.06); outline: none;"
                         onclick="toggleReportCard(this)"
                         onkeydown="if(event.key===' '||event.key==='Enter'){event.preventDefault();toggleReportCard(this);}"
                    >
                        <div style="display: flex; align-items: flex-start; gap: 12px;">
                            <span style="font-size: 26px; line-height: 1;">${report.icon}</span>
                            <div style="flex: 1; min-width: 0;">
                                <div class="report-name" style="font-weight: 600; font-size: 14.5px; color: #1f2937;">${escapeHtml(report.name)}</div>
                                <div style="font-size: 12.5px; color: #6B7280; margin-top: 2px;">${escapeHtml(report.summary)}</div>
                                ${report.timestamp ? `<div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">${timeAgo(report.timestamp)}</div>` : ''}
                            </div>
                            <div class="report-checkbox" style="width: 20px; height: 20px; border-radius: 6px; border: 2px solid #d1d5db; background: white; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.15s ease;">
                                <span class="checkmark" style="display: none; color: white; font-size: 13px; font-weight: 700;">✓</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <!-- Provider and Model selection -->
            <div style="margin-top: 22px; display: flex; flex-wrap: wrap; align-items: center; gap: 16px; padding: 12px 16px; background: #f8fafc; border-radius: 10px; border: 1px solid #e5e7eb;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <label for="aiProviderSelect" style="font-weight: 500; font-size: 13px; color: #1f2937;">🤖 ${t('ai.provider.label', 'Provider:')}</label>
                    <select id="aiProviderSelect" style="padding: 6px 12px; border-radius: 7px; border: 1px solid #d1d5db; background: white; font-size: 13px; outline: none; cursor: pointer;">
                        ${providerOptions}
                    </select>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <label for="aiModelSelect" style="font-weight: 500; font-size: 13px; color: #1f2937;">🧠 ${t('ai.model.label', 'Model:')}</label>
                    <select id="aiModelSelect" style="padding: 6px 12px; border-radius: 7px; border: 1px solid #d1d5db; background: white; font-size: 13px; outline: none; cursor: pointer;">
                        ${modelOptions}
                    </select>
                </div>
            </div>

            <!-- User Input -->
            <div style="margin-top: 22px;">
                <label for="aiUserInput" style="font-weight: 500; font-size: 14px; color: #1f2937; display: block; margin-bottom: 4px;">
                    📝 ${t('ai.input.label', 'Describe the issue or symptoms')}
                </label>
                <p style="font-size: 12px; color: #6B7280; margin: 0 0 8px 0;">
                    ${t('ai.input.hint', 'What is the phone doing (or not doing)? The more detail you provide, the better the AI diagnosis.')}
                </p>
                <textarea id="aiUserInput" rows="3" style="width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid #e5e7eb; font-size: 14px; font-family: inherit; resize: vertical; transition: border-color 0.15s ease; outline: none; background: white;" placeholder="${t('ai.input.placeholder', 'e.g. Phone restarts randomly when charging...')}"></textarea>
            </div>

            <div style="margin-top: 22px; text-align: center;">
                <button id="runAIConclusionBtn" class="btn-primary" style="padding: 12px 40px; font-size: 15px; font-weight: 600; border-radius: 12px; border: none; background: linear-gradient(135deg, #0d6efd 0%, #0b5ed7 100%); color: white; cursor: pointer; box-shadow: 0 4px 14px rgba(13,110,253,0.3);">
                    🧠 <span id="runAIConclusionBtnLabel">${t('ai.analyzeButton.default', 'Analyze {count} reports').replace(/\{count\}/g, availableReports.length)}</span>
                </button>
                <div id="runAIConclusionHint" style="font-size: 12px; color: #9ca3af; margin-top: 8px;">${t('ai.analyzeButton.hint', 'Select reports above and add details for better results')}</div>
            </div>
        `;
    }

    const html = `
        <div style="margin-bottom: 24px;">
            <h1 style="margin-bottom: 6px; font-size: 24px; font-weight: 700; color: #1f2937;">🧠 ${t('ai.pageTitle', 'AI Conclusion')}</h1>
            <p style="color: #6b7280; font-size: 14px; margin: 0;">${t('ai.pageSubtitle', 'Aggregate your diagnostic results and get an AI‑powered root‑cause analysis.')}</p>
        </div>

        <div class="card" style="padding: 24px;">
            ${reportsHtml}
        </div>

        <div id="aiResultContainer" style="margin-top: 24px; display: none;">
            <div id="aiResultCard" class="card" style="padding: 24px; border-left: 4px solid #0d6efd; position: relative; animation: aiResultFadeIn 0.3s ease;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 8px; flex-wrap: wrap;">
                    <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1f2937;">🧠 ${t('ai.result.title', 'AI Diagnosis')}</h3>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span id="aiTimestamp" style="font-size: 12px; color: #9ca3af;"></span>
                        <button id="copyAiResultBtn" title="${t('ai.result.copyTooltip', 'Copy to clipboard')}" style="display: none; border: 1px solid #e5e7eb; background: white; color: #6B7280; font-size: 12px; padding: 5px 10px; border-radius: 7px; cursor: pointer;">📋 ${t('ai.result.copy', 'Copy')}</button>
                    </div>
                </div>
                <div id="aiResultContent" style="line-height: 1.7; color: #374151;"></div>
                <div id="aiWebSearchSection" style="display: none; margin-top: 16px; padding-top: 12px; border-top: 1px solid #e5e7eb;"></div>
            </div>
        </div>
        <style>
            @keyframes aiResultFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
            .highlight-important {
                background: #fef08a;
                padding: 1px 4px;
                border-radius: 3px;
                font-weight: 500;
                display: inline-block;
            }
        </style>
    `;

    container.innerHTML = html;

    // ---- Populate models based on provider selection ----
    const providerSelect = document.getElementById('aiProviderSelect');
    const modelSelect = document.getElementById('aiModelSelect');

    function populateModels(providerKey) {
        const provider = PROVIDERS[providerKey];
        if (!provider) return;
        modelSelect.innerHTML = provider.models.map(m =>
            `<option value="${m.value}">${m.label}</option>`
        ).join('');
    }

    if (providerSelect) {
        providerSelect.addEventListener('change', function() {
            populateModels(this.value);
        });
    }

    // ---- Render conclusion WITH translation (async now) ----
    async function renderConclusion(c, userInput, selectedIds, originalLang = window._activeLang || 'en') {
        const safeConclusion = c || {};
        const safeUserInput = userInput || '';
        const safeSelectedIds = Array.isArray(selectedIds) ? selectedIds : [];

        // Store raw data so a later language switch can re-translate without re-fetching.
        window._aiRawConclusion = safeConclusion;
        window._aiRawUserInput = safeUserInput;
        window._aiRawSelectedIds = safeSelectedIds;
        window._aiOriginalLang = originalLang;
        window._aiRenderConclusionFn = renderConclusion;

        const resultContainer = document.getElementById('aiResultContainer');
        const resultCard = document.getElementById('aiResultCard');
        const resultContent = document.getElementById('aiResultContent');
        const timestampEl = document.getElementById('aiTimestamp');
        const copyBtn = document.getElementById('copyAiResultBtn');
        const webSearchSection = document.getElementById('aiWebSearchSection');

        resultContainer.style.display = 'block';

        let displayConclusion = safeConclusion;
        let displayUserInput = safeUserInput;

        const targetLang = window._activeLang || 'en';
        const sourceLang = window._aiOriginalLang || 'en';

        if (targetLang !== sourceLang) {
            resultContent.innerHTML = `<div style="text-align:center; padding:24px; color:#6B7280;">⏳ ${t('ai.translating', 'Translating...')}</div>`;
            try {
                console.log(`[AI] Translating from ${sourceLang} to ${targetLang}...`);
                const translationPromise = (async () => {
                    const translatedConclusion = await translateConclusionLocal(safeConclusion, targetLang, sourceLang);
                    const translatedUserInput = safeUserInput.trim()
                        ? await translateTextLocal(safeUserInput, targetLang, sourceLang)
                        : safeUserInput;
                    return { translatedConclusion, translatedUserInput };
                })();
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Translation timed out')), 10000)
                );
                const result = await Promise.race([translationPromise, timeoutPromise]);
                displayConclusion = result?.translatedConclusion || safeConclusion;
                displayUserInput = result?.translatedUserInput || safeUserInput;
            } catch (e) {
                console.warn('[AI] Translation failed or timed out, using original:', e?.message || e);
                displayConclusion = safeConclusion;
                displayUserInput = safeUserInput;
            }
        }

        // ---- Build HTML ----
        let conclusionHtml = '';

        let sevColor = '#0d6efd', sevBg = '#eff6ff', sevLabel = null, confPercent = null;
        if (displayConclusion.confidence !== undefined && displayConclusion.confidence !== null) {
            confPercent = Math.round(displayConclusion.confidence * 100);
            if (confPercent >= 70) { sevColor = '#16a34a'; sevBg = '#f0fdf4'; sevLabel = t('ai.confidence.high', 'High confidence'); }
            else if (confPercent >= 40) { sevColor = '#d97706'; sevBg = '#fffbeb'; sevLabel = t('ai.confidence.moderate', 'Moderate confidence'); }
            else { sevColor = '#dc2626'; sevBg = '#fef2f2'; sevLabel = t('ai.confidence.low', 'Low confidence'); }
            resultCard.style.borderLeftColor = sevColor;
        }

        const summary = displayConclusion.humanSummary || displayConclusion.likelyCause || t('ai.result.noCause', 'No clear cause identified.');
        conclusionHtml += `
            <div style="margin-bottom: 16px; padding: 16px; background: ${sevBg}; border-radius: 10px; border-left: 4px solid ${sevColor}; display:flex; gap:14px; align-items:center;">
                ${confPercent !== null ? confidenceRing(confPercent, sevColor) : ''}
                <div style="flex:1; min-width:0;">
                    ${sevLabel ? `<div style="font-size:11px; font-weight:600; color:${sevColor}; background:white; padding:2px 8px; border-radius:999px; border:1px solid ${sevColor}33; display:inline-block; margin-bottom:4px;">${sevLabel}</div>` : ''}
                    <div style="color: #374151; font-size: 15px;">${renderRichText(summary)}</div>
                </div>
            </div>
        `;

        const actions = Array.isArray(displayConclusion.actions) ? displayConclusion.actions : [];
        if (actions.length > 0) {
            conclusionHtml += `
                <div style="margin-bottom: 12px;">
                    <div style="font-weight: 600; font-size: 15px; color: #1f2937;">🔧 ${t('ai.result.actionsLabel', 'Recommended Actions')}</div>
                    <ul style="margin: 8px 0 0 0; padding-left: 0; list-style: none; color: #374151;">
                        ${actions.map((a) => `
                            <li style="margin-bottom: 6px; display: flex; align-items: flex-start; gap: 8px;">
                                <span style="display: inline-block; width: 6px; height: 6px; background: #0d6efd; border-radius: 50%; margin-top: 8px; flex-shrink: 0;"></span>
                                <span>${renderRichText(a)}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }

        if (displayConclusion.nextStep) {
            conclusionHtml += `
                <div style="margin-top: 12px; padding: 12px 16px; background: #f0fdf4; border-radius: 8px; border-left: 4px solid #22c55e;">
                    <span style="font-weight: 600;">📌 ${t('ai.result.nextStepLabel', 'Next Step')}</span>
                    <span style="color: #374151;"> ${renderRichText(displayConclusion.nextStep)}</span>
                </div>
            `;
        }

        if (displayConclusion.details && !looksLikeConclusionSchema(displayConclusion.details)) {
            const detailsStr = detailsToDisplayString(displayConclusion.details);
            if (detailsStr) {
                conclusionHtml += `
                    <details style="margin-top: 12px; background: #f1f5f9; border-radius: 8px; padding: 10px 16px;">
                        <summary style="cursor:pointer; font-weight: 600; font-size: 14px; color: #1f2937; list-style:none;">📊 ${t('ai.result.detailsLabel', 'Technical Details')}</summary>
                        <div style="margin-top: 8px; color: #374151; font-size: 13px;">${renderRichText(detailsStr)}</div>
                    </details>
                `;
            }
        }

        if (displayUserInput) {
            conclusionHtml += `
                <div style="margin-top: 12px; padding: 12px 16px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                    <div style="font-weight: 600; font-size: 14px; color: #92400e;">📝 ${t('ai.result.userInputLabel', 'Your Input')}</div>
                    <div style="margin-top: 4px; color: #78350f; font-size: 13px;">${escapeHtml(displayUserInput)}</div>
                </div>
            `;
        }

        if (safeSelectedIds.length > 0) {
            const includedChips = safeSelectedIds.map(id => {
                const found = availableReports.find(r => r.id === id);
                return found ? `<span style="display:inline-flex; align-items:center; gap:4px; background:#eef2ff; color:#4338ca; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:600; margin:2px 4px 2px 0;">${found.icon} ${escapeHtml(found.name)}</span>` : '';
            }).filter(Boolean).join('');
            if (includedChips) {
                conclusionHtml += `
                    <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af;">
                        <div style="margin-bottom:6px;">${t('ai.result.includedReports', 'Included reports:')}</div>
                        <div>${includedChips}</div>
                    </div>
                `;
            }
        }

        resultContent.innerHTML = conclusionHtml;
        timestampEl.textContent = t('ai.result.analyzedAt', 'Analyzed at {time}').replace('{time}', new Date().toLocaleString());

        copyBtn.style.display = 'inline-block';
        copyBtn.onclick = () => {
            const plainText = resultContent.innerText;
            navigator.clipboard.writeText(plainText).then(() => {
                copyBtn.textContent = '✅ ' + t('ai.result.copied', 'Copied!');
                setTimeout(() => { copyBtn.textContent = '📋 ' + t('ai.result.copy', 'Copy'); }, 1500);
            });
        };

        webSearchSection.style.display = 'none';
    }

    // ---- If there is an existing conclusion, render it ----
    if (existingConclusion) {
        const c = normalizeConclusion(existingConclusion);
        const userInput = existingConclusion.user_input || '';
        const selectedIds = existingConclusion.selected_reports || [];
        const originalLang = existingConclusion.lang || 'en';
        renderConclusion(c, userInput, selectedIds, originalLang).catch(err =>
            console.warn('[AI] renderConclusion error:', err)
        );
    }

    // ---- Toggle report card selection ----
    window.toggleReportCard = function(card) {
        const checkmark = card.querySelector('.checkmark');
        const box = card.querySelector('.report-checkbox');
        const isSelected = checkmark.style.display === 'inline';
        checkmark.style.display = isSelected ? 'none' : 'inline';
        card.setAttribute('aria-checked', String(!isSelected));
        card.style.borderColor = isSelected ? '#e5e7eb' : '#0d6efd';
        card.style.background = isSelected ? 'white' : '#f0f7ff';
        card.style.boxShadow = isSelected ? '0 1px 3px rgba(0,0,0,0.06)' : '0 2px 8px rgba(13,110,253,0.15)';
        box.style.background = isSelected ? 'white' : '#0d6efd';
        box.style.borderColor = isSelected ? '#d1d5db' : '#0d6efd';
        updateRunButtonState();
    };

    function updateRunButtonState() {
        const btn = document.getElementById('runAIConclusionBtn');
        const label = document.getElementById('runAIConclusionBtnLabel');
        const hint = document.getElementById('runAIConclusionHint');
        if (!btn) return;
        const count = document.querySelectorAll('.report-card[aria-checked="true"]').length;
        if (count === 0) {
            label.textContent = t('ai.analyzeButton.none', 'Select reports');
            btn.style.opacity = '0.5';
            btn.style.pointerEvents = 'none';
            hint.textContent = t('ai.analyzeButton.noneHint', 'Select at least one report');
        } else {
            const labelText = t('ai.analyzeButton.some', 'Analyze {count} reports').replace(/\{count\}/g, count);
            label.textContent = labelText;
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
            const hintText = t('ai.analyzeButton.someHint', '{count} reports selected for analysis').replace(/\{count\}/g, count);
            hint.textContent = hintText;
        }
    }

    const selectAllBtn = document.getElementById('selectAllReportsBtn');
    const clearBtn = document.getElementById('clearReportsBtn');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            document.querySelectorAll('.report-card[aria-checked="false"]').forEach(card => toggleReportCard(card));
        });
    }
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            document.querySelectorAll('.report-card[aria-checked="true"]').forEach(card => toggleReportCard(card));
        });
    }

    // ---- Handle AI conclusion button ----
    const runBtn = document.getElementById('runAIConclusionBtn');
    if (runBtn) {
        runBtn.addEventListener('click', async function() {
            if (isAnalyzing) return;
            isAnalyzing = true;
            runBtn.disabled = true;
            runBtn.style.opacity = '0.7';

            const loadingStages = [
                t('ai.loading.stage1', '🔍 Analyzing selected reports…'),
                t('ai.loading.stage2', '🧬 Cross-referencing symptoms…'),
                t('ai.loading.stage3', '🌐 Searching for similar cases…'),
                t('ai.loading.stage4', '🧠 Finalizing diagnosis…'),
            ];
            let stageIndex = 0;
            let stageTimer = null;

            try {
                const selectedCards = document.querySelectorAll('.report-card[aria-checked="true"]');
                const selectedIds = Array.from(selectedCards).map(card => card.dataset.reportId);
                if (selectedIds.length === 0) {
                    isAnalyzing = false;
                    runBtn.disabled = false;
                    runBtn.style.opacity = '1';
                    return;
                }

                const userInput = document.getElementById('aiUserInput')?.value?.trim() || '';
                const lang = window._activeLang || 'en';
                const provider = document.getElementById('aiProviderSelect')?.value || 'mistral';
                const model = document.getElementById('aiModelSelect')?.value || 'open-mistral-7b';

                const payload = {
                    deviceId: currentDeviceId,
                    selectedReports: selectedIds,
                    userInput: userInput,
                    lang: lang,
                    provider: provider,
                    model: model,
                    reports: availableReports
                        .filter(r => selectedIds.includes(r.id))
                        .reduce((acc, r) => { acc[r.id] = r.data; return acc; }, {})
                };

                const resultContainer = document.getElementById('aiResultContainer');
                const resultCard = document.getElementById('aiResultCard');
                const resultContent = document.getElementById('aiResultContent');
                const timestampEl = document.getElementById('aiTimestamp');
                const copyBtn = document.getElementById('copyAiResultBtn');
                const webSearchSection = document.getElementById('aiWebSearchSection');

                resultContainer.style.display = 'block';
                resultCard.style.borderLeftColor = '#0d6efd';
                const renderStage = () => {
                    resultContent.innerHTML = typeof window.getModernSpinnerHTML === 'function'
                        ? window.getModernSpinnerHTML(loadingStages[stageIndex])
                        : `<div style="text-align:center; padding:24px; color:#6B7280;">${loadingStages[stageIndex]}</div>`;
                };
                renderStage();
                stageTimer = setInterval(() => {
                    stageIndex = (stageIndex + 1) % loadingStages.length;
                    renderStage();
                }, 1800);

                timestampEl.textContent = '';
                copyBtn.style.display = 'none';
                webSearchSection.style.display = 'none';
                resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                const response = await fetch(`${BACKEND_URL}/ai-adb-conclude`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `HTTP ${response.status}`);
                }

                const data = await response.json();

                if (data.ok && data.conclusion) {
                    const c = normalizeConclusion(data.conclusion);
                    await renderConclusion(c, userInput, selectedIds, lang);

                    if (data.searchQuery || (data.searchResults && data.searchResults.length > 0)) {
                        let searchHtml = `
                            <div style="font-size: 13px; font-weight: 600; color: #1f2937; margin-bottom: 6px;">🔎 Web Search</div>
                            <div style="font-size: 12px; color: #6B7280; margin-bottom: 8px;">
                                <strong>Query:</strong> ${escapeHtml(data.searchQuery || 'N/A')}
                            </div>
                            <div style="font-size: 12px; color: #6B7280; margin-bottom: 4px;">
                                <strong>${data.searchResults ? data.searchResults.length : 0} results found</strong>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:6px; max-height: 180px; overflow-y: auto;">
                                ${data.searchResults && data.searchResults.length > 0
                                    ? data.searchResults.map((r) => `
                                        <div style="padding: 8px 10px; background:#f8fafc; border:1px solid #e5e7eb; border-radius:8px;">
                                            <div style="font-weight:600; font-size:12.5px; color:#1f2937;">🌐 ${escapeHtml(r.title || 'Result')}</div>
                                            <div style="color: #4b5563; font-size: 11.5px; margin-top:2px;">${escapeHtml(r.snippet || '')}</div>
                                            ${r.url && r.url !== '#' ? `<div style="font-size: 10.5px; color: #0d6efd; word-break: break-all; margin-top:2px;"><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.url)}</a></div>` : ''}
                                        </div>
                                    `).join('')
                                    : '<div style="color: #9ca3af;">No relevant web results found.</div>'
                                }
                            </div>
                        `;
                        const ws = document.getElementById('aiWebSearchSection');
                        if (ws) {
                            ws.innerHTML = searchHtml;
                            ws.style.display = 'block';
                        }
                    } else {
                        const ws = document.getElementById('aiWebSearchSection');
                        if (ws) ws.style.display = 'none';
                    }

                    try {
                        const { saveAIConclusion } = await import('./aiConclusion_sb.js');
                        await saveAIConclusion({
                            selectedReports: selectedIds,
                            userInput: userInput,
                            conclusionText: c.humanSummary || c.likelyCause || '',
                            confidence: c.confidence,
                            actions: c.actions || [],
                            nextStep: c.nextStep || '',
                            details: (typeof c.details === 'string' ? c.details : (c.details ? JSON.stringify(c.details) : '')),
                            lang: lang,
                            provider: provider,
                            model: model,
                        });
                        console.log('[AI] Conclusion saved to Supabase');
                        localStorage.setItem('smartHubAIConclusion', JSON.stringify(c));
                    } catch (saveErr) {
                        console.warn('[AI] Could not save conclusion:', saveErr);
                    }

                    // ========== NEW: Fetch similar posts from the feed ==========
                    try {
                        // Extract keywords from the conclusion
                        const keywords = [];
                        // From likelyCause
                        if (c.likelyCause) {
                            const words = c.likelyCause.split(' ').slice(0, 6);
                            keywords.push(...words);
                        }
                        // From actions (first action)
                        if (c.actions && c.actions.length) {
                            const actionWords = c.actions[0].split(' ').slice(0, 4);
                            keywords.push(...actionWords);
                        }
                        // From user input
                        if (userInput) {
                            const inputWords = userInput.split(' ').slice(0, 4);
                            keywords.push(...inputWords);
                        }
                        // Device model from reports
                        const modelReport = availableReports.find(r => r.data?.device_model);
                        if (modelReport) {
                            const modelName = modelReport.data.device_model;
                            const modelParts = modelName.split(' ');
                            if (modelParts.length > 1) {
                                keywords.push(modelParts[0]); // brand
                                keywords.push(modelName); // full model
                            } else {
                                keywords.push(modelName);
                            }
                        }

                        // Clean keywords: remove duplicates, short words (<3), and common stopwords
                        const stopwords = ['the', 'this', 'that', 'and', 'for', 'with', 'from', 'have', 'not', 'are', 'but', 'can', 'has', 'was', 'were', 'all', 'any', 'one', 'some', 'then', 'than', 'very', 'more', 'less', 'just', 'also', 'been', 'into', 'only', 'other', 'than'];
                        const cleanKeywords = [...new Set(keywords.filter(t => t.length > 3 && !stopwords.includes(t.toLowerCase())))];
                        cleanKeywords.splice(6); // limit to 6 keywords

                        if (cleanKeywords.length > 0) {
                            const params = new URLSearchParams();
                            cleanKeywords.forEach(k => params.append('keywords', k));
                            const similarResponse = await fetch(`/api/posts/by-content?${params.toString()}`);
                            if (similarResponse.ok) {
                                const similarData = await similarResponse.json();
                                if (similarData.posts && similarData.posts.length > 0) {
                                    let similarHtml = `
                                        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                                            <div style="font-weight: 600; font-size: 14px; color: #1f2937;">🔍 Similar posts on the feed</div>
                                            <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 6px;">
                                    `;
                                    similarData.posts.forEach(post => {
                                        const displayName = post.profiles?.display_name || 'User';
                                        const contentPreview = post.content ? post.content.substring(0, 80) : 'View post';
                                        similarHtml += `
                                            <a href="/?postId=${post.id}" style="display: block; padding: 8px 12px; background: #f8fafc; border-radius: 8px; text-decoration: none; color: #1f2937; border: 1px solid #e5e7eb; transition: background 0.15s;"
                                               onmouseover="this.style.background='#eef2ff'" onmouseout="this.style.background='#f8fafc'">
                                                <div style="font-weight: 500; font-size: 13px;">${escapeHtml(displayName)}</div>
                                                <div style="font-size: 12.5px; color: #4b5563;">${escapeHtml(contentPreview)}</div>
                                            </a>
                                        `;
                                    });
                                    similarHtml += `
                                            </div>
                                        </div>
                                    `;
                                    const resultContent = document.getElementById('aiResultContent');
                                    if (resultContent) {
                                        resultContent.insertAdjacentHTML('beforeend', similarHtml);
                                    }
                                }
                            }
                        }
                    } catch (similarErr) {
                        console.warn('[AI] Could not fetch similar posts:', similarErr);
                    }
                    // ========== End of similar posts feature ==========

                } else {
                    throw new Error(data.error || t('ai.result.noConclusion', 'No conclusion generated.'));
                }
            } catch (err) {
                console.error('[AI] Error:', err);
                const resultCard = document.getElementById('aiResultCard');
                const resultContent = document.getElementById('aiResultContent');
                if (resultCard) resultCard.style.borderLeftColor = '#dc2626';
                if (resultContent) {
                    resultContent.innerHTML = `
                        <div style="color: #991b1b; padding: 14px 16px; background: #fef2f2; border-radius: 8px; border-left: 4px solid #dc2626;">
                            <div style="font-weight:600; margin-bottom:4px;">❌ ${t('ai.result.error', 'Something went wrong')}</div>
                            <div style="font-size: 13px;">${escapeHtml(err.message || 'Unknown error')}</div>
                            <button onclick="document.getElementById('runAIConclusionBtn').click()" style="margin-top:10px; border: 1px solid #fca5a5; background: white; color: #b91c1c; padding: 6px 16px; border-radius: 8px; font-size: 13px; cursor: pointer;">🔄 ${t('common.retry', 'Retry')}</button>
                        </div>
                    `;
                }
                const ws = document.getElementById('aiWebSearchSection');
                if (ws) ws.style.display = 'none';
            } finally {
                if (stageTimer) clearInterval(stageTimer);
                isAnalyzing = false;
                runBtn.disabled = false;
                runBtn.style.opacity = '1';
            }
        });
    }

    // ---- Re-render on language change ----
    if (!window._aiLangHookInstalled) {
        window._aiLangHookInstalled = true;
        const originalApplyLanguage = window.applyLanguage;
        window.applyLanguage = function(lang) {
            if (typeof originalApplyLanguage === 'function') {
                originalApplyLanguage(lang);
            }
            window._activeLang = lang;

            if (document.getElementById('pageContent') &&
                (document.getElementById('aiResultContainer') || document.querySelector('.report-card'))) {
                console.log('[AI] Language changed to', lang);
                if (window._aiRenderConclusionFn && window._aiRawConclusion) {
                    window._aiRenderConclusionFn(
                        window._aiRawConclusion,
                        window._aiRawUserInput,
                        window._aiRawSelectedIds,
                        window._aiOriginalLang
                    ).catch(err => console.warn('[AI] Language switch render error:', err));
                } else {
                    renderAIConclusion();
                }
            }
        };
    }

    // ---- Auto-select all reports ----
    document.querySelectorAll('.report-card').forEach(card => toggleReportCard(card));
}

window.renderAIConclusion = renderAIConclusion;
window.renderRepairShorts = renderRepairShorts;