import { serve } from '@hono/node-server';
import { loadConfig } from './config.js';
import { createApp } from './server.js';
import { logger, setDebug } from './utils/logger.js';

// Import converters to trigger registration
import './converters/index.js';

setDebug(!!process.env.DEBUG);

const config = loadConfig();
const app = createApp(config);

serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info(`Server running on http://localhost:${info.port}`);
  logger.info('Providers:', Object.entries(config.providers)
    .filter(([, c]) => c.apiKey)
    .map(([k]) => k)
    .join(', ') || 'none configured');
});
