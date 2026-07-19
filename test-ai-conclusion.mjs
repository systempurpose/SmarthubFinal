// test-ai-conclusion.mjs

const mockReports = {
  hardware: {
    summary: "Hardware tests: camera passed, speaker passed, microphone failed, battery health 80%",
    results: {
      camera: { passed: true },
      speaker: { passed: true },
      microphone: { passed: false },
      battery: { passed: false, health: '80%' }
    },
    device_model: 'Samsung Galaxy S21'
  },
  app: {
    summary: "App scan: 2 suspicious apps found",
    suspiciousApps: [
      { packageName: 'com.suspicious1', threatLevel: 'high' },
      { packageName: 'com.suspicious2', threatLevel: 'medium' }
    ]
  },
  connection: {
    summary: "Connection tests: WiFi passed, Bluetooth failed",
    results: {
      wifi: { passed: true },
      bluetooth: { passed: false }
    }
  }
};

const payload = {
  selectedReports: ['hardware', 'app', 'connection'],
  userInput: 'Phone battery drains very fast and Bluetooth doesn\'t work',
  lang: 'en',
  provider: 'groq',
  model: 'openai/gpt-oss-120b',  // recommended replacement
  reports: mockReports
};


async function test() {
  console.log('🧪 Sending test request to /ai-adb-conclude...\n');

  const url = 'http://localhost:3333/ai-adb-conclude';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ Response received:');
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.log('\n💡 Make sure the backend server is running on http://localhost:3333');
    console.log('   Start it with: npx ts-node server.ts');
  }
}

test();