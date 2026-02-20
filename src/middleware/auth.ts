import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { verifyJWT } from '../utils/jwt.js';
import { validateApiKey, updateLastUsed } from '../db/api-keys.js';
import type { D1Database } from '../db/index.js';

/**
 * Admin auth middleware — checks JWT in `admin_token` cookie or Authorization header.
 */
export function adminAuth(jwtSecret: string) {
  return async (c: Context, next: Next) => {
    let token = getCookie(c, 'admin_token');

    if (!token) {
      const authHeader = c.req.header('Authorization');
      if (authHeader?.startsWith('Bearer ') && !authHeader.startsWith('Bearer sk-')) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const payload = await verifyJWT(token, jwtSecret);
    if (!payload) {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }

    c.set('admin', payload);
    await next();
  };
}

/**
 * API key auth middleware — checks Authorization: Bearer sk-... against D1.
 */
export function apiKeyAuth(db: D1Database) {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer sk-')) {
      return c.json({ error: 'Missing or invalid API key' }, 401);
    }

    const key = authHeader.slice(7);
    const row = await validateApiKey(db, key);
    if (!row) {
      return c.json({ error: 'Invalid API key' }, 401);
    }

    // Update last_used async (best-effort)
    const ctx = c.executionCtx as { waitUntil?: (p: Promise<unknown>) => void };
    if (ctx?.waitUntil) {
      ctx.waitUntil(updateLastUsed(db, row.id));
    }

    await next();
  };
}
