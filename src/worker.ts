import { createApp } from './server.js';
import { loadConfigFromEnv } from './config.js';
import { loadProvidersFromD1, ensureSchema } from './db/index.js';
import { setDebug } from './utils/logger.js';
import type { Env } from './env.js';
import type { ProviderType } from './types/provider.js';

// Import converters to trigger registration
import './converters/index.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    setDebug(!!env.DEBUG);

    // Build config: start with env secrets, overlay D1 values
    const config = loadConfigFromEnv(env);

    if (env.DB) {
      try {
        const d1Providers = await loadProvidersFromD1(env.DB);
        for (const [type, providerConfig] of Object.entries(d1Providers)) {
          const t = type as ProviderType;
          // D1 key takes priority if non-empty, otherwise keep env secret
          if (providerConfig.apiKey) {
            config.providers[t].apiKey = providerConfig.apiKey;
          }
          if (providerConfig.baseUrl) {
            config.providers[t].baseUrl = providerConfig.baseUrl;
          }
        }
      } catch {
        // D1 not initialized yet — fall through to env-only config
      }
    }

    const app = createApp(config, env.DB);
    return app.fetch(request);
  },
};
