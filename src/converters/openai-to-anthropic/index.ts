import { registry } from '../registry.js';
import { OpenAIToAnthropicRequest } from './request.js';
import { AnthropicToOpenAIResponse } from './response.js';
import { transformAnthropicStreamChunk } from './stream.js';
import type { TransformState } from '../types.js';

// Create a combined response transformer that delegates streaming to the stream module
const responseTransformer = new AnthropicToOpenAIResponse();
const originalTransformChunk = responseTransformer.transformChunk.bind(responseTransformer);

// Override transformChunk to use the dedicated stream transformer
responseTransformer.transformChunk = (chunk: string, state: TransformState): string | null => {
  return transformAnthropicStreamChunk(chunk, state);
};

// Self-register
registry.register('openai', 'anthropic', new OpenAIToAnthropicRequest(), responseTransformer);
