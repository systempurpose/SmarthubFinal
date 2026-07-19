import Groq from 'groq-sdk';

const client = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function askGroq(prompt, model = 'llama3-70b-8192') {
  try {
    const completion = await client.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: model,
      temperature: 0.7,
      max_tokens: 1024,
    });
    return completion.choices[0]?.message?.content || '';
  } catch (err) {
    console.error('Groq API error:', err);
    throw err;
  }
}