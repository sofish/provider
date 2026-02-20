import type { ProviderType } from '../types/provider.js';
import { generateId } from './id.js';

// Provider-specific ID constraints
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;
const MAX_ID_LENGTH = 64;

/**
 * Normalize a tool call ID for the target provider.
 * Different providers have different ID format requirements:
 * - Anthropic: [a-zA-Z0-9_-], max 64 chars
 * - Gemini: [a-zA-Z0-9_-], max 64 chars
 * - Codex: composite callId|itemId format — strip pipe on cross-provider use
 */
export function normalizeToolCallId(id: string | undefined, targetProvider: ProviderType): string {
  if (!id) return generateToolCallId();

  // Codex uses composite "callId|itemId" format — extract the callId part
  if (id.includes('|')) {
    id = id.split('|')[0];
  }

  // Strip characters not in [a-zA-Z0-9_-]
  if (!SAFE_ID_RE.test(id)) {
    id = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  // Truncate to max length
  if (id.length > MAX_ID_LENGTH) {
    id = id.slice(0, MAX_ID_LENGTH);
  }

  // Ensure non-empty
  if (!id) return generateToolCallId();

  return id;
}

/**
 * Generate a provider-safe tool call ID.
 */
export function generateToolCallId(prefix: string = 'call'): string {
  return generateId(prefix);
}
