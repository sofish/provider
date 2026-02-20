import type { Context, Next } from 'hono';
import { ProviderError } from '../types/errors.js';

const VALID_TYPES = new Set(['openai', 'anthropic', 'gemini', 'codex']);

export async function validateRequest(c: Context, next: Next) {
  const body = await c.req.json();

  if (!body.type) {
    throw new ProviderError('Missing required field: type', 400);
  }
  if (!VALID_TYPES.has(body.type)) {
    throw new ProviderError(`Invalid provider type: ${body.type}. Must be one of: ${[...VALID_TYPES].join(', ')}`, 400);
  }
  if (!body.model) {
    throw new ProviderError('Missing required field: model', 400);
  }
  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    throw new ProviderError('Missing required field: messages (must be a non-empty array)', 400);
  }

  // Store parsed body for downstream handlers
  c.set('body', body);
  await next();
}
