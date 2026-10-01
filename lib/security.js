import { createHash } from 'node:crypto';

const visitors = new Map();
const BODY_LIMIT = 50_000;

export class RequestError extends Error {
  constructor(status, message, retryAfter) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function setSecurityHeaders(response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
}

export function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 20) return null;
  const clean = [];
  let total = 0;
  for (const message of messages) {
    if (!message || !['user', 'assistant'].includes(message.role)) return null;
    if (typeof message.content !== 'string') return null;
    const content = message.content.trim();
    total += content.length;
    if (!content || content.length > 8_000 || total > 30_000) return null;
    clean.push({ role: message.role, content });
  }
  return clean;
}

export async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
    throw new RequestError(415, 'Use application/json.');
  }
  if (Number(request.headers['content-length']) > BODY_LIMIT) {
    throw new RequestError(413, 'Request too large.');
  }
  let body = request.body;
  if (body === undefined) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > BODY_LIMIT) throw new RequestError(413, 'Request too large.');
      chunks.push(buffer);
    }
    body = Buffer.concat(chunks);
  }
  const raw = Buffer.isBuffer(body) ? body.toString('utf8')
    : typeof body === 'string' ? body : JSON.stringify(body);
  if (Buffer.byteLength(raw || '') > BODY_LIMIT) throw new RequestError(413, 'Request too large.');
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new RequestError(400, 'Invalid JSON body.');
  }
}

function limit(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new RequestError(503, 'Request protection is unavailable.');
  return value;
}

// Both endpoints use the same keys. Reserve before calling a paid provider.
// Check all counters before incrementing any; rejection does not spend daily quota.
export const QUOTA_SCRIPT = `
for i = 1, #KEYS do
  if tonumber(redis.call('GET', KEYS[i]) or '0') >= tonumber(ARGV[i * 2 - 1]) then
    return {0, math.max(1, redis.call('TTL', KEYS[i]))}
  end
end
for i = 1, #KEYS do
  local count = redis.call('INCR', KEYS[i])
  if count == 1 then redis.call('EXPIRE', KEYS[i], ARGV[i * 2]) end
end
return {1, 0}
`;

export async function allowRequest(request) {
  const now = Date.now();
  // Vercel overwrites this header. Outside Vercel, trust the socket only.
  const forwarded = process.env.VERCEL === '1' ? request.headers['x-forwarded-for'] : undefined;
  const address = String((Array.isArray(forwarded) ? forwarded[0] : forwarded)
    || request.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const minute = Math.floor(now / 60_000);
  const day = Math.floor(now / 86_400_000);
  const minuteTTL = 60 - Math.floor(now / 1000) % 60;
  const dayTTL = 86_400 - Math.floor(now / 1000) % 86_400;
  const prefix = process.env.RATE_LIMIT_PREFIX || 'becoming-palimpsest';
  const ip = createHash('sha256').update(`${prefix}:${day}:${address}`).digest('hex');
  const quotas = [
    [`${prefix}:ip:${ip}:${minute}`, 12, minuteTTL],
    [`${prefix}:minute:${minute}`, limit('EXHIBITION_REQUESTS_PER_MINUTE', 120), minuteTTL],
    [`${prefix}:day:${day}`, limit('EXHIBITION_REQUESTS_PER_DAY', 3000), dayTTL]
  ];
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url || token || process.env.REQUIRE_SHARED_RATE_LIMIT === 'true') {
    if (!url || !token) throw new RequestError(503, 'Request protection is unavailable.');
    try {
      if (new URL(url).protocol !== 'https:') throw new Error();
      const result = await fetch(url, {
        method: 'POST',
        redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['EVAL', QUOTA_SCRIPT, quotas.length,
          ...quotas.map(([key]) => key), ...quotas.flatMap(([, max, ttl]) => [max, ttl])]),
        signal: AbortSignal.timeout(3000)
      });
      const data = await result.json();
      if (!result.ok || data.error || !Array.isArray(data.result)
        || ![0, 1].includes(data.result[0]) || !Number.isFinite(data.result[1])) throw new Error();
      if (data.result[0] === 0) throw new RequestError(429, 'Please wait before continuing.', Math.max(1, data.result[1]));
      return;
    } catch (error) {
      if (error instanceof RequestError) throw error;
      // Never fall back to memory when the configured shared store fails.
      throw new RequestError(503, 'Request protection is temporarily unavailable.');
    }
  }
  // Compatibility mode until shared storage is configured: instance-local only.
  for (const [key, entry] of visitors) if (entry.expires <= now) visitors.delete(key);
  for (const [key, max, ttl] of quotas) {
    if ((visitors.get(key)?.count || 0) >= max) throw new RequestError(429, 'Please wait before continuing.', ttl);
  }
  for (const [key, , ttl] of quotas) {
    const entry = visitors.get(key) || { count: 0, expires: now + ttl * 1000 };
    entry.count++;
    visitors.set(key, entry);
  }
}
