import { prompts } from './prompts.js';
import { allowRequest, readJson, RequestError, setSecurityHeaders, validateMessages } from './security.js';

const providers = {
  openai: { name: 'OpenAI', key: 'OPENAI_API_KEY', model: 'OPENAI_MODEL', fallback: 'gpt-5.6-sol', prompt: prompts.bergson, url: 'https://api.openai.com/v1/chat/completions' },
  deepseek: { name: 'OpenAI', key: 'OPENAI_API_KEY', model: 'OPENAI_MODEL', fallback: 'gpt-5.6-sol', prompt: prompts.deleuze, url: 'https://api.openai.com/v1/chat/completions' }
};

export function createHandler(provider) {
  const config = providers[provider];
  return async function handler(request, response) {
    setSecurityHeaders(response);
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return response.status(405).json({ error: 'Method not allowed' });
    }
    try {
      const body = await readJson(request);
      const history = validateMessages(body.messages);
      if (!history) throw new RequestError(400, 'Invalid dialogue history.');
      if (!process.env[config.key]) throw new RequestError(503, `${config.name} is not configured.`);
      await allowRequest(request);
      const upstream = await fetch(config.url, {
        method: 'POST',
        redirect: 'error',
        headers: { Authorization: `Bearer ${process.env[config.key]}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env[config.model] || config.fallback,
          messages: [{ role: 'system', content: config.prompt }, ...history],
          max_completion_tokens: 300,
          reasoning_effort: 'none',
          temperature: 0.8
        }),
        signal: AbortSignal.timeout(20_000)
      });
      const data = await upstream.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!upstream.ok || typeof content !== 'string' || !content.trim()) {
        throw new RequestError(502, `${config.name} is temporarily unavailable.`);
      }
      return response.status(200).json({ content });
    } catch (error) {
      if (error instanceof RequestError) {
        if (error.retryAfter) response.setHeader('Retry-After', String(error.retryAfter));
        return response.status(error.status).json({ error: error.message });
      }
      // Do not log provider bodies, dialogue, credentials, or exception messages.
      const timeout = ['TimeoutError', 'AbortError'].includes(error?.name);
      return response.status(timeout ? 504 : 502).json({ error: 'Unable to continue the dialogue.' });
    }
  };
}
