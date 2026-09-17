import type { AnswerOrigin, ModelInput, SchemaEnforcementKind } from 'nua-llm-core';

export type CastValueParams = {
  prompt: string;
  data: unknown;
  outputName: string;
  outputSchema: object;
  model?: ModelInput;
};

export type CastArrayParams = {
  prompt: string;
  data: unknown[];
  primaryKey: string;
  outputName: string;
  outputSchema: object;
  model?: ModelInput;
};

export type NormalizedUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

// Gateway-specific metadata
export type GatewayMeta = {
  requestId: string;
  cached: boolean;
  llmUsage: NormalizedUsage;
  cacheUsage: NormalizedUsage;
};

// Direct mode runs the cast in this process, on an LLM provider's API or a coding agent on this machine.
export type DirectMeta = AnswerOrigin & {
  /** How the output schema was enforced. The result is validated against the schema either way. */
  schemaEnforcement: SchemaEnforcementKind;
};

export type CastResultSource = 'gateway' | 'direct';

// Success result with discriminated union on 'source'
type CastResultSuccess<T> = {
  success: true;
  data: T;
  usage: NormalizedUsage;
  model: string;
  latencyMs: number;
} & ({ source: 'gateway'; meta: GatewayMeta } | { source: 'direct'; meta: DirectMeta });

type CastResultFailure = {
  success: false;
  error: string;
  source: CastResultSource;
  latencyMs: number;
};

export type CastResult<T> = CastResultSuccess<T> | CastResultFailure;

export interface LlmBackend {
  castValue<T>(params: CastValueParams): Promise<CastResult<T>>;
  castArray<T>(params: CastArrayParams): Promise<CastResult<T[]>>;
  queueCastValue?(params: CastValueParams): Promise<QueueResult>;
  queueCastArray?(params: CastArrayParams): Promise<QueueResult>;
}

export type QueueResult =
  | { success: true; jobId: string; source: 'gateway' | 'direct' }
  | { success: false; error: string; source: 'gateway' | 'direct' };
