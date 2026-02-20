import type { ResponseTransformer, TransformState } from '../types.js';
import type { CodexResponse, CodexOutputItem } from '../../types/codex.js';
import type { UnifiedResponse, OpenAIMessage, OpenAIToolCall } from '../../types/unified.js';
import { generateId } from '../../utils/id.js';

export class CodexToOpenAIResponse implements ResponseTransformer {
  transform(body: Record<string, unknown>): Record<string, unknown> {
    const codex = body as unknown as CodexResponse;

    const message: OpenAIMessage = { role: 'assistant', content: null };
    const textParts: string[] = [];
    const toolCalls: OpenAIToolCall[] = [];
    const reasoningParts: string[] = [];

    for (const item of codex.output || []) {
      switch (item.type) {
        case 'reasoning':
          // Reasoning summary content
          if (item.content) {
            for (const c of item.content) {
              if (c.text) reasoningParts.push(c.text);
            }
          }
          break;

        case 'message':
          if (item.content) {
            for (const c of item.content) {
              if (c.type === 'output_text' && c.text) {
                textParts.push(c.text);
              }
            }
          }
          break;

        case 'function_call':
          toolCalls.push({
            id: item.call_id || item.id || generateId('call'),
            type: 'function',
            function: {
              name: item.name || '',
              arguments: item.arguments || '{}',
            },
          });
          break;
      }
    }

    if (textParts.length > 0) message.content = textParts.join('');
    if (toolCalls.length > 0) message.tool_calls = toolCalls;
    if (reasoningParts.length > 0) message.reasoning_content = reasoningParts.join('');

    const finishReason = codex.status === 'completed'
      ? (toolCalls.length > 0 ? 'tool_calls' : 'stop')
      : 'stop';

    const response: UnifiedResponse = {
      id: codex.id || generateId('chatcmpl'),
      object: 'chat.completion',
      created: codex.created_at || Math.floor(Date.now() / 1000),
      model: codex.model,
      choices: [{ index: 0, message, finish_reason: finishReason }],
      usage: {
        prompt_tokens: codex.usage?.input_tokens || 0,
        completion_tokens: codex.usage?.output_tokens || 0,
        total_tokens: codex.usage?.total_tokens || 0,
      },
    };

    return response as unknown as Record<string, unknown>;
  }

  transformChunk(_chunk: string, _state: TransformState): string | null {
    return null; // Delegated to stream.ts
  }
}
