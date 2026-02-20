import type { ProviderType } from '../types/index.js';
import type { RequestTransformer, ResponseTransformer, TransformState } from './types.js';
import { createTransformState } from './types.js';

class ConverterRegistry {
  private requestTransformers = new Map<string, RequestTransformer>();
  private responseTransformers = new Map<string, ResponseTransformer>();

  private key(from: ProviderType, to: ProviderType): string {
    return `${from}:${to}`;
  }

  register(
    from: ProviderType,
    to: ProviderType,
    request: RequestTransformer,
    response: ResponseTransformer,
  ): void {
    const k = this.key(from, to);
    this.requestTransformers.set(k, request);
    this.responseTransformers.set(k, response);
  }

  transformRequest(
    from: ProviderType,
    to: ProviderType,
    body: Record<string, unknown>,
    model: string,
    stream: boolean,
  ): Record<string, unknown> {
    const transformer = this.requestTransformers.get(this.key(from, to));
    if (!transformer) {
      throw new Error(`No request transformer registered for ${from} -> ${to}`);
    }
    return transformer.transform(body, model, stream);
  }

  transformResponse(
    from: ProviderType,
    to: ProviderType,
    body: Record<string, unknown>,
  ): Record<string, unknown> {
    const transformer = this.responseTransformers.get(this.key(from, to));
    if (!transformer) {
      throw new Error(`No response transformer registered for ${from} -> ${to}`);
    }
    return transformer.transform(body);
  }

  transformStreamChunk(
    from: ProviderType,
    to: ProviderType,
    chunk: string,
    state: TransformState,
  ): string | null {
    const transformer = this.responseTransformers.get(this.key(from, to));
    if (!transformer) {
      throw new Error(`No stream transformer registered for ${from} -> ${to}`);
    }
    return transformer.transformChunk(chunk, state);
  }

  hasConverter(from: ProviderType, to: ProviderType): boolean {
    return this.requestTransformers.has(this.key(from, to));
  }

  createState(): TransformState {
    return createTransformState();
  }
}

export const registry = new ConverterRegistry();
