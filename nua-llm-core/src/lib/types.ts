export type UserDataPKValue = string | number;

export type MappableInputDataRow = Record<string, unknown>;
export type MappableInputData = MappableInputDataRow[];

export type CastValuePromptInput = {
  output: {
    name: string;
    effectiveSchema: object;
  };
  input: {
    prompt: string;
    data?: unknown;
  };
};

export type CastArrayPromptInput = {
  input: {
    prompt: string;
    primaryKey: string;
  };
  output: {
    name: string;
    effectiveSchema: object;
  };
};

// Replicated from API for library usage
export type NormalizedUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};
