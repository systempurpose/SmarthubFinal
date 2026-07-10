// src/aiIntelligence.js
const axios = require('axios');

const MAX_RESULTS = 5;
const MAX_SNIPPET_LEN = 220;
const MAX_QUERY_LEN = 150;

/**
 * Trim a string to maxLen without cutting a word in half.
 */
function truncateAtWord(str, maxLen) {
    if (!str || str.length <= maxLen) return str || '';
    const cut = str.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

/**
 * Run a single DuckDuckGo Instant Answer query and normalize the results.
 */
async function runQuery(query) {
    const response = await axios.get('https://api.duckduckgo.com/', {
        params: {
            q: query,
            format: 'json',
            no_html: 1,
            skip_disambig: 1,
            t: 'SmartHub'
        },
        timeout: 8000
    });

    const data = response.data;
    const results = [];

    if (data.AbstractText) {
        results.push({
            title: data.Heading || truncateAtWord(data.AbstractText, 60),
            snippet: data.AbstractText,
            url: data.AbstractURL || '#'
        });
    }

    if (Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics) {
            const texts = [];
            if (topic.Text) texts.push({ text: topic.Text, url: topic.FirstURL });
            if (Array.isArray(topic.Topics)) {
                for (const sub of topic.Topics) {
                    if (sub.Text) texts.push({ text: sub.Text, url: sub.FirstURL || topic.FirstURL });
                }
            }
            for (const { text, url } of texts) {
                if (!text || !url) continue;
                results.push({
                    title: truncateAtWord(text, 60),
                    snippet: text,
                    url
                });
            }
        }
    }

    return results;
}

/**
 * Search the web for issues matching the given query.
 * Uses DuckDuckGo Instant Answer API (free, no key).
 * Falls back to a broader query if the first attempt returns nothing,
 * so a single overly-specific query doesn't waste the whole search.
 * Returns an array of result objects: { title, snippet, url }.
 */
async function searchForIssues(query, fallbackQuery) {
    if (!query || query.trim().length < 3) {
        return [];
    }

    try {
        let raw = await runQuery(query);

        if (!raw.length && fallbackQuery && fallbackQuery !== query) {
            raw = await runQuery(fallbackQuery);
        }

        // Dedupe by URL, then trim snippets so context stays compact.
        const seen = new Set();
        const cleaned = [];
        for (const r of raw) {
            const key = r.url !== '#' ? r.url : r.snippet;
            if (seen.has(key)) continue;
            seen.add(key);
            cleaned.push({
                title: r.title,
                snippet: truncateAtWord(r.snippet, MAX_SNIPPET_LEN),
                url: r.url
            });
        }

        return cleaned.slice(0, MAX_RESULTS);
    } catch (err) {
        console.error('[AI Intelligence] Search failed:', err.message);
        return [];
    }
}

/**
 * Severity/priority order for issue categories — more actionable,
 * more urgent symptoms get surfaced first so the query stays focused
 * on what actually matters instead of an unordered word dump.
 */
const CATEGORY_PRIORITY = ['hardware', 'connection', 'advanced', 'app', 'storage'];

/**
 * Pull a short, human-readable keyword phrase out of one report's data.
 * Returns null if the report has nothing actionable.
 */
function extractKeywordsForReport(id, data) {
    if (!data) return null;

    if (id === 'hardware' && data.results) {
        const failed = Object.entries(data.results)
            .filter(([_, r]) => !r.passed)
            .map(([name]) => name);
        return failed.length ? `${failed.join(' ')} not working` : null;
    }

    if (id === 'connection' && data.results) {
        const failed = Object.entries(data.results)
            .filter(([_, r]) => !r.passed)
            .map(([name]) => name);
        return failed.length ? `${failed.join(' ')} connection issue` : null;
    }

    if (id === 'advanced' && data.software) {
        const failed = data.software.filter(r => !r.passed).map(r => r.name);
        return failed.length ? `software issues ${failed.join(' ')}` : null;
    }

    if (id === 'app' && data.suspiciousApps && data.suspiciousApps.length) {
        return 'suspicious apps detected';
    }

    if (id === 'storage' && data.files && data.files.length) {
        return 'large files taking storage';
    }

    return null;
}

/**
 * Build a search query from user input and scan summaries.
 * Uses only data passed in – no window/global references.
 *
 * Orders symptom keywords by severity (hardware/connection first) instead
 * of insertion order, and truncates on word boundaries so the query never
 * gets cut mid-word or padded with noise.
 */
function buildSearchQuery(userInput, selectedReports, reports) {
    const keywords = [];
    if (userInput && userInput.trim()) keywords.push(userInput.trim());

    // Collect keywords per category, then emit them in priority order
    // regardless of the order the reports were selected in.
    const byCategory = {};
    for (const id of selectedReports) {
        const phrase = extractKeywordsForReport(id, reports[id]);
        if (phrase) byCategory[id] = phrase;
    }
    for (const category of CATEGORY_PRIORITY) {
        if (byCategory[category]) keywords.push(byCategory[category]);
    }
    // Any category not in the known priority list still gets included, at the end.
    for (const id of Object.keys(byCategory)) {
        if (!CATEGORY_PRIORITY.includes(id)) keywords.push(byCategory[id]);
    }

    // Device model, if we can find one anywhere in the reports.
    let deviceModel = null;
    for (const id of selectedReports) {
        const data = reports[id];
        if (data && data.device_model) {
            deviceModel = data.device_model;
            break;
        }
    }
    keywords.push(deviceModel ? `Android ${deviceModel}` : 'Android phone');

    const uniqueWords = [...new Set(keywords.join(' ').split(' ').filter(Boolean))];
    const query = truncateAtWord(uniqueWords.join(' '), MAX_QUERY_LEN);

    // A broader fallback query (just the device + top symptom) in case the
    // fully detailed query is too specific to return any results.
    const topSymptom = CATEGORY_PRIORITY.map(c => byCategory[c]).find(Boolean);
    const fallbackQuery = [topSymptom, deviceModel ? `Android ${deviceModel}` : 'Android phone']
        .filter(Boolean)
        .join(' ')
        .trim();

    return {
        query: query || 'Android phone diagnostic',
        fallbackQuery: fallbackQuery || null
    };
}

/**
 * Main function: search for similar issues and return a context summary.
 * Formats results as plain text (no markdown bold) so the string is safe
 * to feed straight into further generation without stray "**" markers,
 * and keeps each entry short so the context doesn't waste tokens.
 */
async function searchAndEnrich(userInput, selectedReports, reports) {
    const { query, fallbackQuery } = buildSearchQuery(userInput, selectedReports, reports);
    const results = await searchForIssues(query, fallbackQuery);

    let context;
    if (results.length) {
        const lines = ['Web search results for similar issues:'];
        results.forEach((r, i) => {
            lines.push(`${i + 1}. ${r.title}`);
            lines.push(`   ${r.snippet}`);
            lines.push(`   Source: ${r.url}`);
        });
        context = lines.join('\n');
    } else {
        context = 'No relevant web results found for the given symptoms.';
    }

    return { query, results, context };
}

module.exports = { searchAndEnrich };