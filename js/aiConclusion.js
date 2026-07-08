async function renderAIConclusion() {
    const container = document.getElementById('pageContent');

    // ---- Collect all available diagnostic results ----
    const availableReports = [];

    // 1. App Security Scan
    try {
        const appData = loadAppScanResults();
        if (appData && appData.suspiciousApps && appData.suspiciousApps.length > 0) {
            availableReports.push({
                id: 'app',
                name: 'App Security Scan',
                summary: `${appData.suspiciousApps.length} suspicious app(s) found`,
                data: appData,
                icon: '🛡️',
                timestamp: appData.date || appData.timestamp
            });
        }
    } catch (e) { /* ignore */ }

    // 2. Storage Analysis
    try {
        const storageData = loadStorageResults();
        if (storageData && storageData.files && storageData.files.length > 0) {
            const totalSize = storageData.files.reduce((s, f) => s + (f.bytes || 0), 0);
            availableReports.push({
                id: 'storage',
                name: 'Storage Analysis',
                summary: `${storageData.files.length} large files (${formatSize(totalSize)})`,
                data: storageData,
                icon: '💾',
                timestamp: storageData.date || storageData.timestamp
            });
        } else if (storageData) {
            availableReports.push({
                id: 'storage',
                name: 'Storage Analysis',
                summary: 'No large files (>500MB) found',
                data: storageData,
                icon: '💾',
                timestamp: storageData.date || storageData.timestamp
            });
        }
    } catch (e) { /* ignore */ }

    // 3. Hardware Tests
    try {
        const hwData = loadHardwareResults();
        if (hwData && hwData.results) {
            const total = Object.keys(hwData.results).length;
            const passed = Object.values(hwData.results).filter(r => r.passed).length;
            availableReports.push({
                id: 'hardware',
                name: 'Hardware Tests',
                summary: `${passed}/${total} tests passed`,
                data: hwData,
                icon: '🔬',
                timestamp: hwData.date || hwData.timestamp
            });
        }
    } catch (e) { /* ignore */ }

    // 4. Connection Troubleshoot
    try {
        const connData = loadConnectionResults();
        if (connData && connData.results) {
            const total = Object.keys(connData.results).length;
            const passed = Object.values(connData.results).filter(r => r.passed).length;
            availableReports.push({
                id: 'connection',
                name: 'Connection Troubleshoot',
                summary: `${passed}/${total} services healthy`,
                data: connData,
                icon: '📶',
                timestamp: connData.date || connData.timestamp
            });
        }
    } catch (e) { /* ignore */ }

    // 5. Advanced Diagnostic
    try {
        const advData = loadAdvancedResults();
        if (advData && advData.software) {
            const total = advData.software.length;
            const passed = advData.software.filter(r => r.passed).length;
            availableReports.push({
                id: 'advanced',
                name: 'Advanced Diagnostic',
                summary: `${passed}/${total} software checks passed`,
                data: advData,
                icon: '🔍',
                timestamp: advData.date || advData.timestamp
            });
        }
    } catch (e) { /* ignore */ }

    // ---- Helper: relative time ----
    function timeAgo(iso) {
        if (!iso) return '';
        const diffMs = Date.now() - new Date(iso).getTime();
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        return `${days}d ago`;
    }

    // ---- Build the UI ----
    let reportsHtml = '';
    if (availableReports.length === 0) {
        reportsHtml = `
            <div style="text-align: center; padding: 48px 20px;">
                <div style="font-size: 44px; margin-bottom: 10px; opacity: 0.6;">📭</div>
                <h3 style="margin: 0; color: #1f2937; font-size: 17px;">No diagnostic results yet</h3>
                <p style="margin: 6px 0 20px; color: #6B7280; font-size: 14px;">Run at least one diagnostic below, then come back here for an AI‑powered analysis.</p>
                <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
                    <button onclick="navigateTo && navigateTo('hardware')" style="padding: 8px 16px; border-radius: 8px; border: 1px solid #e5e7eb; background: white; color: #374151; font-size: 13px; cursor: pointer;">🔬 Hardware Tests</button>
                    <button onclick="navigateTo && navigateTo('connection')" style="padding: 8px 16px; border-radius: 8px; border: 1px solid #e5e7eb; background: white; color: #374151; font-size: 13px; cursor: pointer;">📶 Connection Troubleshoot</button>
                    <button onclick="navigateTo && navigateTo('advanced')" style="padding: 8px 16px; border-radius: 8px; border: 1px solid #e5e7eb; background: white; color: #374151; font-size: 13px; cursor: pointer;">🔍 Advanced Diagnostics</button>
                </div>
            </div>
        `;
    } else {
        reportsHtml = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 8px;">
                <p style="color: #6B7280; font-size: 14px; margin: 0;">Select the diagnostic results you want the AI to analyze:</p>
                <div style="display: flex; gap: 6px;">
                    <button id="selectAllReportsBtn" style="padding: 5px 12px; border-radius: 7px; border: 1px solid #e5e7eb; background: white; color: #0d6efd; font-size: 12px; font-weight: 600; cursor: pointer;">Select all</button>
                    <button id="clearReportsBtn" style="padding: 5px 12px; border-radius: 7px; border: 1px solid #e5e7eb; background: white; color: #6B7280; font-size: 12px; font-weight: 600; cursor: pointer;">Clear</button>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;">
                ${availableReports.map(report => `
                    <div class="report-card"
                         data-report-id="${report.id}"
                         role="checkbox"
                         aria-checked="false"
                         tabindex="0"
                         style="
                            background: white;
                            border-radius: 12px;
                            padding: 16px;
                            border: 2px solid #e5e7eb;
                            cursor: pointer;
                            transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
                            box-shadow: 0 1px 3px rgba(0,0,0,0.06);
                            outline: none;
                        "
                        onclick="toggleReportCard(this)"
                        onkeydown="if(event.key===' '||event.key==='Enter'){event.preventDefault();toggleReportCard(this);}"
                    >
                        <div style="display: flex; align-items: flex-start; gap: 12px;">
                            <span style="font-size: 26px; line-height: 1;">${report.icon}</span>
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: 600; font-size: 14.5px; color: #1f2937;">${escapeHtml(report.name)}</div>
                                <div style="font-size: 12.5px; color: #6B7280; margin-top: 2px;">${escapeHtml(report.summary)}</div>
                                ${report.timestamp ? `<div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">${timeAgo(report.timestamp)}</div>` : ''}
                            </div>
                            <div class="report-checkbox" style="
                                width: 20px; height: 20px; border-radius: 6px;
                                border: 2px solid #d1d5db; background: white;
                                display: flex; align-items: center; justify-content: center;
                                flex-shrink: 0; transition: all 0.15s ease;
                            ">
                                <span class="checkmark" style="display: none; color: white; font-size: 13px; font-weight: 700;">✓</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <!-- ===== USER INPUT SECTION ===== -->
            <div style="margin-top: 22px;">
                <label for="aiUserInput" style="font-weight: 500; font-size: 14px; color: #1f2937; display: block; margin-bottom: 4px;">
                    📝 Describe the issue or symptoms
                </label>
                <p style="font-size: 12px; color: #6B7280; margin: 0 0 8px 0;">
                    What is the phone doing (or not doing)? The more detail you provide, the better the AI diagnosis.
                </p>
                <textarea id="aiUserInput" rows="3" style="
                    width: 100%;
                    padding: 12px 14px;
                    border-radius: 10px;
                    border: 1px solid #e5e7eb;
                    font-size: 14px;
                    font-family: inherit;
                    resize: vertical;
                    transition: border-color 0.15s ease;
                    outline: none;
                    background: white;
                " placeholder="e.g. Phone is overheating and randomly rebooting, battery drains fast, and the camera app crashes when opened."></textarea>
            </div>

            <div style="margin-top: 22px; text-align: center;">
                <button id="runAIConclusionBtn" class="btn-primary" style="padding: 12px 40px; font-size: 15px; font-weight: 600; border-radius: 12px; border: none; background: linear-gradient(135deg, #0d6efd 0%, #0b5ed7 100%); color: white; cursor: pointer; box-shadow: 0 4px 14px rgba(13,110,253,0.3);">
                    🧠 <span id="runAIConclusionBtnLabel">Analyze ${availableReports.length} report${availableReports.length !== 1 ? 's' : ''}</span>
                </button>
                <div id="runAIConclusionHint" style="font-size: 12px; color: #9ca3af; margin-top: 8px;">All reports selected by default — deselect any you don't want included.</div>
            </div>
        `;
    }

    const html = `
        <div style="margin-bottom: 24px;">
            <h1 style="margin-bottom: 6px; font-size: 24px; font-weight: 700; color: #1f2937;">🧠 AI Conclusion</h1>
            <p style="color: #6b7280; font-size: 14px; margin: 0;">Aggregate your diagnostic results and get an AI‑powered root‑cause analysis.</p>
        </div>

        <div class="card" style="padding: 24px;">
            ${reportsHtml}
        </div>

        <div id="aiResultContainer" style="margin-top: 24px; display: none;">
            <div id="aiResultCard" class="card" style="padding: 24px; border-left: 4px solid #0d6efd; position: relative;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 8px; flex-wrap: wrap;">
                    <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1f2937;">🧠 AI Analysis</h3>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span id="aiTimestamp" style="font-size: 12px; color: #9ca3af;"></span>
                        <button id="copyAiResultBtn" title="Copy analysis" style="display: none; border: 1px solid #e5e7eb; background: white; color: #6B7280; font-size: 12px; padding: 5px 10px; border-radius: 7px; cursor: pointer;">📋 Copy</button>
                    </div>
                </div>
                <div id="aiResultContent" style="line-height: 1.7; color: #374151;"></div>
            </div>
        </div>
    `;

    container.innerHTML = html;

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
        label.textContent = count === 0 ? 'Select reports to analyze' : `Analyze ${count} report${count !== 1 ? 's' : ''}`;
        btn.style.opacity = count === 0 ? '0.5' : '1';
        btn.style.pointerEvents = count === 0 ? 'none' : 'auto';
        hint.textContent = count === 0
            ? 'Select at least one report above.'
            : `${count} of ${availableReports.length} report${availableReports.length !== 1 ? 's' : ''} selected.`;
    }

    // ---- Select all / clear ----
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
    const resultContainer = document.getElementById('aiResultContainer');
    const resultCard = document.getElementById('aiResultCard');
    const resultContent = document.getElementById('aiResultContent');
    const timestampEl = document.getElementById('aiTimestamp');
    const copyBtn = document.getElementById('copyAiResultBtn');

    if (runBtn) {
        runBtn.addEventListener('click', async function() {
            const selectedCards = document.querySelectorAll('.report-card[aria-checked="true"]');
            const selectedIds = Array.from(selectedCards).map(card => card.dataset.reportId);

            if (selectedIds.length === 0) {
                return;
            }

            // Collect user input
            const userInput = document.getElementById('aiUserInput')?.value?.trim() || '';

            const payload = {
                deviceId: currentDeviceId,
                selectedReports: selectedIds,
                userInput: userInput,
                reports: availableReports
                    .filter(r => selectedIds.includes(r.id))
                    .reduce((acc, r) => {
                        acc[r.id] = r.data;
                        return acc;
                    }, {})
            };

            resultContainer.style.display = 'block';
            resultCard.style.borderLeftColor = '#0d6efd';
            resultContent.innerHTML = window.getModernSpinnerHTML('AI is analyzing your diagnostic data and symptoms...');
            timestampEl.textContent = '';
            copyBtn.style.display = 'none';
            resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

            try {
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
                    const c = data.conclusion;
                    let conclusionHtml = '';

                    let sevColor = '#0d6efd', sevBg = '#eff6ff', sevLabel = null;
                    if (c.confidence !== undefined && c.confidence !== null) {
                        const confPercent = (c.confidence * 100).toFixed(0);
                        if (confPercent >= 70) { sevColor = '#16a34a'; sevBg = '#f0fdf4'; sevLabel = 'High confidence'; }
                        else if (confPercent >= 40) { sevColor = '#d97706'; sevBg = '#fffbeb'; sevLabel = 'Moderate confidence'; }
                        else { sevColor = '#dc2626'; sevBg = '#fef2f2'; sevLabel = 'Low confidence'; }
                        resultCard.style.borderLeftColor = sevColor;
                    }

                    if (c.humanSummary || c.likelyCause) {
                        conclusionHtml += `
                            <div style="margin-bottom: 16px; padding: 16px; background: ${sevBg}; border-radius: 8px; border-left: 4px solid ${sevColor};">
                                <div style="display:flex; align-items:center; gap:8px; justify-content:space-between;">
                                    <div style="font-weight: 600; font-size: 16px; color: #1f2937;">📋 Conclusion</div>
                                    ${sevLabel ? `<span style="font-size:11px; font-weight:600; color:${sevColor}; background:white; padding:2px 8px; border-radius:999px; border:1px solid ${sevColor}33;">${sevLabel}</span>` : ''}
                                </div>
                                <div style="margin-top: 6px; color: #374151;">${escapeHtml(c.humanSummary || c.likelyCause || 'No clear cause identified')}</div>
                            </div>
                        `;
                    }

                    if (c.confidence !== undefined && c.confidence !== null) {
                        const confPercent = (c.confidence * 100).toFixed(0);
                        conclusionHtml += `
                            <div style="margin-bottom: 16px; display: flex; align-items: center; gap: 12px;">
                                <span style="font-size: 13px; font-weight: 500; color: #6B7280; flex-shrink:0;">Confidence</span>
                                <div style="flex: 1; max-width: 220px; background: #e5e7eb; border-radius: 10px; height: 8px; overflow: hidden;">
                                    <div style="width: ${confPercent}%; background: ${sevColor}; height: 100%; border-radius: 10px; transition: width 0.4s ease;"></div>
                                </div>
                                <span style="font-weight: 600; font-size: 13px; color: #1f2937;">${confPercent}%</span>
                            </div>
                        `;
                    }

                    if (c.actions && c.actions.length > 0) {
                        conclusionHtml += `
                            <div style="margin-bottom: 12px;">
                                <div style="font-weight: 600; font-size: 15px; color: #1f2937;">🔧 Recommended Actions</div>
                                <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #374151;">
                                    ${c.actions.map(a => `<li style="margin-bottom: 4px;">${escapeHtml(a)}</li>`).join('')}
                                </ul>
                            </div>
                        `;
                    }

                    if (c.nextStep) {
                        conclusionHtml += `
                            <div style="margin-top: 12px; padding: 12px 16px; background: #f0fdf4; border-radius: 8px; border-left: 4px solid #22c55e;">
                                <span style="font-weight: 600;">📌 Next Step:</span>
                                <span style="color: #374151;">${escapeHtml(c.nextStep)}</span>
                            </div>
                        `;
                    }

                    if (c.details) {
                        conclusionHtml += `
                            <div style="margin-top: 12px; padding: 12px 16px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #6B7280;">
                                <div style="font-weight: 600; font-size: 14px; color: #1f2937;">📊 Additional Details</div>
                                <div style="margin-top: 4px; color: #374151; white-space: pre-wrap; font-size: 13px;">${escapeHtml(c.details)}</div>
                            </div>
                        `;
                    }

                    // Show user input if provided
                    if (userInput) {
                        conclusionHtml += `
                            <div style="margin-top: 12px; padding: 12px 16px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                                <div style="font-weight: 600; font-size: 14px; color: #92400e;">📝 Your Symptom Description</div>
                                <div style="margin-top: 4px; color: #78350f; font-size: 13px;">${escapeHtml(userInput)}</div>
                            </div>
                        `;
                    }

                    resultContent.innerHTML = conclusionHtml;
                    timestampEl.textContent = `Analyzed at ${new Date().toLocaleString()}`;

                    const includedNames = selectedIds.map(id => {
                        const found = availableReports.find(r => r.id === id);
                        return found ? found.name : id;
                    });
                    resultContent.innerHTML += `
                        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af;">
                            Included: ${includedNames.join(', ')}
                        </div>
                    `;

                    copyBtn.style.display = 'inline-block';
                    copyBtn.onclick = () => {
                        const plainText = resultContent.innerText;
                        navigator.clipboard.writeText(plainText).then(() => {
                            copyBtn.textContent = '✅ Copied';
                            setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 1500);
                        });
                    };

                } else {
                    throw new Error(data.error || 'AI could not generate a conclusion.');
                }
            } catch (err) {
                resultCard.style.borderLeftColor = '#dc2626';
                resultContent.innerHTML = `
                    <div style="color: #991b1b; padding: 14px 16px; background: #fef2f2; border-radius: 8px; border-left: 4px solid #dc2626;">
                        <div style="font-weight:600; margin-bottom:4px;">❌ Something went wrong</div>
                        <div style="font-size: 13px;">${escapeHtml(err.message)}</div>
                        <button onclick="document.getElementById('runAIConclusionBtn').click()" style="margin-top:10px; border: 1px solid #fca5a5; background: white; color: #b91c1c; padding: 6px 16px; border-radius: 8px; font-size: 13px; cursor: pointer;">🔄 Retry</button>
                    </div>
                `;
            }
        });
    }

    // ---- Auto-select all reports by default ----
    document.querySelectorAll('.report-card').forEach(card => toggleReportCard(card));
}