import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import type { AppConfig } from './config.js';
import type { ProviderType, ProviderConfig } from './types/provider.js';
import { ProviderError } from './types/errors.js';
import type { ProviderErrorType } from './types/errors.js';
import { registry, createTransformState } from './converters/index.js';
import { getAdapter } from './providers/index.js';
import { validateRequest } from './middleware/index.js';
import { adminAuth, apiKeyAuth } from './middleware/auth.js';
import { logger } from './utils/logger.js';
import { isContextOverflow } from './utils/overflow.js';
import type { D1Database } from './db/index.js';
import {
  listInstances,
  getInstance,
  createInstance,
  updateInstance,
  deleteInstance,
  setCooldown,
  clearCooldown,
  ensureSchema,
} from './db/index.js';
import { selectInstanceOrSoonest } from './routing/select.js';
import { createAuthRoutes } from './routes/auth.js';
import { createApiKeyRoutes } from './routes/api-keys.js';
import { createAdminPages } from './admin/pages.js';

type HonoEnv = { Variables: { body: Record<string, unknown> } };

export interface CreateAppOptions {
  config: AppConfig;
  db?: D1Database;
  adminPassword?: string;
  jwtSecret?: string;
  waitUntil?: (promise: Promise<unknown>) => void;
}

export function createApp(options: CreateAppOptions) {
  const { config, db, adminPassword, jwtSecret, waitUntil } = options;
  const app = new Hono<HonoEnv>();

  // Global error handler
  app.onError((err, c) => {
    logger.error('Request error:', err);

    let status = 500;
    if (err instanceof ProviderError) {
      status = err.statusCode;
      const errorType: ProviderErrorType = err.isOverflow ? 'context_overflow' : 'provider_error';
      return c.json({
        error: {
          message: err.message,
          type: errorType,
          code: err.providerType || null,
          param: null,
        },
      }, status as any);
    }

    return c.json({
      error: {
        message: err.message || 'An unexpected error occurred',
        type: 'internal_error',
        code: null,
        param: null,
      },
    }, status as any);
  });

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Models endpoint
  app.get('/v1/models', (c) => {
    return c.json({
      object: 'list',
      data: [
        { id: 'openai', object: 'model', owned_by: 'provider-proxy' },
        { id: 'anthropic', object: 'model', owned_by: 'provider-proxy' },
        { id: 'gemini', object: 'model', owned_by: 'provider-proxy' },
        { id: 'codex', object: 'model', owned_by: 'provider-proxy' },
      ],
    });
  });

  // --- Admin auth routes (no auth required) ---
  if (adminPassword && jwtSecret) {
    app.route('/admin', createAuthRoutes(adminPassword, jwtSecret));
    app.route('/admin', createAdminPages(jwtSecret));
  }

  // --- Protected admin config routes ---
  if (jwtSecret) {
    app.use('/v1/config/*', adminAuth(jwtSecret));
  }

  // --- Admin: Provider instance management (requires D1) ---

  // List all instances (no api_key in response)
  app.get('/v1/config/providers', async (c) => {
    if (!db) return c.json({ error: 'D1 not available' }, 501);
    const type = c.req.query('type');
    const instances = await listInstances(db, type);
    const safe = instances.map(({ apiKey, ...rest }) => rest);
    return c.json({ instances: safe });
  });

  // Create instance
  app.post('/v1/config/providers', async (c) => {
    if (!db) return c.json({ error: 'D1 not available' }, 501);
    const body = await c.req.json();
    const instance = await createInstance(db, {
      type: body.type,
      name: body.name,
      apiKey: body.api_key,
      baseUrl: body.base_url,
      weight: body.weight,
      cooldownSeconds: body.cooldown_seconds,
    });
    const { apiKey, ...safe } = instance;
    return c.json({ instance: safe }, 201);
  });

  // Get instance
  app.get('/v1/config/providers/:id', async (c) => {
    if (!db) return c.json({ error: 'D1 not available' }, 501);
    const id = c.req.param('id');
    const instance = await getInstance(db, id);
    if (!instance) return c.json({ error: `Instance not found: ${id}` }, 404);
    const { apiKey, ...safe } = instance;
    return c.json({ instance: safe });
  });

  // Update instance
  app.put('/v1/config/providers/:id', async (c) => {
    if (!db) return c.json({ error: 'D1 not available' }, 501);
    const id = c.req.param('id');
    const body = await c.req.json();
    await updateInstance(db, id, {
      name: body.name,
      apiKey: body.api_key,
      baseUrl: body.base_url,
      weight: body.weight,
      enabled: body.enabled,
      cooldownSeconds: body.cooldown_seconds,
    });
    return c.json({ ok: true });
  });

  // Delete instance
  app.delete('/v1/config/providers/:id', async (c) => {
    if (!db) return c.json({ error: 'D1 not available' }, 501);
    const id = c.req.param('id');
    await deleteInstance(db, id);
    return c.json({ ok: true });
  });

  // Cooldown management
  app.post('/v1/config/providers/:id/cooldown', async (c) => {
    if (!db) return c.json({ error: 'D1 not available' }, 501);
    const id = c.req.param('id');
    const body = await c.req.json();
    if (body.clear) {
      await clearCooldown(db, id);
    } else {
      await setCooldown(db, id, body.seconds || 60);
    }
    return c.json({ ok: true });
  });

  app.post('/v1/config/init', async (c) => {
    if (!db) return c.json({ error: 'D1 not available' }, 501);
    await ensureSchema(db);
    return c.json({ ok: true });
  });

  // --- API key management routes (protected by adminAuth via /v1/config/* above) ---
  if (db) {
    app.route('/v1/config/api-keys', createApiKeyRoutes(db));
  }

  // --- Main chat completions endpoint ---
  if (db) {
    app.use('/v1/chat/completions', apiKeyAuth(db));
  }

  app.post('/v1/chat/completions', validateRequest, async (c) => {
    const body = c.get('body') as Record<string, unknown>;
    const providerType = body.type as ProviderType;
    const model = body.model as string;
    const isStream = body.stream === true;

    // Select instance via weighted routing
    const candidates = config.instances.filter(
      (inst) => inst.type === providerType && inst.enabled,
    );

    const selected = selectInstanceOrSoonest(candidates, new Date());

    if (!selected) {
      throw new ProviderError(
        `No available instances for provider: ${providerType}. Configure via /v1/config/providers.`,
        503,
        providerType,
      );
    }

    if (!selected.apiKey) {
      throw new ProviderError(
        `No API key configured for provider: ${providerType}. Set ${providerType.toUpperCase()}_API_KEY env var or configure via /v1/config/providers.`,
        401,
        providerType,
      );
    }

    // Build ProviderConfig from selected instance
    const providerConfig: ProviderConfig = {
      apiKey: selected.apiKey,
      baseUrl: selected.baseUrl,
    };

    // Get adapter
    const adapter = getAdapter(providerType, providerConfig);

    // Convert request if not openai
    let requestBody: Record<string, unknown>;
    if (providerType === 'openai') {
      // Passthrough — strip the `type` field
      const { type, ...rest } = body;
      requestBody = rest;
    } else {
      // Convert from OpenAI format to provider format
      requestBody = registry.transformRequest('openai', providerType, body, model, isStream);
    }

    logger.debug(`→ ${providerType}/${model} [${selected.id}:${selected.name}]`, isStream ? '(stream)' : '(sync)');

    // Execute upstream request
    const upstreamResponse = await adapter.execute(requestBody, model, { stream: isStream });

    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text();
      logger.error(`Upstream error (${providerType}/${selected.id}):`, upstreamResponse.status, errorText);

      // Set cooldown on 429 or 5xx
      if (db && (upstreamResponse.status === 429 || upstreamResponse.status >= 500)) {
        const cooldownPromise = setCooldown(db, selected.id, selected.cooldownSeconds);
        if (waitUntil) {
          waitUntil(cooldownPromise);
        } else {
          await cooldownPromise;
        }
      }

      const overflow = isContextOverflow(errorText);
      throw new ProviderError(
        `Upstream ${providerType} error: ${errorText}`,
        upstreamResponse.status,
        providerType,
        upstreamResponse.status,
        overflow,
      );
    }

    // Handle streaming response
    if (isStream) {
      return handleStreamResponse(c, upstreamResponse, providerType, body);
    }

    // Handle non-streaming response
    return handleSyncResponse(c, upstreamResponse, providerType);
  });

  return app;
}

