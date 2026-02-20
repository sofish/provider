# Provider — Unified AI API Proxy Gateway

## Overview

Provider accepts requests in a unified format (OpenAI chat completions + a `type` field), converts them to the target provider's native format, forwards upstream, converts responses back, and returns unified OpenAI-format responses.

## Workflow

```
Client Request (OpenAI format + type field)
    │
    ▼
┌─────────────────────────┐
│  Validate Request       │  Check type, model, messages
│  (middleware/validate)   │
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│  Detect Provider        │  Extract `type` field from body
│  (server.ts)            │
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│  Convert Request        │  OpenAI → Provider native format
│  (converters/registry)  │  Includes: thinking budget resolution,
│                         │  tool call ID normalization
│                         │  (skip if type=openai)
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│  Forward Upstream       │  Provider adapter sends to API
│  (providers/*)          │
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│  Error Detection        │  Context overflow detection
│  (utils/overflow)       │  15+ provider-specific patterns
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│  Convert Response       │  Provider native → OpenAI format
│  (converters/registry)  │  Tool ID normalization on responses
│                         │  (skip if type=openai)
└─────────┬───────────────┘
          │
          ▼
Client Response (OpenAI format)
```

## Endpoints

| Method | Path                          | Description                     |
|--------|-------------------------------|---------------------------------|
| GET    | /health                       | Health check                    |
| GET    | /v1/models                    | List supported provider types   |
| POST   | /v1/chat/completions          | Main proxy endpoint             |
| GET    | /v1/config/providers          | List all provider configs       |
| GET    | /v1/config/providers/:type    | Get a provider config           |
| PUT    | /v1/config/providers/:type    | Create/update a provider config |
| DELETE | /v1/config/providers/:type    | Delete a provider config        |
| POST   | /v1/config/init               | Initialize D1 schema            |
| GET    | /v1/config/logs               | Paginated request logs          |
| GET    | /v1/config/logs/summary       | Aggregated usage summary        |

## Request Format

```json
{
  "type": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "stream": true,
  "max_tokens": 1024,
  "temperature": 0.7,
  "reasoning_effort": "high"
}
```

## Streaming

When `stream: true`, the proxy:
1. Sends the request to the upstream provider with streaming enabled
2. Reads the upstream SSE stream chunk by chunk
3. Converts each chunk from provider format to OpenAI `chat.completion.chunk` format
4. Forwards the converted SSE events to the client

## Key Modules

### Thinking Budget Resolution (`converters/thinking.ts`)

Per-provider/per-model thinking budget tables replace crude percentage-based budgets:

| Provider | Model | minimal | low | medium | high |
|----------|-------|---------|-----|--------|------|
| Anthropic (default) | Pre-4.6 models | 1024 | 2048 | 8192 | 16384 |
| Anthropic | Opus/Sonnet 4.6+ | Adaptive thinking with `output_config.effort` ||||
| Gemini | 2.5-pro | 128 | 2048 | 8192 | 32768 |
| Gemini | 2.5-flash | 128 | 2048 | 8192 | 24576 |
| Gemini | 3.x | Level-based: `MINIMAL` / `LOW` / `MEDIUM` / `HIGH` ||||
| Codex | All | Effort string passthrough (`reasoning.effort`) ||||

Safety: if `maxTokens <= thinkingBudget`, budget is reduced to leave at least 1024 tokens for output.

### Tool Call ID Normalization (`utils/tool-id.ts`)

Normalizes tool call IDs across providers:
- Strips Codex composite `callId|itemId` pipe separator
- Replaces characters outside `[a-zA-Z0-9_-]` with `_`
- Truncates to 64 chars (Anthropic/Gemini max)
- Generates safe fallback IDs when missing

Applied on both request conversion (outbound) and response conversion (inbound).

### Context Overflow Detection (`utils/overflow.ts`)

