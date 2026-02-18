import { underwritingSchema, defaultUnderwritingPayload } from './schema.js';

const REQUIRED_KEYS = underwritingSchema.required;

export function validateUnderwritingPayload(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { ok: false, errors: ['Payload must be an object.'] };
  }

  const errors = [];
  for (const key of REQUIRED_KEYS) {
    if (!(key in candidate)) errors.push(`Missing required key: ${key}`);
    else if (typeof candidate[key] !== 'object' || candidate[key] === null || Array.isArray(candidate[key])) {
      errors.push(`Key ${key} must be an object.`);
    }
  }

  const extra = Object.keys(candidate).filter((k) => !REQUIRED_KEYS.includes(k));
  if (extra.length) errors.push(`Unexpected keys: ${extra.join(', ')}`);

  return { ok: errors.length === 0, errors };
}

export function coerceToUnderwritingPayload(candidate) {
  const safe = { ...defaultUnderwritingPayload, ...(candidate || {}) };
  const normalized = {};
  for (const key of REQUIRED_KEYS) {
    const value = safe[key];
    normalized[key] = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }
  return normalized;
}
