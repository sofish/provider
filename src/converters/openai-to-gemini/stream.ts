import type { TransformState } from '../types.js';
import type { GeminiResponse, GeminiPart } from '../../types/gemini.js';
import type { UnifiedStreamChunk, OpenAIMessage } from '../../types/unified.js';
import { parseSSE, formatSSE, formatDone } from '../sse.js';
import { generateId } from '../../utils/id.js';

/**
 * Transform Gemini streaming chunks to OpenAI SSE format.
 * Gemini streams JSON objects (possibly SSE-wrapped or raw JSON lines).
 */
export function transformGeminiStreamChunk(chunk: string, state: TransformState): string | null {
  const results: string[] = [];
  const lines = chunk.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Try SSE format first
    const { done, data } = parseSSE(trimmed);
    if (done) {
      results.push(formatDone());
      continue;
    }

    const jsonStr = data || trimmed;

    // Skip non-JSON lines (e.g., array brackets from Gemini's JSON array streaming)
    if (jsonStr === '[' || jsonStr === ']' || jsonStr === ',' || jsonStr === '[{' || jsonStr === '}]') {
      continue;
    }

    let cleaned = jsonStr;
    // Gemini sometimes wraps responses in JSON arrays, strip leading comma/bracket
    if (cleaned.startsWith(',')) cleaned = cleaned.slice(1).trim();
    if (cleaned.startsWith('[')) cleaned = cleaned.slice(1).trim();
    if (cleaned.endsWith(']') && !cleaned.endsWith(']]')) cleaned = cleaned.slice(0, -1).trim();

    let gemini: GeminiResponse;
    try {
      gemini = JSON.parse(cleaned);
    } catch {
      continue;
    }

    if (!state.messageId) {
      state.messageId = generateId('chatcmpl');
    }
    if (gemini.modelVersion) {
      state.model = gemini.modelVersion;
    }

    // Process candidates
    for (const candidate of gemini.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        const converted = convertPart(part, state, candidate.finishReason);
        if (converted) {
          results.push(formatSSE(converted));
        }
      }

      // If finishReason is present, send it
      if (candidate.finishReason) {
        const hasToolCalls = state.toolCalls.length > 0;
        const finishReason = candidate.finishReason === 'STOP'
          ? (hasToolCalls ? 'tool_calls' : 'stop')
          : candidate.finishReason === 'MAX_TOKENS' ? 'length' : 'stop';

        results.push(formatSSE(makeChunk(state, { role: 'assistant', content: null }, finishReason)));
      }
    }

    // Track usage
    if (gemini.usageMetadata) {
      state.usage.promptTokens = gemini.usageMetadata.promptTokenCount || 0;
      state.usage.completionTokens = gemini.usageMetadata.candidatesTokenCount || 0;
      state.usage.totalTokens = gemini.usageMetadata.totalTokenCount || 0;
    }
  }

  if (results.length > 0) {
    return results.join('');
  }
  return null;
}

function convertPart(part: GeminiPart, state: TransformState, _finishReason?: string): UnifiedStreamChunk | null {
  if (part.thought && part.text) {
    return makeChunk(state, { role: 'assistant', content: null, reasoning_content: part.text }, null);
  }

  if (part.functionCall) {
    const tc = {
      index: state.toolCalls.length,
      id: part.functionCall.id || generateId('call'),
      name: part.functionCall.name,
      arguments: JSON.stringify(part.functionCall.args || {}),
    };
    state.toolCalls.push(tc);

    return makeChunk(state, {
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      }],
    }, null);
  }

  if (part.text) {
    return makeChunk(state, { role: 'assistant', content: part.text }, null);
  }

  return null;
}

function makeChunk(
  state: TransformState,
  delta: OpenAIMessage,
  finishReason: string | null,
): UnifiedStreamChunk {
  return {
    id: state.messageId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: state.model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}
