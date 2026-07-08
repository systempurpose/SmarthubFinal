// ==================== SETTINGS I18N ====================
const I18N = {
    en: {
        settingsTitle: '⚙️ Settings',
        settingsSubtitle: 'Customize SmartHub to your preferences.',
        languageLabel: '🌐 Language',
        languageHint: 'UI language (translations are work in progress).',
        themeLabel: '🎨 Theme Color',
        themeHint: 'Choose a primary color for buttons and highlights.',
        adbLabel: '📂 ADB Path (optional)',
        adbHint: 'Leave empty to use ADB from system PATH.',
        refreshLabel: '⏱️ Auto‑Refresh (seconds)',
        refreshHint: 'Interval for automatic device info updates.',
        saveBtn: '💾 Save Settings',
        resetBtn: '↩️ Reset to Defaults',
        savedMsg: '✅ Settings saved successfully!',
        resetMsg: '✅ Settings reset to defaults.'
    },
    es: {
        settingsTitle: '⚙️ Configuración',
        settingsSubtitle: 'Personaliza SmartHub según tus preferencias.',
        languageLabel: '🌐 Idioma',
        languageHint: 'Idioma de la interfaz (traducciones en progreso).',
        themeLabel: '🎨 Color del Tema',
        themeHint: 'Elige un color principal para botones y resaltados.',
        adbLabel: '📂 Ruta de ADB (opcional)',
        adbHint: 'Déjalo vacío para usar ADB del PATH del sistema.',
        refreshLabel: '⏱️ Actualización Automática (segundos)',
        refreshHint: 'Intervalo para actualizar la información del dispositivo.',
        saveBtn: '💾 Guardar Configuración',
        resetBtn: '↩️ Restablecer Valores',
        savedMsg: '✅ ¡Configuración guardada con éxito!',
        resetMsg: '✅ Configuración restablecida.'
    },
    fr: {
        settingsTitle: '⚙️ Paramètres',
        settingsSubtitle: 'Personnalisez SmartHub selon vos préférences.',
        languageLabel: '🌐 Langue',
        languageHint: "Langue de l'interface (traductions en cours).",
        themeLabel: '🎨 Couleur du Thème',
        themeHint: 'Choisissez une couleur principale pour les boutons.',
        adbLabel: '📂 Chemin ADB (optionnel)',
        adbHint: "Laissez vide pour utiliser l'ADB du PATH système.",
        refreshLabel: '⏱️ Actualisation Auto (secondes)',
        refreshHint: "Intervalle de mise à jour des infos de l'appareil.",
        saveBtn: '💾 Enregistrer',
        resetBtn: '↩️ Réinitialiser',
        savedMsg: '✅ Paramètres enregistrés avec succès !',
        resetMsg: '✅ Paramètres réinitialisés.'
    },
    de: {
        settingsTitle: '⚙️ Einstellungen',
        settingsSubtitle: 'Passe SmartHub an deine Vorlieben an.',
        languageLabel: '🌐 Sprache',
        languageHint: 'UI-Sprache (Übersetzungen in Arbeit).',
        themeLabel: '🎨 Themenfarbe',
        themeHint: 'Wähle eine Hauptfarbe für Buttons und Akzente.',
        adbLabel: '📂 ADB-Pfad (optional)',
        adbHint: 'Leer lassen, um ADB aus dem System-PATH zu nutzen.',
        refreshLabel: '⏱️ Auto-Aktualisierung (Sekunden)',
        refreshHint: 'Intervall für automatische Geräteinfo-Updates.',
        saveBtn: '💾 Speichern',
        resetBtn: '↩️ Zurücksetzen',
        savedMsg: '✅ Einstellungen erfolgreich gespeichert!',
        resetMsg: '✅ Einstellungen zurückgesetzt.'
    },
    zh: {
        settingsTitle: '⚙️ 设置',
        settingsSubtitle: '根据您的喜好自定义 SmartHub。',
        languageLabel: '🌐 语言',
        languageHint: '界面语言（翻译正在进行中）。',
        themeLabel: '🎨 主题颜色',
        themeHint: '为按钮和高亮选择主色调。',
        adbLabel: '📂 ADB 路径（可选）',
        adbHint: '留空则使用系统 PATH 中的 ADB。',
        refreshLabel: '⏱️ 自动刷新（秒）',
        refreshHint: '自动更新设备信息的间隔。',
        saveBtn: '💾 保存设置',
        resetBtn: '↩️ 恢复默认',
        savedMsg: '✅ 设置已成功保存！',
        resetMsg: '✅ 设置已恢复默认。'
    },
    fil: {
        settingsTitle: '⚙️ Mga Setting',
        settingsSubtitle: 'I-customize ang SmartHub ayon sa gusto mo.',
        languageLabel: '🌐 Wika',
        languageHint: 'Wika ng UI (patuloy pang isinasalin).',
        themeLabel: '🎨 Kulay ng Tema',
        themeHint: 'Pumili ng pangunahing kulay para sa mga button at highlight.',
        adbLabel: '📂 ADB Path (opsyonal)',
        adbHint: 'Iwanang blangko para gamitin ang ADB mula sa system PATH.',
        refreshLabel: '⏱️ Auto‑Refresh (segundo)',
        refreshHint: 'Agwat ng oras para sa awtomatikong pag-update ng device info.',
        saveBtn: '💾 I-save ang mga Setting',
        resetBtn: '↩️ Ibalik sa Default',
        savedMsg: '✅ Matagumpay na na-save ang mga setting!',
        resetMsg: '✅ Naibalik sa default ang mga setting.'
    }
};

