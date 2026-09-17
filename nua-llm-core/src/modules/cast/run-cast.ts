import { Logger } from "../../lib/logger";
import { JsonSchema } from "../../lib/schema-utils";
import { NormalizedUsage } from "../engine/http/provider-config";
import {
  Answer,
  AnswerOrigin,
  AttemptFailure,
  AttemptOutcome,
  LlmEngine,
  SchemaEnforcement,
  SchemaEnforcementKind,
} from "../engine/llm-engine";
import {
  extractThinkingFromResponse,
  parseJsonFromLlmResponse,
} from "../execution/llm-response-extraction";
import {
  buildNuaJsonSchemaValueValidation,
  ValidationResult,
} from "../json-schema-validation/nua-json-schema-value-validation";
import { CastRequest, RenderedPrompt } from "./cast-request";
import { ENVELOPE_KEY, unwrapEnvelope, wrapInEnvelope } from "./envelope";
import { renderPrompt } from "./prompts/render-prompt";

export type CastSuccess<T> = {
  success: true;
  data: T;
  /** Usage of the attempt that succeeded. */
  usage: NormalizedUsage;
  /** The prompt of the attempt that succeeded. */
  prompt: RenderedPrompt;
  origin: AnswerOrigin;
  schemaEnforcement: SchemaEnforcementKind;
};

export type CastFailure = {
  success: false;
  error: string;
  /** The prompt of the last attempt, when one was made. */
  prompt?: RenderedPrompt;
};

export type CastResult<T> = CastSuccess<T> | CastFailure;

/** Wait before each retry. There is one more attempt than there are delays. */
const RETRY_DELAYS_MS = [1000, 2000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

/** How the next attempt asks for the output shape, and the prompt that goes with it. */
type AttemptPlan = {
  enforcement: SchemaEnforcement;
  prompt: RenderedPrompt;
};

/**
 * Runs a cast on an engine: asks for an answer, checks it against the schema,
 * and tries again when another attempt could help.
 */
export async function runCast<T>(
  engine: LlmEngine,
  request: CastRequest,
  logger: Logger,
): Promise<CastResult<T>> {
  let validate: (data: object) => ValidationResult;
  try {
    validate = buildNuaJsonSchemaValueValidation("library-req", request.schema);
  } catch (error) {
    return { success: false, error: `Invalid output schema: ${errorMessage(error)}` };
  }

  let plan = planAttempt(request, chooseEnforcement(engine, request.schema));
  let lastFailure = { error: "", prompt: plan.prompt };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const outcome = await engine.attempt({
      prompt: plan.prompt.full,
      maxTokens: request.maxTokens,
      enforcement: plan.enforcement,
    });
    const verdict = judgeOutcome(outcome, validate);

    if (verdict.kind === "accept") {
      return {
        success: true,
        data: verdict.data as T,
        usage: verdict.usage,
        prompt: plan.prompt,
        origin: verdict.origin,
        schemaEnforcement: plan.enforcement.kind,
      };
    }
    if (verdict.kind === "give-up") {
      return { success: false, error: verdict.error, prompt: plan.prompt };
    }

    lastFailure = { error: verdict.error, prompt: plan.prompt };
    if (verdict.kind === "retry-in-prompt") {
      // The next attempt is a different request, so it goes out without a delay.
      logger.warn("Engine rejected the native output schema; retrying with the schema in the prompt", {
        attempt,
        error: verdict.error,
      });
      plan = planAttempt(request, { kind: "in-prompt" });
      continue;
    }
    if (attempt < MAX_ATTEMPTS) {
      const delayMs = RETRY_DELAYS_MS[attempt - 1];
      logger.warn("LLM call attempt failed; retrying", { attempt, delayMs, error: verdict.error });
      await delay(delayMs);
    }
  }

  return {
    success: false,
    error: `LLM call failed after ${MAX_ATTEMPTS} attempts. Last error: ${lastFailure.error}`,
    prompt: lastFailure.prompt,
  };
}

function chooseEnforcement(engine: LlmEngine, schema: JsonSchema): SchemaEnforcement {
  const nativeSchema = engine.nativeSchema(wrapInEnvelope(schema));
  return nativeSchema ? { kind: "native", schema: nativeSchema } : { kind: "in-prompt" };
}

function planAttempt(request: CastRequest, enforcement: SchemaEnforcement): AttemptPlan {
  return { enforcement, prompt: renderPrompt(request, enforcement.kind) };
}

export type Verdict =
  | { kind: "accept"; data: unknown; usage: NormalizedUsage; origin: AnswerOrigin }
  | { kind: "retry"; error: string }
  | { kind: "retry-in-prompt"; error: string }
  | { kind: "give-up"; error: string };

/** Decides what one attempt means for the cast. */
export function judgeOutcome(
  outcome: AttemptOutcome,
  validate: (data: object) => ValidationResult,
): Verdict {
  if (outcome.kind === "failed") {
    return verdictForFailure(outcome.failure);
  }

  const candidate = readAnswer(outcome.answer);
  if (!candidate.ok) {
    return { kind: "retry", error: candidate.error };
  }

  const validation = validate(candidate.value as object);
  if (!validation.success) {
    return {
      kind: "retry",
      error: `Validation failed: ${validation.error || "Unknown validation error"}\n\nRaw LLM response:\n${candidate.raw}`,
    };
  }

  return { kind: "accept", data: candidate.value, usage: outcome.usage, origin: outcome.origin };
}

function verdictForFailure(failure: AttemptFailure): Verdict {
  switch (failure.kind) {
    case "transient":
      return { kind: "retry", error: failure.message };
    case "schema-rejected":
      return { kind: "retry-in-prompt", error: failure.message };
    case "fatal":
      return { kind: "give-up", error: failure.message };
  }
}

type Candidate = { ok: true; value: unknown; raw: string } | { ok: false; error: string };

function readAnswer(answer: Answer): Candidate {
  switch (answer.kind) {
    case "text":
      return readTextAnswer(answer.text);
    case "structured":
      return readStructuredAnswer(answer.envelope);
  }
}

function readTextAnswer(text: string): Candidate {
  try {
    const { cleanedResponse } = extractThinkingFromResponse(text);
    return { ok: true, value: parseJsonFromLlmResponse(cleanedResponse), raw: text };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to parse LLM response as JSON: ${errorMessage(error)}\n\nRaw LLM response:\n${text}`,
    };
  }
}

function readStructuredAnswer(envelope: unknown): Candidate {
  const raw = JSON.stringify(envelope);
  const unwrapped = unwrapEnvelope(envelope);
  if (!unwrapped.found) {
    return { ok: false, error: `Structured output has no "${ENVELOPE_KEY}" field: ${raw}` };
  }
  return { ok: true, value: unwrapped.value, raw };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
