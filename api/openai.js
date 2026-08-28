import { allowRequest, readJson, setSecurityHeaders, validateMessages } from './_shared.js';

export default async function handler(request, response) {
  setSecurityHeaders(response);

  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
  if (!allowRequest(request)) return response.status(429).json({ error: 'Please wait before continuing.' });
  if (!process.env.OPENAI_API_KEY) return response.status(503).json({ error: 'OpenAI is not configured.' });

  try {
    const body = await readJson(request);
    const messages = validateMessages(body.messages);
    if (!messages) return response.status(400).json({ error: 'Invalid dialogue history.' });

    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        messages,
        max_tokens: 300,
        temperature: 0.8
      })
    });

    const data = await upstream.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!upstream.ok || typeof content !== 'string') {
      console.error('OpenAI upstream error', upstream.status, data?.error?.type || 'unknown');
      return response.status(502).json({ error: 'OpenAI is temporarily unavailable.' });
    }

    return response.status(200).json({ content });
  } catch (error) {
    console.error('OpenAI handler error', error?.message || error);
    return response.status(500).json({ error: 'Unable to continue the dialogue.' });
  }
}

