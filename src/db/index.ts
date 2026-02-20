import type { ProviderType, ProviderConfig, ProviderInstance } from '../types/provider.js';

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

interface InstanceRow {
  id: string;
  type: string;
  name: string;
  api_key: string;
  base_url: string;
  weight: number;
  enabled: number;
  cooldown_until: string | null;
  cooldown_seconds: number;
  created_at: string;
  updated_at: string;
}

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
  gemini: 'https://generativelanguage.googleapis.com',
  codex: 'https://api.openai.com',
};

// In-memory cache for instances
let cachedInstances: ProviderInstance[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 60_000; // 1 minute

function rowToInstance(row: InstanceRow): ProviderInstance {
  return {
    id: row.id,
    type: row.type as ProviderType,
    name: row.name,
    apiKey: row.api_key,
    baseUrl: row.base_url,
    weight: row.weight,
    enabled: row.enabled === 1,
    cooldownUntil: row.cooldown_until,
    cooldownSeconds: row.cooldown_seconds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Load all provider instances from D1, with in-memory caching.
 */
export async function loadInstancesFromD1(db: D1Database): Promise<ProviderInstance[]> {
  if (cachedInstances && Date.now() < cacheExpiry) {
    return cachedInstances;
  }

  const result = await db.prepare(
    'SELECT id, type, name, api_key, base_url, weight, enabled, cooldown_until, cooldown_seconds, created_at, updated_at FROM provider_instances'
  ).all<InstanceRow>();

  const instances = result.results.map(rowToInstance);
  cachedInstances = instances;
  cacheExpiry = Date.now() + CACHE_TTL;

  return instances;
}

function invalidateCache() {
  cachedInstances = null;
}

function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * Create a new provider instance.
 */
export async function createInstance(
  db: D1Database,
  data: {
    type: string;
    name?: string;
    apiKey?: string;
    baseUrl?: string;
    weight?: number;
    cooldownSeconds?: number;
  },
): Promise<ProviderInstance> {
  const id = generateId();
  const baseUrl = data.baseUrl || DEFAULT_BASE_URLS[data.type] || '';
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

  await db.prepare(
    `INSERT INTO provider_instances (id, type, name, api_key, base_url, weight, enabled, cooldown_seconds, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
  ).bind(
    id,
    data.type,
    data.name || '',
    data.apiKey || '',
    baseUrl,
    data.weight ?? 1,
    data.cooldownSeconds ?? 60,
    now,
    now,
  ).run();

  invalidateCache();

  return {
    id,
    type: data.type as ProviderType,
    name: data.name || '',
    apiKey: data.apiKey || '',
    baseUrl,
    weight: data.weight ?? 1,
    enabled: true,
    cooldownUntil: null,
    cooldownSeconds: data.cooldownSeconds ?? 60,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update a provider instance by ID (partial update).
 */
export async function updateInstance(
  db: D1Database,
  id: string,
  data: {
    name?: string;
    apiKey?: string;
    baseUrl?: string;
    weight?: number;
    enabled?: boolean;
    cooldownSeconds?: number;
  },
): Promise<void> {
  const updates: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
  if (data.apiKey !== undefined) { updates.push('api_key = ?'); values.push(data.apiKey); }
  if (data.baseUrl !== undefined) { updates.push('base_url = ?'); values.push(data.baseUrl); }
  if (data.weight !== undefined) { updates.push('weight = ?'); values.push(data.weight); }
  if (data.enabled !== undefined) { updates.push('enabled = ?'); values.push(data.enabled ? 1 : 0); }
  if (data.cooldownSeconds !== undefined) { updates.push('cooldown_seconds = ?'); values.push(data.cooldownSeconds); }

  if (updates.length === 0) return;

  updates.push("updated_at = datetime('now')");
  values.push(id);

  await db.prepare(`UPDATE provider_instances SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  invalidateCache();
}

/**
 * Get a single provider instance by ID.
 */
export async function getInstance(db: D1Database, id: string): Promise<ProviderInstance | null> {
  const row = await db.prepare(
    'SELECT id, type, name, api_key, base_url, weight, enabled, cooldown_until, cooldown_seconds, created_at, updated_at FROM provider_instances WHERE id = ?'
  ).bind(id).first<InstanceRow>();

  if (!row) return null;
  return rowToInstance(row);
}

/**
 * List all instances, optionally filtered by type.
 */
export async function listInstances(db: D1Database, type?: string): Promise<ProviderInstance[]> {
  let result;
  if (type) {
    result = await db.prepare(
      'SELECT id, type, name, api_key, base_url, weight, enabled, cooldown_until, cooldown_seconds, created_at, updated_at FROM provider_instances WHERE type = ? ORDER BY created_at'
    ).bind(type).all<InstanceRow>();
  } else {
    result = await db.prepare(
      'SELECT id, type, name, api_key, base_url, weight, enabled, cooldown_until, cooldown_seconds, created_at, updated_at FROM provider_instances ORDER BY type, created_at'
    ).all<InstanceRow>();
  }

  return result.results.map(rowToInstance);
}

/**
 * Delete a provider instance by ID.
 */
export async function deleteInstance(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM provider_instances WHERE id = ?').bind(id).run();
  invalidateCache();
}

/**
 * Set cooldown on an instance.
 */
export async function setCooldown(db: D1Database, id: string, seconds: number): Promise<void> {
  await db.prepare(
    `UPDATE provider_instances SET cooldown_until = datetime('now', '+' || ? || ' seconds'), updated_at = datetime('now') WHERE id = ?`
  ).bind(seconds, id).run();
  invalidateCache();
}

/**
 * Clear cooldown on an instance.
 */
export async function clearCooldown(db: D1Database, id: string): Promise<void> {
  await db.prepare(
    `UPDATE provider_instances SET cooldown_until = NULL, updated_at = datetime('now') WHERE id = ?`
  ).bind(id).run();
  invalidateCache();
}

/**
 * Initialize the D1 schema if tables don't exist.
 * Includes migration from old `providers` table to `provider_instances`.
 */
export async function ensureSchema(db: D1Database): Promise<void> {
  // Check if old `providers` table exists
  const oldTable = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='providers'"
  ).first<{ name: string }>();

  if (oldTable) {
    // Migrate old providers → provider_instances
    await db.exec(`
      CREATE TABLE IF NOT EXISTS provider_instances (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        api_key TEXT NOT NULL DEFAULT '',
        base_url TEXT NOT NULL DEFAULT '',
        weight INTEGER NOT NULL DEFAULT 1,
        enabled INTEGER NOT NULL DEFAULT 1,
        cooldown_until TEXT,
        cooldown_seconds INTEGER NOT NULL DEFAULT 60,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Check if provider_instances already has data (in case migration ran partially)
    const existingCount = await db.prepare('SELECT COUNT(*) as cnt FROM provider_instances').first<{ cnt: number }>();
    if (!existingCount || existingCount.cnt === 0) {
      // Migrate rows from old table
      await db.exec(`
        INSERT INTO provider_instances (id, type, name, api_key, base_url, weight, enabled, cooldown_seconds, created_at, updated_at)
        SELECT
          type,
          type,
          type,
          api_key,
          base_url,
          1,
          enabled,
          60,
          created_at,
          updated_at
        FROM providers;
      `);
    }

    // Rename old table as backup
    await db.exec('ALTER TABLE providers RENAME TO providers_backup_v1;');
  } else {
    // Fresh install — create provider_instances
    await db.exec(`
      CREATE TABLE IF NOT EXISTS provider_instances (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        api_key TEXT NOT NULL DEFAULT '',
        base_url TEXT NOT NULL DEFAULT '',
        weight INTEGER NOT NULL DEFAULT 1,
        enabled INTEGER NOT NULL DEFAULT 1,
        cooldown_until TEXT,
        cooldown_seconds INTEGER NOT NULL DEFAULT 60,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  await db.exec('CREATE INDEX IF NOT EXISTS idx_pi_type_enabled ON provider_instances (type, enabled);');

  // Keep api_keys table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      prefix TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      enabled INTEGER NOT NULL DEFAULT 1
    );
  `);
  await db.exec('CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys (key_hash);');

  // Request logs table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS request_logs (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      instance_id TEXT,
      api_key_id TEXT,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      status INTEGER NOT NULL DEFAULT 200,
      stream INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  await db.exec('CREATE INDEX IF NOT EXISTS idx_rl_created ON request_logs (created_at);');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_rl_provider ON request_logs (provider, model);');
}

export { DEFAULT_BASE_URLS };
