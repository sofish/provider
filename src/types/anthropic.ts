// Claude/Anthropic API types

export interface ClaudeRequest {
  model: string;
  messages: ClaudeMessage[];
  system?: string | ClaudeSystemBlock[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  metadata?: { user_id?: string };
  tools?: ClaudeTool[];
  tool_choice?: unknown;
  thinking?: { type: string; budget_tokens?: number };
  output_config?: { effort: string };
}

export interface ClaudeSystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: string };
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

export interface ClaudeContentBlock {
  type: string; // "text" | "thinking" | "redacted_thinking" | "tool_use" | "tool_result" | "image"
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string | ClaudeContentBlock[];
  is_error?: boolean;
  thinking?: string;
  signature?: string;
  data?: string;
  source?: ClaudeImageSource;
}

export interface ClaudeImageSource {
  type: 'base64';
  media_type: string;
  data: string;
}

export interface ClaudeTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

// Response types
export interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ClaudeContentBlock[];
  model: string;
  stop_reason: string | null; // "end_turn" | "max_tokens" | "tool_use" | "stop_sequence"
  stop_sequence?: string;
  usage: ClaudeUsage;
}

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

// Streaming types
export interface ClaudeStreamEvent {
  type: string; // "message_start" | "content_block_start" | "content_block_delta" | "content_block_stop" | "message_delta" | "message_stop"
  message?: ClaudeResponse;
  index?: number;
  content_block?: ClaudeContentBlock;
  delta?: ClaudeStreamDelta;
  usage?: ClaudeUsage;
}

export interface ClaudeStreamDelta {
  type?: string; // "text_delta" | "thinking_delta" | "input_json_delta"
  text?: string;
  thinking?: string;
  partial_json?: string;
  stop_reason?: string;
  stop_sequence?: string;
}
