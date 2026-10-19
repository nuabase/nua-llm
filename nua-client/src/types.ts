import type { AnswerOrigin, NormalizedUsage, SchemaEnforcementKind } from 'nua-llm-core';

export type { NormalizedUsage };

// Every cast runs in this process, on an LLM provider's API or a coding agent on this machine.
export type DirectMeta = AnswerOrigin & {
  /** How the output schema was enforced. The result is validated against the schema either way. */
  schemaEnforcement: SchemaEnforcementKind;
};

export type CastResultSource = 'direct';

type CastResultSuccess<T> = {
  success: true;
  data: T;
  usage: NormalizedUsage;
  model: string;
  latencyMs: number;
  source: CastResultSource;
  meta: DirectMeta;
};

type CastResultFailure = {
  success: false;
  error: string;
  source: CastResultSource;
  latencyMs: number;
};

export type CastResult<T> = CastResultSuccess<T> | CastResultFailure;
