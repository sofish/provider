import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import type { AppConfig } from './config.js';
import type { ProviderType } from './types/provider.js';
import { ProviderError } from './types/errors.js';
import type { ProviderErrorType } from './types/errors.js';
import { registry, createTransformState } from './converters/index.js';
import { getAdapter } from './providers/index.js';
import { validateRequest } from './middleware/index.js';
import { logger } from './utils/logger.js';
import { isContextOverflow } from './utils/overflow.js';
import type { D1Database } from './db/index.js';
import { upsertProvider, listProviders, getProvider, deleteProvider, ensureSchema } from './db/index.js';

type HonoEnv = { Variables: { body: Record<string, unknown> } };

export function createApp(config: AppConfig, db?: D1Database) {
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

  // --- Admin: Provider config management (requires D1) ---

  app.get('/v1/config/providers', async (c) => {
    if (!db) return c.json({ error: 'D1 not available' }, 501);
    const providers = await listProviders(db);
    return c.json({ providers });
  });

  app.get('/v1/config/providers/:type', async (c) => {
    if (!db) return c.json({ error: 'D1 not available' }, 501);
    const type = c.req.param('type');
    const provider = await getProvider(db, type);
    if (!provider) return c.json({ error: `Provider not found: ${type}` }, 404);
    return c.json({ provider });
  });

  app.put('/v1/config/providers/:type', async (c) => {
    if (!db) return c.json({ error: 'D1 not available' }, 501);
    const type = c.req.param('type');
    const body = await c.req.json();
    await upsertProvider(db, type, body.api_key, body.base_url, body.enabled);
    return c.json({ ok: true });
  });

  app.delete('/v1/config/providers/:type', async (c) => {
    if (!db) return c.json({ error: 'D1 not available' }, 501);
    const type = c.req.param('type');
    await deleteProvider(db, type);
    return c.json({ ok: true });
  });

  app.post('/v1/config/init', async (c) => {
    if (!db) return c.json({ error: 'D1 not available' }, 501);
    await ensureSchema(db);
    return c.json({ ok: true });
  });

  // --- Main chat completions endpoint ---

  app.post('/v1/chat/completions', validateRequest, async (c) => {
    const body = c.get('body') as Record<string, unknown>;
    const providerType = body.type as ProviderType;
    const model = body.model as string;
    const isStream = body.stream === true;

    // Validate API key
    const providerConfig = config.providers[providerType];
    if (!providerConfig.apiKey) {
      throw new ProviderError(
        `No API key configured for provider: ${providerType}. Set ${providerType.toUpperCase()}_API_KEY env var or configure via /v1/config/providers.`,
        401,
        providerType,
      );
    }

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

    logger.debug(`→ ${providerType}/${model}`, isStream ? '(stream)' : '(sync)');

    // Execute upstream request
    const upstreamResponse = await adapter.execute(requestBody, model, { stream: isStream });

    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text();
      logger.error(`Upstream error (${providerType}):`, upstreamResponse.status, errorText);
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
