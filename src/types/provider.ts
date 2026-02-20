export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'codex';

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
}
