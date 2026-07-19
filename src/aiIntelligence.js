// src/aiIntelligence.js
const axios = require('axios');
const cheerio = require('cheerio');
const { summarizeText } = require('./ai-service');

const MAX_RESULTS = 5;
const MAX_SNIPPET_LEN = 220;
const MAX_QUERY_LEN = 150;

// ---- Playwright + Stealth (for bypassing Cloudflare) ----
let playwrightLoaded = false;
let chromium, StealthPlugin;

try {
    chromium = require('playwright-extra').chromium;
    StealthPlugin = require('puppeteer-extra-plugin-stealth');
    chromium.use(StealthPlugin());
    playwrightLoaded = true;
    console.log('[AI Intelligence] Playwright+Stealth loaded successfully.');
} catch (err) {
    console.warn('[AI Intelligence] Playwright-extra not available; falling back to fetch.', err.message);
}

// ---- Helper: truncate at word ----
function truncateAtWord(str, maxLen) {
    if (!str || str.length <= maxLen) return str || '';
    const cut = str.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

// ---- Helper: extract real URL from DuckDuckGo redirect ----
function extractActualUrl(duckUrl) {
    if (!duckUrl || typeof duckUrl !== 'string') return duckUrl;
    if (duckUrl.startsWith('//')) duckUrl = 'https:' + duckUrl;
    if (!duckUrl.startsWith('https://duckduckgo.com/l/')) return duckUrl;
    try {
        const urlObj = new URL(duckUrl);
        let u3 = urlObj.searchParams.get('u3');
        if (u3) {
            let decoded = decodeURIComponent(u3);
            if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
                return decoded;
            }
            const urlMatch = decoded.match(/https?:\/\/[^\s&]+/);
            if (urlMatch) return urlMatch[0];
        }
        const uddg = urlObj.searchParams.get('uddg');
        if (uddg) {
            const decoded = decodeURIComponent(uddg);
            const u3Match = decoded.match(/[?&]u3=([^&]+)/);
            if (u3Match) {
                const nested = decodeURIComponent(u3Match[1]);
                if (nested.startsWith('http://') || nested.startsWith('https://')) {
                    return nested;
                }
            }
            const anyUrl = decoded.match(/https?:\/\/[^\s&]+/);
            if (anyUrl) return anyUrl[0];
        }
        return duckUrl;
    } catch {
        return duckUrl;
    }
}

// ---- Fetch full page content using Playwright (bypasses Cloudflare) ----
async function fetchPageContent(url) {
    // If Playwright is not available, fallback to simple fetch
    if (!playwrightLoaded) {
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                }
            });
            if (!res.ok) return null;
            const html = await res.text();
            const $ = cheerio.load(html);
            $('script, style, nav, footer, header, .ad, .ads, .sidebar, .related, .comments, .social-share').remove();
            let text = $('body').text();
            return text.replace(/\s+/g, ' ').trim();
        } catch (err) {
            console.warn(`[Fetch] Fallback fetch failed for ${url}:`, err.message);
            return null;
        }
    }

    let browser;
    try {
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        // Wait for content to render
        await page.waitForTimeout(2000);
        const html = await page.content();
        await browser.close();

        const $ = cheerio.load(html);
        $('script, style, nav, footer, header, .ad, .ads, .sidebar, .related, .comments, .social-share').remove();
        let text = $('body').text();
        return text.replace(/\s+/g, ' ').trim();
    } catch (err) {
        if (browser) await browser.close().catch(() => {});
        console.warn(`[Fetch] Failed to fetch ${url}:`, err.message);
        return null;
    }
}

