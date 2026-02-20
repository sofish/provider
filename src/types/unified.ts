import type { ProviderType } from './provider.js';

// Unified request: OpenAI chat completions format + `type` field
export interface UnifiedRequest {
  type: ProviderType;
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  stop?: string | string[];
  tools?: OpenAITool[];
  tool_choice?: unknown;
  response_format?: OpenAIResponseFormat;
  reasoning_effort?: string;
  modalities?: string[];
  n?: number;
}

export interface OpenAIMessage {
  role: string;
  content: string | OpenAIContentPart[] | null;
  reasoning_content?: string | OpenAIContentPart[];
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

export interface OpenAIContentPart {
  type: string;
  text?: string;
  image_url?: { url: string; detail?: string };
}

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    strict?: boolean;
  };
}

export interface OpenAIResponseFormat {
  type: string;
  json_schema?: Record<string, unknown>;
}

// Unified response: OpenAI chat completions format
export interface UnifiedResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: OpenAIUsage;
}

export interface OpenAIChoice {
  index: number;
  message?: OpenAIMessage;
  delta?: OpenAIMessage;
  finish_reason: string | null;
}

export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// Streaming chunk format
export interface UnifiedStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage?: OpenAIUsage | null;
}
