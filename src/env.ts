import type { D1Database } from './db/index.js';

/**
 * Cloudflare Workers environment bindings.
 */
export interface Env {
  // D1 database for provider config
  DB: D1Database;

  // Optional: API keys as secrets (fallback when D1 has no key)
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  CODEX_API_KEY?: string;

  // Optional: custom base URLs
  OPENAI_BASE_URL?: string;
  ANTHROPIC_BASE_URL?: string;
  GEMINI_BASE_URL?: string;
  CODEX_BASE_URL?: string;

  // Optional: debug mode
  DEBUG?: string;
}
