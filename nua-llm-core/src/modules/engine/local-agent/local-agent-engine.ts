import { generateSpanId, logLlmCallError, Logger } from "../../../lib/logger";
import { JsonSchema } from "../../../lib/schema-utils";
import { AttemptFailure, AttemptOutcome, AttemptRequest, EngineOutputListener, LlmEngine } from "../llm-engine";
import { stderrTail } from "./adapters/failure-classification";
import { AgentAdapter, AgentCallOptions, AgentProcessResult, AgentProcessStop } from "./adapters/types";
import { runInvocation } from "./process-runner";
import { Semaphore } from "./semaphore";

/** How to run one installed agent's processes. Set up once and shared by all its engines. */
export type AgentRunner = {
  adapter: AgentAdapter;
  binaryPath: string;
  /** Env vars removed from the agent's environment. */
  unsetEnv: string[];
  /** Bounds how many agent processes run at once, across all models. */
  limiter: Semaphore;
  logger: Logger;
};

/** How one engine's attempts run: the CLI's options and how long each may take. */
export type AgentCall = AgentCallOptions & {
  /** Per-attempt limit. */
  timeoutMs: number;
  /** How long an attempt may print nothing; null for no limit. */
  idleTimeoutMs: number | null;
};

/**
 * Answers prompts on one model of a coding-agent CLI installed on this machine.
 * Each attempt is one agent process. maxTokens has no CLI equivalent and is ignored.
 */
export class LocalAgentEngine implements LlmEngine {
  constructor(
    private readonly runner: AgentRunner,
    private readonly call: AgentCall,
  ) {}

  nativeSchema(envelopeSchema: JsonSchema): JsonSchema | null {
    return this.runner.adapter.nativeSchema(envelopeSchema);
  }

  attempt(request: AttemptRequest, onOutput?: EngineOutputListener): Promise<AttemptOutcome> {
    return this.runner.limiter.run(() => this.runAgent(request, onOutput));
  }

  private async runAgent(request: AttemptRequest, onOutput?: EngineOutputListener): Promise<AttemptOutcome> {
    const { adapter, binaryPath, logger, unsetEnv } = this.runner;
    const { model, effort, timeoutMs, idleTimeoutMs } = this.call;
    const spanId = generateSpanId();
    const startTime = Date.now();
    const method = request.enforcement.kind;

    // Same log shape as the HTTP engine, minus the HTTP-only fields.
    logger.info("LLM call started", {
      type: "llm_call_start",
      span_id: spanId,
      service: adapter.id,
      method,
      binaryPath,
      model: model ?? "default",
    });

    const failed = (failure: AttemptFailure): AttemptOutcome => {
      logLlmCallError(logger, spanId, adapter.id, method, failure.message, Date.now() - startTime);
      return { kind: "failed", failure };
    };

    let result: AgentProcessResult;
    try {
      result = await runInvocation({
        binaryPath,
        invocation: adapter.buildInvocation(request, { model, effort }),
        timeoutMs,
        idleTimeoutMs,
        onOutput,
        unsetEnv,
      });
    } catch (error) {
      return failed({ kind: "fatal", message: error instanceof Error ? error.message : String(error) });
    }

    const { listenerError } = result;
    if (listenerError !== undefined) {
      logger.warn("The onOutput listener threw; the agent ran on", {
        span_id: spanId,
        error: listenerError instanceof Error ? listenerError.message : String(listenerError),
      });
    }

    if (result.stopped) {
      return failed({ kind: "fatal", message: stopMessage(result.stopped, result) });
    }

    const reply = adapter.readResult(result, request);
    if (reply.kind === "failed") {
      return failed(reply.failure);
    }

    logger.info("LLM call completed", {
      type: "llm_call_complete",
      span_id: spanId,
      service: adapter.id,
      method,
      exitCode: result.exitCode,
      usage: reply.usage,
      duration_ms: Date.now() - startTime,
    });

    return {
      kind: "answered",
      answer: reply.answer,
      usage: reply.usage,
      origin: {
        engine: "local-agent",
        agent: adapter.id,
        model: reply.model ?? model,
        costUsdEstimate: reply.costUsdEstimate,
      },
    };
  }
}

/** Says which limit stopped the agent, how to raise it, and what the agent said on stderr. */
function stopMessage(stopped: AgentProcessStop, result: AgentProcessResult): string {
  const ran = `was stopped after ${seconds(stopped.afterMs)}`;
  const reason =
    stopped.limit === "idle"
      ? `${ran}: it printed nothing for ${seconds(stopped.limitMs)} (idleTimeoutMs ${stopped.limitMs}). ` +
        "Raise idleTimeoutMs, or set it to null for no limit."
      : `${ran}, its limit (timeoutMs ${stopped.limitMs}). Raise timeoutMs.`;
  const stderr = stderrTail(result, 500);
  return stderr ? `${reason} Its stderr ended: ${stderr}` : reason;
}

function seconds(ms: number): string {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
}
