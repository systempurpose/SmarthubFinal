// js/i18n.js – Central i18n loader (English + Filipino only)
(function () {
    'use strict';

    const STORAGE_KEY = 'smarthub.ui.lang';

    // ---- Build DICT from loaded language files ----
    const DICT = {};

    function addLanguage(code, obj) {
        if (obj && typeof obj === 'object') {
            DICT[code] = obj;
            console.log('[i18n] Loaded language:', code);
        }
    }

    // Only load English and Filipino
    addLanguage('en', window.I18N_en);
    addLanguage('fil', window.I18N_fil);

    // Alias 'tl' to 'fil' for compatibility
    if (DICT.fil) {
        DICT.tl = DICT.fil;
    }

    // Fallback: if English is missing, define minimal (should never happen)
    if (!DICT.en) {
        console.warn('[i18n] English translations missing – using empty fallback.');
        DICT.en = {};
    }

    // ---- Translation helpers ----
    function getCurrentLang() {
        try {
            const v = String(localStorage.getItem(STORAGE_KEY) || '').trim().toLowerCase();
            if (v && DICT[v]) return v;
        } catch { /* ignore */ }
        return 'en';
    }

    function format(template, params) {
        let out = String(template || '');
        const p = params && typeof params === 'object' ? params : {};
        Object.keys(p).forEach((k) => {
            out = out.split('{' + k + '}').join(String(p[k]));
        });
        return out;
    }

    function t(key, params) {
        const lang = getCurrentLang();
        const fromLang = (DICT[lang] && DICT[lang][key]) || null;
        const fromEn = (DICT.en && DICT.en[key]) || null;
        return format(fromLang || fromEn || key, params);
    }

    function applyTranslations(root) {
    const lang = getCurrentLang();
    // ... existing code ...

    const scope = (root && (root instanceof Element || root instanceof Document))
        ? root
        : document.getElementById('pageContent') || document;

    // Existing: textContent translations
    scope.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (!key) return;
        try {
            el.textContent = t(key);
        } catch { /* ignore */ }
    });

    // NEW: innerHTML translations (preserves HTML tags)
    scope.querySelectorAll('[data-i18n-html]').forEach(el => {
        const key = el.getAttribute('data-i18n-html');
        if (!key) return;
        try {
            el.innerHTML = t(key);
        } catch { /* ignore */ }
    });

    // Existing: placeholders
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (!key) return;
        try {
            el.setAttribute('placeholder', t(key));
        } catch { /* ignore */ }
    });
}

    function setCurrentLang(lang, root) {
        const normalized = (lang === 'tl') ? 'fil' : lang;
        const v = (DICT[normalized]) ? normalized : 'en';

        try { localStorage.setItem(STORAGE_KEY, v); } catch { /* ignore */ }
        window._activeLang = v;

        if (root) {
            applyTranslations(root);
        } else {
            const pageContent = document.getElementById('pageContent');
            if (pageContent) applyTranslations(pageContent);
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) applyTranslations(sidebar);
            const header = document.querySelector('header.app-header');
            if (header) applyTranslations(header);
        }

        // Final fallback: apply to whole document
        applyTranslations(document);

        try {
            document.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: v } }));
        } catch { /* ignore */ }
    }

    function applyLanguage(lang) {
        setCurrentLang(lang);
    }

    // ---- Expose globally ----
    const SmartHubI18n = {
        t,
        getCurrentLang,
        setCurrentLang,
        applyTranslations,
        applyLanguage,
        storageKey: STORAGE_KEY,
        _dict: DICT,
    };

    window.SmartHubI18n = SmartHubI18n;
    window.t = t;
    window.applyLanguage = applyLanguage;
    window.getCurrentLang = getCurrentLang;

    console.log('[i18n] Initialized with languages:', Object.keys(DICT));
})();