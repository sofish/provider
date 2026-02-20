interface ModelPricing {
  input: number;  // price per million tokens
  output: number; // price per million tokens
}

const PRICING: Record<string, Record<string, ModelPricing>> = {
  openai: {
    'gpt-4o': { input: 2.5, output: 10 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'gpt-4.1': { input: 2, output: 8 },
    'gpt-4.1-mini': { input: 0.4, output: 1.6 },
    'gpt-4.1-nano': { input: 0.1, output: 0.4 },
    'o1': { input: 15, output: 60 },
    'o3': { input: 10, output: 40 },
    'o3-mini': { input: 1.1, output: 4.4 },
    'o4-mini': { input: 1.1, output: 4.4 },
  },
  anthropic: {
    'claude-sonnet-4': { input: 3, output: 15 },
    'claude-opus-4': { input: 15, output: 75 },
    'claude-haiku-3.5': { input: 0.8, output: 4 },
  },
  gemini: {
    'gemini-2.5-pro': { input: 1.25, output: 10 },
    'gemini-2.5-flash': { input: 0.15, output: 0.6 },
    'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  },
  codex: {
    'codex-mini': { input: 1.5, output: 6 },
  },
};

export function calculateCost(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const providerPricing = PRICING[provider];
  if (!providerPricing) return 0;

  // Try exact match first, then prefix match
  let pricing = providerPricing[model];
  if (!pricing) {
    for (const [pattern, p] of Object.entries(providerPricing)) {
      if (model.startsWith(pattern)) {
        pricing = p;
        break;
      }
    }
  }

  if (!pricing) return 0;

  return (pricing.input * promptTokens + pricing.output * completionTokens) / 1_000_000;
}
