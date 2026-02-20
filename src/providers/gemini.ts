import { BaseProviderAdapter, type ExecuteOptions } from './base.js';

export class GeminiAdapter extends BaseProviderAdapter {
  async execute(body: Record<string, unknown>, model: string, options: ExecuteOptions): Promise<Response> {
    const action = options.stream ? 'streamGenerateContent' : 'generateContent';
    const alt = options.stream ? '&alt=sse' : '';
    const url = `${this.config.baseUrl}/v1beta/models/${model}:${action}?key=${this.config.apiKey}${alt}`;
    return this.doFetch(url, body, {
      ...options.headers,
    });
  }
}
