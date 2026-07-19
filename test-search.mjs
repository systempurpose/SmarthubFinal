// test-search.mjs
import { searchOnline, formatSearchContext } from './js/searchService.mjs';

async function runTest() {
    console.log('🔍 Testing searchService (DuckDuckGo, Reddit, iFixit, Wikipedia)...\n');

    const query = process.argv[2] || 'android battery drain fix';
    console.log(`📝 Query: "${query}"\n`);

    try {
        const results = await searchOnline(query, 6);

        if (results.length === 0) {
            console.log('❌ No results found. Check network or API limits.');
            return;
        }

        // Count by source
        const sourceCounts = {};
        results.forEach(r => {
            sourceCounts[r.source] = (sourceCounts[r.source] || 0) + 1;
        });

        console.log(`✅ Found ${results.length} results:\n`);
        console.log('📊 Breakdown by source:');
        for (const [source, count] of Object.entries(sourceCounts)) {
            console.log(`   ${source}: ${count}`);
        }
        console.log('');

        results.forEach((r, i) => {
            console.log(`${i+1}. [${r.source || 'Unknown'}] ${r.title}`);
            console.log(`   ${r.snippet}`);
            console.log(`   URL: ${r.url}`);
            console.log('');
        });

        const context = formatSearchContext(results, query);
        console.log('📄 Formatted Context for AI:\n');
        console.log(context);
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

runTest();