// ---- DuckDuckGo Organic Search (scraping) ----
async function searchDuckDuckGo(query) {
    try {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (!res.ok) return [];
        const html = await res.text();
        const $ = cheerio.load(html);
        const results = [];

        $('.result').each((i, el) => {
            const title = $(el).find('.result__a').text().trim();
            let snippet = $(el).find('.result__snippet').text().trim();
            let link = $(el).find('.result__a').attr('href');
            if (link) link = extractActualUrl(link);
            // Skip ads/sponsored
            if (link && (link.includes('ebay') || link.includes('amazon') || link.includes('bing.com/aclick'))) return;
            if (title && link && title.length > 5 && link !== '#') {
                results.push({
                    title: truncateAtWord(title, 60),
                    snippet: truncateAtWord(snippet || title, MAX_SNIPPET_LEN),
                    url: link
                });
            }
        });

        // If no results, retry with Googlebot UA
        if (results.length === 0) {
            const fallbackRes = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }
            });
            if (fallbackRes.ok) {
                const fallbackHtml = await fallbackRes.text();
                const $2 = cheerio.load(fallbackHtml);
                $2('.result').each((i, el) => {
                    const title = $2(el).find('.result__a').text().trim();
                    let snippet = $2(el).find('.result__snippet').text().trim();
                    let link = $2(el).find('.result__a').attr('href');
                    if (link) link = extractActualUrl(link);
                    if (link && (link.includes('ebay') || link.includes('amazon') || link.includes('bing.com/aclick'))) return;
                    if (title && link && title.length > 5 && link !== '#') {
                        results.push({
                            title: truncateAtWord(title, 60),
                            snippet: truncateAtWord(snippet || title, MAX_SNIPPET_LEN),
                            url: link
                        });
                    }
                });
            }
        }

        return results.slice(0, MAX_RESULTS);
    } catch (err) {
        console.warn('[Search] DuckDuckGo scraping failed:', err.message);
        return await searchDuckDuckGoAPI(query);
    }
}

// ---- Fallback: DuckDuckGo API ----
async function searchDuckDuckGoAPI(query) {
    try {
        const response = await axios.get('https://api.duckduckgo.com/', {
            params: { q: query, format: 'json', no_html: 1, skip_disambig: 1, t: 'SmartHub' },
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
        const seen = new Set();
        const unique = [];
        for (const r of results) {
            const key = r.url !== '#' ? r.url : r.snippet;
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push(r);
        }
        return unique.slice(0, MAX_RESULTS);
    } catch (err) {
        console.warn('[Search] DuckDuckGo API failed:', err.message);
        return [];
    }
}

// ---- Category priority ----
const CATEGORY_PRIORITY = ['hardware', 'connection', 'advanced', 'app', 'storage'];

// ---- Extract keywords from a report ----
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

// ---- Build search query ----
function buildSearchQuery(userInput, selectedReports, reports) {
    const keywords = [];
    if (userInput && userInput.trim()) keywords.push(userInput.trim());

    const byCategory = {};
    for (const id of selectedReports) {
        const phrase = extractKeywordsForReport(id, reports[id]);
        if (phrase) byCategory[id] = phrase;
    }
    for (const category of CATEGORY_PRIORITY) {
        if (byCategory[category]) keywords.push(byCategory[category]);
    }
    for (const id of Object.keys(byCategory)) {
        if (!CATEGORY_PRIORITY.includes(id)) keywords.push(byCategory[id]);
    }

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

// ---- Search for issues ----
async function searchForIssues(query, fallbackQuery) {
    if (!query || query.trim().length < 3) return [];
    let results = await searchDuckDuckGo(query);
    if (results && results.length) return results.slice(0, MAX_RESULTS);
    if (fallbackQuery && fallbackQuery !== query) {
        results = await searchDuckDuckGo(fallbackQuery);
        if (results && results.length) return results.slice(0, MAX_RESULTS);
    }
    return [];
}

// ---- Main searchAndEnrich with page summarization ----
async function searchAndEnrich(userInput, selectedReports, reports, options = {}) {
    const {
        summarizePages = true,
        provider = 'groq',
        maxSummaries = 2,
        maxPageChars = 8000
    } = options;

    const { query, fallbackQuery } = buildSearchQuery(userInput, selectedReports, reports);
    const results = await searchForIssues(query, fallbackQuery);

    let context = 'Web search results for similar issues:\n';
    if (results.length) {
        for (let i = 0; i < results.length; i++) {
            const r = results[i];
            context += `${i+1}. ${r.title}\n   ${r.snippet}\n   Source: ${r.url}\n`;

            if (summarizePages && i < maxSummaries) {
                const pageContent = await fetchPageContent(r.url);
                if (pageContent) {
                    // Truncate to avoid token limits
                    const truncated = pageContent.length > maxPageChars
                        ? pageContent.slice(0, maxPageChars)
                        : pageContent;
                    try {
                        const summary = await summarizeText(truncated, provider, null, 'en');
                        context += `   Page summary: ${summary}\n`;
                    } catch (err) {
                        console.warn(`[Search] Summary failed for ${r.url}:`, err.message);
                        context += `   (Summary not available)\n`;
                    }
                } else {
                    context += `   (Could not fetch page content)\n`;
                }
            }
        }
    } else {
        context = 'No relevant web results found for the given symptoms.';
    }

    return { query, results, context };
}

module.exports = { searchAndEnrich };