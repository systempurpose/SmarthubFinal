// js/localTranslator.mjs
//
// Free, dynamic EN <-> FIL translation using public translation APIs.
// No API key required. Falls back through multiple free providers.
// Fixes: guards against malformed/empty responses so a bad response from
// one provider can't throw and crash the whole render — it just falls
// through to the next provider (or returns the original text).

const LANG_MAP = { fil: 'tl', en: 'en' }; // MyMemory/Google use 'tl' for Filipino

// ---- Simple in-memory cache ----
const cache = new Map();

/**
 * Provider 1: MyMemory (free, no key required).
 * Limits: 100 req/day (anonymous) or 1000 req/day (with email) + character limits.
 */
async function translateWithMyMemory(text, sourceLang, targetLang) {
    const src = LANG_MAP[sourceLang] || sourceLang;
    const tgt = LANG_MAP[targetLang] || targetLang;
    // Optional: add &de=your-email@example.com to increase limits
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${src}|${tgt}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);

    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    if (!translated || typeof translated !== 'string') {
        throw new Error('MyMemory returned no translation');
    }
    return translated;
}

/**
 * Provider 2: Unofficial free Google Translate endpoint (fallback only).
 * Heavily rate-limited, may block IP temporarily.
 */
async function translateWithGoogleFree(text, sourceLang, targetLang) {
    const src = LANG_MAP[sourceLang] || sourceLang;
    const tgt = LANG_MAP[targetLang] || targetLang;
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${src}&tl=${tgt}&dt=t&q=${encodeURIComponent(text)}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Google free endpoint HTTP ${res.status}`);

    const data = await res.json();
    const chunks = Array.isArray(data) ? data[0] : null;
    if (!Array.isArray(chunks) || chunks.length === 0) {
        throw new Error('Google free endpoint returned no translation');
    }

    const translated = chunks
        .filter((chunk) => Array.isArray(chunk) && typeof chunk[0] === 'string')
        .map((chunk) => chunk[0])
        .join('');

    if (!translated) throw new Error('Google free endpoint returned no translation');
    return translated;
}

/**
 * Provider 3: LibreTranslate (free, no key required, more generous limits).
 * Public instance may have rate limits but is a good third fallback.
 */
async function translateWithLibreTranslate(text, sourceLang, targetLang) {
    const src = LANG_MAP[sourceLang] || sourceLang;
    const tgt = LANG_MAP[targetLang] || targetLang;
    const url = 'https://libretranslate.com/translate';

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            q: text,
            source: src,
            target: tgt,
            format: 'text'
        })
    });

    if (!response.ok) throw new Error(`LibreTranslate HTTP ${response.status}`);

    const data = await response.json();
    const translated = data?.translatedText;
    if (!translated || typeof translated !== 'string') {
        throw new Error('LibreTranslate returned no translation');
    }
    return translated;
}

/**
 * Translate a single string dynamically (works on arbitrary/AI-generated text).
 * @param {string} text - Text to translate.
 * @param {string} targetLang - 'fil' or 'en'.
 * @param {string} sourceLang - 'en' or 'fil'.
 * @returns {Promise<string>} Translated text, or original if all providers fail.
 */
export async function translateTextLocal(text, targetLang = 'fil', sourceLang = 'en') {
    if (!text || typeof text !== 'string') return text;
    if (targetLang === sourceLang) return text;

    const cacheKey = `${sourceLang}|${targetLang}|${text}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    // Order: MyMemory → Google free → LibreTranslate
    const providers = [
        translateWithMyMemory,
        translateWithGoogleFree,
        translateWithLibreTranslate
    ];

    for (const provider of providers) {
        try {
            const result = await provider(text, sourceLang, targetLang);
            if (result && typeof result === 'string' && result.trim().length > 0) {
                cache.set(cacheKey, result);
                return result;
            }
        } catch (err) {
            console.warn(`[LocalTranslator] ${provider.name} failed:`, err?.message || err);
        }
    }

    console.warn('[LocalTranslator] All translation providers failed, returning original text.');
    // Return original text as ultimate fallback
    cache.set(cacheKey, text); // cache the original so we don't keep trying
    return text;
}

/**
 * Translate a full conclusion object recursively.
 */
export async function translateConclusionLocal(conclusion, targetLang = 'fil', sourceLang = 'en') {
    if (!conclusion || typeof conclusion !== 'object') return conclusion;
    if (targetLang === sourceLang) return conclusion;

    const translated = { ...conclusion };
    const textFields = ['humanSummary', 'likelyCause', 'nextStep', 'details'];

    for (const field of textFields) {
        if (translated[field] && typeof translated[field] === 'string') {
            try {
                translated[field] = await translateTextLocal(translated[field], targetLang, sourceLang);
            } catch (err) {
                console.warn(`[LocalTranslator] Failed to translate field "${field}":`, err?.message || err);
                // Keep original value on failure — never leave the field undefined.
            }
        }
    }

    if (Array.isArray(translated.actions)) {
        translated.actions = await Promise.all(
            translated.actions.map(async (action) => {
                if (typeof action !== 'string') return action;
                try {
                    return await translateTextLocal(action, targetLang, sourceLang);
                } catch (err) {
                    console.warn('[LocalTranslator] Failed to translate action:', err?.message || err);
                    return action; // fall back to original on failure
                }
            })
        );
    }

    return translated;
}