import type { RequestTransformer } from '../types.js';
import type { UnifiedRequest, OpenAIMessage, OpenAIContentPart } from '../../types/unified.js';
import type {
  GeminiRequest, GeminiContent, GeminiPart, GeminiGenerationConfig,
  GeminiToolDeclaration, GeminiFunctionDeclaration, GeminiToolConfig,
} from '../../types/gemini.js';
import { resolveThinkingConfig } from '../thinking.js';
import { normalizeToolCallId } from '../../utils/tool-id.js';

export class OpenAIToGeminiRequest implements RequestTransformer {
  transform(body: Record<string, unknown>, _model: string, _stream: boolean): Record<string, unknown> {
    const req = body as unknown as UnifiedRequest;
    const result: GeminiRequest = {
      contents: [],
    };

    // System messages → systemInstruction
    const systemParts: string[] = [];
    const contents: GeminiContent[] = [];

    for (const msg of req.messages) {
      if (msg.role === 'system' || msg.role === 'developer') {
        systemParts.push(extractText(msg));
        continue;
      }

      if (msg.role === 'tool') {
        // Tool results → function response
        const toolName = findToolName(msg.tool_call_id, req.messages);
        const normalizedId = normalizeToolCallId(msg.tool_call_id, 'gemini');
        contents.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: toolName,
              response: safeParseJSON(extractText(msg)),
              id: normalizedId,
            },
          }],
        });
        continue;
      }

      if (msg.role === 'assistant') {
        const parts: GeminiPart[] = [];

        // Reasoning → thought parts
        if (msg.reasoning_content) {
          const text = typeof msg.reasoning_content === 'string'
            ? msg.reasoning_content
            : msg.reasoning_content.filter(p => p.type === 'text').map(p => p.text || '').join('');
          if (text) {
            parts.push({ text, thought: true });
          }
        }

        // Text content
        const text = extractText(msg);
        if (text) {
          parts.push({ text });
        }

        // Tool calls → function calls
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(tc.function.arguments); } catch {}
            parts.push({
              functionCall: {
                name: tc.function.name,
                args,
                id: normalizeToolCallId(tc.id, 'gemini'),
              },
            });
          }
        }

        if (parts.length > 0) {
          contents.push({ role: 'model', parts });
        }
        continue;
      }

      // User messages
      if (msg.role === 'user') {
        contents.push({ role: 'user', parts: convertUserParts(msg) });
      }
    }

    if (systemParts.length > 0) {
      result.systemInstruction = { parts: [{ text: systemParts.join('\n\n') }] };
    }

    result.contents = contents;

    // Generation config
    const config: GeminiGenerationConfig = {};
    let hasConfig = false;

    if (req.temperature !== undefined) { config.temperature = req.temperature; hasConfig = true; }
    if (req.top_p !== undefined) { config.topP = req.top_p; hasConfig = true; }
    if (req.max_completion_tokens) { config.maxOutputTokens = req.max_completion_tokens; hasConfig = true; }
    else if (req.max_tokens) { config.maxOutputTokens = req.max_tokens; hasConfig = true; }
    if (req.n) { config.candidateCount = req.n; hasConfig = true; }

    if (req.stop) {
      config.stopSequences = Array.isArray(req.stop) ? req.stop : [req.stop];
      hasConfig = true;
    }

    // Modalities
    if (req.modalities) {
      config.responseModalities = req.modalities.map(m => m.toUpperCase());
      hasConfig = true;
    }

    // Reasoning effort → thinking config
    if (req.reasoning_effort) {
      const thinkingConfig = resolveThinkingConfig('gemini', req.model, req.reasoning_effort, config.maxOutputTokens);
      if (thinkingConfig && thinkingConfig.provider === 'gemini') {
        config.thinkingConfig = thinkingConfig.config;
      } else if (!thinkingConfig) {
        config.thinkingConfig = { includeThoughts: false };
      }
      hasConfig = true;
    }

    if (hasConfig) {
      result.generationConfig = config;
    }

    // Tools
    if (req.tools && req.tools.length > 0) {
      const declarations: GeminiFunctionDeclaration[] = req.tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      }));
      result.tools = [{ functionDeclarations: declarations }];
    }

    // Tool choice
    if (req.tool_choice !== undefined) {
      result.toolConfig = convertToolConfig(req.tool_choice);
    }

    return result as unknown as Record<string, unknown>;
  }
}

function extractText(msg: OpenAIMessage): string {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content.filter(p => p.type === 'text').map(p => p.text || '').join('');
  }
  return '';
}

function convertUserParts(msg: OpenAIMessage): GeminiPart[] {
  if (typeof msg.content === 'string') {
    return [{ text: msg.content }];
  }
  if (!Array.isArray(msg.content)) return [];

  const parts: GeminiPart[] = [];
  for (const part of msg.content) {
    if (part.type === 'text') {
      parts.push({ text: part.text || '' });
    } else if (part.type === 'image_url' && part.image_url) {
      const parsed = parseDataUrl(part.image_url.url);
      if (parsed) {
        parts.push({ inlineData: { mimeType: parsed.mediaType, data: parsed.data } });
      }
    }
  }
  return parts;
}

function parseDataUrl(url: string): { mediaType: string; data: string } | null {
  const match = url.match(/^data:([^;]+);base64,(.+)$/);
  if (match) return { mediaType: match[1], data: match[2] };
  return null;
}

function findToolName(toolCallId: string | undefined, messages: OpenAIMessage[]): string {
  if (!toolCallId) return 'unknown';
  for (const msg of messages) {
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.id === toolCallId) return tc.function.name;
      }
    }
  }
  return 'unknown';
}

function safeParseJSON(text: string): unknown {
  try { return JSON.parse(text); } catch { return { result: text }; }
}

function convertToolConfig(choice: unknown): GeminiToolConfig {
  if (choice === 'auto') return { functionCallingConfig: { mode: 'AUTO' } };
  if (choice === 'none') return { functionCallingConfig: { mode: 'NONE' } };
  if (choice === 'required') return { functionCallingConfig: { mode: 'ANY' } };
  if (typeof choice === 'object' && choice !== null) {
    const c = choice as Record<string, unknown>;
    if (c.type === 'function' && c.function) {
      const f = c.function as Record<string, unknown>;
      return {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: [f.name as string],
        },
      };
    }
  }
  return { functionCallingConfig: { mode: 'AUTO' } };
}
