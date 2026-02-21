import { createApp } from './server.js';
import { loadConfigFromEnv } from './config.js';
import { loadInstancesFromD1, ensureSchema } from './db/index.js';
import { setDebug } from './utils/logger.js';
import type { Env } from './env.js';
import type { ProviderType } from './types/provider.js';

// Import converters to trigger registration
import './converters/index.js';

interface ExecutionCtx {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionCtx): Promise<Response> {
    setDebug(!!env.DEBUG);

    // Validate required secrets
    if (!env.ADMIN_PASSWORD || !env.JWT_SECRET) {
      return new Response(
        JSON.stringify({ error: 'Server misconfigured: ADMIN_PASSWORD and JWT_SECRET must be set' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Build config: start with env secrets, overlay D1 instances
    const config = loadConfigFromEnv(env);

    if (env.DB) {
      try {
        const d1Instances = await loadInstancesFromD1(env.DB);

        if (d1Instances.length > 0) {
          // Determine which types have D1 instances
          const d1Types = new Set(d1Instances.map((inst) => inst.type));

          // Remove env-var instances for types that have D1 entries
          config.instances = config.instances.filter(
            (inst) => !d1Types.has(inst.type),
          );

          // Add all D1 instances
          config.instances.push(...d1Instances);

          // Also update the providers record for backward compat
          for (const inst of d1Instances) {
            if (inst.apiKey && inst.enabled) {
              const t = inst.type as ProviderType;
              config.providers[t] = {
                apiKey: inst.apiKey,
                baseUrl: inst.baseUrl,
              };
            }
          }
        }
      } catch {
        // D1 not initialized yet — fall through to env-only config
      }
    }

    const app = createApp({
      config,
      db: env.DB,
      adminPassword: env.ADMIN_PASSWORD,
      jwtSecret: env.JWT_SECRET,
      waitUntil: ctx.waitUntil.bind(ctx),
    });
    return app.fetch(request, env, ctx as unknown as import('hono').ExecutionContext);
  },
};
