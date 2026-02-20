import type { RequestTransformer } from '../types.js';
import type { UnifiedRequest, OpenAIMessage, OpenAIContentPart } from '../../types/unified.js';
import type { CodexRequest, CodexInputItem, CodexContentPart, CodexTool, CodexReasoning } from '../../types/codex.js';

const MAX_TOOL_NAME_LENGTH = 64;

export class OpenAIToCodexRequest implements RequestTransformer {
  transform(body: Record<string, unknown>, _model: string, _stream: boolean): Record<string, unknown> {
    const req = body as unknown as UnifiedRequest;
    const result: CodexRequest = {
      model: req.model,
      input: [],
    };

    // Build tool name shortening map
    const toolNameMap = buildShortNameMap(req.tools || []);

    const input: CodexInputItem[] = [];

    for (const msg of req.messages) {
      if (msg.role === 'system' || msg.role === 'developer') {
        input.push({
          type: 'message',
          role: 'developer',
          content: extractText(msg),
        });
        continue;
      }

      if (msg.role === 'tool') {
        // Tool response → function_call_output
        input.push({
          type: 'function_call_output',
          call_id: msg.tool_call_id || '',
          output: extractText(msg),
        });
        continue;
      }

      if (msg.role === 'assistant') {
        // Content parts
        const contentParts: CodexContentPart[] = [];
        const text = extractText(msg);
        if (text) {
          contentParts.push({ type: 'output_text', text });
        }

        if (contentParts.length > 0) {
          input.push({
            type: 'message',
            role: 'assistant',
            content: contentParts,
          });
        }

        // Tool calls → separate function_call items
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            const shortName = toolNameMap.get(tc.function.name) || tc.function.name;
            input.push({
              type: 'function_call',
              id: tc.id,
              call_id: tc.id,
              name: shortName,
              arguments: tc.function.arguments,
            });
          }
        }
        continue;
      }

      // User messages
      if (msg.role === 'user') {
        const parts = convertUserContent(msg);
        input.push({
          type: 'message',
          role: 'user',
          content: parts.length === 1 && parts[0].type === 'input_text' ? parts[0].text : parts,
        });
      }
    }

    result.input = input;

    // Max tokens
    if (req.max_completion_tokens) {
      result.max_output_tokens = req.max_completion_tokens;
    } else if (req.max_tokens) {
      result.max_output_tokens = req.max_tokens;
    }

    if (req.temperature !== undefined) result.temperature = req.temperature;
    if (req.top_p !== undefined) result.top_p = req.top_p;
    if (req.stream !== undefined) result.stream = req.stream;

    // Tools
    if (req.tools && req.tools.length > 0) {
      result.tools = req.tools.map((t): CodexTool => {
        const shortName = toolNameMap.get(t.function.name) || t.function.name;
        return {
          type: 'function',
          name: shortName,
          description: t.function.description,
          parameters: t.function.parameters,
          strict: t.function.strict,
        };
      });
    }

    if (req.tool_choice !== undefined) result.tool_choice = req.tool_choice;

    // Reasoning effort
    if (req.reasoning_effort) {
      result.reasoning = { effort: req.reasoning_effort };
    }

    // Parallel tool calls
    result.parallel_tool_calls = true;

    // Response format → text config
    if (req.response_format) {
      if (req.response_format.type === 'json_schema') {
        result.text = {
          format: {
            type: 'json_schema',
            ...req.response_format.json_schema,
          },
        };
      } else if (req.response_format.type === 'json_object') {
        result.text = { format: { type: 'json_object' } };
      }
    }

    // Store tool name map in result for reverse mapping during response conversion
    const output = result as unknown as Record<string, unknown>;
    output.__toolNameMap = Object.fromEntries(toolNameMap);

    return output;
  }
}

function extractText(msg: OpenAIMessage): string {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content.filter(p => p.type === 'text').map(p => p.text || '').join('');
  }
  return '';
}

function convertUserContent(msg: OpenAIMessage): CodexContentPart[] {
  if (typeof msg.content === 'string') {
    return [{ type: 'input_text', text: msg.content }];
  }
  if (!Array.isArray(msg.content)) return [];

  const parts: CodexContentPart[] = [];
  for (const part of msg.content) {
    if (part.type === 'text') {
      parts.push({ type: 'input_text', text: part.text || '' });
    } else if (part.type === 'image_url' && part.image_url) {
      parts.push({ type: 'input_image', image_url: part.image_url.url, detail: part.image_url.detail });
    }
  }
  return parts;
}

/**
 * Build a map from original tool names to shortened names (max 64 chars).
 * Preserves "mcp__" prefix when shortening.
 */
function buildShortNameMap(tools: { function: { name: string } }[]): Map<string, string> {
  const nameMap = new Map<string, string>();
  const usedNames = new Set<string>();

  for (const tool of tools) {
    const original = tool.function.name;
    if (original.length <= MAX_TOOL_NAME_LENGTH) {
      nameMap.set(original, original);
      usedNames.add(original);
      continue;
    }

    // Shorten
    let prefix = '';
    let base = original;
    if (original.startsWith('mcp__')) {
      const secondUnderscore = original.indexOf('__', 5);
      if (secondUnderscore > 0) {
        prefix = original.slice(0, secondUnderscore + 2);
        base = original.slice(secondUnderscore + 2);
      }
    }

    const maxBase = MAX_TOOL_NAME_LENGTH - prefix.length;
    let shortened = prefix + base.slice(0, maxBase);

    // Deduplicate
    let counter = 1;
    while (usedNames.has(shortened)) {
      const suffix = `_${counter}`;
      shortened = prefix + base.slice(0, maxBase - suffix.length) + suffix;
      counter++;
    }

    nameMap.set(original, shortened);
    usedNames.add(shortened);
  }

  return nameMap;
}
