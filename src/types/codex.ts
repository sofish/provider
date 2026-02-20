// Codex (OpenAI Responses API) types

export interface CodexRequest {
  model: string;
  input: string | CodexInputItem[];
  instructions?: string;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  tools?: CodexTool[];
  tool_choice?: unknown;
  reasoning?: CodexReasoning;
  parallel_tool_calls?: boolean;
  include?: string[];
  metadata?: Record<string, unknown>;
  store?: boolean;
  previous_response_id?: string;
  text?: unknown;
}

export interface CodexInputItem {
  type: string; // "message" | "function_call" | "function_call_output"
  role?: string; // "user" | "assistant" | "developer"
  content?: string | CodexContentPart[];
  id?: string;
  call_id?: string;
  output?: string;
  name?: string;
  arguments?: string;
  status?: string;
}

export interface CodexContentPart {
  type: string; // "input_text" | "output_text" | "input_image" | "refusal"
  text?: string;
  image_url?: string;
  detail?: string;
}

export interface CodexTool {
  type: 'function';
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  strict?: boolean;
}

export interface CodexReasoning {
  effort?: string;
  summary?: string;
}

// Response types
export interface CodexResponse {
  id: string;
  object: 'response';
  created_at: number;
  model: string;
  output: CodexOutputItem[];
  status: string; // "completed"
  usage: CodexUsage;
}

export interface CodexOutputItem {
  type: string; // "reasoning" | "message" | "function_call"
  id: string;
  role?: string;
  content?: CodexOutputContent[];
  name?: string;
  call_id?: string;
  arguments?: string;
  status?: string;
}

export interface CodexOutputContent {
  type: string; // "output_text" | "refusal"
  text: string;
  annotations?: unknown[];
}

export interface CodexUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
}

// Streaming event types
export interface CodexStreamEvent {
  type: string; // e.g. "response.created", "response.output_text.delta", "response.completed"
  response?: CodexResponse;
  output_index?: number;
  content_index?: number;
  delta?: string;
  item?: CodexOutputItem;
}
