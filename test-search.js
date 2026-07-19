// test-search.js
const dotenv = require('dotenv');
dotenv.config();

const { searchAndEnrich } = require('./src/aiIntelligence.js');

// ---- Mock data similar to what the AI route would send ----
const mockReports = {
    hardware: {
        results: {
            camera: { passed: false },
            speaker: { passed: true },
            microphone: { passed: false }
        },
        device_model: 'Galaxy S24'
    },
    connection: {
        results: {
            wifi: { passed: false },
            bluetooth: { passed: true }
        },
        device_model: 'Galaxy S24'
    },
    app: {
        suspiciousApps: [
            { packageName: 'com.suspicious.app', threatLevel: 'high' }
        ]
    },
    storage: {
        files: [
            { name: 'bigfile.mp4', bytes: 1024 * 1024 * 500 }
        ]
    }
};

const mockSelectedReports = ['hardware', 'connection', 'app', 'storage'];
const mockUserInput = 'Phone keeps restarting and camera doesn\'t work';

// ---- Run the search ----
async function runTest() {
    console.log('🔍 Testing searchAndEnrich with Google Custom Search + DuckDuckGo fallback...\n');
    console.log('📋 User input:', mockUserInput);
    console.log('📊 Selected reports:', mockSelectedReports.join(', '));
    console.log('----------------------------------------\n');

    try {
        const result = await searchAndEnrich(mockUserInput, mockSelectedReports, mockReports);

        console.log('✅ Search completed successfully!');
        console.log('🔎 Query used:', result.query);
        console.log(`📄 Found ${result.results.length} results:`);
        console.log('----------------------------------------');
        result.results.forEach((r, i) => {
            console.log(`${i+1}. ${r.title}`);
            console.log(`   ${r.snippet.substring(0, 100)}...`);
            console.log(`   Source: ${r.url}`);
            console.log('');
        });
        console.log('📝 Context preview:');
        console.log(result.context.substring(0, 300) + '...\n');
        console.log('✅ Test passed!');

        // Check if Google was used vs DuckDuckGo
        if (result.results.length > 0 && result.results[0].url && !result.results[0].url.startsWith('#')) {
            console.log('💡 Looks like Google Custom Search returned results.');
        } else {
            console.log('💡 Looks like DuckDuckGo fallback was used (or Google returned no results).');
        }

    } catch (err) {
        console.error('❌ Test failed:', err.message);
        console.error(err.stack);
    }
}

// ---- Optionally test with missing API keys to force fallback ----
async function testFallback() {
    // Temporarily disable Google by unsetting env vars
    console.log('\n🧪 Testing fallback (simulating missing Google keys)...\n');
    const originalApiKey = process.env.GOOGLE_CSE_API_KEY;
    const originalCx = process.env.GOOGLE_CSE_ENGINE_ID;
    delete process.env.GOOGLE_CSE_API_KEY;
    delete process.env.GOOGLE_CSE_ENGINE_ID;

    try {
        const result = await searchAndEnrich('battery drain quickly', ['hardware'], mockReports);
        if (result.results.length > 0) {
            console.log('✅ Fallback worked – DuckDuckGo returned results.');
        } else {
            console.log('⚠️ Fallback returned no results, but no error occurred.');
        }
    } catch (err) {
        console.error('❌ Fallback test failed:', err.message);
    } finally {
        // Restore keys
        if (originalApiKey) process.env.GOOGLE_CSE_API_KEY = originalApiKey;
        if (originalCx) process.env.GOOGLE_CSE_ENGINE_ID = originalCx;
    }
}

// ---- Run the tests ----
runTest().then(() => {
    // Optionally run fallback test
    // testFallback();
}).catch(err => console.error('Test failed:', err));