export type UserDataPKValue = string | number;

export type MappableInputDataRow = Record<string, unknown>;
export type MappableInputData = MappableInputDataRow[];

// Replicated from API for library usage
export type NormalizedUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};
