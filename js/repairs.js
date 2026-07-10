async function renderRepairs() {
    const container = document.getElementById('pageContent');
    const theme = window._activeTheme || JSON.parse(localStorage.getItem('smartHubSettings') || '{}');
    const textColor = theme.textColor || '#1f2937';

    // ---- One-time style injection ----
    function injectRepairStyles() {
        if (document.getElementById('repairsStyleSheet')) return;
        const style = document.createElement('style');
        style.id = 'repairsStyleSheet';
        style.textContent = `
            .rp-page { --rp-danger:#dc2626; --rp-danger-bg:#fef2f2; --rp-danger-border:#fecaca;
                       --rp-warning:#f59e0b; --rp-warning-bg:#fef3c7; --rp-warning-border:#fde68a;
                       --rp-info:#0d6efd; --rp-info-bg:#eff6ff; --rp-info-border:#bfdbfe;
                       --rp-success:#16a34a; --rp-success-bg:#f0fdf4; --rp-success-border:#bbf7d0;
                       --rp-ink:#1f2937; --rp-muted:#6b7280; --rp-line:#e5e7eb; }

            .rp-section { margin-bottom: 28px; }
            .rp-section-head { display:flex; align-items:baseline; gap:10px; margin-bottom:12px; }
            .rp-section-head h2 { margin:0; font-size:13px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:var(--rp-muted); }
            .rp-section-head .rp-rule { flex:1; height:1px; background:var(--rp-line); }
            .rp-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:16px; }

            .rp-card { background:#fff; border:1px solid var(--rp-line); border-radius:14px; padding:20px;
                       transition: box-shadow .15s ease, transform .15s ease, border-color .15s ease; }
            .rp-card:hover { box-shadow:0 6px 20px rgba(15,23,42,0.08); border-color:#d7dce3; }
            .rp-card.accent-danger { border-top:3px solid var(--rp-danger); }
            .rp-card.accent-info { border-top:3px solid var(--rp-info); }

            .rp-card-head { display:flex; align-items:flex-start; gap:12px; margin-bottom:6px; }
            .rp-icon-badge { flex-shrink:0; width:40px; height:40px; border-radius:10px; display:flex; align-items:center;
                             justify-content:center; font-size:19px; }
            .rp-icon-badge.danger { background:var(--rp-danger-bg); }
            .rp-icon-badge.info { background:var(--rp-info-bg); }
            .rp-card-head h3 { margin:0; font-size:15px; font-weight:700; color:var(--rp-ink); line-height:1.3; }

            .rp-risk { display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:600;
                       padding:3px 9px; border-radius:999px; margin-bottom:12px; }
            .rp-risk .dot { width:6px; height:6px; border-radius:50%; }
            .rp-risk.destructive { background:var(--rp-danger-bg); color:#991b1b; border:1px solid var(--rp-danger-border); }
            .rp-risk.destructive .dot { background:var(--rp-danger); }
            .rp-risk.caution { background:var(--rp-warning-bg); color:#92400e; border:1px solid var(--rp-warning-border); }
            .rp-risk.caution .dot { background:var(--rp-warning); }
            .rp-risk.safe { background:var(--rp-success-bg); color:#166534; border:1px solid var(--rp-success-border); }
            .rp-risk.safe .dot { background:var(--rp-success); }

            .rp-desc { color:var(--rp-muted); font-size:13.5px; line-height:1.5; margin:0 0 14px; }

            .rp-btns { display:flex; flex-direction:column; gap:8px; }
            .rp-btn { width:100%; display:flex; align-items:center; justify-content:center; gap:8px;
                      padding:9px 10px; border-radius:9px; font-size:13px; font-weight:600; cursor:pointer;
                      border:1px solid transparent; transition:filter .15s ease, opacity .15s ease; }
            .rp-btn:hover { filter:brightness(1.05); }
            .rp-btn:disabled, .rp-btn.is-disabled { opacity:0.45; cursor:not-allowed; filter:none; }
            .rp-btn-danger { background:var(--rp-danger); color:#fff; }
            .rp-btn-info { background:var(--rp-info); color:#fff; }
            .rp-btn-ghost { background:#f8fafc; color:#374151; border-color:var(--rp-line); }
            .rp-btn-ghost:hover { background:#f1f5f9; }
            .rp-pill { font-size:10.5px; font-weight:600; padding:1px 7px; border-radius:999px; white-space:nowrap; }
            .rp-pill-on-solid { background:rgba(255,255,255,0.22); color:#fff; }
            .rp-pill-adb { background:#eef2ff; color:#4338ca; border:1px solid #e0e7ff; }
            .rp-pill-noadb { background:#f1f5f9; color:#475569; border:1px solid #e2e8f0; }

            .rp-result { margin-top:10px; font-size:13px; }
            .rp-result:empty { margin-top:0; }
            .rp-result-box { position:relative; margin-top:4px; padding:12px 14px; border-radius:8px; border-left:4px solid; }
            .rp-result-box.success { background:var(--rp-success-bg); border-color:var(--rp-success); }
            .rp-result-box.error { background:var(--rp-danger-bg); border-color:var(--rp-danger); }
            .rp-result-box.warning { background:var(--rp-warning-bg); border-color:var(--rp-warning); }
            .rp-result-box.info { background:var(--rp-info-bg); border-color:var(--rp-info); }
            .rp-result-box .title { margin:0; font-size:13.5px; font-weight:700; }
            .rp-result-box .sub { margin:4px 0 0; font-size:12.5px; color:var(--rp-muted); }
            .rp-result-box .hint { margin:6px 0 0; font-size:11.5px; color:#92400e; }
            .rp-result-box .log { margin-top:8px; max-height:190px; overflow-y:auto; font-size:11.5px;
                                   background:rgba(0,0,0,0.035); padding:8px; border-radius:6px; line-height:1.6; }
            .rp-result-box .close-x { position:absolute; top:6px; right:8px; background:transparent; border:none;
                                       font-size:19px; color:var(--rp-muted); cursor:pointer; line-height:1; padding:2px 4px; }
            .rp-result-box .close-x:hover { color:var(--rp-ink); }
            .rp-result-box .pending { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--rp-muted); }

            .rp-banner { padding:10px 14px; border-radius:9px; font-size:13px; display:flex; gap:8px; align-items:flex-start; }
            .rp-banner.warn { background:var(--rp-warning-bg); border-left:4px solid var(--rp-warning); color:#92400e; }

            .rp-modal-overlay { z-index:99999; background:rgba(15,23,42,0.55); backdrop-filter:blur(6px);
                                align-items:center; justify-content:center; }
            .rp-modal-box { max-width:480px; padding:0; border-radius:16px; box-shadow:0 24px 60px rgba(15,23,42,0.28);
                            overflow:hidden; background:#fff; }
            .rp-modal-box.wide { max-width:700px; max-height:85vh; display:flex; flex-direction:column; }
            .rp-modal-head { padding:16px 22px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; align-items:center; gap:12px; }
            .rp-modal-head .icon { font-size:24px; }
            .rp-modal-head h3 { margin:0; font-size:16.5px; font-weight:700; }
            .rp-modal-head p.sub { margin:2px 0 0; font-size:12.5px; }
            .rp-modal-head .x { margin-left:auto; background:transparent; border:none; font-size:22px; cursor:pointer; padding:0 4px; }
            .rp-modal-body { padding:22px; }
            .rp-modal-foot { padding:12px 22px; background:#f8fafc; border-top:1px solid var(--rp-line);
                             display:flex; justify-content:flex-end; gap:10px; }

            .rp-brand-card { background:#fff; border:1.5px solid var(--rp-line); border-radius:12px; padding:16px 8px;
                             text-align:center; cursor:pointer; transition:border-color .15s ease, box-shadow .15s ease, transform .1s ease; }
            .rp-brand-card:hover { border-color:var(--rp-info); box-shadow:0 6px 16px rgba(13,110,253,0.15); transform:translateY(-1px); }
            .rp-brand-card img { height:44px; max-width:80px; object-fit:contain; margin-bottom:8px; }
            .rp-brand-card .name { font-size:12.5px; font-weight:600; color:var(--rp-ink); }

            .rp-guide { position:relative; margin-top:8px; padding:14px 16px; background:var(--rp-info-bg);
                        border-radius:8px; border-left:4px solid var(--rp-info); }
            .rp-guide strong.head { display:block; font-size:13.5px; margin-bottom:4px; }
            .rp-guide p, .rp-guide li { font-size:13px; color:#374151; }
            .rp-guide code { background:#e2e8f0; padding:1px 5px; border-radius:4px; font-size:12px; }
            .rp-guide hr { margin:12px 0; border:0; border-top:1px solid #e5e7eb; }

            .rp-confirm-input { width:100%; padding:10px 12px; border:2px solid #d1d5db; border-radius:8px;
                                 font-size:14px; margin-top:6px; transition:border-color .15s ease; }
            .rp-confirm-input:focus { outline:none; border-color:var(--rp-info); }
            .rp-confirm-input.valid { border-color:var(--rp-success); }

            /* History modal specific */
            .history-entry { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #f1f3f5; }
            .history-entry:last-child { border-bottom:none; }
            .history-entry .meta { display:flex; flex-direction:column; gap:2px; }
            .history-entry .meta .action { font-weight:600; font-size:14px; }
            .history-entry .meta .details { font-size:12px; color:#6B7280; }
            .history-entry .status { font-size:12px; font-weight:600; padding:2px 10px; border-radius:12px; }
            .history-entry .status.success { background:#e8f5e9; color:#2e7d32; }
            .history-entry .status.failed { background:#ffebee; color:#c62828; }
            .history-entry .show-emails-btn { background:#0d6efd; color:white; border:none; border-radius:6px; padding:4px 12px; font-size:12px; cursor:pointer; }
            .history-entry .show-emails-btn:disabled { opacity:0.5; cursor:not-allowed; }
            .email-list { margin-top:8px; max-height:150px; overflow-y:auto; background:#f8fafc; padding:8px 12px; border-radius:6px; border:1px solid #e5e7eb; font-family:monospace; font-size:12px; }
        `;
        document.head.appendChild(style);
    }
    injectRepairStyles();

    // ---- Helper: run ADB command ----
    async function runAdb(command) {
        const response = await fetch(`${BACKEND_URL}/adb-shell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: currentDeviceId, command })
        });
        if (!response.ok) {
            let errorMsg = `ADB command failed: ${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData.error) errorMsg += ` – ${errorData.error}`;
            } catch (e) {}
            throw new Error(errorMsg);
        }
        const data = await response.json();
        return data.output;
    }

    // ---- Helper: run Fastboot command ----
    async function runFastboot(command) {
        try {
            const response = await fetch(`${BACKEND_URL}/fastboot-shell`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId: currentDeviceId, command })
            });
            if (!response.ok) throw new Error(`Fastboot command failed: ${response.status}`);
            const data = await response.json();
            return data.output;
        } catch (e) {
            console.warn('Fastboot not implemented – falling back to manual guide.');
            return null;
        }
    }

    // ---- Helper: build a standardized result box ----
    function resultBox(kind, title, sub, hint, log) {
        const icon = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' }[kind] || 'ℹ️';
        return `
            <div class="rp-result-box ${kind}">
                <p class="title">${icon} ${title}</p>
                ${sub ? `<p class="sub">${sub}</p>` : ''}
                ${log ? `<div class="log">${log}</div>` : ''}
                ${hint ? `<p class="hint">${hint}</p>` : ''}
            </div>
        `;
    }

    // ---- Helper: show result modal ----
    function showResultModal(title, message, isSuccess = true) {
        const icon = isSuccess ? '✅' : '❌';
        const color = isSuccess ? '#16a34a' : '#dc2626';
        const headBg = isSuccess ? '#f0fdf4' : '#fef2f2';
        const modalHtml = `
            <div id="resultModal" class="modal rp-modal-overlay" style="display: none;">
                <div class="modal-content rp-modal-box">
                    <div class="rp-modal-head" style="background:${headBg};">
                        <span class="icon">${icon}</span>
                        <h3 style="color:${color};">${title}</h3>
                        <button id="resultModalClose" class="x" style="color:#6B7280;">&times;</button>
                    </div>
                    <div class="rp-modal-body">
                        <p style="margin: 0; font-size: 14px; color: #374151; white-space: pre-wrap; word-break: break-word;">${escapeHtml(message)}</p>
                        <button id="resultModalOkBtn" class="btn-primary rp-btn rp-btn-info" style="margin-top: 16px; width:auto; padding:8px 24px; background: ${color};">OK</button>
                    </div>
                </div>
            </div>
        `;
        const old = document.getElementById('resultModal');
        if (old) old.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('resultModal');
        modal.style.display = 'flex';
        const close = () => modal.style.display = 'none';
        document.getElementById('resultModalClose').addEventListener('click', close);
        document.getElementById('resultModalOkBtn').addEventListener('click', close);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
        if (typeof applyLanguage === 'function') {
            const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
            applyLanguage(window._activeLang || savedLang);
        }
    }

    // ---- Helper: show confirmation modal for dangerous actions ----
    function showDangerConfirm(title, message, callback) {
        const modalHtml = `
            <div id="dangerConfirmModal" class="modal rp-modal-overlay" style="display: none;">
                <div class="modal-content rp-modal-box">
                    <div class="rp-modal-head" style="background:#fef2f2;">
                        <span class="icon">⚠️</span>
                        <h3 style="color:#dc2626;">${title}</h3>
                        <button id="dangerConfirmClose" class="x" style="color:#6B7280;">&times;</button>
                    </div>
                    <div class="rp-modal-body">
                        <p style="margin: 0 0 16px 0; font-size: 14px; color: #374151; white-space: pre-wrap;">${escapeHtml(message)}</p>
                        <div style="display: flex; gap: 12px; justify-content: flex-end;">
                            <button id="dangerConfirmCancel" class="btn-secondary rp-btn rp-btn-ghost" style="width:auto; padding: 8px 24px;" data-i18n="repairs.danger.cancel">Cancel</button>
                            <button id="dangerConfirmOk" class="btn-primary rp-btn rp-btn-danger" style="width:auto; padding: 8px 24px;" data-i18n="repairs.danger.proceed">Proceed</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        const old = document.getElementById('dangerConfirmModal');
        if (old) old.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('dangerConfirmModal');
        modal.style.display = 'flex';
        const close = () => modal.style.display = 'none';
        document.getElementById('dangerConfirmClose').addEventListener('click', close);
        document.getElementById('dangerConfirmCancel').addEventListener('click', close);
        document.getElementById('dangerConfirmOk').addEventListener('click', () => {
            close();
            if (typeof callback === 'function') callback();
        });
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
        if (typeof applyLanguage === 'function') {
            const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
            applyLanguage(window._activeLang || savedLang);
        }
    }

    // ---- Detect device brand ----
    async function getDeviceBrand() {
        try {
            const resp = await fetch(`${BACKEND_URL}/api/device/info/${currentDeviceId}`);
            if (!resp.ok) return null;
            const data = await resp.json();
            return data['ro.product.manufacturer'] || null;
        } catch (e) {
            console.warn('Could not fetch manufacturer:', e);
            return null;
        }
    }
    const detectedBrand = currentDeviceId ? await getDeviceBrand() : null;

    // ---- Brand logo mapping ----
    const brandLogoMap = {
        'alcatel':'Alcatel-Logo.png','asus':'Asus-Logo.png','blackberry':'Blackberry-logo.png',
        'cat':'CAT-logo.png','doogee':'Doogee-Logo.png','energizer':'Energizer-Logo.png',
        'google':'Google-Logo.png','htc':'HTC-logo.png','honor':'Honor-Logo.png',
        'huawei':'Huawei-Logo.png','infinix':'Infinix-Logo.png','itel':'Itel-Logo.png',
        'lg':'LG-Logo.png','lenovo':'Lenovo-logo.png','meizu':'Meizu-Logo.png',
        'nokia':'Nokia-Logo.png','oneplus':'OnePlus-Logo.png','oppo':'Oppo-logo.png',
        'realme':'Realme-Logo.png','samsung':'Samsung-Logo-2.png','sharp':'Sharp-logo.png',
        'sony':'Sony-logo.png','tcl':'TCL-Logo.png','tecno':'Tecno-Mobile-Logo.png',
        'ulefone':'Ulefone-Logo.png','vivo':'Vivo-Logo.png','vodafone':'Vodafone-logo.png',
        'xiaomi':'Xiaomi-logo.png','zte':'ZTE-Logo.png'
    };
    const supportedBrands = Object.keys(brandLogoMap).sort();

    // ---- Reset instructions ----
    function getResetInstructions(brand) {
        const brandLower = brand.toLowerCase();
        const instructions = {
            samsung: { combo:'Volume Up + Power', steps:['Power off...','...'], note:'...' },
            google: { combo:'Volume Down + Power', steps:['...'], note:'...' },
            oneplus: { combo:'Volume Down + Power', steps:['...'], note:'...' },
            xiaomi: { combo:'Volume Up + Power', steps:['...'], note:'...' },
            huawei: { combo:'Volume Up + Power', steps:['...'], note:'...' },
            lg: { combo:'Volume Down + Power (release and press again)', steps:['...'], note:'...' },
            motorola: { combo:'Volume Down + Power', steps:['...'], note:'...' },
            unknown: { combo:'Volume Up + Power (or Volume Down + Power)', steps:['...'], note:'...' }
        };
        return instructions[brandLower] || instructions.unknown;
    }

    // ---- Legal disclaimer modal ----
    function showLegalDisclaimer(action, callback) {
        const modalHtml = `
            <div id="legalDisclaimerModal" class="modal rp-modal-overlay" style="display: none;">
                <div class="modal-content acrylic rp-modal-box">
                    <div class="rp-modal-head" style="background:#fef3c7;">
                        <span class="icon">⚠️</span>
                        <div>
                            <h3 style="color:#92400e;" data-i18n="repairs.legal.title">Legal Disclaimer</h3>
                            <p class="sub" style="color:#78350f;" data-i18n="repairs.legal.subtitle">Please read before proceeding</p>
                        </div>
                        <button id="legalDisclaimerClose" class="x" style="color:#78350f;">&times;</button>
                    </div>
                    <div class="rp-modal-body">
                        <p style="font-size:14px; color:#1e293b; line-height:1.6; margin:0 0 16px 0;" data-i18n="repairs.legal.body">
                            This tool is intended <strong>only for legitimate device recovery</strong> by the rightful owner.
                            Unauthorized use to bypass security on devices you do not own is illegal and unethical.
                        </p>
                        <p style="font-size:13px; color:#6B7280; margin:0 0 20px 0;" data-i18n="repairs.legal.confirm">
                            By proceeding, you confirm that you are the owner of this device or have explicit authorization from the owner.
                        </p>
                        <div style="display:flex; gap:12px; justify-content:flex-end;">
                            <button id="legalCancelBtn" class="btn-secondary rp-btn rp-btn-ghost" style="width:auto; padding:8px 24px;" data-i18n="repairs.legal.cancel">Cancel</button>
                            <button id="legalAcceptBtn" class="btn-primary rp-btn rp-btn-info" style="width:auto; padding:8px 24px; color:${textColor} !important;" data-i18n="repairs.legal.accept">I Understand</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        const old = document.getElementById('legalDisclaimerModal');
        if (old) old.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('legalDisclaimerModal');
        modal.style.display = 'flex';
        const closeModal = (accepted) => {
            modal.style.display = 'none';
            if (accepted && typeof callback === 'function') callback();
        };
        document.getElementById('legalAcceptBtn').addEventListener('click', () => closeModal(true));
        document.getElementById('legalCancelBtn').addEventListener('click', () => closeModal(false));
        document.getElementById('legalDisclaimerClose').addEventListener('click', () => closeModal(false));
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(false); });
        if (typeof applyLanguage === 'function') {
            const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
            applyLanguage(window._activeLang || savedLang);
        }
    }

    // ---- Factory Reset Modal ----
    function showFactoryResetModal() {
        let modal = document.getElementById('factoryResetModal');
        if (!modal) {
            const modalHtml = `
                <div id="factoryResetModal" class="modal rp-modal-overlay" style="display: none;">
                    <div class="modal-content rp-modal-box wide">
                        <div class="rp-modal-head" style="background:#f8fafc; border-bottom:1px solid #e5e7eb;">
                            <h3 id="factoryResetModalTitle" style="color:#1f2937;" data-i18n="repairs.reset.modal.title">🗑️ Factory Reset – Select Your Brand</h3>
                            <button id="closeFactoryResetModal" class="x" style="color:#9ca3af; margin-left:auto;">&times;</button>
                        </div>
                        <div id="factoryResetModalBody" class="rp-modal-body" style="flex:1; overflow-y:auto; background:#fff;"></div>
                        <div class="rp-modal-foot">
                            <button id="closeFactoryResetModalBtn" class="btn-secondary rp-btn rp-btn-ghost" style="width:auto; padding:8px 24px;" data-i18n="repairs.reset.modal.close">Close</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modal = document.getElementById('factoryResetModal');
            document.getElementById('closeFactoryResetModal').addEventListener('click', () => modal.style.display = 'none');
            document.getElementById('closeFactoryResetModalBtn').addEventListener('click', () => modal.style.display = 'none');
            window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
        }
        const bodyEl = document.getElementById('factoryResetModalBody');
        const titleEl = document.getElementById('factoryResetModalTitle');

        function showBrandGrid() {
            titleEl.textContent = '🗑️ Factory Reset – Select Your Brand';
            let html = `
                <p style="color:#6B7280; margin-bottom:16px; font-size:13.5px;" data-i18n="repairs.reset.modal.chooseBrand">Choose your device brand to view the factory reset guide.</p>
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(120px,1fr)); gap:12px;">
            `;
            for (const brand of supportedBrands) {
                const logoFile = brandLogoMap[brand];
                const displayName = brand.charAt(0).toUpperCase() + brand.slice(1);
                html += `
                    <div class="rp-brand-card" data-brand="${brand}">
                        <img src="../android_logo/${logoFile}" alt="${displayName}">
                        <div class="name">${displayName}</div>
                    </div>
                `;
            }
            html += `</div>`;
            bodyEl.innerHTML = html;
            document.querySelectorAll('.rp-brand-card').forEach(card => {
                card.addEventListener('click', function() {
                    const brand = this.dataset.brand;
                    showGuideForBrand(brand);
                });
            });
            if (typeof applyLanguage === 'function') {
                const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
                applyLanguage(window._activeLang || savedLang);
            }
        }

        function showGuideForBrand(brand) {
            const resetInfo = getResetInstructions(brand);
            const displayName = brand.charAt(0).toUpperCase() + brand.slice(1);
            const combo = resetInfo.combo;
            const steps = resetInfo.steps.map((s,i) => `${i+1}. ${s}`).join('<br>');
            const note = resetInfo.note || '';
            const logoFile = brandLogoMap[brand];
            let logoHtml = logoFile ? `<img src="../android_logo/${logoFile}" alt="${displayName}" style="height:40px; max-width:120px; object-fit:contain; margin-right:12px;">` : '';

            titleEl.textContent = `🗑️ Factory Reset – ${displayName}`;
            bodyEl.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:16px; flex-wrap:wrap;">
                    ${logoHtml}
                    <div>
                        <strong style="font-size:18px;">${displayName}</strong>
                        <span style="font-size:13px; color:#6B7280; margin-left:8px;">— Factory Reset Guide</span>
                    </div>
                </div>
                <p style="margin:4px 0 12px; font-size:14px; color:#374151;">
                    <strong data-i18n="repairs.reset.modal.keyCombo">Key combination:</strong> ${combo}
                </p>
                <div style="font-size:14px; color:#374151; line-height:1.8; background:#f8fafc; padding:12px 16px; border-radius:8px;">
                    ${steps}
                </div>
                ${note ? `<p style="margin:12px 0 0; font-size:13px; color:#6B7280;">ℹ️ ${note}</p>` : ''}
                <div class="rp-banner warn" style="margin-top:16px;" data-i18n="repairs.reset.modal.warning">
                    ⚠️ This will erase all data and may trigger Factory Reset Protection (FRP). Have your Google account ready.
                </div>
                <div style="margin-top:16px; display:flex; gap:8px; flex-wrap:wrap;">
                    <button id="copyResetGuideBtn" class="btn-secondary rp-btn rp-btn-ghost" style="width:auto; padding:6px 18px; font-size:13px;" data-i18n="repairs.reset.modal.copy">📋 Copy Instructions</button>
                    <button id="backToBrandsBtn" class="btn-secondary rp-btn rp-btn-ghost" style="width:auto; padding:6px 18px; font-size:13px;" data-i18n="repairs.reset.modal.back">⬅️ Back to Brands</button>
                </div>
            `;
            document.getElementById('copyResetGuideBtn')?.addEventListener('click', function() {
                const text = `Factory Reset for ${displayName}:\n\nKey combo: ${combo}\n\nSteps:\n${steps.replace(/<br>/g, '\n')}`;
                navigator.clipboard.writeText(text).then(() => {
                    this.textContent = '✅ Copied!';
                    setTimeout(() => { this.textContent = '📋 Copy Instructions'; }, 2000);
                });
            });
            document.getElementById('backToBrandsBtn')?.addEventListener('click', showBrandGrid);
            if (typeof applyLanguage === 'function') {
                const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
                applyLanguage(window._activeLang || savedLang);
            }
        }
        showBrandGrid();
        modal.style.display = 'flex';
    }

    // ---- Get Android SDK version ----
    async function getAndroidVersion() {
        try {
            const output = await runAdb('getprop ro.build.version.sdk');
            const sdk = parseInt(output.trim(), 10);
            return isNaN(sdk) ? null : sdk;
        } catch { return null; }
    }

    // ---- Internal FRP deactivation ----
    async function deactivateFrpInternal(silent = false) {
        const sdk = await getAndroidVersion();
        const version = sdk || 0;
        const result = { success: false, version, commands: [] };
        // Pre-check accounts
        try {
            const accounts = await runAdb('dumpsys account');
            const emails = accounts.match(/(?:\[([^\]]+@[^\]]+)\]|name=([^\s,]+@[^\s,]+))/g) || [];
            const uniqueEmails = [...new Set(emails.map(e => e.replace(/[\[\]]/g,'').replace(/name=/g,'')))];
            if (uniqueEmails.length === 0) {
                result.success = true;
                result.commands.push({ cmd:'precheck', status:'✅ No Google accounts found; FRP already removed.' });
                return result;
            }
        } catch(e) {}

        let commands = [];
        const baseCommands = [
            'pm clear com.google.android.gsf',
            'pm clear com.google.android.gms',
            'content delete --uri content://settings/secure --bind name:s:frp_credential_handle',
            'content delete --uri content://settings/secure --bind name:s:frp_credential_handle_signature',
            'content delete --uri content://settings/secure --bind name:s:frp_credential_handle_signature_sha256',
            'content delete --uri content://settings/secure --bind name:s:frp_credential_handle_sha256',
            'locksettings clear --old 0',
        ];
        if (version >= 26 && version <= 30) {
            commands.push('settings delete secure frp_credential_handle','settings delete global frp_credential_handle');
        } else if (version >= 31 && version <= 33) {
            commands.push('settings delete secure frp_credential_handle','settings delete global frp_credential_handle','cmd account remove-account com.google');
        } else if (version >= 34) {
            commands.push('settings delete secure frp_credential_handle','settings delete global frp_credential_handle','cmd account remove-account com.google','dumpsys account --remove-all');
        } else {
            commands.push('settings delete secure frp_credential_handle','settings delete global frp_credential_handle','content delete --uri content://settings/secure --bind name:s:frp_credential_handle','content delete --uri content://settings/global --bind name:s:frp_credential_handle');
        }
        commands.push('am broadcast -a android.intent.action.USER_UNLOCKED');

        const allCommands = [...baseCommands, ...commands];
        let successCount = 0;
        for (const cmd of allCommands) {
            try {
                const output = await runAdb(cmd);
                const status = (output && output.includes('Error')) ? '❌ Failed' : '✅ Succeeded';
                result.commands.push({ cmd, status });
                if (status === '✅ Succeeded') successCount++;
            } catch (e) {
                result.commands.push({ cmd, status:`❌ Error: ${e.message}` });
            }
        }
        try {
            const accounts = await runAdb('dumpsys account');
            const hasGoogle = accounts.includes('com.google');
            result.success = (!hasGoogle && successCount > 0) || (successCount > 2);
            if (!hasGoogle) result.success = true;
        } catch(e) {
            result.success = successCount > 0;
        }
        return result;
    }

    // ---- Helper: Save repair result ----
    async function saveRepairResult(actionType, status, details, summary) {
        const resultData = {
            actionType,
            status,
            details: details || {},
            summary: summary || '',
            createdAt: new Date().toISOString()
        };
        // localStorage
        try {
            const payload = { ...resultData, _timestamp: Date.now() };
            if (typeof saveRepairResults === 'function') saveRepairResults(payload);
        } catch(e) {}
        // Supabase
        try {
            const { saveRepairResult } = await import('./repairs_sb.js');
            await saveRepairResult(resultData, currentDeviceId);
        } catch(e) {
            console.warn('Failed to save to Supabase:', e);
        }
    }

    // ---- Public Deactivate FRP ----
    async function deactivateFrp() {
        const resultDiv = document.getElementById('frpResult');
        resultDiv.innerHTML = `<div class="rp-result-box info"><p class="pending">⏳ Deactivating FRP…</p></div>`;
        const result = await deactivateFrpInternal(false);
        const version = result.version || 'unknown';
        const log = result.commands.map(c => `<div>${c.status} – ${c.cmd}</div>`).join('');
        const sub = `Android SDK: ${version} &nbsp;|&nbsp; Commands attempted: ${result.commands.length}`;
        const hint = result.success ? 'Reboot the device to apply changes.' : 'Try the manual guide below.';
        resultDiv.innerHTML = resultBox(
            result.success ? 'success' : 'error',
            result.success ? 'FRP deactivated' : 'FRP deactivation incomplete',
            sub, hint, log
        );
        await saveRepairResult(
            'frp_deactivate',
            result.success ? 'success' : 'failed',
            { commands: result.commands, version },
            result.success ? 'FRP deactivated' : 'FRP deactivation incomplete'
        );
    }

    // ---- Combined FRP removal + Factory Reset ----
    async function performFullResetWithFrpRemoval() {
        let resultEl = document.getElementById('factoryResetResult');
        if (!resultEl) {
            const card = document.querySelector('.card:has(#factoryResetModalBtn), .rp-card:has(#factoryResetModalBtn)');
            if (card) {
                const div = document.createElement('div');
                div.id = 'factoryResetResult';
                div.className = 'rp-result';
                card.appendChild(div);
                resultEl = div;
            }
        }
        if (!resultEl) return;
        resultEl.innerHTML = `<div class="rp-result-box info"><p class="pending">⏳ Removing FRP and accounts…</p></div>`;

        const result = await deactivateFrpInternal(true);
        if (!result.success) {
            const log = result.commands.map(c => `<div>${c.status} – ${c.cmd}</div>`).join('');
            resultEl.innerHTML = resultBox(
                'error', 'FRP removal failed',
                'Cannot proceed with factory reset because FRP could not be removed. Please try using the "Deactivate FRP" button manually first.',
                null, log
            );
            await saveRepairResult('factory_reset', 'failed', { reason: 'FRP removal failed' }, 'Factory reset failed – FRP not removed');
            return;
        }

        resultEl.innerHTML = `<div class="rp-result-box info"><p class="pending">⏳ Sending factory reset command…</p></div>`;
        try {
            await runAdb("echo '--wipe_data' > /cache/recovery/command");
            resultEl.innerHTML = `<div class="rp-result-box info"><p class="pending">⏳ Rebooting to recovery…</p></div>`;
            await runAdb('reboot recovery');
            resultEl.innerHTML = resultBox(
                'success', 'FRP removed and reset triggered',
                'The device is now rebooting into recovery mode and will perform a factory reset automatically. FRP has been cleared.'
            );
            await saveRepairResult('factory_reset', 'success', { wiped: true }, 'Factory reset triggered with FRP removal');
        } catch (err) {
            resultEl.innerHTML = resultBox(
                'error', 'Reset failed', escapeHtml(err.message),
                'FRP was removed but reset failed. Try manual guide.'
            );
            await saveRepairResult('factory_reset', 'failed', { error: err.message }, 'Factory reset failed');
        }
    }

    // ---- ADB Factory Reset Modal ----
    function showAdbFactoryResetModal() {
        const modalId = 'adbFactoryResetModal';
        const existing = document.getElementById(modalId);
        if (existing) existing.remove();

        const modalHtml = `
            <div id="${modalId}" class="modal rp-modal-overlay" style="display: none; background: rgba(15,23,42,0.65);">
                <div class="modal-content rp-modal-box">
                    <div class="rp-modal-head" style="background: #dc2626;">
                        <span class="icon">⚠️</span>
                        <div>
                            <h3 style="color:white;" data-i18n="repairs.reset.adb.title">Factory Reset via ADB</h3>
                            <p class="sub" style="color:#fca5a5;" data-i18n="repairs.reset.adb.subtitle">This action is irreversible</p>
                        </div>
                        <button id="adbResetModalClose" class="x" style="color:white;">&times;</button>
                    </div>
                    <div class="rp-modal-body">
                        <div class="rp-result-box error" style="margin-top:0;">
                            <p class="title" style="font-weight:500;" data-i18n="repairs.reset.adb.warning1">
                                ⚠️ This will erase <strong>ALL</strong> data and <strong>automatically remove FRP</strong> before wiping.
                                You will need your Google account credentials to set up the device again.
                            </p>
                        </div>
                        <div class="rp-result-box warning" data-i18n="repairs.reset.adb.warning2">
                            <p class="title" style="font-size:13px; font-weight:500;">
                                To confirm, type <strong>CONFIRM</strong> in the box below.
                            </p>
                        </div>
                        <div style="margin-bottom: 16px;">
                            <label for="confirmInput" style="font-size:14px; font-weight:600; color:#1f2937;" data-i18n="repairs.reset.adb.label">Type "CONFIRM" to proceed</label>
                            <input type="text" id="confirmInput" placeholder="CONFIRM" class="rp-confirm-input" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false">
                            <div id="confirmError" style="color:#dc2626; font-size:12px; margin-top:4px; display:none;" data-i18n="repairs.reset.adb.error">Please type CONFIRM exactly.</div>
                        </div>
                        <div style="display:flex; gap:12px; justify-content:flex-end;">
                            <button id="adbResetCancel" class="btn-secondary rp-btn rp-btn-ghost" style="width:auto; padding:8px 24px;" data-i18n="repairs.reset.adb.cancel">Cancel</button>
                            <button id="adbResetProceed" class="btn-primary rp-btn rp-btn-danger is-disabled" style="width:auto; padding:8px 24px;" data-i18n="repairs.reset.adb.proceed">Proceed</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById(modalId);
        modal.style.display = 'flex';

        const input = document.getElementById('confirmInput');
        const proceedBtn = document.getElementById('adbResetProceed');
        const errorDiv = document.getElementById('confirmError');
        const closeModal = () => modal.style.display = 'none';

        document.getElementById('adbResetModalClose').addEventListener('click', closeModal);
        document.getElementById('adbResetCancel').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        input.addEventListener('input', function() {
            const val = this.value.trim();
            if (val.toUpperCase() === 'CONFIRM') {
                proceedBtn.classList.remove('is-disabled');
                input.classList.add('valid');
                errorDiv.style.display = 'none';
            } else {
                proceedBtn.classList.add('is-disabled');
                input.classList.remove('valid');
                errorDiv.style.display = 'block';
                errorDiv.textContent = 'Please type CONFIRM exactly.';
            }
        });

        proceedBtn.addEventListener('click', function() {
            if (input.value.trim().toUpperCase() === 'CONFIRM') {
                closeModal();
                performFullResetWithFrpRemoval();
            }
        });

        if (typeof applyLanguage === 'function') {
            const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
            applyLanguage(window._activeLang || savedLang);
        }
    }

    // ---- Disable Bloatware ----
    function showBloatwareModal() {
        const modalId = 'bloatwareModal';
        const existing = document.getElementById(modalId);
        if (existing) existing.remove();

        const packages = [
            { name:'Facebook', pkg:'com.facebook.katana' },
            { name:'Facebook Messenger', pkg:'com.facebook.orca' },
            { name:'Instagram', pkg:'com.instagram.android' },
            { name:'TikTok', pkg:'com.zhiliaoapp.musically' },
            { name:'LinkedIn', pkg:'com.linkedin.android' },
            { name:'Snapchat', pkg:'com.snapchat.android' },
            { name:'Twitter', pkg:'com.twitter.android' },
            { name:'Chrome', pkg:'com.android.chrome' },
            { name:'Google Photos', pkg:'com.google.android.apps.photos' },
            { name:'Google Drive', pkg:'com.google.android.apps.docs' },
            { name:'YouTube', pkg:'com.google.android.youtube' },
            { name:'Play Movies', pkg:'com.google.android.videos' },
            { name:'Play Music', pkg:'com.google.android.music' },
            { name:'Duo', pkg:'com.google.android.apps.tachyon' },
            { name:'Gmail', pkg:'com.google.android.gm' },
        ];

        let checkboxes = packages.map(p => `
            <div style="display:flex; align-items:center; gap:8px; padding:5px 0;">
                <input type="checkbox" id="pkg_${p.pkg}" value="${p.pkg}" style="width:16px; height:16px;">
                <label for="pkg_${p.pkg}" style="font-size:13px;">${p.name} <span style="color:#6B7280; font-size:11px;">(${p.pkg})</span></label>
            </div>
        `).join('');

        const modalHtml = `
            <div id="${modalId}" class="modal rp-modal-overlay" style="display: none;">
                <div class="modal-content rp-modal-box">
                    <div class="rp-modal-head" style="background: #0d6efd;">
                        <span class="icon">📦</span>
                        <div>
                            <h3 style="color:white;" data-i18n="repairs.bloatware.modal.title">Disable Bloatware</h3>
                            <p class="sub" style="color:#b0d4ff;" data-i18n="repairs.bloatware.modal.subtitle">Select apps to disable (user‑only)</p>
                        </div>
                        <button id="bloatwareModalClose" class="x" style="color:white;">&times;</button>
                    </div>
                    <div class="rp-modal-body" style="max-height:400px; overflow-y:auto;">
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            ${checkboxes}
                        </div>
                        <div style="margin-top:12px; padding-top:10px; border-top:1px solid #e5e7eb; font-size:12.5px; color:#6B7280;">
                            <label><input type="checkbox" id="selectAllBloatware" data-i18n="repairs.bloatware.modal.selectAll"> Select All</label>
                        </div>
                    </div>
                    <div class="rp-modal-foot">
                        <button id="bloatwareCancel" class="btn-secondary rp-btn rp-btn-ghost" style="width:auto; padding:8px 24px;" data-i18n="repairs.bloatware.modal.cancel">Cancel</button>
                        <button id="bloatwareDisable" class="btn-primary rp-btn rp-btn-danger" style="width:auto; padding:8px 24px;" data-i18n="repairs.bloatware.modal.disable">Disable Selected</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById(modalId);
        modal.style.display = 'flex';

        const closeModal = () => modal.style.display = 'none';
        document.getElementById('bloatwareModalClose').addEventListener('click', closeModal);
        document.getElementById('bloatwareCancel').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        document.getElementById('selectAllBloatware').addEventListener('change', function() {
            const checkboxes = modal.querySelectorAll('input[type="checkbox"][value]');
            checkboxes.forEach(cb => cb.checked = this.checked);
        });

        document.getElementById('bloatwareDisable').addEventListener('click', async function() {
            const checked = modal.querySelectorAll('input[type="checkbox"][value]:checked');
            if (checked.length === 0) {
                alert('Please select at least one app to disable.');
                return;
            }
            const pkgs = Array.from(checked).map(cb => cb.value);
            closeModal();

            const resultDiv = document.getElementById('bloatwareResult');
            resultDiv.innerHTML = `<div class="rp-result-box info"><p class="pending">⏳ Disabling selected apps…</p></div>`;

            let results = [];
            let anySuccess = false;
            for (const pkg of pkgs) {
                try {
                    const output = await runAdb(`pm disable-user --user 0 ${pkg}`);
                    const status = output.includes('new state: disabled-user') ? '✅ Disabled' : '⚠️ ' + output.trim();
                    results.push({ pkg, status });
                    if (status.includes('✅')) anySuccess = true;
                } catch (e) {
                    results.push({ pkg, status: '❌ ' + e.message });
                }
            }

            const success = results.filter(r => r.status.includes('✅')).length;
            const log = results.map(r => `<div>${r.status} – ${r.pkg}</div>`).join('');
            const hint = (success === 0 && pkgs.length > 0) ? '💡 Make sure the device is connected and USB debugging is authorized.' : null;
            resultDiv.innerHTML = resultBox(
                success > 0 ? 'success' : 'error',
                success > 0 ? `${success} app(s) disabled` : 'No apps disabled',
                null, hint, log
            );

            await saveRepairResult(
                'disable_bloatware',
                success > 0 ? 'success' : 'failed',
                { disabled: success, total: pkgs.length },
                `${success} app(s) disabled`
            );
        });

        if (typeof applyLanguage === 'function') {
            const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
            applyLanguage(window._activeLang || savedLang);
        }
    }

    // ---- Clear Cache ----
    async function clearCache() {
        const resultDiv = document.getElementById('cacheResult');
        resultDiv.innerHTML = `<div class="rp-result-box info"><p class="pending">⏳ Clearing cache…</p></div>`;

        try {
            await runAdb('pm trim-caches 9999999999');
            const appsOutput = await runAdb('pm list packages');
            const packages = appsOutput.split('\n')
                .map(line => line.replace('package:', '').trim())
                .filter(Boolean);
            const MAX_APPS = 200;
            const packagesToClear = packages.slice(0, MAX_APPS);
            const attemptedCount = packagesToClear.length;
            let clearedCount = 0;
            for (const pkg of packagesToClear) {
                try {
                    const output = await runAdb(`pm clear --cache-only ${pkg}`);
                    if (output.includes('Success') || output.includes('Cleared')) clearedCount++;
                } catch(e) {}
                await new Promise(r => setTimeout(r, 10));
            }
            const message = `Trimmed caches and cleared cache for ${clearedCount} app${clearedCount !== 1 ? 's' : ''} (out of ${attemptedCount} attempted).`;
            resultDiv.innerHTML = resultBox('success', 'Cache cleared', message);
            await saveRepairResult(
                'clear_cache',
                'success',
                { appsCleared: clearedCount, totalAttempted: attemptedCount },
                `Cleared cache for ${clearedCount} apps`
            );
        } catch (err) {
            resultDiv.innerHTML = resultBox('error', 'Clear cache failed', escapeHtml(err.message), 'Try using the manual guide below.');
            await saveRepairResult('clear_cache', 'failed', { error: err.message }, 'Clear cache failed');
        }
    }

    // ---- Reboot to Recovery / Download ----
    async function rebootToRecovery() {
        const resultDiv = document.getElementById('rebootResult');
        resultDiv.innerHTML = `<div class="rp-result-box info"><p class="pending">⏳ Rebooting to Recovery…</p></div>`;
        try {
            await runAdb('reboot recovery');
            resultDiv.innerHTML = resultBox('success', 'Reboot to Recovery sent', 'The device should now boot into Recovery mode.');
            await saveRepairResult('reboot_recovery', 'success', {}, 'Rebooted to Recovery');
        } catch (err) {
            resultDiv.innerHTML = resultBox('error', 'Failed to reboot', escapeHtml(err.message));
            await saveRepairResult('reboot_recovery', 'failed', { error: err.message }, 'Reboot to Recovery failed');
        }
    }

    async function rebootToDownload() {
        const resultDiv = document.getElementById('rebootResult');
        resultDiv.innerHTML = `<div class="rp-result-box info"><p class="pending">⏳ Rebooting to Download mode…</p></div>`;
        try {
            await runAdb('reboot download');
            resultDiv.innerHTML = resultBox('success', 'Reboot to Download sent', 'The device should now boot into Download mode (Samsung).');
            await saveRepairResult('reboot_download', 'success', {}, 'Rebooted to Download');
        } catch (err) {
            resultDiv.innerHTML = resultBox('error', 'Failed to reboot', escapeHtml(err.message));
            await saveRepairResult('reboot_download', 'failed', { error: err.message }, 'Reboot to Download failed');
        }
    }

    // ---- Build main UI ----
    let deviceCheckHtml = '';
    if (!currentDeviceId) {
        deviceCheckHtml = `
            <div class="rp-banner warn" style="margin-top:14px;">
                <span data-i18n="repairs.noDevice">⚠️ No device connected. Some features require ADB, but guides are always available.</span>
            </div>
        `;
    }

    function actionBtn({ id, kind, label, i18n, adb, disabled }) {
        const classes = { danger: 'rp-btn-danger', info: 'rp-btn-info', ghost: 'rp-btn-ghost' }[kind];
        const baseClass = kind === 'ghost' ? 'btn-secondary' : 'btn-primary';
        const pill = adb === null ? '' :
            adb
                ? `<span class="rp-pill ${kind === 'ghost' ? 'rp-pill-adb' : 'rp-pill-on-solid'}">ADB required</span>`
                : `<span class="rp-pill ${kind === 'ghost' ? 'rp-pill-noadb' : 'rp-pill-on-solid'}">No ADB</span>`;
        const disAttr = disabled ? 'disabled' : '';
        const disClass = disabled ? 'is-disabled' : '';
        return `
            <button id="${id}" class="${baseClass} rp-btn ${classes} ${disClass}" ${disAttr}>
                <span data-i18n="${i18n}">${label}</span>${pill}
            </button>
        `;
    }

    const html = `
        <div class="rp-page">
        <div style="margin-bottom:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                <div>
                    <h1 style="margin-bottom:6px; font-size:24px; font-weight:700; color:#1f2937;" data-i18n="repairs.title">🔧 Repair Tools</h1>
                    <p style="color:#6b7280; font-size:14px; margin:0;" data-i18n="repairs.subtitle">Recovery and maintenance operations – practical guides & automation.</p>
                </div>
                ${currentDeviceId ? `<button id="repairHistoryBtn" class="btn-secondary" style="padding:6px 18px; font-size:13px; border-radius:8px; border:1px solid #d1d5db; background:#f8fafc; cursor:pointer;">📜 History</button>` : ''}
            </div>
            <div class="rp-banner warn" style="margin-top:10px;" data-i18n="repairs.warning">
                ⚠️ These actions can erase data or void warranties. Proceed with caution.
            </div>
            ${deviceCheckHtml}
        </div>

        <!-- Section: Account & Security -->
        <div class="rp-section">
            <div class="rp-section-head"><h2 data-i18n="repairs.section.account">Account &amp; Security</h2><div class="rp-rule"></div></div>
            <div class="rp-grid">

                <div class="rp-card accent-danger">
                    <div class="rp-card-head">
                        <span class="rp-icon-badge danger">🚫</span>
                        <h3 data-i18n="repairs.frp.title">FRP Bypass</h3>
                    </div>
                    <span class="rp-risk destructive"><span class="dot"></span>Irreversible</span>
                    <p class="rp-desc" data-i18n="repairs.frp.desc">Remove Google accounts and deactivate Factory Reset Protection.</p>
                    <div class="rp-btns">
                        ${actionBtn({ id:'frpDeactivateBtn', kind:'danger', label:'🔓 Deactivate FRP', i18n:'repairs.frp.deactivate', adb:true, disabled: !currentDeviceId })}
                        ${actionBtn({ id:'frpGuideBtn', kind:'ghost', label:'📋 Guide', i18n:'repairs.frp.guide', adb:false, disabled:false })}
                    </div>
                    <div id="frpResult" class="rp-result"></div>
                </div>

                <div class="rp-card accent-info">
                    <div class="rp-card-head">
                        <span class="rp-icon-badge info">📧</span>
                        <h3 data-i18n="repairs.email.title">Retrieve Email</h3>
                    </div>
                    <span class="rp-risk safe"><span class="dot"></span>Read-only</span>
                    <p class="rp-desc" data-i18n="repairs.email.desc">Recover Google account email – use web guide or ADB retrieval.</p>
                    <div class="rp-btns">
                        ${actionBtn({ id:'retrieveEmailGuideBtn', kind:'ghost', label:'📋 Show Guide', i18n:'repairs.email.guide', adb:false, disabled:false })}
                        ${actionBtn({ id:'retrieveEmailAdbBtn', kind:'info', label:'🔌 Retrieve via ADB', i18n:'repairs.email.adb', adb:true, disabled: !currentDeviceId })}
                    </div>
                    <div id="emailResult" class="rp-result"></div>
                </div>

            </div>
        </div>

        <!-- Section: Reset & Bootloader -->
        <div class="rp-section">
            <div class="rp-section-head"><h2 data-i18n="repairs.section.reset">Reset &amp; Bootloader</h2><div class="rp-rule"></div></div>
            <div class="rp-grid">

                <div class="rp-card accent-danger">
                    <div class="rp-card-head">
                        <span class="rp-icon-badge danger">🗑️</span>
                        <h3 data-i18n="repairs.reset.title">Factory Reset</h3>
                    </div>
                    <span class="rp-risk destructive"><span class="dot"></span>Erases all data</span>
                    <p class="rp-desc" data-i18n="repairs.reset.desc">Wipe all data – FRP will be removed automatically before reset.</p>
                    <div class="rp-btns">
                        ${actionBtn({ id:'factoryResetModalBtn', kind:'ghost', label:'📋 Show Reset Guide', i18n:'repairs.reset.guide', adb:false, disabled:false })}
                        ${actionBtn({ id:'adbFactoryResetBtn', kind:'danger', label:'🔧 Factory Reset via ADB', i18n:'repairs.reset.adb', adb:true, disabled: !currentDeviceId })}
                    </div>
                    <div id="factoryResetResult" class="rp-result"></div>
                </div>

                <div class="rp-card accent-danger">
                    <div class="rp-card-head">
                        <span class="rp-icon-badge danger">🔓</span>
                        <h3 data-i18n="repairs.bootloader.title">Bootloader</h3>
                    </div>
                    <span class="rp-risk destructive"><span class="dot"></span>Erases all data</span>
                    <p class="rp-desc" data-i18n="repairs.bootloader.desc">Reboot, unlock, or lock the bootloader (wipes data).</p>
                    <div class="rp-btns">
                        ${actionBtn({ id:'bootloaderRebootBtn', kind:'ghost', label:'📱 Reboot to Bootloader', i18n:'repairs.bootloader.reboot', adb:true, disabled: !currentDeviceId })}
                        ${actionBtn({ id:'bootloaderUnlockBtn', kind:'danger', label:'🔓 Unlock Bootloader', i18n:'repairs.bootloader.unlock', adb:true, disabled: !currentDeviceId })}
                        ${actionBtn({ id:'bootloaderLockBtn', kind:'danger', label:'🔒 Lock Bootloader', i18n:'repairs.bootloader.lock', adb:true, disabled: !currentDeviceId })}
                        ${actionBtn({ id:'bootloaderCommandsBtn', kind:'ghost', label:'📋 Commands Guide', i18n:'repairs.bootloader.commands', adb:false, disabled:false })}
                    </div>
                    <div id="bootloaderResult" class="rp-result"></div>
                </div>

            </div>
        </div>

        <!-- Section: Maintenance -->
        <div class="rp-section">
            <div class="rp-section-head"><h2 data-i18n="repairs.section.maintenance">Maintenance</h2><div class="rp-rule"></div></div>
            <div class="rp-grid">

                <div class="rp-card accent-info">
                    <div class="rp-card-head">
                        <span class="rp-icon-badge info">📦</span>
                        <h3 data-i18n="repairs.bloatware.title">Disable Bloatware</h3>
                    </div>
                    <span class="rp-risk caution"><span class="dot"></span>Reversible</span>
                    <p class="rp-desc" data-i18n="repairs.bloatware.desc">Disable pre‑installed system apps (user‑only).</p>
                    <div class="rp-btns">
                        ${actionBtn({ id:'bloatwareModalBtn', kind:'info', label:'📦 Select Apps to Disable', i18n:'repairs.bloatware.select', adb:true, disabled: !currentDeviceId })}
                        ${actionBtn({ id:'bloatwareGuideBtn', kind:'ghost', label:'📋 Guide', i18n:'repairs.bloatware.guide', adb:false, disabled:false })}
                    </div>
                    <div id="bloatwareResult" class="rp-result"></div>
                </div>

                <div class="rp-card accent-info">
                    <div class="rp-card-head">
                        <span class="rp-icon-badge info">🧹</span>
                        <h3 data-i18n="repairs.cache.title">Clear Cache</h3>
                    </div>
                    <span class="rp-risk safe"><span class="dot"></span>Safe</span>
                    <p class="rp-desc" data-i18n="repairs.cache.desc">Clear app cache and temporary files.</p>
                    <div class="rp-btns">
                        ${actionBtn({ id:'clearCacheBtn', kind:'info', label:'🧹 Clear Cache', i18n:'repairs.cache.clear', adb:true, disabled: !currentDeviceId })}
                        ${actionBtn({ id:'cacheGuideBtn', kind:'ghost', label:'📋 Guide', i18n:'repairs.cache.guide', adb:false, disabled:false })}
                    </div>
                    <div id="cacheResult" class="rp-result"></div>
                </div>

                <div class="rp-card accent-info">
                    <div class="rp-card-head">
                        <span class="rp-icon-badge info">📱</span>
                        <h3 data-i18n="repairs.reboot.title">Reboot Modes</h3>
                    </div>
                    <span class="rp-risk safe"><span class="dot"></span>Safe</span>
                    <p class="rp-desc" data-i18n="repairs.reboot.desc">Reboot to Recovery or Download mode.</p>
                    <div class="rp-btns">
                        ${actionBtn({ id:'rebootRecoveryBtn', kind:'info', label:'📱 Reboot to Recovery', i18n:'repairs.reboot.recovery', adb:true, disabled: !currentDeviceId })}
                        ${actionBtn({ id:'rebootDownloadBtn', kind:'info', label:'📱 Reboot to Download', i18n:'repairs.reboot.download', adb:true, disabled: !currentDeviceId })}
                        ${actionBtn({ id:'rebootGuideBtn', kind:'ghost', label:'📋 Guide', i18n:'repairs.reboot.guide', adb:false, disabled:false })}
                    </div>
                    <div id="rebootResult" class="rp-result"></div>
                </div>

            </div>
        </div>
        </div>
    `;

    container.innerHTML = html;

    // ---- APPLY LANGUAGE ----
    if (typeof applyLanguage === 'function') {
        const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
        applyLanguage(window._activeLang || savedLang);
    }

    // ---- LOAD AND DISPLAY LATEST RESULTS PER CARD (without emails) ----
    try {
        const { getCurrentUserId, getCurrentDeviceId } = await import('./sb-utils.js');
        const { fetchRepairHistory } = await import('./sb-loader.js');

        const userId = getCurrentUserId();
        const deviceId = getCurrentDeviceId() || window.currentDeviceId;

        if (userId && deviceId) {
            const history = await fetchRepairHistory(userId, deviceId, 50);
            if (history && history.length > 0) {
                // Group by action and get latest
                const latestByAction = {};
                for (const entry of history) {
                    const action = entry.actionType;
                    if (!latestByAction[action] || new Date(entry.createdAt) > new Date(latestByAction[action].createdAt)) {
                        latestByAction[action] = entry;
                    }
                }

                // Helper to render a result box from an entry (hides emails)
                function renderResultBoxForEntry(entry, containerId) {
                    const container = document.getElementById(containerId);
                    if (!container) return;
                    const statusColor = entry.status === 'success' ? 'success' : 'error';
                    let title = entry.status === 'success' ? `${entry.actionType} succeeded` : `${entry.actionType} failed`;
                    let sub = entry.summary || '';
                    let hint = '';

                    // For email retrieval, show count but hide emails
                    if (entry.actionType === 'retrieve_email' && entry.details && entry.details.details && Array.isArray(entry.details.details.emails) && entry.details.details.emails.length > 0) {
                        const count = entry.details.details.emails.length;
                        sub = `📧 ${count} account(s) retrieved (emails hidden)`;
                        hint = 'To view the emails, click the History button and use the "Show Emails" option.';
                    } else if (entry.details && typeof entry.details === 'object' && entry.actionType !== 'retrieve_email') {
                        const summaryStr = Object.entries(entry.details)
                            .filter(([k]) => k !== 'emails' && k !== 'details')
                            .map(([k,v]) => `${k}: ${v}`)
                            .join(', ');
                        if (summaryStr) sub += ` (${summaryStr})`;
                    }

                    container.innerHTML = resultBox(statusColor, title, sub, hint);
                    container.style.display = 'block';
                }

                // Map action types to container IDs
                const actionMap = {
                    'frp_deactivate': 'frpResult',
                    'retrieve_email': 'emailResult',
                    'factory_reset': 'factoryResetResult',
                    'reboot_bootloader': 'bootloaderResult',
                    'reboot_recovery': 'rebootResult',
                    'reboot_download': 'rebootResult',
                    'disable_bloatware': 'bloatwareResult',
                    'clear_cache': 'cacheResult'
                };

                for (const [action, entry] of Object.entries(latestByAction)) {
                    const containerId = actionMap[action];
                    if (containerId) {
                        renderResultBoxForEntry(entry, containerId);
                    }
                }
            }
        }
    } catch (e) {
        console.warn('[Repairs] Could not load previous results:', e);
    }

    // ---- HISTORY BUTTON AND MODAL ----
    document.getElementById('repairHistoryBtn')?.addEventListener('click', async function() {
        // Show modal with all history entries
        let modal = document.getElementById('repairHistoryModal');
        if (!modal) {
            const modalHtml = `
                <div id="repairHistoryModal" class="modal rp-modal-overlay" style="display: none;">
                    <div class="modal-content rp-modal-box wide" style="max-width:800px;">
                        <div class="rp-modal-head" style="background:#f8fafc;">
                            <span class="icon">📜</span>
                            <h3 style="color:#1f2937;">Repair History</h3>
                            <button id="historyModalClose" class="x" style="color:#6B7280;">&times;</button>
                        </div>
                        <div id="historyModalBody" class="rp-modal-body" style="flex:1; overflow-y:auto; max-height:70vh; padding:16px 22px;">
                            <div id="historyList"></div>
                        </div>
                        <div class="rp-modal-foot">
                            <button id="historyModalCloseBtn" class="btn-secondary rp-btn rp-btn-ghost" style="width:auto; padding:8px 24px;">Close</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modal = document.getElementById('repairHistoryModal');
            document.getElementById('historyModalClose').addEventListener('click', () => modal.style.display = 'none');
            document.getElementById('historyModalCloseBtn').addEventListener('click', () => modal.style.display = 'none');
            window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
        }

        // Fetch history again (or use cached)
        const { getCurrentUserId, getCurrentDeviceId } = await import('./sb-utils.js');
        const { fetchRepairHistory } = await import('./sb-loader.js');
        const userId = getCurrentUserId();
        const deviceId = getCurrentDeviceId() || window.currentDeviceId;
        if (!userId || !deviceId) {
            document.getElementById('historyList').innerHTML = '<p>No device or user.</p>';
            modal.style.display = 'flex';
            return;
        }
        const history = await fetchRepairHistory(userId, deviceId, 100);
        const listEl = document.getElementById('historyList');
        if (!history || history.length === 0) {
            listEl.innerHTML = '<p style="color:#6B7280;">No repair history found.</p>';
        } else {
            let html = '';
            for (const entry of history) {
                const statusClass = entry.status === 'success' ? 'success' : 'failed';
                const statusLabel = entry.status.toUpperCase();
                const dateStr = entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'N/A';
                const summary = entry.summary || '';
                let detailsStr = '';
                let showEmailBtn = '';

                // ✅ FIX: Check nested details.details.emails
                if (entry.actionType === 'retrieve_email' && 
                    entry.details && 
                    entry.details.details && 
                    Array.isArray(entry.details.details.emails) && 
                    entry.details.details.emails.length > 0) {
                    
                    const emailsJson = JSON.stringify(entry.details.details.emails);
                    showEmailBtn = `
                        <button class="show-emails-btn" data-emails='${escapeHtml(emailsJson)}' data-action="${entry.actionType}" data-date="${entry.createdAt}">🔒 Show Emails</button>
                    `;
                    detailsStr = `📧 ${entry.details.details.emails.length} account(s) (hidden)`;
                } else if (entry.details && typeof entry.details === 'object' && entry.actionType !== 'retrieve_email') {
                    const summaryStr = Object.entries(entry.details)
                        .filter(([k]) => k !== 'emails' && k !== 'details')
                        .map(([k,v]) => `${k}: ${v}`)
                        .join(', ');
                    detailsStr = summaryStr || '';
                }

                html += `
                    <div class="history-entry">
                        <div class="meta">
                            <div class="action">${entry.actionType}</div>
                            <div class="details">${summary} ${detailsStr ? '– ' + detailsStr : ''}</div>
                            <div style="font-size:11px; color:#9CA3AF;">${dateStr}</div>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="status ${statusClass}">${statusLabel}</span>
                            ${showEmailBtn}
                        </div>
                    </div>
                `;
            }
            listEl.innerHTML = html;

            // Attach event listeners to "Show Emails" buttons
            listEl.querySelectorAll('.show-emails-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const emailsJson = this.dataset.emails;
                    const action = this.dataset.action;
                    const date = this.dataset.date;
                    if (!emailsJson) return;
                    // Show legal disclaimer + factory reset confirmation
                    showEmailDisclaimer(() => {
                        // Reveal emails
                        const emails = JSON.parse(emailsJson);
                        const parent = this.closest('.history-entry');
                        if (parent) {
                            // Remove the button, show emails
                            const existingEmailList = parent.querySelector('.email-list');
                            if (existingEmailList) existingEmailList.remove();
                            const emailDiv = document.createElement('div');
                            emailDiv.className = 'email-list';
                            emailDiv.innerHTML = emails.map(e => `<div>${escapeHtml(e)}</div>`).join('');
                            // Insert after the meta div
                            const meta = parent.querySelector('.meta');
                            meta.after(emailDiv);
                            this.remove(); // remove the button
                            // Also add a small note
                            const note = document.createElement('div');
                            note.style.cssText = 'font-size:11px; color:#6B7280; margin-top:4px;';
                            note.textContent = '✅ Emails revealed after successful factory reset confirmation.';
                            meta.after(note);
                        }
                    });
                });
            });
        }
        modal.style.display = 'flex';
        if (typeof applyLanguage === 'function') {
            const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
            applyLanguage(window._activeLang || savedLang);
        }
    });

    // ---- Helper: Email Disclaimer ----
    function showEmailDisclaimer(callback) {
    const modalHtml = `
        <div id="emailDisclaimerModal" class="modal rp-modal-overlay" style="display: none; z-index:100000;">
            <div class="modal-content rp-modal-box" style="max-width:550px;">
                <div class="rp-modal-head" style="background:#fef3c7;">
                    <span class="icon">🔒</span>
                    <div>
                        <h3 style="color:#92400e;">Privacy & Legal Confirmation</h3>
                        <p class="sub" style="color:#78350f;">You must confirm the following to view the emails</p>
                    </div>
                    <button id="emailDisclaimerClose" class="x" style="color:#78350f;">&times;</button>
                </div>
                <div class="rp-modal-body">
                    <div style="margin-bottom:16px;">
                        <p style="font-size:14px; color:#1e293b; line-height:1.6; margin:0 0 12px 0;">
                            <strong>These email addresses are sensitive personal information.</strong> 
                            They should only be viewed after you have performed a factory reset on the device and are certain that the data is no longer needed for recovery.
                        </p>
                        <p style="font-size:13px; color:#6B7280; margin:0 0 12px 0;">
                            By revealing these emails, you confirm that you are the owner of the device or have explicit authorization, and that you understand the privacy implications.
                        </p>
                    </div>
                    <div style="margin-bottom:12px;">
                        <label style="display:flex; align-items:center; gap:8px; font-size:14px; cursor:pointer;">
                            <input type="checkbox" id="legalCheck" style="width:16px; height:16px;">
                            <span>I agree to the legal terms and understand the sensitivity of this data.</span>
                        </label>
                    </div>
                    <div style="display:flex; gap:12px; justify-content:flex-end;">
                        <button id="emailDisclaimerCancel" class="btn-secondary rp-btn rp-btn-ghost" style="width:auto; padding:8px 24px;">Cancel</button>
                        <button id="emailDisclaimerAccept" class="btn-primary rp-btn rp-btn-info" style="width:auto; padding:8px 24px; background:#0d6efd; color:white;" disabled>Reveal Emails</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    const old = document.getElementById('emailDisclaimerModal');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('emailDisclaimerModal');
    modal.style.display = 'flex';

    const legalCheck = document.getElementById('legalCheck');
    const acceptBtn = document.getElementById('emailDisclaimerAccept');

    function checkValidity() {
        acceptBtn.disabled = !legalCheck.checked; // only legal check required
    }
    legalCheck.addEventListener('change', checkValidity);

    const closeModal = () => modal.style.display = 'none';
    document.getElementById('emailDisclaimerClose').addEventListener('click', closeModal);
    document.getElementById('emailDisclaimerCancel').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    acceptBtn.addEventListener('click', function() {
        if (!this.disabled) {
            closeModal();
            if (typeof callback === 'function') callback();
        }
    });

    if (typeof applyLanguage === 'function') {
        const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
        applyLanguage(window._activeLang || savedLang);
    }
}

    // ---- Event Listeners ----
    document.getElementById('frpDeactivateBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Deactivate FRP', () => {
            showDangerConfirm(
                '⚠️ Remove All Google Accounts & FRP',
                'This will remove all Google accounts and FRP locks from this device.\n\n' +
                'This action is irreversible. You will not be able to restore account information without re-entering credentials.\n\n' +
                'Do you want to proceed?',
                () => { deactivateFrp(); }
            );
        });
    });

    document.getElementById('frpGuideBtn').addEventListener('click', function() {
        const resultDiv = document.getElementById('frpResult');
        if (resultDiv.querySelector('.guide-close-btn')) {
            resultDiv.innerHTML = '';
            return;
        }
        resultDiv.innerHTML = `
            <div class="rp-guide">
                <button class="guide-close-btn close-x" title="Close guide">&times;</button>
                <strong class="head" data-i18n="repairs.frp.guide.title">📋 FRP Bypass Guide (no ADB)</strong>
                <p style="margin:0 0 6px;" data-i18n="repairs.frp.guide.intro">If USB Debugging is not available, try these methods:</p>
                <ul style="margin-top:4px; padding-left:20px;">
                    <li><strong data-i18n="repairs.frp.guide.method1">Method 1:</strong> <span data-i18n="repairs.frp.guide.method1.desc">Use the <a href="https://www.google.com/android/find" target="_blank">Find My Device</a> website to remotely lock the device and reset the password.</span></li>
                    <li><strong data-i18n="repairs.frp.guide.method2">Method 2:</strong> <span data-i18n="repairs.frp.guide.method2.desc">Boot into Recovery Mode and perform a factory reset (this will erase all data).</span></li>
                    <li><strong data-i18n="repairs.frp.guide.method3">Method 3:</strong> <span data-i18n="repairs.frp.guide.method3.desc">Use third‑party tools like <a href="https://frp2026.github.io/" target="_blank">FRP2026</a> (works on some devices).</span></li>
                    <li><strong data-i18n="repairs.frp.guide.method4">Method 4:</strong> <span data-i18n="repairs.frp.guide.method4.desc">Try the Emergency Call trick: <code>*#*#4636#*#*</code> might grant access to settings.</span></li>
                </ul>
                <hr>
                <p style="margin:0; font-size:12px; color:#6B7280;" data-i18n="repairs.frp.guide.note">💡 <strong>Note:</strong> These methods may not work on all devices. The ADB method above is more reliable.</p>
            </div>
        `;
        resultDiv.querySelector('.guide-close-btn').addEventListener('click', function() {
            resultDiv.innerHTML = '';
        });
        if (typeof applyLanguage === 'function') {
            const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
            applyLanguage(window._activeLang || savedLang);
        }
    });

    document.getElementById('retrieveEmailGuideBtn').addEventListener('click', function() {
        const resultDiv = document.getElementById('emailResult');
        if (resultDiv.querySelector('.guide-close-btn')) {
            resultDiv.innerHTML = '';
            return;
        }
        resultDiv.innerHTML = `
            <div class="rp-guide">
                <button class="guide-close-btn close-x" title="Close guide">&times;</button>
                <strong class="head" data-i18n="repairs.email.guide.title">📧 Account Recovery Guide</strong>
                <p style="margin:0;" data-i18n="repairs.email.guide.desc">Open <a href="https://accounts.google.com/signin/usernamerecovery" target="_blank">Google Account Recovery</a> on any device. If you can access the phone's browser via Emergency Call or Accessibility, visit that URL directly on the phone.</p>
                <hr>
                <p style="margin:0; font-size:12px; color:#6B7280;" data-i18n="repairs.email.guide.tip">💡 <strong>Tip:</strong> On the lock screen, try swiping up and tapping "Emergency call", then enter <code>*#*#4636#*#*</code> or similar codes to access settings (varies by device).</p>
            </div>
        `;
        resultDiv.querySelector('.guide-close-btn').addEventListener('click', function() {
            resultDiv.innerHTML = '';
        });
        if (typeof applyLanguage === 'function') {
            const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
            applyLanguage(window._activeLang || savedLang);
        }
    });

    document.getElementById('retrieveEmailAdbBtn').addEventListener('click', async function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Retrieve Email via ADB', async () => {
            const resultDiv = document.getElementById('emailResult');
            resultDiv.innerHTML = `<div class="rp-result-box info"><p class="pending">⏳ Retrieving accounts via ADB…</p></div>`;
            try {
                const output = await runAdb('dumpsys account');
                const emails = output.match(/(?:\[([^\]]+@[^\]]+)\]|name=([^\s,]+@[^\s,]+))/g) || [];
                const uniqueEmails = [...new Set(emails.map(e => e.replace(/[\[\]]/g, '').replace(/name=/g, '')))];
                if (uniqueEmails.length === 0) {
                    resultDiv.innerHTML = resultBox('error', 'No emails found', 'No Google accounts were detected on this device.');
                } else {
                    // Show only count in the card, not the emails
                    resultDiv.innerHTML = resultBox(
                        'success', `Found ${uniqueEmails.length} account(s)`,
                        '📧 Emails hidden for privacy. Use the History button to view them after confirming factory reset.',
                        'To view the emails, click the History button and use the "Show Emails" option.'
                    );
                }
                await saveRepairResult(
                    'retrieve_email',
                    'success',
                    { count: uniqueEmails.length, emails: uniqueEmails },
                    `Retrieved ${uniqueEmails.length} account(s)`
                );
            } catch (err) {
                resultDiv.innerHTML = resultBox('error', 'ADB retrieval failed', escapeHtml(err.message), 'Make sure USB Debugging is enabled and the device is authorized.');
                await saveRepairResult('retrieve_email', 'failed', { error: err.message }, 'ADB retrieval failed');
            }
        });
    });

    document.getElementById('factoryResetModalBtn').addEventListener('click', function() {
        showLegalDisclaimer('Factory Reset Guide', () => {
            showFactoryResetModal();
        });
    });

    document.getElementById('adbFactoryResetBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Factory Reset via ADB', () => {
            showAdbFactoryResetModal();
        });
    });

    document.getElementById('bootloaderRebootBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Reboot to Bootloader', async () => {
            const resultDiv = document.getElementById('bootloaderResult');
            resultDiv.innerHTML = `<div class="rp-result-box info"><p class="pending">⏳ Rebooting to bootloader…</p></div>`;
            try {
                await runAdb('reboot bootloader');
                resultDiv.innerHTML = resultBox('success', 'Reboot sent', 'The device should now be in bootloader mode. Use fastboot commands for further actions.');
                await saveRepairResult('reboot_bootloader', 'success', {}, 'Rebooted to bootloader');
            } catch (err) {
                resultDiv.innerHTML = resultBox('error', 'Failed to reboot', escapeHtml(err.message), 'Try manually: power off, then press Volume Down + Power to enter bootloader.');
                await saveRepairResult('reboot_bootloader', 'failed', { error: err.message }, 'Reboot to bootloader failed');
            }
        });
    });

    document.getElementById('bootloaderUnlockBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showDangerConfirm(
            '🔓 Unlock Bootloader',
            'This will erase ALL data on the device and may void your warranty.\n\nAre you sure you want to proceed?',
            () => {
                showLegalDisclaimer('Unlock Bootloader', async () => {
                    const resultDiv = document.getElementById('bootloaderResult');
                    resultDiv.innerHTML = `<div class="rp-result-box info"><p class="pending">⏳ Attempting to unlock bootloader…</p></div>`;
                    try {
                        await runAdb('reboot bootloader').catch(() => {});
                        const output = await runFastboot('flashing unlock');
                        if (output === null) {
                            resultDiv.innerHTML = `
                                <div class="rp-result-box warning">
                                    <p class="title" data-i18n="repairs.bootloader.unlock.fastbootMissing">⚠️ Fastboot not available</p>
                                    <p class="sub" data-i18n="repairs.bootloader.unlock.manualCmd">Please run the following command manually in terminal:</p>
                                    <pre style="background:#1e293b; color:#e2e8f0; padding:8px; border-radius:4px; font-size:12px; margin:8px 0 0;">fastboot flashing unlock</pre>
                                    <p class="hint" data-i18n="repairs.bootloader.unlock.followScreen">Follow the on-screen instructions on your device.</p>
                                </div>
                            `;
                            await saveRepairResult('bootloader_unlock', 'failed', { reason: 'Fastboot not available' }, 'Bootloader unlock failed – Fastboot missing');
                        } else {
                            resultDiv.innerHTML = resultBox(
                                'success', 'Bootloader unlocked', `Output: ${escapeHtml(output)}`,
                                'The device will likely reboot and wipe all data.'
                            );
                            await saveRepairResult('bootloader_unlock', 'success', {}, 'Bootloader unlocked');
                        }
                    } catch (err) {
                        resultDiv.innerHTML = resultBox('error', 'Unlock failed', escapeHtml(err.message), 'Ensure USB Debugging and OEM unlocking are enabled, and the device is in bootloader mode.');
                        await saveRepairResult('bootloader_unlock', 'failed', { error: err.message }, 'Bootloader unlock failed');
                    }
                });
            }
        );
    });

    document.getElementById('bootloaderLockBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showDangerConfirm(
            '🔒 Lock Bootloader',
            'This will erase ALL data on the device and restore factory state.\n\nAre you sure you want to proceed?',
            () => {
                showLegalDisclaimer('Lock Bootloader', async () => {
                    const resultDiv = document.getElementById('bootloaderResult');
                    resultDiv.innerHTML = `<div class="rp-result-box info"><p class="pending">⏳ Attempting to lock bootloader…</p></div>`;
                    try {
                        await runAdb('reboot bootloader').catch(() => {});
                        const output = await runFastboot('flashing lock');
                        if (output === null) {
                            resultDiv.innerHTML = `
                                <div class="rp-result-box warning">
                                    <p class="title" data-i18n="repairs.bootloader.lock.fastbootMissing">⚠️ Fastboot not available</p>
                                    <p class="sub" data-i18n="repairs.bootloader.lock.manualCmd">Please run the following command manually in terminal:</p>
                                    <pre style="background:#1e293b; color:#e2e8f0; padding:8px; border-radius:4px; font-size:12px; margin:8px 0 0;">fastboot flashing lock</pre>
                                    <p class="hint" data-i18n="repairs.bootloader.lock.followScreen">Follow the on-screen instructions on your device.</p>
                                </div>
                            `;
                            await saveRepairResult('bootloader_lock', 'failed', { reason: 'Fastboot not available' }, 'Bootloader lock failed – Fastboot missing');
                        } else {
                            resultDiv.innerHTML = resultBox(
                                'success', 'Bootloader locked', `Output: ${escapeHtml(output)}`,
                                'The device will likely reboot and wipe all data.'
                            );
                            await saveRepairResult('bootloader_lock', 'success', {}, 'Bootloader locked');
                        }
                    } catch (err) {
                        resultDiv.innerHTML = resultBox('error', 'Lock failed', escapeHtml(err.message), 'Ensure USB Debugging and OEM unlocking are enabled, and the device is in bootloader mode.');
                        await saveRepairResult('bootloader_lock', 'failed', { error: err.message }, 'Bootloader lock failed');
                    }
                });
            }
        );
    });

    document.getElementById('bootloaderCommandsBtn').addEventListener('click', function() {
        const resultDiv = document.getElementById('bootloaderResult');
        if (resultDiv.querySelector('.guide-close-btn')) {
            resultDiv.innerHTML = '';
            return;
        }
        const commands = `
# Reboot to bootloader (if ADB available)
adb reboot bootloader

# Check fastboot connection
fastboot devices

# Unlock bootloader (wipes data)
fastboot flashing unlock   # or fastboot oem unlock

# Lock bootloader (wipes data)
fastboot flashing lock     # or fastboot oem lock
        `;
        resultDiv.innerHTML = `
            <div class="rp-guide" style="background:#f0f4ff;">
                <button class="guide-close-btn close-x" title="Close guide">&times;</button>
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                    <span style="font-size:20px;">🔓</span>
                    <strong style="font-size:15px;" data-i18n="repairs.bootloader.commands.title">Bootloader Commands Guide</strong>
                </div>
                <p style="margin:4px 0 8px; color:#6B7280;" data-i18n="repairs.bootloader.commands.desc">Unlocking the bootloader will wipe all data and may void warranty. Ensure OEM unlocking is enabled in Developer Options.</p>
                <pre style="background:#1e293b; color:#e2e8f0; padding:12px; border-radius:6px; font-size:12px; overflow-x:auto; white-space:pre-wrap;">${commands}</pre>
                <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:8px;">
                    <button id="copyBootloaderCommands" class="btn-secondary rp-btn rp-btn-ghost" style="width:auto; padding:5px 16px; font-size:12px;" data-i18n="repairs.bootloader.commands.copy">📋 Copy Commands</button>
                </div>
                <div style="margin-top:8px; font-size:12px; color:#6B7280;">
                    <a href="https://developer.android.com/studio/command-line/adb" target="_blank" data-i18n="repairs.bootloader.commands.docs">Official ADB/Fastboot documentation</a>
                </div>
            </div>
        `;
        resultDiv.querySelector('.guide-close-btn').addEventListener('click', function() {
            resultDiv.innerHTML = '';
        });
        document.getElementById('copyBootloaderCommands')?.addEventListener('click', function() {
            navigator.clipboard.writeText(commands).then(() => {
                this.textContent = '✅ Copied!';
                setTimeout(() => { this.textContent = '📋 Copy Commands'; }, 2000);
            });
        });
        if (typeof applyLanguage === 'function') {
            const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
            applyLanguage(window._activeLang || savedLang);
        }
    });

    document.getElementById('bloatwareModalBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Disable Bloatware', () => {
            showBloatwareModal();
        });
    });

    document.getElementById('bloatwareGuideBtn').addEventListener('click', function() {
        const resultDiv = document.getElementById('bloatwareResult');
        if (resultDiv.querySelector('.guide-close-btn')) {
            resultDiv.innerHTML = '';
            return;
        }
        resultDiv.innerHTML = `
            <div class="rp-guide">
                <button class="guide-close-btn close-x" title="Close guide">&times;</button>
                <strong class="head" data-i18n="repairs.bloatware.guide.title">📋 Disable Bloatware Guide (no ADB)</strong>
                <p style="margin:0 0 6px;" data-i18n="repairs.bloatware.guide.intro">To disable bloatware without ADB:</p>
                <ol style="margin-top:4px; padding-left:20px;">
                    <li data-i18n="repairs.bloatware.guide.step1">Go to  → Apps(or Apps & Notifications).</li>
                    <li data-i18n="repairs.bloatware.guide.step2">Select the app you want to disable.</li>
                    <li data-i18n="repairs.bloatware.guide.step3">Tap Disable (if available).</li>
                    <li data-i18n="repairs.bloatware.guide.step4">If "Disable" is greyed out, tap Force Stop and then try again.</li>
                    <li data-i18n="repairs.bloatware.guide.step5">For system apps that cannot be disabled, you may need to use ADB or third‑party tools.</li>
                </ol>
                <hr>
                <p style="margin:0; font-size:12px; color:#6B7280;" data-i18n="repairs.bloatware.guide.note">💡 <strong>Note:</strong> Some apps may not be disabled without ADB. The ADB method above is more flexible.</p>
            </div>
        `;
        resultDiv.querySelector('.guide-close-btn').addEventListener('click', function() {
            resultDiv.innerHTML = '';
        });
        if (typeof applyLanguage === 'function') {
            const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
            applyLanguage(window._activeLang || savedLang);
        }
    });

    document.getElementById('clearCacheBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Clear Cache', () => {
            clearCache();
        });
    });

    document.getElementById('cacheGuideBtn').addEventListener('click', function() {
        const resultDiv = document.getElementById('cacheResult');
        if (resultDiv.querySelector('.guide-close-btn')) {
            resultDiv.innerHTML = '';
            return;
        }
        resultDiv.innerHTML = `
            <div class="rp-guide">
                <button class="guide-close-btn close-x" title="Close guide">&times;</button>
                <strong class="head" data-i18n="repairs.cache.guide.title">📋 Clear Cache Guide (no ADB)</strong>
                <p style="margin:0 0 6px;" data-i18n="repairs.cache.guide.intro">To clear cache without ADB:</p>
                <ol style="margin-top:4px; padding-left:20px;">
                    <li data-i18n="repairs.cache.guide.step1">Go to <strong>Settings → Storage</strong>.</li>
                    <li data-i18n="repairs.cache.guide.step2">Tap <strong>Cache data</strong> (or "Clear cache").</li>
                    <li data-i18n="repairs.cache.guide.step3">Alternatively, go to <strong>Settings → Apps</strong>, select each app, and tap <strong>Clear cache</strong>.</li>
                    <li data-i18n="repairs.cache.guide.step4">For a deeper clean, boot into Recovery Mode and select <strong>Wipe cache partition</strong>.</li>
                </ol>
                <hr>
                <p style="margin:0; font-size:12px; color:#6B7280;" data-i18n="repairs.cache.guide.note">💡 <strong>Note:</strong> The ADB method above can clear cache for all apps at once.</p>
            </div>
        `;
        resultDiv.querySelector('.guide-close-btn').addEventListener('click', function() {
            resultDiv.innerHTML = '';
        });
        if (typeof applyLanguage === 'function') {
            const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
            applyLanguage(window._activeLang || savedLang);
        }
    });

    document.getElementById('rebootRecoveryBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Reboot to Recovery', () => {
            rebootToRecovery();
        });
    });

    document.getElementById('rebootDownloadBtn').addEventListener('click', function() {
        if (!currentDeviceId) {
            alert('Please connect a device first.');
            return;
        }
        showLegalDisclaimer('Reboot to Download', () => {
            rebootToDownload();
        });
    });

    document.getElementById('rebootGuideBtn').addEventListener('click', function() {
        const resultDiv = document.getElementById('rebootResult');
        if (resultDiv.querySelector('.guide-close-btn')) {
            resultDiv.innerHTML = '';
            return;
        }
        const recoveryCombos = {
            'Samsung':'Volume Up + Power',
            'Google':'Volume Down + Power (then select Recovery)',
            'OnePlus':'Volume Down + Power',
            'Xiaomi':'Volume Up + Power',
            'Huawei':'Volume Up + Power',
            'LG':'Volume Down + Power (release and press again)',
            'Motorola':'Volume Down + Power (then select Recovery)',
            'generic':'Volume Up + Power (or Volume Down + Power)'
        };
        let brand = detectedBrand ? detectedBrand.charAt(0).toUpperCase() + detectedBrand.slice(1) : 'Unknown';
        let combo = recoveryCombos[brand] || recoveryCombos.generic;

        resultDiv.innerHTML = `
            <div class="rp-guide">
                <button class="guide-close-btn close-x" title="Close guide">&times;</button>
                <strong class="head" data-i18n="repairs.reboot.guide.title">📋 Reboot Guide (no ADB)</strong>
                <p style="margin:0 0 6px;" data-i18n="repairs.reboot.guide.intro">To enter <strong>Recovery Mode</strong> or <strong>Download Mode</strong> without ADB:</p>
                <ul style="margin-top:4px; padding-left:20px;">
                    <li data-i18n="repairs.reboot.guide.step1"><strong>Power off</strong> the device.</li>
                    <li data-i18n="repairs.reboot.guide.step2">Press and hold <strong>${combo}</strong> simultaneously.</li>
                    <li data-i18n="repairs.reboot.guide.step3">For Recovery, release when the logo appears and use volume keys to navigate.</li>
                    <li data-i18n="repairs.reboot.guide.step4">For Download (Samsung), press Volume Up when prompted.</li>
                    <li data-i18n="repairs.reboot.guide.step5">If the combo doesn't work, search online for your specific model.</li>
                </ul>
                <hr>
                <p style="margin:0; font-size:12px; color:#6B7280;" data-i18n="repairs.reboot.guide.detected">💡 <strong>Detected brand:</strong> ${brand} &nbsp;|&nbsp; Recommended combo: ${combo}</p>
            </div>
        `;
        resultDiv.querySelector('.guide-close-btn').addEventListener('click', function() {
            resultDiv.innerHTML = '';
        });
        if (typeof applyLanguage === 'function') {
            const savedLang = (JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en"}')).language || 'en';
            applyLanguage(window._activeLang || savedLang);
        }
    });
}

// ---- Expose to window ----
window.renderRepairs = renderRepairs;