Detects 15+ provider-specific error patterns indicating context overflow:
- Anthropic: "prompt is too long"
- OpenAI: "exceeds the context window"
- Gemini: "input token count exceeds the maximum"
- Bedrock, Grok, Groq, OpenRouter, and generic patterns

When detected, the error response uses `type: "context_overflow"` instead of generic `provider_error`.

## Request Logging & Cost Tracking

Every `/v1/chat/completions` request is logged to D1 via `waitUntil` (fire-and-forget, zero latency impact). Each log entry records:

- **Provider & model** — which provider instance handled the request
- **Token counts** — prompt, completion, and total tokens
- **Cost** — calculated from a built-in pricing table (`src/pricing.ts`)
- **Duration** — end-to-end response time in milliseconds
- **Stream flag** — whether the request used streaming

### Admin Dashboard

The admin dashboard (`/admin/dashboard`) includes:
- **Usage Summary** — aggregated request counts, token totals, and cost per provider/model, filterable by time range (7/30/90 days or all time)
- **Request Logs** — individual request entries with pagination and filters (provider, model, date range)

### API Endpoints

**`GET /v1/config/logs`** — Paginated request logs.

Query params: `limit`, `offset`, `provider`, `model`, `start_date`, `end_date`.

```json
{ "logs": [...], "total": 142 }
```

**`GET /v1/config/logs/summary`** — Aggregated usage by provider/model.

Query params: `days` (e.g. `?days=7`).

```json
{
  "summary": [
    { "provider": "anthropic", "model": "claude-sonnet-4-20250514", "requests": 85, "prompt_tokens": 120000, "completion_tokens": 45000, "total_tokens": 165000, "cost": 1.035 }
  ]
}
```

### Pricing

Built-in pricing covers OpenAI (gpt-4o, gpt-4.1, o1, o3, o4-mini, etc.), Anthropic (claude-sonnet-4, claude-opus-4, claude-haiku-3.5), Gemini (2.5-pro, 2.5-flash, 2.0-flash), and Codex (codex-mini). Unknown models log with cost = 0. Update `src/pricing.ts` to add new models.

## Provider-Specific Details

### OpenAI (type: "openai")
- **Passthrough** — no conversion needed
- Auth: `Authorization: Bearer <key>`
- Endpoint: `/v1/chat/completions`

### Anthropic (type: "anthropic")
- Converts to/from Claude Messages API format
- Auth: `x-api-key: <key>`, `anthropic-version: 2023-06-01`
- Endpoint: `/v1/messages`
- Key mappings:
  - `system`/`developer` roles → Claude `system` field
  - `tool` role → `tool_result` content block in user message
  - `reasoning_effort` → per-model thinking config via budget tables
  - Opus/Sonnet 4.6+: adaptive thinking with `output_config.effort`
  - Finish reasons: `end_turn`→`stop`, `tool_use`→`tool_calls`

### Gemini (type: "gemini")
- Converts to/from Gemini generateContent format
- Auth: `key=<key>` query parameter
- Endpoint: `/v1beta/models/{model}:generateContent` (or `streamGenerateContent`)
- Key mappings:
  - `system` role → `systemInstruction`
  - `assistant` role → `model` role
  - `reasoning_effort` → per-model thinking config (level-based for 3.x, budget for 2.5)
  - Tools → `functionDeclarations`
  - Finish reasons: `STOP`→`stop`, `MAX_TOKENS`→`length`

### Codex (type: "codex")
- Converts to/from OpenAI Responses API format
- Auth: `Authorization: Bearer <key>`
- Endpoint: `/v1/responses`
- Key mappings:
  - Messages → `input` array with typed items
  - `system` role → `developer` role
  - Tool names shortened to max 64 chars
  - `reasoning_effort` → `reasoning.effort`
  - Finish reasons: `completed`→`stop`

## Deployment

### Local (Node.js)

```bash
npm run dev          # Start with file watching (tsx)
npm start            # Start without watching
```

