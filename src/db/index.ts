import type { ProviderType, ProviderConfig } from '../types/provider.js';

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
}

interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

interface D1ExecResult {
  count: number;
  duration: number;
}

interface ProviderRow {
  type: string;
  api_key: string;
  base_url: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
  gemini: 'https://generativelanguage.googleapis.com',
  codex: 'https://api.openai.com',
};

// In-memory cache for provider configs
let cachedProviders: Record<string, ProviderConfig> | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 60_000; // 1 minute

/**
 * Load all provider configs from D1, with in-memory caching.
 */
export async function loadProvidersFromD1(db: D1Database): Promise<Record<ProviderType, ProviderConfig>> {
  if (cachedProviders && Date.now() < cacheExpiry) {
    return cachedProviders as Record<ProviderType, ProviderConfig>;
  }

  const result = await db.prepare('SELECT type, api_key, base_url, enabled FROM providers WHERE enabled = 1').all<ProviderRow>();

  const providers: Record<string, ProviderConfig> = {};

  // Start with defaults (empty keys)
  for (const [type, baseUrl] of Object.entries(DEFAULT_BASE_URLS)) {
    providers[type] = { apiKey: '', baseUrl };
  }

  // Override with D1 values
  for (const row of result.results) {
    providers[row.type] = {
      apiKey: row.api_key,
      baseUrl: row.base_url || DEFAULT_BASE_URLS[row.type] || '',
    };
  }

  cachedProviders = providers;
  cacheExpiry = Date.now() + CACHE_TTL;

  return providers as Record<ProviderType, ProviderConfig>;
}

/**
 * Update a provider's config in D1.
 */
export async function upsertProvider(
  db: D1Database,
  type: string,
  apiKey?: string,
  baseUrl?: string,
  enabled?: boolean,
): Promise<void> {
  const existing = await db.prepare('SELECT type FROM providers WHERE type = ?').bind(type).first<ProviderRow>();

  if (existing) {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (apiKey !== undefined) { updates.push('api_key = ?'); values.push(apiKey); }
    if (baseUrl !== undefined) { updates.push('base_url = ?'); values.push(baseUrl); }
    if (enabled !== undefined) { updates.push('enabled = ?'); values.push(enabled ? 1 : 0); }
    updates.push("updated_at = datetime('now')");
    values.push(type);
    await db.prepare(`UPDATE providers SET ${updates.join(', ')} WHERE type = ?`).bind(...values).run();
  } else {
    await db.prepare(
      'INSERT INTO providers (type, api_key, base_url, enabled) VALUES (?, ?, ?, ?)',
    ).bind(type, apiKey || '', baseUrl || DEFAULT_BASE_URLS[type] || '', enabled !== false ? 1 : 0).run();
  }

  // Invalidate cache
  cachedProviders = null;
}

/**
 * Get a single provider config from D1.
 */
export async function getProvider(db: D1Database, type: string): Promise<ProviderRow | null> {
  return db.prepare('SELECT type, api_key, base_url, enabled, created_at, updated_at FROM providers WHERE type = ?')
    .bind(type)
    .first<ProviderRow>();
}

/**
 * List all providers from D1.
 */
export async function listProviders(db: D1Database): Promise<ProviderRow[]> {
  const result = await db.prepare('SELECT type, base_url, enabled, created_at, updated_at FROM providers').all<ProviderRow>();
  return result.results;
}

/**
 * Delete a provider from D1.
 */
export async function deleteProvider(db: D1Database, type: string): Promise<void> {
  await db.prepare('DELETE FROM providers WHERE type = ?').bind(type).run();
  cachedProviders = null;
}

/**
 * Initialize the D1 schema if tables don't exist.
 */
export async function ensureSchema(db: D1Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      type TEXT PRIMARY KEY,
      api_key TEXT NOT NULL DEFAULT '',
      base_url TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
