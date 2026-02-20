import type { D1Database } from './index.js';

function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export interface RequestLogData {
  provider: string;
  model: string;
  instanceId?: string;
  apiKeyId?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  durationMs: number;
  status: number;
  stream: boolean;
}

export async function logRequest(db: D1Database, data: RequestLogData): Promise<void> {
  const id = generateId();
  await db.prepare(
    `INSERT INTO request_logs (id, provider, model, instance_id, api_key_id, prompt_tokens, completion_tokens, total_tokens, cost, duration_ms, status, stream)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    data.provider,
    data.model,
    data.instanceId || null,
    data.apiKeyId || null,
    data.promptTokens,
    data.completionTokens,
    data.totalTokens,
    data.cost,
    data.durationMs,
    data.status,
    data.stream ? 1 : 0,
  ).run();
}

export interface GetRequestLogsOpts {
  limit?: number;
  offset?: number;
  provider?: string;
  model?: string;
  startDate?: string;
  endDate?: string;
}

interface RequestLogRow {
  id: string;
  provider: string;
  model: string;
  instance_id: string | null;
  api_key_id: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
  duration_ms: number;
  status: number;
  stream: number;
  created_at: string;
}

export async function getRequestLogs(db: D1Database, opts: GetRequestLogsOpts = {}) {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.provider) {
    conditions.push('provider = ?');
    params.push(opts.provider);
  }
  if (opts.model) {
    conditions.push('model = ?');
    params.push(opts.model);
  }
  if (opts.startDate) {
    conditions.push('created_at >= ?');
    params.push(opts.startDate);
  }
  if (opts.endDate) {
    conditions.push('created_at <= ?');
    params.push(opts.endDate);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts.limit || 50;
  const offset = opts.offset || 0;

  const countResult = await db.prepare(
    `SELECT COUNT(*) as total FROM request_logs ${where}`
  ).bind(...params).first<{ total: number }>();

  const result = await db.prepare(
    `SELECT * FROM request_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset).all<RequestLogRow>();

  return {
    logs: result.results,
    total: countResult?.total || 0,
  };
}

export interface GetUsageSummaryOpts {
  days?: number;
}

export async function getUsageSummary(db: D1Database, opts: GetUsageSummaryOpts = {}) {
  let where = '';
  const params: unknown[] = [];

  if (opts.days) {
    where = `WHERE created_at >= datetime('now', '-' || ? || ' days')`;
    params.push(opts.days);
  }

  const result = await db.prepare(
    `SELECT provider, model,
       COUNT(*) as requests,
       SUM(prompt_tokens) as prompt_tokens,
       SUM(completion_tokens) as completion_tokens,
       SUM(total_tokens) as total_tokens,
       SUM(cost) as cost
     FROM request_logs ${where}
     GROUP BY provider, model
     ORDER BY requests DESC`
  ).bind(...params).all();

  return result.results;
}
