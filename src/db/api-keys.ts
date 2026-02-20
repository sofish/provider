import type { D1Database } from './index.js';

interface ApiKeyRow {
  id: string;
  name: string;
  key_hash: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  enabled: number;
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  enabled: boolean;
}

async function sha256Hex(data: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateRawKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return 'sk-' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a new API key. Returns the plaintext key (shown once).
 */
export async function createApiKey(db: D1Database, name: string): Promise<{ key: string; info: ApiKeyInfo }> {
  const id = generateId();
  const plaintext = generateRawKey();
  const keyHash = await sha256Hex(plaintext);
  const prefix = plaintext.slice(0, 10) + '...';

  await db.prepare(
    'INSERT INTO api_keys (id, name, key_hash, prefix) VALUES (?, ?, ?, ?)',
  ).bind(id, name, keyHash, prefix).run();

  return {
    key: plaintext,
    info: { id, name, prefix, created_at: new Date().toISOString(), last_used_at: null, enabled: true },
  };
}

/**
 * Validate an API key. Returns the key row if valid, null otherwise.
 */
export async function validateApiKey(db: D1Database, key: string): Promise<ApiKeyRow | null> {
  const keyHash = await sha256Hex(key);
  return db.prepare(
    'SELECT id, name, key_hash, prefix, created_at, last_used_at, enabled FROM api_keys WHERE key_hash = ? AND enabled = 1',
  ).bind(keyHash).first<ApiKeyRow>();
}

/**
 * List all API keys (without hashes).
 */
export async function listApiKeys(db: D1Database): Promise<ApiKeyInfo[]> {
  const result = await db.prepare(
    'SELECT id, name, prefix, created_at, last_used_at, enabled FROM api_keys ORDER BY created_at DESC',
  ).all<ApiKeyRow>();

  return result.results.map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    enabled: row.enabled === 1,
  }));
}

/**
 * Delete an API key.
 */
export async function deleteApiKey(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM api_keys WHERE id = ?').bind(id).run();
}

/**
 * Toggle an API key's enabled status.
 */
export async function toggleApiKey(db: D1Database, id: string, enabled: boolean): Promise<void> {
  await db.prepare('UPDATE api_keys SET enabled = ? WHERE id = ?').bind(enabled ? 1 : 0, id).run();
}

/**
 * Update last_used_at timestamp (call via waitUntil for async).
 */
export async function updateLastUsed(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").bind(id).run();
}
