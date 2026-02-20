import { BaseProviderAdapter, type ExecuteOptions } from './base.js';

export class OpenAIAdapter extends BaseProviderAdapter {
  async execute(body: Record<string, unknown>, _model: string, options: ExecuteOptions): Promise<Response> {
    const url = `${this.config.baseUrl}/v1/chat/completions`;
    return this.doFetch(url, body, {
      'Authorization': `Bearer ${this.config.apiKey}`,
      ...options.headers,
    });
  }
}
