import type { RequestTransformer } from '../types.js';
import type { UnifiedRequest, OpenAIMessage, OpenAIContentPart } from '../../types/unified.js';
import type { ClaudeRequest, ClaudeMessage, ClaudeContentBlock, ClaudeSystemBlock, ClaudeTool } from '../../types/anthropic.js';
import { resolveThinkingConfig } from '../thinking.js';
import { normalizeToolCallId } from '../../utils/tool-id.js';

export class OpenAIToAnthropicRequest implements RequestTransformer {
  transform(body: Record<string, unknown>, _model: string, _stream: boolean): Record<string, unknown> {
    const req = body as unknown as UnifiedRequest;
    const result: ClaudeRequest = {
      model: req.model,
      messages: [],
    };

    // Collect system messages
    const systemParts: string[] = [];
    const claudeMessages: ClaudeMessage[] = [];

    for (const msg of req.messages) {
      if (msg.role === 'system' || msg.role === 'developer') {
        systemParts.push(extractText(msg));
        continue;
      }

      if (msg.role === 'tool') {
        // Tool results become user messages with tool_result content blocks
        const block: ClaudeContentBlock = {
          type: 'tool_result',
          tool_use_id: normalizeToolCallId(msg.tool_call_id, 'anthropic'),
          content: extractText(msg),
        };
        claudeMessages.push({ role: 'user', content: [block] });
        continue;
      }

      if (msg.role === 'assistant') {
        const blocks: ClaudeContentBlock[] = [];

        // Reasoning content → thinking blocks
        if (msg.reasoning_content) {
          const text = typeof msg.reasoning_content === 'string'
            ? msg.reasoning_content
            : collectReasoningText(msg.reasoning_content as OpenAIContentPart[]);
          if (text) {
            blocks.push({ type: 'thinking', thinking: text, signature: '' });
          }
        }

        // Text content
        const text = extractText(msg);
        if (text) {
          blocks.push({ type: 'text', text });
        }

        // Tool calls
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            let input: unknown = {};
            try { input = JSON.parse(tc.function.arguments); } catch {}
            blocks.push({
              type: 'tool_use',
              id: normalizeToolCallId(tc.id, 'anthropic'),
              name: tc.function.name,
              input,
            });
          }
        }

        if (blocks.length > 0) {
          claudeMessages.push({ role: 'assistant', content: blocks });
        }
        continue;
      }

      // User messages
      if (msg.role === 'user') {
        const blocks = convertUserContent(msg);
        claudeMessages.push({ role: 'user', content: blocks.length === 1 && blocks[0].type === 'text' ? blocks[0].text! : blocks });
        continue;
      }
    }

    if (systemParts.length > 0) {
      result.system = systemParts.join('\n\n');
    }

    result.messages = claudeMessages;

    // Max tokens
    if (req.max_completion_tokens) {
      result.max_tokens = req.max_completion_tokens;
    } else if (req.max_tokens) {
      result.max_tokens = req.max_tokens;
    }

    if (req.temperature !== undefined) result.temperature = req.temperature;
    if (req.top_p !== undefined) result.top_p = req.top_p;
    if (req.stream !== undefined) result.stream = req.stream;

    // Stop sequences
    if (req.stop) {
      result.stop_sequences = Array.isArray(req.stop) ? req.stop : [req.stop];
    }

    // Tools
    if (req.tools && req.tools.length > 0) {
      result.tools = req.tools.map((t): ClaudeTool => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters || { type: 'object', properties: {} },
      }));
    }

    // Tool choice
    if (req.tool_choice !== undefined) {
      result.tool_choice = convertToolChoice(req.tool_choice);
    }

    // Reasoning effort → thinking
    if (req.reasoning_effort) {
      const thinkingConfig = resolveThinkingConfig('anthropic', req.model, req.reasoning_effort, result.max_tokens);
      if (thinkingConfig && thinkingConfig.provider === 'anthropic') {
        result.thinking = thinkingConfig.config.thinking;
        if (thinkingConfig.config.output_config) {
          result.output_config = thinkingConfig.config.output_config;
        }
      }
    }

    return result as unknown as Record<string, unknown>;
  }
}

function extractText(msg: OpenAIMessage): string {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((p) => p.type === 'text')
      .map((p) => p.text || '')
      .join('');
  }
  return '';
}

function collectReasoningText(parts: OpenAIContentPart[]): string {
  return parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text || '')
    .join('');
}

function convertUserContent(msg: OpenAIMessage): ClaudeContentBlock[] {
  if (typeof msg.content === 'string') {
    return [{ type: 'text', text: msg.content }];
  }
  if (!Array.isArray(msg.content)) return [];

  const blocks: ClaudeContentBlock[] = [];
  for (const part of msg.content) {
    if (part.type === 'text') {
      blocks.push({ type: 'text', text: part.text || '' });
    } else if (part.type === 'image_url' && part.image_url) {
      const parsed = parseDataUrl(part.image_url.url);
      if (parsed) {
        blocks.push({
          type: 'image',
          source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data },
        });
      }
    }
  }
  return blocks;
}

function parseDataUrl(url: string): { mediaType: string; data: string } | null {
  const match = url.match(/^data:([^;]+);base64,(.+)$/);
  if (match) return { mediaType: match[1], data: match[2] };
  return null;
}

function convertToolChoice(choice: unknown): unknown {
  if (choice === 'auto') return { type: 'auto' };
  if (choice === 'none') return { type: 'none' };
  if (choice === 'required') return { type: 'any' };
  if (typeof choice === 'object' && choice !== null) {
    const c = choice as Record<string, unknown>;
    if (c.type === 'function' && c.function) {
      const f = c.function as Record<string, unknown>;
      return { type: 'tool', name: f.name };
    }
  }
  return { type: 'auto' };
}

