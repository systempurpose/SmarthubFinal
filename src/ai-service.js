// src/ai-service.js
const axios = require('axios');

/**
 * Calls Mistral AI to generate a diagnostic conclusion.
 * @param {Object} params
 * @param {string} params.apiKey - Plain Mistral API key (decrypted).
 * @param {string} params.model - Model name, e.g., 'open-mistral-7b' (free).
 * @param {string} params.userInput - Optional user symptoms.
 * @param {Object} params.reports - Scan results: { app, storage, hardware, ... }.
 * @param {string[]} params.selectedReports - Selected report IDs.
 * @param {string} params.lang - Language code ('en' or 'fil').
 * @returns {Promise<Object>} - Parsed conclusion.
 */
async function callMistralAI({ apiKey, model, userInput, reports, selectedReports, lang }) {
    if (!apiKey) {
        throw new Error('Mistral API key is required.');
    }

    const modelName = model || 'open-mistral-7b'; // Free tier default

    // System prompt
    const systemPrompt = `You are a professional Android phone diagnostic assistant.
You analyze scan results from an Android device and provide a clear, actionable conclusion.

Language: ${lang === 'fil' ? 'Filipino' : 'English'}.
Be concise, practical, and prioritise safety.

Return your answer as JSON with these fields:
- "humanSummary": a short, plain‑English summary of the main issue (or "No issues found").
- "likelyCause": the most probable cause (if any).
- "confidence": a number between 0 and 1.
- "actions": an array of recommended actions (strings).
- "nextStep": the single most important next step (string).
- "details": any additional technical details (string).`;

    // User prompt
    let userPrompt = `Selected diagnostic reports: ${selectedReports.join(', ')}.\n\n`;
    if (userInput) {
        userPrompt += `User symptoms/notes: ${userInput}\n\n`;
    }
    for (const [key, data] of Object.entries(reports)) {
        if (!data) continue;
        const summary = data.summary || JSON.stringify(data).substring(0, 500);
        userPrompt += `Report "${key}": ${summary}\n\n`;
    }
    userPrompt += `Based on the above, what is the conclusion? Return JSON only.`;

    try {
        const response = await axios.post(
            'https://api.mistral.ai/v1/chat/completions',
            {
                model: modelName,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.3,
                max_tokens: 800,
                response_format: { type: 'json_object' }
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        const content = response.data.choices[0]?.message?.content || '{}';
        let parsed;
        try {
            parsed = JSON.parse(content);
        } catch {
            parsed = {
                humanSummary: content.substring(0, 300),
                likelyCause: 'Could not parse structured response.',
                confidence: 0.3,
                actions: ['Try again or check manually.'],
                nextStep: 'Review the raw analysis below.',
                details: content
            };
        }

        return {
            humanSummary: parsed.humanSummary || parsed.likelyCause || 'No clear conclusion.',
            likelyCause: parsed.likelyCause || '',
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
            actions: Array.isArray(parsed.actions) ? parsed.actions : [],
            nextStep: parsed.nextStep || 'Further manual inspection recommended.',
            details: parsed.details || ''
        };
    } catch (err) {
        console.error('Mistral API error:', err.response?.data || err.message);
        throw new Error(`Mistral API request failed: ${err.message}`);
    }
}

module.exports = { callMistralAI };