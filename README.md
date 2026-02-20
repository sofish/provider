# Provider

Unified AI API proxy gateway that runs on Cloudflare Workers. Send requests in OpenAI chat completions format with a `type` field, and Provider routes them to the right upstream (OpenAI, Anthropic, Gemini, Codex), converting formats both ways.

## Quick Start

### Cloudflare Workers (recommended)

```bash
npm install

# Create D1 database and initialize schema
npm run d1:create
npm run d1:init

# Set provider API keys as secrets
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put GEMINI_API_KEY

# Local dev
npm run dev:worker

# Deploy
npm run deploy
```

### Local Node.js

```bash
npm install
export ANTHROPIC_API_KEY=sk-...
npm run dev
```

## Usage

```bash
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 1024
  }'
```

The `type` field selects the provider. Everything else follows the OpenAI chat completions format.

### Supported Providers

| Type | Provider | Endpoint |
|------|----------|----------|
| `openai` | OpenAI | Passthrough, no conversion |
| `anthropic` | Anthropic Claude | Messages API |
| `gemini` | Google Gemini | generateContent API |
| `codex` | Codex | Responses API |

### Streaming

Set `"stream": true` to get SSE responses in OpenAI `chat.completion.chunk` format, regardless of the upstream provider.

### Thinking / Reasoning

Pass `"reasoning_effort": "high"` (or `low`, `medium`, `minimal`) and Provider maps it to provider-specific thinking config with tuned per-model token budgets. See [docs/workflow.md](docs/workflow.md) for the full budget table.

### Manage Provider Keys at Runtime

Store and update API keys via D1 without redeploying:

```bash
# Set a key
curl -X PUT https://your-worker.workers.dev/v1/config/providers/anthropic \
  -H "Content-Type: application/json" \
  -d '{"api_key": "sk-ant-..."}'

# List providers
curl https://your-worker.workers.dev/v1/config/providers
```

## Configuration

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `CODEX_API_KEY` | Codex API key |
| `*_BASE_URL` | Custom base URL per provider |
| `PORT` | Server port (Node.js only, default: 3000) |

Keys can be set as Wrangler Secrets, D1 records, or environment variables. D1 keys take priority over secrets.

## Scripts

```bash
npm run dev           # Local Node.js dev (tsx watch)
npm run dev:worker    # Local Cloudflare Workers dev (wrangler)
npm run deploy        # Deploy to Cloudflare Workers
npm run d1:create     # Create D1 database
npm run d1:init       # Initialize D1 schema (remote)
npm run d1:init:local # Initialize D1 schema (local)
npm run typecheck     # Type check
```

## Architecture

See [docs/workflow.md](docs/workflow.md) for the full request/response flow, provider-specific details, and project structure.
