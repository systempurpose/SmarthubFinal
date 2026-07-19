// src/ai-service.js
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');

// ---- Shared prompt builder ----
function buildUserPrompt(selectedReports, reports, userInput, lang) {
    let prompt = `Selected diagnostic reports: ${selectedReports.join(', ')}.\n\n`;
    if (userInput && userInput.trim()) {
        prompt += `User symptoms/notes: ${userInput}\n\n`;
    }
    for (const [key, data] of Object.entries(reports)) {
        if (!data) continue;
        const summary = data.summary || JSON.stringify(data).substring(0, 500);
        prompt += `Report "${key}": ${summary}\n\n`;
    }
    if (lang === 'fil') {
        prompt += `Please respond in Filipino (Tagalog).\n\n`;
    } else {
        prompt += `Please respond in English.\n\n`;
    }
    return prompt;
}

// ---- Parse AI response ----
function parseAIResponse(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            try {
                parsed = JSON.parse(jsonMatch[1]);
            } catch {
                parsed = null;
            }
        }
        if (!parsed) {
            const objectMatch = text.match(/\{[\s\S]*\}/);
            if (objectMatch) {
                try {
                    parsed = JSON.parse(objectMatch[0]);
                } catch {
                    parsed = null;
                }
            }
        }
        if (!parsed) {
            parsed = {
                humanSummary: text.substring(0, 300),
                likelyCause: 'Could not parse structured response.',
                confidence: 0.3,
                actions: ['Try again or check manually.'],
                nextStep: 'Review the raw analysis below.',
                details: text
            };
        }
    }

    return {
        humanSummary: parsed.humanSummary || parsed.likelyCause || 'No clear conclusion.',
        likelyCause: parsed.likelyCause || '',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        nextStep: parsed.nextStep || 'Further manual inspection recommended.',
        details: parsed.details || ''
    };
}

// ---- Mistral ----
async function callMistralAI({ apiKey, model, userInput, reports, selectedReports, lang }) {
    if (!apiKey) throw new Error('Mistral API key is required.');
    const modelName = model || 'open-mistral-7b';

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

    const userPrompt = buildUserPrompt(selectedReports, reports, userInput, lang);

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
        return parseAIResponse(content);
    } catch (err) {
        console.error('Mistral API error:', err.response?.data || err.message);
        throw new Error(`Mistral API request failed: ${err.message}`);
    }
}

// ---- Gemini ----
async function callGeminiAI({ apiKey, model, userInput, reports, selectedReports, lang }) {
    if (!apiKey) throw new Error('Gemini API key is required.');
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelInstance = genAI.getGenerativeModel({ model: model || 'gemini-2.0-flash' });

    let userPrompt = buildUserPrompt(selectedReports, reports, userInput, lang);
    userPrompt += `Based on the above, provide a diagnostic conclusion. Return ONLY valid JSON with fields: "humanSummary", "likelyCause", "confidence" (number), "actions" (array), "nextStep", "details".`;

    try {
        const result = await modelInstance.generateContent(userPrompt);
        const responseText = result.response.text();
        return parseAIResponse(responseText);
    } catch (err) {
        console.error('Gemini API error:', err);
        throw new Error(`Gemini API request failed: ${err.message}`);
    }
}

// ---- Groq ----
async function callGroqAI({ apiKey, model, userInput, reports, selectedReports, lang }) {
    if (!apiKey) throw new Error('Groq API key is required.');
    const client = new Groq({ apiKey });

    let userPrompt = buildUserPrompt(selectedReports, reports, userInput, lang);
    userPrompt += `Based on the above, provide a diagnostic conclusion. Return ONLY valid JSON with fields: "humanSummary", "likelyCause", "confidence" (number), "actions" (array), "nextStep", "details".`;

    try {
        const completion = await client.chat.completions.create({
            messages: [{ role: 'user', content: userPrompt }],
            model: model || 'llama3-70b-8192',
            temperature: 0.3,
            max_tokens: 800,
        });
        const content = completion.choices[0]?.message?.content || '{}';
        return parseAIResponse(content);
    } catch (err) {
        console.error('Groq API error:', err);
        throw new Error(`Groq API request failed: ${err.message}`);
    }
}

// ---- NEW: Summarize arbitrary text using AI ----
async function summarizeText(text, provider = 'groq', model = null, lang = 'en') {
    if (!text) return 'No content to summarize.';
    const prompt = `Summarize the following text in 3 bullet points. Focus on the key technical details, symptoms, and potential solutions:\n\n${text.slice(0, 6000)}`;

    try {
        let result;
        const apiKey = provider === 'mistral' ? null : process.env[`${provider.toUpperCase()}_API_KEY`];

        switch (provider) {
            case 'mistral': {
                const key = await getAIKey(); // if you have an encrypted key
                // If you don't have getAIKey, use a plain key from env
                const mistralKey = process.env.MISTRAL_API_KEY;
                if (!mistralKey) throw new Error('MISTRAL_API_KEY not set');
                const response = await axios.post(
                    'https://api.mistral.ai/v1/chat/completions',
                    {
                        model: model || 'open-mistral-7b',
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.3,
                        max_tokens: 400,
                    },
                    { headers: { 'Authorization': `Bearer ${mistralKey}`, 'Content-Type': 'application/json' } }
                );
                result = response.data.choices[0]?.message?.content || '';
                break;
            }
            case 'gemini': {
                if (!apiKey) throw new Error('GEMINI_API_KEY not set');
                const genAI = new GoogleGenerativeAI(apiKey);
                const modelInstance = genAI.getGenerativeModel({ model: model || 'gemini-2.0-flash' });
                const response = await modelInstance.generateContent(prompt);
                result = response.response.text();
                break;
            }
            case 'groq':
            default: {
                if (!apiKey) throw new Error('GROQ_API_KEY not set');
                const client = new Groq({ apiKey });
                const completion = await client.chat.completions.create({
                    messages: [{ role: 'user', content: prompt }],
                    model: model || 'llama3-70b-8192',
                    temperature: 0.3,
                    max_tokens: 400,
                });
                result = completion.choices[0]?.message?.content || '';
                break;
            }
        }
        return result || 'Summary not available.';
    } catch (err) {
        console.error(`[summarizeText] ${provider} error:`, err.message);
        return `Summary failed: ${err.message}`;
    }
}

module.exports = {
    callMistralAI,
    callGeminiAI,
    callGroqAI,
    summarizeText
};