### Cloudflare Workers

```bash
npm run d1:create    # Create D1 database (once)
npm run d1:init      # Initialize schema (once)
npm run dev:worker   # Local dev with Wrangler
npm run deploy       # Deploy to Cloudflare
```

Set API keys as secrets:
```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put GEMINI_API_KEY
```

Or manage keys at runtime via the admin API:
```bash
curl -X PUT https://your-worker.workers.dev/v1/config/providers/anthropic \
  -H "Content-Type: application/json" \
  -d '{"api_key": "sk-ant-...", "base_url": "https://api.anthropic.com"}'
```

### Why Cloudflare Workers

- **CPU time is not an issue** — I/O wait (upstream AI provider latency) doesn't count toward CPU billing. Typical request uses ~50ms CPU.
- **SSE streaming works natively** — Workers support ReadableStream responses and streaming fetch bodies.
- **No wall-clock limit** for HTTP requests — long AI model responses stream for as long as needed.
- **D1 for config storage** — Provider API keys stored in D1 with in-memory caching (1-min TTL). Falls back to Wrangler Secrets.
- **No Durable Objects needed** — each request is stateless; plain Workers handle SSE proxying directly.

## Configuration

### Environment variables (Node.js)
- `PORT` — Server port (default: 3000)
- `OPENAI_API_KEY` — OpenAI API key
- `ANTHROPIC_API_KEY` — Anthropic API key
- `GEMINI_API_KEY` — Google Gemini API key
- `CODEX_API_KEY` — Codex API key
- `*_BASE_URL` — Custom base URLs for each provider
- `DEBUG` — Enable debug logging

### Cloudflare Workers bindings
- `DB` — D1 database binding for provider config storage
- Same `*_API_KEY` and `*_BASE_URL` vars as Wrangler Secrets (fallback when D1 key is empty)

## Project Structure

```
src/
├── config.ts                 # Configuration (env vars + Cloudflare env)
├── env.ts                    # Cloudflare Workers Env type
├── index.ts                  # Node.js entry point (tsx)
├── worker.ts                 # Cloudflare Workers entry point
├── server.ts                 # Hono app, routing, admin API, error handling
├── pricing.ts                # Per-model token pricing table
├── db/
│   ├── index.ts              # D1 helpers (CRUD, caching)
│   ├── schema.sql            # D1 schema
│   ├── api-keys.ts           # API key management
│   └── request-logs.ts       # Request log insert & queries
├── converters/
│   ├── index.ts              # Converter registration
│   ├── registry.ts           # ConverterRegistry
│   ├── types.ts              # Transformer interfaces
│   ├── sse.ts                # SSE utilities
│   ├── thinking.ts           # Per-provider thinking budget tables
│   ├── openai-to-anthropic/  # OpenAI ↔ Claude converters
│   ├── openai-to-gemini/     # OpenAI ↔ Gemini converters
│   └── openai-to-codex/      # OpenAI ↔ Codex converters
├── types/                    # TypeScript interfaces
│   ├── anthropic.ts, gemini.ts, codex.ts, unified.ts
│   ├── errors.ts             # ProviderError with overflow support
│   └── provider.ts
├── providers/                # Upstream provider adapters
│   ├── base.ts, anthropic.ts, gemini.ts, openai.ts, codex.ts
│   └── index.ts
├── routes/
│   ├── api-keys.ts           # API key admin routes
│   ├── auth.ts               # Auth login/logout routes
│   └── logs.ts               # Request log & usage summary routes
├── admin/
│   └── pages.ts              # Admin dashboard HTML pages
├── middleware/
│   ├── auth.ts               # Admin JWT & API key auth
│   ├── validate.ts           # Request validation
│   └── error-handler.ts
└── utils/
    ├── id.ts                 # ID generation
    ├── tool-id.ts            # Tool call ID normalization
    ├── overflow.ts           # Context overflow detection
    └── logger.ts
```
