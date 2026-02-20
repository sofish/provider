import type { ProviderType, ProviderConfig } from './types/provider.js';
import type { Env } from './env.js';

export interface AppConfig {
  port: number;
  providers: Record<ProviderType, ProviderConfig>;
}

const DEFAULT_BASE_URLS: Record<ProviderType, string> = {
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
  gemini: 'https://generativelanguage.googleapis.com',
  codex: 'https://api.openai.com',
};

/**
 * Load config from Node.js process.env (for local dev with `tsx`).
 */
export function loadConfig(): AppConfig {
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    providers: {
      openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        baseUrl: process.env.OPENAI_BASE_URL || DEFAULT_BASE_URLS.openai,
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        baseUrl: process.env.ANTHROPIC_BASE_URL || DEFAULT_BASE_URLS.anthropic,
      },
      gemini: {
        apiKey: process.env.GEMINI_API_KEY || '',
        baseUrl: process.env.GEMINI_BASE_URL || DEFAULT_BASE_URLS.gemini,
      },
      codex: {
        apiKey: process.env.CODEX_API_KEY || '',
        baseUrl: process.env.CODEX_BASE_URL || DEFAULT_BASE_URLS.codex,
      },
    },
  };
}

/**
 * Load config from Cloudflare Workers env bindings (secrets fallback).
 * Used when D1 is not available or as fallback for missing D1 keys.
 */
export function loadConfigFromEnv(env: Env): AppConfig {
  return {
    port: 0, // Not used in Workers
    providers: {
      openai: {
        apiKey: env.OPENAI_API_KEY || '',
        baseUrl: env.OPENAI_BASE_URL || DEFAULT_BASE_URLS.openai,
      },
      anthropic: {
        apiKey: env.ANTHROPIC_API_KEY || '',
        baseUrl: env.ANTHROPIC_BASE_URL || DEFAULT_BASE_URLS.anthropic,
      },
      gemini: {
        apiKey: env.GEMINI_API_KEY || '',
        baseUrl: env.GEMINI_BASE_URL || DEFAULT_BASE_URLS.gemini,
      },
      codex: {
        apiKey: env.CODEX_API_KEY || '',
        baseUrl: env.CODEX_BASE_URL || DEFAULT_BASE_URLS.codex,
      },
    },
  };
}

export { DEFAULT_BASE_URLS };
