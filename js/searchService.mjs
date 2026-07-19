// js/searchService.mjs

// Detect environment
const isNode = typeof window === 'undefined';

// Helper to truncate text
function truncateText(text, maxLen = 60) {
    if (!text) return '';
    if (text.length <= maxLen) return text;
    const cut = text.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '…';
}

// ============================================================
// Helper: Extract real URL from DuckDuckGo redirect
// ============================================================
function extractActualUrl(duckUrl) {
    if (!duckUrl || typeof duckUrl !== 'string') return duckUrl;
    // Normalize protocol-relative URLs
    if (duckUrl.startsWith('//')) duckUrl = 'https:' + duckUrl;
    if (!duckUrl.startsWith('https://duckduckgo.com/l/')) return duckUrl;

    try {
        const urlObj = new URL(duckUrl);
        // 1. Try 'u3' parameter (most common)
        let u3 = urlObj.searchParams.get('u3');
        if (u3) {
            // u3 may be double-encoded or contain nested parameters
            let decoded = decodeURIComponent(u3);
            // Sometimes u3 is a full URL, sometimes it's a query string
            if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
                return decoded;
            }
            // If u3 is not a full URL, look for a URL inside it
            const urlMatch = decoded.match(/https?:\/\/[^\s&]+/);
            if (urlMatch) return urlMatch[0];
        }
        // 2. Try 'uddg' parameter (contains nested data)
        const uddg = urlObj.searchParams.get('uddg');
        if (uddg) {
            const decoded = decodeURIComponent(uddg);
            // uddg may contain 'u3=' inside
            const u3Match = decoded.match(/[?&]u3=([^&]+)/);
            if (u3Match) {
                const nested = decodeURIComponent(u3Match[1]);
                if (nested.startsWith('http://') || nested.startsWith('https://')) {
                    return nested;
                }
            }
            // Look for any HTTP URL in the decoded string
            const anyUrl = decoded.match(/https?:\/\/[^\s&]+/);
            if (anyUrl) return anyUrl[0];
        }
        // 3. Fallback: return the original (but cleaned)
        return duckUrl;
    } catch {
        return duckUrl;
    }
}

// ============================================================
// 1. DuckDuckGo Organic Search (Scraped HTML)
// ============================================================
export async function searchDuckDuckGo(query, limit = 5) {
    if (!isNode) {
        // Browser: use Instant Answer API
        try {
            const iaUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=SmartHub`;
            const iaRes = await fetch(iaUrl);
            if (!iaRes.ok) return [];
            const data = await iaRes.json();
            const results = [];
            if (data.AbstractText) {
                results.push({
                    title: data.Heading || truncateText(data.AbstractText, 60),
                    snippet: data.AbstractText,
                    url: data.AbstractURL || '#',
                    source: 'DuckDuckGo'
                });
            }
            if (Array.isArray(data.RelatedTopics)) {
                for (const topic of data.RelatedTopics) {
                    if (topic.Text && topic.FirstURL) {
                        results.push({
                            title: truncateText(topic.Text, 60),
                            snippet: topic.Text,
                            url: topic.FirstURL,
                            source: 'DuckDuckGo'
                        });
                    }
                    if (Array.isArray(topic.Topics)) {
                        for (const sub of topic.Topics) {
                            if (sub.Text && sub.FirstURL) {
                                results.push({
                                    title: truncateText(sub.Text, 60),
                                    snippet: sub.Text,
                                    url: sub.FirstURL,
                                    source: 'DuckDuckGo'
                                });
                            }
                        }
                    }
                }
            }
            const seen = new Set();
            const unique = results.filter(r => {
                const key = r.url !== '#' ? r.url : r.snippet;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            return unique.slice(0, limit);
        } catch (e) {
            console.warn('[DuckDuckGo API]', e.message);
            return [];
        }
    }

    // Node.js: scrape organic results
    try {
        const cheerio = await import('cheerio');
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
            if (link) {
                link = extractActualUrl(link);
            }
            // Skip ads/sponsored
            if (link && (link.includes('ebay') || link.includes('amazon') || link.includes('bing.com/aclick'))) return;
            if (title && link && title.length > 5 && link !== '#') {
                results.push({
                    title: truncateText(title, 60),
                    snippet: truncateText(snippet || title, 150),
                    url: link,
                    source: 'DuckDuckGo'
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
                            title: truncateText(title, 60),
                            snippet: truncateText(snippet || title, 150),
                            url: link,
                            source: 'DuckDuckGo'
                        });
                    }
                });
            }
        }

        return results.slice(0, limit);
    } catch (e) {
        console.warn('[DuckDuckGo] Scraping failed:', e.message);
        return [];
    }
}

// ============================================================
// 2. Wikipedia (Free, no key)
// ============================================================
export async function searchWikipedia(query, limit = 3) {
    try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        if (!data.query?.search) return [];
        return data.query.search.slice(0, limit).map(item => ({
            title: item.title,
            snippet: truncateText(item.snippet.replace(/<[^>]*>/g, ''), 150),
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
            source: 'Wikipedia'
        }));
    } catch (e) {
        console.warn('[Wikipedia]', e.message);
        return [];
    }
}

// ============================================================
// Main combined search
// ============================================================
export async function searchOnline(query, limit = 6) {
    const [ddg, wiki] = await Promise.all([
        searchDuckDuckGo(query, 3),
        searchWikipedia(query, 3)
    ]);
    const all = [...ddg, ...wiki];
    const seen = new Set();
    const unique = [];
    for (const r of all) {
        const key = r.url !== '#' ? r.url : r.title;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(r);
    }
    return unique.slice(0, limit);
}

// ============================================================
// Format results
// ============================================================
export function formatSearchContext(results, query) {
    if (!results || results.length === 0) {
        return 'No relevant web search results found.';
    }
    const lines = [`Web search results for: "${query}"`];
    lines.push('');
    results.forEach((r, i) => {
        lines.push(`${i + 1}. ${r.title} (${r.source})`);
        lines.push(`   ${r.snippet}`);
        if (r.url && r.url !== '#') {
            lines.push(`   Source: ${r.url}`);
        }
        lines.push('');
    });
    return lines.join('\n');
}