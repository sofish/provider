import type { ProviderType, ProviderConfig } from '../types/provider.js';
import type { BaseProviderAdapter } from './base.js';
import { OpenAIAdapter } from './openai.js';
import { AnthropicAdapter } from './anthropic.js';
import { GeminiAdapter } from './gemini.js';
import { CodexAdapter } from './codex.js';

type AdapterFactory = (config: ProviderConfig) => BaseProviderAdapter;

const factories = new Map<ProviderType, AdapterFactory>([
  ['openai', (config) => new OpenAIAdapter(config)],
  ['anthropic', (config) => new AnthropicAdapter(config)],
  ['gemini', (config) => new GeminiAdapter(config)],
  ['codex', (config) => new CodexAdapter(config)],
]);

export function getAdapter(type: ProviderType, config: ProviderConfig): BaseProviderAdapter {
  const factory = factories.get(type);
  if (!factory) {
    throw new Error(`Unknown provider type: ${type}`);
  }
  return factory(config);
}

export { BaseProviderAdapter } from './base.js';
