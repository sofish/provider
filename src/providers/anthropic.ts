import { BaseProviderAdapter, type ExecuteOptions } from './base.js';

export class AnthropicAdapter extends BaseProviderAdapter {
  async execute(body: Record<string, unknown>, _model: string, options: ExecuteOptions): Promise<Response> {
    const url = `${this.config.baseUrl}/v1/messages`;
    return this.doFetch(url, body, {
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2023-06-01',
      ...options.headers,
    });
  }
}
