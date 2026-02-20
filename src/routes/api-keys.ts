import { Hono } from 'hono';
import type { D1Database } from '../db/index.js';
import { createApiKey, listApiKeys, deleteApiKey, toggleApiKey } from '../db/api-keys.js';

export function createApiKeyRoutes(db: D1Database) {
  const app = new Hono();

  // GET /v1/config/api-keys — list all keys
  app.get('/', async (c) => {
    const keys = await listApiKeys(db);
    return c.json({ keys });
  });

  // POST /v1/config/api-keys — create a new key
  app.post('/', async (c) => {
    const body = await c.req.json<{ name?: string }>();
    const name = body.name || 'Unnamed key';
    const result = await createApiKey(db, name);
    return c.json({ key: result.key, info: result.info }, 201);
  });

  // DELETE /v1/config/api-keys/:id — revoke a key
  app.delete('/:id', async (c) => {
    const id = c.req.param('id');
    await deleteApiKey(db, id);
    return c.json({ ok: true });
  });

  // PATCH /v1/config/api-keys/:id — toggle enabled
  app.patch('/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<{ enabled?: boolean }>();
    if (body.enabled === undefined) {
      return c.json({ error: 'Missing field: enabled' }, 400);
    }
    await toggleApiKey(db, id, body.enabled);
    return c.json({ ok: true });
  });

  return app;
}
