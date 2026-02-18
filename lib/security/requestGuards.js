export function apiRouteProtection(req, res, next) {
  const requireToken = String(process.env.AI_API_REQUIRE_TOKEN || 'false').toLowerCase() === 'true';
  if (!requireToken) return next();

  const token = req.get('x-ai-api-token') || '';
  if (!token || token !== process.env.AI_API_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized API access.', code: 'UNAUTHORIZED' });
  }
  return next();
}

export function requireJsonBody(req, res, next) {
  if (req.method !== 'POST') return next();
  const contentType = req.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ error: 'Expected application/json body.', code: 'INVALID_CONTENT_TYPE' });
  }
  return next();
}

export function validateChatRequestBody(body) {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'Body must be an object.' };
  const { message, history = [] } = body;
  if (typeof message !== 'string' || !message.trim()) return { ok: false, reason: 'Message is required.' };
  if (message.length > 4000) return { ok: false, reason: 'Message exceeds 4000 characters.' };
  if (!Array.isArray(history)) return { ok: false, reason: 'History must be an array.' };

  for (const item of history) {
    if (!item || typeof item !== 'object') return { ok: false, reason: 'History items must be objects.' };
    if (!['user', 'assistant', 'system'].includes(item.role)) return { ok: false, reason: 'Invalid history role.' };
    if (typeof item.content !== 'string') return { ok: false, reason: 'History content must be string.' };
  }

  return { ok: true };
}
