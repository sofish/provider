import { registry } from '../registry.js';
import { OpenAIToCodexRequest } from './request.js';
import { CodexToOpenAIResponse } from './response.js';
import { transformCodexStreamChunk } from './stream.js';
import type { TransformState } from '../types.js';

const responseTransformer = new CodexToOpenAIResponse();
responseTransformer.transformChunk = (chunk: string, state: TransformState): string | null => {
  return transformCodexStreamChunk(chunk, state);
};

registry.register('openai', 'codex', new OpenAIToCodexRequest(), responseTransformer);
