/**
 * Provider-specific context overflow error patterns.
 * Ported from pi-ai's overflow detection.
 */
const OVERFLOW_PATTERNS = [
  /prompt is too long/i,                         // Anthropic
  /input is too long for requested model/i,      // Amazon Bedrock
  /exceeds the context window/i,                 // OpenAI
  /input token count.*exceeds the maximum/i,     // Gemini
  /maximum prompt length is \d+/i,               // xAI (Grok)
  /reduce the length of the messages/i,          // Groq
  /maximum context length is \d+ tokens/i,       // OpenRouter
  /context[_ ]length[_ ]exceeded/i,              // Generic
  /too many tokens/i,                            // Generic
  /token limit exceeded/i,                       // Generic
  /request too large/i,                          // Generic
  /content too large/i,                          // Generic
  /max_tokens.*exceeded/i,                       // Generic
  /input.*too long/i,                            // Generic
  /exceeds? (?:the )?(?:max|maximum) (?:input |)token/i,  // Generic
];

/**
 * Detect whether an upstream error message indicates a context overflow.
 */
export function isContextOverflow(errorText: string): boolean {
  return OVERFLOW_PATTERNS.some(pattern => pattern.test(errorText));
}
