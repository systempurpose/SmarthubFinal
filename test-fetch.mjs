// test-fetch.mjs
import * as cheerio from 'cheerio';
import ghostfetch from 'ghostfetch';

const response = await ghostfetch('https://eu.community.samsung.com/...');
const html = await response.text();
async function fetchAndSummarizePage(url, maxChars = 3000) {
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0',
            }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const $ = cheerio.load(html);
        // Remove script, style, nav, footer, ads, comments
        $('script, style, nav, footer, header, .ad, .ads, .sidebar, .related, .comments, .social-share').remove();
        let text = $('body').text();
        text = text.replace(/\s+/g, ' ').trim();
        if (text.length > maxChars) text = text.slice(0, maxChars) + '…';
        return text;
    } catch (err) {
        console.error('Fetch error:', err.message);
        return null;
    }
}

// ---- Test with a real URL ----
const testUrl = 'https://eu.community.samsung.com/t5/other-galaxy-s-series/s21-battery-draining-very-quickly/td-p/9387186';

console.log('🔍 Fetching and summarizing:', testUrl);
console.log('⏳ This may take a few seconds...\n');

const content = await fetchAndSummarizePage(testUrl);

if (content) {
    console.log('📄 Extracted content (first 600 chars):');
    console.log('─'.repeat(60));
    console.log(content.slice(0, 600) + '...');
    console.log('─'.repeat(60));
    console.log(`\n✅ Total length: ${content.length} characters.`);
} else {
    console.log('❌ Failed to fetch the page.');
}

// ---- Optional: Test with a different site ----
// Uncomment to test with a simpler site that's less likely to block
/*
const altUrl = 'https://en.wikipedia.org/wiki/Samsung_Galaxy_S21';
console.log('\n🔍 Testing with Wikipedia (should always work):', altUrl);
const altContent = await fetchAndSummarizePage(altUrl);
if (altContent) {
    console.log('✅ Wikipedia fetched successfully. Length:', altContent.length);
} else {
    console.log('❌ Wikipedia fetch failed.');
}
*/