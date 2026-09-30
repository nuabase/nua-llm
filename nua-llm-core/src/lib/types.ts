export type UserDataPKValue = string | number;

export type MappableInputDataRow = Record<string, unknown>;
export type MappableInputData = MappableInputDataRow[];

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
