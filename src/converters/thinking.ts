import type { ProviderType } from '../types/provider.js';

// Per-provider thinking budget tables (tokens)
const DEFAULT_BUDGETS = { minimal: 1024, low: 2048, medium: 8192, high: 16384 };
const GEMINI_PRO_BUDGETS = { minimal: 128, low: 2048, medium: 8192, high: 32768 };
const GEMINI_FLASH_BUDGETS = { minimal: 128, low: 2048, medium: 8192, high: 24576 };

type EffortLevel = 'minimal' | 'low' | 'medium' | 'high';

const EFFORT_ALIASES: Record<string, EffortLevel> = {
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  // Map non-standard effort strings
  default: 'medium',
};

function normalizeEffort(effort: string): EffortLevel {
  return EFFORT_ALIASES[effort.toLowerCase()] || 'medium';
}

function isAdaptiveModel(model: string): boolean {
  // Opus 4.6+ and Sonnet 4.6+ support adaptive thinking
  return /claude-(opus|sonnet)-4-6/i.test(model);
}

function isGeminiPro(model: string): boolean {
  return /gemini[- ]2\.5[- ]pro/i.test(model);
}

function isGeminiFlash(model: string): boolean {
  return /gemini[- ]2\.5[- ]flash/i.test(model);
}

function isGemini3(model: string): boolean {
  return /gemini[- ]3/i.test(model);
}

// Anthropic thinking config
export interface AnthropicThinkingConfig {
  thinking?: { type: string; budget_tokens?: number };
  output_config?: { effort: string };
}

// Gemini thinking config
export interface GeminiThinkingResult {
  includeThoughts: boolean;
  thinkingBudget?: number;
  thinkingLevel?: string;
}

// Codex thinking config
export interface CodexThinkingResult {
  effort: string;
}

export type ThinkingConfig =
  | { provider: 'anthropic'; config: AnthropicThinkingConfig }
  | { provider: 'gemini'; config: GeminiThinkingResult }
  | { provider: 'codex'; config: CodexThinkingResult }
  | null;

/**
 * Resolve thinking configuration based on provider, model, effort level, and max tokens.
 * Returns provider-specific thinking config objects.
 */
export function resolveThinkingConfig(
  provider: ProviderType,
  model: string,
  effort: string,
  maxTokens?: number,
): ThinkingConfig {
  const normalized = effort.toLowerCase();

  // "none" means no thinking for all providers
  if (normalized === 'none') return null;

  switch (provider) {
    case 'anthropic':
      return { provider: 'anthropic', config: resolveAnthropicThinking(model, normalized, maxTokens) };
    case 'gemini':
      return { provider: 'gemini', config: resolveGeminiThinking(model, normalized, maxTokens) };
    case 'codex':
      return { provider: 'codex', config: { effort: normalized } };
    default:
      return null;
  }
}

function resolveAnthropicThinking(model: string, effort: string, maxTokens?: number): AnthropicThinkingConfig {
  if (isAdaptiveModel(model)) {
    // Opus 4.6+ / Sonnet 4.6+: use adaptive thinking with effort passthrough
    return {
      thinking: { type: 'enabled', budget_tokens: resolveAnthropicBudget(effort, maxTokens) },
      output_config: { effort },
    };
  }

  // Older Anthropic models: budget-based thinking
  return {
    thinking: { type: 'enabled', budget_tokens: resolveAnthropicBudget(effort, maxTokens) },
  };
}

function resolveAnthropicBudget(effort: string, maxTokens?: number): number {
  const level = normalizeEffort(effort);
  const budget = DEFAULT_BUDGETS[level];
  return clampBudget(budget, maxTokens);
}

function resolveGeminiThinking(model: string, effort: string, maxTokens?: number): GeminiThinkingResult {
  if (effort === 'auto') {
    return { includeThoughts: true, thinkingBudget: -1 };
  }

  // Gemini 3.x: level-based thinking
  if (isGemini3(model)) {
    const levelMap: Record<string, string> = {
      minimal: 'MINIMAL',
      low: 'LOW',
      medium: 'MEDIUM',
      high: 'HIGH',
    };
    const level = normalizeEffort(effort);
    return { includeThoughts: true, thinkingLevel: levelMap[level] || 'MEDIUM' };
  }

  // Gemini 2.5: budget-based thinking
  const budgets = isGeminiPro(model) ? GEMINI_PRO_BUDGETS
    : isGeminiFlash(model) ? GEMINI_FLASH_BUDGETS
    : DEFAULT_BUDGETS;

  const level = normalizeEffort(effort);
  const budget = clampBudget(budgets[level], maxTokens);
  return { includeThoughts: true, thinkingBudget: budget };
}

/**
 * If maxTokens is set and budget would leave <1024 tokens for output, reduce budget.
 */
function clampBudget(budget: number, maxTokens?: number): number {
  if (maxTokens && maxTokens <= budget) {
    return Math.max(1, maxTokens - 1024);
  }
  return budget;
}
