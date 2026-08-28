/opt/homebrew/Library/Homebrew/cmd/shellenv.sh: line 18: /bin/ps: Operation not permitted
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 12;
const visitors = new Map();

export function setSecurityHeaders(response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
}

export function allowRequest(request) {
  const forwarded = request.headers['x-forwarded-for'];
  const address = Array.isArray(forwarded)
    ? forwarded[0]
    : String(forwarded || request.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const entry = visitors.get(address);

  if (!entry || now - entry.startedAt >= WINDOW_MS) {
    visitors.set(address, { startedAt: now, count: 1 });
    return true;
  }

  entry.count += 1;
  return entry.count <= MAX_REQUESTS;
}

export function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 20) return null;

  const clean = [];
  let totalCharacters = 0;

  for (const message of messages) {
    if (!message || !['system', 'user', 'assistant'].includes(message.role)) return null;
    if (typeof message.content !== 'string') return null;

    const content = message.content.trim();
    if (!content || content.length > 8_000) return null;
    totalCharacters += content.length;
    if (totalCharacters > 30_000) return null;
    clean.push({ role: message.role, content });
  }

  return clean;
}

export async function readJson(request) {
  if (request.body && typeof request.body === 'object') return request.body;

  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 50_000) throw new Error('Request too large');
  }
  return JSON.parse(raw || '{}');
}

