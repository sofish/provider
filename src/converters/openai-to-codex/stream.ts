import type { TransformState } from '../types.js';
import type { CodexStreamEvent, CodexOutputItem } from '../../types/codex.js';
import type { UnifiedStreamChunk, OpenAIMessage } from '../../types/unified.js';
import { parseSSE, formatSSE, formatDone } from '../sse.js';
import { generateId } from '../../utils/id.js';

/**
 * Transform Codex (Responses API) streaming events to OpenAI SSE format.
 */
export function transformCodexStreamChunk(chunk: string, state: TransformState): string | null {
  const results: string[] = [];
  const lines = chunk.split('\n');

  for (const line of lines) {
    const { done, data } = parseSSE(line);
    if (done) {
      results.push(formatDone());
      continue;
    }
    if (!data) continue;

    let event: CodexStreamEvent;
    try {
      event = JSON.parse(data);
    } catch {
      continue;
    }

    const converted = convertEvent(event, state);
    if (converted) {
      for (const c of converted) {
        results.push(formatSSE(c));
      }
    }
  }

  return results.length > 0 ? results.join('') : null;
}

function convertEvent(event: CodexStreamEvent, state: TransformState): UnifiedStreamChunk[] | null {
  if (!state.messageId) {
    state.messageId = generateId('chatcmpl');
  }

  switch (event.type) {
    case 'response.created':
    case 'response.in_progress': {
      if (event.response) {
        state.model = event.response.model || state.model;
        state.messageId = event.response.id || state.messageId;
      }
      return [makeChunk(state, { role: 'assistant', content: '' }, null)];
    }

    case 'response.output_text.delta': {
      if (event.delta) {
        return [makeChunk(state, { role: 'assistant', content: event.delta }, null)];
      }
      return null;
    }

    case 'response.reasoning_summary_text.delta': {
      if (event.delta) {
        return [makeChunk(state, {
          role: 'assistant',
          content: null,
          reasoning_content: event.delta,
        }, null)];
      }
      return null;
    }

    case 'response.output_item.done': {
      const item = event.item;
      if (!item) return null;

      if (item.type === 'function_call') {
        const tc = {
          index: state.toolCalls.length,
          id: item.call_id || item.id || generateId('call'),
          name: reverseToolName(item.name || '', state.toolNameMap),
          arguments: item.arguments || '{}',
        };
        state.toolCalls.push(tc);

        return [makeChunk(state, {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          }],
        }, null)];
      }
      return null;
    }

    case 'response.completed': {
      if (event.response?.usage) {
        state.usage.promptTokens = event.response.usage.input_tokens || 0;
        state.usage.completionTokens = event.response.usage.output_tokens || 0;
        state.usage.totalTokens = event.response.usage.total_tokens || 0;
      }

      const hasToolCalls = state.toolCalls.length > 0;
      const finishReason = hasToolCalls ? 'tool_calls' : 'stop';
      return [
        makeChunk(state, { role: 'assistant', content: null }, finishReason),
      ];
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
    id: state.messageId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: state.model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

function reverseToolName(shortName: string, nameMap: Map<string, string>): string {
  // The map stores original→short, so we need to reverse lookup
  for (const [original, short] of nameMap) {
    if (short === shortName) return original;
  }
  return shortName;
}
