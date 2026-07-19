import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function askGemini(prompt, model = 'gemini-2.0-flash') {
  try {
    const modelInstance = genAI.getGenerativeModel({ model });
    const result = await modelInstance.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    console.error('[Gemini] Error:', err);
    throw err;
  }
}