// Gemini API types

export interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: GeminiContent;
  generationConfig?: GeminiGenerationConfig;
  safetySettings?: GeminiSafetySetting[];
  tools?: GeminiToolDeclaration[];
  toolConfig?: GeminiToolConfig;
}

export interface GeminiContent {
  role?: string; // "user" | "model"
  parts: GeminiPart[];
}

export interface GeminiPart {
  text?: string;
  inlineData?: GeminiInlineData;
  functionCall?: GeminiFunctionCall;
  functionResponse?: GeminiFunctionResponse;
  thought?: boolean;
  thoughtSignature?: string;
}

export interface GeminiInlineData {
  mimeType: string;
  data: string; // base64
}

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}

export interface GeminiFunctionResponse {
  name: string;
  response: unknown;
  id?: string;
}

export interface GeminiGenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  candidateCount?: number;
  responseMimeType?: string;
  responseModalities?: string[];
  thinkingConfig?: GeminiThinkingConfig;
}

export interface GeminiThinkingConfig {
  includeThoughts: boolean;
  thinkingBudget?: number;
  thinkingLevel?: string;
}

export interface GeminiSafetySetting {
  category: string;
  threshold: string;
}

export interface GeminiToolDeclaration {
  functionDeclarations?: GeminiFunctionDeclaration[];
}

export interface GeminiFunctionDeclaration {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface GeminiToolConfig {
  functionCallingConfig?: {
    mode: string; // "AUTO" | "NONE" | "ANY"
    allowedFunctionNames?: string[];
  };
}

// Response types
export interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  promptFeedback?: GeminiPromptFeedback;
  modelVersion?: string;
}

export interface GeminiCandidate {
  content: GeminiContent;
  finishReason?: string; // "STOP" | "MAX_TOKENS"
  safetyRatings?: GeminiSafetyRating[];
  index?: number;
}

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  cachedContentTokenCount?: number;
  thoughtsTokenCount?: number;
}

export interface GeminiPromptFeedback {
  blockReason?: string;
  safetyRatings?: GeminiSafetyRating[];
}

export interface GeminiSafetyRating {
  category: string;
  probability: string;
}
