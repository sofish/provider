export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'codex';

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
}

export interface ProviderInstance {
  id: string;
  type: ProviderType;
  name: string;
  apiKey: string;
  baseUrl: string;
  weight: number;
  enabled: boolean;
  cooldownUntil: string | null;
  cooldownSeconds: number;
  createdAt: string;
  updatedAt: string;
}
