// js/setting.js – Settings page UI (with Supabase sync + auto‑reload)

import { saveUserSettings, loadSettingsWithFallback } from './settings-sb.js';
import { getCurrentUserId } from './sb-utils.js';

async function renderSettings() {
    const container = document.getElementById('pageContent');
    const userId = getCurrentUserId();

    // Load settings – Supabase first (if logged in), then localStorage
    const settings = await loadSettingsWithFallback(userId);
    const lang = settings.language || 'en';

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
            <h1 data-i18n="settingsTitle" style="margin-bottom:6px; font-size:24px; font-weight:700; color:${settings.textColor};">${t('settingsTitle', lang)}</h1>
            <p data-i18n="settingsSubtitle" style="color:${settings.textColor}80; font-size:14px; margin:0;">${t('settingsSubtitle', lang)}</p>
        </div>

        <div class="card" style="padding:24px; background:${settings.cardColor}; color:${settings.textColor};">

            <!-- Language -->
            <div style="margin-bottom:24px;">
                <label data-i18n="languageLabel" style="font-weight:600; font-size:15px; display:block; margin-bottom:6px; color:${settings.textColor};">${t('languageLabel', lang)}</label>

                <div id="langDropdownWrap" style="position:relative; width:100%; max-width:280px;">
                    <button type="button" id="langDropdownBtn" data-value="${lang}" style="
                        width:100%; text-align:left; padding:8px 12px; border-radius:8px;
                        border:1px solid ${settings.textColor}30; background:${settings.cardColor}; 
                        color:${settings.textColor}; font-size:14px; cursor:pointer;
                        display:flex; justify-content:space-between; align-items:center;
                    ">
                        <span id="langDropdownLabel">${currentLangLabel}</span>
                        <span style="color:${settings.textColor}80;">▾</span>
                    </button>

                    <div id="langDropdownList" style="
                        display:none; position:absolute; top:calc(100% + 4px); left:0; right:0;
                        background:${settings.cardColor}; border:1px solid ${settings.textColor}30; 
                        border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.08); 
                        z-index:50; max-height:220px; overflow-y:auto;
                    ">
                        ${languageOptions.map(opt => `
                            <div class="lang-option" data-value="${opt.code}" style="
                                padding:8px 12px; font-size:14px; cursor:pointer;
                                background:${opt.code === lang ? '#f3f4f6' : settings.cardColor};
                                color:${settings.textColor};
                            ">${opt.label}</div>
                        `).join('')}
                    </div>
                </div>

                <p data-i18n="languageHint" style="font-size:12px; color:${settings.textColor}80; margin-top:4px;">${t('languageHint', lang)}</p>
            </div>

            <!-- 🎨 Accent Color (Primary) -->
            <div style="margin-bottom:24px;">
                <label data-i18n="themeLabel" style="font-weight:600; font-size:15px; display:block; margin-bottom:6px; color:${settings.textColor};">${t('themeLabel', lang)}</label>
                <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
                    ${themeColors.map(color => `
                        <button class="theme-color-btn" data-color="${color}" style="
                            width:36px; height:36px; border-radius:50%; border:3px solid ${settings.themeColor === color ? '#1f2937' : 'transparent'};
                            background:${color}; cursor:pointer; transition: transform 0.15s;
                        " onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'"></button>
                    `).join('')}
                    <input type="color" id="customThemeColor" value="${settings.themeColor}" style="width:40px; height:40px; border:none; padding:0; cursor:pointer; background:none;">
                </div>
                <p data-i18n="themeHint" style="font-size:12px; color:${settings.textColor}80; margin-top:4px;">${t('themeHint', lang)}</p>
            </div>

            <!-- Page Background -->
            <div style="margin-bottom:24px;">
                <label for="bgColorPicker" style="font-weight:600; font-size:15px; display:block; margin-bottom:6px; color:${settings.textColor};">Page Background</label>
                <input type="color" id="bgColorPicker" value="${settings.bgColor}" style="width:60px; height:40px; border:1px solid ${settings.textColor}30; border-radius:6px; padding:2px; cursor:pointer; background:${settings.cardColor};">
                <p style="font-size:12px; color:${settings.textColor}80; margin-top:4px;">Background color for the main app area.</p>
            </div>

            <!-- Card Background -->
            <div style="margin-bottom:24px;">
                <label for="cardColorPicker" style="font-weight:600; font-size:15px; display:block; margin-bottom:6px; color:${settings.textColor};">Card Background</label>
                <input type="color" id="cardColorPicker" value="${settings.cardColor}" style="width:60px; height:40px; border:1px solid ${settings.textColor}30; border-radius:6px; padding:2px; cursor:pointer; background:${settings.cardColor};">
                <p style="font-size:12px; color:${settings.textColor}80; margin-top:4px;">Background color for cards, panels, and widgets.</p>
            </div>

            <!-- Text Color -->
            <div style="margin-bottom:24px;">
                <label for="textColorPicker" style="font-weight:600; font-size:15px; display:block; margin-bottom:6px; color:${settings.textColor};">Text Color</label>
                <input type="color" id="textColorPicker" value="${settings.textColor}" style="width:60px; height:40px; border:1px solid ${settings.textColor}30; border-radius:6px; padding:2px; cursor:pointer; background:${settings.cardColor};">
                <p style="font-size:12px; color:${settings.textColor}80; margin-top:4px;">Default text color for the main content and sidebar.</p>
            </div>

            <!-- Actions -->
            <div style="border-top:1px solid ${settings.textColor}30; padding-top:20px; display:flex; gap:12px; flex-wrap:wrap;">
                <button id="saveSettingsBtn" data-i18n="saveBtn" class="btn-primary" style="padding:10px 28px; font-size:14px; border-radius:10px; border:none; background:${settings.themeColor}; color:#fff; cursor:pointer; font-weight:600;">${t('saveBtn', lang)}</button>
                <button id="resetSettingsBtn" data-i18n="resetBtn" class="btn-secondary" style="padding:10px 28px; font-size:14px; border-radius:10px; border:1px solid ${settings.textColor}30; background:${settings.cardColor}; color:${settings.textColor}; cursor:pointer;">${t('resetBtn', lang)}</button>
            </div>

            <!-- Feedback -->
            <div id="settingsFeedback" style="margin-top:16px; font-size:14px; color:${settings.textColor};"></div>
        </div>
    `;

    container.innerHTML = html;

    // ---- Apply saved theme ----
    applyTheme(settings);

    // ---- Theme color presets ----
    document.querySelectorAll('.theme-color-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const color = this.dataset.color;
            document.querySelectorAll('.theme-color-btn').forEach(b => b.style.borderColor = 'transparent');
            this.style.borderColor = '#1f2937';
            document.getElementById('customThemeColor').value = color;
            applyTheme({ ...settings, themeColor: color });
        });
    });

    // ---- Accent color picker ----
    let lastColor = settings.themeColor;
    document.getElementById('customThemeColor').addEventListener('input', debounce(function() {
        const color = this.value;
        if (color === lastColor) return;
        lastColor = color;
        document.querySelectorAll('.theme-color-btn').forEach(b => b.style.borderColor = 'transparent');
        applyTheme({ ...settings, themeColor: color });
    }, 200));

    // ---- Background color picker ----
    document.getElementById('bgColorPicker').addEventListener('input', function() {
        const bg = this.value;
        applyTheme({ ...settings, bgColor: bg });
        document.body.style.backgroundColor = bg;
        const mainContent = document.querySelector('.main-content');
        if (mainContent) mainContent.style.backgroundColor = bg;
    });

    // ---- Card background picker ----
    document.getElementById('cardColorPicker').addEventListener('input', function() {
        const cardBg = this.value;
        applyTheme({ ...settings, cardColor: cardBg });
        document.querySelectorAll('.card, .info-card, .status-card, .test-card, .action-card, .metric, .health-card').forEach(el => {
            if (!el.style.backgroundColor) {
                el.style.backgroundColor = cardBg;
            }
        });
    });

    // ---- Text color picker ----
    document.getElementById('textColorPicker').addEventListener('input', function() {
        const text = this.value;
        applyTheme({ ...settings, textColor: text });
        const card = document.querySelector('.card');
        if (card) card.style.color = text;
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.style.color = text;
    });

    // ---- Language dropdown ----
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
            langList.querySelectorAll('.lang-option').forEach(o => o.style.background = '');
            this.style.background = '#f3f4f6';
            closeLangDropdown();
            const newSettings = { ...settings, language: value };
            applyTheme(newSettings);
            applyLanguage(value);
        });
    });

    document.addEventListener('click', function outsideClickHandler(e) {
        if (!langBtn.contains(e.target) && !langList.contains(e.target)) {
            closeLangDropdown();
        }
    });

    // ---- SAVE – with auto‑reload and Supabase sync ----
    document.getElementById('saveSettingsBtn').addEventListener('click', async function() {
        const language = langBtn.dataset.value;
        const themeColor = document.getElementById('customThemeColor').value;
        const bgColor = document.getElementById('bgColorPicker').value;
        const cardColor = document.getElementById('cardColorPicker').value;
        const textColor = document.getElementById('textColorPicker').value;

        const newSettings = { language, themeColor, bgColor, cardColor, textColor };

        // Save to localStorage (always)
        localStorage.setItem('smartHubSettings', JSON.stringify(newSettings));
        applyTheme(newSettings);
        applyLanguage(language);

        // If user is logged in, sync to Supabase
        if (userId) {
            const saved = await saveUserSettings(userId, newSettings);
            if (saved) {
                console.log('Settings synced to Supabase');
            } else {
                console.warn('Failed to sync settings to Supabase – local saved.');
            }
        }

        const feedback = document.getElementById('settingsFeedback');
        feedback.innerHTML = `<span style="color:#16a34a;">${t('savedMsg', language)}</span>`;

        // Reload after a short delay to apply changes everywhere
        setTimeout(() => location.reload(), 400);
    });

    // ---- RESET – with auto‑reload and Supabase sync ----
    document.getElementById('resetSettingsBtn').addEventListener('click', async function() {
        const defaults = { language: 'en', themeColor: '#0d6efd', bgColor: '#ffffff', cardColor: '#ffffff', textColor: '#1f2937' };

        // Reset localStorage
        localStorage.setItem('smartHubSettings', JSON.stringify(defaults));
        applyTheme(defaults);
        applyLanguage(defaults.language);

        // If user is logged in, sync defaults to Supabase
        if (userId) {
            const saved = await saveUserSettings(userId, defaults);
            if (saved) {
                console.log('Settings reset and synced to Supabase');
            }
        }

        const feedback = document.getElementById('settingsFeedback');
        feedback.innerHTML = `<span style="color:#16a34a;">${t('resetMsg', defaults.language)}</span>`;

        // Reload after a short delay
        setTimeout(() => location.reload(), 400);
    });
}

// ---- Debounce helper ----
function debounce(fn, delay = 300) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ---- Expose globally ----
window.renderSettings = renderSettings;
window.debounce = debounce;