import type { TransformState } from '../types.js';
import type { ClaudeStreamEvent } from '../../types/anthropic.js';
import type { UnifiedStreamChunk, OpenAIMessage } from '../../types/unified.js';
import { parseSSE, formatSSE, formatDone } from '../sse.js';
import { generateId } from '../../utils/id.js';

/**
 * Transform a Claude SSE stream chunk into OpenAI SSE format.
 * Returns formatted SSE string(s), or null to skip.
 */
export function transformAnthropicStreamChunk(chunk: string, state: TransformState): string | null {
  const results: string[] = [];

  // Claude sends events with both "event:" and "data:" lines
  // We may receive multiple events in one chunk
  const lines = chunk.split('\n');

  for (const line of lines) {
    const { done, data } = parseSSE(line);
    if (done) {
      results.push(formatDone());
      continue;
    }
    if (!data) continue;

    let event: ClaudeStreamEvent;
    try {
      event = JSON.parse(data);
    } catch {
      continue;
    }

    const converted = convertEvent(event, state);
    if (converted) {
      results.push(formatSSE(converted));
    }
  }

  return results.length > 0 ? results.join('') : null;
}

function convertEvent(event: ClaudeStreamEvent, state: TransformState): UnifiedStreamChunk | null {
  switch (event.type) {
    case 'message_start': {
      if (event.message) {
        state.messageId = event.message.id || generateId('chatcmpl');
        state.model = event.message.model || state.model;
        if (event.message.usage) {
          state.usage.promptTokens = event.message.usage.input_tokens || 0;
        }
      }
      // Send initial chunk with role
      return makeChunk(state, { role: 'assistant', content: '' }, null);
    }

    case 'content_block_start': {
      state.blockIndex = event.index ?? state.blockIndex + 1;
      const block = event.content_block;
      if (!block) return null;

      state.blockType = block.type || '';

      if (block.type === 'tool_use') {
        const toolCall = {
          index: state.toolCalls.length,
          id: block.id || '',
          name: block.name || '',
          arguments: '',
        };
        state.toolCalls.push(toolCall);

        return makeChunk(state, {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: toolCall.id,
            type: 'function' as const,
            function: { name: toolCall.name, arguments: '' },
          }],
        }, null);
      }
      return null;
    }

    case 'content_block_delta': {
      const delta = event.delta;
      if (!delta) return null;

      if (delta.type === 'text_delta' && delta.text) {
        return makeChunk(state, { role: 'assistant', content: delta.text }, null);
      }

      if (delta.type === 'thinking_delta' && delta.thinking) {
        return makeChunk(state, {
          role: 'assistant',
          content: null,
          reasoning_content: delta.thinking,
        }, null);
      }

      if (delta.type === 'input_json_delta' && delta.partial_json !== undefined) {
        const idx = state.toolCalls.length - 1;
        if (idx >= 0) {
          state.toolCalls[idx].arguments += delta.partial_json;
          return makeChunk(state, {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: '',
              type: 'function' as const,
              function: { name: '', arguments: delta.partial_json },
            }],
          }, null);
        }
      }
      return null;
    }

    case 'message_delta': {
      const delta = event.delta;
      if (!delta) return null;

      if (event.usage) {
        state.usage.completionTokens = event.usage.output_tokens || 0;
        state.usage.totalTokens = state.usage.promptTokens + state.usage.completionTokens;
      }

      const finishReason = mapFinishReason(delta.stop_reason || null);
      return makeChunk(state, { role: 'assistant', content: null }, finishReason);
    }

    case 'message_stop': {
      return null; // We already sent finish_reason in message_delta
    }

    default:
      return null;
  }
}

function makeChunk(
  state: TransformState,
  delta: OpenAIMessage,
  finishReason: string | null,
): UnifiedStreamChunk {
  return {
    id: state.messageId || generateId('chatcmpl'),
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: state.model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

function mapFinishReason(stopReason: string | null): string | null {
  switch (stopReason) {
    case 'end_turn': return 'stop';
    case 'max_tokens': return 'length';
    case 'tool_use': return 'tool_calls';
    case 'stop_sequence': return 'stop';
    default: return null;
  }
}
