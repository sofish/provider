import type { ResponseTransformer, TransformState } from '../types.js';
import type { ClaudeResponse, ClaudeContentBlock } from '../../types/anthropic.js';
import type { UnifiedResponse, OpenAIMessage, OpenAIToolCall, OpenAIContentPart } from '../../types/unified.js';
import { generateId } from '../../utils/id.js';
import { normalizeToolCallId } from '../../utils/tool-id.js';

export class AnthropicToOpenAIResponse implements ResponseTransformer {
  transform(body: Record<string, unknown>): Record<string, unknown> {
    const claude = body as unknown as ClaudeResponse;

    const message: OpenAIMessage = {
      role: 'assistant',
      content: null,
    };

    const textParts: string[] = [];
    const toolCalls: OpenAIToolCall[] = [];
    const reasoningParts: string[] = [];

    for (const block of claude.content) {
      switch (block.type) {
        case 'text':
          textParts.push(block.text || '');
          break;
        case 'thinking':
          reasoningParts.push(block.thinking || '');
          break;
        case 'tool_use':
          toolCalls.push({
            id: normalizeToolCallId(block.id, 'openai'),
            type: 'function',
            function: {
              name: block.name || '',
              arguments: typeof block.input === 'string' ? block.input : JSON.stringify(block.input || {}),
            },
          });
          break;
      }
    }

    if (textParts.length > 0) {
      message.content = textParts.join('');
    }
    if (toolCalls.length > 0) {
      message.tool_calls = toolCalls;
    }
    if (reasoningParts.length > 0) {
      message.reasoning_content = reasoningParts.join('');
    }

    const response: UnifiedResponse = {
      id: claude.id || generateId('chatcmpl'),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: claude.model,
      choices: [
        {
          index: 0,
          message,
          finish_reason: mapFinishReason(claude.stop_reason),
        },
      ],
      usage: {
        prompt_tokens: claude.usage?.input_tokens || 0,
        completion_tokens: claude.usage?.output_tokens || 0,
        total_tokens: (claude.usage?.input_tokens || 0) + (claude.usage?.output_tokens || 0),
      },
    };

    return response as unknown as Record<string, unknown>;
  }

  transformChunk(chunk: string, state: TransformState): string | null {
    // Handled by stream.ts — delegated
    return null;
  }
}

function mapFinishReason(stopReason: string | null): string {
  switch (stopReason) {
    case 'end_turn': return 'stop';
    case 'max_tokens': return 'length';
    case 'tool_use': return 'tool_calls';
    case 'stop_sequence': return 'stop';
    default: return 'stop';
  }
}
