// test-translate.mjs
import { translateTextLocal } from './js/localTranslator.mjs';

async function runTest() {
    console.log('🧪 Testing localTranslator...\n');

    const testCases = [
        { text: 'Hello, how are you?', source: 'en', target: 'fil' },
        { text: 'The phone battery is draining too fast.', source: 'en', target: 'fil' },
        { text: 'Paano ko maaayos ang camera?', source: 'fil', target: 'en' },
    ];

    for (const { text, source, target } of testCases) {
        console.log(`📝 Original (${source}): ${text}`);
        try {
            const translated = await translateTextLocal(text, target, source);
            console.log(`✅ Translated (${target}): ${translated}\n`);
        } catch (err) {
            console.error(`❌ Error: ${err.message}\n`);
        }
    }
}

runTest().catch(console.error);