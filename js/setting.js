// js/setting.js – Settings page UI (only English and Filipino)

function renderSettings() {
    const container = document.getElementById('pageContent');

    const settings = JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en","themeColor":"#0d6efd"}');
    const lang = settings.language || 'en';

    // ---- Only English and Filipino ----
    const languageOptions = [
        { code: 'en', label: 'English' },
        { code: 'fil', label: 'Filipino' },
    ];

    const themeColors = [
        '#0d6efd', '#6f42c1', '#dc3545', '#28a745',
        '#fd7e14', '#20c997', '#e83e8c', '#6610f2'
    ];

    const currentLangLabel = (languageOptions.find(o => o.code === lang) || languageOptions[0]).label;

    const html = `
        <div style="margin-bottom:24px;">
            <h1 data-i18n="settingsTitle" style="margin-bottom:6px; font-size:24px; font-weight:700; color:#1f2937;">${t('settingsTitle', lang)}</h1>
            <p data-i18n="settingsSubtitle" style="color:#6b7280; font-size:14px; margin:0;">${t('settingsSubtitle', lang)}</p>
        </div>

        <div class="card" style="padding:24px;">

            <!-- Language -->
            <div style="margin-bottom:24px;">
                <label data-i18n="languageLabel" style="font-weight:600; font-size:15px; display:block; margin-bottom:6px;">${t('languageLabel', lang)}</label>

                <div id="langDropdownWrap" style="position:relative; width:100%; max-width:280px;">
                    <button type="button" id="langDropdownBtn" data-value="${lang}" style="
                        width:100%; text-align:left; padding:8px 12px; border-radius:8px;
                        border:1px solid #e5e7eb; background:white; font-size:14px; cursor:pointer;
                        display:flex; justify-content:space-between; align-items:center;
                    ">
                        <span id="langDropdownLabel">${currentLangLabel}</span>
                        <span style="color:#9ca3af;">▾</span>
                    </button>

                    <div id="langDropdownList" style="
                        display:none; position:absolute; top:calc(100% + 4px); left:0; right:0;
                        background:white; border:1px solid #e5e7eb; border-radius:8px;
                        box-shadow:0 4px 12px rgba(0,0,0,0.08); z-index:50; max-height:220px; overflow-y:auto;
                    ">
                        ${languageOptions.map(opt => `
                            <div class="lang-option" data-value="${opt.code}" style="
                                padding:8px 12px; font-size:14px; cursor:pointer;
                                background:${opt.code === lang ? '#f3f4f6' : 'white'};
                            ">${opt.label}</div>
                        `).join('')}
                    </div>
                </div>

                <p data-i18n="languageHint" style="font-size:12px; color:#9ca3af; margin-top:4px;">${t('languageHint', lang)}</p>
            </div>

            <!-- Theme Color -->
            <div style="margin-bottom:24px;">
                <label data-i18n="themeLabel" style="font-weight:600; font-size:15px; display:block; margin-bottom:6px;">${t('themeLabel', lang)}</label>
                <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
                    ${themeColors.map(color => `
                        <button class="theme-color-btn" data-color="${color}" style="
                            width:36px; height:36px; border-radius:50%; border:3px solid ${settings.themeColor === color ? '#1f2937' : 'transparent'};
                            background:${color}; cursor:pointer; transition: transform 0.15s;
                        " onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'"></button>
                    `).join('')}
                    <input type="color" id="customThemeColor" value="${settings.themeColor}" style="width:40px; height:40px; border:none; padding:0; cursor:pointer; background:none;">
                </div>
                <p data-i18n="themeHint" style="font-size:12px; color:#9ca3af; margin-top:4px;">${t('themeHint', lang)}</p>
            </div>

            <!-- Reset to defaults -->
            <div style="border-top:1px solid #e5e7eb; padding-top:20px; display:flex; gap:12px; flex-wrap:wrap;">
                <button id="saveSettingsBtn" data-i18n="saveBtn" class="btn-primary" style="padding:10px 28px; font-size:14px; border-radius:10px; border:none; background:#0d6efd; color:white; cursor:pointer; font-weight:600;">${t('saveBtn', lang)}</button>
                <button id="resetSettingsBtn" data-i18n="resetBtn" class="btn-secondary" style="padding:10px 28px; font-size:14px; border-radius:10px; border:1px solid #e5e7eb; background:white; color:#374151; cursor:pointer;">${t('resetBtn', lang)}</button>
            </div>

            <!-- Feedback -->
            <div id="settingsFeedback" style="margin-top:16px; font-size:14px;"></div>
        </div>
    `;

    container.innerHTML = html;

    // ---- Apply saved theme + language ----
    applyThemeColor(settings.themeColor);
    applyLanguage(lang);

    // ---- Theme color presets ----
    document.querySelectorAll('.theme-color-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const color = this.dataset.color;
            document.querySelectorAll('.theme-color-btn').forEach(b => b.style.borderColor = 'transparent');
            this.style.borderColor = '#1f2937';
            document.getElementById('customThemeColor').value = color;
            applyThemeColor(color);
        });
    });

    // ---- DEBOUNCED color picker ----
    let lastColor = settings.themeColor;
    document.getElementById('customThemeColor').addEventListener('input', debounce(function() {
        const color = this.value;
        if (color === lastColor) return;
        lastColor = color;
        document.querySelectorAll('.theme-color-btn').forEach(b => b.style.borderColor = 'transparent');
        applyThemeColor(color);
    }, 200));

    // ---- Custom language dropdown ----
    const langBtn = document.getElementById('langDropdownBtn');
    const langList = document.getElementById('langDropdownList');
    const langLabel = document.getElementById('langDropdownLabel');

    function closeLangDropdown() {
        langList.style.display = 'none';
    }

    langBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        const isOpen = langList.style.display === 'block';
        langList.style.display = isOpen ? 'none' : 'block';
    });

    langList.querySelectorAll('.lang-option').forEach(opt => {
        opt.addEventListener('click', function(e) {
            e.stopPropagation();
            const value = this.dataset.value;

            langBtn.dataset.value = value;
            langLabel.textContent = this.textContent;

            langList.querySelectorAll('.lang-option').forEach(o => o.style.background = 'white');
            this.style.background = '#f3f4f6';

            closeLangDropdown();
            applyLanguage(value);
        });
    });

    document.addEventListener('click', function outsideClickHandler(e) {
        if (!langBtn.contains(e.target) && !langList.contains(e.target)) {
            closeLangDropdown();
        }
    });

    // ---- Save ----
    document.getElementById('saveSettingsBtn').addEventListener('click', function() {
        const language = langBtn.dataset.value;
        const themeColor = document.getElementById('customThemeColor').value;

        const newSettings = { language, themeColor };
        localStorage.setItem('smartHubSettings', JSON.stringify(newSettings));
        applyThemeColor(themeColor);
        applyLanguage(language);

        const feedback = document.getElementById('settingsFeedback');
        feedback.innerHTML = `<span style="color:#16a34a;">${t('savedMsg', language)}</span>`;
        setTimeout(() => feedback.innerHTML = '', 3000);
    });

    // ---- Reset ----
    document.getElementById('resetSettingsBtn').addEventListener('click', function() {
        const defaults = { language: 'en', themeColor: '#0d6efd' };
        localStorage.setItem('smartHubSettings', JSON.stringify(defaults));
        renderSettings();
        applyThemeColor(defaults.themeColor);
        applyLanguage(defaults.language);
        const feedback = document.getElementById('settingsFeedback');
        feedback.innerHTML = `<span style="color:#16a34a;">${t('resetMsg', defaults.language)}</span>`;
        setTimeout(() => feedback.innerHTML = '', 3000);
    });
}

// ---- Debounce helper (used by color picker) ----
function debounce(fn, delay = 300) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}