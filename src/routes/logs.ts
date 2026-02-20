import { Hono } from 'hono';
import type { D1Database } from '../db/index.js';
import { getRequestLogs, getUsageSummary } from '../db/request-logs.js';

export function createLogRoutes(db: D1Database) {
  const app = new Hono();

  // GET / — paginated request logs
  app.get('/', async (c) => {
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);
    const provider = c.req.query('provider');
    const model = c.req.query('model');
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');

    const { logs, total } = await getRequestLogs(db, {
      limit, offset, provider, model, startDate, endDate,
    });

    return c.json({ logs, total });
  });

  // GET /summary — aggregated usage summary
  app.get('/summary', async (c) => {
    const daysParam = c.req.query('days');
    const days = daysParam ? parseInt(daysParam, 10) : undefined;

    const summary = await getUsageSummary(db, { days });
    return c.json({ summary });
  });

  return app;
}
