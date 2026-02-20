import type { ProviderConfig } from '../types/provider.js';

export interface ExecuteOptions {
  stream: boolean;
  headers?: Record<string, string>;
}

export abstract class BaseProviderAdapter {
  constructor(protected config: ProviderConfig) {}

  abstract execute(
    body: Record<string, unknown>,
    model: string,
    options: ExecuteOptions,
  ): Promise<Response>;

  protected async doFetch(url: string, body: Record<string, unknown>, headers: Record<string, string>): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }
}