async function handleSyncResponse(
  c: any,
  upstreamResponse: Response,
  providerType: ProviderType,
) {
  const responseBody = await upstreamResponse.json();

  if (providerType === 'openai') {
    return c.json(responseBody);
  }

  const converted = registry.transformResponse(providerType, 'openai', responseBody as Record<string, unknown>);
  return c.json(converted);
}

async function handleStreamResponse(
  c: any,
  upstreamResponse: Response,
  providerType: ProviderType,
  originalBody: Record<string, unknown>,
) {
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');

  if (providerType === 'openai') {
    // Passthrough streaming
    const reader = upstreamResponse.body?.getReader();
    if (!reader) {
      throw new ProviderError('No response body from upstream', 502, providerType);
    }

    return stream(c, async (s) => {
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await s.write(decoder.decode(value, { stream: true }));
        }
      } finally {
        reader.releaseLock();
      }
    });
  }

  // Converting stream
  const state = createTransformState();
  state.model = originalBody.model as string;

  // For codex, populate tool name map from the converted request
  if (providerType === 'codex' && originalBody.__toolNameMap) {
    const map = originalBody.__toolNameMap as Record<string, string>;
    for (const [k, v] of Object.entries(map)) {
      state.toolNameMap.set(k, v);
    }
  }

  const reader = upstreamResponse.body?.getReader();
  if (!reader) {
    throw new ProviderError('No response body from upstream', 502, providerType);
  }

  return stream(c, async (s) => {
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete last line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          const converted = registry.transformStreamChunk(providerType, 'openai', line, state);
          if (converted) {
            await s.write(converted);
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        const converted = registry.transformStreamChunk(providerType, 'openai', buffer, state);
        if (converted) {
          await s.write(converted);
        }
      }
    } finally {
      reader.releaseLock();
    }
  });
}