// ---- Translation helper ----
function t(key, lang) {
    lang = lang || window._activeLang || 'en';
    return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
}

// ---- SCOPE LANGUAGE CHANGES TO #pageContent ONLY ----
function applyLanguage(lang) {
    window._activeLang = lang;
    document.documentElement.lang = lang;

    const container = document.getElementById('pageContent');
    if (!container) return;

    container.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key, lang);
    });
    container.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.setAttribute('placeholder', t(key, lang));
    });
}

// ---- Debounce helper (prevents flicker on fast input) ----
function debounce(fn, delay = 300) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ---- Render Settings Page ----
function renderSettings() {
    const container = document.getElementById('pageContent');

    const settings = JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en","themeColor":"#0d6efd","adbPath":"","autoRefresh":3}');
    const lang = settings.language || 'en';

    const languageOptions = [
        { code: 'en', label: 'English' },
        { code: 'es', label: 'Español' },
        { code: 'fr', label: 'Français' },
        { code: 'de', label: 'Deutsch' },
        { code: 'zh', label: '中文' },
        { code: 'fil', label: 'Filipino' },
    ];

    const themeColors = [
        '#0d6efd', // blue
        '#6f42c1', // purple
        '#dc3545', // red
        '#28a745', // green
        '#fd7e14', // orange
        '#20c997', // teal
        '#e83e8c', // pink
        '#6610f2', // indigo
    ];

    const currentLangLabel = (languageOptions.find(o => o.code === lang) || languageOptions[0]).label;

    const html = `
        <div style="margin-bottom:24px;">
            <h1 data-i18n="settingsTitle" style="margin-bottom:6px; font-size:24px; font-weight:700; color:#1f2937;">${t('settingsTitle', lang)}</h1>
            <p data-i18n="settingsSubtitle" style="color:#6b7280; font-size:14px; margin:0;">${t('settingsSubtitle', lang)}</p>
        </div>

        <div class="card" style="padding:24px;">

            <!-- Language (custom dropdown — no native <select> popup, avoids
                 the Electron/Chromium invisible-overlay freeze bug entirely) -->
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

            <!-- ADB Path -->
            <div style="margin-bottom:24px;">
                <label data-i18n="adbLabel" style="font-weight:600; font-size:15px; display:block; margin-bottom:6px;">${t('adbLabel', lang)}</label>
                <input id="settingsAdbPath" type="text" value="${settings.adbPath || ''}" placeholder="e.g. C:\\adb\\adb.exe" style="padding:8px 12px; border-radius:8px; border:1px solid #e5e7eb; width:100%; max-width:400px; font-size:14px;">
                <p data-i18n="adbHint" style="font-size:12px; color:#9ca3af; margin-top:4px;">${t('adbHint', lang)}</p>
            </div>

            <!-- Auto‑refresh interval -->
            <div style="margin-bottom:24px;">
                <label data-i18n="refreshLabel" style="font-weight:600; font-size:15px; display:block; margin-bottom:6px;">${t('refreshLabel', lang)}</label>
                <input id="settingsAutoRefresh" type="number" value="${settings.autoRefresh || 3}" min="1" max="30" style="padding:8px 12px; border-radius:8px; border:1px solid #e5e7eb; width:100%; max-width:120px; font-size:14px;">
                <p data-i18n="refreshHint" style="font-size:12px; color:#9ca3af; margin-top:4px;">${t('refreshHint', lang)}</p>
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

    // ---- DEBOUNCED color picker (fixes freeze) ----
    let lastColor = settings.themeColor;
    document.getElementById('customThemeColor').addEventListener('input', debounce(function() {
        const color = this.value;
        if (color === lastColor) return;
        lastColor = color;
        document.querySelectorAll('.theme-color-btn').forEach(b => b.style.borderColor = 'transparent');
        applyThemeColor(color);
    }, 200));

    // ---- Custom language dropdown (replaces native <select>) ----
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

    // Close dropdown when clicking anywhere outside it
    document.addEventListener('click', function outsideClickHandler(e) {
        if (!langBtn.contains(e.target) && !langList.contains(e.target)) {
            closeLangDropdown();
        }
    });

    // ---- Save ----
    document.getElementById('saveSettingsBtn').addEventListener('click', function() {
        const language = langBtn.dataset.value;
        const themeColor = document.getElementById('customThemeColor').value;
        const adbPath = document.getElementById('settingsAdbPath').value.trim();
        const autoRefresh = parseInt(document.getElementById('settingsAutoRefresh').value) || 3;

        const newSettings = { language, themeColor, adbPath, autoRefresh };
        localStorage.setItem('smartHubSettings', JSON.stringify(newSettings));
        applyThemeColor(themeColor);
        applyLanguage(language);

        const feedback = document.getElementById('settingsFeedback');
        feedback.innerHTML = `<span style="color:#16a34a;">${t('savedMsg', language)}</span>`;
        setTimeout(() => feedback.innerHTML = '', 3000);
    });

    // ---- Reset ----
    document.getElementById('resetSettingsBtn').addEventListener('click', function() {
        const defaults = { language: 'en', themeColor: '#0d6efd', adbPath: '', autoRefresh: 3 };
        localStorage.setItem('smartHubSettings', JSON.stringify(defaults));
        renderSettings();
        applyThemeColor(defaults.themeColor);
        applyLanguage(defaults.language);
        const feedback = document.getElementById('settingsFeedback');
        feedback.innerHTML = `<span style="color:#16a34a;">${t('resetMsg', defaults.language)}</span>`;
        setTimeout(() => feedback.innerHTML = '', 3000);
    });
}