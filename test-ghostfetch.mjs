// test-ghostfetch.mjs
import ghostfetch from 'ghostfetch';
import * as cheerio from 'cheerio';

async function fetchWithGhostfetch(url) {
    try {
        console.log(`🌐 Fetching: ${url}`);
        const response = await ghostfetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();

        const $ = cheerio.load(html);
        $('script, style, nav, footer, header, .ad, .ads, .sidebar, .related, .comments, .social-share').remove();
        let text = $('body').text();
        text = text.replace(/\s+/g, ' ').trim();

        return text;
    } catch (err) {
        console.error('❌ Error:', err.message);
        return null;
    }
}

// ---- Test ----
const testUrl = 'https://eu.community.samsung.com/t5/other-galaxy-s-series/s21-battery-draining-very-quickly/td-p/9387186';

console.log('🧪 Testing ghostfetch...\n');

const content = await fetchWithGhostfetch(testUrl);

if (content) {
    console.log(`\n✅ Success! Extracted ${content.length} characters.\n`);
    console.log('📄 First 600 characters:');
    console.log('─'.repeat(60));
    console.log(content.slice(0, 600) + '...');
    console.log('─'.repeat(60));
} else {
    console.log('❌ Failed to fetch the page.');
}