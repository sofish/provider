/**
 * Parse an SSE line. Returns the data payload or null for non-data lines.
 * Handles "data: [DONE]" as a special marker.
 */
export function parseSSE(line: string): { done: boolean; data: string | null } {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(':')) {
    return { done: false, data: null };
  }
  if (trimmed === 'data: [DONE]') {
    return { done: true, data: null };
  }
  if (trimmed.startsWith('data: ')) {
    return { done: false, data: trimmed.slice(6) };
  }
  // Some providers use "event:" lines — skip them
  if (trimmed.startsWith('event:')) {
    return { done: false, data: null };
  }
  return { done: false, data: null };
}

/**
 * Format a data object as an SSE data line.
 */
export function formatSSE(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * Format the SSE done marker.
 */
export function formatDone(): string {
  return 'data: [DONE]\n\n';
}
