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
  /** What went wrong, as one sentence for a log: the attempts made and why the last one failed. */
  error: string;
  /**
   * Why the last attempt failed, in the engine's own words where it gave any (a
   * coding agent's or provider's message, fit to show the user), naming neither
   * the engine nor the attempts. Without an attempt, why none was made.
   */
  reason: string;
  /** Attempts made; 0 when the request was refused before any (such as an invalid schema). */
  attempts: number;
  source: CastResultSource;
  latencyMs: number;
};

export type CastResult<T> = CastResultSuccess<T> | CastResultFailure;
