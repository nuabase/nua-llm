import { JsonSchema } from "../../lib/schema-utils";
import { LlmProviderId, NormalizedUsage } from "./http/provider-config";
import type { LocalAgentId } from "./local-agent/agent-id";

/**
 * How one attempt makes the model produce the output shape.
 * - in-prompt: the prompt describes the schema; the reply is free text that should contain the JSON.
 * - native: the engine enforces `schema` itself. It is the output schema wrapped in an
 *   envelope (see cast/envelope), already converted to the engine's own dialect.
 */
export type SchemaEnforcement =
  | { kind: "in-prompt" }
  | { kind: "native"; schema: JsonSchema };

export type SchemaEnforcementKind = SchemaEnforcement["kind"];

/** One prompt for an engine to answer once, on the model the engine was created for. */
export type AttemptRequest = {
  prompt: string;
  maxTokens: number;
  enforcement: SchemaEnforcement;
};

export type Answer =
  /** A free-text reply that should contain the JSON result. */
  | { kind: "text"; text: string }
  /** The envelope object the engine enforced natively. */
  | { kind: "structured"; envelope: unknown };

/** Which engine produced an answer. */
export type AnswerOrigin =
  | { engine: "http"; provider: LlmProviderId; model: string }
  | {
      engine: "local-agent";
      agent: LocalAgentId;
      /** The model the agent reports using, else the one requested; undefined when neither is known. */
      model: string | undefined;
      /** The agent's own estimate. On a subscription this is not what the user pays. */
      costUsdEstimate: number | undefined;
    };

export type AttemptFailure = {
  /**
   * - transient: another attempt may succeed.
   * - fatal: every attempt will fail the same way (bad API key, not logged in, out of quota, timed out).
   * - schema-rejected: the engine refused the native schema; the in-prompt prompt may still work.
   */
  kind: "transient" | "fatal" | "schema-rejected";
  message: string;
};

export type AttemptOutcome =
  | { kind: "answered"; answer: Answer; usage: NormalizedUsage; origin: AnswerOrigin }
  | { kind: "failed"; failure: AttemptFailure };

/**
 * Answers prompts on one model: an LLM provider's HTTP API, or a coding-agent
 * CLI on this machine. Expected failures come back as outcomes, not exceptions.
 */
export interface LlmEngine {
  /** The envelope schema in the form this engine enforces natively, or null if it cannot. */
  nativeSchema(envelopeSchema: JsonSchema): JsonSchema | null;
  attempt(request: AttemptRequest): Promise<AttemptOutcome>;
}
