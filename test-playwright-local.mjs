// test-playwright-local.mjs
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';

async function fetchPageContent(url) {
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewportSize({ width: 1280, height: 720 });
        console.log(`🌐 Navigating to: ${url}`);

        // Use domcontentloaded – faster and doesn't wait for ads
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Wait a bit for the main content to render
        await page.waitForTimeout(2000);

        const html = await page.content();

        const $ = cheerio.load(html);
        $('script, style, nav, footer, header, .ad, .ads, .sidebar, .related, .comments, .social-share').remove();
        let text = $('body').text();
        text = text.replace(/\s+/g, ' ').trim();

        return text;
    } catch (err) {
        console.error('❌ Error:', err.message);
        return null;
    } finally {
        await browser.close();
    }
}

const testUrl = 'https://eu.community.samsung.com/t5/other-galaxy-s-series/s21-battery-draining-very-quickly/td-p/9387186';

console.log('🧪 Testing Playwright with local Chromium...\n');

const content = await fetchPageContent(testUrl);

if (content) {
    console.log(`\n✅ Success! Extracted ${content.length} characters.\n`);
    console.log('📄 First 600 characters:');
    console.log('─'.repeat(60));
    console.log(content.slice(0, 600) + '...');
    console.log('─'.repeat(60));
} else {
    console.log('❌ Failed to fetch the page.');
}