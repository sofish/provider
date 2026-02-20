import { BaseProviderAdapter, type ExecuteOptions } from './base.js';

export class CodexAdapter extends BaseProviderAdapter {
  async execute(body: Record<string, unknown>, _model: string, options: ExecuteOptions): Promise<Response> {
    // Remove internal tool name map before sending upstream
    const { __toolNameMap, ...cleanBody } = body;

    const url = `${this.config.baseUrl}/v1/responses`;
    return this.doFetch(url, cleanBody, {
      'Authorization': `Bearer ${this.config.apiKey}`,
      ...options.headers,
    });
  }
}
