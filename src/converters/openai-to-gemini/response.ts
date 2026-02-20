import type { ResponseTransformer, TransformState } from '../types.js';
import type { GeminiResponse, GeminiPart } from '../../types/gemini.js';
import type { UnifiedResponse, OpenAIMessage, OpenAIToolCall } from '../../types/unified.js';
import { generateId } from '../../utils/id.js';
import { normalizeToolCallId } from '../../utils/tool-id.js';

export class GeminiToOpenAIResponse implements ResponseTransformer {
  transform(body: Record<string, unknown>): Record<string, unknown> {
    const gemini = body as unknown as GeminiResponse;

    const choices = (gemini.candidates || []).map((candidate, i) => {
      const message: OpenAIMessage = { role: 'assistant', content: null };
      const textParts: string[] = [];
      const reasoningParts: string[] = [];
      const toolCalls: OpenAIToolCall[] = [];

      for (const part of candidate.content?.parts || []) {
        if (part.thought && part.text) {
          reasoningParts.push(part.text);
        } else if (part.functionCall) {
          toolCalls.push({
            id: normalizeToolCallId(part.functionCall.id, 'openai'),
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args || {}),
            },
          });
        } else if (part.text) {
          textParts.push(part.text);
        }
      }

      if (textParts.length > 0) message.content = textParts.join('');
      if (toolCalls.length > 0) message.tool_calls = toolCalls;
      if (reasoningParts.length > 0) message.reasoning_content = reasoningParts.join('');

      return {
        index: candidate.index ?? i,
        message,
        finish_reason: mapFinishReason(candidate.finishReason, toolCalls.length > 0),
      };
    });

    const usage = gemini.usageMetadata;
    const response: UnifiedResponse = {
      id: generateId('chatcmpl'),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: gemini.modelVersion || '',
      choices,
      usage: {
        prompt_tokens: usage?.promptTokenCount || 0,
        completion_tokens: usage?.candidatesTokenCount || 0,
        total_tokens: usage?.totalTokenCount || 0,
      },
    };

    return response as unknown as Record<string, unknown>;
  }

  transformChunk(_chunk: string, _state: TransformState): string | null {
    return null; // Delegated to stream.ts
  }
}

function mapFinishReason(reason: string | undefined, hasToolCalls: boolean): string {
  if (hasToolCalls) return 'tool_calls';
  switch (reason) {
    case 'STOP': return 'stop';
    case 'MAX_TOKENS': return 'length';
    default: return 'stop';
  }
}
