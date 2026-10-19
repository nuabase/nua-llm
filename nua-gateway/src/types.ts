// The model and usage types match the ones nua-llm-core defines for the Nuabase API server.
// This package keeps its own copy so that zod is its only dependency.

export type NormalizedUsage = {
  /** All prompt tokens, including any the provider read from or wrote to its prompt cache. */
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Prompt tokens the provider read from its prompt cache, billed at a discount. Undefined when not reported. */
  promptCacheReadTokens?: number;
  /** Prompt tokens the provider wrote to its prompt cache (Claude bills these at a premium). Undefined when not reported. */
  promptCacheWriteTokens?: number;
};

// The providers and aliases the API knows today, listed for autocomplete. Any other string is
// accepted as well: the deployed API decides what is valid, and answers an unknown one with an error.
type LlmProviderId = 'groq' | 'cerebras' | 'gemini' | 'openrouter' | 'deepseek' | (string & {});
type ModelAliasName =
  | 'fast'
  | 'gemini'
  | 'qwen'
  | 'sonnet'
  | 'opus'
  | 'haiku'
  | 'kimi'
  | 'deepseek'
  | 'gpt'
  | (string & {});

/** A provider's model, or one of the API's model aliases. */
export type ModelInput = { provider: LlmProviderId; model: string } | { alias: ModelAliasName };

export type GatewayMeta = {
  requestId: string;
  cached: boolean;
  llmUsage: NormalizedUsage;
  cacheUsage: NormalizedUsage;
};

type CastResultSuccess<T> = {
  success: true;
  data: T;
  usage: NormalizedUsage;
  model: string;
  latencyMs: number;
  source: 'gateway';
  meta: GatewayMeta;
};

type CastResultFailure = {
  success: false;
  error: string;
  source: 'gateway';
  latencyMs: number;
};

export type CastResult<T> = CastResultSuccess<T> | CastResultFailure;

export type QueueResult =
  | { success: true; jobId: string; source: 'gateway' }
  | { success: false; error: string; source: 'gateway' };
