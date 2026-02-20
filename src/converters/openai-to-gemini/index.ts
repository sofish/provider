import { registry } from '../registry.js';
import { OpenAIToGeminiRequest } from './request.js';
import { GeminiToOpenAIResponse } from './response.js';
import { transformGeminiStreamChunk } from './stream.js';
import type { TransformState } from '../types.js';

const responseTransformer = new GeminiToOpenAIResponse();
responseTransformer.transformChunk = (chunk: string, state: TransformState): string | null => {
  return transformGeminiStreamChunk(chunk, state);
};

registry.register('openai', 'gemini', new OpenAIToGeminiRequest(), responseTransformer);
