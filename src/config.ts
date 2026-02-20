import type { ProviderType, ProviderConfig, ProviderInstance } from './types/provider.js';
import type { Env } from './env.js';

export interface AppConfig {
  port: number;
  providers: Record<ProviderType, ProviderConfig>;
  instances: ProviderInstance[];
}

const DEFAULT_BASE_URLS: Record<ProviderType, string> = {
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
  gemini: 'https://generativelanguage.googleapis.com',
  codex: 'https://api.openai.com',
};

function buildEnvInstances(
  keys: Record<ProviderType, { apiKey: string; baseUrl: string }>,
): ProviderInstance[] {
  const now = new Date().toISOString();
  const instances: ProviderInstance[] = [];

  for (const [type, cfg] of Object.entries(keys) as [ProviderType, { apiKey: string; baseUrl: string }][]) {
    if (!cfg.apiKey) continue;
    instances.push({
      id: `env_${type}`,
      type,
      name: `${type} (env)`,
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
      weight: 1,
      enabled: true,
      cooldownUntil: null,
      cooldownSeconds: 60,
      createdAt: now,
      updatedAt: now,
    });
  }

  return instances;
}

/**
 * Load config from Node.js process.env (for local dev with `tsx`).
 */
export function loadConfig(): AppConfig {
  const providerEntries = {
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
  };

  return {
    port: parseInt(process.env.PORT || '3000', 10),
    providers: providerEntries,
    instances: buildEnvInstances(providerEntries),
  };
}

/**
 * Load config from Cloudflare Workers env bindings (secrets fallback).
 */
export function loadConfigFromEnv(env: Env): AppConfig {
  const providerEntries = {
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
  };

  return {
    port: 0,
    providers: providerEntries,
    instances: buildEnvInstances(providerEntries),
  };
}

export { DEFAULT_BASE_URLS };
