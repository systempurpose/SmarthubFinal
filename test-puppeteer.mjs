// test-puppeteer.mjs
import puppeteer from 'puppeteer-core';
import * as cheerio from 'cheerio';

// Find your Chrome executable path (common locations):
// Windows: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
// macOS: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
// Linux: "/usr/bin/google-chrome"

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'; // adjust for your system

const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();
await page.goto('https://eu.community.samsung.com/t5/other-galaxy-s-series/s21-battery-draining-very-quickly/td-p/9387186', {
    waitUntil: 'networkidle2',
    timeout: 30000
});
const html = await page.content();
await browser.close();

const $ = cheerio.load(html);
$('script, style, nav, footer, header, .ad, .ads, .sidebar, .related, .comments, .social-share').remove();
const text = $('body').text().replace(/\s+/g, ' ').trim();

console.log('✅ Extracted text length:', text.length);
console.log(text.slice(0, 500));