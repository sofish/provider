import type { ProviderType } from '../types/index.js';

export interface RequestTransformer {
  transform(body: Record<string, unknown>, model: string, stream: boolean): Record<string, unknown>;
}

export interface ResponseTransformer {
  transform(body: Record<string, unknown>): Record<string, unknown>;
  transformChunk(chunk: string, state: TransformState): string | null;
}

export interface ToolCallState {
  index: number;
  id: string;
  name: string;
  arguments: string;
}

export interface TransformState {
  messageId: string;
  model: string;
  currentIndex: number;
  toolCalls: ToolCallState[];
  buffer: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  // Provider-specific state
  blockType: string;
  blockIndex: number;
  toolNameMap: Map<string, string>;
  extra: Record<string, unknown>;
}

export function createTransformState(): TransformState {
  return {
    messageId: '',
    model: '',
    currentIndex: 0,
    toolCalls: [],
    buffer: '',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    blockType: '',
    blockIndex: -1,
    toolNameMap: new Map(),
    extra: {},
  };
}

export interface ConverterPair {
  from: ProviderType;
  to: ProviderType;
  request: RequestTransformer;
  response: ResponseTransformer;
}
